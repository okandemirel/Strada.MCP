import { describe, expect, it } from 'vitest';

import { PlaymodeVerifyTool } from './playmode-verify.js';

// Paths that cannot exist on any machine: the tool must fail to find an editor
// and return early, or the test spawns a real Unity and times out.
const LEASE = '/nonexistent-strada/lease/task-85db6668';
const ELSEWHERE = '/nonexistent-strada/elsewhere/PixelFlow-Agent';

function context(projectPath: string) {
  return { projectPath, workingDirectory: projectPath, readOnly: false } as never;
}

describe('a Unity verdict names the tree it describes', () => {
  it('appends the mismatch note to what playmode verification reports', async () => {
    // No Unity editor is installed for this made-up path, so the tool takes its
    // earliest exit — which is exactly the point: the note has to survive every
    // return, not just the happy one.
    const result = await new PlaymodeVerifyTool().execute({ projectPath: ELSEWHERE }, context(LEASE));

    expect(result.content).toContain(ELSEWHERE);
    expect(result.content).toContain(LEASE);
    expect(result.content).toContain('omit projectPath');
  });

  it('says nothing extra when the caller asked about its own tree', async () => {
    const result = await new PlaymodeVerifyTool().execute({ projectPath: LEASE }, context(LEASE));

    expect(result.content).not.toContain('omit projectPath');
  });
});
