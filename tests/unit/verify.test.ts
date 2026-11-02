import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from '../../src/cli.js';
import { convertSource } from '../../src/core/convert.js';
import { buildRunReport, renderReportJson, renderReportMarkdown } from '../../src/core/report.js';
import type { RunReport } from '../../src/core/report.js';
import {
  buildVerification,
  countRuns,
  topLevelErrors,
  verificationPassed,
} from '../../src/core/verify.js';
import { renderPlaywrightConfig } from '../../src/emit/config.js';
import { REPO_ROOT } from '../golden/harness.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateRun = ajv.compile(
  JSON.parse(readFileSync('schemas/migration-report.schema.json', 'utf8')) as object,
);

async function cli(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(['node', 'playwright-migrate', ...args], {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const test = (status: string, ...results: string[]) => ({
  status,
  results: results.map((r) => ({ status: r })),
});

const SAMPLE = {
  suites: [
    {
      file: 'a/one.spec.ts',
      specs: [
        { file: 'a/one.spec.ts', tests: [test('expected', 'passed'), test('expected', 'passed')] },
      ],
      suites: [
        {
          file: 'a/one.spec.ts',
          specs: [{ tests: [test('skipped', 'skipped'), test('unexpected', 'timedOut')] }],
        },
      ],
    },
    {
      file: 'b.spec.ts',
      specs: [
        {
          file: 'b.spec.ts',
          tests: [test('unexpected', 'failed'), test('flaky', 'failed', 'passed')],
        },
      ],
    },
    {
      file: 'extra.spec.ts',
      specs: [{ file: 'extra.spec.ts', tests: [test('expected', 'passed')] }],
    },
  ],
  errors: [{ message: 'Error: boom\n    at x' }],
};

async function sampleReport(outputs: string[]): Promise<RunReport> {
  const text = "it('a', () => { cy.visit('https://www.saucedemo.com/'); });\n";
  const files = await Promise.all(
    outputs.map(
      async (o) =>
        (await convertSource('cypress-js', o.replace('.spec.ts', '.cy.js'), text, o)).report,
    ),
  );
  return buildRunReport('in', '0.0.0', files);
}

const tempDirs: string[] = [];

function tempDir(): string {
  mkdirSync(path.join(REPO_ROOT, '.demo'), { recursive: true });
  const dir = mkdtempSync(path.join(REPO_ROOT, '.demo', 'unit-verify-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('verify', () => {
  it('counts one run per test entry, by the last result, per spec file', () => {
    const byFile = countRuns(SAMPLE);
    expect(Object.fromEntries(byFile)).toEqual({
      'a/one.spec.ts': { runs: 4, passed: 2, failed: 1, skipped: 1, flaky: 0 },
      'b.spec.ts': { runs: 2, passed: 1, failed: 1, skipped: 0, flaky: 1 },
      'extra.spec.ts': { runs: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
    });
    expect(topLevelErrors(SAMPLE)).toEqual(['Error: boom']);
  });

  it('rejects input that is not Playwright JSON reporter output', () => {
    expect(() => countRuns({ results: [] })).toThrow(/no "suites" array/);
  });

  it('builds totals, keeps report order, gives zero counts to files that did not run, and lists extra files', async () => {
    const report = await sampleReport(['a/one.spec.ts', 'b.spec.ts', 'c.spec.ts']);
    const v = buildVerification(report, countRuns(SAMPLE), 5);
    expect(v.repeatEach).toBe(5);
    expect(v.totals).toEqual({ runs: 7, passed: 4, failed: 2, skipped: 1, flaky: 1 });
    expect(v.files.map((f) => [f.output, f.runs])).toEqual([
      ['a/one.spec.ts', 4],
      ['b.spec.ts', 2],
      ['c.spec.ts', 0],
    ]);
    expect(v.unreported).toEqual(['extra.spec.ts']);
    expect(verificationPassed(v)).toBe(false);
  });

  it('passes only when a test passed and nothing failed', async () => {
    const report = await sampleReport(['x.spec.ts']);
    const ok = buildVerification(
      report,
      new Map([['x.spec.ts', { runs: 5, passed: 4, failed: 0, skipped: 1, flaky: 0 }]]),
      5,
    );
    expect(verificationPassed(ok)).toBe(true);
    expect(verificationPassed(buildVerification(report, new Map(), 5))).toBe(false);
    const onlySkipped = buildVerification(
      report,
      new Map([['x.spec.ts', { runs: 5, passed: 0, failed: 0, skipped: 5, flaky: 0 }]]),
      5,
    );
    expect(verificationPassed(onlySkipped)).toBe(false);
  });

  it('a report with verification matches the JSON schema and renders a Verification section', async () => {
    const report = await sampleReport(['a/one.spec.ts', 'b.spec.ts']);
    const withV = { ...report, verification: buildVerification(report, countRuns(SAMPLE), 5) };
    expect(
      validateRun(JSON.parse(renderReportJson(withV))),
      JSON.stringify(validateRun.errors),
    ).toBe(true);
    const md = renderReportMarkdown(withV);
    expect(md).toContain('## Verification');
    expect(md).toContain('| 7 | 4 | 2 | 1 | 1 |');
    expect(md).toContain('- extra.spec.ts');
    expect(renderReportMarkdown(report)).not.toContain('## Verification');
  });

  it('returns 1 when the folder has no playwright.config.ts', async () => {
    const dir = tempDir();
    const r = await cli('verify', dir);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no playwright.config.ts in');
  });

  it('returns 1 for an invalid --repeat-each', async () => {
    const r = await cli('verify', '--repeat-each', '0');
    expect(r.code).toBe(1);
    expect(r.err).toContain('invalid value for --repeat-each: 0');
  });

  it('runs Playwright, writes the counts into both reports and returns 1 when a run fails', async () => {
    const dir = tempDir();
    // These specs use no browser, so the test is fast and needs no network.
    writeFileSync(path.join(dir, 'playwright.config.ts'), renderPlaywrightConfig());
    writeFileSync(
      path.join(dir, 'pass.spec.ts'),
      "import { test, expect } from '@playwright/test';\ntest('adds', () => { expect(1 + 1).toBe(2); });\ntest.fixme('blocked', () => {});\n",
    );
    writeFileSync(
      path.join(dir, 'fail.spec.ts'),
      "import { test, expect } from '@playwright/test';\ntest('fails', () => { expect(1).toBe(2); });\n",
    );
    const report = await sampleReport(['fail.spec.ts', 'pass.spec.ts']);
    writeFileSync(path.join(dir, 'migration-report.json'), renderReportJson(report));
    const r = await cli('verify', dir, '--repeat-each', '2');
    expect(r.code).toBe(1);
    expect(r.out).toContain('fail.spec.ts: 0 passed, 2 failed, 0 skipped of 2 runs');
    expect(r.out).toContain('pass.spec.ts: 2 passed, 0 failed, 2 skipped of 4 runs');
    expect(r.out.split('\n').at(-1)).toBe(
      'Verified with --repeat-each=2: 6 runs, 2 passed, 2 failed, 2 skipped, 0 flaky.',
    );
    const updated = JSON.parse(
      readFileSync(path.join(dir, 'migration-report.json'), 'utf8'),
    ) as RunReport;
    expect(validateRun(updated), JSON.stringify(validateRun.errors)).toBe(true);
    expect(updated.verification?.totals).toEqual({
      runs: 6,
      passed: 2,
      failed: 2,
      skipped: 2,
      flaky: 0,
    });
    expect(readFileSync(path.join(dir, 'migration-report.md'), 'utf8')).toContain(
      '## Verification',
    );
  }, 60_000);
});
