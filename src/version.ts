import { readFileSync } from 'node:fs';

/** Reads the version from package.json. Works from both src/ and dist/. */
export function getVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(raw) as { version?: unknown };
  if (typeof pkg.version !== 'string') {
    throw new Error('package.json has no version');
  }
  return pkg.version;
}
