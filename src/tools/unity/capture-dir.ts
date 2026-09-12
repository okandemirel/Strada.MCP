/**
 * WHERE A RUN MAY WRITE, AND WHAT IT MAY DELETE.
 *
 * Both runners took the caller's `captureDir` and began by clearing it:
 *
 *   rmSync(join(projectPath, input.captureDir), { recursive: true, force: true })
 *
 * so `captureDir: "."` resolved to the project root and deleted the game —
 * and `"Assets"`, `"../.."` or any absolute path did the same to whatever it
 * named (Codex 2026-09-12 U#F7, X). The recorder owns one root inside the
 * project; a run directory must sit under it, and nothing else is ever
 * removed.
 */

import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The one directory tree a run may write its recordings into. */
export const RECORDING_ROOT = 'Recordings';

/**
 * The real path `target` will have once it exists: its nearest existing
 * ancestor resolved through every symlink, with the not-yet-created tail
 * appended. Without this a symlink inside the recording root — or a symlinked
 * project root — reads as contained while pointing anywhere.
 */
function realTarget(target: string): string {
  const abs = resolve(target);
  let ancestor = abs;
  while (!existsSync(ancestor)) {
    const up = dirname(ancestor);
    if (up === ancestor) return abs;
    ancestor = up;
  }
  let real: string;
  try {
    real = realpathSync(ancestor);
  } catch {
    real = ancestor;
  }
  const tail = relative(ancestor, abs);
  return tail === '' ? real : join(real, tail);
}

export interface CaptureDirDecision {
  /** The directory to write into, when it is allowed. */
  readonly dir?: string;
  /** Why the request was refused, when it was. */
  readonly reason?: string;
}

/**
 * Resolve a requested capture directory against the recording root.
 *
 * `requested` may be relative to the project or absolute; either way the
 * result must be a directory strictly BELOW `<projectPath>/Recordings`. The
 * root itself is refused: clearing it would delete the recordings of every
 * other run.
 */
export function resolveCaptureDir(
  projectPath: string,
  requested: unknown,
  defaultSubdir: string,
): CaptureDirDecision {
  const asked = typeof requested === 'string' && requested.trim() !== '' ? requested.trim() : undefined;
  const target = asked === undefined
    ? join(projectPath, defaultSubdir)
    : isAbsolute(asked) ? asked : join(projectPath, asked);
  const root = realTarget(join(projectPath, RECORDING_ROOT));
  const real = realTarget(target);
  const rel = relative(root, real);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    return {
      reason:
        `captureDir must name a directory under ${RECORDING_ROOT}/ inside the project ` +
        `(asked for ${asked ?? defaultSubdir}, which resolves to ${real}); nothing was written or removed`,
    };
  }
  return { dir: real };
}
