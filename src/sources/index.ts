// Extractor registry: one extractor per source framework that can be converted.
import type { Node } from 'web-tree-sitter';
import type { MigrationFile } from '../core/ir.js';
import type { SourceFramework } from '../core/types.js';
import { extractCypress } from './cypress-js/extract.js';
import { extractSeleniumPython } from './selenium-python/extract.js';

export type Extractor = (root: Node, sourcePath: string) => MigrationFile;

// Selenium Java (PR 7) is added here.
export const EXTRACTORS: Partial<Record<SourceFramework, Extractor>> = {
  'cypress-js': extractCypress,
  'selenium-python': extractSeleniumPython,
};

// The output spec file name for a source file name, for example login.cy.js to login.spec.ts.
export function specFileName(framework: SourceFramework, sourceFileName: string): string {
  switch (framework) {
    case 'cypress-js':
      return sourceFileName.replace(/(\.cy)?\.js$/, '') + '.spec.ts';
    case 'selenium-python':
      return sourceFileName.replace(/\.py$/, '') + '.spec.ts';
    case 'selenium-java':
      return sourceFileName.replace(/\.java$/, '') + '.spec.ts';
  }
}
