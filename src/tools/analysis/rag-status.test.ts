import { describe, it, expect } from 'vitest';
import { RagStatusTool } from './rag-status.js';
import type { ToolContext } from '../tool.interface.js';

describe('RagStatusTool', () => {
  it('should have correct metadata', () => {
    const tool = new RagStatusTool();
    expect(tool.name).toBe('rag_status');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should take no required parameters', () => {
    const tool = new RagStatusTool();
    expect(tool.inputSchema.required).toEqual([]);
  });

  it('should return status when not initialized', async () => {
    const tool = new RagStatusTool();
    const ctx: ToolContext = {
      projectPath: '/tmp/fake',
      workingDirectory: '/tmp/fake',
      readOnly: false,
      unityBridgeConnected: false,
    };
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('not initialized');
  });
});
