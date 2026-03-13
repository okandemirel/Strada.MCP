import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { HybridSearch } from '../../intelligence/rag/hybrid-search.js';

export class CodeSearchRagTool implements ITool {
  readonly name = 'code_search';
  readonly description =
    'RAG-powered semantic code search. Finds relevant code by meaning, not just text matching. Returns ranked results with file paths, line ranges, and code snippets.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language or code search query',
      },
      top_k: {
        type: 'number',
        description: 'Number of results to return (default: 10)',
      },
    },
    required: ['query'],
  };
  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private hybridSearch: HybridSearch | null = null;

  /**
   * Called by the RAG manager after initialization to inject the search engine.
   */
  setHybridSearch(search: HybridSearch): void {
    this.hybridSearch = search;
  }

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    if (!this.hybridSearch) {
      return {
        content: 'RAG pipeline is not initialized. Run rag_index first or enable RAG_AUTO_INDEX.',
        isError: true,
      };
    }

    const query = input.query as string;
    const topK = (input.top_k as number) ?? 10;

    if (!query || typeof query !== 'string') {
      return { content: 'query parameter is required and must be a string.', isError: true };
    }

    try {
      const startTime = Date.now();
      const results = await this.hybridSearch.search(query, topK);
      const durationMs = Date.now() - startTime;

      if (results.length === 0) {
        return { content: 'No results found.', metadata: { executionTimeMs: durationMs } };
      }

      const formatted = results
        .map((r, i) => {
          const location = r.parentClass
            ? `${r.filePath} > ${r.parentClass}.${r.name}`
            : `${r.filePath} > ${r.name}`;
          return [
            `### ${i + 1}. ${r.name} (${r.type})`,
            `**Location:** ${location}`,
            `**Lines:** ${r.startLine}-${r.endLine} | **Score:** ${r.score.toFixed(3)}`,
            `\`\`\`csharp`,
            r.snippet,
            `\`\`\``,
          ].join('\n');
        })
        .join('\n\n');

      return {
        content: `Found ${results.length} results (${durationMs}ms):\n\n${formatted}`,
        metadata: { executionTimeMs: durationMs },
      };
    } catch (err) {
      return {
        content: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
