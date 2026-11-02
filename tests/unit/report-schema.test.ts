import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { buildFileReport, buildRunReport, toGoldenReport } from '../../src/core/report.js';
import { loginLockedOutIr } from '../ir-fixtures/login-locked-out.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

const load = (p: string): object => JSON.parse(readFileSync(p, 'utf8')) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateRun = ajv.compile(load('schemas/migration-report.schema.json'));
const validateGolden = ajv.compile(load('schemas/golden-report.schema.json'));

const files = [...Object.values(loginSuccessIr()), ...Object.values(loginLockedOutIr())];

describe('report JSON schemas', () => {
  it('accepts a run report built from the login fixtures', () => {
    const run = buildRunReport(
      'fixtures/saucedemo',
      '0.0.0',
      files.map((f) => buildFileReport(f, null)),
    );
    expect(validateRun(run), JSON.stringify(validateRun.errors)).toBe(true);
  });

  it('accepts every golden projection', () => {
    for (const f of files) {
      const golden = toGoldenReport(buildFileReport(f, null));
      expect(validateGolden(golden), JSON.stringify(validateGolden.errors)).toBe(true);
    }
  });

  it('rejects a run report with an unknown field', () => {
    const run = buildRunReport('x', '0.0.0', []);
    expect(validateRun({ ...run, extra: true })).toBe(false);
  });

  it('rejects a flag with a bad level', () => {
    const report = buildFileReport(files[0]!, null);
    const golden = toGoldenReport(report);
    expect(
      validateGolden({ ...golden, flags: [{ level: 'ERROR', ruleId: 'CORE_XPATH', line: 1 }] }),
    ).toBe(false);
  });
});
