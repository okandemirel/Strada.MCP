import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileReadTool } from './file-read.js';

/**
 * A file the user named must be readable through this tool too.
 *
 * Measured: a run reached for the design document through batch_execute — which
 * routes to THIS file_read, not the host's — and was refused "Path resolves
 * outside the project directory" for a file the user had named in the request
 * that started the run. The authorisation existed and stopped at the boundary.
 */

const tool = new FileReadTool();

function setup(): { project: string; outside: string; sibling: string } {
  const project = mkdtempSync(join(tmpdir(), 'mcp-authz-proj-'));
  mkdirSync(join(project, 'Assets'), { recursive: true });
  writeFileSync(join(project, 'Assets', 'Inside.cs'), '// inside');

  const elsewhere = mkdtempSync(join(tmpdir(), 'mcp-authz-out-'));
  const outside = join(elsewhere, 'gdd.md');
  const sibling = join(elsewhere, 'secrets.txt');
  writeFileSync(outside, 'PIXEL FLOW\nAn 8x8 board.');
  writeFileSync(sibling, 'do not read me');
  return { project, outside, sibling };
}

const ctx = (project: string, authorized?: string[]) =>
  ({ projectPath: project, workingDirectory: project, readOnly: false,
     unityBridgeConnected: false, userAuthorizedPaths: authorized }) as never;

describe('reading a file the user named', () => {
  it('reads it even though it is outside the project', async () => {
    const { project, outside } = setup();

    const r = await tool.execute({ path: outside }, ctx(project, [outside]));

    expect(r.isError).toBeUndefined();
    expect(r.content).toContain('PIXEL FLOW');
  });

  it('refuses it when the user named nothing', async () => {
    const { project, outside } = setup();

    expect((await tool.execute({ path: outside }, ctx(project))).isError).toBe(true);
  });

  it('does not extend the permission to a sibling', async () => {
    const { project, outside, sibling } = setup();

    expect((await tool.execute({ path: sibling }, ctx(project, [outside]))).isError).toBe(true);
  });

  it('does not turn a named folder into permission for everything inside it', async () => {
    // The case where exact matching and prefix matching actually differ. With a
    // prefix rule, naming a directory would authorise every file beneath it —
    // and the sibling test above cannot show that, because two file names are
    // never prefixes of each other.
    const { project, outside, sibling } = setup();
    const folder = join(outside, '..');

    const r = await tool.execute({ path: sibling }, ctx(project, [folder]));

    expect(r.isError).toBe(true);
  });

  it('leaves an ordinary in-project read alone', async () => {
    const { project, outside } = setup();

    const r = await tool.execute({ path: 'Assets/Inside.cs' }, ctx(project, [outside]));

    expect(r.isError).toBeUndefined();
    expect(r.content).toContain('// inside');
  });
});
