import { describe, it, expect, beforeEach } from 'vitest';
import {
  EmbeddingClient,
  GeminiEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-client.js';

// Mock provider for testing without API keys
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly maxBatchSize = 10;
  embedCallCount = 0;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    this.embedCallCount++;
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) => Math.sin(i + text.length)),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

describe('EmbeddingClient', () => {
  let mockProvider: MockEmbeddingProvider;
  let client: EmbeddingClient;

  beforeEach(() => {
    mockProvider = new MockEmbeddingProvider();
    client = new EmbeddingClient(mockProvider, { dimensions: 768, rateLimit: 100 });
  });

  it('should embed a single text', async () => {
    const results = await client.embed(['Hello world']);
    expect(results).toHaveLength(1);
    expect(results[0].vector).toHaveLength(768);
    expect(typeof results[0].tokenCount).toBe('number');
  });

  it('should embed multiple texts in batch', async () => {
    const texts = Array.from({ length: 5 }, (_, i) => `text ${i}`);
    const results = await client.embed(texts);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.vector).toHaveLength(768);
    }
  });

  it('should split large batches to respect maxBatchSize', async () => {
    const provider = new MockEmbeddingProvider();
    provider.maxBatchSize = 3;
    const c = new EmbeddingClient(provider, { dimensions: 768, rateLimit: 1000 });
    const texts = Array.from({ length: 7 }, (_, i) => `text ${i}`);
    const results = await c.embed(texts);
    expect(results).toHaveLength(7);
    expect(provider.embedCallCount).toBe(3); // ceil(7/3)
  });

  it('should reject empty input', async () => {
    const results = await client.embed([]);
    expect(results).toEqual([]);
  });

  it('should generate deterministic vectors for same input', async () => {
    const r1 = await client.embed(['test']);
    const r2 = await client.embed(['test']);
    expect(r1[0].vector).toEqual(r2[0].vector);
  });

  it('should respect configured dimensions', async () => {
    const c = new EmbeddingClient(mockProvider, { dimensions: 256, rateLimit: 100 });
    const results = await c.embed(['test']);
    expect(results[0].vector).toHaveLength(256);
  });
});

describe('GeminiEmbeddingProvider', () => {
  it('should be constructable with API key', () => {
    const provider = new GeminiEmbeddingProvider('test-api-key', 'gemini-embedding-2-preview');
    expect(provider.name).toBe('gemini');
    expect(provider.maxBatchSize).toBeLessThanOrEqual(100);
  });

  it('should throw on missing API key', () => {
    expect(() => new GeminiEmbeddingProvider('', 'gemini-embedding-2-preview')).toThrow(
      'API key',
    );
  });
});
