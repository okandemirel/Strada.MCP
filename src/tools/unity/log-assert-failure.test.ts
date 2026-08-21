import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { explainLogAssertFailure } from './playmode-verify.js';

/**
 * "Unhandled log message: '[Log] ...'" is a failing test, not a failing game.
 *
 * Measured 2026-08-22, run 39: the boot check failed with
 *
 *   Unhandled log message: '[Log] [Strada][General] [GameFlowSystem] OnInitialize'
 *
 * — a system announcing that it initialized. The agent read the test file four
 * times across twenty minutes and never wrote to it: the wording points at the
 * code that logged, so it looked for something wrong in the game, and there was
 * nothing wrong in the game. The signature is unmistakable and the verdict can
 * say what it means.
 */

describe('naming a too-strict log assertion', () => {
  it('recognises an informational log failing a test', () => {
    const note = explainLogAssertFailure(
      "Unhandled log message: '[Log] [Strada][General] [GameFlowSystem] OnInitialize'. " +
        'Use UnityEngine.TestTools.LogAssert.Expect',
    );

    expect(note).not.toBe('');
    expect(note?.toLowerCase()).toContain('test');
  });

  it('says nothing for a genuine error the test caught', () => {
    // [Error] and [Exception] mean the game really did misbehave; the test is
    // doing its job and must not be second-guessed.
    expect(
      explainLogAssertFailure("Unhandled log message: '[Error] NullReferenceException'"),
    ).toBe('');
    expect(
      explainLogAssertFailure("Unhandled log message: '[Exception] boom'"),
    ).toBe('');
  });

  it('says nothing for an ordinary assertion failure', () => {
    expect(explainLogAssertFailure('Expected: 3 But was: 6')).toBe('');
    expect(explainLogAssertFailure('')).toBe('');
  });

  it('points at the assertion rather than the log line', () => {
    const note = explainLogAssertFailure("Unhandled log message: '[Log] anything'");

    expect(note.toLowerCase()).toMatch(/logassert|assertion|too strict|not the game/u);
  });

  it('rides along with the failure the agent reads', () => {
    // Comment-stripped, and sliced around the code rather than from prose —
    // both traps caught earlier today.
    const code = readFileSync('src/tools/unity/playmode-verify.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    const at = code.indexOf("lines.push(`      ${failure.message}`)");
    const block = code.slice(at, at + 400);

    expect(at, 'the failure rendering moved; this test measures nothing').toBeGreaterThan(-1);
    expect(block, 'the explanation never reaches the agent').toContain(
      'explainLogAssertFailure(',
    );
  });
});
