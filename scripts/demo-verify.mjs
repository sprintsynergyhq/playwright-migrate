#!/usr/bin/env node
// Converts the SauceDemo cases once per source framework into .demo/<framework> and runs
// `verify` on each folder. Run `npm run build` first. Exits with 1 if any step fails.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const FRAMEWORKS = ['cypress-js', 'selenium-python', 'selenium-java'];

function cli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}`.trim().split('\n') };
}

let failed = false;
for (const framework of FRAMEWORKS) {
  const out = `.demo/${framework}`;
  const migrate = cli([
    'migrate',
    'fixtures/saucedemo/cases',
    '--from',
    framework,
    '--out',
    out,
    '--force',
  ]);
  console.log(`${framework}: migrate exit ${migrate.code}. ${migrate.out.at(-1)}`);
  const verify = cli(['verify', out]);
  console.log(`${framework}: verify exit ${verify.code}. ${verify.out.at(-1)}`);
  if (migrate.code !== 0 || verify.code !== 0) {
    failed = true;
    console.log(verify.out.join('\n'));
  }
}
process.exitCode = failed ? 1 : 0;
