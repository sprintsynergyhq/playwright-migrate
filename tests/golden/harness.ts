import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRule, isRuleId, type RuleId } from '../../src/core/rules.js';
import type { FileStatus } from '../../src/core/status.js';
import { SOURCE_FRAMEWORKS, type SourceFramework } from '../../src/core/types.js';

const FILE_STATUSES: readonly FileStatus[] = ['converted', 'converted_with_warnings', 'blocked'];

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES_DIR = path.join(REPO_ROOT, 'fixtures', 'saucedemo');
export const CASES_DIR = path.join(FIXTURES_DIR, 'cases');
export const FLAGS_DIR = path.join(FIXTURES_DIR, 'flags');

export type CaseMeta = {
  id: string;
  title: string;
  intent: string;
  app: string;
  sources: Record<SourceFramework, string>;
  expectCount: number;
};

export type FixtureCase = { id: string; dir: string; meta: CaseMeta };

function fail(caseDir: string, message: string): never {
  throw new Error(`Invalid case.json in ${caseDir}: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateMeta(raw: unknown, caseDir: string): CaseMeta {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(caseDir, 'expected a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  for (const field of ['id', 'title', 'intent', 'app'] as const) {
    if (!isNonEmptyString(obj[field])) {
      fail(caseDir, `"${field}" must be a non-empty string`);
    }
  }
  if (obj.id !== path.basename(caseDir)) {
    fail(caseDir, `"id" must match the folder name "${path.basename(caseDir)}"`);
  }
  const sources = obj.sources;
  if (typeof sources !== 'object' || sources === null || Array.isArray(sources)) {
    fail(caseDir, '"sources" must be an object');
  }
  const keys = Object.keys(sources).sort();
  const wanted = [...SOURCE_FRAMEWORKS].sort();
  if (keys.length !== wanted.length || keys.some((k, i) => k !== wanted[i])) {
    fail(caseDir, `"sources" keys must be exactly: ${SOURCE_FRAMEWORKS.join(', ')}`);
  }
  for (const key of SOURCE_FRAMEWORKS) {
    if (!isNonEmptyString((sources as Record<string, unknown>)[key])) {
      fail(caseDir, `"sources.${key}" must be a non-empty string`);
    }
  }
  const expectCount = obj.expectCount;
  if (typeof expectCount !== 'number' || !Number.isInteger(expectCount) || expectCount <= 0) {
    fail(caseDir, '"expectCount" must be a positive integer');
  }
  return obj as unknown as CaseMeta;
}

/** Reads, validates and returns every SauceDemo case, sorted by id. */
export function listCases(casesDir: string = CASES_DIR): FixtureCase[] {
  const cases: FixtureCase[] = [];
  const entries = readdirSync(casesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of entries) {
    const dir = path.join(casesDir, name);
    const metaPath = path.join(dir, 'case.json');
    if (!existsSync(metaPath)) {
      fail(dir, 'case.json is missing');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch (error) {
      fail(dir, `not valid JSON (${(error as Error).message})`);
    }
    const meta = validateMeta(raw, dir);
    cases.push({ id: meta.id, dir, meta });
  }
  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Returns the source file path for a case and framework. */
export function sourcePath(c: FixtureCase, framework: SourceFramework): string {
  return path.join(c.dir, ...c.meta.sources[framework].split('/'));
}

/** Returns `<dir>/expected/<framework>.spec.ts`. */
export function expectedSpecPath(c: FixtureCase, framework: SourceFramework): string {
  return path.join(c.dir, 'expected', `${framework}.spec.ts`);
}

/** Returns `<dir>/expected/<framework>.report.json`. */
export function expectedReportPath(c: FixtureCase, framework: SourceFramework): string {
  return path.join(c.dir, 'expected', `${framework}.report.json`);
}

export type FlagMeta = {
  id: string;
  title: string;
  intent: string;
  app: string;
  framework: SourceFramework;
  source: string;
  expectedStatus: FileStatus;
  rules: RuleId[];
  runnable: boolean;
};

export type FlagCase = { id: string; dir: string; meta: FlagMeta };

const FLAG_KEYS = [
  'app',
  'expectedStatus',
  'framework',
  'id',
  'intent',
  'rules',
  'runnable',
  'source',
  'title',
];

function validateFlagMeta(raw: unknown, dir: string): FlagMeta {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(dir, 'expected a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  if (keys.join(',') !== FLAG_KEYS.join(',')) {
    fail(dir, `keys must be exactly: ${FLAG_KEYS.join(', ')}`);
  }
  for (const field of ['id', 'title', 'intent', 'app', 'source'] as const) {
    if (!isNonEmptyString(obj[field])) {
      fail(dir, `"${field}" must be a non-empty string`);
    }
  }
  if (obj.id !== path.basename(dir)) {
    fail(dir, `"id" must match the folder name "${path.basename(dir)}"`);
  }
  if (!(SOURCE_FRAMEWORKS as readonly unknown[]).includes(obj.framework)) {
    fail(dir, `"framework" must be one of: ${SOURCE_FRAMEWORKS.join(', ')}`);
  }
  if (!(FILE_STATUSES as readonly unknown[]).includes(obj.expectedStatus)) {
    fail(dir, `"expectedStatus" must be one of: ${FILE_STATUSES.join(', ')}`);
  }
  const rules = obj.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    fail(dir, '"rules" must be a non-empty array');
  }
  for (const rule of rules) {
    if (typeof rule !== 'string' || !isRuleId(rule) || getRule(rule).level === 'INFO') {
      fail(dir, `"rules" must list WARN or BLOCK rule ids, got ${String(rule)}`);
    }
  }
  if (typeof obj.runnable !== 'boolean') {
    fail(dir, '"runnable" must be true or false');
  }
  return obj as unknown as FlagMeta;
}

/** Reads, validates and returns every WARN and BLOCK flag fixture, sorted by id. */
export function listFlags(flagsDir: string = FLAGS_DIR): FlagCase[] {
  if (!existsSync(flagsDir)) return [];
  const names = readdirSync(flagsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  return names.map((name) => {
    const dir = path.join(flagsDir, name);
    const metaPath = path.join(dir, 'case.json');
    if (!existsSync(metaPath)) {
      fail(dir, 'case.json is missing');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch (error) {
      fail(dir, `not valid JSON (${(error as Error).message})`);
    }
    const meta = validateFlagMeta(raw, dir);
    return { id: meta.id, dir, meta };
  });
}

export const flagSourcePath = (f: FlagCase): string =>
  path.join(f.dir, ...f.meta.source.split('/'));
export const flagSpecPath = (f: FlagCase): string =>
  path.join(f.dir, 'expected', `${f.meta.framework}.spec.ts`);
export const flagReportPath = (f: FlagCase): string =>
  path.join(f.dir, 'expected', `${f.meta.framework}.report.json`);

export type SourceFile = { path: string; framework: SourceFramework };

/** Every source file in the cases and flags, relative to FIXTURES_DIR, sorted by path. */
export function listSourceFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const c of listCases()) {
    for (const framework of SOURCE_FRAMEWORKS) {
      files.push({ path: `cases/${c.id}/${c.meta.sources[framework]}`, framework });
    }
  }
  for (const f of listFlags()) {
    files.push({ path: `flags/${f.id}/${f.meta.source}`, framework: f.meta.framework });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
