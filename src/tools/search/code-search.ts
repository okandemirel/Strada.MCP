import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

export class CodeSearchTool implements ITool {
  readonly name = 'code_search';
  readonly description = 'RAG-powered semantic code search (requires indexing)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      maxResults: { type: 'number', description: 'Maximum results to return' },
    },
    required: ['query'],
  };
  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  async execute(_input: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    return {
      content: 'RAG not yet initialized. Semantic code search will be available after Phase 6 (RAG pipeline). Use grep_search for regex-based content search.',
    };
  }
}
