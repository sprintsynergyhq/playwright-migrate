import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_FRAMEWORKS, type SourceFramework } from '../../src/core/types.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CASES_DIR = path.join(REPO_ROOT, 'fixtures', 'saucedemo', 'cases');

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
