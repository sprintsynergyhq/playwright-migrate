#!/usr/bin/env node
// Builds and packs the package, checks the packed file list for stale build output,
// installs the tarball into a temp folder, imports the public API by package name and
// runs the installed bin. Needs network access, because npm installs the runtime
// dependencies.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStaleDistFiles } from './pack-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// Run npm through node and npm's own JavaScript entry point when npm started this script,
// so no shell and no .cmd file is spawned on Windows.
const NPM_CLI = process.env.npm_execpath;
const IS_WINDOWS = process.platform === 'win32';
const FIXTURE = path.join(
  ROOT,
  'fixtures',
  'saucedemo',
  'cases',
  'login-success',
  'cypress-js',
  'login-success.cy.js',
);

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' });
}

function npm(args, cwd) {
  if (NPM_CLI && /\.c?js$/.test(NPM_CLI)) return run(process.execPath, [NPM_CLI, ...args], cwd);
  check(!IS_WINDOWS, 'run this script with npm run test:pack on Windows');
  return run('npm', args, cwd);
}

function check(condition, message) {
  if (!condition) {
    console.error(`Pack test failed: ${message}`);
    process.exit(1);
  }
}

function listSrc(dir = 'src') {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? listSrc(rel) : [rel];
  });
}

// A file left in dist/ by an earlier build must not survive the next build.
mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const planted = path.join(ROOT, 'dist', 'stale-pack-check.js');
writeFileSync(planted, '// left over from an earlier build\n');
npm(['run', 'build', '--silent'], ROOT);
check(!existsSync(planted), 'npm run build did not remove an old file from dist/');

const work = mkdtempSync(path.join(tmpdir(), 'pwm-pack-'));
try {
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', work], ROOT));
  const tarball = path.join(work, packed[0].filename);
  console.log(`Packed ${packed[0].filename}: ${packed[0].entryCount} files`);
  const stale = findStaleDistFiles(
    packed[0].files.map((f) => f.path),
    listSrc(),
  );
  check(stale.length === 0, `stale files in the package: ${stale.join(', ')}`);
  console.log('No stale dist files in the package.');

  const app = path.join(work, 'app');
  mkdirSync(app);
  writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({ name: 'pack-test', private: true, type: 'module' }, null, 2),
  );
  npm(['install', tarball, '--no-audit', '--no-fund', '--loglevel=error'], app);
  console.log(`Installed the tarball into ${app}`);

  const probe = [
    `import * as api from '${pkg.name}';`,
    `import { readFileSync } from 'node:fs';`,
    `const names = ['getVersion', 'detectSource', 'convertSource', 'planMigration', 'RULES'];`,
    `const missing = names.filter((n) => !(n in api));`,
    `if (missing.length > 0) throw new Error('missing exports: ' + missing.join(', '));`,
    `const text = readFileSync(${JSON.stringify(FIXTURE)}, 'utf8');`,
    `const c = await api.convertSource('cypress-js', 'login-success.cy.js', text, 'login-success.spec.ts');`,
    `console.log('import ok: version ' + api.getVersion() + ', status ' + c.report.status);`,
  ].join('\n');
  writeFileSync(path.join(app, 'probe.mjs'), probe);
  const probeOut = run('node', ['probe.mjs'], app).trim();
  console.log(probeOut);
  check(
    probeOut === `import ok: version ${pkg.version}, status converted`,
    'unexpected import result',
  );

  check(
    existsSync(path.join(app, 'node_modules', ...pkg.name.split('/'), 'dist', 'index.d.ts')),
    'dist/index.d.ts is not in the package',
  );

  // On Windows the .bin entry is a .cmd shim, so run the installed bin file with node instead.
  const installed = path.join(app, 'node_modules', ...pkg.name.split('/'));
  const binFile = path.join(installed, pkg.bin['playwright-migrate']);
  const runBin = (args) =>
    IS_WINDOWS
      ? run(process.execPath, [binFile, ...args], app)
      : run(path.join(app, 'node_modules', '.bin', 'playwright-migrate'), args, app);
  const version = runBin(['--version']).trim();
  check(version === pkg.version, `bin --version printed ${version}`);
  const out = path.join(work, 'out');
  const migrateOut = runBin(['migrate', FIXTURE, '--out', out]);
  check(existsSync(path.join(out, 'login-success.spec.ts')), 'bin migrate wrote no spec');
  console.log(`bin ok: --version ${version}; ${migrateOut.trim().split('\n').at(-1)}`);
  console.log('Pack test passed.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
