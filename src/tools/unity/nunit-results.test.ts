import { describe, it, expect } from 'vitest';
import { parseTestRun, failedTestNames, failedTests, playmodeVerdict } from './nunit-results.js';

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

  it('refuses to call an all-skipped run a pass', () => {
    // total > 0 and failed === 0 while nothing executed: the same emptiness the
    // total check catches, arriving through a different door. NUnit skips a
    // whole assembly when its constraints exclude the platform.
    const skipped = { result: 'Skipped', total: 4, passed: 0, failed: 0, skipped: 4 };

    expect(playmodeVerdict(skipped)).toEqual({ passed: false, reason: 'nothing-ran' });
  });

  it('still passes a run where some tests were skipped and the rest passed', () => {
    const mixed = { result: 'Passed', total: 4, passed: 3, failed: 0, skipped: 1 };

    expect(playmodeVerdict(mixed).passed).toBe(true);
  });

  it('fails when no results file was parsed at all', () => {
    expect(playmodeVerdict(null).reason).toBe('no-results');
  });
});

describe('the reason a case failed', () => {
  // Measured 2026-08-20: unity_playmode_verify reported
  // "StradaBootSmokeTest.TheAssembledSceneBootsWithoutError" and stopped there.
  // The reason was in the results file the whole time; getting it out meant
  // running Unity by hand.
  const xml = `<?xml version="1.0"?>
<test-run id="2" result="Failed(Child)" total="1" passed="0" failed="1" skipped="0">
  <test-case id="1002" name="TheAssembledSceneBootsWithoutError"
             fullname="StradaBootSmokeTest.TheAssembledSceneBootsWithoutError" result="Failed">
    <failure>
      <message><![CDATA[GameBootstrapper is in the scene but never finished initializing.
  Expected: True
  But was:  False]]></message>
      <stack-trace><![CDATA[at StradaBootSmokeTest...]]></stack-trace>
    </failure>
  </test-case>
</test-run>`;

  it('carries the assertion message next to the name', () => {
    const [failure] = failedTests(xml);

    expect(failure!.name).toBe('StradaBootSmokeTest.TheAssembledSceneBootsWithoutError');
    expect(failure!.message).toContain('never finished initializing');
  });

  it('collapses the message onto one line so a report stays readable', () => {
    expect(failedTests(xml)[0]!.message).not.toContain('\n');
  });

  it('ignores cases that passed', () => {
    const passing = xml.replace('result="Failed">', 'result="Passed">');

    expect(failedTests(passing)).toHaveLength(0);
  });

  it('still names a failure that gives no message', () => {
    const bare = `<test-run><test-case fullname="A.B" result="Failed"></test-case></test-run>`;

    expect(failedTests(bare)).toEqual([{ name: 'A.B' }]);
  });

  it('does not lend an earlier failure\'s message to a later one', () => {
    // The document order that matters: a case WITH a message, then one without.
    // Reading the message from the document rather than from the case makes the
    // second failure report the first one's reason.
    const two = `<test-run>
  <test-case fullname="A.First" result="Failed"><failure><message><![CDATA[first failed]]></message></failure></test-case>
  <test-case fullname="A.Second" result="Failed"></test-case>
</test-run>`;

    const failures = failedTests(two);
    expect(failures[0]!.message).toBe('first failed');
    expect(failures[1]).toEqual({ name: 'A.Second' });
  });

  it('does not attribute one case\'s message to the next', () => {
    const two = `<test-run>
  <test-case fullname="A.First" result="Passed"></test-case>
  <test-case fullname="A.Second" result="Failed"><failure><message><![CDATA[second failed]]></message></failure></test-case>
</test-run>`;

    const failures = failedTests(two);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.message).toBe('second failed');
  });
});
