// Checks the file list of a packed tarball against the source files.

const DIST_SUFFIX = /\.(js\.map|d\.ts|js)$/;

/**
 * Returns the dist/ files in `packFiles` that no file in `srcFiles` compiles to, sorted.
 * Both lists use paths relative to the package root with forward slashes.
 * @param {string[]} packFiles
 * @param {string[]} srcFiles
 * @returns {string[]}
 */
export function findStaleDistFiles(packFiles, srcFiles) {
  const sources = new Set(srcFiles);
  return packFiles
    .filter((file) => file.startsWith('dist/'))
    .filter((file) => {
      const base = file.slice('dist/'.length).replace(DIST_SUFFIX, '');
      return base === file.slice('dist/'.length) || !sources.has(`src/${base}.ts`);
    })
    .sort();
}
