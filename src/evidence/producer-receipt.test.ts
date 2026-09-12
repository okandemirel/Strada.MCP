import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactDigest, evidenceRunId, renderReceipt, EVIDENCE_FENCE } from './producer-receipt.js';

describe('producer receipts', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'receipt-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('states the run, the kind and how the process ended — and nothing it did not measure', () => {
    const fenced = renderReceipt({
      runId: 'run-1',
      kind: 'player-build',
      medium: 'builder',
      projectPath: dir,
      target: 'Android',
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    expect(fenced).toContain(`\`\`\`${EVIDENCE_FENCE}`);
    const json = JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(fenced)![1]!) as Record<string, unknown>;
    expect(json).toMatchObject({
      schemaVersion: 1,
      runId: 'run-1',
      kind: 'player-build',
      medium: 'builder',
      target: 'Android',
      execution: { completed: true, exitCode: 0, timedOut: false },
    });
    // No git here: the revision is absent rather than invented.
    expect(json['revision']).toBeUndefined();
    expect(json['artifactSha256']).toBeUndefined();
  });

  it('tells two artifacts of the SAME SIZE apart (Codex 2026-09-13 AH#8)', () => {
    // The digest hashed paths and sizes, so two different 26 648-byte files
    // were the same artifact as far as a ticket was concerned.
    const make = (name: string, fill: number): string => {
      const app = join(dir, name, 'Contents', 'MacOS');
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, 'Game'), Buffer.alloc(26_648, fill));
      return join(dir, name);
    };
    expect(artifactDigest(make('A.app', 1))).not.toBe(artifactDigest(make('B.app', 2)));
  });

  it('digests a bundle DIRECTORY as one artifact, and says nothing about one that is not there', () => {
    const app = join(dir, 'Game.app');
    mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), Buffer.alloc(1024, 7));
    const first = artifactDigest(app);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(artifactDigest(app)).toBe(first);
    // A changed artifact is a different artifact.
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), Buffer.alloc(2048, 7));
    expect(artifactDigest(app)).not.toBe(first);
    expect(artifactDigest(join(dir, 'Nothing.app'))).toBeUndefined();
    expect(artifactDigest(undefined)).toBeUndefined();
  });

  it('takes a run id only when the caller gave one', () => {
    expect(evidenceRunId({ evidenceRunId: ' run-7 ' })).toBe('run-7');
    expect(evidenceRunId({ evidenceRunId: '' })).toBeUndefined();
    expect(evidenceRunId({ evidenceRunId: 42 })).toBeUndefined();
    expect(evidenceRunId({})).toBeUndefined();
  });
});
