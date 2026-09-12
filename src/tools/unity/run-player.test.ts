/**
 * unity_run_player: the built player is the only medium whose frame rate
 * speaks for what a person sees. The player here is a shell script standing
 * in for the artifact: it receives the runner's arguments, writes the record
 * a real Strada.Core PlayerPlaythroughRunner would, and drops frames.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findPlayerExecutable, newestArtifact, RunPlayerTool, PLAYER_CAPTURE_SUBDIR } from './run-player.js';
import { encodeRgbPng } from './png-metrics.test.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'run-player-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const drawn = (seed: number) => (x: number, y: number): [number, number, number] => [((x + seed) * 7) & 255, (y * 11) & 255, ((x ^ y) * 3) & 255];

/** A fake player: writes the record and two drawn frames where the runner is told to. */
function fakePlayer(dir: string, name: string, record: Record<string, unknown>): string {
  const frames = join(root, 'fixture-frames');
  mkdirSync(frames, { recursive: true });
  writeFileSync(join(frames, 'frame_00000.png'), encodeRgbPng(160, 90, drawn(0)));
  writeFileSync(join(frames, 'frame_00001.png'), encodeRgbPng(160, 90, drawn(40)));
  const recordPath = join(root, 'fixture-record.json');
  writeFileSync(recordPath, JSON.stringify(record));
  mkdirSync(dir, { recursive: true });
  const exe = join(dir, name);
  writeFileSync(
    exe,
    `#!/bin/sh\nout=""; cap=""\nwhile [ $# -gt 0 ]; do\n  case "$1" in\n    -stradaPlaythrough) out="$2"; shift;;\n    -stradaCaptureDir) cap="$2"; shift;;\n  esac\n  shift\ndone\nmkdir -p "$cap"; cp ${JSON.stringify(frames)}/*.png "$cap"/; cp ${JSON.stringify(recordPath)} "$out"\nexit 0\n`,
  );
  chmodSync(exe, 0o755);
  return exe;
}

const playerRecord = {
  medium: 'player', scene: 'Main', session: 1, driverType: 'Strada.Core.Play.IPlaythroughDriver', missing: '', phaseAfterBoot: 'Home',
  autoStarted: false, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true,
  framesCaptured: 2, elapsedSeconds: 6.5, bootSeconds: 1.2, playSeconds: 4.0, playFrames: 240, worstFrameMs: 21, sessionCount: 3,
  sessions: [{ index: 1, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 4.0, lastPhase: 'Won' }],
  errors: [], targetFrameRate: -1, vSyncCount: 1, screenWidth: 1280, screenHeight: 720,
};

describe('finding the player', () => {
  it('a macOS .app resolves to its MacOS executable; an .exe to itself; an .apk to nothing', () => {
    const app = join(root, 'Builds', 'macos', 'Game.app');
    mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), '');
    expect(findPlayerExecutable(app)).toBe(join(app, 'Contents', 'MacOS', 'Game'));
    const exe = join(root, 'Builds', 'windows', 'Game.exe');
    mkdirSync(join(root, 'Builds', 'windows'), { recursive: true });
    writeFileSync(exe, '');
    expect(findPlayerExecutable(exe)).toBe(exe);
    const apk = join(root, 'Builds', 'android', 'game.apk');
    mkdirSync(join(root, 'Builds', 'android'), { recursive: true });
    writeFileSync(apk, '');
    expect(findPlayerExecutable(apk)).toBeNull();
    expect([app, exe, join(root, 'Builds', 'windows')]).toContain(newestArtifact(root));
  });

  it('no Builds/ means no artifact', () => {
    expect(newestArtifact(root)).toBeNull();
  });
});

describe('unity_run_player', () => {
  it('runs the newest artifact through the runner and judges the record it wrote, naming the player medium', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const tool = new RunPlayerTool();
    const result = await tool.execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(result.isError).toBe(false);
    expect(result.content).toContain('Player: Game.x86_64');
    expect(result.content).toContain('PLAY-THROUGH OK');
    expect(result.content).toContain('Performance (built player, real rendering): boot 1.2 s to services; 240 frames in 4.0 s = 60.0 fps average; worst frame 21 ms.');
    expect(result.content).toContain('Sessions: catalog 3 session(s); played 1: #1 Won in 9 actions (4.0 s).');
    const verdictPath = join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json');
    expect(existsSync(verdictPath)).toBe(true);
    expect(JSON.parse(readFileSync(verdictPath, 'utf8')).perf).toMatchObject({ medium: 'player', avgFps: 60 });
  });

  it('a player that writes no record is not ok, and the header says why', async () => {
    const dir = join(root, 'Builds', 'linux');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, 'Game.x86_64');
    writeFileSync(exe, '#!/bin/sh\nexit 0\n');
    chmodSync(exe, 0o755);
    const result = await new RunPlayerTool().execute({}, { projectPath: root } as never);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('the runner wrote no record');
    expect(result.content).toContain('no play-through record was written');
  });

  it('no artifact, or one this machine cannot run, is an error that names the fix', async () => {
    const none = await new RunPlayerTool().execute({}, { projectPath: root } as never);
    expect(none.isError).toBe(true);
    expect(none.content).toContain('run unity_build_player first');
    mkdirSync(join(root, 'Builds', 'android'), { recursive: true });
    writeFileSync(join(root, 'Builds', 'android', 'game.apk'), '');
    const apk = await new RunPlayerTool().execute({ artifactPath: 'Builds/android/game.apk' }, { projectPath: root } as never);
    expect(apk.isError).toBe(true);
    expect(apk.content).toContain('not a player this machine can run');
  });
});

/**
 * A player that died is not a player that played. The exit code was printed
 * in the header and nowhere else: the verdict FILE — what Strada.Brain reads
 * — stayed green on exit 42 (Codex 2026-09-12 Y).
 */
describe('a failing exit invalidates the verdict', () => {
  it('reaches the verdict the Brain reads, not only the text the model sees', async () => {
    const exe = fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    // The same fake player, with a failing exit after it has written
    // everything a good run writes.
    writeFileSync(exe, readFileSync(exe, 'utf8').replace('exit 0', 'exit 42'));
    chmodSync(exe, 0o755);

    const result = await new RunPlayerTool().execute({ deadlineSeconds: 5 }, { projectPath: root } as never);

    expect(result.content).toContain('exit 42');
    expect(result.isError).toBe(true);
    const written = JSON.parse(
      readFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), 'utf8'),
    ) as { ok: boolean; reasons: string[] };
    expect(written.ok).toBe(false);
    expect(written.reasons.join(' ')).toContain('the player exited 42');
  });
});
