/**
 * `captureDir: "."` deleted the project. These are the inputs Codex ran
 * (2026-09-12 U#F7, X): the runner cleared whatever the caller named.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isRecorderOutput, prepareCaptureDir, resolveCaptureDir, RECORDING_MARKER } from './capture-dir.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'capture-dir-'));
  roots.push(root);
  mkdirSync(join(root, 'Assets'), { recursive: true });
  mkdirSync(join(root, 'Recordings'), { recursive: true });
  return root;
}

describe('where a run may write its recordings', () => {
  it('refuses the project root, Assets, an escape and the recording root itself', () => {
    const root = project();
    for (const asked of ['.', '', ' ', 'Assets', '../..', join(root, 'Assets'), 'Recordings', './Recordings/', '/tmp']) {
      const decision = resolveCaptureDir(root, asked, 'Recordings/player-playthrough');
      if (asked === '' || asked === ' ') {
        // Empty means "no request": the default subdirectory is used.
        expect(decision.dir).toBeDefined();
        continue;
      }
      expect(decision.dir, `captureDir ${JSON.stringify(asked)}`).toBeUndefined();
      expect(decision.reason).toContain('must name a directory under Recordings/');
    }
  });

  it('allows a run directory under the recording root, asked for either way', () => {
    const root = project();
    // The decision is the REAL path — on macOS /var is a symlink to
    // /private/var, and a lexical answer would name a directory that is not
    // the one the runner writes into.
    const real = (...parts: string[]): string => join(realpathSync(root), ...parts);
    expect(resolveCaptureDir(root, 'Recordings/playthrough', 'Recordings/player-playthrough').dir)
      .toBe(real('Recordings', 'playthrough'));
    expect(resolveCaptureDir(root, join(root, 'Recordings', 'run-7'), 'Recordings/player-playthrough').dir)
      .toBe(real('Recordings', 'run-7'));
    expect(resolveCaptureDir(root, undefined, 'Recordings/player-playthrough').dir)
      .toBe(real('Recordings', 'player-playthrough'));
  });

  it('refuses a Recordings directory that is ITSELF a symlink elsewhere (Codex 2026-09-12 Y)', () => {
    // The guard resolved its own authority through that link, so
    // "/project/Recordings -> /victim" moved the permitted tree to /victim
    // and `captureDir: "Recordings/assets"` was accepted and then removed
    // recursively.
    const root = mkdtempSync(join(tmpdir(), 'capture-dir-linked-'));
    roots.push(root);
    mkdirSync(join(root, 'Assets'), { recursive: true });
    const victim = mkdtempSync(join(tmpdir(), 'victim-'));
    roots.push(victim);
    writeFileSync(join(victim, 'precious.txt'), 'do not delete me');
    symlinkSync(victim, join(root, 'Recordings'));

    const decision = resolveCaptureDir(root, 'Recordings/assets', 'Recordings/player-playthrough');
    expect(decision.dir).toBeUndefined();
    expect(decision.reason).toContain('nothing was written or removed');

    // …and the same layout pointing back at the project itself.
    const selfLinked = mkdtempSync(join(tmpdir(), 'capture-dir-self-'));
    roots.push(selfLinked);
    mkdirSync(join(selfLinked, 'Assets'), { recursive: true });
    symlinkSync(selfLinked, join(selfLinked, 'Recordings'));
    expect(resolveCaptureDir(selfLinked, 'Recordings/Assets', 'Recordings/player-playthrough').dir).toBeUndefined();
  });

  it('does not refuse an ordinary name that merely starts with dots', () => {
    // `rel.startsWith("..")` also matches a filename, so "..valid" — a legal
    // directory name — was refused (Codex 2026-09-12 Y).
    const root = project();
    expect(resolveCaptureDir(root, join('Recordings', '..valid'), 'Recordings/player-playthrough').dir)
      .toBe(join(realpathSync(root), 'Recordings', '..valid'));
  });

  it('refuses a symlink that leaves the recording root', () => {
    const root = project();
    const outside = mkdtempSync(join(tmpdir(), 'elsewhere-'));
    roots.push(outside);
    writeFileSync(join(outside, 'precious.txt'), 'do not delete me');
    symlinkSync(outside, join(root, 'Recordings', 'escape'));
    const decision = resolveCaptureDir(root, 'Recordings/escape/frames', 'Recordings/player-playthrough');
    expect(decision.dir).toBeUndefined();
    expect(decision.reason).toContain('nothing was written or removed');
  });
});

/**
 * Containment alone does not make a directory OURS: an `Assets/SharedArt`
 * symlink pointing INTO Recordings/ resolves inside the permitted tree, and
 * the next statement deleted the real art it pointed at (Codex 2026-09-12
 * Z#7).
 */
describe('the recorder clears only what it owns', () => {
  it('refuses a directory that holds files it did not write', () => {
    const root = project();
    const art = join(root, 'Recordings', 'source-art');
    mkdirSync(art, { recursive: true });
    writeFileSync(join(art, 'Hero.png'), 'real art');

    const decision = prepareCaptureDir(art);
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain('did not write');
    // The art is still there.
    expect(existsSync(join(art, 'Hero.png'))).toBe(true);
  });

  it('creates a fresh directory, marks it, and clears its OWN one next time', () => {
    const root = project();
    const run = join(root, 'Recordings', 'run-1');
    expect(prepareCaptureDir(run).ok).toBe(true);
    expect(existsSync(join(run, RECORDING_MARKER))).toBe(true);

    // A previous run's frames are ours to clear.
    writeFileSync(join(run, 'frame_00000.png'), 'old');
    expect(prepareCaptureDir(run).ok).toBe(true);
    expect(readdirSync(run)).toEqual([RECORDING_MARKER]);

    // An empty directory nobody marked is fine too.
    const empty = join(root, 'Recordings', 'run-2');
    mkdirSync(empty, { recursive: true });
    expect(prepareCaptureDir(empty).ok).toBe(true);
  });
});

/**
 * Measured live on the vehicle, 2026-09-16: every play-through was refused
 * before it started — "Recordings/playthrough holds files this recorder did
 * not write (no .strada-recording)" — about frames the recorder itself had
 * written, before the marker existed (from Codex 2026-09-12 Z#7).
 */
describe('a directory holding only this recorder\'s own output is adopted', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'adopt-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('adopts frames and records written before the marker existed', () => {
    const run = join(dir, 'Recordings', 'playthrough');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'frame_00000.png'), 'x');
    writeFileSync(join(run, 'frame_s01_00007.png'), 'x');
    writeFileSync(join(run, 'playthrough.json'), '{}');
    writeFileSync(join(run, 'playthrough-verdict.json'), '{}');
    writeFileSync(join(run, 'player.log'), 'log');

    expect(prepareCaptureDir(run)).toEqual({ ok: true });
    // Adopted means CLEARED and marked, so the next run measures itself only.
    expect(existsSync(join(run, RECORDING_MARKER))).toBe(true);
    expect(existsSync(join(run, 'frame_00000.png'))).toBe(false);
  });

  it('still refuses a directory holding anything else', () => {
    const run = join(dir, 'Recordings', 'mixed');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'frame_00000.png'), 'x');
    writeFileSync(join(run, 'MyNotes.txt'), 'do not delete me');
    const verdict = prepareCaptureDir(run);
    expect(verdict.ok).toBe(false);
    expect(existsSync(join(run, 'MyNotes.txt'))).toBe(true);
  });

  it('knows which names are its own', () => {
    for (const name of ['frame_00001.png', 'frame_s02_00013.png', 'playthrough.json', 'playthrough-verdict.json', 'player.log']) {
      expect(isRecorderOutput(name), name).toBe(true);
    }
    for (const name of ['Board.unity', 'notes.md', 'frame.png', 'frame_00001.jpg', 'subdir']) {
      expect(isRecorderOutput(name), name).toBe(false);
    }
  });
});

describe('recorder output names (Strada.Brain round 6 #24)', () => {
  it('the player run sidecar is recorder output', () => {
    expect(isRecorderOutput('player-run.json')).toBe(true);
    expect(isRecorderOutput('player-run.json.bak')).toBe(false);
  });
});

describe('marker-less adoption needs regular files (Strada.Brain round 7 #23)', () => {
  it('a DIRECTORY named like recorder output is not recorder output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-adopt-'));
    try {
      mkdirSync(join(dir, 'player-run.json'));
      writeFileSync(join(dir, 'player-run.json', 'valuable.asset'), 'keep me');
      writeFileSync(join(dir, 'playthrough.json'), '{}');
      const ready = prepareCaptureDir(dir);
      expect(ready.ok).toBe(false);
      expect(existsSync(join(dir, 'player-run.json', 'valuable.asset'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
