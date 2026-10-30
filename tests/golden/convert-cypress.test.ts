// Golden convert-and-compare for Cypress: each source is converted and compared byte for byte
// with the hand-written expected spec, and with the hand-written expected report.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertSource } from '../../src/core/convert.js';
import { toGoldenReport } from '../../src/core/report.js';
import type { GoldenReport } from '../../src/core/report.js';
import {
  expectedReportPath,
  expectedSpecPath,
  flagReportPath,
  flagSourcePath,
  flagSpecPath,
  listCases,
  listFlags,
  sourcePath,
} from './harness.js';

const readLf = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

type Golden = {
  id: string;
  source: string;
  sourceFile: string;
  specFile: string;
  reportFile: string;
};

const goldens: Golden[] = [
  ...listCases().map((c) => ({
    id: `cases/${c.id}`,
    source: c.meta.sources['cypress-js'],
    sourceFile: sourcePath(c, 'cypress-js'),
    specFile: expectedSpecPath(c, 'cypress-js'),
    reportFile: expectedReportPath(c, 'cypress-js'),
  })),
  ...listFlags()
    .filter((f) => f.meta.framework === 'cypress-js')
    .map((f) => ({
      id: `flags/${f.id}`,
      source: f.meta.source,
      sourceFile: flagSourcePath(f),
      specFile: flagSpecPath(f),
      reportFile: flagReportPath(f),
    })),
];

describe.each(goldens)('convert cypress-js $id', (g) => {
  it('emits the expected spec byte for byte', async () => {
    const result = await convertSource('cypress-js', g.source, readLf(g.sourceFile), null);
    expect(result.spec).toBe(readLf(g.specFile));
  });

  it('builds the expected report', async () => {
    const result = await convertSource('cypress-js', g.source, readLf(g.sourceFile), null);
    const expected = JSON.parse(readLf(g.reportFile)) as GoldenReport;
    expect(toGoldenReport(result.report)).toEqual(expected);
  });

  it('gives the same output on a second run', async () => {
    const text = readLf(g.sourceFile);
    const a = await convertSource('cypress-js', g.source, text, null);
    const b = await convertSource('cypress-js', g.source, text, null);
    expect(b.spec).toBe(a.spec);
    expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
  });
});
