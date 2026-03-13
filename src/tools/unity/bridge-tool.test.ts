import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';

// Concrete subclass for testing
class TestBridgeTool extends BridgeTool {
  readonly name = 'test_tool';
  readonly description = 'A test tool';
  protected readonly rpcMethod = 'test.method';
  protected readonly schema = z.object({
    value: z.string(),
    count: z.number().optional(),
  });
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return { val: input.value, cnt: input.count };
  }

  protected formatResponse(result: unknown): string {
    return `Result: ${JSON.stringify(result)}`;
  }
}

class WriteBridgeTool extends BridgeTool {
  readonly name = 'write_tool';
  readonly description = 'A write tool';
  protected readonly rpcMethod = 'write.method';
  protected readonly schema = z.object({ id: z.number() });
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return { instanceId: input.id };
  }

  protected formatResponse(result: unknown): string {
    return `Done: ${JSON.stringify(result)}`;
  }
}

function createMockBridge(): BridgeClient {
  return {
    request: vi.fn().mockResolvedValue({ success: true }),
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

describe('BridgeTool', () => {
  let tool: TestBridgeTool;
  let writeTool: WriteBridgeTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new TestBridgeTool();
    writeTool = new WriteBridgeTool();
    bridge = createMockBridge();
    tool.setBridgeClient(bridge);
    writeTool.setBridgeClient(bridge);
  });

  describe('metadata', () => {
    it('should have unity-runtime category', () => {
      expect(tool.metadata.category).toBe('unity-runtime');
    });

    it('should require bridge', () => {
      expect(tool.metadata.requiresBridge).toBe(true);
    });

    it('should reflect readOnly from subclass', () => {
      expect(tool.metadata.readOnly).toBe(true);
      expect(writeTool.metadata.readOnly).toBe(false);
    });

    it('should reflect dangerous from subclass', () => {
      expect(tool.metadata.dangerous).toBe(false);
      expect(writeTool.metadata.dangerous).toBe(true);
    });
  });

  describe('inputSchema', () => {
    it('should produce a valid JSON schema object', () => {
      const schema = tool.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect((schema.properties as Record<string, unknown>).value).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should reject when bridge is not connected', async () => {
      const ctx = createContext({ unityBridgeConnected: false });
      const result = await tool.execute({ value: 'test' }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('bridge');
    });

    it('should reject when bridge client is not set', async () => {
      const unsetTool = new TestBridgeTool();
      const ctx = createContext();
      const result = await unsetTool.execute({ value: 'test' }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('bridge');
    });

    it('should reject write tools in read-only mode', async () => {
      const ctx = createContext({ readOnly: true });
      const result = await writeTool.execute({ id: 1 }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });

    it('should allow read tools in read-only mode', async () => {
      const ctx = createContext({ readOnly: true });
      const result = await tool.execute({ value: 'test' }, ctx);
      expect(result.isError).toBeFalsy();
    });

    it('should validate input with zod schema', async () => {
      const ctx = createContext();
      const result = await tool.execute({ value: 123 }, ctx); // value should be string
      expect(result.isError).toBe(true);
    });

    it('should call bridge.request with correct method and params', async () => {
      const ctx = createContext();
      await tool.execute({ value: 'hello', count: 5 }, ctx);
      expect(bridge.request).toHaveBeenCalledWith('test.method', { val: 'hello', cnt: 5 });
    });

    it('should format the response using formatResponse', async () => {
      const ctx = createContext();
      const result = await tool.execute({ value: 'test' }, ctx);
      expect(result.content).toContain('Result:');
      expect(result.content).toContain('success');
    });

    it('should include execution time in metadata', async () => {
      const ctx = createContext();
      const result = await tool.execute({ value: 'test' }, ctx);
      expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle bridge errors gracefully', async () => {
      (bridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection lost'),
      );
      const ctx = createContext();
      const result = await tool.execute({ value: 'test' }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Connection lost');
    });
  });
});
