import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  judgePlaythrough,
  entrySceneFromBuildSettings,
  renderVerdict,
  MIN_MOTION_SHARE,
} from './playthrough.js';
import {
  buildPlaythroughTest,
  emitPlaythroughTest,
  DEFAULT_BINDING,
  PLAYTHROUGH_ASSEMBLY,
} from './playthrough-test.js';
import { encodeRgbPng } from './png-metrics.test.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'playthrough-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const goodRecord = {
  scene: 'Main',
  level: 1,
  stateAfterBoot: 'None',
  autoStarted: false,
  startAccepted: true,
  statesSeen: ['Playing', 'LevelWon'],
  tapsDriven: 12,
  terminalState: 'LevelWon',
  reachedTerminal: true,
  framesCaptured: 3,
  elapsedSeconds: 4.2,
  errors: [],
};

function frames(...pixels: Array<(x: number, y: number) => [number, number, number]>): void {
  pixels.forEach((p, i) =>
    writeFileSync(join(dir, `frame_${String(i).padStart(5, '0')}.png`), encodeRgbPng(160, 90, p)),
  );
}
const drawn =
  (seed: number) =>
  (x: number, y: number): [number, number, number] => [
    ((x + seed) * 7) & 255,
    (y * 11) & 255,
    ((x ^ y) * 3) & 255,
  ];
const flat = (): [number, number, number] => [20, 20, 20];

describe('the play-through verdict is derived from the record, the pixels and the runner', () => {
  it('ok when the level ended, frames are drawn and something moved', () => {
    writeFileSync(join(dir, 'playthrough.json'), JSON.stringify(goodRecord));
    frames(drawn(0), drawn(40), drawn(90));
    const v = judgePlaythrough(dir, { total: 1, passed: 1, failed: 0, result: 'Passed' });
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.frames).toMatchObject({ count: 3, unreadable: 0, flat: 0 });
    expect(v.frames.maxMotionShare).toBeGreaterThan(MIN_MOTION_SHARE);
    expect(renderVerdict(v, dir)).toContain('PLAY-THROUGH OK');
    expect(renderVerdict(v, dir)).toContain('auto-started: no');
  });

  it('a level that never ended is not ok, and the reason names the last state and the taps', () => {
    writeFileSync(
      join(dir, 'playthrough.json'),
      JSON.stringify({
        ...goodRecord,
        reachedTerminal: false,
        terminalState: 'Playing',
        statesSeen: ['Playing'],
        tapsDriven: 60,
      }),
    );
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/never ended: last state Playing after 60 taps/);
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
      JSON.stringify({
        ...goodRecord,
        startAccepted: false,
        errors: ['[Exception] NullReferenceException: x'],
      }),
    );
    frames(drawn(0), drawn(40));
    const v = judgePlaythrough(dir);
    expect(v.reasons.join('\n')).toMatch(/refused to start level 1/);
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
      'EditorBuildSettings:\n  m_Scenes:\n  - enabled: 0\n    path: Assets/Scenes/Old.unity\n    guid: a\n  - enabled: 1\n    path: Assets/Scenes/Main.unity\n    guid: b\n',
    );
    expect(entrySceneFromBuildSettings(dir)).toBe('Main');
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
  it('binds by reflection to the named services, reads its knobs from the environment, and writes the record', () => {
    const { source, asmdef } = buildPlaythroughTest('Main');
    for (const needle of [
      'STRADA_PLAYTHROUGH_SCENE',
      'STRADA_PLAYTHROUGH_LEVEL',
      'STRADA_PLAYTHROUGH_MAX_TAPS',
      'STRADA_PLAYTHROUGH_DEADLINE_S',
      'STRADA_CAPTURE_DIR',
      'STRADA_PLAYTHROUGH_JSON',
      DEFAULT_BINDING.flowType,
      DEFAULT_BINDING.inputType,
      '"StartLevel"',
      '"State"',
      '"CanTapConveyor"',
      '"TapConveyor"',
      '"LevelWon", "LevelFailed"',
      'MakeGenericMethod',
      'JsonUtility.ToJson(record, true)',
      'Application.CanStreamedLevelBeLoaded',
      'autoStarted',
    ])
      expect(source, needle).toContain(needle);
    expect(source).not.toMatch(/using YourGame/); // no assembly reference to the game: reflection only
    const parsed = JSON.parse(asmdef) as {
      name: string;
      references: string[];
      overrideReferences: boolean;
    };
    expect(parsed.name).toBe(PLAYTHROUGH_ASSEMBLY);
    expect(parsed.references).toContain('Strada.Core');
    expect(parsed.overrideReferences).toBe(false);
  });

  it('is written into its own folder under the test dir, and refused without the test framework', () => {
    mkdirSync(join(dir, 'Packages'));
    writeFileSync(join(dir, 'Packages', 'manifest.json'), '{"dependencies":{}}');
    expect(emitPlaythroughTest(dir, 'Main').written).toBe(false);
    writeFileSync(
      join(dir, 'Packages', 'manifest.json'),
      '{"dependencies":{"com.unity.test-framework":"1.4.5"}}',
    );
    const e = emitPlaythroughTest(dir, 'Main', { ...DEFAULT_BINDING, terminalStates: ['Won'] });
    expect(e.written).toBe(true);
    expect(e.paths[0]).toBe('Assets/Tests/PlayMode/Playthrough/StradaPlaythroughTest.cs');
    expect(
      existsSync(join(dir, 'Assets/Tests/PlayMode/Playthrough', `${PLAYTHROUGH_ASSEMBLY}.asmdef`)),
    ).toBe(true);
    expect(readFileSync(join(dir, e.paths[0]!), 'utf8')).toContain('{ "Won" }');
  });
});
