import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli.js';
import { REPO_ROOT, listSourceFiles } from '../golden/harness.js';

const FIXTURES = path.join(REPO_ROOT, 'fixtures', 'saucedemo');
const SOURCES = listSourceFiles();
const countOf = (fw: string): number => SOURCES.filter((s) => s.framework === fw).length;
const LOGIN_CY = path.join(FIXTURES, 'cases', 'login-success', 'cypress-js', 'login-success.cy.js');
const CUSTOM_CY = path.join(
  FIXTURES,
  'flags',
  'cy-custom-command',
  'cypress-js',
  'custom-command.cy.js',
);
const LOGIN_PY = path.join(
  FIXTURES,
  'cases',
  'login-success',
  'selenium-python',
  'test_login_success.py',
);
const LOGIN_JAVA = path.join(
  FIXTURES,
  'cases',
  'login-success',
  'selenium-java',
  'LoginSuccessTest.java',
);

const tempDir = (): string => mkdtempSync(path.join(tmpdir(), 'pwm-cli-'));

async function cli(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(['node', 'playwright-migrate', ...args], {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('cli', () => {
  it('--version prints the package.json version and returns 0', async () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };
    const r = await cli('--version');
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(pkg.version);
  });

  it('--help lists detect and migrate and returns 0', async () => {
    const r = await cli('--help');
    expect(r.code).toBe(0);
    expect(r.out).toContain('detect');
    expect(r.out).toContain('migrate');
  });

  it('detect prints one line per file and the summary, returns 0', async () => {
    const r = await cli('detect', FIXTURES);
    expect(r.code).toBe(0);
    const lines = r.out.split('\n');
    expect(lines).toHaveLength(SOURCES.length + 1);
    expect(lines.slice(0, -1)).toEqual(SOURCES.map((s) => `${s.framework}\t${s.path}`));
    expect(lines.at(-1)).toBe(
      `Detected ${SOURCES.length} file(s): cypress-js ${countOf('cypress-js')}, ` +
        `selenium-python ${countOf('selenium-python')}, selenium-java ${countOf('selenium-java')}, unknown 0`,
    );
    expect(r.err).toBe('');
  });

  it('detect --json prints valid JSON with one entry per source file', async () => {
    const r = await cli('detect', FIXTURES, '--json');
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out) as unknown[];
    expect(parsed).toHaveLength(SOURCES.length);
    expect(r.out).not.toContain('Detected');
  });

  it('detect on a missing path returns 1 with path not found', async () => {
    const r = await cli('detect', 'does-not-exist');
    expect(r.code).toBe(1);
    expect(r.err).toBe('Error: path not found: does-not-exist');
  });

  it('migrate converts one Cypress file and writes the spec and both reports', async () => {
    const out = tempDir();
    const r = await cli('migrate', LOGIN_CY, '--out', out);
    expect(r.code).toBe(0);
    const expected = readFileSync(
      path.join(FIXTURES, 'cases', 'login-success', 'expected', 'cypress-js.spec.ts'),
      'utf8',
    );
    const spec = readFileSync(path.join(out, 'login-success.spec.ts'), 'utf8');
    // The header names the source file by its base name, so only the rest is compared.
    expect(spec.split('\n')[0]).toBe('// Migrated from: login-success.cy.js');
    expect(spec.split('\n').slice(1)).toEqual(expected.split('\n').slice(1));
    const report = JSON.parse(readFileSync(path.join(out, 'migration-report.json'), 'utf8')) as {
      exitCode: number;
      files: Array<{ status: string; output: string }>;
    };
    expect(report.exitCode).toBe(0);
    expect(report.files[0]?.status).toBe('converted');
    expect(report.files[0]?.output).toBe('login-success.spec.ts');
    expect(existsSync(path.join(out, 'migration-report.md'))).toBe(true);
    expect(r.out).toContain('login-success.cy.js: converted');
  });

  it('migrate returns 2 when a test is blocked', async () => {
    const out = tempDir();
    const r = await cli('migrate', CUSTOM_CY, '--out', out);
    expect(r.code).toBe(2);
    expect(readFileSync(path.join(out, 'custom-command.spec.ts'), 'utf8')).toContain('test.fixme(');
  });

  it('migrate --dry-run writes nothing', async () => {
    const out = path.join(tempDir(), 'not-created');
    const r = await cli('migrate', LOGIN_CY, '--out', out, '--dry-run');
    expect(r.code).toBe(0);
    expect(existsSync(out)).toBe(false);
    expect(r.out).toContain('Would write');
  });

  it('migrate --help lists --force and names all three sources', async () => {
    const r = await cli('migrate', '--help');
    expect(r.code).toBe(0);
    expect(r.out).toContain('--force');
    for (const source of ['Cypress JS', 'Selenium Python', 'Selenium Java']) {
      expect(r.out).toContain(source);
    }
  });

  it('migrate on a Selenium Python file writes the expected spec', async () => {
    const out = tempDir();
    const r = await cli('migrate', LOGIN_PY, '--out', out);
    expect(r.code).toBe(0);
    const expected = readFileSync(
      path.join(FIXTURES, 'cases', 'login-success', 'expected', 'selenium-python.spec.ts'),
      'utf8',
    );
    const spec = readFileSync(path.join(out, 'test_login_success.spec.ts'), 'utf8');
    expect(spec.split('\n')[0]).toBe('// Migrated from: test_login_success.py');
    expect(spec.split('\n').slice(1)).toEqual(expected.split('\n').slice(1));
    expect(r.out).toContain('test_login_success.py: converted');
  });

  it('migrate on a Selenium Java file writes the expected spec', async () => {
    const out = tempDir();
    const r = await cli('migrate', LOGIN_JAVA, '--out', out);
    expect(r.code).toBe(0);
    const expected = readFileSync(
      path.join(FIXTURES, 'cases', 'login-success', 'expected', 'selenium-java.spec.ts'),
      'utf8',
    );
    const spec = readFileSync(path.join(out, 'LoginSuccessTest.spec.ts'), 'utf8');
    expect(spec.split('\n')[0]).toBe('// Migrated from: LoginSuccessTest.java');
    expect(spec.split('\n').slice(1)).toEqual(expected.split('\n').slice(1));
    expect(r.out).toContain('LoginSuccessTest.java: converted');
  });

  it('migrate on a file that cannot be detected returns 1', async () => {
    const file = path.join(tempDir(), 'notes.md');
    writeFileSync(file, '# Notes\n');
    const r = await cli('migrate', file);
    expect(r.code).toBe(1);
    expect(r.err).toContain('could not detect the source framework');
  });

  it('migrate on a missing file returns 1 with path not found', async () => {
    const r = await cli('migrate', 'does-not-exist.cy.js');
    expect(r.code).toBe(1);
    expect(r.err).toBe('Error: path not found: does-not-exist.cy.js');
  });

  it('migrate with an invalid --from returns 1 and lists the valid values', async () => {
    const r = await cli('migrate', FIXTURES, '--from', 'selenium-ruby');
    expect(r.code).toBe(1);
    expect(r.err).toContain('selenium-ruby');
    expect(r.err).toContain('cypress-js, selenium-python, selenium-java');
    expect(r.err).not.toContain('not supported yet');
  });

  it('returns 1 for an unknown command', async () => {
    const r = await cli('convert');
    expect(r.code).toBe(1);
  });
});
