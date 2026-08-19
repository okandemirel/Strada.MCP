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

  it("is offered to the agent even with no bridge connected", async () => {
    // The host hides tools whose metadata claims they need a bridge. While
    // unity_verify_change claimed that, the offline path added above could never
    // be reached: measured across four live runs with the editor closed, the
    // agent called unity_compile_status twelve times and unity_verify_change
    // zero times — it was not in the tool list at all.
    const tool = new VerifyChangeTool();
    expect(tool.metadata.requiresBridge).toBe(false);
  });

  it("leaves bridge-only siblings requiring a bridge", async () => {
    // The flag is per-tool, not a blanket relaxation: a tool with no offline
    // path must still be hidden rather than offered and then failing.
    const { CompileWaitTool } = await import("./diagnostics-tools.js");
    expect(new CompileWaitTool().metadata.requiresBridge).toBe(true);
  });
});

describe('a compile that outlasts the wait', () => {
  // Measured on the Pixel Flow run of 2026-08-19: nine module assemblies, and
  // recompiles landed 50-90s apart while the wait allowed 30s. Every verify
  // returned status:timeout on a project whose runtime assemblies all built,
  // and the agent read the timeout as "the change is broken".
  function bridgeStillCompiling() {
    return {
      request: vi.fn(async (method: string) => {
        if (method === 'editor.recompile') return {};
        if (method === 'editor.compileStatus') {
          return { isCompiling: true, isReloading: false, compileIssueCount: 0 };
        }
        return {};
      }),
    };
  }

  function connected(): ToolContext {
    return { ...context(), unityBridgeConnected: true } as ToolContext;
  }

  it('allows a real domain reload before giving up', () => {
    // The default has to outlast the thing it waits for.
    const parsed = (new VerifyChangeTool() as unknown as {
      schema: { parse(v: unknown): { compileTimeoutMs: number } };
    }).schema.parse({});

    expect(parsed.compileTimeoutMs).toBeGreaterThanOrEqual(120_000);
  });

  it('says the change was not verified, rather than that it failed', async () => {
    const tool = new VerifyChangeTool();
    tool.setBridgeClient(bridgeStillCompiling() as never);

    const result = await tool.execute({ compileTimeoutMs: 1000, pollIntervalMs: 50 }, connected());
    const payload = JSON.parse(result.content) as Record<string, string>;

    expect(payload['status']).toBe('timeout');
    expect(payload['reason']).toMatch(/still compiling/i);
    expect(payload['reason']).toMatch(/NOT verified/);
    expect(payload['nextStep']).toMatch(/recompile:false/);
  });

  it('does not tell the agent to rewrite code it never checked', async () => {
    const tool = new VerifyChangeTool();
    tool.setBridgeClient(bridgeStillCompiling() as never);

    const result = await tool.execute({ compileTimeoutMs: 1000, pollIntervalMs: 50 }, connected());
    const payload = JSON.parse(result.content) as Record<string, string>;

    expect(payload['nextStep']).toMatch(/Do not rewrite/i);
  });
});
