import { describe, it, expect } from 'vitest';
import { parseTestRun, failedTestNames, playmodeVerdict } from './nunit-results.js';

const run = (attrs: string, cases = ''): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<test-run id="2" ${attrs}>${cases}</test-run>`;

describe('reading a Unity test run', () => {
  it('takes the counts from the top-level element', () => {
    const outcome = parseTestRun(run('result="Passed" total="12" passed="12" failed="0" skipped="0"'));

    expect(outcome).toEqual({ result: 'Passed', total: 12, passed: 12, failed: 0, skipped: 0 });
  });

  it('calls a partly-failing run failed, where a substring check would not', () => {
    const xml = run(
      'result="Failed" total="3" passed="1" failed="2"',
      '<test-case fullname="Board.Boots" result="Passed"/>' +
        '<test-case fullname="Board.Scores" result="Failed"/>' +
        '<test-case fullname="Board.Resets" result="Error"/>',
    );

    // The old assertion. It holds for this red run.
    expect(xml).toContain('Passed');

    expect(parseTestRun(xml)!.failed).toBe(2);
    expect(failedTestNames(xml)).toEqual(['Board.Scores', 'Board.Resets']);
  });

  it('does not take counts from a test case', () => {
    expect(parseTestRun(run('result="Failed" total="0"', '<test-case passed="99"/>'))!.passed).toBe(0);
  });

  it('reports nothing when no results were written', () => {
    expect(parseTestRun('')).toBeNull();
  });

  it('reads an unparseable count as zero rather than NaN', () => {
    const outcome = parseTestRun(run('result="Passed" total="oops" failed="oops"'))!;
    expect(outcome.total).toBe(0);
    expect(outcome.failed).toBe(0);
  });
});

describe('the play-mode verdict', () => {
  const outcome = (total: number, failed: number) => ({
    result: failed > 0 ? 'Failed' : 'Passed',
    total,
    passed: total - failed,
    failed,
    skipped: 0,
  });

  it('passes a clean run', () => {
    expect(playmodeVerdict(outcome(5, 0))).toEqual({ passed: true, reason: 'ok' });
  });

  it('refuses to call a run of nothing a pass', () => {
    // The condition that matters most. A fresh generated project has no PlayMode
    // test assembly at all, and `failed === 0` is perfectly true of it.
    expect(playmodeVerdict(outcome(0, 0))).toEqual({ passed: false, reason: 'nothing-ran' });
  });

  it('fails when tests failed', () => {
    expect(playmodeVerdict(outcome(5, 1)).reason).toBe('tests-failed');
  });

  it('fails a green run in which the game threw', () => {
    // Every assertion passed and a MonoBehaviour still blew up; nothing else
    // would have caught it, because no test was watching.
    const verdict = playmodeVerdict(outcome(5, 0), ['NullReferenceException: at Board.Start()']);

    expect(verdict).toEqual({ passed: false, reason: 'threw' });
  });

  it('fails when no results file was parsed at all', () => {
    expect(playmodeVerdict(null).reason).toBe('no-results');
  });
});
