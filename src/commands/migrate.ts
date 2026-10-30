import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { convertSource, isConvertible } from '../core/convert.js';
import { detectSource } from '../core/detect.js';
import { InvariantError } from '../core/invariants.js';
import { buildRunReport, renderReportJson, renderReportMarkdown } from '../core/report.js';
import { SOURCE_FRAMEWORKS, type Io, type SourceFramework } from '../core/types.js';
import { ParseError } from '../parse/treeSitter.js';
import { specFileName } from '../sources/index.js';
import { getVersion } from '../version.js';

export type MigrateOptions = { out?: string; from?: string; dryRun?: boolean };

export const DEFAULT_OUT_DIR = 'playwright-migrated';
export const REPORT_JSON = 'migration-report.json';
export const REPORT_MD = 'migration-report.md';

function isSourceFramework(value: string): value is SourceFramework {
  return (SOURCE_FRAMEWORKS as readonly string[]).includes(value);
}

// Converts one test file. Folder input is added in PR 8.
// Returns 0 when nothing is blocked, 2 when something is blocked, 1 on any error.
export async function runMigrate(input: string, opts: MigrateOptions, io: Io): Promise<number> {
  if (opts.from !== undefined && !isSourceFramework(opts.from)) {
    io.err(
      `Error: invalid value for --from: ${opts.from}. Valid values: ${SOURCE_FRAMEWORKS.join(', ')}`,
    );
    return 1;
  }
  let isDirectory: boolean;
  try {
    isDirectory = (await stat(input)).isDirectory();
  } catch {
    io.err(`Error: path not found: ${input}`);
    return 1;
  }
  if (isDirectory) {
    io.err('Error: folder input is not supported yet. Pass one test file.');
    return 1;
  }

  const text = (await readFile(input, 'utf8')).replace(/\r\n/g, '\n');
  const detection = detectSource(input, text);
  const framework = opts.from ?? detection.framework;
  if (framework === 'unknown') {
    io.err(`Error: could not detect the source framework of ${input} (${detection.reason}).`);
    io.err('Use --from to set it.');
    return 1;
  }
  if (!isConvertible(framework)) {
    io.err(`Error: conversion from ${framework} is not supported yet.`);
    return 1;
  }

  const sourcePath = path.basename(input);
  const outDir = opts.out ?? DEFAULT_OUT_DIR;
  const specName = specFileName(framework, sourcePath);
  let conversion;
  try {
    conversion = await convertSource(framework, sourcePath, text, specName);
  } catch (error) {
    if (error instanceof ParseError || error instanceof InvariantError) {
      io.err(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }

  const run = buildRunReport(input.split(path.sep).join('/'), getVersion(), [conversion.report]);
  const files: Array<[string, string]> = [
    [specName, conversion.spec],
    [REPORT_JSON, renderReportJson(run)],
    [REPORT_MD, renderReportMarkdown(run)],
  ];
  if (opts.dryRun) {
    for (const [name] of files) io.out(`Would write ${path.join(outDir, name)}`);
  } else {
    await mkdir(outDir, { recursive: true });
    for (const [name, content] of files) {
      await writeFile(path.join(outDir, name), content, 'utf8');
      io.out(`Wrote ${path.join(outDir, name)}`);
    }
  }
  const c = conversion.report.counts;
  io.out(
    `${sourcePath}: ${conversion.report.status}, ${c.tests} test(s), INFO ${c.info}, WARN ${c.warn}, BLOCK ${c.block}`,
  );
  return run.exitCode;
}
