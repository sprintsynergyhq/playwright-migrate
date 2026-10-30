import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MigrationFile } from '../../src/core/ir.js';
import { SOURCE_FRAMEWORKS } from '../../src/core/types.js';
import type { SourceFramework } from '../../src/core/types.js';
import { emitPlaywright } from '../../src/emit/playwright.js';
import { loginLockedOutIr } from '../ir-fixtures/login-locked-out.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

const CASES: Record<string, () => Record<SourceFramework, MigrationFile>> = {
  'login-success': loginSuccessIr,
  'login-locked-out': loginLockedOutIr,
};

describe.each(Object.keys(CASES))('emitter output for %s', (id) => {
  it.each(SOURCE_FRAMEWORKS)(
    '%s: hand-built IR emits the expected spec byte for byte',
    async (fw) => {
      const expected = readFileSync(
        join('fixtures/saucedemo/cases', id, 'expected', `${fw}.spec.ts`),
        'utf8',
      );
      expect(await emitPlaywright(CASES[id]!()[fw])).toBe(expected);
    },
  );
});
