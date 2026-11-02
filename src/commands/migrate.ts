import path from 'node:path';
import {
  DEFAULT_OUT_DIR,
  findExistingFiles,
  MigrationError,
  planMigration,
  writeMigration,
  type MigrationPlan,
} from '../core/migrate.js';
import type { Io } from '../core/types.js';

export { DEFAULT_OUT_DIR, REPORT_JSON, REPORT_MD } from '../core/migrate.js';

export type MigrateOptions = { out?: string; from?: string; dryRun?: boolean; force?: boolean };

// Converts a test file or a folder of test files.
// Returns 0 when nothing is blocked, 2 when something is blocked, 1 on any error.
export async function runMigrate(input: string, opts: MigrateOptions, io: Io): Promise<number> {
  const outDir = opts.out ?? DEFAULT_OUT_DIR;
  let plan: MigrationPlan;
  try {
    plan = await planMigration(input, { from: opts.from });
  } catch (error) {
    if (error instanceof MigrationError) {
      io.err(`Error: ${error.message}`);
      for (const hint of error.hints) io.err(hint);
      return 1;
    }
    throw error;
  }

  if (!opts.dryRun && !opts.force) {
    const existing = await findExistingFiles(outDir, plan);
    if (existing.length > 0) {
      io.err(`Error: ${existing.length} output file(s) already exist in ${outDir}:`);
      for (const file of existing) io.err(`  ${file}`);
      io.err('Nothing was written. Use --force to overwrite them, or pick another --out folder.');
      return 1;
    }
  }

  const verb = opts.dryRun ? 'Would write' : 'Wrote';
  if (!opts.dryRun) await writeMigration(outDir, plan);
  for (const file of plan.files) io.out(`${verb} ${path.join(outDir, file.path)}`);
  for (const skipped of plan.skipped) io.out(`Skipped ${skipped.path}: ${skipped.reason}`);
  for (const file of plan.report.files) {
    const c = file.counts;
    const name = plan.mode === 'file' ? path.basename(file.source) : file.source;
    io.out(
      `${name}: ${file.status}, ${c.tests} test(s), INFO ${c.info}, WARN ${c.warn}, BLOCK ${c.block}`,
    );
  }
  if (plan.mode === 'folder') {
    const s = plan.report.summary;
    io.out(
      `Files: ${s.files} (converted ${s.converted}, with warnings ${s.convertedWithWarnings}, ` +
        `blocked ${s.blocked}), skipped ${plan.skipped.length}. Exit code ${plan.report.exitCode}.`,
    );
  }
  return plan.report.exitCode;
}
