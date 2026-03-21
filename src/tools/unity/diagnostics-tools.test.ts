import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import {
  CompileStatusTool,
  CompileWaitTool,
  ProjectToolInvokeTool,
  ScreenshotCompareTool,
  TestRerunFailedTool,
  VerifyChangeTool,
} from './diagnostics-tools.js';

function createMockBridge(
  handler: (method: string, params?: Record<string, unknown>) => unknown | Promise<unknown>,
): BridgeClient {
  return {
    request: vi.fn(handler),
    notify: vi.fn(),
    pendingCount: 0,
    destroy: vi.fn(),
  } as unknown as BridgeClient;
}

function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    projectPath: '/project',
    workingDirectory: '/project',
    readOnly: false,
    unityBridgeConnected: true,
    ...overrides,
  };
}

describe('CompileStatusTool', () => {
  it('should query compile status', async () => {
    const bridge = createMockBridge(async () => ({ isCompiling: false, compileIssueCount: 0 }));
    const tool = new CompileStatusTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.compileStatus', {});
    expect(result.content).toContain('compileIssueCount');
  });
});

describe('CompileWaitTool', () => {
  it('should poll until compilation completes', async () => {
    const bridge = createMockBridge(
      vi.fn()
        .mockResolvedValueOnce({ isCompiling: true, isReloading: false })
        .mockResolvedValueOnce({ isCompiling: false, isReloading: false, compileIssueCount: 0 }),
    );
    const tool = new CompileWaitTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ timeoutMs: 1000, pollIntervalMs: 50 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('completed');
  });
});

describe('TestRerunFailedTool', () => {
  it('should rerun failed tests from the latest run', async () => {
    const bridge = createMockBridge(async (method, params) => {
      if (method === 'editor.testResults' && !params?.runId) {
        return {
          runId: 'run-1',
          status: 'completed',
          failedTests: [{ fullName: 'Tests.Example.Fail' }],
          summary: { failed: 1 },
        };
      }

      if (method === 'editor.testRun') {
        return { runId: 'run-2', status: 'running' };
      }

      if (method === 'editor.testResults' && params?.runId === 'run-2') {
        return {
        runId: 'run-2',
        status: 'completed',
        failedTests: [],
        summary: { failed: 0 },
        };
      }

      return {};
    });
    const tool = new TestRerunFailedTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ timeoutMs: 1000, pollIntervalMs: 50 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('run-2');
  });
});

describe('ScreenshotCompareTool', () => {
  it('should compare two screenshots', async () => {
    const bridge = createMockBridge(async () => ({ identical: true, differencePixels: 0 }));
    const tool = new ScreenshotCompareTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      baselinePath: '/tmp/base.png',
      candidatePath: '/tmp/candidate.png',
    }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.screenshotCompare', {
      baselinePath: '/tmp/base.png',
      candidatePath: '/tmp/candidate.png',
      tolerancePercent: 0,
      pixelThreshold: 0,
    });
  });
});

describe('ProjectToolInvokeTool', () => {
  it('should reject writes in read-only mode', async () => {
    const bridge = createMockBridge(async () => ({ invoked: true }));
    const tool = new ProjectToolInvokeTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      name: 'project_tool',
      input: { enabled: true },
    }, createContext({ readOnly: true }));
    expect(result.isError).toBe(true);
  });
});

describe('VerifyChangeTool', () => {
  it('should aggregate compile and console evidence', async () => {
    const bridge = createMockBridge(async (method) => {
      switch (method) {
        case 'editor.recompile':
          return { requested: true };
        case 'editor.compileStatus':
          return { isCompiling: false, isReloading: false, compileIssueCount: 0 };
        case 'editor.getConsoleLogs':
          return { entries: [], totalCount: 0 };
        default:
          return {};
      }
    });
    const tool = new VerifyChangeTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('"status": "passed"');
  });
});
