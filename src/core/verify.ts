// Reads Playwright JSON reporter output and adds the run counts to a migration report.
import type { RunReport } from './report.js';

export type RunCounts = {
  runs: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
};

export type FileVerification = RunCounts & { output: string };

export type Verification = {
  repeatEach: number;
  totals: RunCounts;
  files: FileVerification[];
  /** Spec files that ran but are not in the report, for example files added by hand. */
  unreported: string[];
};

type PwResult = { status?: string };
type PwTest = { status?: string; results?: PwResult[] };
type PwSpec = { file?: string; tests?: PwTest[] };
type PwSuite = { file?: string; specs?: PwSpec[]; suites?: PwSuite[] };
type PwReport = { suites?: PwSuite[]; errors?: Array<{ message?: string }> };

const zero = (): RunCounts => ({ runs: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 });

function add(counts: RunCounts, test: PwTest): void {
  const last = test.results?.at(-1)?.status;
  counts.runs += 1;
  if (last === 'passed') counts.passed += 1;
  else if (last === 'skipped') counts.skipped += 1;
  else counts.failed += 1;
  if (test.status === 'flaky') counts.flaky += 1;
}

function walk(suite: PwSuite, file: string, byFile: Map<string, RunCounts>): void {
  const current = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    const key = spec.file ?? current;
    const counts = byFile.get(key) ?? zero();
    for (const test of spec.tests ?? []) add(counts, test);
    byFile.set(key, counts);
  }
  for (const child of suite.suites ?? []) walk(child, current, byFile);
}

/**
 * Counts the runs per spec file in Playwright JSON reporter output. Each test entry is one
 * run (with --repeat-each, every repeat is its own entry); its last result decides the status.
 * Paths are relative to the Playwright test folder, with forward slashes.
 */
export function countRuns(json: unknown): Map<string, RunCounts> {
  const report = json as PwReport;
  if (typeof report !== 'object' || report === null || !Array.isArray(report.suites)) {
    throw new Error('not Playwright JSON reporter output (no "suites" array)');
  }
  const byFile = new Map<string, RunCounts>();
  for (const suite of report.suites) walk(suite, suite.file ?? '', byFile);
  return byFile;
}

/** Errors Playwright reported outside any test, such as a spec file that does not compile. */
export function topLevelErrors(json: unknown): string[] {
  const errors = (json as PwReport).errors ?? [];
  return errors.map((e) => (e.message ?? '').split('\n')[0] ?? '').filter((m) => m.length > 0);
}

/** Builds the verification section for `report` from the counts of one Playwright run. */
export function buildVerification(
  report: RunReport,
  byFile: Map<string, RunCounts>,
  repeatEach: number,
): Verification {
  const files: FileVerification[] = [];
  const reported = new Set<string>();
  for (const file of report.files) {
    if (file.output === null) continue;
    reported.add(file.output);
    files.push({ output: file.output, ...(byFile.get(file.output) ?? zero()) });
  }
  const totals = zero();
  for (const counts of byFile.values()) {
    totals.runs += counts.runs;
    totals.passed += counts.passed;
    totals.failed += counts.failed;
    totals.skipped += counts.skipped;
    totals.flaky += counts.flaky;
  }
  const unreported = [...byFile.keys()].filter((f) => !reported.has(f)).sort();
  return { repeatEach, totals, files, unreported };
}

/** True when at least one test ran and none failed or was flaky. */
export function verificationPassed(v: Verification): boolean {
  return v.totals.runs > 0 && v.totals.failed === 0 && v.totals.flaky === 0;
}
