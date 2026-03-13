import path from 'node:path';
import fs from 'node:fs';
import type { StradaMcpConfig } from '../../config/config.js';
import { createLogger } from '../../utils/logger.js';
import { VectorStore } from './vector-store.js';
import {
  EmbeddingClient,
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-client.js';
import { StructuralChunker } from './chunker.js';
import { Indexer } from './indexer.js';
import { HybridSearch } from './hybrid-search.js';

/**
 * Fallback provider that generates deterministic pseudo-random vectors.
 * Used when no API key is configured — allows basic functionality
 * without external API calls (keyword search still works).
 */
class FallbackEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'fallback';
  readonly maxBatchSize = 100;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) => {
        // Simple hash-based pseudo-random that is deterministic per text
        let h = 0;
        for (let j = 0; j < text.length; j++) {
          h = (h * 31 + text.charCodeAt(j) + i) | 0;
        }
        return Math.sin(h) * 0.5 + 0.5;
      }),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

export class RagManager {
  private readonly logger = createLogger('info', 'rag');
  private store: VectorStore | null = null;
  private embeddingClient: EmbeddingClient | null = null;
  private chunker: StructuralChunker | null = null;
  private indexer: Indexer | null = null;
  private hybridSearch: HybridSearch | null = null;
  private initialized = false;

  constructor(
    private readonly config: StradaMcpConfig,
    private readonly storagePath: string,
  ) {}

  async initialize(projectPath: string): Promise<void> {
    const ragStoragePath = path.join(this.storagePath, '.strada-mcp', 'rag');
    if (!fs.existsSync(ragStoragePath)) {
      fs.mkdirSync(ragStoragePath, { recursive: true });
    }

    // Initialize vector store
    this.store = new VectorStore(ragStoragePath, this.config.embeddingDimensions);
    await this.store.initialize();

    // Initialize embedding client
    let provider: EmbeddingProvider;
    try {
      provider = createEmbeddingProvider(
        this.config.embeddingProvider,
        this.config.embeddingApiKey,
        this.config.embeddingModel,
      );
    } catch {
      this.logger.warn(
        `No embedding API key configured for "${this.config.embeddingProvider}". ` +
        'Falling back to deterministic pseudo-random embeddings. ' +
        'Semantic search quality will be degraded — keyword search still works.',
      );
      provider = new FallbackEmbeddingProvider();
    }

    this.embeddingClient = new EmbeddingClient(provider, {
      dimensions: this.config.embeddingDimensions,
      rateLimit: 60, // default: 60 requests/minute
    });

    // Initialize chunker and indexer
    this.chunker = new StructuralChunker();
    this.indexer = new Indexer(this.store, this.embeddingClient, this.chunker);
    this.hybridSearch = new HybridSearch(this.store, this.embeddingClient);

    this.initialized = true;

    // Auto-index if configured
    if (this.config.ragAutoIndex) {
      await this.indexer.index(projectPath);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getStore(): VectorStore | null {
    return this.store;
  }

  getIndexer(): Indexer | null {
    return this.indexer;
  }

  getHybridSearch(): HybridSearch | null {
    return this.hybridSearch;
  }

  getEmbeddingClient(): EmbeddingClient | null {
    return this.embeddingClient;
  }

  shutdown(): void {
    if (this.store) {
      try {
        this.store.close();
      } catch { /* ignore close errors */ }
    }
    this.store = null;
    this.embeddingClient = null;
    this.chunker = null;
    this.indexer = null;
    this.hybridSearch = null;
    this.initialized = false;
  }
}
