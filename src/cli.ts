#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';
import { runDetect } from './commands/detect.js';
import { runMigrate, type MigrateOptions } from './commands/migrate.js';
import type { Io } from './core/types.js';
import { getVersion } from './version.js';

const defaultIo: Io = {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
};

function stripTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s.slice(0, -1) : s;
}

/**
 * Runs the CLI. `argv` has the same shape as `process.argv`
 * (node path, script path, then the user arguments). Returns the exit code
 * instead of calling `process.exit`.
 */
export async function run(argv: string[], io: Io = defaultIo): Promise<number> {
  let exitCode = 0;
  const program = new Command();

  program
    .name('playwright-migrate')
    .version(getVersion())
    .description(
      'Convert Selenium (Java, Python) and Cypress (JS) tests to Playwright Test TypeScript.',
    )
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.out(stripTrailingNewline(s)),
      writeErr: (s) => io.err(stripTrailingNewline(s)),
    });

  program
    .command('detect')
    .description('Detect the source test framework of a file or folder.')
    .argument('<path>', 'file or folder to scan')
    .option('--json', 'print the result as JSON')
    .action(async (target: string, opts: { json?: boolean }) => {
      exitCode = await runDetect(target, opts, io);
    });

  program
    .command('migrate')
    .description(
      'Convert a Cypress JS, Selenium Python or Selenium Java test file, or a folder of them, to Playwright Test TypeScript.',
    )
    .argument('<input>', 'test file or folder to convert')
    .option('--out <dir>', 'output folder')
    .option('--from <framework>', 'source framework: cypress-js, selenium-python or selenium-java')
    .option('--dry-run', 'show what would be written without writing files')
    .option('--force', 'overwrite output files that already exist')
    .action(async (input: string, opts: MigrateOptions) => {
      exitCode = await runMigrate(input, opts, io);
    });

  try {
    await program.parseAsync(argv, { from: 'node' });
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    throw error;
  }
  return exitCode;
}

function isEntryPoint(): boolean {
  const script = process.argv[1];
  if (!script) return false;
  try {
    // realpath resolves the symlink that npm creates in node_modules/.bin.
    return import.meta.url === pathToFileURL(realpathSync(script)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  // Setting exitCode (not calling process.exit) lets piped stdout finish
  // writing first, which matters on Windows and macOS.
  process.exitCode = await run(process.argv);
}
