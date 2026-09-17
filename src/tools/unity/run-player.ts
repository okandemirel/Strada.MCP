import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EVIDENCE_RUN_ID_SCHEMA, evidenceRunId, renderReceipt } from '../../evidence/producer-receipt.js';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, basename, relative } from 'node:path';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { resolveProjectPath } from './project-path.js';
import { judgePlaythrough, receiptSessions, renderVerdict, withProcessOutcome, withRunId, PLAYTHROUGH_VERDICT_FILE } from './playthrough.js';
import type { PlaythroughVerdict } from './playthrough.js';
import { PLAYTHROUGH_RECORD_FILE, PLAYTHROUGH_CATALOG_TYPE, MAX_SESSIONS_PER_RUN } from './playthrough-test.js';

/**
 * Play the game inside the BUILT PLAYER and judge it.
 *
 * unity_playthrough proves a project can be played, in the editor under
 * -batchmode — a medium that renders only at capture points, so its frame
 * rate is a loop rate and no evidence about what a person will see. This tool
 * launches the artifact unity_build_player produced with Strada.Core's
 * PlayerPlaythroughRunner armed (`-stradaPlaythrough <json>`): the same drive
 * through Strada.Core.Play.IPlaythroughDriver, with real rendering and vsync.
 * The record it writes has the editor test's field names plus medium
 * "player", so the same judge applies: sessions reached an outcome, frames
 * drawn and moving, no errors — and a frame rate that means something.
 *
 * Runnable artifacts only: a macOS .app, a Windows .exe, a Linux executable.
 * An .apk or a WebGL folder cannot be run here and is said so.
 */
import { prepareCaptureDir, resolveCaptureDir } from './capture-dir.js';

export const PLAYER_CAPTURE_SUBDIR = join('Recordings', 'player-playthrough');

const RUNNABLE_EXT_RE = /\.(app|exe|x86_64|x86)$/i;

/** The executable to spawn for an artifact path, or null when it is not runnable here. */
export function findPlayerExecutable(artifactPath: string): string | null {
  if (!existsSync(artifactPath)) return null;
  const st = statSync(artifactPath);
  if (artifactPath.endsWith('.app') && st.isDirectory()) {
    const macos = join(artifactPath, 'Contents', 'MacOS');
    if (!existsSync(macos)) return null;
    const names = readdirSync(macos).filter((n) => !n.startsWith('.'));
    return names.length > 0 ? join(macos, names[0]!) : null;
  }
  if (st.isFile()) return RUNNABLE_EXT_RE.test(artifactPath) || (process.platform !== 'win32' && (st.mode & 0o111) !== 0) ? artifactPath : null;
  if (st.isDirectory()) {
    for (const name of readdirSync(artifactPath)) {
      const full = join(artifactPath, name);
      try {
        const s = statSync(full);
        if (name.endsWith('.app') && s.isDirectory()) return findPlayerExecutable(full);
        if (s.isFile() && /\.(exe|x86_64)$/i.test(name)) return full;
      } catch {
        /* unreadable entry */
      }
    }
  }
  return null;
}

/** The newest artifact under <project>/Builds/<target>/, or null. */
export function newestArtifact(projectPath: string): string | null {
  const builds = join(projectPath, 'Builds');
  if (!existsSync(builds)) return null;
  let best: { path: string; mtime: number } | null = null;
  const consider = (p: string): void => {
    try {
      const s = statSync(p);
      const runnable = findPlayerExecutable(p) !== null;
      if (!runnable) return;
      if (!best || s.mtimeMs > best.mtime) best = { path: p, mtime: s.mtimeMs };
    } catch {
      /* skip */
    }
  };
  for (const target of readdirSync(builds)) {
    const dir = join(builds, target);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    consider(dir);
    for (const entry of readdirSync(dir)) consider(join(dir, entry));
  }
  return best ? (best as { path: string }).path : null;
}

/**
 * How the player process ended, as THIS process observed it.
 *
 * The exit code alone could not tell a player killed at the deadline from one
 * that chose to exit non-zero, and a receipt that has to state `timedOut`
 * would have had to guess (Codex 2026-09-13 AH#9).
 */
export interface PlayerProcessOutcome {
  readonly exitCode: number;
  /** The deadline fired and this process killed the player. */
  readonly timedOut: boolean;
  /** The player was spawned and reached a close of its own. */
  readonly completed: boolean;
}

/**
 * THE MOST WALL-CLOCK ONE RUN MAY TAKE — the same number this tool's metadata
 * advertises, so the caller's wait and the run's own budget cannot disagree.
 *
 * They did: the run computed its own deadline from the sessions and the
 * document's session length (twelve 150-second rounds need over half an hour)
 * while the caller abandoned the call after fifteen minutes, so a game that
 * was behaving exactly as its document specifies could not be verified at all
 * (Codex 2026-09-13 AJ#1). A request that needs more than this is REFUSED
 * with the batch that fits, never silently abandoned.
 */
export const PLAY_RUN_BUDGET_MS = 45 * 60 * 1000;

/** What a run of `sessions` needs, at the allowances it was given. */
export function playRunBudgetMs(sessions: number, deadlineSeconds: number, bootSeconds: number): number {
  return (bootSeconds + 15 + Math.max(1, sessions) * (deadlineSeconds + 5)) * 1000 + 30_000;
}

/** How many sessions of this length fit ONE run's budget (at least one). */
export function sessionsThatFit(deadlineSeconds: number, bootSeconds: number, budgetMs = PLAY_RUN_BUDGET_MS): number {
  const perSession = (deadlineSeconds + 5) * 1000;
  const overhead = (bootSeconds + 15) * 1000 + 30_000;
  return Math.max(1, Math.floor((budgetMs - overhead) / perSession));
}

/**
 * How many sessions a `sessions` spec asks for — the same reading the runner
 * makes: "all" is every session the catalogue holds, bounded by one run's cap.
 */
export function countRequestedSessions(spec: unknown, cap = MAX_SESSIONS_PER_RUN): number {
  if (typeof spec !== 'string' || spec.trim() === '') return 1;
  const text = spec.trim().toLowerCase();
  if (text === 'all') return cap;
  let count = 0;
  for (const part of text.split(',')) {
    const range = part.trim().split('-');
    const a = Number(range[0]);
    if (range.length === 2 && Number.isInteger(a) && Number.isInteger(Number(range[1]))) {
      for (let i = a; i <= Number(range[1]) && count < cap; i++) if (i >= 1) count++;
    } else if (Number.isInteger(a) && a >= 1 && count < cap) {
      count++;
    }
  }
  return count === 0 ? 1 : Math.min(count, cap);
}

/**
 * A path as the READER will name it: relative to the project root.
 *
 * `/var` is a symlink to `/private/var` on macOS, so the lexical project root
 * and a resolved capture path produced "../../../../private/var/..." — a path
 * no reader could use (the same trap as the lease paths). Both sides are
 * resolved before they are compared, and an unresolvable path keeps its
 * lexical form.
 */
export function projectRelative(projectPath: string, target: string): string {
  const real = (at: string): string => {
    try {
      return realpathSync(at);
    } catch {
      return at;
    }
  };
  const rel = relative(real(projectPath), real(target));
  return rel.startsWith('..') ? relative(projectPath, target) : rel;
}

/** Spawn the player and wait for it to exit (SIGKILL at the deadline). */
export function runPlayerProcess(executable: string, args: string[], timeoutMs: number): Promise<PlayerProcessOutcome> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { stdio: 'ignore' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? -1, timedOut, completed: !timedOut }); });
    child.on('error', () => { clearTimeout(timer); resolve({ exitCode: -1, timedOut, completed: false }); });
  });
}

/**
 * THE RECEIPT FOR THE RUN THE CALLER ASKED FOR: the artifact that was played,
 * as this process measured it, and how the player ended.
 *
 * The player path returned none, so no play-through could ever be admitted —
 * the coordinator's receiver answered "the record names no artifact digest"
 * for every real run (Codex 2026-09-13 AH#6). Nothing here is a literal the
 * caller cannot check: a player this process SIGKILLed says so (AH#9).
 */
export function playerReceipt(
  dispatch: { readonly runId?: string; readonly target?: string },
  projectPath: string,
  artifact: string,
  process_: PlayerProcessOutcome,
  verdict: PlaythroughVerdict,
  /**
   * The verdict FILE this run wrote, when it wrote one: the reader judges the
   * delivery from those bytes, and a receipt that says nothing about them
   * authenticates no part of the measurement actually consumed (Codex
   * 2026-09-13 AJ#12).
   */
  verdictFile?: { readonly path: string; readonly bytes: string },
): string {
  const runId = dispatch.runId;
  if (runId === undefined) return '';
  const sessions = receiptSessions(verdict.record);
  const catalogue = verdict.record?.sessionCount;
  return renderReceipt({
    runId,
    kind: 'playthrough',
    medium: 'player',
    projectPath,
    artifactPath: artifact,
    // THE DISPATCH THIS RECORD ANSWERS — the run id and the caller's platform
    // label. Not a measurement: the artifact digest below is what binds the
    // record to the bytes that ran. A receipt that could not name the target
    // its ticket named was refused TARGET_MISMATCH for every real player run
    // (measured 2026-09-13 while closing AH#6).
    ...(dispatch.target === undefined ? {} : { target: dispatch.target }),
    execution: { completed: process_.completed, exitCode: process_.exitCode, timedOut: process_.timedOut },
    // THE CATALOGUE AS THE GAME REPORTS IT: -1 means "this game registers no
    // catalog", and passing that on would answer "play every session" with a
    // negative size.
    ...(typeof catalogue === 'number' && catalogue >= 0 ? { sessionCount: catalogue } : {}),
    ...(sessions === undefined ? {} : { sessions }),
    ...(verdictFile === undefined
      ? {}
      : {
        payload: {
          verdictPath: verdictFile.path,
          verdictSha256: createHash('sha256').update(verdictFile.bytes).digest('hex'),
        },
      }),
  });
}

export class RunPlayerTool implements ITool {
  readonly name = 'unity_run_player';
  readonly description =
    'Play the game inside the BUILT PLAYER (the artifact unity_build_player produced) and judge it: boots the ' +
    "player with Strada.Core's PlayerPlaythroughRunner armed, resolves the game's Strada.Core.Play.IPlaythroughDriver, " +
    'starts a session, acts until it ends, captures frames, and records boot time and REAL frame timing (rendering ' +
    "and vsync on — the only frame rate that speaks for what a person sees; the editor play-through's is a loop rate). " +
    `Writes ${PLAYTHROUGH_RECORD_FILE} and ${PLAYTHROUGH_VERDICT_FILE} under <projectPath>/${PLAYER_CAPTURE_SUBDIR}. ` +
    'Requires a runnable artifact on this machine (macOS .app, Windows .exe, Linux executable); an .apk or WebGL build is reported as not runnable here.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      projectPath: { type: 'string', description: 'Unity project root. Defaults to the tool context project path.' },
      artifactPath: { type: 'string', description: 'The built artifact (.app / .exe / directory). Default: the newest runnable artifact under <projectPath>/Builds/.' },
      session: { type: 'number', description: "Which session to start — the game's own index; default 1." },
      sessions: {
        type: 'string',
        description: `Which sessions to play in one run: "1-3", "2,5" or "all" (every session the game's ${PLAYTHROUGH_CATALOG_TYPE} reports, at most ${MAX_SESSIONS_PER_RUN}).`,
      },
      maxActions: { type: 'number', description: 'Upper bound on driver actions per session (default 60).' },
      deadlineSeconds: { type: 'number', description: 'How long a session may run before it is judged unfinished (default 45).' },
      evidenceRunId: EVIDENCE_RUN_ID_SCHEMA,
      evidenceTarget: {
        type: 'string',
        description:
          'The platform label the caller\'s ticket names for this run (e.g. StandaloneOSX). Echoed into the receipt ' +
          'so the coordinator can tell which dispatch the record answers; it changes nothing about what is played.',
      },
      outcomeRequired: {
        type: 'boolean',
        description:
          'Does the game\'s own document require a session to END (a win or a lose state)? Default false: an endless ' +
          'or sandbox session that stays interactive is behaving as designed, and its lack of an outcome is disclosed ' +
          'rather than held against it.',
      },
      bootDeadlineSeconds: { type: 'number', description: 'How long the bootstrapper may take to publish its services (default 30).' },
      captureDir: { type: 'string', description: `Where frames, the record and the verdict go (default <projectPath>/${PLAYER_CAPTURE_SUBDIR}; wiped before the run).` },
    },
    required: [],
  };
  get metadata(): ToolMetadata {
    return {
      category: 'unity-runtime',
      requiresBridge: false,
      dangerous: false,
      readOnly: false,
      requiredBridgeMethods: [],
      requiredBridgeCapabilities: [],
      timeoutMs: PLAY_RUN_BUDGET_MS,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const projectPath = resolveProjectPath(input['projectPath'], context.projectPath).projectPath;
    if (!projectPath) return { content: 'Error: no Unity project path (pass projectPath or configure the tool context).', isError: true };
    const artifactInput = typeof input['artifactPath'] === 'string' && input['artifactPath'].trim() !== '' ? input['artifactPath'].trim() : undefined;
    const artifact = artifactInput ? (isAbsolute(artifactInput) ? artifactInput : join(projectPath, artifactInput)) : newestArtifact(projectPath);
    if (!artifact) {
      return { content: `Error: no runnable player artifact under ${join(projectPath, 'Builds')} — run unity_build_player first (a macOS .app, Windows .exe or Linux executable is needed here).`, isError: true };
    }
    const executable = findPlayerExecutable(artifact);
    if (!executable) {
      return { content: `Error: ${artifact} is not a player this machine can run (an .apk, WebGL folder or missing executable) — nothing was played.`, isError: true };
    }
    // THE RECORDER OWNS ITS DIRECTORY. This took the caller's path and began
    // by clearing it, so `captureDir: "."` resolved to the project root and
    // deleted the game (Codex 2026-09-12 U#F7, X).
    const decision = resolveCaptureDir(projectPath, input['captureDir'], PLAYER_CAPTURE_SUBDIR);
    if (decision.dir === undefined) return { content: `Error: ${decision.reason}`, isError: true };
    const captureDir = decision.dir;
    // NEVER CLEARS WHAT IT DOES NOT OWN (Codex 2026-09-12 Z#7).
    const ready = prepareCaptureDir(captureDir);
    if (!ready.ok) return { content: `Error: ${ready.reason}`, isError: true };
    const jsonPath = join(captureDir, PLAYTHROUGH_RECORD_FILE);
    const logPath = join(captureDir, 'player.log');
    const deadline = typeof input['deadlineSeconds'] === 'number' ? Math.floor(input['deadlineSeconds']) : 45;
    const boot = typeof input['bootDeadlineSeconds'] === 'number' ? Math.floor(input['bootDeadlineSeconds']) : 30;
    const args = [
      '-stradaPlaythrough', jsonPath,
      '-stradaCaptureDir', captureDir,
      '-stradaPlaythroughDeadline', String(deadline),
      '-stradaPlaythroughBootDeadline', String(boot),
      '-logFile', logPath,
      '-screen-fullscreen', '0', '-screen-width', '1280', '-screen-height', '720',
    ];
    if (typeof input['session'] === 'number') args.push('-stradaPlaythroughSession', String(Math.floor(input['session'])));
    if (typeof input['sessions'] === 'string' && input['sessions'].trim()) args.push('-stradaPlaythroughSessions', input['sessions'].trim());
    if (typeof input['maxActions'] === 'number') args.push('-stradaPlaythroughMaxActions', String(Math.floor(input['maxActions'])));
    // THE OUTCOME CONTRACT REACHES THE PLAYER. It went to the editor path and
    // not to this one, so an endless game's player run still exited 30 and
    // was refused (Codex 2026-09-13 AH#1).
    const outcomeRequired = input['outcomeRequired'] === true;
    if (outcomeRequired) args.push('-stradaPlaythroughOutcomeRequired', '1');
    // WHAT THIS RUN NEEDS, against what the caller will wait. A request that
    // needs longer is refused with the batch that fits: the caller's wait and
    // the run's budget used to disagree, so a correct game with long rounds
    // was abandoned mid-play with no verdict at all (Codex 2026-09-13 AJ#1).
    const sessionsRequested = countRequestedSessions(input['sessions']);
    const needsMs = playRunBudgetMs(sessionsRequested, deadline, boot);
    if (needsMs > PLAY_RUN_BUDGET_MS) {
      const fits = sessionsThatFit(deadline, boot);
      return {
        content:
          `Error: ${sessionsRequested} session(s) at ${deadline} s each need ${Math.round(needsMs / 1000)} s, and one run may take `
          + `${Math.round(PLAY_RUN_BUDGET_MS / 1000)} s — nothing was played. Ask for sessions "1-${fits}" and accumulate the batches.`,
        isError: true,
      };
    }
    const timeoutMs = needsMs;
    const process_ = await runPlayerProcess(executable, args, timeoutMs);
    const exitCode = process_.exitCode;
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    const judged = judgePlaythrough(captureDir, undefined, log, { outcomeRequired });
    // A PLAYER THAT DIED IS NOT A PLAYER THAT PLAYED. The exit code was
    // printed in the header and nowhere else: the verdict FILE — which is
    // what Strada.Brain reads — stayed green on exit 42, and `isError` said
    // nothing either (Codex 2026-09-12 Y). It goes into the verdict before
    // the file is written, so every reader sees it.
    // …AND THE RUN IT ANSWERS: the id the caller issued goes into the file,
    // so the reader can tell this run's verdict from an older one that a
    // clock or a copy made look fresh (Strada.Brain plan 1.3).
    const verdict = withRunId(withProcessOutcome(judged, exitCode, true, 'player'), evidenceRunId(input));
    // THE BYTES THE READER WILL READ. Strada.Brain judges the delivery from
    // this FILE — its frame rate, its frames, its errors — and the receipt
    // said nothing about it, so an admitted receipt authenticated no part of
    // the measurement that was actually consumed (Codex 2026-09-13 AJ#12).
    const verdictBytes = JSON.stringify(verdict, null, 2);
    const verdictPath = join(captureDir, PLAYTHROUGH_VERDICT_FILE);
    try {
      writeFileSync(verdictPath, verdictBytes);
    } catch {
      /* the verdict is still returned */
    }
    const label = typeof input['evidenceTarget'] === 'string' && input['evidenceTarget'].trim() !== '' ? input['evidenceTarget'].trim() : undefined;
    const receipt = playerReceipt(
      { ...(evidenceRunId(input) === undefined ? {} : { runId: evidenceRunId(input) }), ...(label === undefined ? {} : { target: label }) },
      projectPath, artifact, process_, verdict,
      { path: projectRelative(projectPath, verdictPath), bytes: verdictBytes },
    );
    const header =
      `Player: ${basename(artifact)} (${executable}); exit ${exitCode}` +
      (verdict.record === null ? ' — the runner wrote no record: the player exited before it armed, or the artifact was built without Strada.Core.Play.PlayerPlaythroughRunner' : '') +
      '\n';
    return { content: header + renderVerdict(verdict, captureDir) + receipt, isError: !verdict.ok };
  }
}
