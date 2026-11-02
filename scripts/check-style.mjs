#!/usr/bin/env node
// Fails when any tracked text file contains an em dash or an en dash.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DASHES = new Set(['\u2014', '\u2013']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git']);
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.svgz',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
  '.tgz',
  '.tar',
  '.7z',
  '.rar',
  '.jar',
  '.wasm',
  '.pdf',
]);

/**
 * Returns every em dash or en dash in `text` with its 1-based line and column.
 * @param {string} text
 * @returns {Array<{ line: number; column: number; char: string }>}
 */
export function findDashes(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    let column = 0;
    for (const char of lineText) {
      column += 1;
      if (DASHES.has(char)) {
        hits.push({ line: index + 1, column, char });
      }
    }
  });
  return hits;
}

function walk(dir, root, out) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(full, root, out);
    } else if (entry.isFile()) {
      out.push(path.relative(root, full));
    }
  }
}

function listFiles(root) {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    return output.split('\0').filter(Boolean).sort();
  } catch {
    const files = [];
    walk(root, root, files);
    return files;
  }
}

function main() {
  const root = process.cwd();
  let count = 0;
  for (const file of listFiles(root)) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    let text;
    try {
      text = readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const hit of findDashes(text)) {
      const name = hit.char === '\u2014' ? 'em dash' : 'en dash';
      console.log(`${file.split(path.sep).join('/')}:${hit.line}:${hit.column} ${name}`);
      count += 1;
    }
  }
  if (count > 0) {
    console.log(`Found ${count} em or en dash(es).`);
    process.exitCode = 1;
  } else {
    console.log('No em dashes or en dashes found.');
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
