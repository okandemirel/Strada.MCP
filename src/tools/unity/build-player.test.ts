import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPlayerArgs, buildReceipt, judgePlayerBuild, renderPlayerBuild, sizeOnDisk, BUILD_TARGETS } from './build-player.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'build-player-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('unity_build_player (audited 2026-09-10: every build path needed a live Editor)', () => {
  it('drives the headless builder without -quit and passes the target and output through', () => {
    const args = buildPlayerArgs({ projectPath: '/p', resultPath: '/r.json', logPath: '/l.log', target: 'android', outputDir: '/out' });
    expect(args).toContain('-executeMethod');
    expect(args).toContain('Strada.Core.Editor.Headless.StradaPlayerBuilder.Build');
    expect(args).not.toContain('-quit');
    expect(args.slice(args.indexOf('-stradaTarget'), args.indexOf('-stradaTarget') + 2)).toEqual(['-stradaTarget', 'android']);
    expect(args.slice(args.indexOf('-stradaOutput'), args.indexOf('-stradaOutput') + 2)).toEqual(['-stradaOutput', '/out']);
    expect(buildPlayerArgs({ projectPath: '/p', resultPath: '/r', logPath: '/l' })).not.toContain('-stradaTarget');
    expect(BUILD_TARGETS).toContain('webgl');
  });

  it('a built artifact that exists on disk is ok, with its measured size', () => {
    const out = join(dir, 'Game.apk');
    writeFileSync(out, Buffer.alloc(4096));
    const resultPath = join(dir, 'result.json');
    writeFileSync(resultPath, JSON.stringify({ built: true, exitCode: 0, target: 'android', outputPath: out, sizeBytes: 4096, durationMs: 61000, warnings: 2, scenes: ['Assets/Scenes/Entry.unity'], errors: [] }));
    const v = judgePlayerBuild(resultPath, 0, '');
    expect(v.ok).toBe(true);
    expect(v.artifact).toEqual({ path: out, exists: true, sizeBytes: 4096 });
    expect(renderPlayerBuild(v)).toContain('PLAYER BUILT (android)');
    expect(renderPlayerBuild(v)).toContain('0.0 MB on disk');
  });

  it('a report that says built with nothing on disk is not ok', () => {
    const resultPath = join(dir, 'result.json');
    writeFileSync(resultPath, JSON.stringify({ built: true, exitCode: 0, target: 'webgl', outputPath: join(dir, 'missing'), sizeBytes: 0, durationMs: 1, warnings: 0, scenes: ['a'], errors: [] }));
    const v = judgePlayerBuild(resultPath, 0, '');
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/nothing exists at/);
  });

  it('a failed build carries the report errors; no result file names the compile errors', () => {
    const resultPath = join(dir, 'result.json');
    writeFileSync(resultPath, JSON.stringify({ built: false, exitCode: 23, target: 'ios', outputPath: '', sizeBytes: 0, durationMs: 1, warnings: 0, scenes: [], errors: ['build target iOS is not supported by this Editor install — the iOS build support module is missing'] }));
    const v = judgePlayerBuild(resultPath, 23, '');
    expect(v.ok).toBe(false);
    expect(v.reasons[0]).toMatch(/build support module is missing/);
    const none = judgePlayerBuild(join(dir, 'nope.json'), 1, 'Assets/X.cs(1,1): error CS1002: ; expected');
    expect(none.reasons[0]).toMatch(/scripts do not compile/);
    expect(none.reasons[0]).toContain('CS1002');
  });

  it('measures a directory artifact recursively', () => {
    mkdirSync(join(dir, 'web', 'Build'), { recursive: true });
    writeFileSync(join(dir, 'web', 'index.html'), 'x'.repeat(100));
    writeFileSync(join(dir, 'web', 'Build', 'game.wasm'), Buffer.alloc(900));
    expect(sizeOnDisk(join(dir, 'web'))).toBe(1000);
  });
});

/**
 * The exit code was consulted only when no result file existed, so a build
 * whose report said "built" with a real artifact on disk came back ok:true
 * while Unity had exited 42 — or been killed (Codex 2026-09-12 AA).
 */
describe('a build Unity did not finish normally', () => {
  it('is not ok, however good its report and artifact look', () => {
    const root = mkdtempSync(join(tmpdir(), 'build-exit-'));
    try {
      const out = join(root, 'Builds', 'macos', 'Game.app');
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'Game'), 'x'.repeat(4096));
      const resultPath = join(root, 'result.json');
      const report = {
        built: true, target: 'StandaloneOSX', outputPath: out, scenes: ['Assets/Scenes/Entry.unity'],
        durationMs: 90_000, warnings: 0, errors: [], exitCode: 0,
      };
      writeFileSync(resultPath, JSON.stringify(report));

      expect(judgePlayerBuild(resultPath, 0, '').ok).toBe(true);
      const failed = judgePlayerBuild(resultPath, 42, '');
      expect(failed.ok).toBe(false);
      expect(failed.reasons.join(' ')).toContain('Unity exited 42');
      const killed = judgePlayerBuild(resultPath, -1, '');
      expect(killed.ok).toBe(false);
      expect(killed.reasons.join(' ')).toContain('never exited normally');

      // A REPORT HAS TO BE A REPORT: `null` parses, and "no report to judge"
      // then let a clean exit pass with no artifact at all (Codex AB J4.4).
      writeFileSync(resultPath, 'null');
      const nulled = judgePlayerBuild(resultPath, 0, '');
      expect(nulled.ok).toBe(false);
      expect(nulled.reasons.join(' ')).toContain('not a build report');
      writeFileSync(resultPath, '{"built":"yes"}');
      expect(judgePlayerBuild(resultPath, 0, '').ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * A BUILD'S RECEIPT STATES WHAT THE RUNNER MEASURED (Codex 2026-09-13 AI, the
 * player-build row): `timedOut` was estimated from the clock, so a build
 * finishing a millisecond late read as a timeout while one killed early read
 * as clean.
 */
describe('the build receipt', () => {
  const read = (text: string) => JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(text)![1]!) as Record<string, any>;
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'build-receipt-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const verdictFor = (exitCode: number): ReturnType<typeof judgePlayerBuild> => {
    const out = join(root, 'Builds', 'macos', 'Game.app');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'Game'), 'x'.repeat(4096));
    const resultPath = join(root, 'result.json');
    writeFileSync(resultPath, JSON.stringify({
      built: true, target: 'StandaloneOSX', outputPath: out, scenes: ['Assets/Scenes/Entry.unity'],
      durationMs: 90_000, warnings: 0, errors: [], exitCode,
    }));
    return judgePlayerBuild(resultPath, exitCode, '');
  };

  it('names the target, the artifact it measured, and how the editor ended', () => {
    const receipt = read(buildReceipt({ evidenceRunId: 'run-b1' }, root, verdictFor(0), { exitCode: 0, timedOut: false, completed: true }));
    expect(receipt).toMatchObject({
      schemaVersion: 1, runId: 'run-b1', kind: 'player-build', medium: 'builder', target: 'StandaloneOSX',
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    expect(String(receipt['artifactSha256'])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an editor KILLED at the deadline is not one that completed', () => {
    const killed = read(buildReceipt({ evidenceRunId: 'run-b2' }, root, verdictFor(-1), { exitCode: -1, timedOut: true, completed: false }));
    expect(killed['execution']).toEqual({ completed: false, exitCode: -1, timedOut: true });
    // …and an editor that exited non-zero on its own DID complete.
    const failed = read(buildReceipt({ evidenceRunId: 'run-b3' }, root, verdictFor(42), { exitCode: 42, timedOut: false, completed: true }));
    expect(failed['execution']).toEqual({ completed: true, exitCode: 42, timedOut: false });
    // An editor that could NEVER BE SPAWNED completed nothing either — and it
    // did not time out, so completion cannot be inferred from the deadline.
    const unspawned = read(buildReceipt({ evidenceRunId: 'run-b4' }, root, verdictFor(-1), { exitCode: -1, timedOut: false, completed: false }));
    expect(unspawned['execution']).toEqual({ completed: false, exitCode: -1, timedOut: false });
  });

  it('says nothing at all when no run id was issued', () => {
    expect(buildReceipt({}, root, verdictFor(0), { exitCode: 0, timedOut: false, completed: true })).toBe('');
  });
});
