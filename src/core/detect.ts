import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Detection } from './types.js';

const SELENIUM_PYTHON_IMPORT = /^\s*(from|import)\s+selenium\b/m;
const CYPRESS_COMMAND = /\bcy\.[A-Za-z]+\(/;
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'expected']);
const CANDIDATE_EXTENSIONS = new Set(['.java', '.py', '.js', '.ts', '.tsx']);

/** Labels one source file by its extension and content. Rules are checked in order. */
export function detectSource(filePath: string, content: string): Detection {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.java' && content.includes('org.openqa.selenium')) {
    return { path: filePath, framework: 'selenium-java', reason: 'imports org.openqa.selenium' };
  }
  if (ext === '.py' && SELENIUM_PYTHON_IMPORT.test(content)) {
    return { path: filePath, framework: 'selenium-python', reason: 'imports selenium' };
  }
  if (ext === '.js' && CYPRESS_COMMAND.test(content)) {
    return { path: filePath, framework: 'cypress-js', reason: 'uses cy.* commands' };
  }
  if ((ext === '.ts' || ext === '.tsx') && CYPRESS_COMMAND.test(content)) {
    return {
      path: filePath,
      framework: 'unknown',
      reason: 'Cypress TypeScript is not supported in v1',
    };
  }
  return { path: filePath, framework: 'unknown', reason: 'no supported framework detected' };
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function byPath(a: { path: string }, b: { path: string }): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => byPath({ path: a.name }, { path: b.name }));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        await walk(full, out);
      }
    } else if (entry.isFile() && CANDIDATE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
}

/**
 * Detects the framework of a file, or of every candidate file under a folder.
 *
 * Paths in the result use forward slashes on every platform. For a folder, each
 * path is relative to `root` itself (for example `cases/login-success/...`). For a
 * single file, the path is the file name. Results are sorted by path.
 */
export async function detectPath(root: string): Promise<Detection[]> {
  const info = await stat(root);
  if (info.isFile()) {
    const content = await readFile(root, 'utf8');
    return [detectSource(path.basename(root), content)];
  }
  const files: string[] = [];
  await walk(root, files);
  const results: Detection[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const detection = detectSource(file, content);
    results.push({ ...detection, path: toPosix(path.relative(root, file)) });
  }
  return results.sort(byPath);
}
