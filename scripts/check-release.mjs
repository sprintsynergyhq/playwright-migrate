// Checks that the package is ready to publish for a release tag, for example v0.1.0.
// Usage: node scripts/check-release.mjs <tag>. Without an argument it reads GITHUB_REF_NAME.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPOSITORY_URL = 'git+https://github.com/sprintsynergyhq/playwright-migrate.git';

/**
 * Returns the problems that stop `tag` from being published. An empty list means it is ready.
 * @param {{ tag: string, pkg: Record<string, any>, changelog: string }} input
 * @returns {string[]}
 */
export function releaseProblems({ tag, pkg, changelog }) {
  const problems = [];
  const version = String(pkg.version ?? '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    problems.push(`package.json version "${version}" is not a plain x.y.z version.`);
  }
  if (tag !== `v${version}`) {
    problems.push(`Tag "${tag}" does not match the package.json version. Expected v${version}.`);
  }
  if (pkg.private === true) {
    problems.push('package.json has "private": true.');
  }
  if (pkg.publishConfig?.access !== 'public') {
    problems.push('package.json needs "publishConfig": { "access": "public" }.');
  }
  if (pkg.repository?.url !== REPOSITORY_URL) {
    problems.push(`package.json repository.url must be ${REPOSITORY_URL} for provenance.`);
  }
  const lines = changelog.split('\n');
  if (!lines.includes(`## ${version}`)) {
    problems.push(`CHANGELOG.md has no "## ${version}" heading.`);
  }
  return problems;
}

function main() {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  if (!tag) {
    console.error('Pass the release tag, for example: node scripts/check-release.mjs v0.1.0');
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const problems = releaseProblems({ tag, pkg, changelog });
  for (const problem of problems) console.error(`Release check: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(`Release check passed for ${pkg.name}@${pkg.version} (tag ${tag}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
