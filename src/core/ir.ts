// Framework-neutral test model (IR). Extractors build it; the emitter and the report read it.
import type { FlagLevel, RuleId } from './rules.js';
import type { SourceFramework } from './types.js';

// Lines are 1-based. startColumn is 0-based. text is the exact source text of the statement,
// from its first character to its last (for statements, this includes a trailing semicolon).
export type SourceSpan = { startLine: number; endLine: number; startColumn: number; text: string };

export type Flag = { level: FlagLevel; ruleId: RuleId; message: string; line: number };

export type StepStatus = 'converted' | 'converted_with_note' | 'blocked';

export type LocatorStrategy = 'css' | 'xpath' | 'text' | 'role';
export type LocatorOptions = { name?: string; exact?: boolean };
export type LocatorBase = { strategy: LocatorStrategy; value: string; options?: LocatorOptions };
export type LocatorChainItem =
  | ({ kind: 'locator' } & LocatorBase)
  | { kind: 'nth'; index: number }
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'hasText'; text: string };
export type Locator = LocatorBase & { chain: LocatorChainItem[] };

type StepBase = { span: SourceSpan; status: StepStatus; flags: Flag[] };

export type NavigateStep = StepBase & {
  kind: 'navigate';
  action: 'goto' | 'reload' | 'back' | 'forward';
  url?: string;
};

export type ActionKind =
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'clear'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'press'
  | 'selectOption';

export type SelectValue =
  | { by: 'valueOrLabel'; value: string }
  | { by: 'value'; value: string }
  | { by: 'label'; value: string }
  | { by: 'index'; index: number };

export type ActionStep = StepBase & {
  kind: 'action';
  action: ActionKind;
  target: Locator;
  value?: string;
  select?: SelectValue;
};

export type AssertionKind =
  | 'visible'
  | 'hidden'
  | 'attached'
  | 'text'
  | 'containText'
  | 'value'
  | 'attribute'
  | 'containClass'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'count'
  | 'url'
  | 'urlContains'
  | 'title'
  | 'titleContains';

export type AssertStep = StepBase & {
  kind: 'assert';
  assertion: AssertionKind;
  target: Locator | 'page';
  expected?: string | number;
  attribute?: string;
  negated: boolean;
  // 'assertion' when it comes from a source assertion; 'wait' when a wait became an assertion.
  origin: 'assertion' | 'wait';
};

export type WaitStep = StepBase & { kind: 'wait'; policy: 'fixed'; ms: number };

export type RemovedReason =
  | 'driver-lifecycle'
  | 'wait-object'
  | 'implicit-wait'
  | 'clickable-wait'
  | 'stored-element'
  | 'window-size';

export type RemovedStep = StepBase & { kind: 'removed'; reason: RemovedReason };

// A blocked statement. assertionCount is the number of source assertions inside it.
export type UnknownStep = StepBase & { kind: 'unknown'; assertionCount: number };

export type Step = NavigateStep | ActionStep | AssertStep | WaitStep | RemovedStep | UnknownStep;

export type HookKind = 'beforeEach' | 'afterEach' | 'beforeAll' | 'afterAll';
export type Hook = { kind: HookKind; steps: Step[]; span: SourceSpan };
export type Test = { name: string; skipped: boolean; steps: Step[]; span: SourceSpan };
export type Suite = { name: string; skipped: boolean; items: SuiteItem[]; span: SourceSpan };
export type SuiteItem =
  { type: 'hook'; hook: Hook } | { type: 'test'; test: Test } | { type: 'suite'; suite: Suite };

export type MigrationFile = {
  // Path of the source file, relative to the input root, with forward slashes.
  sourcePath: string;
  framework: SourceFramework;
  // Top-level items in source order.
  items: SuiteItem[];
  // Flags that do not belong to a step (for example a removed pytest fixture or a Java field).
  fileFlags: Flag[];
  // Counted by the extractor from the syntax tree.
  sourceAssertions: number;
  // Number of statements directly inside test and hook bodies, counted by the extractor.
  sourceStatements: number;
};
