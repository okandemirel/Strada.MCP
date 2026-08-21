import { describe, expect, it } from 'vitest';

import { buildBootSmokeTest } from './boot-smoke-test.js';

/**
 * The boot check watches for errors, not for chatter.
 *
 * It ended with LogAssert.NoUnexpectedReceived(), which fails the test on any
 * unhandled log line at all. Measured 2026-08-22, run 39, on a project that had
 * just been moved onto StradaLog:
 *
 *   Unhandled log message: '[Log] [Strada][General] [GameFlowSystem] OnInitialize'
 *
 * A system announcing that it initialized is the check passing, not failing.
 * Every ordinary boot line failed the one test whose job is to say whether the
 * scene boots, and the agent spent rounds chasing it.
 */

const { source } = buildBootSmokeTest('Main');
// Assertions about code should look at code. A first version of the first test
// below matched the comment that explains this very fix, and reported a defect
// that had already been repaired.
const code = source
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('what the boot check treats as a failure', () => {
  it('does not fail on an ordinary log line', () => {
    expect(code, 'any Debug.Log during boot fails the boot check').not.toContain(
      'LogAssert.NoUnexpectedReceived()',
    );
  });

  it('still fails on errors and exceptions', () => {
    // Dropping the check entirely would be worse than the bug: a scene that
    // boots while throwing would pass.
    expect(code).toMatch(/LogType\.Error|LogType\.Exception/u);
    expect(code).toContain('Assert.');
  });

  it('names what it saw when it fails', () => {
    // "an error was logged" sends the reader to the Unity console; the message
    // itself sends them to the cause.
    // Math.max, because a negative start counts from the end of the string and
    // silently measures an unrelated stretch of the file.
    const at = code.indexOf('LogType.Error');
    const watcher = code.slice(Math.max(0, at - 400), at + 400);

    expect(at, 'no error watch to inspect').toBeGreaterThan(-1);

    expect(watcher).toMatch(/condition|message|logString/u);
  });
});
