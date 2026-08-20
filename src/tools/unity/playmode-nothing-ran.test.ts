/**
 * Zero tests in a results file has two very different causes.
 *
 * Measured on the run of 2026-08-20: the agent broke the build, then called
 * unity_playmode_verify thirteen times. Each run wrote a results file with
 * total=0, and each time the answer named the two causes it was not — "the
 * project has no PlayMode tests, or the filter matched nothing" — while the
 * real one, that nothing compiled so the test assembly was never built, sat in
 * the Unity log the tool had already read.
 */

import { describe, it, expect } from 'vitest';
import { PlaymodeVerifyTool } from './playmode-verify.js';

const EMPTY_RUN = {
  result: 'Passed',
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
};

function render(tool: PlaymodeVerifyTool, log: string): string {
  return (
    tool as unknown as {
      render(
        outcome: typeof EMPTY_RUN,
        exceptions: string[],
        failures: readonly unknown[],
        exitCode: number,
        reason: string,
        log: string,
      ): string;
    }
  ).render(EMPTY_RUN, [], [], 0, 'nothing-ran', log);
}

describe('an empty run with a broken build', () => {
  const COMPILE_LOG = [
    'Some unrelated line',
    "Assets/Modules/Input/IInputService.cs(3,22): error CS0101: already contains a definition for 'IInputService'",
    "Assets/Modules/Board/Board.cs(10,5): error CS0246: type 'IBoardService' could not be found",
  ].join('\n');

  it('names the compile failure rather than a missing test assembly', () => {
    const out = render(new PlaymodeVerifyTool(), COMPILE_LOG);

    expect(out).toContain('does not compile');
    expect(out).toContain('CS0101');
    expect(out).not.toContain('the filter matched nothing');
  });

  it('still says "no test executed" — an empty run is never a pass', () => {
    expect(render(new PlaymodeVerifyTool(), COMPILE_LOG)).toContain('no test executed');
  });

  it('keeps the original wording when the build is fine', () => {
    const out = render(new PlaymodeVerifyTool(), 'Compilation succeeded\nNothing to report');

    expect(out).toContain('the filter matched nothing');
    expect(out).not.toContain('does not compile');
  });

  it('does not repeat one fault reported at many call sites', () => {
    const repeated = [
      "Assets/A.cs(1,1): error CS0246: type 'IBoardService' could not be found",
      "Assets/B.cs(2,2): error CS0246: type 'IBoardService' could not be found",
      "Assets/C.cs(3,3): error CS0246: type 'IBoardService' could not be found",
    ].join('\n');

    const shown = render(new PlaymodeVerifyTool(), repeated)
      .split('\n')
      .filter((l) => l.includes('CS0246'));

    expect(shown).toHaveLength(1);
  });
});
