import type { MigrationFile, Step } from './ir.js';
import { getRule, isRuleId } from './rules.js';
import { collectHooks, collectTests, deriveStepStatus } from './status.js';

export class InvariantError extends Error {
  readonly problems: string[];
  constructor(sourcePath: string, problems: string[]) {
    super(`Invariant check failed for ${sourcePath}:\n- ${problems.join('\n- ')}`);
    this.name = 'InvariantError';
    this.problems = problems;
  }
}

// Returns a list of problems. An empty list means the IR is safe to emit.
export function findInvariantProblems(file: MigrationFile): string[] {
  const problems: string[] = [];
  const tests = collectTests(file);
  const hooks = collectHooks(file);
  const steps: Step[] = [...hooks.flatMap((h) => h.steps), ...tests.flatMap((t) => t.test.steps)];

  for (const t of tests) {
    if (t.test.name.trim() === '')
      problems.push(`test at line ${t.test.span.startLine} has an empty name`);
  }

  for (const step of steps) {
    const where = `${step.kind} step at line ${step.span.startLine}`;
    if (step.span.startLine < 1 || step.span.endLine < step.span.startLine) {
      problems.push(`${where} has an invalid span`);
    }
    if (step.status !== deriveStepStatus(step)) {
      problems.push(`${where} has status ${step.status}, expected ${deriveStepStatus(step)}`);
    }
    if (step.kind === 'unknown' && !step.flags.some((f) => f.level === 'BLOCK')) {
      problems.push(`${where} is unknown but has no BLOCK flag`);
    }
    if (step.kind !== 'unknown' && step.flags.some((f) => f.level === 'BLOCK')) {
      problems.push(`${where} has a BLOCK flag but is not an unknown step`);
    }
    for (const flag of step.flags) {
      if (!isRuleId(flag.ruleId)) {
        problems.push(`${where} uses unknown rule ${String(flag.ruleId)}`);
        continue;
      }
      if (getRule(flag.ruleId).level !== flag.level) {
        problems.push(
          `${where} flag ${flag.ruleId} has level ${flag.level}, expected ${getRule(flag.ruleId).level}`,
        );
      }
      if (flag.line < step.span.startLine || flag.line > step.span.endLine) {
        problems.push(`${where} flag ${flag.ruleId} points to line ${flag.line}, outside the step`);
      }
    }
  }

  for (const flag of file.fileFlags) {
    if (!isRuleId(flag.ruleId)) problems.push(`file flag uses unknown rule ${String(flag.ruleId)}`);
    else if (getRule(flag.ruleId).level !== flag.level) {
      problems.push(
        `file flag ${flag.ruleId} has level ${flag.level}, expected ${getRule(flag.ruleId).level}`,
      );
    }
  }

  // Every source assertion is either an expect in the output or counted inside a blocked step.
  const converted = steps.filter((s) => s.kind === 'assert' && s.origin === 'assertion').length;
  const blocked = steps.reduce((n, s) => n + (s.kind === 'unknown' ? s.assertionCount : 0), 0);
  if (converted + blocked !== file.sourceAssertions) {
    problems.push(
      `assertion accounting: ${file.sourceAssertions} source assertions, but ${converted} converted and ${blocked} blocked`,
    );
  }

  // Every source statement in a test or hook body is covered by at least one step.
  const spans = new Set(steps.map((s) => `${s.span.startLine}:${s.span.startColumn}`));
  if (spans.size !== file.sourceStatements) {
    problems.push(
      `statement accounting: ${file.sourceStatements} source statements, but steps cover ${spans.size}`,
    );
  }

  return problems;
}

export function checkInvariants(file: MigrationFile): void {
  const problems = findInvariantProblems(file);
  if (problems.length > 0) throw new InvariantError(file.sourcePath, problems);
}
