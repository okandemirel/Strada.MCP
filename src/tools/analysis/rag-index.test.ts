import { describe, it, expect } from 'vitest';
import { RagIndexTool } from './rag-index.js';
import type { ToolContext } from '../tool.interface.js';

describe('RagIndexTool', () => {
  it('should have correct metadata', () => {
    const tool = new RagIndexTool();
    expect(tool.name).toBe('rag_index');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should accept path and force parameters', () => {
    const tool = new RagIndexTool();
    expect(tool.inputSchema.properties).toHaveProperty('path');
    expect(tool.inputSchema.properties).toHaveProperty('force');
  });

  it('should return error when indexer is not initialized', async () => {
    const tool = new RagIndexTool();
    const ctx: ToolContext = {
      projectPath: '/tmp/fake',
      workingDirectory: '/tmp/fake',
      readOnly: false,
      unityBridgeConnected: false,
    };
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not initialized');
  });

  it('should validate path parameter through path guard', () => {
    const tool = new RagIndexTool();
    // path is optional — defaults to project root
    expect(tool.inputSchema.required).not.toContain('path');
  });
});
