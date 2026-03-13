export { StructuralChunker, type CodeChunk } from './chunker.js';
export {
  EmbeddingClient,
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-client.js';
export { VectorStore, type VectorEntry, type VectorSearchResult, type ChunkMetadata } from './vector-store.js';
export { Indexer, type IndexProgress, type IndexOptions, type IndexResult } from './indexer.js';
export { HybridSearch, type HybridSearchResult } from './hybrid-search.js';
export { RagManager } from './rag-manager.js';
