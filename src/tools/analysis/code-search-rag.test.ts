import { describe, it, expect } from 'vitest';
import { CodeSearchRagTool } from './code-search-rag.js';
import type { ToolContext } from '../tool.interface.js';

describe('CodeSearchRagTool', () => {
  it('should have correct metadata', () => {
    const tool = new CodeSearchRagTool();
    expect(tool.name).toBe('code_search_rag');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should return error when RAG is not initialized', async () => {
    const tool = new CodeSearchRagTool();
    const ctx: ToolContext = {
      projectPath: '/tmp/fake',
      workingDirectory: '/tmp/fake',
      readOnly: false,
      unityBridgeConnected: false,
    };
    const result = await tool.execute({ query: 'health system' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not initialized');
  });

  it('should accept query and top_k parameters', () => {
    const tool = new CodeSearchRagTool();
    const schema = tool.inputSchema;
    expect(schema.properties).toHaveProperty('query');
    expect(schema.properties).toHaveProperty('top_k');
  });
});
