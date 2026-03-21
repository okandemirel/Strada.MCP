import { z } from 'zod';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import { BridgeTool } from './bridge-tool.js';

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
  compileTimeoutMs: z.number().int().min(1000).max(120000).optional().default(30000),
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
      requiresBridge: true,
      dangerous: this.dangerousTool,
      readOnly: this.readOnlyTool,
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
}

export class CompileWaitTool extends CompositeBridgeTool {
  readonly name = 'unity_compile_wait';
  readonly description = 'Poll Unity compilation until scripts finish compiling or a timeout is reached';
  protected readonly schema = compileWaitSchema;
  protected readonly readOnlyTool = true;

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
}

export class TestRunTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_test_run';
  readonly description = 'Run Unity EditMode or PlayMode tests and return the created run ID';
  protected readonly rpcMethod = 'editor.testRun';
  protected readonly schema = testRunSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
}

export class TestResultsTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_test_results';
  readonly description = 'Read the latest Unity test run status, summary, and failing tests';
  protected readonly rpcMethod = 'editor.testResults';
  protected readonly schema = testResultsSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class TestRerunFailedTool extends CompositeBridgeTool {
  readonly name = 'unity_test_rerun_failed';
  readonly description = 'Rerun only the failed tests from the latest Unity test run';
  protected readonly schema = testRerunFailedSchema;
  protected readonly readOnlyTool = false;

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
}

export class ProjectToolInvokeTool extends SimpleJsonBridgeTool {
  readonly name = 'unity_project_tool_invoke';
  readonly description = 'Invoke a project-local custom MCP tool discovered from Unity editor assemblies';
  protected readonly rpcMethod = 'editor.projectToolInvoke';
  protected readonly schema = projectToolInvokeSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;
}

export class VerifyChangeTool extends CompositeBridgeTool {
  readonly name = 'unity_verify_change';
  readonly description =
    'Run a closed verification loop across compile status, console analysis, tests, optional screenshot capture, optional build, and optional Strada profiling';
  protected readonly schema = verifyChangeSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected override isReadAction(_input: Record<string, unknown>): boolean {
    return true;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const noBridge = await this.ensureBridge(context);
    if (noBridge) return noBridge;

    const parsed = this.schema.parse(input);
    const evidence: Record<string, unknown> = {};

    if (parsed.recompile) {
      evidence.recompile = await this.client!.request('editor.recompile', { reason: 'unity_verify_change' });
    }

    evidence.compile = await waitForCompile(this.client!, parsed.compileTimeoutMs, parsed.pollIntervalMs);
    if ((evidence.compile as { status?: string }).status === 'timeout') {
      return {
        content: JSON.stringify(evidence.compile, null, 2),
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
    const compileIssues = Number(compile?.compile?.compileIssueCount ?? 0);

    return {
      content: JSON.stringify({
        status: compileIssues === 0 && testFailures === 0 && (build?.success ?? true) ? 'passed' : 'failed',
        summary: {
          compileIssues,
          testFailures,
          buildSuccess: build?.success ?? null,
        },
        evidence,
      }, null, 2),
      isError: compileIssues > 0 || testFailures > 0 || build?.success === false,
    };
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
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: CompileStatusResult = {};

  while (Date.now() <= deadline) {
    lastStatus = await client.request<CompileStatusResult>('editor.compileStatus', {});
    if (!lastStatus.isCompiling && !lastStatus.isReloading) {
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
