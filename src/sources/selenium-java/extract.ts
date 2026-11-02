// Selenium Java extractor: walks the tree-sitter syntax tree of a JUnit 5 or TestNG file and builds
// the IR. Every statement in a test or hook body becomes at least one step. A statement that cannot
// be converted becomes one unknown step with a BLOCK flag. A class or member that cannot be read
// becomes a BLOCK file flag that lists the tests and counts the assertions inside it.
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

// The value of a plain string literal. Undefined for text blocks and escapes other than \n, \t,
// \\, \' and \".
export function stringValue(node: Node | undefined): string | undefined {
  if (node?.type !== 'string_literal' || node.text.startsWith('"""')) return undefined;
  let value = '';
  for (const part of named(node)) {
    if (part.type === 'string_fragment') value += part.text;
    else if (part.type === 'escape_sequence' && ESCAPES[part.text] !== undefined) {
      value += ESCAPES[part.text];
    } else return undefined;
  }
  return value;
}

// An int, long or double literal, with an optional minus sign.
function numberValue(node: Node | undefined): number | undefined {
  if (!node) return undefined;
  if (node.type === 'decimal_integer_literal' && /^\d+[lL]?$/.test(node.text)) {
    return Number(node.text.replace(/[lL]$/, ''));
  }
  if (node.type === 'decimal_floating_point_literal' && /^\d+\.\d+$/.test(node.text)) {
    return Number(node.text);
  }
  if (node.type === 'unary_expression' && node.childForFieldName('operator')?.type === '-') {
    const inner = numberValue(node.childForFieldName('operand') ?? undefined);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

// Counts source assertions: calls whose name starts with assert.
export function countAssertions(node: Node): number {
  let count = isAssertCall(node) ? 1 : 0;
  for (const child of node.namedChildren) if (child) count += countAssertions(child);
  return count;
}

const ASSERT_CLASSES = ['Assert', 'Assertions'];

function isAssertCall(node: Node): boolean {
  return (
    node.type === 'method_invocation' && /^assert/.test(node.childForFieldName('name')?.text ?? '')
  );
}

// An assertion call that this extractor reads: assertX(...), Assert.assertX(...) or
// Assertions.assertX(...).
function isKnownAssertCall(node: Node): boolean {
  const object = node.childForFieldName('object');
  return isAssertCall(node) && (!object || ASSERT_CLASSES.includes(object.text));
}

const args = (call: Node): Node[] => {
  const list = call.childForFieldName('arguments');
  return list ? named(list) : [];
};

const methodName = (call: Node): string => call.childForFieldName('name')?.text ?? '';

const DRIVER_CLASSES = [
  'ChromeDriver',
  'FirefoxDriver',
  'EdgeDriver',
  'SafariDriver',
  'InternetExplorerDriver',
  'RemoteWebDriver',
];
const DRIVER_TYPES = ['WebDriver', 'RemoteWebDriver', ...DRIVER_CLASSES];

// A Selenium type name with its package removed, so org.openqa.selenium.chrome.ChromeDriver
// reads as ChromeDriver. Names from any other package are returned unchanged.
const SELENIUM_QUALIFIED = /^org\.openqa\.selenium(?:\.[a-z][a-z0-9_]*)*\.([A-Z]\w*)$/;
export function simpleSeleniumType(text: string): string {
  const compact = text.replace(/\s+/g, '');
  return SELENIUM_QUALIFIED.exec(compact)?.[1] ?? text;
}

const typeOf = (node: Node): string =>
  simpleSeleniumType(node.childForFieldName('type')?.text ?? '');

// new ChromeDriver() and the other driver constructors, also fully qualified.
function isDriverConstructor(node: Node | null | undefined): boolean {
  return node?.type === 'object_creation_expression' && DRIVER_CLASSES.includes(typeOf(node));
}

const isNew = (node: Node | null | undefined, type: string): boolean =>
  node?.type === 'object_creation_expression' && typeOf(node) === type;

// this.driver and driver name the same field.
const keyOf = (node: Node): string => node.text.replace(/^this\./, '');

// The expression inside an expression statement, or undefined.
function expressionOf(statement: Node): Node | undefined {
  if (statement.type !== 'expression_statement') return undefined;
  const parts = named(statement);
  return parts.length === 1 ? parts[0] : undefined;
}

// The method of driver.switchTo().<method>(...), or undefined.
function switchMethod(statement: Node): string | undefined {
  const expr = expressionOf(statement);
  const object = expr?.type === 'method_invocation' ? expr.childForFieldName('object') : null;
  if (object?.type === 'method_invocation' && methodName(object) === 'switchTo') {
    return methodName(expr!);
  }
  return undefined;
}

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
      case 'string_literal': {
        const value = stringValue(node);
        if (value === undefined) throw unknown();
        return { kind: 'literal', value };
      }
      case 'decimal_integer_literal':
      case 'decimal_floating_point_literal':
      case 'unary_expression': {
        const value = numberValue(node);
        if (value === undefined) throw unknown();
        return { kind: 'literal', value };
      }
      case 'true':
        return { kind: 'literal', value: true };
      case 'false':
        return { kind: 'literal', value: false };
      case 'identifier':
      case 'field_access':
        return this.evaluateName(node);
      case 'object_creation_expression':
        return this.evaluateNew(node);
      case 'method_invocation':
        return this.evaluateCall(node);
      default:
        throw unknown();
    }
  }

  private evaluateName(node: Node): Value {
    const key = keyOf(node);
    if (this.scope.drivers.has(key)) return { kind: 'driver' };
    const stored = this.scope.vars.get(key);
    if (stored) return stored;
    throw unknown();
  }

  private evaluateNew(node: Node): Value {
    const list = args(node);
    if (isNew(node, 'WebDriverWait')) {
      const driver = list[0];
      if (!driver || this.evaluate(driver).kind !== 'driver') throw unknown();
      return { kind: 'wait' };
    }
    if (isNew(node, 'Select') && list.length === 1) {
      const element = this.evaluate(list[0]!);
      if (element.kind !== 'element') throw unknown();
      return { kind: 'select', found: element.found };
    }
    throw unknown();
  }

  // By.id("x") and the other By strategies.
  private byCall(node: Node | undefined): Found {
    if (node?.type !== 'method_invocation' || node.childForFieldName('object')?.text !== 'By') {
      throw unknown();
    }
    const kind = BY_NAMES[methodName(node)];
    const [arg, ...rest] = args(node);
    const text = stringValue(arg);
    if (!kind || text === undefined || rest.length > 0) throw unknown();
    return byLocator(kind, text, lineOf(node));
  }

  // list.get(n), or list.get(list.size() - 1) for the last element.
  private listIndex(listNode: Node, index: Node | undefined): number {
    const n = numberValue(index);
    if (n !== undefined && Number.isInteger(n)) return n;
    if (index?.type === 'binary_expression' && index.childForFieldName('operator')?.type === '-') {
      const left = index.childForFieldName('left');
      const right = numberValue(index.childForFieldName('right') ?? undefined);
      const object = left?.type === 'method_invocation' ? left.childForFieldName('object') : null;
      const isSize = left?.type === 'method_invocation' && methodName(left) === 'size';
      if (isSize && args(left).length === 0 && object?.text === listNode.text && right === 1) {
        return -1;
      }
    }
    throw unknown();
  }

  private evaluateCall(node: Node): Value {
    const object = node.childForFieldName('object');
    const name = methodName(node);
    const list = args(node);
    if (!object) throw unknown();
    const base = this.evaluate(object);
    if ((base.kind === 'driver' || base.kind === 'element') && list.length === 1) {
      if (name === 'findElement' || name === 'findElements') {
        const found = this.byCall(list[0]);
        const located = base.kind === 'element' ? chainFound(base.found, found) : found;
        return { kind: name === 'findElement' ? 'element' : 'elements', found: located };
      }
    }
    if (base.kind === 'driver' && list.length === 0) {
      if (name === 'getCurrentUrl') return { kind: 'url' };
      if (name === 'getTitle') return { kind: 'title' };
    }
    if (base.kind === 'element' && list.length === 0) {
      if (name === 'getText') return { kind: 'text', found: base.found };
      if (name === 'isDisplayed') return { kind: 'state', found: base.found, state: 'displayed' };
      if (name === 'isEnabled') return { kind: 'state', found: base.found, state: 'enabled' };
      if (name === 'isSelected') return { kind: 'state', found: base.found, state: 'selected' };
    }
    if (
      base.kind === 'element' &&
      ['getAttribute', 'getDomAttribute', 'getDomProperty'].includes(name)
    ) {
      const attribute = stringValue(list[0]);
      if (list.length !== 1 || attribute === undefined) throw unknown();
      return { kind: 'attribute', found: base.found, name: attribute };
    }
    if (base.kind === 'elements') {
      if (name === 'size' && list.length === 0) return { kind: 'count', found: base.found };
      if (name === 'get' && list.length === 1) {
        return { kind: 'element', found: nthFound(base.found, this.listIndex(object, list[0])) };
      }
    }
    throw unknown();
  }

  // An ExpectedConditions call, possibly wrapped in ExpectedConditions.not(...).
  private condition(node: Node | undefined, negated: boolean): WaitResult {
    if (node?.type !== 'method_invocation') throw new Blocked('CORE_CUSTOM_WAIT');
    const object = node.childForFieldName('object');
    if (object && object.text !== 'ExpectedConditions') throw new Blocked('CORE_CUSTOM_WAIT');
    const name = methodName(node);
    const list = args(node);
    if (name === 'not' && list.length === 1) return this.condition(list[0], !negated);
    const row = WAIT_CONDITIONS[name];
    if (!row) throw new Blocked('CORE_CUSTOM_WAIT');
    if ('blocked' in row) throw new Blocked(row.blocked);
    let found: Found | undefined;
    let text: string | undefined;
    if (row.args === 'text') text = stringValue(list[0]);
    else found = this.foundArg(list[0]);
    if (row.args === 'found+text') text = stringValue(list[1]);
    if (list.length !== (row.args === 'found+text' ? 2 : 1)) throw new Blocked('CORE_CUSTOM_WAIT');
    return waitResult(row, found, text, negated);
  }

  // A By locator or an element, as passed to an expected condition.
  private foundArg(node: Node | undefined): Found {
    if (!node) throw new Blocked('CORE_CUSTOM_WAIT');
    if (node.type === 'method_invocation' && node.childForFieldName('object')?.text === 'By') {
      return this.byCall(node);
    }
    const value = this.evaluate(node);
    if (value.kind !== 'element') throw new Blocked('CORE_CUSTOM_WAIT');
    return value.found;
  }

  // wait.until(...) or new WebDriverWait(...).until(...). Undefined for other calls.
  private waitCall(node: Node): WaitResult | undefined {
    if (node.type !== 'method_invocation' || methodName(node) !== 'until') return undefined;
    const object = node.childForFieldName('object');
    let base: Value;
    try {
      base = object ? this.evaluate(object) : { kind: 'literal', value: '' };
    } catch {
      return undefined;
    }
    if (base.kind !== 'wait') return undefined;
    const list = args(node);
    if (list.length !== 1) throw new Blocked('CORE_CUSTOM_WAIT');
    return this.condition(list[0], false);
  }

  run(statement: Node): Step[] {
    if (statement.type === 'local_variable_declaration') {
      const declarators = statement.descendantsOfType('variable_declarator');
      const declarator = statement.childForFieldName('declarator');
      const name = declarator?.childForFieldName('name');
      const value = declarator?.childForFieldName('value');
      if (declarators.length !== 1 || !name || !value) throw unknown();
      return this.bind(name.text, value);
    }
    const expr = expressionOf(statement);
    if (expr?.type === 'assignment_expression') {
      const left = expr.childForFieldName('left');
      const right = expr.childForFieldName('right');
      const isName =
        left?.type === 'identifier' ||
        (left?.type === 'field_access' && left.childForFieldName('object')?.type === 'this');
      if (!left || !right || !isName || expr.childForFieldName('operator')?.type !== '=') {
        throw unknown();
      }
      return this.bind(keyOf(left), right);
    }
    if (expr?.type === 'method_invocation') return this.callStatement(expr);
    throw unknown();
  }

  // name = value, for a local variable or a field.
  private bind(key: string, right: Node): Step[] {
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
    const object = node.childForFieldName('object');
    const name = methodName(node);
    const list = args(node);
    if (object?.text === 'Thread' && name === 'sleep') {
      const ms = numberValue(list[0]);
      if (list.length !== 1 || ms === undefined) throw new Blocked('CORE_CUSTOM_WAIT');
      return [sleepStep(ms, this.span)];
    }
    if (name === 'executeScript' || name === 'executeAsyncScript') {
      throw new Blocked('CORE_JS_EXECUTOR');
    }
    if (isKnownAssertCall(node)) return [this.assertCall(node)];
    if (isAssertCall(node)) throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail: name });
    const wait = this.waitCall(node);
    if (wait) return [this.waitStep(wait)];
    if (!object) throw unknown();
    if (object.type === 'method_invocation' && methodName(object) === 'switchTo') {
      throw new Blocked(
        ['frame', 'defaultContent', 'parentFrame'].includes(name) ? 'CORE_FRAME' : 'CORE_WINDOW',
      );
    }
    if (/\.switchTo\(\)/.test(object.text)) throw new Blocked('CORE_WINDOW');
    const managed = this.manageCall(object, name);
    if (managed) return [managed];
    const navigate = this.navigateCall(object, name, list);
    if (navigate) return [navigate];
    // wait.until(ExpectedConditions.elementToBeClickable(...)).click()
    const inline = this.waitCall(object);
    if (inline) {
      if (!('clickable' in inline)) throw unknown();
      const note = makeFlag('CORE_CLICKABLE_WAIT_REMOVED', this.span.startLine);
      return [this.elementAction(inline.clickable, name, list, [note])];
    }
    const base = this.evaluate(object);
    if (base.kind === 'driver') return [this.driverCall(name, list)];
    if (base.kind === 'element') return [this.elementAction(base.found, name, list, [])];
    if (base.kind === 'select') return [this.selectCall(base.found, name, list)];
    throw unknown();
  }

  // driver.manage().timeouts().implicitlyWait(...) and driver.manage().window().maximize().
  private manageCall(object: Node, name: string): Step | undefined {
    if (object.type !== 'method_invocation') return undefined;
    const inner = object.childForFieldName('object');
    if (inner?.type !== 'method_invocation' || methodName(inner) !== 'manage') return undefined;
    const target = inner.childForFieldName('object');
    if (!target || this.evaluate(target).kind !== 'driver') throw unknown();
    const group = methodName(object);
    if (group === 'timeouts' && name === 'implicitlyWait') {
      return removedStep('implicit-wait', 'CORE_IMPLICIT_WAIT', this.span);
    }
    if (
      group === 'window' &&
      ['maximize', 'minimize', 'fullscreen', 'setSize', 'setPosition'].includes(name)
    ) {
      return removedStep('window-size', 'CORE_WINDOW_SIZE', this.span);
    }
    throw unknown();
  }

  // driver.navigate().to(url), refresh(), back() and forward().
  private navigateCall(object: Node, name: string, list: Node[]): Step | undefined {
    if (object.type !== 'method_invocation' || methodName(object) !== 'navigate') return undefined;
    const target = object.childForFieldName('object');
    if (!target || args(object).length > 0 || this.evaluate(target).kind !== 'driver') {
      throw unknown();
    }
    if (name === 'to') return this.driverCall('get', list);
    if (list.length === 0) {
      if (name === 'refresh') return navigateStep('reload', this.span);
      if (name === 'back' || name === 'forward') return navigateStep(name, this.span);
    }
    throw unknown();
  }

  private driverCall(name: string, list: Node[]): Step {
    switch (name) {
      case 'get': {
        const url = stringValue(list[0]);
        if (list.length !== 1 || url === undefined) throw unknown();
        return navigateStep('goto', this.span, url);
      }
      case 'quit':
      case 'close':
        if (list.length > 0) throw unknown();
        return removedStep('driver-lifecycle', 'CORE_DRIVER_LIFECYCLE', this.span);
      default:
        throw unknown();
    }
  }

  private elementAction(found: Found, name: string, list: Node[], extra: Flag[]): Step {
    const flags = [...found.notes, ...extra];
    const target = found.locator;
    if ((name === 'click' || name === 'clear') && list.length === 0) {
      return actionStep({ kind: 'action', action: name, target }, this.span, flags);
    }
    if (name === 'sendKeys' && list.length === 1) {
      const text = stringValue(list[0]);
      if (text !== undefined) {
        const fill = makeFlag('CORE_FILL_REPLACES_VALUE', this.span.startLine);
        return actionStep({ kind: 'action', action: 'fill', target, value: text }, this.span, [
          ...flags,
          fill,
        ]);
      }
      const key = list[0];
      const keyName =
        key?.type === 'field_access' && key.childForFieldName('object')?.text === 'Keys'
          ? KEYS[key.childForFieldName('field')?.text ?? '']
          : undefined;
      if (keyName) {
        return actionStep(
          { kind: 'action', action: 'press', target, value: keyName },
          this.span,
          flags,
        );
      }
    }
    throw unknown();
  }

  private selectCall(found: Found, name: string, list: Node[]): Step {
    const target = found.locator;
    if (list.length !== 1) throw unknown();
    const text = stringValue(list[0]);
    const index = numberValue(list[0]);
    let select;
    if (name === 'selectByValue' && text !== undefined)
      select = { by: 'value' as const, value: text };
    else if (name === 'selectByVisibleText' && text !== undefined) {
      select = { by: 'label' as const, value: text };
    } else if (
      name === 'selectByIndex' &&
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

  // A boolean expression inside assertTrue or assertFalse.
  private truth(node: Node, truthy: boolean, detail: string): AssertSpec {
    if (node.type === 'parenthesized_expression' && named(node).length === 1) {
      return this.truth(named(node)[0]!, truthy, detail);
    }
    if (node.type === 'unary_expression' && node.childForFieldName('operator')?.type === '!') {
      const operand = node.childForFieldName('operand');
      if (!operand) throw unknown();
      return this.truth(operand, !truthy, detail);
    }
    if (node.type === 'binary_expression') {
      const operator = node.childForFieldName('operator')?.type;
      const left = node.childForFieldName('left');
      const right = node.childForFieldName('right');
      if ((operator === '==' || operator === '!=') && left && right) {
        const negated = truthy !== (operator === '==');
        return equalsAssertion(this.evaluate(left), this.evaluate(right), negated, detail);
      }
      throw unknown();
    }
    if (node.type === 'method_invocation') {
      const name = methodName(node);
      const object = node.childForFieldName('object');
      const [arg, ...rest] = args(node);
      if ((name === 'contains' || name === 'equals') && object && arg && rest.length === 0) {
        const container = this.evaluate(object);
        const item = this.evaluate(arg);
        return name === 'contains'
          ? containsAssertion(container, item, !truthy, detail)
          : equalsAssertion(container, item, !truthy, detail);
      }
    }
    return truthAssertion(this.evaluate(node), truthy, detail);
  }

  private assertCall(node: Node): Step {
    const name = methodName(node);
    const list = args(node);
    const detail = shortText(node.text);
    const twoArgs = ['assertEquals', 'assertNotEquals'];
    const oneArg = ['assertTrue', 'assertFalse'];
    const arity = twoArgs.includes(name) ? 2 : oneArg.includes(name) ? 1 : 0;
    if (arity === 0) throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail: name });
    if (list.length < arity || list.length > arity + 1) {
      throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });
    }
    const [a, b] = list;
    const spec = this.asAssertion(detail, () => {
      if (!a || (arity === 2 && !b)) throw unknown();
      if (arity === 2) {
        return equalsAssertion(
          this.evaluate(a),
          this.evaluate(b!),
          name === 'assertNotEquals',
          detail,
        );
      }
      return this.truth(a, name === 'assertTrue', detail);
    });
    const extra =
      list.length > arity ? [makeFlag('CORE_ASSERT_MESSAGE_DROPPED', this.span.startLine)] : [];
    return assertStep(spec, this.span, 'assertion', extra);
  }
}

function navigateStep(
  action: 'goto' | 'reload' | 'back' | 'forward',
  span: SourceSpan,
  url?: string,
): Step {
  const step = { kind: 'navigate' as const, action, span, flags: [], status: 'converted' as const };
  return url === undefined ? step : { ...step, url };
}

type Counters = { assertions: number; statements: number };

// Converts the statements of a test or hook body. Steps from switchTo().frame up to
// defaultContent or parentFrame are blocked with CORE_FRAME.
function bodySteps(body: Node, scope: Scope, counters: Counters): Step[] {
  const steps: Step[] = [];
  const pending = new Map<Step, Locator>();
  let inFrame = false;
  for (const statement of named(body)) {
    if (statement.type === 'line_comment' || statement.type === 'block_comment') continue;
    const span = spanOf(statement);
    const assertions = countAssertions(statement);
    counters.statements += 1;
    counters.assertions += assertions;
    try {
      const switchTo = switchMethod(statement);
      if (inFrame || switchTo === 'frame') {
        inFrame = !(switchTo === 'defaultContent' || switchTo === 'parentFrame');
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

type Annotation = { name: string; args: Node[] };

function annotations(definition: Node): Annotation[] {
  const modifiers = named(definition).find((n) => n.type === 'modifiers');
  return (modifiers ? named(modifiers) : [])
    .filter((m) => m.type === 'marker_annotation' || m.type === 'annotation')
    .map((m) => {
      const list = m.childForFieldName('arguments');
      return { name: m.childForFieldName('name')?.text ?? '', args: list ? named(list) : [] };
    });
}

const TEST_ANNOTATIONS = [
  'Test',
  'ParameterizedTest',
  'RepeatedTest',
  'TestFactory',
  'TestTemplate',
];
const SKIP_ANNOTATIONS = ['Disabled', 'Ignore'];
const HOOK_ANNOTATIONS: Record<string, HookKind> = {
  BeforeEach: 'beforeEach',
  BeforeMethod: 'beforeEach',
  AfterEach: 'afterEach',
  AfterMethod: 'afterEach',
};

const nameOf = (definition: Node): string => definition.childForFieldName('name')?.text ?? '';

const isTestMethod = (node: Node): boolean =>
  node.type === 'method_declaration' &&
  annotations(node).some((a) => TEST_ANNOTATIONS.includes(a.name));

// The title paths of every test inside node: methods with a test annotation, inside classes.
function findTests(node: Node, titlePath: string[]): string[][] {
  if (isTestMethod(node)) return [[...titlePath, nameOf(node)]];
  if (node.type === 'class_declaration') {
    const body = node.childForFieldName('body');
    const inner = [...titlePath, nameOf(node)];
    return body ? named(body).flatMap((m) => findTests(m, inner)) : [];
  }
  return named(node).flatMap((child) => findTests(child, titlePath));
}

// Reads the annotations of a test method. Undefined when the test cannot be converted.
// TestNG @Test(enabled = false) and JUnit @Disabled give a skipped test; @DisplayName("x") gives
// the title.
function readTestAnnotations(
  list: Annotation[],
  name: string,
): { skipped: boolean; title: string } | undefined {
  let skipped = false;
  let title = name;
  for (const a of list) {
    if (a.name === 'Test') {
      for (const arg of a.args) {
        const isDisabled =
          arg.type === 'element_value_pair' &&
          arg.childForFieldName('key')?.text === 'enabled' &&
          arg.childForFieldName('value')?.type === 'false';
        if (!isDisabled) return undefined;
        skipped = true;
      }
    } else if (SKIP_ANNOTATIONS.includes(a.name)) skipped = true;
    else if (
      a.name === 'DisplayName' &&
      a.args.length === 1 &&
      stringValue(a.args[0]) !== undefined
    ) {
      title = stringValue(a.args[0])!;
    } else return undefined;
  }
  return { skipped, title };
}

const hasNoParameters = (method: Node): boolean => {
  const params = method.childForFieldName('parameters');
  return !params || named(params).length === 0;
};

type Context = { counters: Counters; fileFlags: FileFlag[] };

// A dropped class or member: one BLOCK file flag that lists its tests and assertions.
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

// A field that only declares the driver or the wait object, such as private WebDriver driver;
function isDriverField(member: Node): boolean {
  if (member.type !== 'field_declaration') return false;
  const type = typeOf(member);
  const declarators = named(member).filter((n) => n.type === 'variable_declarator');
  const plain = declarators.every((d) => !d.childForFieldName('value'));
  return plain && declarators.length > 0 && [...DRIVER_TYPES, 'WebDriverWait'].includes(type);
}

const isComment = (node: Node): boolean =>
  node.type === 'line_comment' || node.type === 'block_comment';

function classItem(node: Node, ctx: Context): SuiteItem {
  const name = nameOf(node);
  const classAnnotations = annotations(node);
  const skipped = classAnnotations.some((a) => SKIP_ANNOTATIONS.includes(a.name));
  const body = node.childForFieldName('body');
  const members = body ? named(body).filter((m) => !isComment(m)) : [];
  const scope: Scope = { drivers: new Set(), vars: new Map() };
  for (const member of members) {
    if (member.type === 'field_declaration' && isDriverField(member)) {
      if (DRIVER_TYPES.includes(typeOf(member))) {
        for (const d of named(member).filter((n) => n.type === 'variable_declarator')) {
          scope.drivers.add(nameOf(d));
        }
      }
    }
  }
  // Hooks run first, so names they bind (driver, wait) are known in every test.
  const hooks = new Map<Node, SuiteItem>();
  for (const member of members) {
    if (member.type !== 'method_declaration') continue;
    const list = annotations(member);
    const kind =
      list.length === 1 && list[0]!.args.length === 0 ? HOOK_ANNOTATIONS[list[0]!.name] : undefined;
    const methodBody = member.childForFieldName('body');
    if (!kind || !methodBody || !hasNoParameters(member)) continue;
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
    if (isDriverField(member)) continue;
    if (isTestMethod(member)) {
      const read = readTestAnnotations(annotations(member), nameOf(member));
      const methodBody = member.childForFieldName('body');
      if (!read || !methodBody || !hasNoParameters(member)) {
        drop(ctx, member, [name], 'CORE_UNKNOWN_STATEMENT');
        continue;
      }
      const steps = bodySteps(methodBody, copyScope(scope), ctx.counters);
      items.push({
        type: 'test',
        test: { name: read.title, skipped: read.skipped, steps, span: spanOf(member) },
      });
      continue;
    }
    const detail =
      member.type === 'method_declaration'
        ? `${nameOf(member)}()`
        : member.type === 'class_declaration'
          ? `class ${nameOf(member)}`
          : shortText(member.text);
    drop(ctx, member, [name], 'CORE_UNSUPPORTED_MEMBER', detail);
  }
  return { type: 'suite', suite: { name, skipped, items, span: spanOf(node) } };
}

const IGNORED = ['package_declaration', 'import_declaration', 'line_comment', 'block_comment'];

// Builds the IR for one Selenium Java file. root is the program node of the syntax tree.
export function extractSeleniumJava(root: Node, sourcePath: string): MigrationFile {
  const ctx: Context = { counters: { assertions: 0, statements: 0 }, fileFlags: [] };
  const items: SuiteItem[] = [];
  for (const statement of named(root)) {
    if (IGNORED.includes(statement.type)) continue;
    const classAnnotations = statement.type === 'class_declaration' ? annotations(statement) : [];
    const plainClass = classAnnotations.every((a) => SKIP_ANNOTATIONS.includes(a.name));
    if (
      statement.type === 'class_declaration' &&
      plainClass &&
      findTests(statement, []).length > 0
    ) {
      items.push(classItem(statement, ctx));
    } else {
      drop(ctx, statement, [], 'CORE_UNKNOWN_STATEMENT');
    }
  }
  return {
    sourcePath,
    framework: 'selenium-java',
    items,
    fileFlags: ctx.fileFlags,
    sourceAssertions: ctx.counters.assertions,
    sourceStatements: ctx.counters.statements,
    sourceTests: findTests(root, []).length,
  };
}
