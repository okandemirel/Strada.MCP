import { runUnityProcess, suiteReceipt, PlaymodeVerifyTool, type UnityProcessOutcome } from './playmode-verify.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

/**
 * Codex 2026-09-17 (on Strada.Brain 7cb9d8a3 #2): the verdict judged the
 * NUnit file alone — an editor that wrote a green file and then exited 1, or
 * was killed at its allowance, was "N of N tests ran clean", isError: false.
 */
describe('unity_playmode_verify and how the editor ended', () => {
  const GREEN_XML = '<?xml version="1.0"?><test-run id="2" testcasecount="1" result="Passed" total="1" passed="1" failed="0" skipped="0"><test-case name="Boots" fullname="A.Boots" result="Passed"/></test-run>';
  const prevEditor = process.env['UNITY_EDITOR_PATH'];
  let project = '';
  afterEach(() => {
    if (project) rmSync(project, { recursive: true, force: true });
    if (prevEditor === undefined) delete process.env['UNITY_EDITOR_PATH']; else process.env['UNITY_EDITOR_PATH'] = prevEditor;
  });
  /** The tool with its only process seam stubbed: Unity "writes" a green file, then ends as told. */
  const run = async (outcome: UnityProcessOutcome) => {
    project = mkdtempSync(join(tmpdir(), 'pmv-exit-'));
    mkdirSync(join(project, 'Assets'), { recursive: true });
    process.env['UNITY_EDITOR_PATH'] = '/bin/sh'; // only access()ed; runUnity is stubbed
    const tool = new PlaymodeVerifyTool();
    (tool as unknown as { runUnity: (b: string, args: string[], t: number) => Promise<UnityProcessOutcome> }).runUnity = async (_b, args) => {
      writeFileSync(args[args.indexOf('-testResults') + 1]!, GREEN_XML);
      writeFileSync(args[args.indexOf('-logFile') + 1]!, 'Compilation succeeded\n');
      return outcome;
    };
    return tool.execute({ projectPath: project }, { projectPath: project } as never);
  };

  it('a green results file followed by exit 1 is NOT a pass, and says so in prose and metadata', async () => {
    const r = await run({ exitCode: 1, timedOut: false, completed: true });
    expect(r.isError).toBe(true);
    expect(r.content).not.toMatch(/ran clean/);
    expect(r.content).toMatch(/FAILED: every test case passed, but the editor exited 1/);
    expect(r.metadata).toMatchObject({ exitCode: 1, timedOut: false, completed: true });
  });

  it('a green results file from an editor killed at its allowance is NOT a pass', async () => {
    const r = await run({ exitCode: -1, timedOut: true, completed: false });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/killed at its allowance/);
    expect(r.metadata).toMatchObject({ exitCode: -1, timedOut: true, completed: false });
  });

  it('exit 0 with a green file is the pass it says it is (guard)', async () => {
    const r = await run({ exitCode: 0, timedOut: false, completed: true });
    expect(r.isError).toBe(false);
    expect(r.content).toMatch(/1 of 1 tests ran clean/);
    expect(r.metadata).toMatchObject({ exitCode: 0 });
  });
});
