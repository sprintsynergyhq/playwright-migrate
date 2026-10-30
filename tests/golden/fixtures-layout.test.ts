import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectSource } from '../../src/core/detect.js';
import { SOURCE_FRAMEWORKS } from '../../src/core/types.js';
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

const cases = listCases();
const flags = listFlags();

// Update these lists when a PR adds a case or a flag fixture.
const CASE_IDS = [
  'add-to-cart',
  'cart-badge',
  'checkout-complete',
  'login-locked-out',
  'login-success',
  'sort-products',
];
const FLAG_IDS = ['cy-custom-command', 'cy-iframe', 'cy-intercept', 'cy-then', 'cy-wait-time'];

function readLf(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

describe('SauceDemo fixture layout', () => {
  it('has exactly the listed cases', () => {
    expect(cases.map((c) => c.id)).toEqual(CASE_IDS);
  });

  it('has a Cypress expected report for every case', () => {
    for (const c of cases) expect(existsSync(expectedReportPath(c, 'cypress-js'))).toBe(true);
  });

  for (const c of cases) {
    describe(c.id, () => {
      for (const framework of SOURCE_FRAMEWORKS) {
        describe(framework, () => {
          const source = sourcePath(c, framework);
          const spec = expectedSpecPath(c, framework);

          it('has the source file listed in case.json', () => {
            expect(existsSync(source)).toBe(true);
          });

          it('detects the source file as the expected framework', () => {
            const detection = detectSource(source, readLf(source));
            expect(detection.framework).toBe(framework);
          });

          it('has an expected spec with the migration header and Playwright import', () => {
            expect(existsSync(spec)).toBe(true);
            const lines = readLf(spec).split('\n');
            expect(lines[0]).toBe(`// Migrated from: ${c.meta.sources[framework]}`);
            expect(lines[1]).toBe("import { test, expect } from '@playwright/test';");
            expect(lines[2]).toBe('');
          });

          it('has expectCount expect( calls in the expected spec', () => {
            const count = readLf(spec).match(/\bexpect\(/g)?.length ?? 0;
            expect(count).toBe(c.meta.expectCount);
          });

          it('has no waitForTimeout, no test.only and no unawaited expect(', () => {
            const text = readLf(spec);
            expect(text).not.toContain('waitForTimeout');
            expect(text).not.toContain('test.only');
            for (const match of text.matchAll(/\bexpect\(/g)) {
              const before = text.slice(0, match.index);
              expect(before.endsWith('await ')).toBe(true);
            }
          });
        });
      }
    });
  }
});

describe('SauceDemo flag fixtures', () => {
  it('has exactly the listed flag fixtures', () => {
    expect(flags.map((f) => f.id)).toEqual(FLAG_IDS);
  });

  for (const f of flags) {
    describe(f.id, () => {
      const source = flagSourcePath(f);
      const spec = flagSpecPath(f);
      const report = flagReportPath(f);

      it('has a source file that detects as the listed framework', () => {
        expect(existsSync(source)).toBe(true);
        expect(detectSource(source, readLf(source)).framework).toBe(f.meta.framework);
      });

      it('has an expected spec with the migration header', () => {
        const lines = readLf(spec).split('\n');
        expect(lines[0]).toBe(`// Migrated from: ${f.meta.source}`);
        expect(lines[1]).toMatch(/^import \{ test(, expect)? \} from '@playwright\/test';$/);
        expect(readLf(spec)).not.toContain('test.only');
      });

      it('uses test.fixme only when blocked, and runnable says the same', () => {
        const blocked = f.meta.expectedStatus === 'blocked';
        expect(readLf(spec).includes('test.fixme(')).toBe(blocked);
        expect(f.meta.runnable).toBe(!blocked);
      });

      it('has an expected report that agrees with case.json', () => {
        const golden = JSON.parse(readLf(report)) as GoldenReport;
        expect(golden.source).toBe(f.meta.source);
        expect(golden.framework).toBe(f.meta.framework);
        expect(golden.status).toBe(f.meta.expectedStatus);
        const rules = [
          ...new Set(golden.flags.filter((x) => x.level !== 'INFO').map((x) => x.ruleId)),
        ].sort();
        expect(rules).toEqual([...f.meta.rules].sort());
      });

      it('prints every WARN and BLOCK flag as a comment in the expected spec', () => {
        const golden = JSON.parse(readLf(report)) as GoldenReport;
        for (const flag of golden.flags.filter((x) => x.level !== 'INFO')) {
          expect(readLf(spec)).toContain(`// playwright-migrate ${flag.level} ${flag.ruleId}: `);
        }
      });
    });
  }
});
