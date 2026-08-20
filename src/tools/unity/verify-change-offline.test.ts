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

describe('what the offline verdict says at its root', () => {
  // The bridged path reports status and counts at the root; this one reported
  // {mode, compile} and nothing else, so a reader looking for the reason had
  // to descend into the console entries — and found a log line, not a reason.
  it('names the failure and counts it', async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: false, compileIssueCount: 7 },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());
    const payload = JSON.parse(result.content) as Record<string, unknown>;

    expect(payload['status']).toBe('failed');
    expect(payload['reason']).toMatch(/7 compile entries/);
    expect((payload['summary'] as { compileIssues: number }).compileIssues).toBe(7);
    expect(result.isError).toBe(true);
  });

  it('separates "did not verify" from "verified and failed"', async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: false,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: null, compileIssueCount: 0 },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());
    const payload = JSON.parse(result.content) as Record<string, unknown>;

    expect(payload['status']).toBe('unknown');
    expect(payload['reason']).toMatch(/NOT verified/);
    expect(result.isError, 'unverified is not a failed verdict').toBe(false);
  });

  it('says passed when the compile actually succeeded', async () => {
    const result = await new VerifyChangeTool().execute({}, context());
    const payload = JSON.parse(result.content) as Record<string, unknown>;

    expect(payload['status']).toBe('passed');
    expect(result.isError).toBe(false);
  });
});

describe("issues counted but no failure flag", () => {
  // Measured live on 2026-08-20, from the tool's own output:
  //   {"status":"passed","mode":"offline","summary":{"compileIssues":78}}
  // isError was false. The verdict keyed on lastSucceeded alone, and a compile
  // that had counted seventy-eight problems reported success.
  it("counts issues as a failure even when the flag says otherwise", async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: true, compileIssueCount: 78 },
      diagnostics: { errorCount: 78, warningCount: 0 },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());
    const payload = JSON.parse(result.content) as Record<string, unknown>;

    expect(payload['status'], 'reported a pass with 78 issues').toBe('failed');
    expect(payload['reason']).toMatch(/78 error/);
    expect(result.isError).toBe(true);
  });

  it("treats an unset flag with issues as a failure too", async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: null, compileIssueCount: 3 },
      diagnostics: { errorCount: 3, warningCount: 0 },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());

    expect(JSON.parse(result.content)['status']).toBe('failed');
    expect(result.isError).toBe(true);
  });

  it("still passes a clean compile", async () => {
    const result = await new VerifyChangeTool().execute({}, context());

    expect(JSON.parse(result.content)['status']).toBe('passed');
    expect(result.isError).toBe(false);
  });
});

describe("warnings are not failures", () => {
  // Measured 2026-08-20: compileIssueCount is compile-related entries, errors
  // and warnings together. The delivered project builds with zero errors and
  // twenty-three warnings; a rule that failed on the issue total called a
  // clean build broken, and would have done so for every build with a warning.
  it("passes a build whose only issues are warnings", async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: true, compileIssueCount: 23 },
      diagnostics: { errorCount: 0, warningCount: 23 },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());
    const payload = JSON.parse(result.content) as Record<string, unknown>;

    expect(payload['status'], 'called a warning a failure').toBe('passed');
    expect(result.isError).toBe(false);
  });

  it("still reports how many entries there were", async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: true, compileIssueCount: 23 },
      diagnostics: { errorCount: 0, warningCount: 23 },
      capturedAt: 1,
    });

    const summary = (JSON.parse((await new VerifyChangeTool().execute({}, context())).content) as {
      summary: { compileErrors: number; compileIssues: number };
    }).summary;

    expect(summary.compileErrors).toBe(0);
    expect(summary.compileIssues).toBe(23);
  });

  it("fails on errors even when the run flag says it succeeded", async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: true, compileIssueCount: 90 },
      diagnostics: { errorCount: 12, warningCount: 78 },
      capturedAt: 1,
    });

    const result = await new VerifyChangeTool().execute({}, context());

    expect(JSON.parse(result.content)['status']).toBe('failed');
    expect(JSON.parse(result.content)['reason']).toMatch(/12 error/);
    expect(result.isError).toBe(true);
  });
});

describe("what a passing compile does not cover", () => {
  // Measured 2026-08-20: unity_verify_change reported zero compile errors
  // while unity_playmode_verify reported the project did not compile. Both
  // were true — of different assemblies. Test assemblies carry
  // UNITY_INCLUDE_TESTS and a plain batch compile does not build them, so an
  // agent reading "passed" can believe its tests are fine when they do not
  // build at all.
  it("says test assemblies are not part of the verdict", async () => {
    const result = await new VerifyChangeTool().execute({}, context());
    const payload = JSON.parse(result.content) as Record<string, string>;

    expect(payload['status']).toBe('passed');
    expect(payload['reason']).toMatch(/Test assemblies are NOT built/i);
    expect(payload['reason']).toMatch(/unity_playmode_verify/);
  });

  it("does not claim that on a failed compile", async () => {
    getStaticCompileStatus.mockResolvedValue({
      source: 'static_unity_batch',
      bridgeMethod: 'editor.compileStatus',
      verified: true,
      compile: { isCompiling: false, isReloading: false, lastSucceeded: false, compileIssueCount: 5 },
      diagnostics: { errorCount: 5, warningCount: 0 },
      capturedAt: 1,
    });

    const payload = JSON.parse((await new VerifyChangeTool().execute({}, context())).content) as Record<string, string>;

    expect(payload['reason']).toMatch(/compile failed/i);
    expect(payload['reason']).not.toMatch(/Test assemblies/i);
  });
});
