import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli.js';
import { REPO_ROOT } from '../golden/harness.js';

const FIXTURES = path.join(REPO_ROOT, 'fixtures', 'saucedemo');

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
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('cypress-js\tcases/login-locked-out/cypress-js/login-locked-out.cy.js');
    expect(lines[6]).toBe(
      'Detected 6 file(s): cypress-js 2, selenium-python 2, selenium-java 2, unknown 0',
    );
    expect(r.err).toBe('');
  });

  it('detect --json prints valid JSON with 6 entries', async () => {
    const r = await cli('detect', FIXTURES, '--json');
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out) as unknown[];
    expect(parsed).toHaveLength(6);
    expect(r.out).not.toContain('Detected');
  });

  it('detect on a missing path returns 1 with path not found', async () => {
    const r = await cli('detect', 'does-not-exist');
    expect(r.code).toBe(1);
    expect(r.err).toBe('Error: path not found: does-not-exist');
  });

  it('migrate returns 1 and says conversion is not implemented', async () => {
    const r = await cli('migrate', FIXTURES);
    expect(r.code).toBe(1);
    expect(r.err).toContain('not implemented');
  });

  it('migrate with an invalid --from returns 1 and lists the valid values', async () => {
    const r = await cli('migrate', FIXTURES, '--from', 'selenium-ruby');
    expect(r.code).toBe(1);
    expect(r.err).toContain('selenium-ruby');
    expect(r.err).toContain('cypress-js, selenium-python, selenium-java');
    expect(r.err).not.toContain('not implemented');
  });

  it('returns 1 for an unknown command', async () => {
    const r = await cli('convert');
    expect(r.code).toBe(1);
  });
});
