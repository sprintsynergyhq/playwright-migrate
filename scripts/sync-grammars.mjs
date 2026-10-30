// Copies the tree-sitter grammar WASM files from node_modules into grammars/.
// Run after changing a grammar package version: npm run grammars:sync
import console from 'node:console';
import { copyFileSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

export const GRAMMARS = [
  { pkg: 'tree-sitter-javascript', file: 'tree-sitter-javascript.wasm' },
  { pkg: 'tree-sitter-python', file: 'tree-sitter-python.wasm' },
  { pkg: 'tree-sitter-java', file: 'tree-sitter-java.wasm' },
];

const root = new URL('../', import.meta.url);

export function syncGrammars() {
  mkdirSync(new URL('grammars/', root), { recursive: true });
  for (const { pkg, file } of GRAMMARS) {
    const from = new URL(`node_modules/${pkg}/${file}`, root);
    const to = new URL(`grammars/${file}`, root);
    copyFileSync(from, to);
    console.log(`Copied ${pkg}/${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) syncGrammars();
