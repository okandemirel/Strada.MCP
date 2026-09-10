import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { perfFromRecord, renderSessions, judgePlaythrough, entrySceneFromBuildSettings, renderVerdict, MIN_MOTION_SHARE, unityLogFailureLines } from './playthrough.js';
import { buildPlaythroughTest, emitPlaythroughTest, PLAYTHROUGH_ASSEMBLY, PLAYTHROUGH_DRIVER_TYPE } from './playthrough-test.js';
import { encodeRgbPng } from './png-metrics.test.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'playthrough-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const goodRecord = {
  scene: 'Entry',
  session: 1,
  driverType: PLAYTHROUGH_DRIVER_TYPE,
  phaseAfterBoot: 'Home',
  autoStarted: false,
  startAccepted: true,
  phasesSeen: ['Playing', 'Won'],
  actions: 12,
  outcome: 'Won',
  reachedOutcome: true,
  framesCaptured: 3,
  elapsedSeconds: 4.2,
  errors: [],
};

function frames(...pixels: Array<(x: number, y: number) => [number, number, number]>): void {
  pixels.forEach((p, i) => writeFileSync(join(dir, `frame_${String(i).padStart(5, '0')}.png`), encodeRgbPng(160, 90, p)));
}
const drawn =
  (seed: number) =>
  (x: number, y: number): [number, number, number] => [((x + seed) * 7) & 255, (y * 11) & 255, ((x ^ y) * 3) & 255];
const flat = (): [number, number, number] => [20, 20, 20];

describe('the play-through verdict is derived from the record, the pixels and the runner', () => {
  it('ok when the session ended, frames are drawn and something moved', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(40), drawn(90));
    const v = judgePlaythrough(dir, { total: 1, passed: 1, failed: 0, result: 'Passed' });
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.frames).toMatchObject({ count: 3, unreadable: 0, flat: 0 });
    expect(v.frames.maxMotionShare).toBeGreaterThan(MIN_MOTION_SHARE);
    expect(renderVerdict(v, dir)).toContain('PLAY-THROUGH OK');
    expect(renderVerdict(v, dir)).toContain('starts play by itself: no');
  });

  it('boot time and frame timing ride in the verdict, named by their medium', () => {
    writeFileSync(
      join(dir, 'playthrough.json'),
      JSON.stringify({ ...goodRecord, bootSeconds: 3.25, playSeconds: 4.0, playFrames: 120, worstFrameMs: 210.4 }),
    );
    frames(drawn(0), drawn(40), drawn(90));
    const v = judgePlaythrough(dir, { total: 1, passed: 1, failed: 0, result: 'Passed' });
    expect(v.perf).toEqual({ medium: 'editor-playmode-batch', bootSeconds: 3.25, playSeconds: 4, playFrames: 120, avgFps: 30, worstFrameMs: 210.4 });
    const text = renderVerdict(v, dir);
    expect(text).toContain('Performance (editor play mode, batch — not the shipped player): boot 3.3 s to services; 120 frames in 4.0 s = 30.0 fps average; worst frame 210 ms.');
    expect(JSON.parse(text.slice(text.indexOf('```json') + 7, text.lastIndexOf('```'))).perf).toMatchObject({ avgFps: 30 });
  });

  it('a record written inside the built player names its medium, and the line says so', () => {
    const perf = perfFromRecord({ ...goodRecord, medium: 'player', bootSeconds: 1.1, playSeconds: 10, playFrames: 600, worstFrameMs: 33 });
    expect(perf?.medium).toBe('player');
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, medium: 'player', bootSeconds: 1.1, playSeconds: 10, playFrames: 600, worstFrameMs: 33 }));
    frames(drawn(0), drawn(40), drawn(90));
    expect(renderVerdict(judgePlaythrough(dir), dir)).toContain('Performance (built player, real rendering): boot 1.1 s to services; 600 frames in 10.0 s = 60.0 fps average; worst frame 33 ms.');
  });

  it('a record from an older test, or a run that never reached play, carries no performance', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.perf).toBeUndefined();
    expect(renderVerdict(v, dir)).not.toContain('Performance');
    expect(perfFromRecord({ ...goodRecord, bootSeconds: -1, playSeconds: 0, playFrames: 0 })).toBeUndefined();
    expect(perfFromRecord({ ...goodRecord, bootSeconds: 2, playSeconds: 0, playFrames: 0 })).toEqual({ medium: 'editor-playmode-batch', bootSeconds: 2, playSeconds: 0, playFrames: 0 });
  });

  it('several sessions: each is judged, the catalog is named, and the top-level mirror is not double-counted', () => {
    const sessions = [
      { index: 1, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 14, outcome: 'Won', reachedOutcome: true, seconds: 12.1, lastPhase: 'Won' },
      { index: 2, startAccepted: true, phasesSeen: ['Playing'], actions: 60, outcome: 'None', reachedOutcome: false, seconds: 45.0, lastPhase: 'Playing' },
      { index: 3, startAccepted: false, phasesSeen: [], actions: 0, outcome: 'None', reachedOutcome: false, seconds: 0, lastPhase: '' },
    ];
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, sessionCount: 12, sessions }));
    frames(drawn(0), drawn(40), drawn(90));
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual([
      'session 2 never ended after 60 actions (phases seen: Playing)',
      'the driver refused to start session 3',
    ]);
    const text = renderVerdict(v, dir);
    expect(text).toContain('Sessions: catalog 12 session(s); played 3: #1 Won in 14 actions (12.1 s), #2 never ended in 60 actions (45.0 s), #3 refused.');
    expect(renderSessions({ ...goodRecord, sessionCount: -1 })).toBe(
      'Sessions: no session catalog registered (Strada.Core.Play.ISessionCatalog) — the level count cannot be measured.',
    );
    expect(renderSessions({ ...goodRecord, sessionCount: 3, sessions: [sessions[0]!] })).toBe('Sessions: catalog 3 session(s); played 1: #1 Won in 14 actions (12.1 s).');
  });

  it('a session that never ended is not ok, and the reason names the actions and the phases', () => {
    writeFileSync(
      join(dir, 'playthrough.json'),
      JSON.stringify({ ...goodRecord, reachedOutcome: false, outcome: 'None', phasesSeen: ['Playing'], actions: 60 }),
    );
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/session 1 never ended after 60 actions \(phases seen: Playing\)/);
  });

  it('a game that registers no driver is named as unplayable by the framework', () => {
    writeFileSync(
      join(dir, 'playthrough.json'),
      JSON.stringify({
        ...goodRecord,
        missing: `the game registers no ${PLAYTHROUGH_DRIVER_TYPE} — it cannot be played by the framework`,
        startAccepted: false,
        reachedOutcome: false,
      }),
    );
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.reasons).toEqual([expect.stringMatching(/registers no Strada\.Core\.Play\.IPlaythroughDriver/)]);
    expect(renderVerdict(v, dir)).toContain('Could not play: the game registers no');
  });

  it('flat frames are not ok even when the game reports a win', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(flat, flat, flat);
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/every frame is flat/);
    expect(v.reasons.join('\n')).toMatch(/nothing on screen changed/);
  });

  it('drawn but frozen frames are not ok', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(0), drawn(0));
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual([expect.stringMatching(/nothing on screen changed/)]);
  });

  it('no record means the test never ran, and an empty runner run is named', () => {
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir, { total: 0, passed: 0, failed: 0, result: 'Passed' });
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/no play-through record/);
    expect(v.reasons.join('\n')).toMatch(/executed zero tests/);
  });

  it('errors logged during play and a refused start are reasons', () => {
    writeFileSync(
      join(dir, 'playthrough.json'),
      JSON.stringify({ ...goodRecord, startAccepted: false, errors: ['[Exception] NullReferenceException: x'] }),
    );
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.reasons.join('\n')).toMatch(/the driver refused to start session 1/);
    expect(v.reasons.join('\n')).toMatch(/1 error\(s\) logged during play, first: \[Exception\]/);
  });

  it("stale playfield_*.png files from other tests are not this run's frames", () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    writeFileSync(join(dir, 'playfield_00001.png'), encodeRgbPng(160, 90, drawn(0)));
    const v = judgePlaythrough(dir);
    expect(v.frames.count).toBe(0);
    expect(v.reasons.join('\n')).toMatch(/no frames were captured/);
  });
});

describe('the entry scene comes from Build Settings', () => {
  it('reads the first enabled scene by name', () => {
    mkdirSync(join(dir, 'ProjectSettings'));
    writeFileSync(
      join(dir, 'ProjectSettings', 'EditorBuildSettings.asset'),
      'EditorBuildSettings:\n  m_Scenes:\n  - enabled: 0\n    path: Assets/Scenes/Old.unity\n    guid: a\n  - enabled: 1\n    path: Assets/Scenes/Entry.unity\n    guid: b\n',
    );
    expect(entrySceneFromBuildSettings(dir)).toBe('Entry');
  });
  it('null when nothing is enabled or the file is missing', () => {
    expect(entrySceneFromBuildSettings(dir)).toBeNull();
    mkdirSync(join(dir, 'ProjectSettings'));
    writeFileSync(
      join(dir, 'ProjectSettings', 'EditorBuildSettings.asset'),
      'EditorBuildSettings:\n  m_Scenes:\n  - enabled: 0\n    path: Assets/Scenes/Old.unity\n',
    );
    expect(entrySceneFromBuildSettings(dir)).toBeNull();
  });
});

describe('the emitted play-through test', () => {
  it('binds to the Strada.Core driver contract only, reads its knobs from the environment, and writes the record', () => {
    const { source, asmdef } = buildPlaythroughTest('Entry');
    for (const needle of [
      'STRADA_PLAYTHROUGH_SCENE',
      'STRADA_PLAYTHROUGH_SESSION',
      'STRADA_PLAYTHROUGH_MAX_ACTIONS',
      'STRADA_PLAYTHROUGH_DEADLINE_S',
      'STRADA_CAPTURE_DIR',
      'STRADA_PLAYTHROUGH_JSON',
      'using Strada.Core.Play;',
      'IPlaythroughDriver driver',
      'GameBootstrapper.Services.TryGet(out driver)',
      'driver.StartSession(s.index)',
      'STRADA_PLAYTHROUGH_SESSIONS',
      'ISessionCatalog catalog',
      'GameBootstrapper.Services.TryGet(out catalog)',
      'record.sessionCount = catalog.SessionCount',
      'driver.Act()',
      'driver.Outcome',
      'driver.IsSessionActive',
      'registers no " + record.driverType',
      'JsonUtility.ToJson(record, true)',
      'Application.CanStreamedLevelBeLoaded',
      '"Entry"',
    ])
      expect(source, needle).toContain(needle);
    // No game's own names: the same test serves every Strada.Core game.
    expect(source).not.toMatch(/PixelFlow|YourGame|StartLevel|TapConveyor|LevelWon|Type\.GetType|GetMethod\(|MakeGenericMethod/);
    const parsed = JSON.parse(asmdef) as { name: string; references: string[]; overrideReferences: boolean };
    expect(parsed.name).toBe(PLAYTHROUGH_ASSEMBLY);
    expect(parsed.references).toContain('Strada.Core');
    expect(parsed.overrideReferences).toBe(false);
  });

  it('is written into its own folder under the test dir, and refused without the test framework', () => {
    mkdirSync(join(dir, 'Packages'));
    writeFileSync(join(dir, 'Packages', 'manifest.json'), '{"dependencies":{}}');
    expect(emitPlaythroughTest(dir, 'Entry').written).toBe(false);
    writeFileSync(join(dir, 'Packages', 'manifest.json'), '{"dependencies":{"com.unity.test-framework":"1.4.5"}}');
    const e = emitPlaythroughTest(dir, 'Entry');
    expect(e.written).toBe(true);
    expect(e.paths[0]).toBe('Assets/Tests/PlayMode/Playthrough/StradaPlaythroughTest.cs');
    expect(existsSync(join(dir, 'Assets/Tests/PlayMode/Playthrough', `${PLAYTHROUGH_ASSEMBLY}.asmdef`))).toBe(true);
    expect(readFileSync(join(dir, e.paths[0]!), 'utf8')).toContain('"Entry"');
  });
});

describe("the verdict carries the failure lines of Unity's own log (measured 2026-09-10: the cause of a dead bootstrap was only there)", () => {
  it('keeps error lines, drops warnings and chatter, and renders them', () => {
    const log = [
      '[Log] [Strada] GameFlowSystem OnInitialize',
      'Assets/X.cs(3,1): warning CS0168: unused',
      'GameBootstrapperConfig validation failed: module list empty',
      'NullReferenceException: Object reference not set to an instance of an object',
      'plain line',
    ].join('\n');
    const lines = unityLogFailureLines(log);
    expect(lines).toEqual([
      'GameBootstrapperConfig validation failed: module list empty',
      'NullReferenceException: Object reference not set to an instance of an object',
    ]);
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, missing: 'GameBootstrapper.Services stayed null for 30 s', startAccepted: false, reachedOutcome: false }));
    const v = judgePlaythrough(dir, undefined, log);
    expect(v.unityLog).toHaveLength(2);
    expect(renderVerdict(v, dir)).toContain('Unity log, failure lines (2)');
    expect(renderVerdict(v, dir)).toContain('validation failed: module list empty');
  });
});

