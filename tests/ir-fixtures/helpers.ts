// Helpers to hand-build IR for the golden fixtures. Used by tests only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ActionStep,
  AssertStep,
  FileFlag,
  Flag,
  Hook,
  HookKind,
  Locator,
  LocatorChainItem,
  NavigateStep,
  RemovedReason,
  RemovedStep,
  SourceSpan,
  Step,
  StepStatus,
  Suite,
  SuiteItem,
  Test,
  UnknownStep,
  WaitStep,
} from '../../src/core/ir.js';
import { getRule, ruleMessage } from '../../src/core/rules.js';
import type { RuleId } from '../../src/core/rules.js';
import { deriveStepStatus } from '../../src/core/status.js';

const ROOT = 'fixtures/saucedemo';

// Reads lines [startLine, endLine] (1-based) from a fixture source file and returns the span.
export function spanReader(fixtureDir: string, sourcePath: string) {
  const lines = readFileSync(join(ROOT, fixtureDir, sourcePath), 'utf8').split('\n');
  return (startLine: number, endLine = startLine): SourceSpan => {
    const first = lines[startLine - 1];
    if (first === undefined) throw new Error(`${sourcePath} has no line ${startLine}`);
    const startColumn = first.length - first.trimStart().length;
    const text = [first.slice(startColumn), ...lines.slice(startLine, endLine)]
      .join('\n')
      .trimEnd();
    return { startLine, endLine, startColumn, text };
  };
}

export function flag(ruleId: RuleId, line: number, params?: Record<string, string>): Flag {
  return { level: getRule(ruleId).level, ruleId, message: ruleMessage(ruleId, params), line };
}

export const css = (value: string, chain: LocatorChainItem[] = []): Locator => ({
  strategy: 'css',
  value,
  chain,
});

function withStatus<T extends { kind: Step['kind']; flags: Flag[] }>(
  step: T,
): T & { status: StepStatus } {
  return { ...step, status: deriveStepStatus(step) };
}

export const goto = (span: SourceSpan, url: string, flags: Flag[] = []): NavigateStep =>
  withStatus({ kind: 'navigate', action: 'goto', url, span, flags });

export const action = (
  span: SourceSpan,
  kind: ActionStep['action'],
  target: Locator,
  extra: Partial<Pick<ActionStep, 'value' | 'select'>> = {},
  flags: Flag[] = [],
): ActionStep => withStatus({ kind: 'action', action: kind, target, ...extra, span, flags });

// A typing step converted to fill, with the INFO flag every fill carries.
export const fill = (span: SourceSpan, target: Locator, value: string): ActionStep =>
  action(span, 'fill', target, { value }, [flag('CORE_FILL_REPLACES_VALUE', span.startLine)]);

export const expectStep = (
  span: SourceSpan,
  assertion: AssertStep['assertion'],
  target: Locator | 'page',
  extra: Partial<Pick<AssertStep, 'expected' | 'attribute' | 'negated' | 'origin'>> = {},
  flags: Flag[] = [],
): AssertStep =>
  withStatus({
    kind: 'assert',
    assertion,
    target,
    negated: false,
    origin: 'assertion',
    ...extra,
    span,
    flags,
  });

export const fixedWait = (span: SourceSpan, ms: number): WaitStep =>
  withStatus({
    kind: 'wait',
    policy: 'fixed',
    ms,
    span,
    flags: [flag('CORE_FIXED_WAIT', span.startLine)],
  });

export const removed = (span: SourceSpan, reason: RemovedReason, ruleId: RuleId): RemovedStep =>
  withStatus({ kind: 'removed', reason, span, flags: [flag(ruleId, span.startLine)] });

export const blocked = (
  span: SourceSpan,
  ruleId: RuleId,
  params?: Record<string, string>,
  assertionCount = 0,
): UnknownStep =>
  withStatus({
    kind: 'unknown',
    assertionCount,
    span,
    flags: [flag(ruleId, span.startLine, params)],
  });

// A file flag on a span. Only BLOCK flags can drop assertions or tests.
export const fileFlag = (
  ruleId: RuleId,
  span: SourceSpan,
  params?: Record<string, string>,
  assertionCount = 0,
  droppedTests: string[][] = [],
): FileFlag => ({ ...flag(ruleId, span.startLine, params), span, assertionCount, droppedTests });

export const hook = (kind: HookKind, span: SourceSpan, steps: Step[]): SuiteItem => ({
  type: 'hook',
  hook: { kind, span, steps } satisfies Hook,
});

export const test = (
  name: string,
  span: SourceSpan,
  steps: Step[],
  skipped = false,
): SuiteItem => ({
  type: 'test',
  test: { name, span, steps, skipped } satisfies Test,
});

export const suite = (
  name: string,
  span: SourceSpan,
  items: SuiteItem[],
  skipped = false,
): SuiteItem => ({
  type: 'suite',
  suite: { name, span, items, skipped } satisfies Suite,
});
