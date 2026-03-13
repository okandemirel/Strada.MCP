import { describe, it, expect, vi } from 'vitest';
import { ContextEnrichment, type EnrichmentResult } from './context-enrichment.js';
import { BrainClient, type BrainMemoryResponse, type BrainChatResponse } from './brain-client.js';
import { BrainHealthManager } from './brain-health.js';

// Create a mock BrainClient with controllable return values
function createMockClient(overrides: {
  searchMemory?: BrainMemoryResponse;
  chat?: BrainChatResponse;
} = {}): BrainClient {
  const client = {
    healthCheck: vi.fn().mockResolvedValue({ ok: true, version: '4.1.0' }),
    searchMemory: vi.fn().mockResolvedValue(
      overrides.searchMemory ?? { ok: true, results: [] },
    ),
    chat: vi.fn().mockResolvedValue(
      overrides.chat ?? { ok: true, response: '' },
    ),
  } as unknown as BrainClient;
  return client;
}

function createMockHealthManager(connected: boolean): BrainHealthManager {
  return {
    isConnected: () => connected,
    getState: () => (connected ? 'connected' : 'disconnected'),
  } as unknown as BrainHealthManager;
}

describe('ContextEnrichment', () => {
  it('should return empty result when Brain is disconnected', async () => {
    const client = createMockClient();
    const health = createMockHealthManager(false);
    const enrichment = new ContextEnrichment(client, health);

    const result = await enrichment.enrichFileContext('Assets/Scripts/Health.cs');

    expect(result.available).toBe(false);
    expect(result.history).toEqual([]);
    expect(result.patterns).toEqual([]);
    expect(result.relatedContext).toEqual([]);
    // Should NOT call Brain API when disconnected
    expect(client.searchMemory).not.toHaveBeenCalled();
  });

  it('should fetch file history from Brain memory when connected', async () => {
    const client = createMockClient({
      searchMemory: {
        ok: true,
        results: [
          { content: 'Health.cs was refactored to use IComponent pattern', score: 0.9, source: 'memory' },
          { content: 'HealthSystem added regeneration in v2', score: 0.8, source: 'memory' },
        ],
      },
    });
    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(client, health);

    const result = await enrichment.enrichFileContext('Assets/Scripts/Health.cs');

    expect(result.available).toBe(true);
    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toContain('IComponent pattern');
    expect(client.searchMemory).toHaveBeenCalledWith(
      expect.stringContaining('Health.cs'),
      expect.any(Number),
    );
  });

  it('should fetch codebase patterns from Brain', async () => {
    const client = createMockClient({
      searchMemory: {
        ok: true,
        results: [
          { content: 'Pattern: All components must implement IComponent', score: 0.95, source: 'memory' },
          { content: 'Pattern: Systems use ForEach<T> for iteration', score: 0.88, source: 'memory' },
        ],
      },
    });
    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(client, health);

    const result = await enrichment.enrichPatterns('Strada ECS patterns');

    expect(result.available).toBe(true);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('should fetch related context for a query', async () => {
    const client = createMockClient({
      searchMemory: {
        ok: true,
        results: [
          { content: 'Health regeneration uses Timer service', score: 0.9, source: 'memory' },
        ],
      },
    });
    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(client, health);

    const result = await enrichment.enrichQuery('How does health regeneration work?');

    expect(result.available).toBe(true);
    expect(result.relatedContext).toHaveLength(1);
    expect(result.relatedContext[0]).toContain('Timer service');
  });

  it('should handle Brain API errors gracefully (no throw)', async () => {
    const client = createMockClient({
      searchMemory: { ok: false, error: 'Internal server error' },
    });
    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(client, health);

    const result = await enrichment.enrichFileContext('Assets/Scripts/Health.cs');

    // Should not throw, should return degraded result
    expect(result.available).toBe(false);
    expect(result.history).toEqual([]);
    expect(result.error).toContain('Internal server error');
  });

  it('should respect timeout for enrichment calls', async () => {
    const slowClient = {
      healthCheck: vi.fn().mockResolvedValue({ ok: true }),
      searchMemory: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, results: [] }), 5000)),
      ),
      chat: vi.fn().mockResolvedValue({ ok: true, response: '' }),
    } as unknown as BrainClient;

    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(slowClient, health, { timeoutMs: 100 });

    const result = await enrichment.enrichFileContext('Health.cs');

    // Should timeout and return degraded result
    expect(result.available).toBe(false);
  });

  it('should cache enrichment results for the same file within TTL', async () => {
    const client = createMockClient({
      searchMemory: {
        ok: true,
        results: [
          { content: 'Cached result', score: 0.9, source: 'memory' },
        ],
      },
    });
    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(client, health, { cacheTtlMs: 5000 });

    // First call — hits Brain
    await enrichment.enrichFileContext('Health.cs');
    // Second call — should use cache
    await enrichment.enrichFileContext('Health.cs');

    expect(client.searchMemory).toHaveBeenCalledTimes(1);
  });

  it('should not cache failed results', async () => {
    let callCount = 0;
    const client = {
      healthCheck: vi.fn().mockResolvedValue({ ok: true }),
      searchMemory: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, error: 'Temporary error' });
        }
        return Promise.resolve({
          ok: true,
          results: [{ content: 'Success', score: 0.9, source: 'memory' }],
        });
      }),
      chat: vi.fn().mockResolvedValue({ ok: true, response: '' }),
    } as unknown as BrainClient;

    const health = createMockHealthManager(true);
    const enrichment = new ContextEnrichment(client, health, { cacheTtlMs: 5000 });

    const result1 = await enrichment.enrichFileContext('Health.cs');
    expect(result1.available).toBe(false);

    const result2 = await enrichment.enrichFileContext('Health.cs');
    expect(result2.available).toBe(true);
    expect(client.searchMemory).toHaveBeenCalledTimes(2);
  });
});
