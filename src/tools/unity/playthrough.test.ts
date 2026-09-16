import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { perfFromRecord, renderSessions, renderRuntime, judgePlaythrough, withProcessOutcome, entrySceneFromBuildSettings, renderVerdict, MIN_MOTION_SHARE, unityLogFailureLines } from './playthrough.js';
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

/**
 * Codex round AG#6, reproduced: three sessions played, one shared budget of
 * frames spent on the first, and the run passed on the earlier images while
 * levels 2 and 3 rendered nothing anybody could see.
 */
describe('every session that played must have been seen (Codex 2026-09-13 AG#6)', () => {
  const sessionFrames = (index: number, ...pixels: Array<(x: number, y: number) => [number, number, number]>): void => {
    pixels.forEach((p, i) =>
      writeFileSync(
        join(dir, `frame_s${String(index).padStart(2, '0')}_${String(index * 100 + i).padStart(5, '0')}.png`),
        encodeRgbPng(160, 90, p),
      ),
    );
  };
  const threeSessions = [
    { index: 1, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 15, lastPhase: 'Won' },
    { index: 2, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 15, lastPhase: 'Won' },
    { index: 3, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 15, lastPhase: 'Won' },
  ];

  it('refuses a run whose later sessions left no frame of their own', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, sessionCount: 3, sessions: threeSessions }));
    sessionFrames(1, drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/session\(s\) 2, 3 played with no frame captured of them/);
  });

  it('asks for frames only of the sessions that STARTED', () => {
    // A session the driver refused is already a refusal of its own; it must
    // not also be asked for a picture of what it never played.
    const refusedThird = [
      threeSessions[0]!,
      threeSessions[1]!,
      { ...threeSessions[2]!, startAccepted: false, actions: 0, outcome: 'None', reachedOutcome: false, phasesSeen: [] },
    ];
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, sessionCount: 3, sessions: refusedThird }));
    sessionFrames(1, drawn(0), drawn(40));
    sessionFrames(2, drawn(5), drawn(60));
    const v = judgePlaythrough(dir);
    expect(v.reasons.join('\n')).toContain('the driver refused to start session 3');
    expect(v.reasons.join('\n')).not.toMatch(/no frame captured/);
  });

  it('accepts a run that shows every session it played', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, sessionCount: 3, sessions: threeSessions }));
    sessionFrames(1, drawn(0), drawn(40));
    sessionFrames(2, drawn(5), drawn(60));
    sessionFrames(3, drawn(9), drawn(80));
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('reads an older runner\'s unnamed frames exactly as before', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, sessionCount: 3, sessions: threeSessions }));
    frames(drawn(0), drawn(40));
    expect(judgePlaythrough(dir).ok).toBe(true);
  });
});

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
    expect(renderVerdict(judgePlaythrough(dir), dir)).toContain('Performance (built player, real rendering): boot 1.1 s from launch to services; 600 frames in 10.0 s = 60.0 fps average; worst frame 33 ms.');
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
    const v = judgePlaythrough(dir, undefined, undefined, { outcomeRequired: true });
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual([
      'session 2 never ended after 60 actions (phases seen: Playing)',
      'the driver refused to start session 3',
    ]);
    // A REFUSED START is a refusal whatever the document requires: the game
    // would not begin the content it was asked for.
    const endless = judgePlaythrough(dir);
    expect(endless.reasons).toEqual(['the driver refused to start session 3']);
    const text = renderVerdict(v, dir);
    expect(text).toContain('Sessions: catalog 12 session(s); played 3: #1 Won in 14 actions (12.1 s), #2 never ended in 60 actions (45.0 s), #3 refused.');
    expect(renderSessions({ ...goodRecord, sessionCount: -1 })).toBe(
      'Sessions: no session catalog registered (Strada.Core.Play.ISessionCatalog) — the level count cannot be measured.',
    );
    expect(renderSessions({ ...goodRecord, sessionCount: 3, sessions: [sessions[0]!] })).toBe('Sessions: catalog 3 session(s); played 1: #1 Won in 14 actions (12.1 s).');
  });

  it('the runtime dump names what was on screen at the end of play (2026-09-10)', () => {
    const runtime = { renderers: 14, worldRenderers: 12, spriteRenderers: 10, meshRenderers: 2, canvases: 1, particleSystems: 1, audioSources: 2, audioPlaying: 1, sprites: ['pig_idle', 'board_bg'], meshes: ['Cube', 'StageMesh'], primitiveMeshes: 1 };
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify({ ...goodRecord, runtime }));
    frames(drawn(0), drawn(40), drawn(90));
    const v = judgePlaythrough(dir);
    expect(v.record?.runtime).toEqual(runtime);
    expect(renderVerdict(v, dir)).toContain('Runtime at end of play: 12 world renderer(s) (10 sprite, 2 mesh (1 engine primitive)); sprites: pig_idle, board_bg; meshes: Cube, StageMesh; 1 canvas(es), 1 particle system(s), 2 audio source(s), 1 playing.');
    expect(renderRuntime({ ...runtime, sprites: [], meshes: [], primitiveMeshes: 0 })).toBe('Runtime at end of play: 12 world renderer(s) (10 sprite, 2 mesh); 1 canvas(es), 1 particle system(s), 2 audio source(s), 1 playing.');
  });

  it('a session that never ended fails only when an outcome was REQUIRED (Codex 2026-09-13 AG#3)', () => {
    writeFileSync(
      join(dir, 'playthrough.json'),
      JSON.stringify({ ...goodRecord, reachedOutcome: false, outcome: 'None', phasesSeen: ['Playing'], actions: 60 }),
    );
    frames(drawn(0), drawn(40));
    const required = judgePlaythrough(dir, undefined, undefined, { outcomeRequired: true });
    expect(required.ok).toBe(false);
    expect(required.reasons.join('\n')).toMatch(/session 1 never ended after 60 actions \(phases seen: Playing\)/);

    // An endless or sandbox session that stays interactive, acts and draws is
    // a game behaving as designed — and no correct implementation could have
    // satisfied the old rule.
    const endless = judgePlaythrough(dir);
    expect(endless.ok).toBe(true);
    expect((endless.notes ?? []).join('\n')).toMatch(/never ended after 60 actions.*no terminal outcome was required/);
    expect(endless.reasons).toEqual([]);
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

/**
 * Codex round AG#5, reproduced: a run whose `SaveManager.Awake` threw a
 * NullReferenceException — before the runner could subscribe to errors — came
 * back `ok: true, reasons: []` with the exception sitting in the log as
 * informational text.
 */
describe('an exception while the game was STARTING is part of the verdict (Codex 2026-09-13 AG#5)', () => {
  it('refuses a run whose startup threw, and names it', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(40));
    const log = [
      'Loading scene Entry',
      'NullReferenceException: Object reference not set to an instance of an object',
      '  at SaveManager.Awake () [0x00012] in /p/Assets/SaveManager.cs:41',
    ].join('\n');
    const v = judgePlaythrough(dir, { total: 1, passed: 1, failed: 0, result: 'Passed' }, log);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/unhandled exception\(s\) while the game was starting/);
  });

  it('says nothing about a clean log, a handled exception, or one thrown during play', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(40));
    for (const log of [
      'Loading scene Entry\nEverything is fine',
      'Caught NullReferenceException, handled: the save file was missing\n  at SaveManager.Awake () [0x00012]',
      // An exception during PLAY is the runner's own business: it records it
      // with context, and this rule is about starting up.
      'InvalidOperationException: the pig fell over\n  at Pig.Update () [0x0001]',
    ]) {
      const v = judgePlaythrough(dir, { total: 1, passed: 1, failed: 0, result: 'Passed' }, log);
      expect(v.ok, log).toBe(true);
    }
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
      'record.runtime = DumpRuntime()',
      'FindObjectsByType<Renderer>',
      'driver.Act()',
      'driver.Outcome',
      'driver.IsSessionActive',
      'registers no " + record.driverType',
      'JsonUtility.ToJson(record, true)',
      'Application.CanStreamedLevelBeLoaded',
      // The runner's OWN observation of the loaded content, and a bounded
      // wait for an asynchronous load (Codex 2026-09-13 AG#1, AG#4).
      's.contentFingerprint = ContentFingerprint()',
      'static string ContentFingerprint()',
      'SceneManager.GetActiveScene()',
      // ONE BUDGET PER SESSION: waiting for identity and playing share the
      // allowance the document stated, instead of a separate five-second
      // identity limit that marked a legitimate six-second load permanently
      // unverified (Codex 2026-09-13 AI#4) — and the timeout says so by name.
      'var sessionDeadline = Time.realtimeSinceStartup + deadlineSeconds;',
      'if (Time.realtimeSinceStartup >= sessionDeadline) { readyTimedOut = true; break; }',
      'var playDeadline = sessionDeadline;',
      'never became active within its ',
      // The outcome contract reaches the RUNNER, not only the judge (AH#1).
      'STRADA_PLAYTHROUGH_OUTCOME_REQUIRED',
      'if (outcomeRequired)',
      'if (running == s.requestedIndex) break;',
      // A capture belongs to a session, and each session has its own budget
      // (AG#6).
      'MaxFramesPerSession',
      'frame_s',
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


/**
 * Codex ran these against this judge (2026-09-12 U#F4, X): with good frames
 * and a good record, a FAILED NUnit run came back ok:true — only "zero
 * tests" was refused. And an entry scene whose name holds a space loaded as
 * its first word, which is a scene that does not exist.
 */
describe('the runner’s own result decides, and a scene name keeps its spaces', () => {
  it('refuses a failed, inconclusive or nothing-passed test run', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(40), drawn(90));

    const failed = judgePlaythrough(dir, { total: 1, passed: 0, failed: 1, result: 'Failed' });
    expect(failed.ok).toBe(false);
    expect(failed.reasons.join(' ')).toContain('1 of 1 play-through test(s) FAILED');

    // Counters clean, verdict not a pass.
    const inconclusive = judgePlaythrough(dir, { total: 1, passed: 1, failed: 0, result: 'Inconclusive' });
    expect(inconclusive.ok).toBe(false);
    expect(inconclusive.reasons.join(' ')).toContain('own verdict is "Inconclusive"');

    // Nothing ran to a pass, nothing failed either.
    const none = judgePlaythrough(dir, { total: 4, passed: 0, failed: 0, result: 'Passed' });
    expect(none.ok).toBe(false);
    expect(none.reasons.join(' ')).toContain('none ran to a pass');

    // …and a real pass is still a pass, with or without a test run at all.
    expect(judgePlaythrough(dir, { total: 2, passed: 2, failed: 0, result: 'Passed' }).ok).toBe(true);
    expect(judgePlaythrough(dir).ok).toBe(true);
  });

  it('reads an entry scene whose name contains a space', () => {
    const project = mkdtempSync(join(tmpdir(), 'entry-scene-'));
    mkdirSync(join(project, 'ProjectSettings'), { recursive: true });
    writeFileSync(
      join(project, 'ProjectSettings', 'EditorBuildSettings.asset'),
      'EditorBuildSettings:\n  m_Scenes:\n  - enabled: 1\n    path: Assets/Scenes/Main Menu.unity\n    guid: ' + 'a'.repeat(32) + '\n',
    );
    expect(entrySceneFromBuildSettings(project)).toBe('Main Menu');
    rmSync(project, { recursive: true, force: true });
  });
});

/**
 * A game may start playing BY ITSELF after boot, and the run then adopts that
 * session instead of starting one. The record carried the index the run had
 * ASKED for, so an auto-started level 1 certified level 7 (Codex 2026-09-12
 * X). Which session it is, only the game can say — Strada.Core.Play
 * .IActiveSession — and what it could not identify is said out loud.
 */
describe('an adopted session whose content nobody could identify', () => {
  it('says CONTENT UNVERIFIED beside it, and says nothing when the identity holds', () => {
    const unidentified = renderSessions({
      ...goodRecord,
      sessionCount: 12,
      sessions: [
        { index: 1, requestedIndex: 7, identityVerified: false, startAccepted: true, phasesSeen: ['Playing'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 12 },
      ],
    } as never);
    expect(unidentified).toContain('CONTENT UNVERIFIED');
    expect(unidentified).toContain('asked for #7');
    expect(unidentified).toContain('Strada.Core.Play.IActiveSession');

    const identified = renderSessions({
      ...goodRecord,
      sessionCount: 12,
      sessions: [
        { index: 7, requestedIndex: 7, identityVerified: true, startAccepted: true, phasesSeen: ['Playing'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 12 },
      ],
    } as never);
    expect(identified).not.toContain('UNVERIFIED');
    // …and a record from a producer that says nothing about identity reads as before.
    const older = renderSessions({
      ...goodRecord,
      sessionCount: 12,
      sessions: [{ index: 7, startAccepted: true, phasesSeen: ['Playing'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 12 }],
    } as never);
    expect(older).not.toContain('UNVERIFIED');
    expect(older).toContain('#7 Won in 9 actions');
  });

  it('the generated editor test resolves the identity contract and records what it found', () => {
    const { source } = buildPlaythroughTest('Entry');
    for (const needle of [
      'IActiveSession active = null',
      'GameBootstrapper.Services.TryGet(out active)',
      's.identityVerified = observed == s.requestedIndex',
      'public int requestedIndex;',
      // ABSENCE HAS ITS OWN VALUE: a plain int defaults to zero, and zero is
      // the contract's "no session is running", so a game that registers no
      // IActiveSession reported an accepted identity and no session at once
      // (Codex 2026-09-13 AI#7).
      'public int observedIndex = -1;',
      's.observedIndex = active != null ? observed : -1;',
      's.observedIndex = activeNow != null ? running : -1;',
      // …and for a session the test STARTED itself: accepting our own
      // request as proof let a driver that clamps StartSession(7) to level 1
      // certify level 7 (Codex 2026-09-12 Z#6).
      'IActiveSession activeNow = null',
      // A PRESENT service reporting zero is NO session running, not "cannot
      // tell": only a game with no identity service keeps its own acceptance
      // (Codex 2026-09-12 AA#3).
      's.identityVerified = activeNow == null || running == s.requestedIndex',
      // The frame after a capture is excluded only when one was WRITTEN: past
      // the frame budget every fifteenth frame was discarded anyway, so a run
      // hitching on those frames reported a clean frame rate (AA).
      // …and the capture happens BEFORE the yield whose delta it distorts
      // (AB J4.5): capturing after it stalled the frame already measured.
      'skipDelta = frame % FramesBetweenCaptures == 0',
      'static bool Capture(',
    ])
      expect(source, needle).toContain(needle);
    // Nothing claims verification before the session is under way.
    expect(source).not.toContain('s.identityVerified = true;');
  });
});

/**
 * How the PROCESS ended belongs in the verdict, not only in the header. With
 * good frames and a good record, an editor that exited 42 — or produced no
 * NUnit results at all — printed "PLAY-THROUGH OK" and left the verdict FILE
 * green, and that file is what Strada.Brain reads (Codex 2026-09-12 Y#J4.5,
 * Z).
 */
describe('the verdict carries how the process ended', () => {
  const green = { ok: true, reasons: [] as string[] };

  it('an editor run needs exit 0 AND an NUnit result', () => {
    expect(withProcessOutcome(green, 0, true, 'editor')).toEqual(green);
    const failed = withProcessOutcome(green, 42, true, 'editor');
    expect(failed.ok).toBe(false);
    expect(failed.reasons.join(' ')).toContain('the editor exited 42');
    const killed = withProcessOutcome(green, -1, true, 'editor');
    expect(killed.reasons.join(' ')).toContain('never exited normally');
    const noResults = withProcessOutcome(green, 0, false, 'editor');
    expect(noResults.ok).toBe(false);
    expect(noResults.reasons.join(' ')).toContain('no NUnit results file');
  });

  it('a built player has no NUnit results by design, so only its exit counts', () => {
    expect(withProcessOutcome(green, 0, false, 'player')).toEqual(green);
    const dead = withProcessOutcome(green, 139, false, 'player');
    expect(dead.ok).toBe(false);
    expect(dead.reasons.join(' ')).toContain('the player exited 139');
  });

  it('keeps the reasons the judge already found', () => {
    const judged = { ok: false, reasons: ['no frames were captured (no camera, or no capture directory)'] };
    const both = withProcessOutcome(judged, 42, true, 'editor');
    expect(both.reasons).toEqual([
      'no frames were captured (no camera, or no capture directory)',
      'the editor exited 42',
    ]);
  });
});
