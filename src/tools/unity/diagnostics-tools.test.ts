import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-compile-'));
  });

  afterEach(async () => {
    delete process.env.UNITY_EDITOR_LOG_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should query compile status', async () => {
    const bridge = createMockBridge(async () => ({ isCompiling: false, compileIssueCount: 0 }));
    const tool = new CompileStatusTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.compileStatus', {});
    expect(result.content).toContain('compileIssueCount');
  });

  it('should fall back to editor log diagnostics when the live bridge request fails', async () => {
    const logPath = path.join(tempDir, 'Editor.log');
    await fs.writeFile(
      logPath,
      'Assets/Scripts/Foo.cs(12,8): error CS0246: The type or namespace name Bar could not be found\n',
      'utf8',
    );
    process.env.UNITY_EDITOR_LOG_PATH = logPath;

    const bridge = createMockBridge(async () => {
      throw new Error('Bridge unavailable');
    });
    const tool = new CompileStatusTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, createContext({ projectPath: tempDir }));
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('"source": "static_editor_log"');
    expect(result.content).toContain('"compileIssueCount": 1');
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

  /**
   * Codex round AC, executed against the live bridge branch: a suite that
   * ended "Failed" with every test skipped and no failure count was reported
   * `status:"passed", isError:false` — and so were "Cancelled" and
   * "Inconclusive".
   */
  describe('a suite that did not pass is not a pass (Codex 2026-09-12 AC J4.1)', () => {
    const bridgeWith = (tests: Record<string, unknown>): BridgeClient =>
      createMockBridge(async (method) => {
        switch (method) {
          case 'editor.recompile':
            return { requested: true };
          case 'editor.compileStatus':
            return { isCompiling: false, isReloading: false, compileIssueCount: 0 };
          case 'editor.getConsoleLogs':
            return { entries: [], totalCount: 0 };
          case 'editor.runTests':
            return { runId: 'r1' };
          case 'editor.testResults':
            return { runId: 'r1', ...tests };
          default:
            return {};
        }
      });
    const verify = async (tests: Record<string, unknown>) => {
      const tool = new VerifyChangeTool();
      tool.setBridgeClient(bridgeWith(tests));
      const result = await tool.execute({ runTests: true, testMode: 'play' }, createContext());
      return { result, payload: JSON.parse(result.content) as Record<string, any> };
    };

    it('refuses a run whose own result is Failed, Cancelled or Inconclusive', async () => {
      for (const outcome of ['Failed', 'Cancelled', 'Inconclusive']) {
        const { result, payload } = await verify({
          status: 'completed',
          result: outcome,
          summary: { total: 10, passed: 10, failed: 0, skipped: 0 },
        });
        expect(payload['status']).toBe('failed');
        expect(result.isError).toBe(true);
        expect(String(payload['reason'])).toContain(outcome);
      }
    });

    it('refuses a run in which every test was skipped, and discloses the skips', async () => {
      const { result, payload } = await verify({
        status: 'completed',
        summary: { total: 10, passed: 0, failed: 0, skipped: 10 },
      });
      expect(payload['status']).toBe('failed');
      expect(result.isError).toBe(true);
      expect(String(payload['reason'])).toContain('skipped');
      expect(payload['summary']['testsSkipped']).toBe(10);
    });

    it('refuses a summary that does not account for every test it counted', async () => {
      const { payload } = await verify({
        status: 'completed',
        summary: { total: 278, passed: 275, failed: 0, skipped: 2 },
      });
      expect(payload['status']).toBe('failed');
      expect(String(payload['reason'])).toContain('accounts for only 277');
    });

    /**
     * Codex round AI#1: the Unity package serialized its counts and not its
     * total, so ten passing tests through the live bridge were reported
     * `status:"failed"` with "The test run reported ZERO tests — nothing
     * executed" — a verified change turned into a failure.
     */
    it('a producer that states counts but no total is read on the counts (Codex 2026-09-13 AI#1)', async () => {
      const { result, payload } = await verify({
        status: 'completed',
        result: 'Passed',
        summary: { passed: 10, failed: 0, skipped: 0, inconclusive: 0 },
      });
      expect(payload['status']).toBe('passed');
      expect(result.isError).toBeFalsy();
      expect(String(payload['reason'] ?? '')).not.toContain('ZERO tests');
      expect(payload['summary']['testTotal']).toBe(10);
    });

    it('…and a producer that states NOTHING is still zero tests', async () => {
      const { result, payload } = await verify({ status: 'completed', result: 'Passed', summary: {} });
      expect(payload['status']).toBe('failed');
      expect(result.isError).toBe(true);
      expect(String(payload['reason'])).toContain('ZERO tests');
      // An explicit zero is zero, whatever else the summary says.
      const explicit = await verify({ status: 'completed', result: 'Passed', summary: { passed: 0, failed: 0, skipped: 0 } });
      expect(explicit.payload['status']).toBe('failed');
      expect(String(explicit.payload['reason'])).toContain('ZERO tests');
    });

    it('the accounting check fires on a total the PRODUCER stated', async () => {
      // A total derived from the counts cannot disagree with them; a total the
      // producer named itself can, and that is the unverified test this check
      // exists to catch.
      const derived = await verify({
        status: 'completed', result: 'Passed',
        summary: { passed: 275, failed: 0, skipped: 2 },
      });
      expect(derived.payload['status']).toBe('passed');
      const stated = await verify({
        status: 'completed', result: 'Passed',
        summary: { total: 278, passed: 275, failed: 0, skipped: 2 },
      });
      expect(stated.payload['status']).toBe('failed');
      expect(String(stated.payload['reason'])).toContain('accounts for only 277');
      // …and an inconclusive test IS accounted for.
      const withInconclusive = await verify({
        status: 'completed', result: 'Passed',
        summary: { total: 278, passed: 275, failed: 0, skipped: 2, inconclusive: 1 },
      });
      expect(withInconclusive.payload['status']).toBe('passed');
    });

    /**
     * Codex round AI, the compile row: this dispatch took no run id and
     * emitted no receipt at all, so the compile behind every delivery was a
     * file a worker could have written.
     */
    it('carries a receipt for the run it was given, in the report it already returns', async () => {
      const tool = new VerifyChangeTool();
      tool.setBridgeClient(bridgeWith({ status: 'completed', result: 'Passed', summary: { total: 1, passed: 1 } }));
      const result = await tool.execute({ runTests: true, testMode: 'play', evidenceRunId: 'run-c1' }, createContext());
      const payload = JSON.parse(result.content) as Record<string, any>;
      // The whole report is one JSON document: a fenced block would break
      // every reader of it, so the receipt is a field — the same bytes.
      const receipt = JSON.parse(String(payload['receipt'])) as Record<string, unknown>;
      expect(receipt).toMatchObject({
        schemaVersion: 1, runId: 'run-c1', kind: 'compile', medium: 'editor',
        // A LIVE EDITOR OWNS NO PROCESS: it never exits, so it states no code
        // (Codex 2026-09-12 AC, 2026-09-13 AI#10).
        execution: { completed: true, exitCode: null, timedOut: false },
      });
      // …and a dispatch that named no run says nothing.
      const anonymous = await new VerifyChangeTool();
      anonymous.setBridgeClient(bridgeWith({ status: 'completed', result: 'Passed', summary: { total: 1, passed: 1 } }));
      const bare = JSON.parse((await anonymous.execute({ runTests: true, testMode: 'play' }, createContext())).content) as Record<string, unknown>;
      expect(bare['receipt']).toBeUndefined();
    });

    it('a compile that did not settle says so in its own receipt', async () => {
      const stuck = new VerifyChangeTool();
      stuck.setBridgeClient(createMockBridge(async (method) => {
        switch (method) {
          case 'editor.recompile': return { requested: true };
          case 'editor.compileStatus': return { isCompiling: true, isReloading: false, compileIssueCount: 0 };
          default: return {};
        }
      }));
      const result = await stuck.execute({ compileTimeoutMs: 1000, pollIntervalMs: 100, evidenceRunId: 'run-slow' }, createContext());
      const payload = JSON.parse(result.content) as Record<string, any>;
      expect(payload['status']).toBe('timeout');
      expect(JSON.parse(String(payload['receipt']))).toMatchObject({
        runId: 'run-slow', kind: 'compile', medium: 'editor',
        execution: { completed: false, exitCode: null, timedOut: true },
      });
    });

    it('refuses a run that never reached an end state, however clean its counts', async () => {
      // The poll gives up with `status:"timeout"`, and an "error" run has
      // counts that describe an unfinished suite. (A still-"running" payload
      // never reaches the judge: the poller waits for it.)
      for (const state of ['timeout', 'error']) {
        const { result, payload } = await verify({
          status: state,
          summary: { total: 10, passed: 10, failed: 0, skipped: 0 },
        });
        expect(payload['status']).toBe('failed');
        expect(result.isError).toBe(true);
        expect(String(payload['reason'])).toContain(state);
      }
    });

    it('passes a suite that ran, passed and accounts for its tests — skips disclosed', async () => {
      const { result, payload } = await verify({
        status: 'completed',
        result: 'Passed',
        summary: { total: 10, passed: 8, failed: 0, skipped: 2 },
      });
      expect(payload['status']).toBe('passed');
      expect(result.isError).toBeFalsy();
      expect(payload['summary']['testsSkipped']).toBe(2);
      expect(payload['summary']['suiteResult']).toBe('Passed');
    });

    it('still passes a producer that reports no result field at all', async () => {
      // A bridge that reports only the run state and counts is read exactly as
      // before: absent is not failed.
      const { payload } = await verify({ status: 'completed', summary: { total: 4, failed: 0 } });
      expect(payload['status']).toBe('passed');
    });
  });

  it('verifies offline when the editor is closed', async () => {
    // "Verify my change" used to give up the moment no bridge was connected,
    // leaving an agent with no way to check its own work. Measured: a run ended
    // by telling the user it could not satisfy its own verification gate and
    // asking whether to proceed anyway. With the editor closed it must still
    // reach for a real compile rather than answering "cannot".
    const tool = new VerifyChangeTool();

    const result = await tool.execute({}, createContext({ unityBridgeConnected: false }));

    expect(result.content).toContain('"mode": "offline"');
    // Whatever the verdict, it must be an honest one — never a bare refusal.
    expect(result.content).toMatch(/"source":/);
  });
});
