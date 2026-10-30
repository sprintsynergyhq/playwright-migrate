import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectSource } from '../../src/core/detect.js';
import { SOURCE_FRAMEWORKS } from '../../src/core/types.js';
import { expectedSpecPath, listCases, sourcePath } from './harness.js';

const cases = listCases();

function readLf(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

describe('SauceDemo fixture layout', () => {
  it('has exactly the 2 expected cases', () => {
    expect(cases.map((c) => c.id)).toEqual(['login-locked-out', 'login-success']);
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
