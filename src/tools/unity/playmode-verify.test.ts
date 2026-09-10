
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
