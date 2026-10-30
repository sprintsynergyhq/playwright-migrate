// Converts one source file: parse, extract, check invariants, emit and report.
import { emitPlaywright } from '../emit/playwright.js';
import { parseSource } from '../parse/treeSitter.js';
import { EXTRACTORS } from '../sources/index.js';
import { checkInvariants } from './invariants.js';
import type { MigrationFile } from './ir.js';
import { buildFileReport } from './report.js';
import type { FileReport } from './report.js';
import type { SourceFramework } from './types.js';

export class UnsupportedSourceError extends Error {
  constructor(readonly framework: SourceFramework) {
    super(`Conversion from ${framework} is not supported yet.`);
    this.name = 'UnsupportedSourceError';
  }
}

export type Conversion = { file: MigrationFile; spec: string; report: FileReport };

export function isConvertible(framework: SourceFramework): boolean {
  return EXTRACTORS[framework] !== undefined;
}

// sourcePath is the path written into the output header and the report (forward slashes).
// outputPath is the spec path written into the report, or null when nothing is written.
// Throws ParseError, InvariantError or UnsupportedSourceError.
export async function convertSource(
  framework: SourceFramework,
  sourcePath: string,
  text: string,
  outputPath: string | null,
): Promise<Conversion> {
  const extract = EXTRACTORS[framework];
  if (!extract) throw new UnsupportedSourceError(framework);
  const tree = await parseSource(framework, sourcePath, text);
  let file: MigrationFile;
  try {
    file = extract(tree.rootNode, sourcePath);
  } finally {
    tree.delete();
  }
  checkInvariants(file);
  const spec = await emitPlaywright(file);
  return { file, spec, report: buildFileReport(file, outputPath) };
}
