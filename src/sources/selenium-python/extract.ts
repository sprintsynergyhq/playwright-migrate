// Selenium Python extractor: walks the tree-sitter syntax tree of a pytest or unittest file and
// builds the IR. Every statement in a test or hook body becomes at least one step. A statement
// that cannot be converted becomes one unknown step with a BLOCK flag. A module or class member
// that cannot be read becomes a BLOCK file flag that lists the tests and counts the assertions
// inside it.
import type { Node } from 'web-tree-sitter';
import type {
  FileFlag,
  Flag,
  HookKind,
  Locator,
  MigrationFile,
  SourceSpan,
  Step,
  SuiteItem,
} from '../../core/ir.js';
import {
  actionStep,
  assertStep,
  BY_NAMES,
  byLocator,
  chainFound,
  containsAssertion,
  equalsAssertion,
  KEYS,
  nthFound,
  removedStep,
  resolveClickableWaits,
  shortText,
  sleepStep,
  truthAssertion,
  WAIT_CONDITIONS,
  waitResult,
} from '../selenium/common.js';
import type { AssertSpec, Found, Value, WaitResult } from '../selenium/common.js';
import { Blocked, blockedStep, fileFlag, lineOf, makeFlag, named, spanOf } from '../shared.js';

const unknown = (): Blocked => new Blocked('CORE_UNKNOWN_STATEMENT');

const ESCAPES: Record<string, string> = {
  '\\n': '\n',
  '\\t': '\t',
  '\\\\': '\\',
  "\\'": "'",
  '\\"': '"',
};

// The value of a plain string literal. Undefined for f-strings, byte strings, concatenated
// strings and escapes other than \n, \t, \\, \' and \".
export function stringValue(node: Node | undefined): string | undefined {
  if (node?.type !== 'string') return undefined;
  const parts = named(node);
  const prefix = (parts[0]?.text ?? '').replace(/['"]/g, '');
  if (/[fFbB]/.test(prefix)) return undefined;
  if (parts.some((p) => p.type === 'interpolation')) return undefined;
  const content = parts
    .filter((p) => p.type === 'string_content')
    .map((p) => p.text)
    .join('');
  if (/[rR]/.test(prefix)) return content;
  let ok = true;
  const value = content.replace(/\\(.|\n)/g, (m) => {
    const out = ESCAPES[m];
    if (out === undefined) ok = false;
    return out ?? m;
  });
  return ok ? value : undefined;
}

// An integer or float literal, with an optional minus sign.
function numberValue(node: Node | undefined): number | undefined {
  if (!node) return undefined;
  if (node.type === 'integer' && /^\d+$/.test(node.text)) return Number(node.text);
  if (node.type === 'float' && /^\d+\.\d+$/.test(node.text)) return Number(node.text);
  if (node.type === 'unary_operator' && node.text.startsWith('-')) {
    const inner = numberValue(node.childForFieldName('argument') ?? undefined);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

// Counts source assertions: assert statements and self.assert*() calls.
export function countAssertions(node: Node): number {
  let count = node.type === 'assert_statement' ? 1 : 0;
  if (node.type === 'call' && isSelfAssert(node)) count += 1;
  for (const child of node.namedChildren) if (child) count += countAssertions(child);
  return count;
}

function isSelfAssert(call: Node): boolean {
  const fn = call.childForFieldName('function');
  return (
    fn?.type === 'attribute' &&
    fn.childForFieldName('object')?.text === 'self' &&
    /^assert/.test(fn.childForFieldName('attribute')?.text ?? '')
  );
}

// The positional and keyword arguments of a call.
function callArgs(call: Node): { positional: Node[]; keywords: Map<string, Node> } {
  const list = call.childForFieldName('arguments');
  const positional: Node[] = [];
  const keywords = new Map<string, Node>();
  for (const arg of list ? named(list) : []) {
    if (arg.type === 'keyword_argument') {
      const value = arg.childForFieldName('value');
      if (value) keywords.set(arg.childForFieldName('name')?.text ?? '', value);
    } else positional.push(arg);
  }
  return { positional, keywords };
}

// The method name and object of obj.method(...). Undefined for other calls.
function methodCall(call: Node): { object: Node; method: string } | undefined {
  const fn = call.childForFieldName('function');
  if (fn?.type !== 'attribute') return undefined;
  const object = fn.childForFieldName('object');
  const method = fn.childForFieldName('attribute')?.text;
  return object && method ? { object, method } : undefined;
}

const DRIVER_CLASSES = ['Chrome', 'Firefox', 'Edge', 'Safari', 'Ie', 'Remote', 'ChromiumEdge'];

// webdriver.Chrome() and the other driver constructors.
function isDriverConstructor(node: Node | null | undefined): boolean {
  if (node?.type !== 'call') return false;
  const fn = node.childForFieldName('function');
  if (fn?.type === 'identifier') return DRIVER_CLASSES.includes(fn.text);
  return (
    fn?.type === 'attribute' &&
    fn.childForFieldName('object')?.text === 'webdriver' &&
    DRIVER_CLASSES.includes(fn.childForFieldName('attribute')?.text ?? '')
  );
}

// The expression inside an expression statement, or undefined.
function expressionOf(statement: Node): Node | undefined {
  if (statement.type !== 'expression_statement') return undefined;
  const parts = named(statement);
  return parts.length === 1 ? parts[0] : undefined;
}

// Docstrings and pass are not steps and are not counted.
function isNoOp(statement: Node): boolean {
  return statement.type === 'pass_statement' || expressionOf(statement)?.type === 'string';
}

// switch_to.<method> for driver.switch_to.frame(...) and the like.
function switchMethod(statement: Node): string | undefined {
  const expr = expressionOf(statement);
  const call = expr?.type === 'call' ? methodCall(expr) : undefined;
  if (!call) return undefined;
  const object = call.object;
  if (object.type === 'attribute' && object.childForFieldName('attribute')?.text === 'switch_to') {
    return call.method;
  }
  return undefined;
}

// Names bound to a driver, a wait object or a stored element. Keys are identifiers or self.x.
type Scope = { drivers: Set<string>; vars: Map<string, Value> };

const copyScope = (scope: Scope): Scope => ({
  drivers: new Set(scope.drivers),
  vars: new Map(scope.vars),
});

// Converts one statement of a test or hook body.
class StatementConverter {
  constructor(
    private readonly scope: Scope,
    private readonly span: SourceSpan,
    private readonly pending: Map<Step, Locator>,
  ) {}

  private evaluate(node: Node): Value {
    switch (node.type) {
      case 'parenthesized_expression': {
        const inner = named(node)[0];
        if (!inner) throw unknown();
        return this.evaluate(inner);
      }
      case 'string': {
        const value = stringValue(node);
        if (value === undefined) throw unknown();
        return { kind: 'literal', value };
      }
      case 'integer':
      case 'float':
      case 'unary_operator': {
        const value = numberValue(node);
        if (value === undefined) throw unknown();
        return { kind: 'literal', value };
      }
      case 'true':
        return { kind: 'literal', value: true };
      case 'false':
        return { kind: 'literal', value: false };
      case 'identifier':
      case 'attribute':
        return this.evaluateName(node);
      case 'subscript':
        return this.evaluateSubscript(node);
      case 'call':
        return this.evaluateCall(node);
      default:
        throw unknown();
    }
  }

  private evaluateName(node: Node): Value {
    if (this.scope.drivers.has(node.text)) return { kind: 'driver' };
    const stored = this.scope.vars.get(node.text);
    if (stored) return stored;
    if (node.type !== 'attribute') throw unknown();
    const object = node.childForFieldName('object');
    const name = node.childForFieldName('attribute')?.text;
    if (!object) throw unknown();
    const base = this.evaluate(object);
    if (base.kind === 'driver' && name === 'current_url') return { kind: 'url' };
    if (base.kind === 'driver' && name === 'title') return { kind: 'title' };
    if (base.kind === 'element' && name === 'text') return { kind: 'text', found: base.found };
    throw unknown();
  }

  private evaluateSubscript(node: Node): Value {
    const value = node.childForFieldName('value');
    const index = numberValue(node.childForFieldName('subscript') ?? undefined);
    if (!value || index === undefined || !Number.isInteger(index)) throw unknown();
    const list = this.evaluate(value);
    if (list.kind !== 'elements') throw unknown();
    return { kind: 'element', found: nthFound(list.found, index) };
  }

  // (By.ID, "x") or By.ID, "x" as two arguments.
  private byArgs(by: Node | undefined, value: Node | undefined): Found {
    if (by?.type !== 'attribute' || by.childForFieldName('object')?.text !== 'By') throw unknown();
    const kind = BY_NAMES[by.childForFieldName('attribute')?.text ?? ''];
    const text = stringValue(value);
    if (!kind || text === undefined) throw unknown();
    return byLocator(kind, text, lineOf(by));
  }

  // A locator tuple or an element expression, as passed to an expected condition.
  private foundArg(node: Node | undefined): Found {
    if (!node) throw new Blocked('CORE_CUSTOM_WAIT');
    if (node.type === 'tuple') {
      const [by, value, ...rest] = named(node);
      if (rest.length > 0) throw unknown();
      return this.byArgs(by, value);
    }
    const value = this.evaluate(node);
    if (value.kind !== 'element') throw new Blocked('CORE_CUSTOM_WAIT');
    return value.found;
  }

  private evaluateCall(node: Node): Value {
    const fn = node.childForFieldName('function');
    const { positional, keywords } = callArgs(node);
    if (fn?.type === 'identifier') {
      const arg = positional[0];
      if (fn.text === 'len' && positional.length === 1 && keywords.size === 0 && arg) {
        const list = this.evaluate(arg);
        if (list.kind !== 'elements') throw unknown();
        return { kind: 'count', found: list.found };
      }
      if (fn.text === 'Select' && positional.length === 1 && arg) {
        const element = this.evaluate(arg);
        if (element.kind !== 'element') throw unknown();
        return { kind: 'select', found: element.found };
      }
      if (fn.text === 'WebDriverWait') return { kind: 'wait' };
      throw unknown();
    }
    const call = methodCall(node);
    if (!call) throw unknown();
    const base = this.evaluate(call.object);
    if (base.kind === 'driver' || base.kind === 'element') {
      if (call.method === 'find_element' || call.method === 'find_elements') {
        if (positional.length !== 2 || keywords.size > 0) throw unknown();
        const found = this.byArgs(positional[0], positional[1]);
        const located = base.kind === 'element' ? chainFound(base.found, found) : found;
        return { kind: call.method === 'find_element' ? 'element' : 'elements', found: located };
      }
    }
    if (base.kind === 'element' && positional.length === 0) {
      if (call.method === 'is_displayed')
        return { kind: 'state', found: base.found, state: 'displayed' };
      if (call.method === 'is_enabled')
        return { kind: 'state', found: base.found, state: 'enabled' };
      if (call.method === 'is_selected')
        return { kind: 'state', found: base.found, state: 'selected' };
    }
    if (base.kind === 'element' && ['get_attribute', 'get_dom_attribute'].includes(call.method)) {
      const name = stringValue(positional[0]);
      if (positional.length !== 1 || name === undefined) throw unknown();
      return { kind: 'attribute', found: base.found, name };
    }
    throw unknown();
  }

  // wait.until(EC.x(...)) or WebDriverWait(driver, n).until(...). Undefined for other calls.
  private waitCall(node: Node): WaitResult | undefined {
    const call = node.type === 'call' ? methodCall(node) : undefined;
    if (!call || (call.method !== 'until' && call.method !== 'until_not')) return undefined;
    let base: Value;
    try {
      base = this.evaluate(call.object);
    } catch {
      return undefined;
    }
    if (base.kind !== 'wait') return undefined;
    const { positional, keywords } = callArgs(node);
    const condition = positional[0];
    if (positional.length > 2 || keywords.size > 0 || condition?.type !== 'call') {
      throw new Blocked('CORE_CUSTOM_WAIT');
    }
    const fn = condition.childForFieldName('function');
    const isEc =
      fn?.type === 'identifier' ||
      (fn?.type === 'attribute' &&
        ['EC', 'expected_conditions'].includes(fn.childForFieldName('object')?.text ?? ''));
    const name = fn?.type === 'attribute' ? fn.childForFieldName('attribute')?.text : fn?.text;
    const row = isEc && name ? WAIT_CONDITIONS[name] : undefined;
    if (!row) throw new Blocked('CORE_CUSTOM_WAIT');
    const args = callArgs(condition).positional;
    if ('blocked' in row) throw new Blocked(row.blocked);
    let found: Found | undefined;
    let text: string | undefined;
    if (row.args === 'text') text = stringValue(args[0]);
    else found = this.foundArg(args[0]);
    if (row.args === 'found+text') text = stringValue(args[1]);
    const expectedArgs = row.args === 'found+text' ? 2 : 1;
    if (args.length !== expectedArgs) throw new Blocked('CORE_CUSTOM_WAIT');
    return waitResult(row, found, text, call.method === 'until_not');
  }

  run(statement: Node): Step[] {
    if (statement.type === 'assert_statement') return [this.assertStatement(statement)];
    const expr = expressionOf(statement);
    if (expr?.type === 'assignment') return this.assignment(expr);
    if (expr?.type === 'call') return this.callStatement(expr);
    throw unknown();
  }

  private assignment(node: Node): Step[] {
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    const isName =
      left?.type === 'identifier' ||
      (left?.type === 'attribute' && left.childForFieldName('object')?.text === 'self');
    if (!left || !right || !isName || node.childForFieldName('type')) throw unknown();
    const key = left.text;
    if (isDriverConstructor(right)) {
      this.scope.drivers.add(key);
      return [removedStep('driver-lifecycle', 'CORE_DRIVER_LIFECYCLE', this.span)];
    }
    const wait = this.waitCall(right);
    if (wait) {
      if ('clickable' in wait) {
        this.scope.vars.set(key, { kind: 'element', found: { ...wait.clickable, notes: [] } });
        const notes = [
          ...wait.clickable.notes,
          makeFlag('CORE_STORED_ELEMENT', this.span.startLine),
        ];
        return [removedStep('clickable-wait', 'CORE_CLICKABLE_WAIT_REMOVED', this.span, notes)];
      }
      const target = wait.spec.target;
      if (target !== 'page') {
        this.scope.vars.set(key, { kind: 'element', found: { locator: target, notes: [] } });
      }
      const stored = makeFlag('CORE_STORED_ELEMENT', this.span.startLine);
      return [assertStep(wait.spec, this.span, 'wait', target === 'page' ? [] : [stored])];
    }
    const value = this.evaluate(right);
    if (value.kind === 'wait') {
      this.scope.vars.set(key, value);
      return [removedStep('wait-object', 'CORE_WAIT_OBJECT', this.span)];
    }
    if (value.kind === 'element' || value.kind === 'elements' || value.kind === 'select') {
      this.scope.vars.set(key, { ...value, found: { ...value.found, notes: [] } });
      return [removedStep('stored-element', 'CORE_STORED_ELEMENT', this.span, value.found.notes)];
    }
    throw unknown();
  }

  private callStatement(node: Node): Step[] {
    const fn = node.childForFieldName('function');
    const { positional, keywords } = callArgs(node);
    // time.sleep(n) and sleep(n)
    if (fn?.text === 'time.sleep' || fn?.text === 'sleep') {
      const seconds = numberValue(positional[0]);
      if (positional.length !== 1 || keywords.size > 0 || seconds === undefined) {
        throw new Blocked('CORE_CUSTOM_WAIT');
      }
      return [sleepStep(Math.round(seconds * 1000), this.span)];
    }
    if (isSelfAssert(node)) return [this.selfAssert(node)];
    const wait = this.waitCall(node);
    if (wait) return [this.waitStep(wait)];
    const call = methodCall(node);
    if (!call) throw unknown();
    if (
      call.object.type === 'attribute' &&
      call.object.childForFieldName('attribute')?.text === 'switch_to'
    ) {
      throw new Blocked(
        ['frame', 'default_content', 'parent_frame'].includes(call.method)
          ? 'CORE_FRAME'
          : 'CORE_WINDOW',
      );
    }
    if (/\.switch_to\./.test(`${call.object.text}.`)) throw new Blocked('CORE_WINDOW');
    // WebDriverWait(...).until(EC.element_to_be_clickable(...)).click()
    const inline = this.waitCall(call.object);
    if (inline) {
      if (!('clickable' in inline)) throw unknown();
      const note = makeFlag('CORE_CLICKABLE_WAIT_REMOVED', this.span.startLine);
      return [this.elementAction(inline.clickable, call.method, positional, keywords, [note])];
    }
    const base = this.evaluate(call.object);
    if (base.kind === 'driver') return [this.driverCall(call.method, positional, keywords)];
    if (base.kind === 'element') {
      return [this.elementAction(base.found, call.method, positional, keywords, [])];
    }
    if (base.kind === 'select') return [this.selectCall(base.found, call.method, positional)];
    throw unknown();
  }

  private driverCall(method: string, args: Node[], keywords: Map<string, Node>): Step {
    const span = this.span;
    if (keywords.size > 0) throw unknown();
    switch (method) {
      case 'get': {
        const url = stringValue(args[0]);
        if (args.length !== 1 || url === undefined) throw unknown();
        return actionlessNavigate('goto', span, url);
      }
      case 'refresh':
        return actionlessNavigate('reload', span);
      case 'back':
        return actionlessNavigate('back', span);
      case 'forward':
        return actionlessNavigate('forward', span);
      case 'quit':
      case 'close':
        return removedStep('driver-lifecycle', 'CORE_DRIVER_LIFECYCLE', span);
      case 'implicitly_wait':
        return removedStep('implicit-wait', 'CORE_IMPLICIT_WAIT', span);
      case 'maximize_window':
      case 'minimize_window':
      case 'fullscreen_window':
      case 'set_window_size':
      case 'set_window_position':
        return removedStep('window-size', 'CORE_WINDOW_SIZE', span);
      case 'execute_script':
      case 'execute_async_script':
        throw new Blocked('CORE_JS_EXECUTOR');
      default:
        throw unknown();
    }
  }

  private elementAction(
    found: Found,
    method: string,
    args: Node[],
    keywords: Map<string, Node>,
    extra: Flag[],
  ): Step {
    const flags = [...found.notes, ...extra];
    const target = found.locator;
    if (keywords.size > 0) throw unknown();
    if ((method === 'click' || method === 'clear') && args.length === 0) {
      return actionStep({ kind: 'action', action: method, target }, this.span, flags);
    }
    if (method === 'send_keys' && args.length === 1) {
      const text = stringValue(args[0]);
      if (text !== undefined) {
        const fill = makeFlag('CORE_FILL_REPLACES_VALUE', this.span.startLine);
        return actionStep({ kind: 'action', action: 'fill', target, value: text }, this.span, [
          ...flags,
          fill,
        ]);
      }
      const key = args[0];
      const name =
        key?.type === 'attribute' && key.childForFieldName('object')?.text === 'Keys'
          ? KEYS[key.childForFieldName('attribute')?.text ?? '']
          : undefined;
      if (name)
        return actionStep(
          { kind: 'action', action: 'press', target, value: name },
          this.span,
          flags,
        );
    }
    throw unknown();
  }

  private selectCall(found: Found, method: string, args: Node[]): Step {
    const target = found.locator;
    if (args.length !== 1) throw unknown();
    const text = stringValue(args[0]);
    const index = numberValue(args[0]);
    let select;
    if (method === 'select_by_value' && text !== undefined)
      select = { by: 'value' as const, value: text };
    else if (method === 'select_by_visible_text' && text !== undefined)
      select = { by: 'label' as const, value: text };
    else if (
      method === 'select_by_index' &&
      index !== undefined &&
      Number.isInteger(index) &&
      index >= 0
    ) {
      select = { by: 'index' as const, index };
    } else throw unknown();
    return actionStep(
      { kind: 'action', action: 'selectOption', target, select },
      this.span,
      found.notes,
    );
  }

  private waitStep(wait: WaitResult): Step {
    if ('clickable' in wait) {
      const step = removedStep(
        'clickable-wait',
        'CORE_CLICKABLE_WAIT_REMOVED',
        this.span,
        wait.clickable.notes,
      );
      this.pending.set(step, wait.clickable.locator);
      return step;
    }
    return assertStep(wait.spec, this.span, 'wait');
  }

  // Runs fn and turns an unknown expression into CORE_UNSUPPORTED_ASSERTION.
  private asAssertion(detail: string, fn: () => AssertSpec): AssertSpec {
    try {
      return fn();
    } catch (error) {
      if (error instanceof Blocked && error.ruleId === 'CORE_UNKNOWN_STATEMENT') {
        throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });
      }
      throw error;
    }
  }

  private condition(node: Node, negated: boolean, detail: string): AssertSpec {
    if (node.type === 'not_operator') {
      const argument = node.childForFieldName('argument');
      if (!argument) throw unknown();
      return this.condition(argument, !negated, detail);
    }
    if (node.type === 'parenthesized_expression' && named(node).length === 1) {
      return this.condition(named(node)[0]!, negated, detail);
    }
    if (node.type === 'comparison_operator') {
      const operands = named(node);
      const operator = node.children
        .filter((c): c is Node => c !== null && !c.isNamed)
        .map((c) => c.type)
        .join(' ');
      const [left, right] = operands;
      if (operands.length !== 2 || !left || !right) throw unknown();
      if (operator === '==' || operator === '!=') {
        return equalsAssertion(
          this.evaluate(left),
          this.evaluate(right),
          negated !== (operator === '!='),
          detail,
        );
      }
      if (operator === 'in' || operator === 'not in') {
        return containsAssertion(
          this.evaluate(right),
          this.evaluate(left),
          negated !== (operator === 'not in'),
          detail,
        );
      }
      throw unknown();
    }
    return truthAssertion(this.evaluate(node), !negated, detail);
  }

  private assertStatement(statement: Node): Step {
    const [condition, message] = named(statement);
    if (!condition) throw unknown();
    const detail = shortText(statement.text);
    const spec = this.asAssertion(detail, () => this.condition(condition, false, detail));
    const extra = message ? [makeFlag('CORE_ASSERT_MESSAGE_DROPPED', this.span.startLine)] : [];
    return assertStep(spec, this.span, 'assertion', extra);
  }

  private selfAssert(node: Node): Step {
    const name = methodCall(node)!.method;
    const { positional, keywords } = callArgs(node);
    const [a, b] = positional;
    const detail = shortText(node.text);
    const twoArgs = ['assertEqual', 'assertEquals', 'assertNotEqual', 'assertIn', 'assertNotIn'];
    const oneArg = ['assertTrue', 'assertFalse'];
    const arity = twoArgs.includes(name) ? 2 : oneArg.includes(name) ? 1 : 0;
    if (arity === 0) throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail: name });
    const extraKeywords = [...keywords.keys()].filter((k) => k !== 'msg');
    if (positional.length < arity || positional.length > arity + 1 || extraKeywords.length > 0) {
      throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });
    }
    const spec = this.asAssertion(detail, () => {
      if (!a || (arity === 2 && !b)) throw unknown();
      switch (name) {
        case 'assertEqual':
        case 'assertEquals':
        case 'assertNotEqual':
          return equalsAssertion(
            this.evaluate(a),
            this.evaluate(b!),
            name === 'assertNotEqual',
            detail,
          );
        case 'assertIn':
        case 'assertNotIn':
          return containsAssertion(
            this.evaluate(b!),
            this.evaluate(a),
            name === 'assertNotIn',
            detail,
          );
        default:
          return truthAssertion(this.evaluate(a), name === 'assertTrue', detail);
      }
    });
    const hasMessage = positional.length > arity || keywords.has('msg');
    const extra = hasMessage ? [makeFlag('CORE_ASSERT_MESSAGE_DROPPED', this.span.startLine)] : [];
    return assertStep(spec, this.span, 'assertion', extra);
  }
}

function actionlessNavigate(
  action: 'goto' | 'reload' | 'back' | 'forward',
  span: SourceSpan,
  url?: string,
): Step {
  const step = { kind: 'navigate' as const, action, span, flags: [], status: 'converted' as const };
  return url === undefined ? step : { ...step, url };
}

type Counters = { assertions: number; statements: number };

// Converts the statements of a test or hook body. Steps from switch_to.frame up to
// default_content or parent_frame are blocked with CORE_FRAME.
function bodySteps(body: Node, scope: Scope, counters: Counters): Step[] {
  const steps: Step[] = [];
  const pending = new Map<Step, Locator>();
  let inFrame = false;
  for (const statement of named(body)) {
    if (isNoOp(statement)) continue;
    const span = spanOf(statement);
    const assertions = countAssertions(statement);
    counters.statements += 1;
    counters.assertions += assertions;
    try {
      const switchTo = switchMethod(statement);
      if (inFrame || switchTo === 'frame') {
        inFrame = !(switchTo === 'default_content' || switchTo === 'parent_frame');
        throw new Blocked('CORE_FRAME');
      }
      steps.push(...new StatementConverter(scope, span, pending).run(statement));
    } catch (error) {
      if (!(error instanceof Blocked)) throw error;
      steps.push(blockedStep(error, span, assertions));
    }
  }
  return resolveClickableWaits(steps, pending);
}

// The decorator expressions and the definition of a possibly decorated definition.
function unwrap(node: Node): { decorators: Node[]; definition: Node } {
  if (node.type !== 'decorated_definition') return { decorators: [], definition: node };
  const definition = node.childForFieldName('definition') ?? node;
  const decorators = named(node)
    .filter((n) => n.type === 'decorator')
    .map((d) => named(d)[0]!)
    .filter(Boolean);
  return { decorators, definition };
}

const decoratorName = (d: Node): string =>
  d.type === 'call' ? (d.childForFieldName('function')?.text ?? '') : d.text;

const SKIP_DECORATORS = ['pytest.mark.skip', 'unittest.skip'];

// Skip decorators make the test or class skipped. Any other decorator is not supported.
function readDecorators(decorators: Node[]): { skipped: boolean; ok: boolean } {
  let skipped = false;
  for (const d of decorators) {
    if (SKIP_DECORATORS.includes(decoratorName(d))) skipped = true;
    else return { skipped, ok: false };
  }
  return { skipped, ok: true };
}

const nameOf = (definition: Node): string => definition.childForFieldName('name')?.text ?? '';

function parameterNames(definition: Node): string[] | undefined {
  const params = definition.childForFieldName('parameters');
  const list = params ? named(params) : [];
  if (list.some((p) => p.type !== 'identifier')) return undefined;
  return list.map((p) => p.text);
}

// A class that pytest or unittest collects: TestX, or a subclass of unittest.TestCase.
function isTestClass(definition: Node): boolean {
  if (definition.type !== 'class_definition') return false;
  const bases = definition.childForFieldName('superclasses');
  const isCase = bases ? named(bases).some((b) => /(^|\.)TestCase$/.test(b.text)) : false;
  return isCase || /^Test/.test(nameOf(definition));
}

// The title paths of every test inside node, the way pytest and unittest collect them.
function findTests(node: Node, titlePath: string[]): string[][] {
  const { definition } = unwrap(node);
  if (definition.type === 'function_definition') {
    return /^test/.test(nameOf(definition)) ? [[...titlePath, nameOf(definition)]] : [];
  }
  if (definition.type === 'class_definition') {
    if (!isTestClass(definition)) return [];
    const body = definition.childForFieldName('body');
    const inner = [...titlePath, nameOf(definition)];
    return body ? named(body).flatMap((m) => findTests(m, inner)) : [];
  }
  return named(definition).flatMap((child) => findTests(child, titlePath));
}

const DRIVER_FIXTURE_METHODS = [
  'quit',
  'close',
  'implicitly_wait',
  'maximize_window',
  'set_window_size',
];

// A pytest fixture whose body only creates, yields or returns, and quits a driver.
function isDriverFixture(decorators: Node[], definition: Node): boolean {
  const isFixture =
    decorators.length === 1 &&
    ['pytest.fixture', 'fixture'].includes(decoratorName(decorators[0]!));
  const body = definition.childForFieldName('body');
  if (!isFixture || definition.type !== 'function_definition' || !body) return false;
  const names = new Set<string>();
  let creates = false;
  for (const statement of named(body)) {
    if (isNoOp(statement)) continue;
    const expr = expressionOf(statement);
    if (expr?.type === 'assignment' && isDriverConstructor(expr.childForFieldName('right'))) {
      names.add(expr.childForFieldName('left')?.text ?? '');
      creates = true;
      continue;
    }
    const returned =
      statement.type === 'return_statement'
        ? named(statement)[0]
        : expr?.type === 'yield'
          ? named(expr)[0]
          : undefined;
    if (returned && (names.has(returned.text) || isDriverConstructor(returned))) {
      creates = true;
      continue;
    }
    const call = expr?.type === 'call' ? methodCall(expr) : undefined;
    if (call && names.has(call.object.text) && DRIVER_FIXTURE_METHODS.includes(call.method))
      continue;
    return false;
  }
  return creates;
}

// if __name__ == "__main__":
function isMainGuard(node: Node): boolean {
  const condition = node.type === 'if_statement' ? node.childForFieldName('condition') : null;
  if (
    condition?.type !== 'comparison_operator' ||
    named(node).some((n) => n.type.endsWith('clause'))
  ) {
    return false;
  }
  const [left, right] = named(condition);
  return left?.text === '__name__' && stringValue(right) === '__main__';
}

const IMPORTS = ['import_statement', 'import_from_statement', 'future_import_statement'];
const HOOK_METHODS: Record<string, HookKind> = {
  setup_method: 'beforeEach',
  setUp: 'beforeEach',
  teardown_method: 'afterEach',
  tearDown: 'afterEach',
};

type Context = { counters: Counters; fileFlags: FileFlag[]; drivers: Set<string> };

// A dropped module or class member: one BLOCK file flag that lists its tests and assertions.
function drop(
  ctx: Context,
  node: Node,
  titlePath: string[],
  ruleId: 'CORE_UNKNOWN_STATEMENT' | 'CORE_UNSUPPORTED_MEMBER',
  detail?: string,
): void {
  const assertions = countAssertions(node);
  ctx.counters.assertions += assertions;
  const params = detail === undefined ? undefined : { detail };
  ctx.fileFlags.push(fileFlag(ruleId, node, params, assertions, findTests(node, titlePath)));
}

// A test function or method. Returns undefined when the test is dropped.
function testItem(
  node: Node,
  scope: Scope,
  titlePath: string[],
  ctx: Context,
  isMethod: boolean,
): SuiteItem | undefined {
  const { decorators, definition } = unwrap(node);
  const { skipped, ok } = readDecorators(decorators);
  const params = parameterNames(definition);
  const expected = isMethod ? params?.slice(1) : params;
  const paramsOk =
    params !== undefined &&
    (!isMethod || params[0] === 'self') &&
    expected!.every((p) => scope.drivers.has(p));
  const body = definition.childForFieldName('body');
  if (!ok || !paramsOk || !body) {
    drop(ctx, node, titlePath, 'CORE_UNKNOWN_STATEMENT');
    return undefined;
  }
  const steps = bodySteps(body, copyScope(scope), ctx.counters);
  return { type: 'test', test: { name: nameOf(definition), skipped, steps, span: spanOf(node) } };
}

function classItem(node: Node, ctx: Context): SuiteItem | undefined {
  const { decorators, definition } = unwrap(node);
  const { skipped, ok } = readDecorators(decorators);
  const body = definition.childForFieldName('body');
  const name = nameOf(definition);
  if (!ok || !body) {
    drop(ctx, node, [], 'CORE_UNKNOWN_STATEMENT');
    return undefined;
  }
  const scope: Scope = { drivers: new Set(ctx.drivers), vars: new Map() };
  const members = named(body).filter((m) => !isNoOp(m));
  // Hooks run first, so names they bind (self.driver, self.wait) are known in every test.
  const hooks = new Map<Node, SuiteItem>();
  for (const member of members) {
    const { decorators: memberDecorators, definition: method } = unwrap(member);
    const kind = HOOK_METHODS[nameOf(method)];
    const params = parameterNames(method);
    const methodBody = method.childForFieldName('body');
    if (!kind || method.type !== 'function_definition' || memberDecorators.length > 0) continue;
    if (!params || params[0] !== 'self' || params.length > 2 || !methodBody) continue;
    const steps = bodySteps(methodBody, scope, ctx.counters);
    hooks.set(member, { type: 'hook', hook: { kind, steps, span: spanOf(member) } });
  }
  const items: SuiteItem[] = [];
  for (const member of members) {
    const hook = hooks.get(member);
    if (hook) {
      items.push(hook);
      continue;
    }
    const { definition: method } = unwrap(member);
    const methodName = nameOf(method);
    if (method.type === 'function_definition' && /^test/.test(methodName)) {
      const item = testItem(member, scope, [name], ctx, true);
      if (item) items.push(item);
      continue;
    }
    const detail =
      method.type === 'function_definition'
        ? `${methodName}()`
        : method.type === 'class_definition'
          ? `class ${methodName}`
          : shortText(member.text);
    drop(ctx, member, [name], 'CORE_UNSUPPORTED_MEMBER', detail);
  }
  return { type: 'suite', suite: { name, skipped, items, span: spanOf(node) } };
}

// Builds the IR for one Selenium Python file. root is the module node of the syntax tree.
export function extractSeleniumPython(root: Node, sourcePath: string): MigrationFile {
  const ctx: Context = {
    counters: { assertions: 0, statements: 0 },
    fileFlags: [],
    drivers: new Set(['driver']),
  };
  const statements = named(root).filter((s) => !IMPORTS.includes(s.type) && !isNoOp(s));
  // Driver fixtures first, so tests that take them as parameters are known.
  for (const statement of statements) {
    const { decorators, definition } = unwrap(statement);
    if (isDriverFixture(decorators, definition)) ctx.drivers.add(nameOf(definition));
  }
  const items: SuiteItem[] = [];
  const moduleScope: Scope = { drivers: ctx.drivers, vars: new Map() };
  for (const statement of statements) {
    const { decorators, definition } = unwrap(statement);
    if (isDriverFixture(decorators, definition)) {
      ctx.fileFlags.push(fileFlag('CORE_DRIVER_LIFECYCLE', statement));
    } else if (isMainGuard(statement)) {
      ctx.fileFlags.push(fileFlag('PY_MAIN_GUARD', statement));
    } else if (definition.type === 'function_definition' && /^test/.test(nameOf(definition))) {
      const item = testItem(statement, moduleScope, [], ctx, false);
      if (item) items.push(item);
    } else if (isTestClass(definition)) {
      const item = classItem(statement, ctx);
      if (item) items.push(item);
    } else {
      drop(ctx, statement, [], 'CORE_UNKNOWN_STATEMENT');
    }
  }
  return {
    sourcePath,
    framework: 'selenium-python',
    items,
    fileFlags: ctx.fileFlags,
    sourceAssertions: ctx.counters.assertions,
    sourceStatements: ctx.counters.statements,
    sourceTests: findTests(root, []).length,
  };
}
