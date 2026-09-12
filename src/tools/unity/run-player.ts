import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { resolveProjectPath } from './project-path.js';
import { judgePlaythrough, renderVerdict, withProcessOutcome, PLAYTHROUGH_VERDICT_FILE } from './playthrough.js';
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
import { resolveCaptureDir } from './capture-dir.js';

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

/** Spawn the player and wait for it to exit (SIGKILL at the deadline). */
export function runPlayerProcess(executable: string, args: string[], timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve(code ?? -1); });
    child.on('error', () => { clearTimeout(timer); resolve(-1); });
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
      timeoutMs: 900_000,
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
    rmSync(captureDir, { recursive: true, force: true });
    mkdirSync(captureDir, { recursive: true });
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
    const sessionsRequested = typeof input['sessions'] === 'string' ? MAX_SESSIONS_PER_RUN : 1;
    const timeoutMs = (boot + 15 + sessionsRequested * (deadline + 5)) * 1000 + 30_000;
    const exitCode = await runPlayerProcess(executable, args, timeoutMs);
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    const judged = judgePlaythrough(captureDir, undefined, log);
    // A PLAYER THAT DIED IS NOT A PLAYER THAT PLAYED. The exit code was
    // printed in the header and nowhere else: the verdict FILE — which is
    // what Strada.Brain reads — stayed green on exit 42, and `isError` said
    // nothing either (Codex 2026-09-12 Y). It goes into the verdict before
    // the file is written, so every reader sees it.
    const verdict = withProcessOutcome(judged, exitCode, true, 'player');
    try {
      writeFileSync(join(captureDir, PLAYTHROUGH_VERDICT_FILE), JSON.stringify(verdict, null, 2));
    } catch {
      /* the verdict is still returned */
    }
    const header =
      `Player: ${basename(artifact)} (${executable}); exit ${exitCode}` +
      (verdict.record === null ? ' — the runner wrote no record: the player exited before it armed, or the artifact was built without Strada.Core.Play.PlayerPlaythroughRunner' : '') +
      '\n';
    return { content: header + renderVerdict(verdict, captureDir), isError: !verdict.ok };
  }
}
