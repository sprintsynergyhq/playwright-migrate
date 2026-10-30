import type { Flag, MigrationFile, Step, StepStatus } from './ir.js';
import type { FlagLevel, RuleId } from './rules.js';
import {
  collectHooks,
  collectTests,
  deriveFileStatus,
  deriveStepStatus,
  deriveTestStatus,
} from './status.js';
import type { FileStatus, TestStatus } from './status.js';
import { ExitCode } from './types.js';
import type { SourceFramework } from './types.js';

export const REPORT_SCHEMA_VERSION = 1;

export type StepReport = {
  line: number;
  endLine: number;
  kind: Step['kind'];
  status: StepStatus;
  flags: Flag[];
};
export type TestReport = { title: string; status: TestStatus; line: number; steps: StepReport[] };
export type HookReport = { kind: string; line: number; steps: StepReport[] };
export type ReportCounts = {
  tests: number;
  steps: number;
  sourceAssertions: number;
  outputExpects: number;
  blockedAssertions: number;
  info: number;
  warn: number;
  block: number;
};
export type FileReport = {
  schemaVersion: 1;
  source: string;
  output: string | null;
  framework: SourceFramework;
  status: FileStatus;
  counts: ReportCounts;
  tests: TestReport[];
  hooks: HookReport[];
  fileFlags: Flag[];
};
export type RunReport = {
  schemaVersion: 1;
  tool: { name: 'playwright-migrate'; version: string };
  input: string;
  files: FileReport[];
  summary: {
    files: number;
    converted: number;
    convertedWithWarnings: number;
    blocked: number;
    info: number;
    warn: number;
    block: number;
  };
  exitCode: 0 | 2;
};

export type GoldenFlag = { level: FlagLevel; ruleId: RuleId; line: number };
export type GoldenReport = {
  schemaVersion: 1;
  source: string;
  framework: SourceFramework;
  status: FileStatus;
  counts: Omit<ReportCounts, 'steps'>;
  tests: Array<{ title: string; status: TestStatus }>;
  flags: GoldenFlag[];
};

const LEVEL_ORDER: Record<FlagLevel, number> = { INFO: 0, WARN: 1, BLOCK: 2 };

export function compareFlags(
  a: Pick<Flag, 'line' | 'ruleId' | 'level'>,
  b: Pick<Flag, 'line' | 'ruleId' | 'level'>,
): number {
  return (
    a.line - b.line ||
    a.ruleId.localeCompare(b.ruleId) ||
    LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
  );
}

function stepReport(step: Step): StepReport {
  return {
    line: step.span.startLine,
    endLine: step.span.endLine,
    kind: step.kind,
    status: deriveStepStatus(step),
    flags: [...step.flags].sort(compareFlags),
  };
}

export const TITLE_SEPARATOR = ' > ';

export function buildFileReport(file: MigrationFile, output: string | null): FileReport {
  const tests = collectTests(file);
  const hooks = collectHooks(file);
  const allSteps = [...hooks.flatMap((h) => h.steps), ...tests.flatMap((t) => t.test.steps)];
  const allFlags = [...file.fileFlags, ...allSteps.flatMap((s) => s.flags)];
  // Dropped tests are listed and counted as blocked, in source order with the emitted tests.
  const droppedTests: TestReport[] = file.fileFlags.flatMap((f) =>
    f.droppedTests.map((titlePath) => ({
      title: titlePath.join(TITLE_SEPARATOR),
      status: 'blocked' as const,
      line: f.span.startLine,
      steps: [],
    })),
  );
  const testReports: TestReport[] = [
    ...tests.map((t) => ({
      title: t.titlePath.join(TITLE_SEPARATOR),
      status: deriveTestStatus(t),
      line: t.test.span.startLine,
      steps: t.test.steps.map(stepReport),
    })),
    ...droppedTests,
  ].sort((a, b) => a.line - b.line);
  const count = (level: FlagLevel): number => allFlags.filter((f) => f.level === level).length;
  return {
    schemaVersion: 1,
    source: file.sourcePath,
    output,
    framework: file.framework,
    status: deriveFileStatus(file),
    counts: {
      tests: testReports.length,
      steps: allSteps.length,
      sourceAssertions: file.sourceAssertions,
      outputExpects: allSteps.filter((s) => s.kind === 'assert').length,
      blockedAssertions:
        allSteps.reduce((n, s) => n + (s.kind === 'unknown' ? s.assertionCount : 0), 0) +
        file.fileFlags.reduce((n, f) => n + f.assertionCount, 0),
      info: count('INFO'),
      warn: count('WARN'),
      block: count('BLOCK'),
    },
    tests: testReports,
    hooks: hooks.map((h) => ({
      kind: h.kind,
      line: h.span.startLine,
      steps: h.steps.map(stepReport),
    })),
    fileFlags: file.fileFlags
      .map(({ level, ruleId, message, line }) => ({ level, ruleId, message, line }))
      .sort(compareFlags),
  };
}

export function toGoldenReport(report: FileReport): GoldenReport {
  const flags = [
    ...report.fileFlags,
    ...report.hooks.flatMap((h) => h.steps.flatMap((s) => s.flags)),
    ...report.tests.flatMap((t) => t.steps.flatMap((s) => s.flags)),
  ]
    .map((f) => ({ level: f.level, ruleId: f.ruleId, line: f.line }))
    .sort(compareFlags);
  const c = report.counts;
  return {
    schemaVersion: 1,
    source: report.source,
    framework: report.framework,
    status: report.status,
    counts: {
      tests: c.tests,
      sourceAssertions: c.sourceAssertions,
      outputExpects: c.outputExpects,
      blockedAssertions: c.blockedAssertions,
      info: c.info,
      warn: c.warn,
      block: c.block,
    },
    tests: report.tests.map((t) => ({ title: t.title, status: t.status })),
    flags,
  };
}

export function exitCodeForReports(files: FileReport[]): 0 | 2 {
  return files.some((f) => f.status === 'blocked') ? ExitCode.Blocked : ExitCode.Ok;
}

export type RunOutcome = { files: FileReport[] } | { error: Error };

export function exitCodeFor(outcome: RunOutcome): 0 | 1 | 2 {
  return 'error' in outcome ? ExitCode.ToolError : exitCodeForReports(outcome.files);
}

export function buildRunReport(input: string, version: string, files: FileReport[]): RunReport {
  const sorted = [...files].sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );
  const sum = (key: 'info' | 'warn' | 'block'): number =>
    sorted.reduce((n, f) => n + f.counts[key], 0);
  return {
    schemaVersion: 1,
    tool: { name: 'playwright-migrate', version },
    input,
    files: sorted,
    summary: {
      files: sorted.length,
      converted: sorted.filter((f) => f.status === 'converted').length,
      convertedWithWarnings: sorted.filter((f) => f.status === 'converted_with_warnings').length,
      blocked: sorted.filter((f) => f.status === 'blocked').length,
      info: sum('info'),
      warn: sum('warn'),
      block: sum('block'),
    },
    exitCode: exitCodeForReports(sorted),
  };
}

export function renderReportJson(run: RunReport): string {
  return JSON.stringify(run, null, 2) + '\n';
}

const escapeCell = (text: string): string => text.replace(/\|/g, '\\|');

export function renderReportMarkdown(run: RunReport): string {
  const s = run.summary;
  const lines: string[] = [
    '# Migration Report',
    '',
    `Tool: ${run.tool.name} ${run.tool.version}`,
    `Input: ${run.input}`,
    `Exit code: ${run.exitCode}`,
    '',
    '## Summary',
    '',
    '| Files | Converted | Converted With Warnings | Blocked | INFO | WARN | BLOCK |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${s.files} | ${s.converted} | ${s.convertedWithWarnings} | ${s.blocked} | ${s.info} | ${s.warn} | ${s.block} |`,
    '',
    '## Files',
  ];
  for (const f of run.files) {
    const flags = [
      ...f.fileFlags,
      ...f.hooks.flatMap((h) => h.steps.flatMap((st) => st.flags)),
      ...f.tests.flatMap((t) => t.steps.flatMap((st) => st.flags)),
    ].sort(compareFlags);
    lines.push(
      '',
      `### ${f.source}`,
      '',
      `- Framework: ${f.framework}`,
      `- Output: ${f.output ?? 'not written'}`,
      `- Status: ${f.status}`,
      `- Tests: ${f.counts.tests}, steps: ${f.counts.steps}`,
      `- Assertions: ${f.counts.sourceAssertions} in source, ${f.counts.outputExpects} expect calls in output, ${f.counts.blockedAssertions} blocked`,
      '',
    );
    lines.push('| Test | Status |', '| --- | --- |');
    for (const t of f.tests) lines.push(`| ${escapeCell(t.title)} | ${t.status} |`);
    lines.push('');
    if (flags.length === 0) {
      lines.push('No flags.');
    } else {
      lines.push('| Line | Level | Rule | Message |', '| --- | --- | --- | --- |');
      for (const fl of flags)
        lines.push(`| ${fl.line} | ${fl.level} | ${fl.ruleId} | ${escapeCell(fl.message)} |`);
    }
  }
  return lines.join('\n') + '\n';
}
