/**
 * Reading the picture instead of listing reasons it might be missing.
 *
 * Every other check that asks "does this game render" has to name a cause in
 * advance — no camera, no view layer, no spawner — and a game can fail to
 * render for a reason nobody listed. The frames need no list: identical frames
 * mean nothing changed, and frames that barely compress mean a flat colour.
 * Both are facts about the recording, whatever produced them.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PlaymodeVerifyTool } from './playmode-verify.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

function capture(frames: Buffer[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'frames-'));
  dirs.push(dir);
  frames.forEach((b, i) => writeFileSync(join(dir, `frame_${String(i).padStart(5, '0')}.png`), b));
  return dir;
}

function report(dir: string): string {
  const tool = new PlaymodeVerifyTool() as unknown as {
    renderCapture(d: string, log: string): string;
  };
  return tool.renderCapture(dir, '');
}

const flat = (seed: number) => Buffer.alloc(900, seed);
const busy = (seed: number) => Buffer.from(Array.from({ length: 40_000 }, (_, i) => (i * seed) % 251));

describe('what the recording shows', () => {
  it('says when nothing on screen ever changed', () => {
    const out = report(capture([flat(1), flat(1), flat(1)]));

    expect(out).toContain('Distinct frames: 1 of 3');
    expect(out).toContain('nothing on screen changed');
  });

  it('says when the frames are the size of a flat colour', () => {
    const out = report(capture([flat(1), flat(2), flat(3)]));

    expect(out).toContain('flat colour');
    expect(out).toContain('no camera, nothing spawned');
  });

  it('says neither about a recording that moves and has detail', () => {
    const out = report(capture([busy(1), busy(7), busy(13)]));

    expect(out).toContain('Distinct frames: 3 of 3');
    expect(out).not.toContain('nothing on screen changed');
    expect(out).not.toContain('flat colour');
  });

  it('reports, and does not turn a still title screen into a failure', () => {
    // A held picture is legitimate; the run that reads this knows which it is.
    const out = report(capture([busy(1), busy(1)]));

    expect(out).toContain('nothing on screen changed');
    expect(out).not.toMatch(/FAILED|Error:/);
  });
});
