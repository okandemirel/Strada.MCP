import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BatchExecuteTool } from './batch-execute.js';
import { ToolRegistry } from '../tool-registry.js';
import type { ITool, ToolContext, ToolResult } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockTool(name: string, handler: (input: Record<string, unknown>) => ToolResult): ITool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: { type: 'object', properties: {} },
    metadata: { category: 'file', requiresBridge: false, dangerous: false, readOnly: true },
    execute: async (input) => handler(input),
  };
}

describe('BatchExecuteTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let registry: ToolRegistry;
  let tool: BatchExecuteTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
    registry = new ToolRegistry();
    registry.register(
      createMockTool('tool_a', () => ({ content: 'result_a' })),
    );
    registry.register(
      createMockTool('tool_b', () => ({ content: 'result_b' })),
    );
    registry.register(
      createMockTool('tool_fail', () => ({ content: 'failed', isError: true })),
    );
    tool = new BatchExecuteTool(registry);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('batch_execute');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should execute multiple operations sequentially', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_b', input: {} },
        ],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('result_a');
    expect(result.content).toContain('result_b');
  });

  it('should return all results as structured array', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_b', input: {} },
        ],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].tool).toBe('tool_a');
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[1].tool).toBe('tool_b');
  });

  it('should stop on failure when rollback is enabled', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_fail', input: {} },
          { tool: 'tool_b', input: {} },
        ],
        stopOnError: true,
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[1].success).toBe(false);
    expect(parsed.stopped).toBe(true);
  });

  it('should continue on failure when stopOnError is false', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_fail', input: {} },
          { tool: 'tool_b', input: {} },
        ],
        stopOnError: false,
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[2].success).toBe(true);
  });

  it('should reject unknown tool name', async () => {
    const result = await tool.execute(
      {
        operations: [{ tool: 'nonexistent_tool', input: {} }],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results[0].success).toBe(false);
    expect(parsed.results[0].error).toContain('not found');
  });

  it('should reject empty operations array', async () => {
    const result = await tool.execute(
      { operations: [] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('at least one operation');
  });

  it('should prevent recursive batch calls', async () => {
    // Register the batch tool itself to test recursion prevention
    registry.register(tool);
    const result = await tool.execute(
      {
        operations: [
          { tool: 'batch_execute', input: { operations: [{ tool: 'tool_a', input: {} }] } },
        ],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results[0].success).toBe(false);
    expect(parsed.results[0].error.toLowerCase()).toContain('recursive');
  });

  it('should enforce maximum operations limit', async () => {
    const ops = Array.from({ length: 51 }, (_, i) => ({
      tool: 'tool_a',
      input: {},
    }));
    const result = await tool.execute(
      { operations: ops },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('maximum');
  });

  it('should include execution time per operation', async () => {
    const result = await tool.execute(
      {
        operations: [{ tool: 'tool_a', input: {} }],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results[0]).toHaveProperty('durationMs');
    expect(typeof parsed.results[0].durationMs).toBe('number');
  });
});
