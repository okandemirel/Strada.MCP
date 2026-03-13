export interface BrainClientOptions {
  /** Brain HTTP base URL (e.g. http://localhost:3000) */
  baseUrl: string;
  /** API key for authentication (sent as Bearer token) */
  apiKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum number of retries on failure (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseRetryDelayMs?: number;
  /** Maximum delay between retries in ms (default: 30000) */
  maxRetryDelayMs?: number;
}

export interface BrainHealthResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface BrainChatResponse {
  ok: boolean;
  response?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface BrainMemorySearchResult {
  content: string;
  score: number;
  source: string;
}

export interface BrainMemoryResponse {
  ok: boolean;
  results?: BrainMemorySearchResult[];
  error?: string;
}

export interface BrainChatContext {
  filePath?: string;
  projectName?: string;
  [key: string]: unknown;
}

/**
 * HTTP client for Strada.Brain web API.
 *
 * All methods return typed result objects and never throw.
 * Network errors, timeouts, and HTTP errors are captured in
 * the `error` field with `ok: false`.
 *
 * Retry logic uses exponential backoff: baseDelay * 2^attempt,
 * capped at maxRetryDelay. Retries only on 5xx and network errors,
 * not on 4xx client errors.
 */
export class BrainClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(options: BrainClientOptions) {
    // Strip trailing slash from base URL
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;
  }

  /**
   * GET /api/health — Check if Brain is reachable.
   */
  async healthCheck(): Promise<BrainHealthResult> {
    const result = await this.request<{ status: string; version: string }>(
      'GET',
      '/api/health',
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      version: result.data?.version,
    };
  }

  /**
   * POST /api/chat — Send a message to Brain and get an AI response.
   */
  async chat(message: string, context?: BrainChatContext): Promise<BrainChatResponse> {
    const body: Record<string, unknown> = { message };
    if (context) {
      body.context = context;
    }

    const result = await this.request<{ response: string; metadata?: Record<string, unknown> }>(
      'POST',
      '/api/chat',
      body,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      response: result.data?.response,
      metadata: result.data?.metadata,
    };
  }

  /**
   * POST /api/memory/search — Search Brain's memory for relevant context.
   */
  async searchMemory(query: string, limit: number = 10): Promise<BrainMemoryResponse> {
    const result = await this.request<{ results: BrainMemorySearchResult[] }>(
      'POST',
      '/api/memory/search',
      { query, limit },
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      results: result.data?.results ?? [],
    };
  }

  /**
   * Generic HTTP request with retry and timeout.
   * Never throws — returns { ok: false, error } on failure.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: T; error?: string }> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body && method !== 'GET') {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timer);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const errorMsg = `HTTP ${response.status}: ${errorText}`;

          // Only retry on 5xx server errors
          if (response.status >= 500 && attempt < this.maxRetries) {
            await this.backoff(attempt);
            continue;
          }

          return { ok: false, error: errorMsg };
        }

        const data = (await response.json()) as T;
        return { ok: true, data };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Retry on network errors (not on abort/timeout on last attempt)
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }

        return { ok: false, error: errorMsg };
      }
    }

    return { ok: false, error: 'Max retries exceeded' };
  }

  /**
   * Exponential backoff: baseDelay * 2^attempt, capped at maxRetryDelay.
   */
  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(
      this.baseRetryDelayMs * Math.pow(2, attempt),
      this.maxRetryDelayMs,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
