import { z } from 'zod';
import { resolve as resolvePath } from 'node:path';
import { realpathSync } from 'node:fs';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import { BridgeTool } from './bridge-tool.js';
import { getStaticCompileStatus } from './local-diagnostics.js';

/** Canonical form for project-path identity (macOS /var vs /private/var). */
function canonicalProjectPath(p: string): string {
  try {
    return realpathSync(resolvePath(p));
  } catch {
    return resolvePath(p);
  }
}

/**
 * Does the connected Editor verify THIS tree? The bridge Editor has the
 * configured project (UNITY_PROJECT_PATH) open. A task running in a lease
 * worktree asks about a DIFFERENT tree, and the Editor's compile verdict says
 * nothing about that tree's code — answering from the bridge was a green
 * verdict for code the agent did not write. Unknown env ⇒ assume yes.
 */
function bridgeTargetsTree(contextProjectPath: string): boolean {
  const envProject = process.env['UNITY_PROJECT_PATH'];
  if (!envProject || !contextProjectPath) return true;
  return canonicalProjectPath(envProject) === canonicalProjectPath(contextProjectPath);
}

/**
 * Serialize bridge compile/test rounds. One Editor, one GLOBAL compile state:
 * two concurrent verify calls both trigger `editor.recompile` and both poll
 * the same status — each can read the other's compile as its own verdict.
 */
let bridgeVerifyChain: Promise<unknown> = Promise.resolve();
function withBridgeVerifyLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = bridgeVerifyChain.then(fn, fn);
  bridgeVerifyChain = next.catch(() => undefined);
  return next;
}

const compileStatusSchema = z.object({});
const compileWaitSchema = z.object({
  timeoutMs: z.number().int().min(1000).max(120000).optional().default(30000),
  pollIntervalMs: z.number().int().min(50).max(5000).optional().default(250),
});
const recompileSchema = z.object({
  reason: z.string().optional(),
});
const assemblyReloadStatusSchema = z.object({});
const testModeSchema = z.enum(['edit', 'play', 'all']);
const testFilterSchema = z.object({
  testNames: z.array(z.string()).optional(),
  groupNames: z.array(z.string()).optional(),
  assemblyNames: z.array(z.string()).optional(),
  categoryNames: z.array(z.string()).optional(),
});
const testListSchema = z.object({
  mode: testModeSchema.optional().default('edit'),
});
const testRunSchema = z.object({
  mode: testModeSchema.optional().default('edit'),
  filter: testFilterSchema.optional(),
  runSynchronously: z.boolean().optional().default(true),
});
const testResultsSchema = z.object({
  runId: z.string().optional(),
  includePassed: z.boolean().optional().default(true),
});
const testRerunFailedSchema = z.object({
  runId: z.string().optional(),
  mode: testModeSchema.optional().default('edit'),
  timeoutMs: z.number().int().min(1000).max(120000).optional().default(30000),
  pollIntervalMs: z.number().int().min(50).max(5000).optional().default(250),
});
const screenshotCaptureSchema = z.object({
  outputPath: z.string().min(1),
  source: z.enum(['scene', 'game', 'camera']).optional().default('scene'),
  cameraName: z.string().optional(),
  width: z.number().int().min(16).max(8192).optional(),
  height: z.number().int().min(16).max(8192).optional(),
  transparent: z.boolean().optional().default(false),
});
const screenshotCompareSchema = z.object({
  baselinePath: z.string().min(1),
  candidatePath: z.string().min(1),
  tolerancePercent: z.number().min(0).max(100).optional().default(0),
  pixelThreshold: z.number().int().min(0).max(255).optional().default(0),
});
const visualSnapshotSchema = screenshotCaptureSchema.extend({
  includeHierarchy: z.boolean().optional().default(true),
});
const projectToolListSchema = z.object({});
const projectToolInvokeSchema = z.object({
  name: z.string().min(1),
  input: z.object({}).passthrough().optional().default({}),
});
const verifyChangeSchema = z.object({
  recompile: z.boolean().optional().default(true),
  // A domain reload in a project with a couple of dozen assemblies routinely
  // runs past a minute. Measured on Pixel Flow: recompiles landed 50-90s
  // apart while this wait allowed 30s, so every verify timed out on a
  // project that compiled cleanly.
  compileTimeoutMs: z.number().int().min(1000).max(600000).optional().default(180000),
  pollIntervalMs: z.number().int().min(50).max(5000).optional().default(250),
  consoleLimit: z.number().int().min(1).max(500).optional().default(200),
  runTests: z.boolean().optional().default(false),
  testMode: testModeSchema.optional().default('edit'),
  screenshot: screenshotCaptureSchema.optional(),
  build: z.object({
    target: z.enum([
      'Android',
      'iOS',
      'WebGL',
      'StandaloneWindows64',
      'StandaloneOSX',
      'StandaloneLinux64',
    ]),
    outputPath: z.string().min(1),
    scenes: z.array(z.string()).optional(),
    development: z.boolean().optional().default(false),
    clean: z.boolean().optional().default(false),
    preflight: z.boolean().optional().default(true),
    options: z.array(z.string()).optional().default([]),
  }).optional(),
  includeProfiler: z.boolean().optional().default(false),
});

interface CompileStatusResult {
  isCompiling?: boolean;
  isReloading?: boolean;
  lastStartedAt?: number | null;
  lastFinishedAt?: number | null;
  lastSucceeded?: boolean | null;
  compileIssueCount?: number;
  assemblyReloadCount?: number;
}

interface TestResultsPayload {
  runId?: string | null;
  status?: string;
  tests?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  failedTests?: Array<Record<string, unknown>>;
}

abstract class SimpleJsonBridgeTool extends BridgeTool {
  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return JSON.stringify(result, null, 2);
  }
}

abstract class CompositeBridgeTool implements ITool {
  abstract readonly name: string;
  abstract readonly description: string;
  protected abstract readonly schema: z.ZodObject<z.ZodRawShape>;
  protected abstract readonly readOnlyTool: boolean;
  protected readonly toolCategory = 'unity-runtime' as const;
  protected readonly dangerousTool = false;
  protected readonly requiredBridgeMethods: readonly string[] = [];
  protected readonly requiredBridgeCapabilities: readonly string[] = [];
  /**
   * Whether the tool is useless without a live editor bridge.
   *
   * The host hides tools whose metadata says they need a bridge when none is
   * connected, so this decides whether the agent is even offered the tool — not
   * merely how it behaves. A tool with a real offline path must say false, or
   * that path can never be reached.
   */
  protected readonly bridgeRequired: boolean = true;
  /** Set by tools that can legitimately run past a host's default cap. */
  protected readonly toolTimeoutMs: number | undefined = undefined;

  private bridgeClient: BridgeClient | null = null;
  private _inputSchema: Record<string, unknown> | null = null;

  get inputSchema(): Record<string, unknown> {
    if (!this._inputSchema) {
      this._inputSchema = zodToJsonSchema(this.schema);
    }
    return this._inputSchema;
  }

  get metadata(): ToolMetadata {
    return {
      category: this.toolCategory,
      requiresBridge: this.bridgeRequired,
      dangerous: this.dangerousTool,
      readOnly: this.readOnlyTool,
      requiredBridgeMethods: [...this.requiredBridgeMethods],
      requiredBridgeCapabilities: [...this.requiredBridgeCapabilities],
      ...(this.toolTimeoutMs === undefined ? {} : { timeoutMs: this.toolTimeoutMs }),
    };
  }

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  protected get client(): BridgeClient | null {
    return this.bridgeClient;
  }

  protected async ensureWritable(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult | null> {
    if (!this.readOnlyTool && !this.isReadAction(input) && context.readOnly) {
      return {
        content: `Error: Cannot execute ${this.name} in read-only mode.`,
        isError: true,
      };
    }
    return null;
  }

  protected async ensureBridge(context: ToolContext): Promise<ToolResult | null> {
    if (!context.unityBridgeConnected || !this.bridgeClient) {
      return {
        content: `Error: Unity bridge is not connected. Cannot execute ${this.name}.`,
        isError: true,
      };
    }
    return null;
  }

  protected isReadAction(_input: Record<string, unknown>): boolean {
    return false;
  }

  abstract execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export class CompileStatusTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_compile_status';
  readonly description = 'Read Unity compilation status, last compile timing, and recent compile issues';
  protected readonly rpcMethod = 'editor.compileStatus';
  protected readonly schema = compileStatusSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly requiredBridgeCapabilities = ['editor.compile-status'];

  override get metadata(): ToolMetadata {
    return {
      ...super.metadata,
      requiresBridge: false,
    };
  }

  override async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();
    const parsed = this.schema.parse(input);

    try {
      if (!context.unityBridgeConnected || !this.client) {
        throw new Error('Unity bridge is not connected.');
      }

      const result = await this.client.request(this.rpcMethod, this.buildRequest(parsed));
      return {
        content: JSON.stringify({
          source: 'live_bridge',
          bridgeMethod: this.rpcMethod,
          compile: result,
        }, null, 2),
        metadata: { executionTimeMs: Math.round(performance.now() - start) },
      };
    } catch (error) {
      const fallback = await getStaticCompileStatus({
        projectPath: context.projectPath,
        bridgeError: error instanceof Error ? error.message : String(error),
      });
      return {
        content: JSON.stringify(fallback, null, 2),
        isError: false,
        metadata: { executionTimeMs: Math.round(performance.now() - start) },
      };
    }
  }
}

export class CompileWaitTool extends CompositeBridgeTool {
  readonly name = 'unity_compile_wait';
  readonly description = 'Poll Unity compilation until scripts finish compiling or a timeout is reached';
  protected readonly schema = compileWaitSchema;
  protected readonly readOnlyTool = true;
  protected override readonly requiredBridgeMethods = ['editor.compileStatus'];
  protected override readonly requiredBridgeCapabilities = ['editor.compile-status'];

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const noBridge = await this.ensureBridge(context);
    if (noBridge) return noBridge;

    const parsed = this.schema.parse(input);
    const deadline = Date.now() + parsed.timeoutMs;
    let lastStatus: CompileStatusResult = {};

    while (Date.now() <= deadline) {
      lastStatus = await this.client!.request<CompileStatusResult>('editor.compileStatus', {});
      if (!lastStatus.isCompiling && !lastStatus.isReloading) {
        return {
          content: JSON.stringify({
            status: 'completed',
            compile: lastStatus,
          }, null, 2),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, parsed.pollIntervalMs));
    }

    return {
      content: JSON.stringify({
        status: 'timeout',
        compile: lastStatus,
      }, null, 2),
      isError: true,
    };
  }
}

export class RecompileTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_recompile';
  readonly description = 'Request a Unity script recompilation and asset refresh';
  protected readonly rpcMethod = 'editor.recompile';
  protected readonly schema = recompileSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
}

export class AssemblyReloadStatusTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_assembly_reload_status';
  readonly description = 'Read recent Unity assembly reload status and counters';
  protected readonly rpcMethod = 'editor.assemblyReloadStatus';
  protected readonly schema = assemblyReloadStatusSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class TestListTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_test_list';
  readonly description = 'List available Unity EditMode and PlayMode tests';
  protected readonly rpcMethod = 'editor.testList';
  protected readonly schema = testListSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly requiredBridgeCapabilities = ['unity-test-framework'];
}

export class TestRunTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_test_run';
  readonly description = 'Run Unity EditMode or PlayMode tests and return the created run ID';
  protected readonly rpcMethod = 'editor.testRun';
  protected readonly schema = testRunSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly requiredBridgeCapabilities = ['unity-test-framework'];
}

export class TestResultsTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_test_results';
  readonly description = 'Read the latest Unity test run status, summary, and failing tests';
  protected readonly rpcMethod = 'editor.testResults';
  protected readonly schema = testResultsSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly requiredBridgeCapabilities = ['unity-test-framework'];
}

export class TestRerunFailedTool extends CompositeBridgeTool {
  readonly name = 'unity_test_rerun_failed';
  readonly description = 'Rerun only the failed tests from the latest Unity test run';
  protected readonly schema = testRerunFailedSchema;
  protected readonly readOnlyTool = false;
  protected override readonly requiredBridgeMethods = ['editor.testResults', 'editor.testRun'];
  protected override readonly requiredBridgeCapabilities = ['unity-test-framework'];

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const noBridge = await this.ensureBridge(context);
    if (noBridge) return noBridge;
    const noWrite = await this.ensureWritable(input, context);
    if (noWrite) return noWrite;

    const parsed = this.schema.parse(input);
    const latest = await this.client!.request<TestResultsPayload>('editor.testResults', {
      runId: parsed.runId,
      includePassed: false,
    });
    const failedTests = latest.failedTests ?? [];
    const testNames = failedTests
      .map((test) => String(test.fullName ?? test.name ?? '').trim())
      .filter(Boolean);

    if (testNames.length === 0) {
      return {
        content: JSON.stringify({
          status: 'noop',
          detail: 'No failed tests were found to rerun.',
          previousRunId: latest.runId ?? null,
        }, null, 2),
      };
    }

    const run = await this.client!.request<Record<string, unknown>>('editor.testRun', {
      mode: parsed.mode,
      filter: { testNames },
      runSynchronously: true,
    });
    const runId = String(run.runId ?? '');
    const deadline = Date.now() + parsed.timeoutMs;
    let current = run as TestResultsPayload;

    while (Date.now() <= deadline) {
      current = await this.client!.request<TestResultsPayload>('editor.testResults', {
        runId,
        includePassed: false,
      });
      if (String(current.status ?? '').toLowerCase() !== 'running') {
        return { content: JSON.stringify(current, null, 2) };
      }
      await new Promise((resolve) => setTimeout(resolve, parsed.pollIntervalMs));
    }

    return {
      content: JSON.stringify({
        status: 'timeout',
        runId,
        lastKnown: current,
      }, null, 2),
      isError: true,
    };
  }
}

export class ScreenshotCaptureTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_screenshot_capture';
  readonly description = 'Capture a scene, game, or camera screenshot from the Unity editor';
  protected readonly rpcMethod = 'editor.screenshotCapture';
  protected readonly schema = screenshotCaptureSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class ScreenshotCompareTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_screenshot_compare';
  readonly description = 'Compare two screenshot files and report pixel differences';
  protected readonly rpcMethod = 'editor.screenshotCompare';
  protected readonly schema = screenshotCompareSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class VisualSnapshotTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_visual_snapshot';
  readonly description = 'Capture a screenshot plus scene and hierarchy context for visual verification';
  protected readonly rpcMethod = 'editor.visualSnapshot';
  protected readonly schema = visualSnapshotSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class ProjectToolListTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_project_tool_list';
  readonly description = 'List project-local MCP tools, prompts, and resources discovered from Unity editor assemblies';
  protected readonly rpcMethod = 'editor.projectToolManifest';
  protected readonly schema = projectToolListSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly requiredBridgeCapabilities = ['unity-project-extensions'];
}

export class ProjectToolInvokeTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_project_tool_invoke';
  readonly description = 'Invoke a project-local custom MCP tool discovered from Unity editor assemblies';
  protected readonly rpcMethod = 'editor.projectToolInvoke';
  protected readonly schema = projectToolInvokeSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;
  protected override readonly requiredBridgeCapabilities = ['unity-project-extensions'];
}

export class VerifyChangeTool extends CompositeBridgeTool {
  // Offered with the editor closed, because it works with the editor closed: it
  // falls back to a headless Unity compile. Measured before this line existed —
  // the host hid the tool whenever the bridge was down, so across four live runs
  // the agent never called it once and shipped 45 files of unverified C#. The
  // offline path was unreachable, not unused.
  protected override readonly bridgeRequired = false;
  // A headless Unity compile takes tens of seconds to minutes, plus a possible
  // licence round-trip. The cap must cover the WORST inner sequence — solution
  // sync (300s) + dotnet build (120s) + unity batch compile (300s) — with
  // headroom, so the inner timeouts (which produce diagnostics and reap their
  // own child processes) always fire before the host adapter's opaque kill.
  // At 360s the adapter killed the wrapper while the Unity child kept running
  // and held Temp/UnityLockfile against every later verification.
  protected override readonly toolTimeoutMs = 800_000;
  readonly name = 'unity_verify_change';
  readonly description =
    'Run a closed verification loop across compile status, console analysis, tests, optional screenshot capture, optional build, and optional Strada profiling';
  protected readonly schema = verifyChangeSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly requiredBridgeMethods = [
    'editor.recompile',
    'editor.compileStatus',
    'editor.getConsoleLogs',
  ];
  protected override readonly requiredBridgeCapabilities = [
    'editor.compile-status',
    'editor.console-logs',
  ];

  protected override isReadAction(_input: Record<string, unknown>): boolean {
    return true;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const noBridge = await this.ensureBridge(context);
    // Wrong-tree guard: the connected Editor has the CONFIGURED project open;
    // a lease-worktree task must be answered by a headless compile of ITS OWN
    // tree, never by the Editor's verdict about a different one.
    const bridgeIsWrongTree = !noBridge && !bridgeTargetsTree(context.projectPath);
    if (noBridge || bridgeIsWrongTree) {
      // "Verify my change" used to give up here, which left an agent with no way
      // to check its own work whenever the editor was closed — measured, a run
      // ended by asking a human whether to proceed unverified. Compiling
      // headlessly is slow and can upgrade the project, so it is opted out
      // everywhere else; this is the one caller whose entire purpose is to get a
      // real answer, so it opts in.
      const offline = await getStaticCompileStatus({
        projectPath: context.projectPath,
        bridgeError: bridgeIsWrongTree
          ? 'Unity bridge is connected to a DIFFERENT project than this workspace — its verdict would not be about this tree; compiled headlessly instead'
          : 'Unity bridge not connected',
        allowHeadlessCompile: true,
      });
      // Same shape as the bridged verdict: the outcome at the root, evidence
      // underneath. Reported as a bare {mode, compile} document it had no
      // root-level reason at all, so a reader looking for one descended into
      // the console entries and surfaced whichever log line came first —
      // measured, "Mono: successfully reloaded assembly" for a failed compile.
      const issues = Number(offline.compile.compileIssueCount ?? 0);
      // compileIssueCount is compile-related entries — errors AND warnings.
      // Errors decide the verdict; warnings are reported and do not fail a
      // build. Measured 2026-08-20: the delivered project compiles with zero
      // errors and twenty-three warnings, and counting issues would have
      // called it broken forever.
      const errorCount = Number(
        (offline.diagnostics as { errorCount?: unknown } | undefined)?.errorCount ?? Number.NaN,
      );
      // Two independent failure signals, EITHER fails the verdict:
      //   - a positive error count, and
      //   - the run's own success flag being false. A compile SIGKILLed at the
      //     batch timeout produces errorCount=0 with lastSucceeded=false, and
      //     the old errorCount-first logic read that as "passed" — a killed
      //     compile reported as green.
      const failed =
        (Number.isFinite(errorCount) && errorCount > 0) ||
        offline.compile.lastSucceeded === false;
      // A caller that asked for tests did not ask whether the code compiles.
      // runTests is honoured only on the bridge path; offline it is silently
      // dropped, and the answer came back "passed". Measured 2026-08-21, 15:47:
      // an agent passed runTests:true, testMode:"play", read "passed", and then
      // spent twelve minutes trying to launch Unity by hand.
      const testsRequestedButImpossible = input['runTests'] === true && !failed;
      return {
        content: JSON.stringify({
          status: failed
            ? 'failed'
            : testsRequestedButImpossible
              ? 'tests-not-run'
              : offline.verified ? 'passed' : 'unknown',
          mode: 'offline',
          ...(testsRequestedButImpossible
            ? {
                runTestsIgnored:
                  'You asked this check to run tests. It cannot: there is no editor bridge, and a ' +
                  'headless compile does not build test assemblies. The compile result below is ' +
                  'real and says nothing about your tests. Run unity_playmode_verify.',
              }
            : {}),
          reason: failed
            // NAME WHICH SIGNAL FAILED IT. Measured live 2026-09-04 17:29: a
            // campaign sprint read "Headless compile failed with 0 error(s)."
            // — a verdict that contradicts its own measurement, and gives the
            // reader nothing to fix. The verdict was RIGHT (the run did not
            // succeed) but the count is meaningless in that case: the compile
            // was killed or never finished, so it produced no errors to count.
            // A failure on a real error count still names the count.
            ? (Number.isFinite(errorCount) && errorCount > 0
                ? `Headless compile failed with ${errorCount} error(s)`
                : 'Headless compile did not complete — it was killed or never finished, so there is ' +
                  'no error count to read. This is NOT a clean compile and NOT a code error you can ' +
                  'fix from this message: re-run the check, and if it keeps ending this way the ' +
                  'compile is timing out') +
              `${issues > 0 ? ` (${issues} compile entries including warnings)` : ''}.`
            : offline.verified
              // A pass here covers the runtime assemblies only. Test assemblies
              // carry UNITY_INCLUDE_TESTS and are not built by a plain batch
              // compile, so "zero errors" and "the tests can run" are different
              // claims. Measured 2026-08-20: this reported zero errors while
              // unity_playmode_verify reported the project did not compile —
              // both true, about different assemblies.
              ? 'Runtime assemblies compile. Test assemblies are NOT built by this check — run unity_playmode_verify to compile and run them.'
              : 'Headless compile did not produce a verdict. The change was NOT verified.',
          summary: { compileErrors: Number.isFinite(errorCount) ? errorCount : null, compileIssues: issues },
          compile: offline,
        }, null, 2),
        isError: failed || testsRequestedButImpossible,
      };
    }

    const parsed = this.schema.parse(input);
    // One Editor, one global compile state: the whole bridge round is
    // serialized so a concurrent verify cannot read this one's compile.
    return withBridgeVerifyLock(async (): Promise<ToolResult> => {
    const evidence: Record<string, unknown> = {};

    if (parsed.recompile) {
      evidence.recompile = await this.client!.request('editor.recompile', { reason: 'unity_verify_change' });
    }

    evidence.compile = await waitForCompile(
      this.client!,
      parsed.compileTimeoutMs,
      parsed.pollIntervalMs,
      parsed.recompile === true,
    );
    const wait = evidence.compile as { status?: string; compile?: CompileStatusResult };
    if (wait.status === 'timeout') {
      // Unity still working when the clock runs out is not a verdict on the
      // change: nothing about it is known to be wrong. Reported as a plain
      // failure it reads as "your code is broken", and the agent rewrites
      // working code and recompiles — which starts this same clock over.
      const busy = wait.compile?.isCompiling === true || wait.compile?.isReloading === true;
      return {
        content: JSON.stringify({
          status: 'timeout',
          reason: busy
            ? `Unity was still ${wait.compile?.isCompiling ? 'compiling' : 'reloading assemblies'} after ${parsed.compileTimeoutMs}ms. The change was NOT verified, and nothing is known to be wrong with it.`
            : `Compile status did not settle within ${parsed.compileTimeoutMs}ms. The change was NOT verified.`,
          nextStep:
            'Call unity_verify_change again with recompile:false to read the compile already in flight. Do not rewrite the code on the strength of this timeout.',
          compile: wait.compile ?? {},
        }, null, 2),
        isError: true,
      };
    }

    evidence.console = await this.client!.request('editor.getConsoleLogs', {
      limit: parsed.consoleLimit,
      includeStackTrace: true,
    });

    if (parsed.runTests) {
      const run = await this.client!.request<Record<string, unknown>>('editor.testRun', {
        mode: parsed.testMode,
        runSynchronously: true,
      });
      const runId = String(run.runId ?? '');
      evidence.tests = await waitForTestRun(this.client!, runId, parsed.compileTimeoutMs, parsed.pollIntervalMs);
    }

    if (parsed.screenshot) {
      evidence.screenshot = await this.client!.request('editor.visualSnapshot', parsed.screenshot);
    }

    if (parsed.build) {
      evidence.build = await this.client!.request('project.buildPlayer', parsed.build);
    }

    if (parsed.includeProfiler) {
      try {
        evidence.systemProfile = await this.client!.request('strada.systemProfile', {});
      } catch (error) {
        evidence.systemProfile = {
          status: 'unavailable',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const compile = evidence.compile as { compile?: CompileStatusResult } | undefined;
    const tests = evidence.tests as TestResultsPayload | undefined;
    const build = evidence.build as { success?: boolean } | undefined;
    const testFailures = Number(tests?.summary?.failed ?? 0);
    // Zero tests is not a pass — a test run whose total is 0 (assembly did not
    // compile, filter matched nothing) proved nothing. Same rule the headless
    // playmode path has always enforced.
    const testTotal = Number(tests?.summary?.total ?? Number.NaN);
    const emptyTestRun =
      parsed.runTests === true && (!Number.isFinite(testTotal) || testTotal === 0);
    const compileIssues = Number(compile?.compile?.compileIssueCount ?? 0);

    return {
      content: JSON.stringify({
        status:
          compileIssues === 0 && testFailures === 0 && !emptyTestRun && (build?.success ?? true)
            ? 'passed'
            : 'failed',
        ...(emptyTestRun
          ? {
              reason:
                'The test run reported ZERO tests — nothing executed, so nothing was verified. ' +
                'A test assembly that fails to compile is silently left out by Unity.',
            }
          : {}),
        summary: {
          compileIssues,
          testFailures,
          testTotal: Number.isFinite(testTotal) ? testTotal : null,
          buildSuccess: build?.success ?? null,
        },
        evidence,
      }, null, 2),
      isError: compileIssues > 0 || testFailures > 0 || emptyTestRun || build?.success === false,
    };
    });
  }
}

async function waitForTestRun(
  client: BridgeClient,
  runId: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<TestResultsPayload> {
  const deadline = Date.now() + timeoutMs;
  let current: TestResultsPayload = {
    runId,
    status: 'running',
  };

  while (Date.now() <= deadline) {
    current = await client.request<TestResultsPayload>('editor.testResults', {
      runId,
      includePassed: true,
    });
    if (String(current.status ?? '').toLowerCase() !== 'running') {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    runId,
    status: 'timeout',
    summary: { failed: 1 },
  };
}

async function waitForCompile(
  client: BridgeClient,
  timeoutMs: number,
  pollIntervalMs: number,
  expectFreshCompile = false,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  // After a recompile REQUEST, the first polls can land before Unity has
  // started compiling: "idle" then means "not started yet", and returning it
  // as completed handed back the PREVIOUS compile's verdict as this change's.
  // Hold a short grace window in which idle keeps polling; a compile observed
  // in flight ends the grace immediately.
  const freshGraceUntil = expectFreshCompile ? Date.now() + 3_000 : 0;
  let sawCompiling = false;
  let lastStatus: CompileStatusResult = {};

  while (Date.now() <= deadline) {
    lastStatus = await client.request<CompileStatusResult>('editor.compileStatus', {});
    if (lastStatus.isCompiling || lastStatus.isReloading) {
      sawCompiling = true;
    } else if (sawCompiling || Date.now() >= freshGraceUntil) {
      return {
        status: 'completed',
        compile: lastStatus,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    status: 'timeout',
    compile: lastStatus,
  };
}
