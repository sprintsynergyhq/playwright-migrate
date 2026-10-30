// Cypress JS extractor: walks the tree-sitter syntax tree of a .cy.js file and builds the IR.
// Every statement in a test or hook body becomes at least one step. A statement that cannot be
// converted becomes one unknown step with a BLOCK flag. A top-level or suite statement that
// cannot be read becomes a BLOCK file flag that lists the tests and counts the assertions inside
// it, so nothing is dropped without a trace.
import type { Node } from 'web-tree-sitter';
import type {
  FileFlag,
  Flag,
  HookKind,
  Locator,
  LocatorChainItem,
  MigrationFile,
  SourceSpan,
  Step,
  SuiteItem,
} from '../../core/ir.js';
import type { RuleId } from '../../core/rules.js';
import {
  Blocked,
  blockedStep,
  fileFlag,
  lineOf,
  makeFlag,
  named,
  spanOf,
  withStatus,
} from '../shared.js';
import {
  ACTIONS,
  BUILTIN_COMMANDS,
  CALLBACK_METHODS,
  ELEMENT_ASSERTIONS,
  TITLE_ASSERTIONS,
  URL_ASSERTIONS,
} from './table.js';
import type { AssertionRow } from './table.js';

const ESCAPES: Record<string, string> = {
  '\\n': '\n',
  '\\t': '\t',
  '\\\\': '\\',
  "\\'": "'",
  '\\"': '"',
  '\\`': '`',
};

// The value of a string literal, or of a template string without substitutions.
export function stringValue(node: Node | undefined): string | undefined {
  if (!node || (node.type !== 'string' && node.type !== 'template_string')) return undefined;
  let out = '';
  for (const part of named(node)) {
    if (part.type === 'string_fragment') out += part.text;
    else if (part.type === 'escape_sequence' && ESCAPES[part.text] !== undefined)
      out += ESCAPES[part.text];
    else return undefined;
  }
  return out;
}

// The value of an integer literal such as 3 or -1.
export function integerValue(node: Node | undefined): number | undefined {
  if (!node) return undefined;
  if (node.type === 'number' && /^\d+$/.test(node.text)) return Number(node.text);
  if (node.type === 'unary_expression' && /^-\s*\d+$/.test(node.text))
    return -Number(node.text.replace(/^-\s*/, ''));
  return undefined;
}

// Counts source assertions: should() and and() calls, and chai expect() calls.
export function countAssertions(node: Node): number {
  let count = 0;
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn?.type === 'identifier' && fn.text === 'expect') count += 1;
    if (fn?.type === 'member_expression') {
      const prop = fn.childForFieldName('property')?.text;
      if (prop === 'should' || prop === 'and') count += 1;
    }
  }
  for (const child of node.namedChildren) if (child) count += countAssertions(child);
  return count;
}

type Link = { name: string; args: Node[]; argsText: string; nameNode: Node };

// cy.a(x).b(y).c() becomes [a(x), b(y), c()]. Returns undefined if the chain does not start at cy.
function flattenChain(expr: Node): Link[] | undefined {
  const links: Link[] = [];
  let cur: Node = expr;
  for (;;) {
    if (cur.type !== 'call_expression') return undefined;
    const fn = cur.childForFieldName('function');
    const argsNode = cur.childForFieldName('arguments');
    if (fn?.type !== 'member_expression' || argsNode?.type !== 'arguments') return undefined;
    const obj = fn.childForFieldName('object');
    const prop = fn.childForFieldName('property');
    if (!obj || prop?.type !== 'property_identifier') return undefined;
    links.unshift({
      name: prop.text,
      args: named(argsNode),
      argsText: argsNode.text,
      nameNode: prop,
    });
    if (obj.type === 'identifier') return obj.text === 'cy' ? links : undefined;
    cur = obj;
  }
}

type Subject =
  | { kind: 'none' }
  | { kind: 'url' }
  | { kind: 'title' }
  | { kind: 'element'; locator: Locator; notes: Flag[] };

// Adds a chain item to the scope (from within) or starts a new locator.
function startLocator(
  scope: Locator | undefined,
  item: LocatorChainItem & { kind: 'locator' },
): Locator {
  if (scope) return { ...scope, chain: [...scope.chain, item] };
  const { strategy, value, options } = item;
  return options ? { strategy, value, options, chain: [] } : { strategy, value, chain: [] };
}

const unsupported = (name: string): Blocked =>
  BUILTIN_COMMANDS.includes(name)
    ? new Blocked('CY_UNSUPPORTED_COMMAND', { name })
    : new Blocked('CY_CUSTOM_COMMAND', { name });

class StatementConverter {
  readonly steps: Step[] = [];

  constructor(
    private readonly span: SourceSpan,
    private readonly scope: Locator | undefined,
  ) {}

  private takeNotes(subject: Subject): Flag[] {
    if (subject.kind !== 'element') return [];
    const notes = subject.notes;
    subject.notes = [];
    return notes;
  }

  // statement is an expression statement, or the expression body of an arrow function.
  run(statement: Node): Step[] {
    const expr = statement.type === 'expression_statement' ? named(statement)[0] : statement;
    const links = expr ? flattenChain(expr) : undefined;
    const [first, ...rest] = links ?? [];
    if (!first) throw new Blocked('CORE_UNKNOWN_STATEMENT');
    let subject = this.command(first);
    rest.forEach((link, i) => {
      subject = this.method(link, subject, i === rest.length - 1);
    });
    if (this.steps.length === 0) throw new Blocked('CORE_UNKNOWN_STATEMENT');
    return this.steps;
  }

  // The first link: cy.<name>(...).
  private command(link: Link): Subject {
    const { name, args } = link;
    const str0 = stringValue(args[0]);
    const span = this.span;
    switch (name) {
      case 'visit':
        if (args.length !== 1 || str0 === undefined) throw unsupported(name);
        this.steps.push(
          withStatus({ kind: 'navigate', action: 'goto', url: str0, span, flags: [] }),
        );
        return { kind: 'none' };
      case 'reload':
        if (args.length !== 0) throw unsupported(name);
        this.steps.push(withStatus({ kind: 'navigate', action: 'reload', span, flags: [] }));
        return { kind: 'none' };
      case 'go': {
        const n = integerValue(args[0]);
        const action =
          str0 === 'back' || n === -1 ? 'back' : str0 === 'forward' || n === 1 ? 'forward' : null;
        if (args.length !== 1 || !action) throw unsupported(name);
        this.steps.push(withStatus({ kind: 'navigate', action, span, flags: [] }));
        return { kind: 'none' };
      }
      case 'get':
        if (args.length !== 1 || str0 === undefined) throw unsupported(name);
        if (str0.startsWith('@')) throw new Blocked('CY_ALIAS');
        return {
          kind: 'element',
          locator: startLocator(this.scope, { kind: 'locator', strategy: 'css', value: str0 }),
          notes: [],
        };
      case 'contains':
        return this.contains(link, undefined);
      case 'url':
      case 'title':
        if (args.length !== 0) throw unsupported(name);
        return { kind: name };
      case 'wait': {
        const ms = integerValue(args[0]);
        if (args.length === 1 && str0?.startsWith('@')) throw new Blocked('CY_ALIAS');
        if (args.length !== 1 || ms === undefined || ms < 0) throw unsupported(name);
        const flags = [makeFlag('CORE_FIXED_WAIT', span.startLine)];
        this.steps.push(withStatus({ kind: 'wait', policy: 'fixed', ms, span, flags }));
        return { kind: 'none' };
      }
      case 'intercept':
        throw new Blocked('CY_INTERCEPT');
      default:
        throw unsupported(name);
    }
  }

  // cy.contains(text), cy.contains(selector, text) or .contains(text) on an element.
  private contains(link: Link, parent: Locator | undefined): Subject {
    const values = link.args.map((a) => stringValue(a));
    if (values.length < 1 || values.length > 2 || values.some((v) => v === undefined))
      throw unsupported('contains');
    const notes = [makeFlag('CORE_TEXT_LOCATOR', lineOf(link.nameNode))];
    const base = parent ?? this.scope;
    if (values.length === 1) {
      const item = { kind: 'locator', strategy: 'text', value: values[0]! } as const;
      return { kind: 'element', locator: startLocator(base, item), notes };
    }
    const item = { kind: 'locator', strategy: 'css', value: values[0]! } as const;
    const locator = startLocator(base, item);
    return {
      kind: 'element',
      locator: { ...locator, chain: [...locator.chain, { kind: 'hasText', text: values[1]! }] },
      notes,
    };
  }

  // Every link after the first.
  private method(link: Link, subject: Subject, isLast: boolean): Subject {
    const { name, args } = link;
    if (name === 'should' || name === 'and') {
      this.assertion(link, subject);
      return subject;
    }
    if (name === 'as') throw new Blocked('CY_ALIAS');
    if (CALLBACK_METHODS.includes(name)) throw new Blocked('CY_THEN');
    if (subject.kind !== 'element') throw unsupported(name);
    const loc = subject.locator;
    const chained = (item: LocatorChainItem): Subject => ({
      kind: 'element',
      locator: { ...loc, chain: [...loc.chain, item] },
      notes: subject.notes,
    });
    const action = ACTIONS[name];
    if (action) {
      this.action(link, subject, action.action, action.info);
      return subject;
    }
    switch (name) {
      case 'find': {
        const sel = stringValue(args[0]);
        if (args.length !== 1 || sel === undefined) throw unsupported(name);
        return chained({ kind: 'locator', strategy: 'css', value: sel });
      }
      case 'first':
      case 'last':
        if (args.length !== 0) throw unsupported(name);
        return chained({ kind: name });
      case 'eq': {
        const n = integerValue(args[0]);
        if (args.length !== 1 || n === undefined || n < -1) throw unsupported(name);
        return chained(n === -1 ? { kind: 'last' } : { kind: 'nth', index: n });
      }
      case 'contains': {
        const next = this.contains(link, loc);
        if (next.kind === 'element') next.notes = [...subject.notes, ...next.notes];
        return next;
      }
      case 'within':
        if (!isLast) throw unsupported(name);
        this.within(link, subject);
        return subject;
      default:
        throw unsupported(name);
    }
  }

  private action(
    link: Link,
    subject: Subject & { kind: 'element' },
    action: (typeof ACTIONS)[string]['action'],
    info: RuleId | undefined,
  ): void {
    const { name, args } = link;
    const span = this.span;
    const flags = this.takeNotes(subject);
    if (info) flags.push(makeFlag(info, lineOf(link.nameNode)));
    const target = subject.locator;
    if (name === 'type') {
      const value = stringValue(args[0]);
      // Special key sequences such as {enter} have no one-to-one fill mapping.
      if (args.length !== 1 || value === undefined || value.includes('{')) throw unsupported(name);
      this.steps.push(withStatus({ kind: 'action', action, target, value, span, flags }));
      return;
    }
    if (name === 'select') {
      const value = stringValue(args[0]);
      const index = integerValue(args[0]);
      if (args.length !== 1 || (value === undefined && (index === undefined || index < 0)))
        throw unsupported(name);
      const select =
        value !== undefined
          ? ({ by: 'valueOrLabel', value } as const)
          : ({ by: 'index', index: index! } as const);
      this.steps.push(withStatus({ kind: 'action', action, target, select, span, flags }));
      return;
    }
    if (args.length !== 0) throw unsupported(name);
    this.steps.push(withStatus({ kind: 'action', action, target, span, flags }));
  }

  private assertion(link: Link, subject: Subject): void {
    const [chainerNode, ...rest] = link.args;
    if (chainerNode?.type === 'arrow_function' || chainerNode?.type === 'function_expression')
      throw new Blocked('CY_THEN');
    const detail = `${link.name}${link.argsText}`;
    const chainer = stringValue(chainerNode);
    if (chainer === undefined) throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });
    const negated = chainer.startsWith('not.');
    const base = negated ? chainer.slice(4) : chainer;
    const table =
      subject.kind === 'element'
        ? ELEMENT_ASSERTIONS
        : subject.kind === 'url'
          ? URL_ASSERTIONS
          : subject.kind === 'title'
            ? TITLE_ASSERTIONS
            : {};
    const row: AssertionRow | undefined = table[base];
    if (!row) throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });
    const strings = rest.map((a) => stringValue(a));
    const extra: { expected?: string | number; attribute?: string } = {};
    const ok = ((): boolean => {
      switch (row.args) {
        case 'none':
          return rest.length === 0;
        case 'value':
          if (rest.length !== 1 || strings[0] === undefined) return false;
          extra.expected = strings[0];
          return true;
        case 'number': {
          const n = integerValue(rest[0]);
          if (rest.length !== 1 || n === undefined || n < 0) return false;
          extra.expected = n;
          return true;
        }
        case 'attribute':
          if (rest.length < 1 || rest.length > 2 || strings.some((s) => s === undefined))
            return false;
          extra.attribute = strings[0]!;
          if (rest.length === 2) extra.expected = strings[1]!;
          return true;
      }
    })();
    if (!ok) throw new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });
    const target = subject.kind === 'element' ? subject.locator : 'page';
    this.steps.push(
      withStatus({
        kind: 'assert',
        assertion: row.assertion,
        target,
        ...extra,
        negated,
        origin: 'assertion',
        span: this.span,
        flags: this.takeNotes(subject),
      }),
    );
  }

  // .within(() => { ... }): each inner statement is converted with the element as its scope.
  private within(link: Link, subject: Subject & { kind: 'element' }): void {
    const fn = link.args[0];
    const body = fn?.childForFieldName('body');
    const params = fn?.childForFieldName('parameters');
    const isCallback = fn?.type === 'arrow_function' || fn?.type === 'function_expression';
    if (link.args.length !== 1 || !isCallback || body?.type !== 'statement_block')
      throw unsupported('within');
    if (params && named(params).length > 0) throw unsupported('within');
    const statements = named(body);
    if (statements.length === 0) throw unsupported('within');
    const start = this.steps.length;
    for (const statement of statements) {
      const inner = new StatementConverter(this.span, subject.locator);
      this.steps.push(...inner.run(statement));
    }
    const first = this.steps[start]!;
    const notes = [...this.takeNotes(subject), makeFlag('CY_WITHIN', lineOf(link.nameNode))];
    this.steps[start] = withStatus({ ...first, flags: [...notes, ...first.flags] });
  }
}

type Counters = { assertions: number; statements: number };

// Converts the statements of a test or hook body.
function bodySteps(statements: Node[], counters: Counters, forceRule?: RuleId): Step[] {
  const steps: Step[] = [];
  for (const statement of statements) {
    const span = spanOf(statement);
    const assertions = countAssertions(statement);
    counters.statements += 1;
    counters.assertions += assertions;
    try {
      if (forceRule) throw new Blocked(forceRule);
      steps.push(...new StatementConverter(span, undefined).run(statement));
    } catch (error) {
      if (!(error instanceof Blocked)) throw error;
      steps.push(blockedStep(error, span, assertions));
    }
  }
  return steps;
}

const SUITES = ['describe', 'context'];
const TESTS = ['it', 'specify'];
const HOOKS: Record<string, HookKind> = {
  beforeEach: 'beforeEach',
  afterEach: 'afterEach',
  before: 'beforeAll',
  after: 'afterAll',
};

type Block = {
  kind: 'suite' | 'test' | 'hook';
  name: string;
  skipped: boolean;
  only: boolean;
  callee: Node;
  args: Node[];
};

// describe('x', fn), it.skip('x', fn), xit('x', fn), it.only('x', fn), beforeEach(fn) and so
// on. node is an expression statement or a call. Undefined for anything else.
function blockCall(node: Node): Block | undefined {
  const call = node.type === 'expression_statement' ? named(node)[0] : node;
  if (call?.type !== 'call_expression') return undefined;
  const fn = call.childForFieldName('function');
  const argsNode = call.childForFieldName('arguments');
  if (!fn || argsNode?.type !== 'arguments') return undefined;
  let name: string;
  let modifier: string | undefined;
  if (fn.type === 'identifier') name = fn.text;
  else if (
    fn.type === 'member_expression' &&
    fn.childForFieldName('object')?.type === 'identifier' &&
    ['skip', 'only'].includes(fn.childForFieldName('property')?.text ?? '')
  ) {
    name = fn.childForFieldName('object')!.text;
    modifier = fn.childForFieldName('property')!.text;
  } else return undefined;
  // xdescribe, xcontext, xit and xspecify are skipped like .skip.
  const xSkipped = !modifier && /^x(describe|context|it|specify)$/.test(name);
  if (xSkipped) name = name.slice(1);
  const kind = SUITES.includes(name)
    ? 'suite'
    : TESTS.includes(name)
      ? 'test'
      : HOOKS[name] && !modifier
        ? 'hook'
        : undefined;
  if (!kind) return undefined;
  const skipped = xSkipped || modifier === 'skip';
  return { kind, name, skipped, only: modifier === 'only', callee: fn, args: named(argsNode) };
}

// The statements of a callback with no parameters. An expression body, as in
// () => cy.visit('/'), is one statement.
function callbackStatements(node: Node | undefined): Node[] | undefined {
  if (node?.type !== 'arrow_function' && node?.type !== 'function_expression') return undefined;
  const params = node.childForFieldName('parameters');
  if (params && named(params).length > 0) return undefined;
  const body = node.childForFieldName('body');
  if (!body) return undefined;
  if (body.type === 'statement_block') return named(body);
  return node.type === 'arrow_function' ? [body] : undefined;
}

const UNTITLED = '(untitled)';

// The title paths of every test call inside node, the way the extractor would see them. Test and
// hook bodies are not searched.
function findTests(node: Node, titlePath: string[]): string[][] {
  const block = node.type === 'call_expression' ? blockCall(node) : undefined;
  if (block?.kind === 'hook') return [];
  if (block?.kind === 'test') return [[...titlePath, stringValue(block.args[0]) ?? UNTITLED]];
  const inner =
    block?.kind === 'suite' ? [...titlePath, stringValue(block.args[0]) ?? UNTITLED] : titlePath;
  return named(node).flatMap((child) => findTests(child, inner));
}

type Context = { counters: Counters; fileFlags: FileFlag[] };

function extractItems(statements: Node[], titlePath: string[], ctx: Context): SuiteItem[] {
  const items: SuiteItem[] = [];
  for (const statement of statements) {
    const block = blockCall(statement);
    const span = spanOf(statement);
    const title = block?.kind === 'hook' ? undefined : stringValue(block?.args[0]);
    const body = callbackStatements(block?.kind === 'hook' ? block.args[0] : block?.args[1]);
    const argCount = block?.kind === 'hook' ? 1 : 2;
    const valid =
      block !== undefined &&
      block.args.length === argCount &&
      body !== undefined &&
      (block.kind === 'hook' || title !== undefined);
    if (!valid) {
      // The statement is dropped. Its tests and assertions are still listed and counted.
      const assertions = countAssertions(statement);
      ctx.counters.assertions += assertions;
      const dropped = findTests(statement, titlePath);
      ctx.fileFlags.push(
        fileFlag('CORE_UNKNOWN_STATEMENT', statement, undefined, assertions, dropped),
      );
      continue;
    }
    if (block.only) ctx.fileFlags.push(fileFlag('CY_ONLY', block.callee, { name: block.name }));
    if (block.kind === 'suite') {
      const inner = extractItems(body, [...titlePath, title!], ctx);
      items.push({
        type: 'suite',
        suite: { name: title!, skipped: block.skipped, items: inner, span },
      });
    } else if (block.kind === 'test') {
      const steps = bodySteps(body, ctx.counters);
      items.push({ type: 'test', test: { name: title!, skipped: block.skipped, steps, span } });
    } else {
      const kind = HOOKS[block.name]!;
      const runOnce = kind === 'beforeAll' || kind === 'afterAll';
      const steps = bodySteps(body, ctx.counters, runOnce ? 'CY_BEFORE_HOOK' : undefined);
      items.push({ type: 'hook', hook: { kind, steps, span } });
    }
  }
  return items;
}

// Builds the IR for one Cypress file. root is the program node of the syntax tree.
export function extractCypress(root: Node, sourcePath: string): MigrationFile {
  const ctx: Context = { counters: { assertions: 0, statements: 0 }, fileFlags: [] };
  const items = extractItems(named(root), [], ctx);
  return {
    sourcePath,
    framework: 'cypress-js',
    items,
    fileFlags: ctx.fileFlags,
    sourceAssertions: ctx.counters.assertions,
    sourceStatements: ctx.counters.statements,
    sourceTests: findTests(root, []).length,
  };
}
