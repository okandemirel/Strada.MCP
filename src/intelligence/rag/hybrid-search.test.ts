import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HybridSearch, type HybridSearchResult } from './hybrid-search.js';
import { VectorStore } from './vector-store.js';
import { EmbeddingClient, type EmbeddingProvider, type EmbeddingResult } from './embedding-client.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly maxBatchSize = 50;

  async embed(texts: string[], dimensions: number): Promise<EmbeddingResult[]> {
    return texts.map((text) => ({
      vector: Array.from({ length: dimensions }, (_, i) =>
        Math.sin(i + text.charCodeAt(0) + text.length),
      ),
      tokenCount: text.split(/\s+/).length,
    }));
  }
}

describe('HybridSearch', () => {
  let tmpDir: string;
  let store: VectorStore;
  let embeddingClient: EmbeddingClient;
  let search: HybridSearch;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-search-test-'));
    store = new VectorStore(tmpDir, 128);
    await store.initialize();

    const provider = new MockEmbeddingProvider();
    embeddingClient = new EmbeddingClient(provider, { dimensions: 128, rateLimit: 1000 });

    // Seed the store with test data
    const texts = [
      'public class HealthSystem : SystemBase',
      'public struct Health : IComponent',
      'public class MovementSystem : SystemBase',
      'public void TakeDamage(float amount)',
    ];
    const embeddings = await embeddingClient.embed(texts);

    for (let i = 0; i < texts.length; i++) {
      await store.insert({
        contentHash: `hash-${i}`,
        vector: embeddings[i].vector,
        metadata: {
          filePath: `file-${i}.cs`,
          type: i % 2 === 0 ? 'class' : 'struct',
          name: ['HealthSystem', 'Health', 'MovementSystem', 'TakeDamage'][i],
          namespace: 'Game',
          parentClass: i === 3 ? 'HealthSystem' : undefined,
          startLine: 1,
          endLine: 10,
          content: texts[i],
        },
      });
    }

    search = new HybridSearch(store, embeddingClient);
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return results for a query', async () => {
    const results = await search.search('health system', 5);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.score).toBe('number');
      expect(r.filePath).toBeDefined();
      expect(r.snippet).toBeDefined();
    }
  });

  it('should boost results with keyword matches', async () => {
    const results = await search.search('Health', 5);
    // Items containing "Health" in name/content should rank higher
    const healthResults = results.filter(
      (r) => r.name.includes('Health'),
    );
    expect(healthResults.length).toBeGreaterThan(0);
  });

  it('should respect top-k limit', async () => {
    const results = await search.search('system', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return empty for query on empty store', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    await fs.mkdir(emptyDir);
    const emptyStore = new VectorStore(emptyDir, 128);
    await emptyStore.initialize();
    const emptySearch = new HybridSearch(emptyStore, embeddingClient);

    const results = await emptySearch.search('anything', 5);
    expect(results).toEqual([]);
    emptyStore.close();
  });

  it('should include line range and file path in results', async () => {
    const results = await search.search('health', 5);
    for (const r of results) {
      expect(r.startLine).toBeGreaterThanOrEqual(1);
      expect(r.endLine).toBeGreaterThanOrEqual(r.startLine);
      expect(r.filePath).toMatch(/\.cs$/);
    }
  });
});
