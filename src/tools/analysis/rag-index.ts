import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { validatePath } from '../../security/path-guard.js';
import { Indexer } from '../../intelligence/rag/indexer.js';

export class RagIndexTool implements ITool {
  readonly name = 'rag_index';
  readonly description =
    'Trigger RAG indexing of C# source files. Scans, parses, chunks, embeds, and stores code for semantic search. Incremental by default — only re-indexes changed files.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Directory to index (relative to project root). Defaults to project root.',
      },
      force: {
        type: 'boolean',
        description: 'Force re-index all files, ignoring content hashes (default: false)',
      },
    },
    required: [] as string[],
  };
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private indexer: Indexer | null = null;

  /**
   * Called by the RAG manager after initialization to inject the indexer.
   */
  setIndexer(indexer: Indexer): void {
    this.indexer = indexer;
  }

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    if (!this.indexer) {
      return {
        content: 'RAG pipeline is not initialized. Check your embedding configuration.',
        isError: true,
      };
    }

    const force = (input.force as boolean) ?? false;
    let targetPath = ctx.projectPath;

    if (input.path && typeof input.path === 'string') {
      try {
        targetPath = validatePath(input.path as string, ctx.projectPath);
      } catch (err) {
        return {
          content: `Invalid path: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    }

    try {
      const result = await this.indexer.index(targetPath, { force });

      const summary = [
        `RAG indexing complete (${result.durationMs}ms):`,
        `  Files scanned: ${result.filesScanned}`,
        `  Files skipped (unchanged): ${result.filesSkipped}`,
        `  Files removed: ${result.filesRemoved}`,
        `  Chunks indexed: ${result.chunksIndexed}`,
        force ? '  Mode: full re-index (forced)' : '  Mode: incremental',
      ].join('\n');

      return {
        content: summary,
        metadata: { executionTimeMs: result.durationMs },
      };
    } catch (err) {
      return {
        content: `Indexing failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
