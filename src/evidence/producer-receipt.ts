/**
 * The receipt a producer returns for the run it was asked to make.
 *
 * Strada.Brain issues a TICKET before it dispatches a tool and validates a
 * RECEIPT afterwards: without one, every proof of a delivery is a file that
 * could have been written by anything, with nothing binding it to the
 * invocation that made it (Strada.Brain, `src/campaign/producer-evidence.ts`).
 *
 * A receipt states only what this process MEASURED: the run it belongs to,
 * what kind of work it was, the tree it ran against, and how the process
 * ended. It never repeats a judgement the caller can make for itself.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const EVIDENCE_FENCE = 'strada-evidence';

/**
 * The digest SCHEME, mixed into every artifact digest — the same string
 * Strada.Brain uses. A record written under the old path-and-size scheme must
 * never look like one written under this one (Codex 2026-09-13 AH#8).
 */
export const ARTIFACT_DIGEST_VERSION = 'strada-artifact-v3-layout';

export interface ReceiptExecution {
  readonly completed: boolean;
  /** `null` when this operation owns no process of its own (a live bridge). */
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

/**
 * One session a play-through receipt answers for.
 *
 * Every field is a MEASUREMENT: a runner that cannot say which session it was
 * asked for, or whether the game confirmed the identity, must leave the
 * session out rather than fill the gap in — the receiver then reports the
 * session as missing instead of admitting an invented one.
 */
export interface ReceiptSession {
  readonly requestedIndex: number;
  readonly index: number;
  readonly observedIndex?: number;
  readonly identityVerified: boolean;
  readonly identitySource?: 'active-session' | 'start-acceptance' | 'unverified';
  readonly actions: number;
  readonly outcome: string;
  readonly reachedOutcome: boolean;
  readonly seconds: number;
}

export interface ReceiptInput {
  readonly runId: string;
  readonly kind: 'compile' | 'playmode-suite' | 'player-build' | 'playthrough';
  readonly medium: 'compiler' | 'editor' | 'builder' | 'player';
  readonly projectPath: string;
  readonly execution: ReceiptExecution;
  readonly target?: string;
  readonly artifactPath?: string;
  readonly sessionCount?: number;
  readonly sessions?: readonly ReceiptSession[];
  readonly payload?: Record<string, unknown>;
}

/**
 * The project's revision as THIS process reads it.
 *
 * Three answers, not two: the revision; `''` for a project this process
 * CONFIRMED has no repository (no `.git` anywhere above it); and `undefined`
 * when it could not tell. A correct project outside any repository used to
 * produce a receipt with no revision at all while the coordinator bound `''`,
 * so the two never agreed and no run on such a project could be admitted
 * (Codex 2026-09-13 AI#6). Unknown stays unknown: it is not "no repository".
 */
export function projectRevision(projectPath: string): string | undefined {
  try {
    const out = execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[0-9a-f]{40}$/i.test(out)) return out;
  } catch {
    /* fall through to the repository question */
  }
  return noRepositoryHere(projectPath) ? '' : undefined;
}

/** Is there CONFIRMED no repository above this path? */
function noRepositoryHere(projectPath: string): boolean {
  try {
    const inside = execFileSync('git', ['-C', projectPath, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // Inside a work tree with no readable HEAD: an unborn or broken
    // repository, which is not the same as having none.
    return inside !== 'true' ? !anyGitAbove(projectPath) : false;
  } catch {
    // The command also fails when git itself cannot run, and those cannot be
    // told apart — so only a tree with no `.git` anywhere above it counts.
    return !anyGitAbove(projectPath);
  }
}

function anyGitAbove(from: string): boolean {
  let at = resolve(from);
  for (;;) {
    if (existsSync(join(at, '.git'))) return true;
    const up = dirname(at);
    if (up === at) return false;
    at = up;
  }
}

/**
 * What an artifact IS, as this machine reads it.
 *
 * A player artifact can be a bundle DIRECTORY (macOS .app) or a single file,
 * so the digest covers the tree: each path and its size, in a fixed order.
 * Strada.Brain computes the same digest for the ticket it issues — the two
 * must agree, or the play-through is not about the build.
 */
export function artifactDigest(path: string | undefined): string | undefined {
  if (path === undefined || path === '') return undefined;
  try {
    const hash = createHash('sha256');
    // THE BYTES, not the names and sizes: two different files of the same
    // size hashed identically (Codex 2026-09-13 AH#8). The scheme is named in
    // the digest so an old record cannot pass as one written under this one.
    hash.update(`${ARTIFACT_DIGEST_VERSION}\n`);
    // WHICH artifact in that layout, so two executables shipped side by side
    // are not one artifact.
    hash.update(`${basename(path)}\n`);
    const walk = (at: string, rel: string): void => {
      const st = statSync(at);
      if (st.isDirectory()) {
        for (const entry of readdirSync(at).sort()) walk(join(at, entry), `${rel}/${entry}`);
        return;
      }
      hash.update(`${rel}:${st.size}\n`);
      hash.update(readFileSync(at));
    };
    walk(playerLayoutRoot(path), '');
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

/**
 * The directory a Unity player's parts live in, or the path itself.
 *
 * A Windows or Linux player is an executable PLUS its `<Name>_Data` folder,
 * its runtime library and its plugins; hashing only the named file left every
 * asset, scene and managed assembly out of the artifact's identity — the whole
 * game could be replaced while the digest stood (Codex 2026-09-13 AI#9). Only
 * a layout this process can RECOGNISE is adopted: the file's own directory
 * must hold a `*_Data` folder, which is what Unity writes beside a player.
 * Hashing any parent directory would pull unrelated builds and mutable output
 * into the identity.
 */
export function playerLayoutRoot(path: string): string {
  try {
    if (statSync(path).isDirectory()) return path;
    const dir = dirname(path);
    const hasData = readdirSync(dir).some((entry) => entry.endsWith('_Data') && statSync(join(dir, entry)).isDirectory());
    return hasData ? dir : path;
  } catch {
    return path;
  }
}

/**
 * The receipt itself, as the exact bytes a receiver will hash.
 *
 * A tool whose whole report is a JSON document cannot append a fenced block
 * without breaking every reader of that document, so it carries the receipt in
 * a field instead — the same bytes either way, which is what the hash is of.
 */
export function receiptRecord(input: ReceiptInput): string {
  const revision = projectRevision(input.projectPath);
  const artifactSha256 = artifactDigest(input.artifactPath);
  return JSON.stringify({
    schemaVersion: 1 as const,
    runId: input.runId,
    kind: input.kind,
    medium: input.medium,
    ...(revision === undefined ? {} : { revision }),
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(artifactSha256 === undefined ? {} : { artifactSha256 }),
    execution: input.execution,
    ...(input.sessionCount === undefined ? {} : { sessionCount: input.sessionCount }),
    ...(input.sessions === undefined ? {} : { sessions: input.sessions }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  });
}

/** The fenced block a tool appends to its own report. */
export function renderReceipt(input: ReceiptInput): string {
  return `\n\n\`\`\`${EVIDENCE_FENCE}\n${receiptRecord(input)}\n\`\`\``;
}

/** The run id a caller asked this invocation to answer for, when it did. */
export function evidenceRunId(input: Record<string, unknown>): string | undefined {
  const raw = input['evidenceRunId'];
  return typeof raw === 'string' && raw.trim() !== '' && raw.length <= 200 ? raw.trim() : undefined;
}

/** The receipt schema every tool that takes one advertises. */
export const EVIDENCE_RUN_ID_SCHEMA = {
  type: 'string',
  description:
    'The run id Strada.Brain issued for this invocation. When given, the tool appends a strada-evidence receipt ' +
    'naming the run, the tree it measured and how the process ended.',
} as const;
