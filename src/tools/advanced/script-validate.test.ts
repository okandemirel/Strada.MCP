import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScriptValidateTool } from './script-validate.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockBridge(response?: unknown): BridgeClient {
  return {
    request: vi.fn().mockResolvedValue(response ?? { success: true, result: { errors: [], warnings: [] } }),
    notify: vi.fn(),
    pendingCount: 0,
    destroy: vi.fn(),
  } as unknown as BridgeClient;
}

describe('ScriptValidateTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: ScriptValidateTool;
  let bridge: BridgeClient;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    tool = new ScriptValidateTool();
    bridge = createMockBridge();
    tool.setBridgeClient(bridge);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('script_validate');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(false); // basic mode works without bridge
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should validate correct C# in basic mode (tree-sitter)', async () => {
    const result = await tool.execute(
      {
        code: `using System;
namespace Game
{
    public class Player
    {
        public int Health { get; set; }
        public void TakeDamage(int amount) { Health -= amount; }
    }
}`,
        mode: 'basic',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
  });

  it('should detect syntax errors in basic mode', async () => {
    const result = await tool.execute(
      {
        code: `public class Broken {
    public void Method( { // missing closing paren
    }
}`,
        mode: 'basic',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy(); // Not a tool error -- validation result
    const parsed = JSON.parse(result.content);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('should report error line numbers in basic mode', async () => {
    const result = await tool.execute(
      {
        code: `public class Test {
    int x = ;
}`,
        mode: 'basic',
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]).toHaveProperty('line');
  });

  it('should validate in strict mode via bridge', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: { errors: [], warnings: [] },
    });

    const result = await tool.execute(
      {
        code: 'public class Valid { }',
        mode: 'strict',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith(
      'script.validate',
      expect.objectContaining({ code: 'public class Valid { }' }),
    );
  });

  it('should return Roslyn errors in strict mode', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      result: {
        errors: [
          {
            code: 'CS0246',
            message: "The type 'NonExistent' could not be found",
            line: 1,
            column: 15,
          },
        ],
        warnings: [],
      },
    });

    const result = await tool.execute(
      {
        code: 'public class Test : NonExistent { }',
        mode: 'strict',
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].code).toBe('CS0246');
    expect(parsed.errors[0].line).toBe(1);
  });

  it('should fallback to basic when strict requested but bridge unavailable', async () => {
    const result = await tool.execute(
      {
        code: 'public class Test { }',
        mode: 'strict',
      },
      { ...ctx, unityBridgeConnected: false },
    );
    expect(result.isError).toBeFalsy();
    // Should still validate, just using tree-sitter instead of Roslyn
    const parsed = JSON.parse(result.content);
    expect(parsed.mode).toBe('basic'); // Indicates fallback
  });

  it('should default to basic mode', async () => {
    const result = await tool.execute(
      { code: 'public class Test { }' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).not.toHaveBeenCalled(); // basic mode doesn't use bridge
  });

  it('should reject empty code', async () => {
    const result = await tool.execute({ code: '', mode: 'basic' }, ctx);
    expect(result.isError).toBe(true);
  });
});
