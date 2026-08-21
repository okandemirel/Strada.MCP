import { resolve, sep } from 'node:path';

export interface ResolvedProjectPath {
  readonly projectPath: string;
  /** Set when the answer will describe a different tree than the one the caller works in. */
  readonly mismatchNote?: string;
}

/**
 * Which project a Unity tool should answer about, and whether that is the one
 * the caller has been editing.
 *
 * A caller-supplied path wins, as it always has — asking about another project
 * is a legitimate thing to do. What was missing is the sentence saying so.
 *
 * Measured 2026-08-21: an agent working inside a workspace lease fixed a
 * compile error in its own copy, then pointed unity_playmode_verify at the
 * original project by absolute path. It was told "the project does not
 * compile, so the test runner was never reached" — true of that tree, and
 * silent about the fact that its fix lived somewhere else entirely. A verdict
 * that does not say what it is about is the failure this repo keeps finding.
 */
export function resolveProjectPath(
  inputPath: unknown,
  contextPath: string | undefined,
): ResolvedProjectPath {
  const requested = typeof inputPath === 'string' ? inputPath.trim() : '';
  const context = (contextPath ?? '').trim();

  if (!requested) {
    return { projectPath: context };
  }
  if (!context || sameTree(requested, context)) {
    return { projectPath: requested };
  }
  return {
    projectPath: requested,
    mismatchNote:
      `This result describes ${requested}, not ${context}, which is where this session's ` +
      'edits are being made. If you meant to check your own changes, omit projectPath.',
  };
}

function sameTree(a: string, b: string): boolean {
  const left = resolve(a);
  const right = resolve(b);
  return left === right || left.startsWith(right + sep) || right.startsWith(left + sep);
}
