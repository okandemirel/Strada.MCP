/**
 * `captureDir: "."` deleted the project. These are the inputs Codex ran
 * (2026-09-12 U#F7, X): the runner cleared whatever the caller named.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCaptureDir } from './capture-dir.js';

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
