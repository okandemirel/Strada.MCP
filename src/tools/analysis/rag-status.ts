import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { VectorStore } from '../../intelligence/rag/vector-store.js';

export interface RagStatusInfo {
  indexedFileCount: number;
  chunkCount: number;
  lastIndexTime: string | null;
  indexSizeBytes: number;
  embeddingProvider: string;
  embeddingDimensions: number;
}

export class RagStatusTool implements ITool {
  readonly name = 'rag_status';
  readonly description =
    'Returns the current status of the RAG index — file count, chunk count, last index time, index size, and configuration.';
  readonly inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  };
  readonly metadata: ToolMetadata = {
    category: 'analysis',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private store: VectorStore | null = null;
  private lastIndexTime: Date | null = null;
  private embeddingProvider = 'unknown';
  private embeddingDimensions = 0;
  private indexedFileCount = 0;

  /**
   * Called by the RAG manager after initialization.
   */
  configure(options: {
    store: VectorStore;
    embeddingProvider: string;
    embeddingDimensions: number;
  }): void {
    this.store = options.store;
    this.embeddingProvider = options.embeddingProvider;
    this.embeddingDimensions = options.embeddingDimensions;
  }

  /**
   * Called after each successful indexing run.
   */
  updateIndexInfo(fileCount: number): void {
    this.lastIndexTime = new Date();
    this.indexedFileCount = fileCount;
  }

  async execute(_input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    if (!this.store) {
      return {
        content: [
          'RAG Status: not initialized',
          '',
          'The RAG pipeline has not been initialized.',
          'Set EMBEDDING_API_KEY and run rag_index to get started.',
        ].join('\n'),
      };
    }

    const chunkCount = this.store.count();
    const indexSize = this.store.getIndexSize();

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    };

    const status = [
      'RAG Status:',
      `  Indexed files: ${this.indexedFileCount}`,
      `  Total chunks:  ${chunkCount}`,
      `  Last indexed:  ${this.lastIndexTime?.toISOString() ?? 'never'}`,
      `  Index size:    ${formatBytes(indexSize)}`,
      `  Provider:      ${this.embeddingProvider}`,
      `  Dimensions:    ${this.embeddingDimensions}`,
    ].join('\n');

    return { content: status };
  }
}
