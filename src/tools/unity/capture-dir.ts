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

import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  // THE AUTHORITY IS THE CANONICAL PROJECT, and `Recordings` under it — NOT
  // wherever a `Recordings` symlink happens to point. Resolving the root
  // through its own links moved the permitted tree with them: with
  // `/project/Recordings -> /victim`, `captureDir: "Recordings/assets"` was
  // accepted as /victim/assets and recursively removed (Codex 2026-09-12 Y).
  // Fail closed when the project root cannot be canonicalized at all.
  let project: string;
  try {
    project = realpathSync(resolve(projectPath));
  } catch {
    return { reason: `the project path ${projectPath} could not be resolved; nothing was written or removed` };
  }
  const root = join(project, RECORDING_ROOT);
  const real = realTarget(target);
  const rel = relative(root, real);
  const parts = rel === '' ? [] : rel.split(sep);
  if (rel === '' || isAbsolute(rel) || parts.includes('..')) {
    return {
      reason:
        `captureDir must name a directory under ${RECORDING_ROOT}/ inside the project ` +
        `(asked for ${asked ?? defaultSubdir}, which resolves to ${real}); nothing was written or removed`,
    };
  }
  return { dir: real };
}

/** The file that marks a directory as the recorder's own to clear. */
export const RECORDING_MARKER = '.strada-recording';

/**
 * Make the run's directory ready — and NEVER clear a directory that is not
 * the recorder's.
 *
 * Containment alone does not make a directory ours: an `Assets/SharedArt`
 * symlink pointing INTO `Recordings/` resolved inside the permitted tree, and
 * the next statement deleted the real art it pointed at (Codex 2026-09-12
 * Z#7). A directory may be cleared only when it does not exist, is empty, or
 * carries the marker a previous run left.
 */
/**
 * Files THIS recorder writes, and nothing else: numbered frames (with or
 * without a session), its record and verdict, the player log and its own
 * marker. A directory holding only these is the recorder's own, whether or
 * not it was written by a version that stamped the marker.
 */
const RECORDER_OUTPUT_RE =
  // …and the player run's own sidecar (player-run.json, the artifact this
  // capture belongs to): without it a restored, marker-less recorder
  // directory failed ownership recognition (Strada.Brain Codex round 6 #24).
  /^(?:frame_(?:s\d+_)?\d+\.png|playthrough\.json|playthrough-verdict\.json|player-run\.json|player\.log|\.strada-recording|\.DS_Store)$/;

export function isRecorderOutput(name: string): boolean {
  return RECORDER_OUTPUT_RE.test(name);
}

export function prepareCaptureDir(dir: string): { ok: true } | { ok: false; reason: string } {
  if (existsSync(dir)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (error) {
      return { ok: false, reason: `${dir} cannot be read (${String(error)}); nothing was written or removed` };
    }
    const ours = entries.includes(RECORDING_MARKER);
    // A DIRECTORY THAT HOLDS ONLY THIS RECORDER'S OWN OUTPUT IS THIS
    // RECORDER'S. The marker was introduced after runs had already written
    // here, so every play-through on an existing project was refused before
    // it started — "holds files this recorder did not write" about frames the
    // recorder itself had written (measured live on the vehicle 2026-09-16,
    // from Codex 2026-09-12 Z#7). Adopting is safe because the shapes below
    // are ours alone; anything else still stops the run.
    const adoptable = entries.length > 0 && !ours && entries.every(isRecorderOutput);
    if (entries.length > 0 && !ours && !adoptable) {
      return {
        ok: false,
        reason:
          `${dir} holds files this recorder did not write (no ${RECORDING_MARKER}), so it was not cleared — ` +
          'point captureDir at a fresh directory under Recordings/',
      };
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      return { ok: false, reason: `${dir} could not be cleared (${String(error)})` };
    }
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, RECORDING_MARKER), 'Written by Strada.MCP; this directory is cleared before each run.\n');
  } catch (error) {
    return { ok: false, reason: `${dir} could not be created (${String(error)})` };
  }
  return { ok: true };
}
