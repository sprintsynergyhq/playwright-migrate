import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findStaleDistFiles } from '../../scripts/pack-files.mjs';

describe('pack file list', () => {
  const src = ['src/cli.ts', 'src/core/migrate.ts'];

  it('accepts the js, map and d.ts files of every source file', () => {
    const files = [
      'dist/cli.js',
      'dist/cli.js.map',
      'dist/cli.d.ts',
      'dist/core/migrate.js',
      'grammars/tree-sitter-java.wasm',
      'package.json',
    ];
    expect(findStaleDistFiles(files, src)).toEqual([]);
  });

  it('lists dist files whose source is gone, and unexpected file kinds', () => {
    const files = ['dist/cli.js', 'dist/old/removed.js', 'dist/old/removed.d.ts', 'dist/notes.txt'];
    expect(findStaleDistFiles(files, src)).toEqual([
      'dist/notes.txt',
      'dist/old/removed.d.ts',
      'dist/old/removed.js',
    ]);
  });

  it('npm run build removes dist first', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prebuild).toBe('node scripts/clean-dist.mjs');
    expect(readFileSync('scripts/clean-dist.mjs', 'utf8')).toContain(
      "rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });",
    );
  });
});
