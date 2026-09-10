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
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from './local-diagnostics.js';
import { buildPlaymodeArgs, runUnityProcess } from './playmode-verify.js';
import { parseTestRun } from './nunit-results.js';
import { resolveProjectPath } from './project-path.js';
import { decodePngRgba, frameMetrics, motionShare, type FrameMetrics } from './png-metrics.js';
import {
  PLAYTHROUGH_DRIVER_TYPE,
  PLAYTHROUGH_RECORD_FILE,
  PLAYTHROUGH_TEST_CLASS,
  emitPlaythroughTest,
} from './playthrough-test.js';

export const PLAYTHROUGH_VERDICT_FILE = 'playthrough-verdict.json';
export const DEFAULT_CAPTURE_SUBDIR = 'Recordings/playthrough';
/** Below this share of moved samples between the most different pair of frames, nothing on screen responded to play. */
export const MIN_MOTION_SHARE = 0.01;

/** What the generated test records (see playthrough-test.ts); field names are the JSON's. */
export interface PlaythroughRecord {
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
  errors: string[];
}

export interface PlaythroughVerdict {
  readonly ok: boolean;
  /** Each reason the verdict is not ok; empty when ok. */
  readonly reasons: string[];
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
  readonly measuredAt: string;
}

/** The first enabled scene in Build Settings, by name; null when none is enabled or the file is unreadable. */
export function entrySceneFromBuildSettings(projectPath: string): string | null {
  try {
    const text = readFileSync(join(projectPath, 'ProjectSettings', 'EditorBuildSettings.asset'), 'utf8');
    const entries = text.split(/\n\s*- /).slice(1);
    for (const entry of entries) {
      if (!/enabled:\s*1/.test(entry)) continue;
      const path = /path:\s*(\S+)/.exec(entry)?.[1];
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
): PlaythroughVerdict {
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

  const frameFiles = existsSync(captureDir)
    ? readdirSync(captureDir)
        .filter((f) => /^frame_\d+\.png$/.test(f))
        .sort()
    : [];
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
    if (record.missing) reasons.push(record.missing);
    else if (!record.startAccepted) reasons.push(`the driver refused to start session ${record.session}`);
    else if (!record.reachedOutcome) {
      reasons.push(
        `session ${record.session} never ended after ${record.actions} actions ` +
          `(phases seen: ${record.phasesSeen.length > 0 ? record.phasesSeen.join(' → ') : 'none'})`,
      );
    }
    if (record.errors.length > 0) {
      reasons.push(`${record.errors.length} error(s) logged during play, first: ${record.errors[0]}`);
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
  }

  return {
    ok: reasons.length === 0,
    reasons,
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
    measuredAt: new Date().toISOString(),
  };
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
  if (verdict.test) lines.push(`Test runner: ${verdict.test.result}, ${verdict.test.total} executed, ${verdict.test.failed} failed.`);
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
      maxActions: { type: 'number', description: 'Upper bound on driver actions (default 60).' },
      deadlineSeconds: {
        type: 'number',
        description: 'How long the session may run before the play-through is judged unfinished (default 45).',
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
      timeoutMs: 600_000,
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

    const requestedDir = String(input['captureDir'] ?? DEFAULT_CAPTURE_SUBDIR);
    const captureDir = requestedDir.startsWith('/') ? requestedDir : join(projectPath, requestedDir);
    try {
      rmSync(captureDir, { recursive: true, force: true });
      mkdirSync(captureDir, { recursive: true });
    } catch (error) {
      return { content: `Error: cannot prepare ${captureDir}: ${String(error)}`, isError: true };
    }

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
      if (typeof input['maxActions'] === 'number') env['STRADA_PLAYTHROUGH_MAX_ACTIONS'] = String(Math.floor(input['maxActions']));
      if (typeof input['deadlineSeconds'] === 'number') env['STRADA_PLAYTHROUGH_DEADLINE_S'] = String(Math.floor(input['deadlineSeconds']));

      const exitCode = await runUnityProcess(editor.binary, args, 580_000, env);
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      const outcome = existsSync(resultsPath) ? parseTestRun(readFileSync(resultsPath, 'utf8')) : null;
      const verdict = judgePlaythrough(captureDir, outcome ?? undefined);
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
