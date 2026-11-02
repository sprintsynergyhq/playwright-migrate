import type { Flag, Hook, MigrationFile, Step, StepStatus, SuiteItem, Test } from './ir.js';

export type TestStatus = 'converted' | 'converted_with_warnings' | 'blocked';
export type FileStatus = TestStatus;

// The status a step must have, given its kind and flags.
export function deriveStepStatus(step: { kind: Step['kind']; flags: Flag[] }): StepStatus {
  if (step.kind === 'unknown' || step.flags.some((f) => f.level === 'BLOCK')) return 'blocked';
  if (step.flags.length > 0) return 'converted_with_note';
  return 'converted';
}

function statusOfFlags(flags: Flag[]): TestStatus {
  if (flags.some((f) => f.level === 'BLOCK')) return 'blocked';
  if (flags.some((f) => f.level === 'WARN')) return 'converted_with_warnings';
  return 'converted';
}

function stepFlags(steps: Step[]): Flag[] {
  return steps.flatMap((s) => s.flags);
}

export type TestContext = { test: Test; titlePath: string[]; hooks: Hook[] };

// Every test in source order, with its title path and the hooks that run around it
// (hooks of the file and of every enclosing suite).
export function collectTests(file: MigrationFile): TestContext[] {
  const out: TestContext[] = [];
  const walk = (items: SuiteItem[], titlePath: string[], inherited: Hook[]): void => {
    const hooks = [...inherited, ...items.flatMap((i) => (i.type === 'hook' ? [i.hook] : []))];
    for (const item of items) {
      if (item.type === 'test')
        out.push({ test: item.test, titlePath: [...titlePath, item.test.name], hooks });
      if (item.type === 'suite') walk(item.suite.items, [...titlePath, item.suite.name], hooks);
    }
  };
  walk(file.items, [], []);
  return out;
}

// Every hook in source order.
export function collectHooks(file: MigrationFile): Hook[] {
  const out: Hook[] = [];
  const walk = (items: SuiteItem[]): void => {
    for (const item of items) {
      if (item.type === 'hook') out.push(item.hook);
      if (item.type === 'suite') walk(item.suite.items);
    }
  };
  walk(file.items);
  return out;
}

// A test is blocked if any of its steps, or any step of a hook that runs around it, is blocked.
export function deriveTestStatus(ctx: TestContext): TestStatus {
  const steps = [...ctx.hooks.flatMap((h) => h.steps), ...ctx.test.steps];
  if (steps.some((s) => deriveStepStatus(s) === 'blocked')) return 'blocked';
  return statusOfFlags(stepFlags(steps));
}

export function deriveFileStatus(file: MigrationFile): FileStatus {
  const tests = collectTests(file).map(deriveTestStatus);
  const hookSteps = collectHooks(file).flatMap((h) => h.steps);
  if (
    tests.includes('blocked') ||
    hookSteps.some((s) => deriveStepStatus(s) === 'blocked') ||
    file.fileFlags.some((f) => f.level === 'BLOCK')
  ) {
    return 'blocked';
  }
  if (
    tests.includes('converted_with_warnings') ||
    statusOfFlags([...file.fileFlags, ...stepFlags(hookSteps)]) !== 'converted'
  ) {
    return 'converted_with_warnings';
  }
  return 'converted';
}
