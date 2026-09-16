import { runUnityProcess, suiteReceipt } from './playmode-verify.js';

describe('the PlayMode run record (2026-09-10)', () => {
  it('is written from the NUnit counts and the call arguments, with unfiltered a fact of the call', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { writePlaymodeRunRecord, PLAYMODE_RUN_RECORD_REL } = await import('./playmode-verify.js');
    const root = mkdtempSync(join(tmpdir(), 'pm-record-'));
    try {
      writePlaymodeRunRecord(root, { measuredAt: 't', result: 'Failed', total: 215, passed: 205, failed: 10, skipped: 0, failedNames: ['A.B.C'], filter: null, categories: null, exceptions: 1, exitCode: 2, reason: 'tests-failed' });
      const rec = JSON.parse(readFileSync(join(root, PLAYMODE_RUN_RECORD_REL), 'utf8'));
      expect(rec).toMatchObject({ total: 215, failed: 10, failedNames: ['A.B.C'], unfiltered: true });
      writePlaymodeRunRecord(root, { measuredAt: 't', result: 'Passed', total: 12, passed: 12, failed: 0, skipped: 0, failedNames: [], filter: 'Game.*', categories: null, exceptions: 0, exitCode: 0, reason: 'ok' });
      expect(JSON.parse(readFileSync(join(root, PLAYMODE_RUN_RECORD_REL), 'utf8')).unfiltered).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * THE SUITE ANSWERS FOR ITS RUN (Codex 2026-09-13 AI, the playmode-suite row).
 *
 * This path wrote an unticketed result file and nothing else: the suite behind
 * every delivery was a file a worker could have written.
 */
describe('the suite receipt', () => {
  const outcome = { result: 'Passed', total: 10, passed: 10, failed: 0, skipped: 0 } as never;
  const read = (text: string) => JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(text)![1]!) as Record<string, any>;

  it('states how the editor ended, what ran, the scope it ran in, and the bytes it read', () => {
    const receipt = read(suiteReceipt(
      { evidenceRunId: 'run-s1', testFilter: 'Game.Board.Tests', categories: ' ' },
      '/tmp/project',
      { outcome, exceptions: 0, xml: '<test-run total="10"/>', ran: { exitCode: 0, timedOut: false, completed: true } },
    ));
    expect(receipt).toMatchObject({
      schemaVersion: 1, runId: 'run-s1', kind: 'playmode-suite', medium: 'editor',
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    expect(receipt['payload']).toMatchObject({
      result: 'Passed', total: 10, passed: 10, failed: 0, skipped: 0, exceptions: 0,
      // A FILTERED green is the run choosing which tests count, and the
      // receipt says which filter; a blank one is no filter at all.
      filter: 'Game.Board.Tests', categories: null,
    });
    expect(String(receipt['payload']['resultsSha256'])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an editor killed at the deadline is not one that completed', () => {
    const killed = read(suiteReceipt(
      { evidenceRunId: 'run-s2' },
      '/tmp/project',
      { outcome, exceptions: 2, xml: '<test-run/>', ran: { exitCode: -1, timedOut: true, completed: false } },
    ));
    expect(killed['execution']).toEqual({ completed: false, exitCode: -1, timedOut: true });
    expect(killed['payload']['exceptions']).toBe(2);
  });

  it('the digest is of the RESULTS, so two runs of different results differ', () => {
    const digest = (xml: string) => read(suiteReceipt(
      { evidenceRunId: 'r' }, '/tmp/project',
      { outcome, exceptions: 0, xml, ran: { exitCode: 0, timedOut: false, completed: true } },
    ))['payload']['resultsSha256'];
    expect(digest('<test-run passed="10"/>')).not.toBe(digest('<test-run passed="9"/>'));
  });

  it('says nothing at all when no run id was issued', () => {
    expect(suiteReceipt({}, '/tmp/project', {
      outcome, exceptions: 0, xml: '<test-run/>', ran: { exitCode: 0, timedOut: false, completed: true },
    })).toBe('');
  });
});

/**
 * A Unity batch run that was KILLED is not one that exited.
 *
 * Both came back -1, so every caller that had to state `timedOut` guessed it
 * from the clock — a build finishing a millisecond late read as a timeout,
 * one killed early read as clean (Codex 2026-09-13 AI).
 */
describe('runUnityProcess measures how the editor ended', () => {
  it('a process killed at the deadline says so; one that exits keeps its code', async () => {
    expect(await runUnityProcess('/bin/sh', ['-c', 'sleep 30'], 150)).toMatchObject({ timedOut: true, completed: false });
    expect(await runUnityProcess('/bin/sh', ['-c', 'exit 42'], 10_000)).toEqual({ exitCode: 42, timedOut: false, completed: true });
    expect(await runUnityProcess('/bin/sh', ['-c', 'exit 0'], 10_000)).toEqual({ exitCode: 0, timedOut: false, completed: true });
    // A binary that cannot be spawned completed nothing.
    expect(await runUnityProcess('/nonexistent/unity', [], 10_000)).toMatchObject({ completed: false, exitCode: -1 });
  });
});
