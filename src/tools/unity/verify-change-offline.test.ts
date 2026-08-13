/**
 * With the editor closed, `unity_verify_change` must still try for a real
 * compile — not merely ask nicely and settle for "unknown".
 *
 * Headless compilation is expensive and side-effecting (tens of seconds, a
 * possible licence round-trip, and an in-place project upgrade when the
 * installed editor is newer), so every other caller leaves it off. This one
 * exists to answer "did my change compile", which is unanswerable without it:
 * measured, a Pixel Flow run ended by telling the user it could not satisfy its
 * own verification gate and asking whether to proceed unverified.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getStaticCompileStatus = vi.hoisted(() => vi.fn());
vi.mock('./local-diagnostics.js', () => ({
  getStaticCompileStatus,
  getStaticConsoleSnapshot: vi.fn(),
}));

const { VerifyChangeTool } = await import('./diagnostics-tools.js');
import type { ToolContext } from '../../types/tool.js';

beforeEach(() => {
  getStaticCompileStatus.mockReset();
  getStaticCompileStatus.mockResolvedValue({
    source: 'static_unity_batch',
    bridgeMethod: 'editor.compileStatus',
    verified: true,
    compile: {
      isCompiling: false,
      isReloading: false,
      lastStartedAt: null,
      lastFinishedAt: 1,
      lastSucceeded: true,
      compileIssueCount: 0,
      assemblyReloadCount: 0,
    },
    capturedAt: 1,
  });
});

function context(): ToolContext {
  return {
    projectPath: '/project',
    workingDirectory: '/project',
    readOnly: false,
    unityBridgeConnected: false,
  } as ToolContext;
}

describe('unity_verify_change without a bridge', () => {
  it('opts into a headless compile rather than reporting unknown', async () => {
    const tool = new VerifyChangeTool();

    await tool.execute({}, context());

    expect(getStaticCompileStatus).toHaveBeenCalledTimes(1);
    const options = getStaticCompileStatus.mock.calls[0]![0] as Record<string, unknown>;
    expect(
      options['allowHeadlessCompile'],
      'verification asked for a status poll, which never launches Unity',
    ).toBe(true);
    expect(options['projectPath']).toBe('/project');
  });

  it('reports a failed compile as an error', async () => {
    // The verdict has to reach the agent as failure, or it will move on.
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: {
        isCompiling: false,
        isReloading: false,
        lastStartedAt: null,
        lastFinishedAt: 1,
        lastSucceeded: false,
        compileIssueCount: 3,
        assemblyReloadCount: 0,
      },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());

    expect(result.isError).toBe(true);
  });

  it('does not claim failure when the result is merely unknown', async () => {
    // "Could not verify" is not "does not compile"; reporting it as an error
    // would send the agent chasing a defect that may not exist.
    getStaticCompileStatus.mockResolvedValue({
      source: 'unavailable',
      bridgeMethod: 'editor.compileStatus',
      verified: false,
      message: 'Compile status is UNKNOWN',
      compile: {
        isCompiling: false,
        isReloading: false,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSucceeded: null,
        compileIssueCount: null,
        assemblyReloadCount: 0,
      },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('UNKNOWN');
  });
});
