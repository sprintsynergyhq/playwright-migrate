#!/usr/bin/env node
// Removes dist/ before a build, so files from deleted or renamed sources never reach the package.
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
