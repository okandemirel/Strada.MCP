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
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const EVIDENCE_FENCE = 'strada-evidence';

export interface ReceiptExecution {
  readonly completed: boolean;
  /** `null` when this operation owns no process of its own (a live bridge). */
  readonly exitCode: number | null;
  readonly timedOut: boolean;
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
  readonly payload?: Record<string, unknown>;
}

/** The project's revision as THIS process reads it, or nothing. */
export function projectRevision(projectPath: string): string | undefined {
  try {
    const out = execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{40}$/i.test(out) ? out : undefined;
  } catch {
    return undefined;
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
    const walk = (at: string, rel: string): void => {
      const st = statSync(at);
      if (st.isDirectory()) {
        for (const entry of readdirSync(at).sort()) walk(join(at, entry), `${rel}/${entry}`);
        return;
      }
      hash.update(`${rel}:${st.size}\n`);
    };
    walk(path, '');
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

/** The fenced block a tool appends to its own report. */
export function renderReceipt(input: ReceiptInput): string {
  const revision = projectRevision(input.projectPath);
  const artifactSha256 = artifactDigest(input.artifactPath);
  const record = {
    schemaVersion: 1 as const,
    runId: input.runId,
    kind: input.kind,
    medium: input.medium,
    ...(revision === undefined ? {} : { revision }),
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(artifactSha256 === undefined ? {} : { artifactSha256 }),
    execution: input.execution,
    ...(input.sessionCount === undefined ? {} : { sessionCount: input.sessionCount }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  };
  return `\n\n\`\`\`${EVIDENCE_FENCE}\n${JSON.stringify(record)}\n\`\`\``;
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
