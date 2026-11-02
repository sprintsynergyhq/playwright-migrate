// Loads tree-sitter grammars (WASM) and parses source files. No native build is needed.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import type { Node, Tree } from 'web-tree-sitter';
import type { SourceFramework } from '../core/types.js';

export type GrammarName = 'javascript' | 'python' | 'java';

export const GRAMMAR_FOR: Record<SourceFramework, GrammarName> = {
  'cypress-js': 'javascript',
  'selenium-python': 'python',
  'selenium-java': 'java',
};

// grammars/ sits at the package root, two levels above both src/parse and dist/parse.
export function grammarUrl(name: GrammarName): URL {
  return new URL(`../../grammars/tree-sitter-${name}.wasm`, import.meta.url);
}

let initPromise: Promise<void> | undefined;
const languages = new Map<GrammarName, Promise<Language>>();

function init(): Promise<void> {
  initPromise ??= Parser.init();
  return initPromise;
}

export async function loadLanguage(name: GrammarName): Promise<Language> {
  await init();
  let lang = languages.get(name);
  if (!lang) {
    lang = readFile(fileURLToPath(grammarUrl(name))).then((bytes) => Language.load(bytes));
    languages.set(name, lang);
  }
  return lang;
}

export class ParseError extends Error {
  constructor(
    readonly path: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`Syntax error in ${path} at line ${line}, column ${column + 1}`);
    this.name = 'ParseError';
  }
}

// The first ERROR or MISSING node in document order, or undefined.
export function findSyntaxError(node: Node): Node | undefined {
  if (node.isError || node.isMissing) return node;
  if (!node.hasError) return undefined;
  for (const child of node.children) {
    if (!child) continue;
    const found = findSyntaxError(child);
    if (found) return found;
  }
  return undefined;
}

// Parses text with the grammar for the framework. Throws ParseError on a syntax error.
// The caller must call tree.delete() when done.
export async function parseSource(
  framework: SourceFramework,
  path: string,
  text: string,
): Promise<Tree> {
  // Parser.init() must finish before new Parser(); loadLanguage awaits it.
  const language = await loadLanguage(GRAMMAR_FOR[framework]);
  const parser = new Parser();
  try {
    parser.setLanguage(language);
    const tree = parser.parse(text);
    if (!tree) throw new Error(`Parser returned no tree for ${path}`);
    const bad = findSyntaxError(tree.rootNode);
    if (bad) {
      tree.delete();
      throw new ParseError(path, bad.startPosition.row + 1, bad.startPosition.column);
    }
    return tree;
  } finally {
    parser.delete();
  }
}
