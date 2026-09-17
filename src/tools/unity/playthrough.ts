/**
 * unity_playthrough — play the game, headlessly, and say whether it can be played.
 *
 * Every other runtime check answers a narrower question: does it compile, does
 * the scene boot, did the tests pass. None of them starts a session and plays
 * it. Measured 2026-09-10 on the test vehicle: the campaign delivered "green"
 * on compile + PlayMode tests + art counts while no scene had ever gone from
 * boot to an outcome under observation, and the entry scene idled after boot
 * because nothing at runtime starts a session.
 *
 * This tool writes the play-through test (see playthrough-test.ts), runs only
 * that test with a graphics device, reads the record it leaves and the frames
 * it captured, and renders a verdict from three kinds of evidence: what the
 * game reported through its Strada.Core.Play.IPlaythroughDriver (phases,
 * actions, outcome, errors), what the frames show (flat or drawn, moving or
 * still — measured from pixels), and what the test runner concluded. The
 * verdict is also written as JSON beside the frames so a delivery gate can
 * read it without parsing prose. Nothing here knows a game's own names.
 */
import { mkdtempSync, readFileSync, existsSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ReceiptSession } from '../../evidence/producer-receipt.js';
import { EVIDENCE_RUN_ID_SCHEMA, evidenceRunId } from '../../evidence/producer-receipt.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from './local-diagnostics.js';
import { buildPlaymodeArgs, runUnityProcess } from './playmode-verify.js';
import { PLAY_RUN_BUDGET_MS, countRequestedSessions, playRunBudgetMs, sessionsThatFit } from './run-player.js';
import { parseTestRun } from './nunit-results.js';
import { resolveProjectPath } from './project-path.js';
import { decodePngRgba, frameMetrics, motionShare, type FrameMetrics } from './png-metrics.js';
import {
  PLAYTHROUGH_DRIVER_TYPE,
  PLAYTHROUGH_RECORD_FILE,
  PLAYTHROUGH_TEST_CLASS,
  emitPlaythroughTest, PLAYTHROUGH_CATALOG_TYPE, MAX_SESSIONS_PER_RUN } from './playthrough-test.js';

export const PLAYTHROUGH_VERDICT_FILE = 'playthrough-verdict.json';

/** The verdict stamped with the run id it answers, when one was issued. */
export function withRunId(verdict: PlaythroughVerdict, runId: string | undefined): PlaythroughVerdict {
  return runId === undefined ? verdict : { ...verdict, runId };
}
import { prepareCaptureDir, resolveCaptureDir } from './capture-dir.js';

export const DEFAULT_CAPTURE_SUBDIR = 'Recordings/playthrough';
/** Below this share of moved samples between the most different pair of frames, nothing on screen responded to play. */
export const MIN_MOTION_SHARE = 0.01;

/** What the generated test records (see playthrough-test.ts); field names are the JSON's. */
export interface PlaythroughRecord {
  /** "player" when Strada.Core's PlayerPlaythroughRunner wrote it inside a built player; absent/other = the editor test. */
  medium?: string;
  scene: string;
  session: number;
  driverType?: string;
  /** Why the test could not even start driving: no scene, no bootstrapper, no driver. */
  missing?: string;
  phaseAfterBoot?: string;
  /** IsSessionActive read after boot, before StartSession: does the game start play by itself? */
  autoStarted: boolean;
  startAccepted: boolean;
  phasesSeen: string[];
  actions: number;
  /** PlaythroughOutcome name: None, Won, Lost, Ended. */
  outcome?: string;
  reachedOutcome: boolean;
  framesCaptured: number;
  elapsedSeconds: number;
  /** Scene load start → services published; absent or negative when the bootstrapper never published. */
  bootSeconds?: number;
  /** Play-loop wall time and counted frames (frames right after a capture stall are not counted). */
  playSeconds?: number;
  playFrames?: number;
  worstFrameMs?: number;
  /** ISessionCatalog.SessionCount; -1 (or absent) when the game registers no catalog. */
  sessionCount?: number;
  /** Every session the run played, in order (absent on records from older tests). */
  sessions?: SessionRecord[];
  /** What was on screen at the end of play — code-instantiated objects included (absent on older records). */
  runtime?: RuntimeDump;
  errors: string[];
}

export interface RuntimeDump {
  renderers: number;
  worldRenderers: number;
  spriteRenderers: number;
  meshRenderers: number;
  canvases: number;
  particleSystems: number;
  audioSources: number;
  audioPlaying: number;
  sprites: string[];
  meshes: string[];
  primitiveMeshes: number;
}

export interface SessionRecord {
  index: number;
  startAccepted: boolean;
  phasesSeen: string[];
  actions: number;
  outcome?: string;
  reachedOutcome: boolean;
  seconds: number;
  lastPhase?: string;
  /** The index the run ASKED for; absent on records from older runners. */
  requestedIndex?: number;
  /**
   * Whether this session IS the content the run asked for. A game may start
   * playing by itself after boot; the run then adopts that session, and only
   * the game can say which one it is (Strada.Core.Play.IActiveSession). False
   * means the outcome certifies no particular content — an auto-started level
   * 1 used to certify level 7 (Codex 2026-09-12 X). Absent on older records.
   */
  identityVerified?: boolean;
  /**
   * WHERE that identity came from: 'active-session' (the game's own
   * IActiveSession named this session), 'start-acceptance' (the driver
   * accepted the request and the game registers no identity service, so
   * nothing contradicted it) or 'unverified'. The flag alone could not tell a
   * game that CONFIRMED the content from one that merely did not deny it
   * (Codex 2026-09-12 AC J1). Absent on older records.
   */
  identitySource?: 'active-session' | 'start-acceptance' | 'unverified';
  /**
   * The index the game reported as active, when something observed it.
   *
   * Negative (or absent) means NOBODY observed it — the game registers no
   * IActiveSession. Zero is the contract's "no session is running", which is
   * an observation, and conflating the two made a correct game without the
   * identity service contradict itself (Codex 2026-09-13 AI#7).
   */
  observedIndex?: number;
  /**
   * What the RUNNER saw of the loaded content, independently of the game's own
   * claim: two sessions with the SAME fingerprint are one level played twice
   * (Codex 2026-09-13 AG#1). Absent on older records.
   */
  contentFingerprint?: string;
}

/**
 * The sessions a play-through can ANSWER FOR, in the receipt's own shape.
 *
 * A session is carried only when the runner measured everything a receiver
 * needs to judge it: which session was asked for, which was played, and
 * whether the game confirmed the identity. An older runner that reports none
 * of that leaves the session out, and the receiver then says the session is
 * missing — which is true — instead of admitting a record whose gaps were
 * filled in here (Codex 2026-09-13 AH#6).
 */
export function receiptSessions(record: PlaythroughRecord | null): ReceiptSession[] | undefined {
  const sessions = record?.sessions;
  if (sessions === undefined) return undefined;
  const out: ReceiptSession[] = [];
  for (const s of sessions) {
    if (typeof s.requestedIndex !== 'number' || typeof s.identityVerified !== 'boolean') continue;
    out.push({
      requestedIndex: s.requestedIndex,
      index: s.index,
      // AN ABSENT OBSERVATION IS NOT A ZERO ONE (AI#7): a negative index is
      // the runner saying nothing observed the session, so the receipt carries
      // no observation rather than "no session was running".
      ...(typeof s.observedIndex === 'number' && s.observedIndex >= 0 ? { observedIndex: s.observedIndex } : {}),
      identityVerified: s.identityVerified,
      ...(s.identitySource === undefined ? {} : { identitySource: s.identitySource }),
      actions: s.actions,
      outcome: s.outcome ?? 'None',
      reachedOutcome: s.reachedOutcome,
      seconds: s.seconds,
    });
  }
  return out;
}

/**
 * What the run measured about speed. `medium` names the conditions, because
 * a number without them is a guess: this is the EDITOR in play mode under
 * -batchmode with a real graphics device, not the shipped player. Boot time
 * and hitches transfer; the average frame rate is a floor, not the player's.
 */
export type PlaythroughMedium = 'editor-playmode-batch' | 'player';

export interface PlaythroughPerf {
  readonly medium: PlaythroughMedium;
  readonly bootSeconds?: number;
  readonly playSeconds: number;
  readonly playFrames: number;
  readonly avgFps?: number;
  readonly worstFrameMs?: number;
}

/** Performance from the record; undefined when the run never reached the play loop. */
export function perfFromRecord(record: PlaythroughRecord | null): PlaythroughPerf | undefined {
  if (record === null) return undefined;
  const playSeconds = typeof record.playSeconds === 'number' && record.playSeconds > 0 ? record.playSeconds : 0;
  const playFrames = typeof record.playFrames === 'number' && record.playFrames > 0 ? record.playFrames : 0;
  const boot = typeof record.bootSeconds === 'number' && record.bootSeconds >= 0 ? record.bootSeconds : undefined;
  if (playSeconds === 0 && boot === undefined) return undefined;
  return {
    medium: record.medium === 'player' ? 'player' : 'editor-playmode-batch',
    ...(boot !== undefined ? { bootSeconds: boot } : {}),
    playSeconds,
    playFrames,
    ...(playFrames > 0 && playSeconds > 0 ? { avgFps: playFrames / playSeconds } : {}),
    ...(typeof record.worstFrameMs === 'number' && record.worstFrameMs > 0 ? { worstFrameMs: record.worstFrameMs } : {}),
  };
}

export interface PlaythroughVerdict {
  readonly ok: boolean;
  /** Each reason the verdict is not ok; empty when ok. */
  readonly reasons: string[];
  /**
   * What the run observed and did NOT hold against the game: a session that
   * stayed interactive where no outcome was required, for instance (Codex
   * 2026-09-13 AG#3). Disclosure, never a refusal.
   */
  readonly notes?: string[];
  readonly record: PlaythroughRecord | null;
  readonly frames: {
    readonly count: number;
    readonly unreadable: number;
    readonly flat: number;
    /** Largest share of moved samples between consecutive readable frames. */
    readonly maxMotionShare: number;
    readonly first?: FrameMetrics;
    readonly last?: FrameMetrics;
  };
  /** What the NUnit run said, when there was one. */
  readonly test?: { total: number; passed: number; failed: number; result: string };
  /** Boot time and frame timing of the run, when it reached the play loop. */
  readonly perf?: PlaythroughPerf;
  /**
   * The run id the caller issued for THIS invocation, echoed into the file
   * the reader judges from. Without it the reader's "a verdict from another
   * attempt is not this attempt's proof" check compared nothing on the
   * player path (Strada.Brain plan 1.3).
   */
  readonly runId?: string;
  /**
   * Error/exception lines from Unity's own log for the run (last 30). The
   * test's record only sees what is logged after it subscribes; a bootstrap
   * that refuses in a RuntimeInitializeOnLoad hook, or a config that fails
   * validation, says why HERE and nowhere the record can reach (measured
   * 2026-09-10: "Services stayed null for 30 s", record.errors empty, the
   * cause in the editor log).
   */
  readonly unityLog?: string[];
  readonly measuredAt: string;
}

/** The lines of a Unity log that name a failure, newest last, at most `max`. */
export function unityLogFailureLines(log: string, max = 30): string[] {
  const out: string[] = [];
  for (const line of log.split('\n')) {
    if (/\b(error CS\d+|Exception|NullReference|Validation failed|failed to|could not|not found|Assertion failed|\[Error\]|\bError\b)/i.test(line) && !/warning CS/i.test(line)) {
      out.push(line.trim().slice(0, 300));
    }
  }
  return out.slice(-max);
}

/**
 * Lines of a Unity log that name an exception thrown from a STARTUP callback.
 *
 * Unity keeps running after one — the object is half-initialised and the game
 * is not the game the project describes — and the log travelled as
 * informational text while the verdict said ok (Codex 2026-09-13 AG#5). Only
 * the startup callbacks: an exception during play is already recorded by the
 * runner itself, with its own context.
 */
export function startupExceptionLines(log: string, max = 10): string[] {
  const lines = log.split('\n');
  const out: string[] = [];
  const STARTUP_FRAME = /\b(?:Awake|OnEnable|Start|Initialize|InitializeOnLoad|RuntimeInitializeOnLoad|Bootstrap\w*)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // `NullReferenceException` has no word boundary before "Exception", so a
    // leading \b made this match nothing at all.
    if (!/Exception\b|\bError:/i.test(line)) continue;
    // A line that merely mentions handling one is not one being thrown.
    if (/\b(?:caught|handled|expected|suppress\w*)\b/i.test(line)) continue;
    // THE STACK SAYS WHERE IT CAME FROM, and it is on the FOLLOWING lines:
    // Unity writes the message first and the frames under it.
    const head = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join('\n');
    if (!STARTUP_FRAME.test(head)) continue;
    out.push(line.trim().slice(0, 300));
    if (out.length >= max) break;
  }
  return out;
}

/** The first enabled scene in Build Settings, by name; null when none is enabled or the file is unreadable. */
export function entrySceneFromBuildSettings(projectPath: string): string | null {
  try {
    const text = readFileSync(join(projectPath, 'ProjectSettings', 'EditorBuildSettings.asset'), 'utf8');
    const entries = text.split(/\n\s*- /).slice(1);
    for (const entry of entries) {
      if (!/enabled:\s*1/.test(entry)) continue;
      // THE WHOLE PATH LINE. `\S+` stopped at the first space, so
      // "Assets/Scenes/Main Menu.unity" loaded as "Main" — a scene that does
      // not exist (Codex 2026-09-12 X). Internal spaces are part of the name.
      const path = /path:[ \t]*([^\r\n]+)/.exec(entry)?.[1]?.trim();
      if (!path) continue;
      const file = path.split('/').pop() ?? path;
      return file.replace(/\.unity$/, '');
    }
  } catch {
    /* unreadable → null */
  }
  return null;
}

/**
 * Judge a finished run from what it left on disk. Pure over the directory, so
 * the verdict can be tested without Unity and re-derived by anyone later.
 */
export function judgePlaythrough(
  captureDir: string,
  test?: { total: number; passed: number; failed: number; result: string },
  unityLog?: string,
  /**
   * Does the caller's own document require a session to END?
   *
   * An endless or sandbox session that stays interactive, acts and draws is a
   * game behaving as designed — and it was reported `ok: false, "session 1
   * never ended after 60 actions"`, which no amount of correct implementation
   * could change (Codex 2026-09-13 AG#3). When no outcome is required the
   * absence of one is DISCLOSED, not a failure. Default: not required —
   * a producer cannot know a game's win condition, and the caller can.
   */
  opts?: { outcomeRequired?: boolean },
): PlaythroughVerdict {
  const outcomeRequired = opts?.outcomeRequired === true;
  const notes: string[] = [];
  const reasons: string[] = [];
  let record: PlaythroughRecord | null = null;
  const recordPath = join(captureDir, PLAYTHROUGH_RECORD_FILE);
  if (existsSync(recordPath)) {
    try {
      record = JSON.parse(readFileSync(recordPath, 'utf8')) as PlaythroughRecord;
    } catch (error) {
      reasons.push(`the play-through record is not valid JSON (${String(error)})`);
    }
  } else {
    reasons.push(
      'no play-through record was written — the test never reached its own bookkeeping (it did not compile, did not run, or the scene never loaded)',
    );
  }

  // A CAPTURE NAMES THE SESSION IT BELONGS TO, when the producer says so:
  // `frame_s02_00013.png`. One shared frame budget used to be spent on the
  // first session, so later levels rendered nothing anybody could see and the
  // run passed on the earlier images (Codex 2026-09-13 AG#6).
  const frameFiles = existsSync(captureDir)
    ? readdirSync(captureDir)
        .filter((f) => /^frame_(?:s\d+_)?\d+\.png$/.test(f))
        .sort()
    : [];
  const sessionOfFrame = (file: string): number | undefined => {
    const at = /^frame_s(\d+)_/.exec(file);
    return at ? Number(at[1]) : undefined;
  };
  const framesPerSession = new Map<number, string[]>();
  for (const file of frameFiles) {
    const index = sessionOfFrame(file);
    if (index === undefined) continue;
    framesPerSession.set(index, [...(framesPerSession.get(index) ?? []), file]);
  }
  let unreadable = 0;
  let flat = 0;
  let maxMotion = 0;
  let previous: ReturnType<typeof decodePngRgba> = null;
  let first: FrameMetrics | undefined;
  let last: FrameMetrics | undefined;
  for (const file of frameFiles) {
    const decoded = decodePngRgba(new Uint8Array(readFileSync(join(captureDir, file))));
    if (decoded === null) {
      unreadable++;
      continue;
    }
    const metrics = frameMetrics(decoded);
    if (metrics.flat) flat++;
    first ??= metrics;
    last = metrics;
    if (previous !== null) {
      const motion = motionShare(previous, decoded);
      if (motion !== null && motion > maxMotion) maxMotion = motion;
    }
    previous = decoded;
  }
  const readable = frameFiles.length - unreadable;

  if (record !== null) {
    const sessions = record.sessions && record.sessions.length > 0 ? record.sessions : null;
    if (record.missing) reasons.push(record.missing);
    else if (sessions) {
      // Several sessions: each is judged; the top-level fields only mirror the first.
      for (const s of sessions) {
        if (!s.startAccepted) reasons.push(`the driver refused to start session ${s.index}`);
        else if (!s.reachedOutcome) {
          const said =
            `session ${s.index} never ended after ${s.actions} actions ` +
            `(phases seen: ${s.phasesSeen.length > 0 ? s.phasesSeen.join(' → ') : 'none'})`;
          if (outcomeRequired) reasons.push(said);
          else notes.push(`${said} — no terminal outcome was required of it`);
        }
      }
    } else if (!record.startAccepted) reasons.push(`the driver refused to start session ${record.session}`);
    else if (!record.reachedOutcome) {
      const said =
        `session ${record.session} never ended after ${record.actions} actions ` +
        `(phases seen: ${record.phasesSeen.length > 0 ? record.phasesSeen.join(' → ') : 'none'})`;
      if (outcomeRequired) reasons.push(said);
      else notes.push(`${said} — no terminal outcome was required of it`);
    }
    if (record.errors.length > 0) {
      reasons.push(`${record.errors.length} error(s) logged during play, first: ${record.errors[0]}`);
    }
  }
  // EVERY SESSION THAT PLAYED MUST HAVE BEEN SEEN. Judged only where the
  // producer names its captures — an older runner's frames carry no session,
  // and are read exactly as before (AG#6).
  if (record !== null && framesPerSession.size > 0) {
    const played = (record.sessions ?? []).filter((s) => s.startAccepted);
    const unseen = played.filter((s) => (framesPerSession.get(s.index) ?? []).length === 0).map((s) => s.index);
    if (unseen.length > 0) {
      reasons.push(
        `session(s) ${unseen.join(', ')} played with no frame captured of them — nothing here shows what they rendered`,
      );
    }
  }
  // AN EXCEPTION THROWN WHILE THE GAME WAS STARTING is part of the verdict.
  // The log's failure lines travelled as informational text, so a run whose
  // `SaveManager.Awake` threw a NullReferenceException — before the runner
  // could even subscribe to errors — came back ok:true with reasons: []
  // (Codex 2026-09-13 AG#5). A game that cannot start has not been played.
  if (unityLog !== undefined) {
    const fatal = startupExceptionLines(unityLog);
    if (fatal.length > 0) {
      reasons.push(
        `${fatal.length} unhandled exception(s) while the game was starting, first: ${fatal[0]!.slice(0, 200)}`,
      );
    }
  }
  if (frameFiles.length === 0) reasons.push('no frames were captured (no camera, or no capture directory)');
  else if (readable < 2) reasons.push(`only ${readable} readable frame(s) of ${frameFiles.length}`);
  else {
    if (flat === readable) reasons.push(`every frame is flat (one colour): nothing visible was drawn`);
    if (maxMotion < MIN_MOTION_SHARE) {
      reasons.push(`nothing on screen changed during play (max moved share ${(maxMotion * 100).toFixed(1)}%)`);
    }
  }
  if (test !== undefined && test.total === 0) {
    reasons.push('the test runner executed zero tests — the play-through test did not compile or was filtered out');
  } else if (test !== undefined) {
    // A FAILED RUN IS NOT A PASS. Only "zero tests" was refused, so
    // {total:1, passed:0, failed:1, result:"Failed"} with good frames and a
    // good record came back ok:true (Codex 2026-09-12 U#F4, X). The runner's
    // own verdict and its counts both have to say it passed.
    if (test.failed > 0) reasons.push(`${test.failed} of ${test.total} play-through test(s) FAILED`);
    else if (!/^(?:passed|success(?:ful)?|succeeded|ok)$/i.test(test.result.trim())) {
      reasons.push(`the test runner's own verdict is "${test.result}" — ${test.passed} of ${test.total} passed`);
    } else if (test.passed <= 0) {
      reasons.push(`${test.total} play-through test(s) collected and none ran to a pass`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    ...(notes.length > 0 ? { notes } : {}),
    record,
    frames: {
      count: frameFiles.length,
      unreadable,
      flat,
      maxMotionShare: Number(maxMotion.toFixed(4)),
      ...(first ? { first } : {}),
      ...(last ? { last } : {}),
    },
    ...(test ? { test } : {}),
    ...((() => { const perf = perfFromRecord(record); return perf ? { perf } : {}; })()),
    ...(unityLog !== undefined ? { unityLog: unityLogFailureLines(unityLog) } : {}),
    measuredAt: new Date().toISOString(),
  };
}

/** The catalog and every session played: what a level count and "each level can be finished" rest on. */
/** The optional contract that names which session is in progress. */
export const PLAYTHROUGH_ACTIVE_SESSION_TYPE = 'Strada.Core.Play.IActiveSession';

/**
 * The verdict, with HOW THE PROCESS ENDED folded in.
 *
 * The exit code was printed in the header and nowhere else, so with good
 * frames and a good record an editor that exited 42 — or one that produced no
 * NUnit results at all — printed "PLAY-THROUGH OK" and left the verdict FILE
 * green, and that file is what Strada.Brain reads for its delivery proof
 * (Codex 2026-09-12 Y#J4.5 for the player, Z for the editor).
 */
export function withProcessOutcome<T extends { ok: boolean; reasons: string[] }>(
  judged: T,
  exitCode: number,
  hasTestResults: boolean,
  medium: 'editor' | 'player',
): T {
  const reasons: string[] = [];
  if (exitCode !== 0) {
    reasons.push(
      exitCode === -1
        ? `the ${medium} never exited normally — killed at its allowance, or it could not start`
        : `the ${medium} exited ${exitCode}`,
    );
  }
  // An editor run IS an NUnit test run: no results file means nothing was
  // judged by the runner, whatever the frames show. The built player has no
  // NUnit results by design, so this only applies to the editor.
  if (medium === 'editor' && !hasTestResults) reasons.push('the play-through test produced no NUnit results file');
  if (reasons.length === 0) return judged;
  return { ...judged, ok: false, reasons: [...judged.reasons, ...reasons] };
}

export function renderSessions(r: PlaythroughRecord): string {
  const catalog =
    typeof r.sessionCount === 'number' && r.sessionCount >= 0
      ? `catalog ${r.sessionCount} session(s)`
      : `no session catalog registered (${PLAYTHROUGH_CATALOG_TYPE}) — the level count cannot be measured`;
  const played = r.sessions && r.sessions.length > 0 ? r.sessions : null;
  if (!played) return `Sessions: ${catalog}.`;
  const parts = played.map((s) => {
    // A session the run ADOPTED and could not identify says so: its outcome
    // belongs to whatever the game was already playing (Codex 2026-09-12 X).
    const identity =
      s.identityVerified === false
        ? ` — CONTENT UNVERIFIED (asked for #${s.requestedIndex ?? s.index}; the game was already playing and registers no ${PLAYTHROUGH_ACTIVE_SESSION_TYPE})`
        // WHOSE WORD THE IDENTITY IS. "Verified" on the driver's own
        // acceptance is a weaker claim than the game naming the session, and
        // the report showed them identically (Codex 2026-09-12 AC J1).
        : s.identitySource === 'start-acceptance'
        ? ` — identity on the driver's acceptance alone (no ${PLAYTHROUGH_ACTIVE_SESSION_TYPE} registered)`
        : '';
    return !s.startAccepted
      ? `#${s.index} refused${identity}`
      : `#${s.index} ${s.reachedOutcome ? s.outcome : 'never ended'} in ${s.actions} actions (${s.seconds.toFixed(1)} s)${identity}`;
  });
  return `Sessions: ${catalog}; played ${played.length}: ${parts.join(', ')}.`;
}

/** What the scene held at the end of play: the file scan's blind spot (runtime instantiation) made visible. */
export function renderRuntime(d: RuntimeDump): string {
  const sprites = d.sprites.length > 0 ? `; sprites: ${d.sprites.slice(0, 8).join(', ')}${d.sprites.length > 8 ? ', …' : ''}` : '';
  const meshes = d.meshes.length > 0 ? `; meshes: ${d.meshes.slice(0, 6).join(', ')}${d.meshes.length > 6 ? ', …' : ''}` : '';
  const prim = d.primitiveMeshes > 0 ? ` (${d.primitiveMeshes} engine primitive${d.primitiveMeshes === 1 ? '' : 's'})` : '';
  return (
    `Runtime at end of play: ${d.worldRenderers} world renderer(s) (${d.spriteRenderers} sprite, ${d.meshRenderers} mesh${prim})` +
    `${sprites}${meshes}; ${d.canvases} canvas(es), ${d.particleSystems} particle system(s), ${d.audioSources} audio source(s), ${d.audioPlaying} playing.`
  );
}

/** One line, naming the medium: numbers from the batch editor are not the player's. */
export function renderPerf(p: PlaythroughPerf): string {
  const parts: string[] = [];
  if (p.bootSeconds !== undefined) {
    // The built player measures this from its own launch (Strada.Core, Codex
    // 2026-09-12 AB J4.2); the editor's is from scene load.
    parts.push(
      p.medium === 'player'
        ? `boot ${p.bootSeconds.toFixed(1)} s from launch to services`
        : `boot ${p.bootSeconds.toFixed(1)} s to services`,
    );
  }
  if (p.playFrames > 0 && p.avgFps !== undefined) {
    parts.push(`${p.playFrames} frames in ${p.playSeconds.toFixed(1)} s = ${p.avgFps.toFixed(1)} fps average`);
  } else if (p.playSeconds > 0) parts.push(`${p.playSeconds.toFixed(1)} s of play, no frame timing recorded`);
  if (p.worstFrameMs !== undefined) parts.push(`worst frame ${p.worstFrameMs.toFixed(0)} ms`);
  const where = p.medium === 'player' ? 'built player, real rendering' : 'editor play mode, batch — not the shipped player';
  return `Performance (${where}): ${parts.join('; ')}.`;
}

export function renderVerdict(verdict: PlaythroughVerdict, captureDir: string): string {
  const r = verdict.record;
  const lines: string[] = [];
  lines.push(verdict.ok ? 'PLAY-THROUGH OK: the game was played to an outcome.' : 'PLAY-THROUGH FAILED.');
  if (r !== null) {
    if (r.missing) lines.push(`Could not play: ${r.missing}.`);
    else {
      lines.push(
        `Scene ${r.scene}, session ${r.session}: phase after boot ${r.phaseAfterBoot ?? 'unknown'}` +
          ` (starts play by itself: ${r.autoStarted ? 'yes' : 'no — the test called StartSession'})`,
      );
      lines.push(
        `Phases: ${r.phasesSeen.join(' → ') || 'none'}; actions: ${r.actions}; outcome ${r.outcome ?? 'None'} after ${r.elapsedSeconds.toFixed(1)} s.`,
      );
    }
    if (!r.missing) lines.push(renderSessions(r));
    if (!r.missing && r.runtime) lines.push(renderRuntime(r.runtime));
    if (r.errors.length > 0) lines.push(`Errors during play (${r.errors.length}):\n  ${r.errors.slice(0, 5).join('\n  ')}`);
  }
  const f = verdict.frames;
  lines.push(
    `Frames: ${f.count} captured, ${f.unreadable} unreadable, ${f.flat} flat; max moved share between consecutive frames ${(f.maxMotionShare * 100).toFixed(1)}%` +
      (f.first && f.last
        ? `; first ${f.first.colours} colours / luma ${f.first.meanLuma}, last ${f.last.colours} colours / luma ${f.last.meanLuma}`
        : '') +
      `. Under ${captureDir}.`,
  );
  if (verdict.perf) lines.push(renderPerf(verdict.perf));
  if (verdict.test) lines.push(`Test runner: ${verdict.test.result}, ${verdict.test.total} executed, ${verdict.test.failed} failed.`);
  if (verdict.unityLog && verdict.unityLog.length > 0) {
    lines.push(`Unity log, failure lines (${verdict.unityLog.length}):\n  ${verdict.unityLog.slice(-12).join('\n  ')}`);
  }
  if (!verdict.ok) lines.push(`Why not ok:\n  - ${verdict.reasons.join('\n  - ')}`);
  lines.push(
    '',
    '```json',
    JSON.stringify({
      ok: verdict.ok,
      reasons: verdict.reasons,
      record: verdict.record,
      frames: verdict.frames,
      test: verdict.test ?? null,
      perf: verdict.perf ?? null,
      unityLog: verdict.unityLog ?? [],
      measuredAt: verdict.measuredAt,
    }),
    '```',
  );
  return lines.join('\n');
}

export class PlaythroughTool implements ITool {
  readonly name = 'unity_playthrough';
  readonly description =
    'Play the game headlessly and report whether it can be played: boots the entry scene, resolves ' +
    `the game's ${PLAYTHROUGH_DRIVER_TYPE} (the one contract every Strada.Core game registers as an ` +
    'adapter over its own flow and input services), starts a session, acts until the session ends, ' +
    "captures checkpoint frames, and judges the result from the game's own record, the pixels of the " +
    'frames (flat or drawn, moving or still) and the test runner. Also says whether the game starts ' +
    'play by itself after boot. A game that registers no driver cannot be proven playable and is ' +
    'reported as such. Use this — not unity_playmode_verify alone — to claim the game is playable. ' +
    'Writes playthrough.json and playthrough-verdict.json beside the frames.';

  readonly inputSchema = {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: 'Unity project root. Defaults to the tool context project path.' },
      scene: { type: 'string', description: 'Scene to boot. Defaults to the first enabled scene in Build Settings.' },
      session: {
        type: 'number',
        description: "Which session to start — the game's own index (level, round, seed); default 1.",
      },
      sessions: {
        type: 'string',
        description:
          'Which sessions to play in one run, each to an outcome: "1-3", "2,5", or "all" (every session the ' +
          `game's ${PLAYTHROUGH_CATALOG_TYPE} reports, at most ${MAX_SESSIONS_PER_RUN}). Default: only \`session\`. ` +
          'maxActions and deadlineSeconds apply per session.',
      },
      maxActions: { type: 'number', description: 'Upper bound on driver actions per session (default 60).' },
      evidenceRunId: EVIDENCE_RUN_ID_SCHEMA,
      outcomeRequired: {
        type: 'boolean',
        description:
          'Does the game\'s own document require a session to END (a win or a lose state)? Default false: an endless ' +
          'or sandbox session that stays interactive, acts and draws is behaving as designed, and the absence of a ' +
          'terminal outcome is then disclosed rather than held against it.',
      },
      deadlineSeconds: {
        type: 'number',
        description: 'How long the session may run before the play-through is judged unfinished (default 45).',
      },
      bootDeadlineSeconds: {
        type: 'number',
        description: 'How long the bootstrapper may take to publish its services after the scene loads (default 30).',
      },
      captureDir: {
        type: 'string',
        description: `Where frames, the record and the verdict go (default <projectPath>/${DEFAULT_CAPTURE_SUBDIR}; wiped before the run).`,
      },
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
    const resolved = resolveProjectPath(input['projectPath'], context.projectPath);
    const result = await this.run(input, resolved.projectPath);
    return resolved.mismatchNote === undefined ? result : { ...result, content: `${result.content}\n\n${resolved.mismatchNote}` };
  }

  private async run(input: Record<string, unknown>, projectPath: string): Promise<ToolResult> {
    if (!projectPath) return { content: 'Error: no projectPath given and none in context.', isError: true };
    const editor = await findUnityEditor(projectPath);
    if (!editor) {
      return {
        content:
          'Error: no Unity editor found for this project. Set UNITY_EDITOR_PATH or install the version named in ProjectSettings/ProjectVersion.txt.',
        isError: true,
      };
    }
    const scene =
      typeof input['scene'] === 'string' && input['scene'].trim() !== '' ? input['scene'].trim() : entrySceneFromBuildSettings(projectPath);
    if (scene === null) {
      return { content: 'Error: no scene given and Build Settings enables none — there is no entry scene to play.', isError: true };
    }
    const emission = emitPlaythroughTest(projectPath, scene);
    if (!emission.written) return { content: `Error: ${emission.reason ?? 'the play-through test could not be written'}`, isError: true };

    // THE RECORDER OWNS ITS DIRECTORY (Codex 2026-09-12 U#F7, X): the old
    // line took whatever the caller named and the next statement deleted it
    // recursively, so `captureDir: "."` deleted the project.
    const decision = resolveCaptureDir(projectPath, input['captureDir'], DEFAULT_CAPTURE_SUBDIR);
    if (decision.dir === undefined) return { content: `Error: ${decision.reason}`, isError: true };
    const captureDir = decision.dir;
    // NEVER CLEARS WHAT IT DOES NOT OWN (Codex 2026-09-12 Z#7).
    const ready = prepareCaptureDir(captureDir);
    if (!ready.ok) return { content: `Error: ${ready.reason}`, isError: true };

    const scratch = mkdtempSync(join(tmpdir(), 'strada-playthrough-'));
    const resultsPath = join(scratch, 'results.xml');
    const logPath = join(scratch, 'playthrough.log');
    try {
      const args = buildPlaymodeArgs({ projectPath, resultsPath, logPath, capture: true, testFilter: PLAYTHROUGH_TEST_CLASS });
      const env: Record<string, string> = {
        STRADA_CAPTURE_DIR: captureDir,
        STRADA_PLAYTHROUGH_SCENE: scene,
        STRADA_PLAYTHROUGH_JSON: join(captureDir, PLAYTHROUGH_RECORD_FILE),
      };
      if (typeof input['session'] === 'number') env['STRADA_PLAYTHROUGH_SESSION'] = String(Math.floor(input['session']));
      if (typeof input['sessions'] === 'string' && input['sessions'].trim()) env['STRADA_PLAYTHROUGH_SESSIONS'] = input['sessions'].trim();
      if (typeof input['maxActions'] === 'number') env['STRADA_PLAYTHROUGH_MAX_ACTIONS'] = String(Math.floor(input['maxActions']));
      if (typeof input['deadlineSeconds'] === 'number') env['STRADA_PLAYTHROUGH_DEADLINE_S'] = String(Math.floor(input['deadlineSeconds']));
      // THE OUTCOME CONTRACT REACHES THE RUNNER, not only the judge: the
      // generated test asserted an outcome unconditionally, so an endless
      // session failed the run whatever the judge said (Codex 2026-09-13
      // AH#1).
      if (input['outcomeRequired'] === true) env['STRADA_PLAYTHROUGH_OUTCOME_REQUIRED'] = '1';
      if (typeof input['bootDeadlineSeconds'] === 'number') env['STRADA_PLAYTHROUGH_BOOT_DEADLINE_S'] = String(Math.floor(input['bootDeadlineSeconds']));

      // THE BUDGET THIS RUN NEEDS, not a fixed ten minutes: the editor was
      // killed at 580 s however many sessions and however long a round the
      // caller asked for, so a correct game with long rounds could not be
      // played to the end (Codex 2026-09-13 AJ#1).
      const sessionsAsked = countRequestedSessions(input['sessions']);
      const deadlineAsked = typeof input['deadlineSeconds'] === 'number' ? Math.floor(input['deadlineSeconds']) : 45;
      const bootAsked = typeof input['bootDeadlineSeconds'] === 'number' ? Math.floor(input['bootDeadlineSeconds']) : 30;
      const needsMs = playRunBudgetMs(sessionsAsked, deadlineAsked, bootAsked);
      if (needsMs > PLAY_RUN_BUDGET_MS) {
        const fits = sessionsThatFit(deadlineAsked, bootAsked);
        return {
          content:
            `Error: ${sessionsAsked} session(s) at ${deadlineAsked} s each need ${Math.round(needsMs / 1000)} s, and one run may take `
            + `${Math.round(PLAY_RUN_BUDGET_MS / 1000)} s — nothing was played. Ask for sessions "1-${fits}" and accumulate the batches.`,
          isError: true,
        };
      }
      const ran = await runUnityProcess(editor.binary, args, needsMs, env);
      const exitCode = ran.exitCode;
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      const outcome = existsSync(resultsPath) ? parseTestRun(readFileSync(resultsPath, 'utf8')) : null;
      const verdict = withRunId(
        withProcessOutcome(
          judgePlaythrough(captureDir, outcome ?? undefined, log, { outcomeRequired: input['outcomeRequired'] === true }),
          exitCode,
          outcome !== null,
          'editor',
        ),
        evidenceRunId(input),
      );
      try {
        writeFileSync(join(captureDir, PLAYTHROUGH_VERDICT_FILE), JSON.stringify(verdict, null, 2));
      } catch {
        /* the verdict is still returned */
      }
      const compileErrors = log
        .split('\n')
        .filter((l) => /error CS\d{4}/.test(l))
        .slice(0, 5);
      const header =
        outcome === null
          ? `Unity exited ${exitCode} without a results file.` +
            (compileErrors.length > 0
              ? ` Compile errors:\n${compileErrors.join('\n')}`
              : ' The log holds no compile error; the editor may have failed to open the project.') +
            '\n\n'
          : '';
      return { content: header + renderVerdict(verdict, captureDir) + `\n\nTest written at ${emission.paths[0]}.`, isError: !verdict.ok };
    } finally {
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* scratch */
      }
    }
  }
}
