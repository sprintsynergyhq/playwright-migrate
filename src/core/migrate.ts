// Plans a migration of one file or a folder. Nothing is written here; the
// migrate command (or a library caller) writes the planned files.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PLAYWRIGHT_CONFIG_FILE, renderPlaywrightConfig } from '../emit/config.js';
import { ParseError } from '../parse/treeSitter.js';
import { specFileName } from '../sources/index.js';
import { getVersion } from '../version.js';
import { convertSource, isConvertible } from './convert.js';
import { detectPath, detectSource } from './detect.js';
import { InvariantError } from './invariants.js';
import {
  buildRunReport,
  renderReportJson,
  renderReportMarkdown,
  type FileReport,
  type RunReport,
} from './report.js';
import { SOURCE_FRAMEWORKS, type Detection, type SourceFramework } from './types.js';

export const DEFAULT_OUT_DIR = 'playwright-migrated';
export const REPORT_JSON = 'migration-report.json';
export const REPORT_MD = 'migration-report.md';

/** A user-facing problem. The message is printed after "Error: " and the exit code is 1. */
export class MigrationError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export type MigrationOptions = { from?: string };

/** One planned output file. `path` is relative to the output folder and uses forward slashes. */
export type PlannedFile = { path: string; content: string };

export type MigrationPlan = {
  mode: 'file' | 'folder';
  /** Planned files sorted by path: specs, reports and, for a folder, playwright.config.ts. */
  files: PlannedFile[];
  /** Candidate files that were not converted, with the reason. Folder mode only. */
  skipped: Detection[];
  report: RunReport;
};

export function isSourceFramework(value: string): value is SourceFramework {
  return (SOURCE_FRAMEWORKS as readonly string[]).includes(value);
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function byPath(a: { path: string }, b: { path: string }): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

function readSource(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

async function convertOne(
  framework: SourceFramework,
  sourcePath: string,
  text: string,
  outputPath: string,
): Promise<{ spec: string; report: FileReport }> {
  try {
    return await convertSource(framework, sourcePath, text, outputPath);
  } catch (error) {
    if (error instanceof ParseError || error instanceof InvariantError) {
      throw new MigrationError(error.message);
    }
    throw error;
  }
}

function withReports(input: string, reports: FileReport[]): RunReport {
  return buildRunReport(toPosix(input), getVersion(), reports);
}

async function planFile(input: string, opts: MigrationOptions): Promise<MigrationPlan> {
  const text = readSource(await readFile(input, 'utf8'));
  const detection = detectSource(input, text);
  const framework = opts.from ?? detection.framework;
  if (framework === 'unknown') {
    throw new MigrationError(
      `could not detect the source framework of ${input} (${detection.reason}).`,
      ['Use --from to set it.'],
    );
  }
  if (!isSourceFramework(framework) || !isConvertible(framework)) {
    throw new MigrationError(`conversion from ${framework} is not supported yet.`);
  }
  const sourcePath = path.basename(input);
  const specName = specFileName(framework, sourcePath);
  const conversion = await convertOne(framework, sourcePath, text, specName);
  const specs = [{ path: specName, content: conversion.spec }];
  const report = withReports(input, [conversion.report]);
  return {
    mode: 'file',
    files: [
      ...specs,
      { path: REPORT_JSON, content: renderReportJson(report) },
      { path: REPORT_MD, content: renderReportMarkdown(report) },
    ].sort(byPath),
    skipped: [],
    report,
  };
}

async function planFolder(input: string, opts: MigrationOptions): Promise<MigrationPlan> {
  const detections = await detectPath(input);
  const skipped: Detection[] = [];
  const specs: PlannedFile[] = [];
  const reports: FileReport[] = [];
  const sourceFor = new Map<string, string>();
  for (const detection of detections) {
    const framework = detection.framework;
    if (framework === 'unknown') {
      skipped.push(detection);
      continue;
    }
    if (opts.from !== undefined && framework !== opts.from) {
      skipped.push({ ...detection, reason: `detected ${framework}, not ${opts.from}` });
      continue;
    }
    if (!isConvertible(framework)) {
      skipped.push({ ...detection, reason: `conversion from ${framework} is not supported yet` });
      continue;
    }
    const dir = path.posix.dirname(detection.path);
    const name = specFileName(framework, path.posix.basename(detection.path));
    const outputPath = dir === '.' ? name : `${dir}/${name}`;
    const earlier = sourceFor.get(outputPath);
    if (earlier !== undefined) {
      throw new MigrationError(
        `${earlier} and ${detection.path} would both be written to ${outputPath}.`,
        ['Rename one of them, or convert them one at a time.'],
      );
    }
    sourceFor.set(outputPath, detection.path);
    const text = readSource(await readFile(path.join(input, detection.path), 'utf8'));
    const conversion = await convertOne(framework, detection.path, text, outputPath);
    specs.push({ path: outputPath, content: conversion.spec });
    reports.push(conversion.report);
  }
  if (specs.length === 0) {
    throw new MigrationError(`no convertible test files found in ${input}.`);
  }
  for (const reserved of [PLAYWRIGHT_CONFIG_FILE, REPORT_JSON, REPORT_MD]) {
    const source = sourceFor.get(reserved);
    if (source !== undefined) {
      throw new MigrationError(`${source} would overwrite the generated ${reserved}.`);
    }
  }
  const report = withReports(input, reports);
  return {
    mode: 'folder',
    files: [
      ...specs,
      { path: PLAYWRIGHT_CONFIG_FILE, content: renderPlaywrightConfig() },
      { path: REPORT_JSON, content: renderReportJson(report) },
      { path: REPORT_MD, content: renderReportMarkdown(report) },
    ].sort(byPath),
    skipped,
    report,
  };
}

/**
 * Converts a test file or every convertible test file under a folder, in memory.
 * For a folder, `--from` limits conversion to one framework. Throws MigrationError
 * for problems the user can fix.
 */
export async function planMigration(
  input: string,
  opts: MigrationOptions = {},
): Promise<MigrationPlan> {
  if (opts.from !== undefined && !isSourceFramework(opts.from)) {
    throw new MigrationError(
      `invalid value for --from: ${opts.from}. Valid values: ${SOURCE_FRAMEWORKS.join(', ')}`,
    );
  }
  let isDirectory: boolean;
  try {
    isDirectory = (await stat(input)).isDirectory();
  } catch {
    throw new MigrationError(`path not found: ${input}`);
  }
  return isDirectory ? planFolder(input, opts) : planFile(input, opts);
}

/** Returns the planned paths that already exist under `outDir`, sorted. */
export async function findExistingFiles(outDir: string, plan: MigrationPlan): Promise<string[]> {
  const existing: string[] = [];
  for (const file of plan.files) {
    try {
      await stat(path.join(outDir, file.path));
      existing.push(file.path);
    } catch {
      // Not there yet.
    }
  }
  return existing;
}

/** Writes every planned file under `outDir`, creating folders as needed. */
export async function writeMigration(outDir: string, plan: MigrationPlan): Promise<void> {
  for (const file of plan.files) {
    const target = path.join(outDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
}
