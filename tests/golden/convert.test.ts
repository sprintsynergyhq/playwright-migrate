// Golden convert-and-compare: each source of every framework that can be converted is converted
// and compared byte for byte with the hand-written expected spec, and with the hand-written
// expected report.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertSource } from '../../src/core/convert.js';
import { toGoldenReport } from '../../src/core/report.js';
import type { GoldenReport } from '../../src/core/report.js';
import type { SourceFramework } from '../../src/core/types.js';
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

// Selenium Java is added here in PR 7.
const CONVERTED: SourceFramework[] = ['cypress-js', 'selenium-python'];

type Golden = {
  id: string;
  framework: SourceFramework;
  source: string;
  sourceFile: string;
  specFile: string;
  reportFile: string;
};

const goldens: Golden[] = [
  ...CONVERTED.flatMap((framework) =>
    listCases().map((c) => ({
      id: `cases/${c.id}`,
      framework,
      source: c.meta.sources[framework],
      sourceFile: sourcePath(c, framework),
      specFile: expectedSpecPath(c, framework),
      reportFile: expectedReportPath(c, framework),
    })),
  ),
  ...listFlags()
    .filter((f) => CONVERTED.includes(f.meta.framework))
    .map((f) => ({
      id: `flags/${f.id}`,
      framework: f.meta.framework,
      source: f.meta.source,
      sourceFile: flagSourcePath(f),
      specFile: flagSpecPath(f),
      reportFile: flagReportPath(f),
    })),
];

describe.each(goldens)('convert $framework $id', (g) => {
  it('emits the expected spec byte for byte', async () => {
    const result = await convertSource(g.framework, g.source, readLf(g.sourceFile), null);
    expect(result.spec).toBe(readLf(g.specFile));
  });

  it('builds the expected report', async () => {
    const result = await convertSource(g.framework, g.source, readLf(g.sourceFile), null);
    const expected = JSON.parse(readLf(g.reportFile)) as GoldenReport;
    expect(toGoldenReport(result.report)).toEqual(expected);
  });

  it('gives the same output on a second run', async () => {
    const text = readLf(g.sourceFile);
    const a = await convertSource(g.framework, g.source, text, null);
    const b = await convertSource(g.framework, g.source, text, null);
    expect(b.spec).toBe(a.spec);
    expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
  });
});
