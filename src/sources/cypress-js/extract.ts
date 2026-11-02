// Cypress JS extractor: walks the tree-sitter syntax tree of a .cy.js file and builds the IR.
// Every statement in a test or hook body becomes at least one step. A statement that cannot be
// converted becomes one unknown step with a BLOCK flag. Nothing is dropped.
import type { Node } from 'web-tree-sitter';
import type {
  Flag,
  HookKind,
  Locator,
  MigrationFile,
  SourceSpan,
  Step,
  StepStatus,
  SuiteItem,
} from '../../core/ir.js';
import { getRule, ruleMessage } from '../../core/rules.js';
import type { RuleId } from '../../core/rules.js';
import { deriveStepStatus } from '../../core/status.js';
import {
  ACTIONS,
  BUILTIN_COMMANDS,
  ELEMENT_ASSERTIONS,
  TITLE_ASSERTIONS,
  URL_ASSERTIONS,
} from './table.js';
import type { AssertionRow } from './table.js';

// Thrown while converting one statement. The statement becomes an unknown step with this rule.
class Blocked extends Error {
  constructor(
    readonly ruleId: RuleId,
    readonly params: Record<string, string> = {},
  ) {
    super(ruleId);
  }
}

const lineOf = (node: Node): number => node.startPosition.row + 1;

function makeFlag(ruleId: RuleId, line: number, params?: Record<string, string>): Flag {
  return { level: getRule(ruleId).level, ruleId, message: ruleMessage(ruleId, params), line };
}

function withStatus<T extends { kind: Step['kind']; flags: Flag[] }>(
  step: T,
): T & { status: StepStatus } {
  return { ...step, status: deriveStepStatus(step) };
}

function spanOf(node: Node): SourceSpan {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    text: node.text,
  };
}

function named(node: Node): Node[] {
  return node.namedChildren.filter((c): c is Node => c !== null && c.type !== 'comment');
}

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

const unsupported = (name: string): Blocked =>
  BUILTIN_COMMANDS.includes(name)
    ? new Blocked('CY_UNSUPPORTED_COMMAND', { name })
    : new Blocked('CY_CUSTOM_COMMAND', { name });

class StatementConverter {
  readonly steps: Step[] = [];

  constructor(private readonly span: SourceSpan) {}

  private takeNotes(subject: Subject): Flag[] {
    if (subject.kind !== 'element') return [];
    const notes = subject.notes;
    subject.notes = [];
    return notes;
  }

  run(statement: Node): Step[] {
    if (statement.type !== 'expression_statement') throw new Blocked('CORE_UNKNOWN_STATEMENT');
    const expr = named(statement)[0];
    const links = expr ? flattenChain(expr) : undefined;
    const [first, ...rest] = links ?? [];
    if (!first) throw new Blocked('CORE_UNKNOWN_STATEMENT');
    let subject = this.command(first);
    for (const link of rest) subject = this.method(link, subject);
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
        return { kind: 'element', locator: { strategy: 'css', value: str0, chain: [] }, notes: [] };
      case 'contains':
        // cy.contains(text). The selector form and .contains() on an element come in PR 5.
        if (args.length !== 1 || str0 === undefined) throw unsupported(name);
        return {
          kind: 'element',
          locator: { strategy: 'text', value: str0, chain: [] },
          notes: [makeFlag('CORE_TEXT_LOCATOR', lineOf(link.nameNode))],
        };
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
      default:
        throw unsupported(name);
    }
  }

  // Every link after the first: an assertion or an action. Chain methods come in PR 5.
  private method(link: Link, subject: Subject): Subject {
    if (link.name === 'should' || link.name === 'and') {
      this.assertion(link, subject);
      return subject;
    }
    const action = ACTIONS[link.name];
    if (subject.kind !== 'element' || !action) throw unsupported(link.name);
    this.action(link, subject, action.action, action.info);
    return subject;
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
    const extra: { expected?: string | number } = {};
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
}

type Counters = { assertions: number; statements: number };

// Converts the statements of a test or hook body.
function bodySteps(body: Node, counters: Counters, forceRule?: RuleId): Step[] {
  const steps: Step[] = [];
  for (const statement of named(body)) {
    const span = spanOf(statement);
    const assertions = countAssertions(statement);
    counters.statements += 1;
    counters.assertions += assertions;
    try {
      if (forceRule) throw new Blocked(forceRule);
      steps.push(...new StatementConverter(span).run(statement));
    } catch (error) {
      if (!(error instanceof Blocked)) throw error;
      const flags = [makeFlag(error.ruleId, span.startLine, error.params)];
      steps.push(withStatus({ kind: 'unknown', assertionCount: assertions, span, flags }));
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

type Block = { kind: 'suite' | 'test' | 'hook'; name: string; skipped: boolean; args: Node[] };

// describe('x', fn), it.skip('x', fn), beforeEach(fn) and so on. Undefined for anything else.
function blockCall(statement: Node): Block | undefined {
  if (statement.type !== 'expression_statement') return undefined;
  const call = named(statement)[0];
  if (call?.type !== 'call_expression') return undefined;
  const fn = call.childForFieldName('function');
  const argsNode = call.childForFieldName('arguments');
  if (!fn || argsNode?.type !== 'arguments') return undefined;
  let name: string;
  let skipped = false;
  if (fn.type === 'identifier') name = fn.text;
  else if (
    fn.type === 'member_expression' &&
    fn.childForFieldName('object')?.type === 'identifier' &&
    fn.childForFieldName('property')?.text === 'skip'
  ) {
    name = fn.childForFieldName('object')!.text;
    skipped = true;
  } else return undefined;
  const kind = SUITES.includes(name)
    ? 'suite'
    : TESTS.includes(name)
      ? 'test'
      : HOOKS[name] && !skipped
        ? 'hook'
        : undefined;
  return kind ? { kind, name, skipped, args: named(argsNode) } : undefined;
}

// The statement block of a callback with no parameters.
function callbackBody(node: Node | undefined): Node | undefined {
  if (node?.type !== 'arrow_function' && node?.type !== 'function_expression') return undefined;
  const params = node.childForFieldName('parameters');
  if (params && named(params).length > 0) return undefined;
  const body = node.childForFieldName('body');
  return body?.type === 'statement_block' ? body : undefined;
}

function extractItems(statements: Node[], counters: Counters, fileFlags: Flag[]): SuiteItem[] {
  const items: SuiteItem[] = [];
  for (const statement of statements) {
    const block = blockCall(statement);
    const span = spanOf(statement);
    const title = block?.kind === 'hook' ? undefined : stringValue(block?.args[0]);
    const body = callbackBody(block?.kind === 'hook' ? block.args[0] : block?.args[1]);
    const argCount = block?.kind === 'hook' ? 1 : 2;
    const valid =
      block !== undefined &&
      block.args.length === argCount &&
      body !== undefined &&
      (block.kind === 'hook' || title !== undefined);
    if (!valid) {
      fileFlags.push(makeFlag('CORE_UNKNOWN_STATEMENT', span.startLine));
      continue;
    }
    if (block.kind === 'suite') {
      const inner = extractItems(named(body), counters, fileFlags);
      items.push({
        type: 'suite',
        suite: { name: title!, skipped: block.skipped, items: inner, span },
      });
    } else if (block.kind === 'test') {
      const steps = bodySteps(body, counters);
      items.push({ type: 'test', test: { name: title!, skipped: block.skipped, steps, span } });
    } else {
      const kind = HOOKS[block.name]!;
      const runOnce = kind === 'beforeAll' || kind === 'afterAll';
      const steps = bodySteps(body, counters, runOnce ? 'CY_BEFORE_HOOK' : undefined);
      items.push({ type: 'hook', hook: { kind, steps, span } });
    }
  }
  return items;
}

// Builds the IR for one Cypress file. root is the program node of the syntax tree.
export function extractCypress(root: Node, sourcePath: string): MigrationFile {
  const counters: Counters = { assertions: 0, statements: 0 };
  const fileFlags: Flag[] = [];
  const items = extractItems(named(root), counters, fileFlags);
  return {
    sourcePath,
    framework: 'cypress-js',
    items,
    fileFlags,
    sourceAssertions: counters.assertions,
    sourceStatements: counters.statements,
  };
}
