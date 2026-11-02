import { stat } from 'node:fs/promises';
import { detectPath } from '../core/detect.js';
import { SOURCE_FRAMEWORKS, type Io } from '../core/types.js';

export async function runDetect(target: string, opts: { json?: boolean }, io: Io): Promise<number> {
  try {
    await stat(target);
  } catch {
    io.err(`Error: path not found: ${target}`);
    return 1;
  }

  const detections = await detectPath(target);

  if (opts.json) {
    io.out(JSON.stringify(detections, null, 2));
    return 0;
  }

  for (const d of detections) {
    io.out(`${d.framework}\t${d.path}`);
  }
  const counts = [...SOURCE_FRAMEWORKS, 'unknown' as const].map(
    (name) => `${name} ${detections.filter((d) => d.framework === name).length}`,
  );
  io.out(`Detected ${detections.length} file(s): ${counts.join(', ')}`);
  return 0;
}
