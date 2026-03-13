import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScriptExecuteTool } from './script-execute.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockBridge(response?: unknown): BridgeClient {
  return {
    request: vi.fn().mockResolvedValue(response ?? { success: true, result: { stdout: '', returnValue: null } }),
    notify: vi.fn(),
    pendingCount: 0,
    destroy: vi.fn(),
  } as unknown as BridgeClient;
}

describe('ScriptExecuteTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let ctxDisabled: ToolContext;
  let tool: ScriptExecuteTool;
  let bridge: BridgeClient;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    ctxDisabled = { ...ctx, unityBridgeConnected: false };
    tool = new ScriptExecuteTool({ scriptExecuteEnabled: true });
    bridge = createMockBridge();
    tool.setBridgeClient(bridge);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('script_execute');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.dangerous).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should reject when SCRIPT_EXECUTE_ENABLED is false', async () => {
    const disabledTool = new ScriptExecuteTool({ scriptExecuteEnabled: false });
    disabledTool.setBridgeClient(bridge);
    const result = await disabledTool.execute(
      { code: 'Debug.Log("hello");' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('disabled');
    expect(result.content).toContain('SCRIPT_EXECUTE_ENABLED');
  });

  it('should reject when bridge is not connected', async () => {
    const result = await tool.execute(
      { code: 'Debug.Log("hello");' },
      ctxDisabled,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should execute C# code via bridge', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { stdout: 'hello\n', returnValue: null },
    });

    const result = await tool.execute(
      { code: 'Debug.Log("hello");' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('hello');
    expect(bridge.request).toHaveBeenCalledWith(
      'script.execute',
      expect.objectContaining({ code: 'Debug.Log("hello");' }),
    );
  });

  it('should pass additional assembly references', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { stdout: '', returnValue: '42' },
    });

    const result = await tool.execute(
      {
        code: 'return 42;',
        assemblies: ['System.Linq'],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith(
      'script.execute',
      expect.objectContaining({
        assemblies: ['System.Linq'],
      }),
    );
  });

  it('should handle compilation errors from bridge', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'CS1002: ; expected at line 1',
    });

    const result = await tool.execute(
      { code: 'invalid code here' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('CS1002');
  });

  it('should handle runtime exceptions from bridge', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'NullReferenceException: Object reference not set',
    });

    const result = await tool.execute(
      { code: 'string s = null; s.Length;' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('NullReferenceException');
  });

  it('should enforce timeout', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 100),
      ),
    );

    const result = await tool.execute(
      { code: 'while(true){}' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Timeout');
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { code: 'Debug.Log("test");' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject empty code', async () => {
    const result = await tool.execute({ code: '' }, ctx);
    expect(result.isError).toBe(true);
  });
});
