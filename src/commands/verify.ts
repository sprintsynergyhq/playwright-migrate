import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_OUT_DIR, REPORT_JSON, REPORT_MD } from '../core/migrate.js';
import { renderReportJson, renderReportMarkdown, type RunReport } from '../core/report.js';
import type { Io } from '../core/types.js';
import {
  buildVerification,
  countRuns,
  topLevelErrors,
  verificationPassed,
} from '../core/verify.js';
import { PLAYWRIGHT_CONFIG_FILE } from '../emit/config.js';

export type VerifyOptions = { repeatEach?: string };

export const DEFAULT_REPEAT_EACH = 5;

function fail(io: Io, ...lines: string[]): number {
  io.err(`Error: ${lines[0]}`);
  for (const line of lines.slice(1)) io.err(line);
  return 1;
}

function readReport(file: string): RunReport | undefined {
  try {
    const report = JSON.parse(readFileSync(file, 'utf8')) as RunReport;
    return report.schemaVersion === 1 && Array.isArray(report.files) ? report : undefined;
  } catch {
    return undefined;
  }
}

// Runs the converted specs in a folder written by `migrate <folder>` and adds the run counts
// to its reports. Returns 0 when at least one test ran and none failed, 1 otherwise.
export function runVerify(dir: string | undefined, opts: VerifyOptions, io: Io): number {
  const shown = dir ?? DEFAULT_OUT_DIR;
  const root = path.resolve(shown);
  const repeatEach = Number(opts.repeatEach ?? DEFAULT_REPEAT_EACH);
  if (!Number.isInteger(repeatEach) || repeatEach < 1 || repeatEach > 100) {
    return fail(
      io,
      `invalid value for --repeat-each: ${opts.repeatEach}. Use a whole number from 1 to 100.`,
    );
  }
  const config = path.join(root, PLAYWRIGHT_CONFIG_FILE);
  if (!existsSync(config)) {
    return fail(
      io,
      `no ${PLAYWRIGHT_CONFIG_FILE} in ${shown}.`,
      'Run `playwright-migrate migrate <folder>` first, then verify its --out folder.',
    );
  }
  const reportFile = path.join(root, REPORT_JSON);
  const report = readReport(reportFile);
  if (!report) return fail(io, `no readable ${REPORT_JSON} in ${shown}.`);

  let cli: string;
  try {
    cli = createRequire(path.join(root, 'package.json')).resolve('@playwright/test/cli');
  } catch {
    return fail(
      io,
      `cannot find @playwright/test from ${shown}.`,
      'Install it where the converted specs can import it (npm install -D @playwright/test),',
      'then install a browser (npx playwright install chromium).',
    );
  }

  const work = mkdtempSync(path.join(tmpdir(), 'pwm-verify-'));
  const jsonFile = path.join(work, 'results.json');
  try {
    io.out(`Running Playwright in ${shown} with --repeat-each=${repeatEach} and retries 0.`);
    const child = spawnSync(
      process.execPath,
      [
        cli,
        'test',
        '--config',
        config,
        `--repeat-each=${repeatEach}`,
        '--retries=0',
        '--reporter=json',
      ],
      {
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile },
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    if (!existsSync(jsonFile)) {
      const output = `${child.stderr ?? ''}${child.stdout ?? ''}`.trim().split('\n').slice(-20);
      return fail(io, 'Playwright did not produce results.', ...output);
    }
    const json: unknown = JSON.parse(readFileSync(jsonFile, 'utf8'));
    const verification = buildVerification(report, countRuns(json), repeatEach);
    const errors = topLevelErrors(json);

    const updated: RunReport = { ...report, verification };
    writeFileSync(reportFile, renderReportJson(updated), 'utf8');
    writeFileSync(path.join(root, REPORT_MD), renderReportMarkdown(updated), 'utf8');

    for (const f of verification.files) {
      io.out(
        `${f.output}: ${f.passed} passed, ${f.failed} failed, ${f.skipped} skipped of ${f.runs} runs`,
      );
    }
    for (const f of verification.unreported) io.out(`Not in the report: ${f}`);
    for (const e of errors) io.err(`Playwright error: ${e}`);
    const t = verification.totals;
    io.out(`Updated ${path.join(shown, REPORT_JSON)} and ${path.join(shown, REPORT_MD)}`);
    io.out(
      `Verified with --repeat-each=${repeatEach}: ${t.runs} runs, ${t.passed} passed, ` +
        `${t.failed} failed, ${t.skipped} skipped, ${t.flaky} flaky.`,
    );
    return verificationPassed(verification) && errors.length === 0 ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
