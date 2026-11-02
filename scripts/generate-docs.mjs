#!/usr/bin/env node
// Writes docs/mapping.md and the blocked pattern list in README.md. Run `npm run build` first;
// `npm run docs:generate` does both.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPPING_DOC, renderMappingReference, replaceReadmeBlock } from '../dist/docs/reference.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = path.join(ROOT, MAPPING_DOC);
mkdirSync(path.dirname(doc), { recursive: true });
writeFileSync(doc, await renderMappingReference(ROOT));
const readme = path.join(ROOT, 'README.md');
writeFileSync(readme, replaceReadmeBlock(readFileSync(readme, 'utf8')));
console.log(`Wrote ${MAPPING_DOC} and the blocked pattern list in README.md.`);
