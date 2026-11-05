import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { releaseProblems, REPOSITORY_URL } from '../../scripts/check-release.mjs';

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  publishConfig?: { access?: string };
  repository?: { type: string; url: string };
  files: string[];
  bin: Record<string, string>;
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const tag = `v${pkg.version}`;

function runCheck(arg: string) {
  return spawnSync(process.execPath, ['scripts/check-release.mjs', arg], { encoding: 'utf8' });
}

describe('release', () => {
  it('is ready to publish version 0.1.0', () => {
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    expect(pkg.repository).toEqual({ type: 'git', url: REPOSITORY_URL });
    expect(pkg.files).toContain('CHANGELOG.md');
    expect(pkg.bin).toEqual({ 'playwright-migrate': 'dist/cli.js' });
    expect(releaseProblems({ tag, pkg, changelog })).toEqual([]);
  });

  it('reports each problem that stops a release', () => {
    const broken = { ...pkg, private: true, publishConfig: {}, repository: undefined };
    const problems = releaseProblems({ tag: 'v9.9.9', pkg: broken, changelog: '# Changelog\n' });
    expect(problems).toHaveLength(5);
    expect(problems[0]).toContain('Expected v0.1.0');
    expect(problems.join('\n')).toMatch(/private.*\n.*access.*\n.*repository.*\n.*## 0\.1\.0/);
  });

  it('rejects a version that is not plain x.y.z', () => {
    const problems = releaseProblems({
      tag: 'v0.1.0-beta.1',
      pkg: { ...pkg, version: '0.1.0-beta.1' },
      changelog,
    });
    expect(problems.some((p) => p.includes('not a plain x.y.z version'))).toBe(true);
  });

  it('exits 0 for the matching tag and 1 for any other tag', () => {
    const ok = runCheck(tag);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain(`Release check passed for @sprintsynergy/playwright-migrate@0.1.0`);
    const bad = runCheck('v0.1.1');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('does not match the package.json version');
  });

  it('publishes only from a v tag, with provenance and the release check first', () => {
    expect(workflow).toMatch(/^on:\n {2}push:\n {4}tags: \['v\*'\]\n/m);
    expect(workflow).not.toMatch(/pull_request|workflow_dispatch|workflow_call/);
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('npm publish --provenance --access public');
    expect(workflow).toContain('npm view "$spec" version');
    expect(workflow).toContain("require('./package.json').version");
    expect(workflow).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    expect(workflow).toContain('grep -q E404');
    expect(workflow).toContain('Skipping publish.');
    expect(workflow.indexOf('npm view')).toBeLessThan(workflow.indexOf('npm publish'));
    expect(workflow).toContain("if: github.repository == 'sprintsynergyhq/playwright-migrate'");
    expect(workflow).toContain('persist-credentials: false');
    const uses = workflow.match(/uses: \S+/g) ?? [];
    expect(uses.length).toBe(2);
    for (const ref of uses) expect(ref).toMatch(/@[0-9a-f]{40}$/);
    const order = [
      'npm run release:check',
      'npm run check',
      'npm run test:pack',
      'npm run e2e:expected:5x',
      'npm run demo:verify',
      'npm publish',
    ].map((step) => workflow.indexOf(step));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('has a CHANGELOG entry for this version and links it from the README', () => {
    expect(changelog.split('\n')).toContain(`## ${pkg.version}`);
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('[CHANGELOG.md](CHANGELOG.md)');
    expect(readme).toContain('npm install -D @sprintsynergy/playwright-migrate');
    expect(readme).not.toContain('not published yet');
  });
});
