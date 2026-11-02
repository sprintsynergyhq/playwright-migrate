import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli.js';
import { MigrationError, planMigration } from '../../src/core/migrate.js';
import { specFileName } from '../../src/sources/index.js';
import { FIXTURES_DIR, listSourceFiles } from '../golden/harness.js';

const SOURCES = listSourceFiles();
const tempDir = (): string => mkdtempSync(path.join(tmpdir(), 'pwm-folder-'));

async function cli(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(['node', 'playwright-migrate', ...args], {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function outputPathFor(source: { path: string; framework: Parameters<typeof specFileName>[0] }) {
  const dir = path.posix.dirname(source.path);
  return `${dir}/${specFileName(source.framework, path.posix.basename(source.path))}`;
}

function listFiles(root: string, rel = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(root, child));
    else found.push(child);
  }
  return found.sort();
}

describe('migrate on a folder', () => {
  it('plans one spec per source file, mirrored and sorted, plus the config and reports', async () => {
    const plan = await planMigration(FIXTURES_DIR);
    const expected = [
      ...SOURCES.map(outputPathFor),
      'migration-report.json',
      'migration-report.md',
      'playwright.config.ts',
    ].sort();
    expect(plan.mode).toBe('folder');
    expect(plan.files.map((f) => f.path)).toEqual(expected);
    expect(plan.skipped).toEqual([]);
    expect(plan.report.files.map((f) => f.source)).toEqual(SOURCES.map((s) => s.path));
  });

  it('each spec matches the expected spec except the header, which names the relative source', async () => {
    const plan = await planMigration(FIXTURES_DIR);
    for (const source of SOURCES) {
      const spec = plan.files.find((f) => f.path === outputPathFor(source));
      const caseDir = path.join(FIXTURES_DIR, ...source.path.split('/').slice(0, 2));
      const expected = readFileSync(
        path.join(caseDir, 'expected', `${source.framework}.spec.ts`),
        'utf8',
      );
      const lines = spec?.content.split('\n') ?? [];
      expect(lines[0]).toBe(`// Migrated from: ${source.path}`);
      expect(lines.slice(1)).toEqual(expected.split('\n').slice(1));
    }
  });

  it('gives the same plan on a second run', async () => {
    const first = await planMigration(FIXTURES_DIR);
    const second = await planMigration(FIXTURES_DIR);
    expect(second.files).toEqual(first.files);
  });

  it('writes the project and returns 2 because some fixtures are blocked', async () => {
    const out = path.join(tempDir(), 'out');
    const r = await cli('migrate', FIXTURES_DIR, '--out', out);
    expect(r.code).toBe(2);
    const plan = await planMigration(FIXTURES_DIR);
    expect(listFiles(out)).toEqual(plan.files.map((f) => f.path));
    const config = readFileSync(path.join(out, 'playwright.config.ts'), 'utf8');
    expect(config).toContain("testMatch: '**/*.spec.ts'");
    const report = JSON.parse(readFileSync(path.join(out, 'migration-report.json'), 'utf8')) as {
      summary: { files: number };
      exitCode: number;
    };
    expect(report.summary.files).toBe(SOURCES.length);
    expect(report.exitCode).toBe(2);
    expect(r.out.split('\n').at(-1)).toMatch(/^Files: \d+ .*Exit code 2\.$/);
  });

  it('--dry-run writes nothing and lists every planned file', async () => {
    const out = path.join(tempDir(), 'not-created');
    const r = await cli('migrate', FIXTURES_DIR, '--out', out, '--dry-run');
    expect(r.code).toBe(2);
    expect(existsSync(out)).toBe(false);
    const plan = await planMigration(FIXTURES_DIR);
    for (const file of plan.files) {
      expect(r.out).toContain(`Would write ${path.join(out, file.path)}`);
    }
  });

  it('without --force, lists existing files, writes nothing and returns 1', async () => {
    const out = path.join(tempDir(), 'out');
    expect((await cli('migrate', FIXTURES_DIR, '--out', out)).code).toBe(2);
    const config = path.join(out, 'playwright.config.ts');
    writeFileSync(config, '// edited by hand\n', 'utf8');
    const r = await cli('migrate', FIXTURES_DIR, '--out', out);
    expect(r.code).toBe(1);
    expect(r.err).toContain('output file(s) already exist');
    expect(r.err).toContain('  playwright.config.ts');
    expect(r.err).toContain('Use --force');
    expect(readFileSync(config, 'utf8')).toBe('// edited by hand\n');
  });

  it('with --force, overwrites existing files', async () => {
    const out = path.join(tempDir(), 'out');
    expect((await cli('migrate', FIXTURES_DIR, '--out', out)).code).toBe(2);
    const config = path.join(out, 'playwright.config.ts');
    writeFileSync(config, '// edited by hand\n', 'utf8');
    const r = await cli('migrate', FIXTURES_DIR, '--out', out, '--force');
    expect(r.code).toBe(2);
    expect(readFileSync(config, 'utf8')).toContain('defineConfig');
  });

  it('the overwrite check also applies to a single file', async () => {
    const out = tempDir();
    const file = path.join(
      FIXTURES_DIR,
      'cases',
      'login-success',
      'cypress-js',
      'login-success.cy.js',
    );
    expect((await cli('migrate', file, '--out', out)).code).toBe(0);
    const again = await cli('migrate', file, '--out', out);
    expect(again.code).toBe(1);
    expect(again.err).toContain('  login-success.spec.ts');
    expect((await cli('migrate', file, '--out', out, '--force')).code).toBe(0);
  });

  it('--from limits a folder to one framework and lists the rest as skipped', async () => {
    const plan = await planMigration(FIXTURES_DIR, { from: 'selenium-java' });
    const javaSources = SOURCES.filter((s) => s.framework === 'selenium-java');
    expect(plan.report.files.map((f) => f.source)).toEqual(javaSources.map((s) => s.path));
    expect(plan.skipped).toHaveLength(SOURCES.length - javaSources.length);
    expect(plan.skipped[0]?.reason).toMatch(
      /^detected (cypress-js|selenium-python), not selenium-java$/,
    );
  });

  it('lists files with no supported framework as skipped', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'login.cy.js'), "it('a', () => { cy.visit('/'); });\n");
    writeFileSync(path.join(dir, 'notes.js'), 'export const x = 1;\n');
    const r = await cli('migrate', dir, '--out', path.join(dir, 'out'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('Skipped notes.js: no supported framework detected');
  });

  it('returns 1 when two sources would write the same spec', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'login.cy.js'), "it('a', () => { cy.visit('/'); });\n");
    writeFileSync(path.join(dir, 'login.js'), "it('b', () => { cy.visit('/'); });\n");
    await expect(planMigration(dir)).rejects.toThrow(MigrationError);
    const r = await cli('migrate', dir, '--out', path.join(dir, 'out'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('login.cy.js and login.js would both be written to login.spec.ts');
  });

  it('returns 1 when a folder has no convertible files', async () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'empty'));
    const r = await cli('migrate', dir);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no convertible test files found');
  });
});
