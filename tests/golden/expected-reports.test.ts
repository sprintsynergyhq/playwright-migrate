import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MigrationFile } from '../../src/core/ir.js';
import { findInvariantProblems } from '../../src/core/invariants.js';
import { buildFileReport, toGoldenReport } from '../../src/core/report.js';
import type { GoldenReport } from '../../src/core/report.js';
import { SOURCE_FRAMEWORKS } from '../../src/core/types.js';
import type { SourceFramework } from '../../src/core/types.js';
import { loginLockedOutIr } from '../ir-fixtures/login-locked-out.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

const CASES: Record<string, () => Record<SourceFramework, MigrationFile>> = {
  'login-success': loginSuccessIr,
  'login-locked-out': loginLockedOutIr,
};

const caseDir = (id: string): string => join('fixtures/saucedemo/cases', id);
const reportPath = (id: string, fw: SourceFramework): string =>
  join(caseDir(id), 'expected', `${fw}.report.json`);

describe.each(Object.keys(CASES))('expected reports for %s', (id) => {
  const meta = JSON.parse(readFileSync(join(caseDir(id), 'case.json'), 'utf8')) as {
    sources: Record<SourceFramework, string>;
    expectCount: number;
  };
  const irs = CASES[id]!();

  it.each(SOURCE_FRAMEWORKS)('%s: hand-built IR passes the invariants', (fw) => {
    expect(findInvariantProblems(irs[fw])).toEqual([]);
  });

  it.each(SOURCE_FRAMEWORKS)('%s: golden report matches the expected file', (fw) => {
    const path = reportPath(id, fw);
    expect(existsSync(path)).toBe(true);
    const expected = JSON.parse(readFileSync(path, 'utf8')) as GoldenReport;
    expect(toGoldenReport(buildFileReport(irs[fw], null))).toEqual(expected);
  });

  it.each(SOURCE_FRAMEWORKS)('%s: expected report agrees with case.json', (fw) => {
    const expected = JSON.parse(readFileSync(reportPath(id, fw), 'utf8')) as GoldenReport;
    expect(expected.source).toBe(meta.sources[fw]);
    expect(expected.framework).toBe(fw);
    expect(expected.counts.outputExpects).toBe(meta.expectCount);
  });
});
