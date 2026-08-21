import { describe, expect, it } from 'vitest';

import { failedTests } from './nunit-results.js';
import { PlaymodeVerifyTool } from './playmode-verify.js';

const XML = `<test-run>
  <test-case fullname="Game.Tests.LossLevel_ReachesLostState" result="Failed">
    <output><![CDATA[
[GameFlow] StartLevel(2) -> Playing
[Pig] conveyor spawned 4 pigs
[GameFlow] deadlock check: exposed=3 matching=0
[GameFlow] grace timer reset by pig landing
]]></output>
    <failure>
      <message><![CDATA[LevelLost event should have fired. Expected: True But was: False]]></message>
    </failure>
  </test-case>
  <test-case fullname="Game.Tests.Passing" result="Passed">
    <output><![CDATA[nothing to see]]></output>
  </test-case>
</test-run>`;

describe('a failing test brings what the game printed', () => {
  it('carries the failing case output, not just the assertion', () => {
    const [failure] = failedTests(XML);

    expect(failure?.message).toContain('LevelLost event should have fired');
    // The assertion says the event did not fire; only the output says why.
    expect(failure?.output).toContain('grace timer reset by pig landing');
  });

  it('does not report output from tests that passed', () => {
    const failures = failedTests(XML);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.output).not.toContain('nothing to see');
  });

  it('keeps the tail when a test printed more than fits', () => {
    const noisy = `<test-run><test-case fullname="T" result="Failed"><output><![CDATA[
${Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')}
]]></output><failure><message>boom</message></failure></test-case></test-run>`;

    const out = failedTests(noisy)[0]?.output ?? '';

    expect(out).toContain('line 39');
    expect(out).not.toContain('line 0\n');
    expect(out.split('\n').length).toBeLessThanOrEqual(12);
  });

  it('says nothing when the runner captured nothing', () => {
    const quiet = `<test-run><test-case fullname="T" result="Failed"><failure><message>boom</message></failure></test-case></test-run>`;

    expect(failedTests(quiet)[0]?.output).toBeUndefined();
  });

  it("puts that output in the verdict the caller actually reads", () => {
    // The parser is proved above; without this, removing the output from the
    // rendered result would break the thing that matters and fail nothing.
    const rendered = (
      new PlaymodeVerifyTool() as unknown as {
        render(
          outcome: { result: string; total: number; passed: number; failed: number; skipped: number },
          exceptions: string[],
          failures: readonly unknown[],
          exitCode: number,
          reason: string,
          log: string,
        ): string;
      }
    ).render(
      { result: 'Failed', total: 42, passed: 40, failed: 2, skipped: 0 },
      [],
      failedTests(XML),
      2,
      'tests-failed',
      '',
    );

    expect(rendered).toContain('LevelLost event should have fired');
    expect(rendered).toContain('grace timer reset by pig landing');
  });

  it("says so when a failure printed nothing at all", () => {
    const quiet = `<test-run><test-case fullname="T" result="Failed"><failure><message>LevelLost event should have fired</message></failure></test-case></test-run>`;

    const rendered = (
      new PlaymodeVerifyTool() as unknown as {
        render(o: unknown, e: string[], f: readonly unknown[], x: number, r: string, l: string): string;
      }
    ).render({ result: 'Failed', total: 1, passed: 0, failed: 1, skipped: 0 }, [], failedTests(quiet), 2, 'tests-failed', '');

    expect(rendered).toContain('printed anything');
    expect(rendered).toContain('add logging');
  });

  it("stays quiet about logging when the output is already there", () => {
    const rendered = (
      new PlaymodeVerifyTool() as unknown as {
        render(o: unknown, e: string[], f: readonly unknown[], x: number, r: string, l: string): string;
      }
    ).render({ result: 'Failed', total: 42, passed: 40, failed: 2, skipped: 0 }, [], failedTests(XML), 2, 'tests-failed', '');

    expect(rendered).toContain('grace timer reset by pig landing');
    expect(rendered).not.toContain('add logging');
  });

  it("spends the tail on distinct observations, not on repetition", () => {
    // The measured shape: a frame-by-frame log where one line repeats until
    // something changes. Twelve slots of the same sentence taught nothing.
    const repeated = [
      '<test-run><test-case fullname="T" result="Failed"><output><![CDATA[',
      '[GameFlow] StartLevel(1) -> Playing',
      ...Array.from({ length: 30 }, () => '[PigSystem.OnUpdate] PigService or Tray is null'),
      '[GameFlow] level timed out',
      ']]></output><failure><message>boom</message></failure></test-case></test-run>',
    ].join('\n');

    const out = failedTests(repeated)[0]?.output ?? '';

    expect(out).toContain('StartLevel(1) -> Playing');
    expect(out).toContain('(x30)');
    expect(out).toContain('level timed out');
    // Without collapsing, the opening line would have scrolled out of the tail.
    expect(out.split('\n').length).toBeLessThanOrEqual(12);
  });

  it("leaves a log that never repeats exactly as it was", () => {
    const varied = `<test-run><test-case fullname="T" result="Failed"><output><![CDATA[
one
two
three
]]></output><failure><message>boom</message></failure></test-case></test-run>`;

    expect(failedTests(varied)[0]?.output).toBe('one\ntwo\nthree');
  });
});
