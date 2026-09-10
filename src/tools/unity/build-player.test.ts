import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPlayerArgs, judgePlayerBuild, renderPlayerBuild, sizeOnDisk, BUILD_TARGETS } from './build-player.js';

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
