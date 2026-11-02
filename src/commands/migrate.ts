import { SOURCE_FRAMEWORKS, type Io, type SourceFramework } from '../core/types.js';

export type MigrateOptions = { out?: string; from?: string; dryRun?: boolean };

function isSourceFramework(value: string): value is SourceFramework {
  return (SOURCE_FRAMEWORKS as readonly string[]).includes(value);
}

export function runMigrate(input: string, opts: MigrateOptions, io: Io): Promise<number> {
  if (opts.from !== undefined && !isSourceFramework(opts.from)) {
    io.err(
      `Error: invalid value for --from: ${opts.from}. Valid values: ${SOURCE_FRAMEWORKS.join(', ')}`,
    );
    return Promise.resolve(1);
  }
  io.err('Conversion is not implemented yet. This build only supports "detect".');
  return Promise.resolve(1);
}
