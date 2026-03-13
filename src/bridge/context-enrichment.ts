import { BrainClient } from './brain-client.js';
import { BrainHealthManager } from './brain-health.js';

export interface EnrichmentResult {
  /** Whether Brain enrichment was available and successful */
  available: boolean;
  /** File-specific history from Brain's memory */
  history: string[];
  /** Learned patterns about the codebase */
  patterns: string[];
  /** Related context from previous conversations */
  relatedContext: string[];
  /** Error message if enrichment failed */
  error?: string;
}

export interface ContextEnrichmentOptions {
  /** Timeout for individual enrichment calls in ms (default: 5000) */
  timeoutMs?: number;
  /** Cache TTL in ms (default: 30000) */
  cacheTtlMs?: number;
  /** Maximum number of memory results to fetch (default: 5) */
  maxResults?: number;
}

interface CacheEntry {
  result: EnrichmentResult;
  timestamp: number;
}

/**
 * Enriches tool context with intelligence from Strada.Brain.
 *
 * When Brain is connected:
 *   - Fetches file-specific history from Brain's memory
 *   - Pulls learned codebase patterns
 *   - Retrieves related context from previous conversations
 *
 * When Brain is disconnected:
 *   - Returns empty results immediately (zero latency)
 *   - No API calls are made
 *
 * Results are cached per-key with configurable TTL to avoid
 * redundant Brain API calls for the same file/query.
 */
export class ContextEnrichment {
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxResults: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly client: BrainClient,
    private readonly healthManager: BrainHealthManager,
    options: ContextEnrichmentOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
    this.maxResults = options.maxResults ?? 5;
  }

  /**
   * Enrich context for a specific file path.
   * Fetches file history and related patterns from Brain.
   */
  async enrichFileContext(filePath: string): Promise<EnrichmentResult> {
    if (!this.healthManager.isConnected()) {
      return this.emptyResult();
    }

    const cacheKey = `file:${filePath}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.withTimeout(async () => {
        const memoryResult = await this.client.searchMemory(
          `file history: ${filePath}`,
          this.maxResults,
        );

        if (!memoryResult.ok) {
          return {
            available: false,
            history: [],
            patterns: [],
            relatedContext: [],
            error: memoryResult.error,
          } satisfies EnrichmentResult;
        }

        const history = (memoryResult.results ?? []).map((r) => r.content);

        return {
          available: true,
          history,
          patterns: [],
          relatedContext: [],
        } satisfies EnrichmentResult;
      });

      if (result.available) {
        this.setCache(cacheKey, result);
      }

      return result;
    } catch (err) {
      return {
        available: false,
        history: [],
        patterns: [],
        relatedContext: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Fetch learned codebase patterns from Brain.
   */
  async enrichPatterns(query: string): Promise<EnrichmentResult> {
    if (!this.healthManager.isConnected()) {
      return this.emptyResult();
    }

    const cacheKey = `patterns:${query}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.withTimeout(async () => {
        const memoryResult = await this.client.searchMemory(
          `codebase patterns: ${query}`,
          this.maxResults,
        );

        if (!memoryResult.ok) {
          return {
            available: false,
            history: [],
            patterns: [],
            relatedContext: [],
            error: memoryResult.error,
          } satisfies EnrichmentResult;
        }

        const patterns = (memoryResult.results ?? []).map((r) => r.content);

        return {
          available: true,
          history: [],
          patterns,
          relatedContext: [],
        } satisfies EnrichmentResult;
      });

      if (result.available) {
        this.setCache(cacheKey, result);
      }

      return result;
    } catch (err) {
      return {
        available: false,
        history: [],
        patterns: [],
        relatedContext: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Fetch related context for a natural language query.
   */
  async enrichQuery(query: string): Promise<EnrichmentResult> {
    if (!this.healthManager.isConnected()) {
      return this.emptyResult();
    }

    const cacheKey = `query:${query}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.withTimeout(async () => {
        const memoryResult = await this.client.searchMemory(query, this.maxResults);

        if (!memoryResult.ok) {
          return {
            available: false,
            history: [],
            patterns: [],
            relatedContext: [],
            error: memoryResult.error,
          } satisfies EnrichmentResult;
        }

        const relatedContext = (memoryResult.results ?? []).map((r) => r.content);

        return {
          available: true,
          history: [],
          patterns: [],
          relatedContext,
        } satisfies EnrichmentResult;
      });

      if (result.available) {
        this.setCache(cacheKey, result);
      }

      return result;
    } catch (err) {
      return {
        available: false,
        history: [],
        patterns: [],
        relatedContext: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Clear the enrichment cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  private emptyResult(): EnrichmentResult {
    return {
      available: false,
      history: [],
      patterns: [],
      relatedContext: [],
    };
  }

  private getCached(key: string): EnrichmentResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  private setCache(key: string, result: EnrichmentResult): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Execute an async function with a timeout.
   * Rejects with an error if the timeout is exceeded.
   */
  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Enrichment timeout')), this.timeoutMs),
      ),
    ]);
  }
}
