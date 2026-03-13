import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CSharpReflectionTool } from './csharp-reflection.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockBridge(response?: unknown): BridgeClient {
  return {
    request: vi.fn().mockResolvedValue(response ?? { success: true, result: {} }),
    notify: vi.fn(),
    pendingCount: 0,
    destroy: vi.fn(),
  } as unknown as BridgeClient;
}

describe('CSharpReflectionTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: CSharpReflectionTool;
  let toolInvokeEnabled: CSharpReflectionTool;
  let bridge: BridgeClient;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    bridge = createMockBridge();
    tool = new CSharpReflectionTool({ reflectionInvokeEnabled: false });
    tool.setBridgeClient(bridge);
    toolInvokeEnabled = new CSharpReflectionTool({ reflectionInvokeEnabled: true });
    toolInvokeEnabled.setBridgeClient(bridge);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('csharp_reflection');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.dangerous).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should find types by pattern', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: {
        types: [
          { fullName: 'Game.Player', assembly: 'Assembly-CSharp', isClass: true },
          { fullName: 'Game.PlayerController', assembly: 'Assembly-CSharp', isClass: true },
        ],
      },
    });

    const result = await tool.execute(
      { action: 'findTypes', pattern: 'Player' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.types).toHaveLength(2);
    expect(parsed.types[0].fullName).toBe('Game.Player');
  });

  it('should get members of a type', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: {
        typeName: 'Game.Player',
        fields: [{ name: 'health', type: 'System.Int32', isPublic: true }],
        properties: [{ name: 'IsAlive', type: 'System.Boolean', hasGetter: true, hasSetter: false }],
        methods: [{ name: 'TakeDamage', returnType: 'System.Void', parameters: ['System.Int32'] }],
      },
    });

    const result = await tool.execute(
      { action: 'getMembers', typeName: 'Game.Player' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.properties).toHaveLength(1);
    expect(parsed.methods).toHaveLength(1);
  });

  it('should reject invoke when reflectionInvokeEnabled is false', async () => {
    const result = await tool.execute(
      {
        action: 'invoke',
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('disabled');
  });

  it('should invoke method when reflectionInvokeEnabled is true', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { returnValue: null, stdout: '' },
    });

    const result = await toolInvokeEnabled.execute(
      {
        action: 'invoke',
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith(
      'reflection.invoke',
      expect.objectContaining({
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      }),
    );
  });

  it('should reject invoke in read-only mode even when enabled', async () => {
    const result = await toolInvokeEnabled.execute(
      {
        action: 'invoke',
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'findTypes', pattern: 'Player' },
      { ...ctx, unityBridgeConnected: false },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should require typeName for getMembers', async () => {
    const result = await tool.execute(
      { action: 'getMembers' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('typeName');
  });

  it('should require typeName and methodName for invoke', async () => {
    const result = await toolInvokeEnabled.execute(
      { action: 'invoke', typeName: 'Game.Player' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('methodName');
  });

  it('should handle type not found error from bridge', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Type "Game.NonExistent" not found',
    });

    const result = await tool.execute(
      { action: 'getMembers', typeName: 'Game.NonExistent' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('should allow findTypes and getMembers in read-only mode', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { types: [] },
    });

    const result = await tool.execute(
      { action: 'findTypes', pattern: 'Player' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBeFalsy();
  });
});
