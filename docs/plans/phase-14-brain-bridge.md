# Phase 14: Brain Bridge

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect Strada.MCP to Strada.Brain for enhanced intelligence. When Brain is reachable, MCP merges Brain's memory search results with local HNSW results and enriches context with project history. When Brain is unreachable, MCP continues fully independently with zero degradation.

**Architecture:** HTTP client communicates with Brain's web API (POST /api/chat, POST /api/memory/search, GET /api/health). A health manager monitors connectivity with periodic heartbeats. The RAG result merger interleaves local + Brain results by score. Context enrichment pulls project history and learned patterns from Brain's memory.

**Tech Stack:** TypeScript, zod, node:http/fetch, node:timers, EventEmitter

**Depends on:** Phase 6 (RAG pipeline — VectorStore, HybridSearch, RagManager)

**Parallel with:** Phase 13 (Resources + Prompts)

**New tools:** 0 (infrastructure integration only)

---

### Task 1: Brain HTTP Client with retry logic

**Files:**
- Create: `src/bridge/brain-client.ts`
- Create: `src/bridge/brain-client.test.ts`

The Brain HTTP client wraps all communication with Strada.Brain's web API. It handles authentication (BRAIN_API_KEY), request timeouts, and exponential backoff retry (1s, 2s, 4s, max 30s). All methods return typed results and never throw on network errors — they return error results for graceful degradation.

**Step 1: Write the failing test**

```typescript
// src/bridge/brain-client.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrainClient, type BrainClientOptions, type BrainChatResponse, type BrainMemoryResult } from './brain-client.js';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

/** Starts a local HTTP server that returns canned responses. */
function createMockBrainServer(handlers: Record<string, (req: IncomingMessage, res: ServerResponse) => void>): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const handler = handlers[`${req.method} ${req.url}`];
      if (handler) {
        handler(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

describe('BrainClient', () => {
  let mockServer: Server;
  let mockPort: number;

  afterEach(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('should perform health check against GET /api/health', async () => {
    const setup = await createMockBrainServer({
      'GET /api/health': (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 5000,
    });

    const result = await client.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.version).toBe('4.1.0');
  });

  it('should send chat message via POST /api/chat', async () => {
    const setup = await createMockBrainServer({
      'POST /api/chat': async (req, res) => {
        const body = JSON.parse(await collectBody(req));
        expect(body.message).toBe('Explain HealthSystem');
        expect(req.headers['authorization']).toBe('Bearer test-key');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: 'HealthSystem manages entity health...',
          metadata: { tokensUsed: 150 },
        }));
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 5000,
    });

    const result = await client.chat('Explain HealthSystem');
    expect(result.ok).toBe(true);
    expect(result.response).toBe('HealthSystem manages entity health...');
  });

  it('should search memory via POST /api/memory/search', async () => {
    const setup = await createMockBrainServer({
      'POST /api/memory/search': async (req, res) => {
        const body = JSON.parse(await collectBody(req));
        expect(body.query).toBe('health component');
        expect(body.limit).toBe(5);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          results: [
            { content: 'Health is an IComponent struct', score: 0.92, source: 'memory' },
            { content: 'HealthSystem extends SystemBase', score: 0.87, source: 'memory' },
          ],
        }));
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 5000,
    });

    const result = await client.searchMemory('health component', 5);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results![0].score).toBe(0.92);
  });

  it('should include Authorization header with API key', async () => {
    let receivedAuth = '';
    const setup = await createMockBrainServer({
      'GET /api/health': (req, res) => {
        receivedAuth = req.headers['authorization'] ?? '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'my-secret-key',
      timeoutMs: 5000,
    });

    await client.healthCheck();
    expect(receivedAuth).toBe('Bearer my-secret-key');
  });

  it('should return error result on connection refused (no throw)', async () => {
    const client = new BrainClient({
      baseUrl: 'http://127.0.0.1:19999', // Nothing listening
      apiKey: 'test-key',
      timeoutMs: 2000,
      maxRetries: 0, // No retries for fast test
    });

    const result = await client.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error result on HTTP 500', async () => {
    const setup = await createMockBrainServer({
      'GET /api/health': (_req, res) => {
        res.writeHead(500);
        res.end('Internal Server Error');
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 5000,
      maxRetries: 0,
    });

    const result = await client.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('should timeout on slow responses', async () => {
    const setup = await createMockBrainServer({
      'GET /api/health': (_req, res) => {
        // Never respond — let it timeout
        setTimeout(() => {
          res.writeHead(200);
          res.end('{}');
        }, 10000);
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 500, // Very short timeout
      maxRetries: 0,
    });

    const result = await client.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout|abort/i);
  });

  it('should retry with exponential backoff on failure', async () => {
    let attemptCount = 0;
    const setup = await createMockBrainServer({
      'GET /api/health': (_req, res) => {
        attemptCount++;
        if (attemptCount < 3) {
          res.writeHead(503);
          res.end('Service Unavailable');
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
        }
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 5000,
      maxRetries: 3,
      baseRetryDelayMs: 50, // Fast retries for test
      maxRetryDelayMs: 200,
    });

    const result = await client.healthCheck();
    expect(result.ok).toBe(true);
    expect(attemptCount).toBe(3);
  });

  it('should skip API key header when apiKey is empty', async () => {
    let receivedHeaders: Record<string, string | string[] | undefined> = {};
    const setup = await createMockBrainServer({
      'GET /api/health': (req, res) => {
        receivedHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: '',
      timeoutMs: 5000,
    });

    await client.healthCheck();
    expect(receivedHeaders['authorization']).toBeUndefined();
  });

  it('should pass context to chat requests', async () => {
    let receivedBody: Record<string, unknown> = {};
    const setup = await createMockBrainServer({
      'POST /api/chat': async (req, res) => {
        receivedBody = JSON.parse(await collectBody(req));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response: 'ok' }));
      },
    });
    mockServer = setup.server;
    mockPort = setup.port;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${mockPort}`,
      apiKey: 'test-key',
      timeoutMs: 5000,
    });

    await client.chat('What does HealthSystem do?', {
      filePath: 'Assets/Scripts/Health.cs',
      projectName: 'MyGame',
    });

    expect(receivedBody.message).toBe('What does HealthSystem do?');
    expect(receivedBody.context).toEqual({
      filePath: 'Assets/Scripts/Health.cs',
      projectName: 'MyGame',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/brain-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/brain-client.ts

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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/brain-client.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add src/bridge/brain-client.ts src/bridge/brain-client.test.ts
git commit -m "feat: add Brain HTTP client with retry and exponential backoff"
```

---

### Task 2: Brain Health Manager — heartbeat and connection state

**Files:**
- Create: `src/bridge/brain-health.ts`
- Create: `src/bridge/brain-health.test.ts`

The health manager monitors Brain connectivity. It performs a health check on startup, then runs a periodic heartbeat (configurable interval, default 60s). It maintains a connection state machine (disconnected -> connected -> error) and emits events on state changes so other components can react.

**Step 1: Write the failing test**

```typescript
// src/bridge/brain-health.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrainHealthManager, type BrainConnectionState } from './brain-health.js';
import { BrainClient } from './brain-client.js';
import { createServer, type Server } from 'node:http';

function createHealthServer(healthy: boolean): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      if (healthy) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
      } else {
        res.writeHead(503);
        res.end('Unavailable');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('BrainHealthManager', () => {
  let mockServer: Server;
  let manager: BrainHealthManager;

  afterEach(async () => {
    manager?.stop();
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('should start with "disconnected" state', () => {
    const client = new BrainClient({
      baseUrl: 'http://127.0.0.1:19999',
      apiKey: '',
      timeoutMs: 1000,
      maxRetries: 0,
    });
    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 60000 });
    expect(manager.getState()).toBe('disconnected');
    expect(manager.isConnected()).toBe(false);
  });

  it('should transition to "connected" after successful health check', async () => {
    const { server, port } = await createHealthServer(true);
    mockServer = server;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: '',
      timeoutMs: 5000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 60000 });

    const stateChanges: BrainConnectionState[] = [];
    manager.on('stateChange', (state: BrainConnectionState) => stateChanges.push(state));

    await manager.checkNow();

    expect(manager.getState()).toBe('connected');
    expect(manager.isConnected()).toBe(true);
    expect(stateChanges).toContain('connected');
  });

  it('should transition to "error" when health check fails', async () => {
    const { server, port } = await createHealthServer(false);
    mockServer = server;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: '',
      timeoutMs: 5000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 60000 });
    await manager.checkNow();

    expect(manager.getState()).toBe('error');
    expect(manager.isConnected()).toBe(false);
  });

  it('should transition from "connected" to "disconnected" on failure', async () => {
    const { server, port } = await createHealthServer(true);
    mockServer = server;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: '',
      timeoutMs: 2000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 60000 });
    await manager.checkNow();
    expect(manager.getState()).toBe('connected');

    // Kill the server — next check should fail
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));

    await manager.checkNow();
    expect(manager.getState()).toBe('disconnected');
    expect(manager.isConnected()).toBe(false);
  });

  it('should emit "stateChange" only when state actually changes', async () => {
    const { server, port } = await createHealthServer(true);
    mockServer = server;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: '',
      timeoutMs: 5000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 60000 });

    const stateChanges: BrainConnectionState[] = [];
    manager.on('stateChange', (state: BrainConnectionState) => stateChanges.push(state));

    await manager.checkNow(); // disconnected -> connected
    await manager.checkNow(); // connected -> connected (no change)
    await manager.checkNow(); // connected -> connected (no change)

    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0]).toBe('connected');
  });

  it('should run periodic heartbeat and detect recovery', async () => {
    let healthy = false;
    const setup = await new Promise<{ server: Server; port: number }>((resolve) => {
      const server = createServer((_req, res) => {
        if (healthy) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
        } else {
          res.writeHead(503);
          res.end('Unavailable');
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({ server, port });
      });
    });
    mockServer = setup.server;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
      apiKey: '',
      timeoutMs: 2000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 100 }); // Fast heartbeat for test

    const stateChanges: BrainConnectionState[] = [];
    manager.on('stateChange', (state: BrainConnectionState) => stateChanges.push(state));

    manager.start();

    // Wait for first heartbeat — should be error/disconnected
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(manager.isConnected()).toBe(false);

    // Flip to healthy — heartbeat should detect recovery
    healthy = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(manager.isConnected()).toBe(true);

    manager.stop();
    expect(stateChanges).toContain('connected');
  });

  it('should expose Brain version after successful health check', async () => {
    const { server, port } = await createHealthServer(true);
    mockServer = server;

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: '',
      timeoutMs: 5000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 60000 });
    await manager.checkNow();

    expect(manager.getBrainVersion()).toBe('4.1.0');
  });

  it('should stop heartbeat cleanly', () => {
    const client = new BrainClient({
      baseUrl: 'http://127.0.0.1:19999',
      apiKey: '',
      timeoutMs: 1000,
      maxRetries: 0,
    });

    manager = new BrainHealthManager(client, { heartbeatIntervalMs: 100 });
    manager.start();
    manager.stop();

    // Should not throw and state should be preserved
    expect(manager.getState()).toBe('disconnected');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/brain-health.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/brain-health.ts
import { EventEmitter } from 'node:events';
import { BrainClient } from './brain-client.js';

export type BrainConnectionState = 'disconnected' | 'connected' | 'error';

export interface BrainHealthOptions {
  /** Interval between heartbeat health checks in ms (default: 60000) */
  heartbeatIntervalMs?: number;
}

/**
 * Monitors Brain connectivity with periodic heartbeats.
 *
 * State machine:
 *   disconnected --[health ok]--> connected
 *   connected --[health fail]--> disconnected
 *   disconnected --[health fail]--> error
 *   error --[health ok]--> connected
 *   error --[health fail]--> error (no event)
 *
 * Emits:
 *   'stateChange' (newState: BrainConnectionState) — only when state changes
 */
export class BrainHealthManager extends EventEmitter {
  private state: BrainConnectionState = 'disconnected';
  private brainVersion: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly client: BrainClient,
    options: BrainHealthOptions = {},
  ) {
    super();
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60_000;
  }

  /**
   * Current connection state.
   */
  getState(): BrainConnectionState {
    return this.state;
  }

  /**
   * Whether Brain is currently reachable.
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Brain version string from last successful health check.
   */
  getBrainVersion(): string | null {
    return this.brainVersion;
  }

  /**
   * Perform an immediate health check and update state.
   */
  async checkNow(): Promise<BrainConnectionState> {
    const result = await this.client.healthCheck();

    if (result.ok) {
      this.brainVersion = result.version ?? null;
      this.setState('connected');
    } else {
      // Transition: connected -> disconnected, disconnected -> error
      if (this.state === 'connected') {
        this.setState('disconnected');
      } else if (this.state === 'disconnected') {
        this.setState('error');
      }
      // error -> error: no state change event
    }

    return this.state;
  }

  /**
   * Start periodic heartbeat.
   */
  start(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(async () => {
      await this.checkNow();
    }, this.heartbeatIntervalMs);

    // Run first check immediately
    void this.checkNow();
  }

  /**
   * Stop periodic heartbeat.
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(newState: BrainConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.emit('stateChange', newState);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/brain-health.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/bridge/brain-health.ts src/bridge/brain-health.test.ts
git commit -m "feat: add Brain health manager with heartbeat and state machine"
```

---

### Task 3: RAG Result Merger — dual-source search

**Files:**
- Create: `src/intelligence/rag/result-merger.ts`
- Create: `src/intelligence/rag/result-merger.test.ts`

The result merger combines local HNSW search results with Brain memory search results. When Brain is connected, it runs both searches in parallel, interleaves results by score, deduplicates by file path, and caps to the requested limit. When Brain is disconnected, it passes through local results only with zero overhead.

**Step 1: Write the failing test**

```typescript
// src/intelligence/rag/result-merger.test.ts
import { describe, it, expect } from 'vitest';
import {
  ResultMerger,
  type MergedSearchResult,
  type LocalSearchResult,
  type BrainSearchResult,
} from './result-merger.js';

function makeLocalResult(name: string, score: number, filePath: string): LocalSearchResult {
  return {
    source: 'local',
    score,
    filePath,
    name,
    namespace: 'Game',
    type: 'class',
    parentClass: undefined,
    startLine: 1,
    endLine: 20,
    snippet: `public class ${name} { }`,
  };
}

function makeBrainResult(content: string, score: number, source: string = 'memory'): BrainSearchResult {
  return {
    source: 'brain',
    content,
    score,
    brainSource: source,
  };
}

describe('ResultMerger', () => {
  const merger = new ResultMerger();

  it('should return local-only results when no brain results', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Health.cs'),
      makeLocalResult('MovementSystem', 0.7, 'Movement.cs'),
    ];

    const merged = merger.merge(local, [], 10);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('local');
    expect(merged[0].name).toBe('HealthSystem');
  });

  it('should interleave local and brain results by score', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Health.cs'),
      makeLocalResult('MovementSystem', 0.5, 'Movement.cs'),
    ];

    const brain: BrainSearchResult[] = [
      makeBrainResult('Health is an IComponent for entity HP', 0.85),
      makeBrainResult('Movement handles velocity updates', 0.4),
    ];

    const merged = merger.merge(local, brain, 10);
    expect(merged).toHaveLength(4);
    // Should be sorted by score descending
    expect(merged[0].score).toBe(0.9);
    expect(merged[1].score).toBe(0.85);
    expect(merged[2].score).toBe(0.5);
    expect(merged[3].score).toBe(0.4);
  });

  it('should cap results at the requested limit', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('A', 0.9, 'a.cs'),
      makeLocalResult('B', 0.8, 'b.cs'),
      makeLocalResult('C', 0.7, 'c.cs'),
    ];
    const brain: BrainSearchResult[] = [
      makeBrainResult('D content', 0.85),
      makeBrainResult('E content', 0.75),
    ];

    const merged = merger.merge(local, brain, 3);
    expect(merged).toHaveLength(3);
    expect(merged[0].score).toBe(0.9);
    expect(merged[1].score).toBe(0.85);
    expect(merged[2].score).toBe(0.8);
  });

  it('should deduplicate by file path (local wins over brain)', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Assets/Scripts/Health.cs'),
    ];

    const brain: BrainSearchResult[] = [
      {
        source: 'brain',
        content: 'HealthSystem handles HP',
        score: 0.95,
        brainSource: 'memory',
        filePath: 'Assets/Scripts/Health.cs', // Same file path
      },
    ];

    const merged = merger.merge(local, brain, 10);
    // Should deduplicate: keep the local version (higher detail)
    const healthResults = merged.filter(
      (r) => r.filePath === 'Assets/Scripts/Health.cs',
    );
    expect(healthResults).toHaveLength(1);
    expect(healthResults[0].source).toBe('local');
  });

  it('should handle empty local results', () => {
    const brain: BrainSearchResult[] = [
      makeBrainResult('Some memory content', 0.8),
    ];

    const merged = merger.merge([], brain, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('brain');
  });

  it('should handle both empty', () => {
    const merged = merger.merge([], [], 10);
    expect(merged).toEqual([]);
  });

  it('should preserve metadata from local results', () => {
    const local: LocalSearchResult[] = [
      makeLocalResult('HealthSystem', 0.9, 'Health.cs'),
    ];

    const merged = merger.merge(local, [], 10);
    expect(merged[0].name).toBe('HealthSystem');
    expect(merged[0].namespace).toBe('Game');
    expect(merged[0].type).toBe('class');
    expect(merged[0].startLine).toBe(1);
    expect(merged[0].endLine).toBe(20);
  });

  it('should preserve content from brain results', () => {
    const brain: BrainSearchResult[] = [
      makeBrainResult('Detailed memory about combat system', 0.85),
    ];

    const merged = merger.merge([], brain, 10);
    expect(merged[0].snippet).toBe('Detailed memory about combat system');
    expect(merged[0].brainSource).toBe('memory');
  });

  it('should normalize brain scores to 0-1 range', () => {
    const brain: BrainSearchResult[] = [
      makeBrainResult('Result with high raw score', 1.5),
      makeBrainResult('Result with negative score', -0.2),
    ];

    const merged = merger.merge([], brain, 10);
    for (const result of merged) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/intelligence/rag/result-merger.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/intelligence/rag/result-merger.ts

export interface LocalSearchResult {
  source: 'local';
  score: number;
  filePath: string;
  name: string;
  namespace: string;
  type: string;
  parentClass?: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export interface BrainSearchResult {
  source: 'brain';
  content: string;
  score: number;
  brainSource: string;
  /** Optional file path for deduplication */
  filePath?: string;
}

export interface MergedSearchResult {
  source: 'local' | 'brain';
  score: number;
  filePath?: string;
  name?: string;
  namespace?: string;
  type?: string;
  parentClass?: string;
  startLine?: number;
  endLine?: number;
  snippet: string;
  brainSource?: string;
}

/**
 * Merges local HNSW search results with Brain memory search results.
 *
 * Merge strategy:
 * 1. Normalize all scores to 0-1 range
 * 2. Deduplicate by file path (local wins — has richer metadata)
 * 3. Sort by score descending
 * 4. Cap at requested limit
 */
export class ResultMerger {
  /**
   * Merge local and brain results into a single ranked list.
   *
   * @param local - Results from local HNSW vector store
   * @param brain - Results from Brain memory search
   * @param limit - Maximum number of results to return
   * @returns Merged, deduplicated, score-sorted results
   */
  merge(
    local: LocalSearchResult[],
    brain: BrainSearchResult[],
    limit: number,
  ): MergedSearchResult[] {
    // Convert local results to merged format
    const localMerged: MergedSearchResult[] = local.map((r) => ({
      source: 'local' as const,
      score: this.clampScore(r.score),
      filePath: r.filePath,
      name: r.name,
      namespace: r.namespace,
      type: r.type,
      parentClass: r.parentClass,
      startLine: r.startLine,
      endLine: r.endLine,
      snippet: r.snippet,
    }));

    // Convert brain results to merged format
    const brainMerged: MergedSearchResult[] = brain.map((r) => ({
      source: 'brain' as const,
      score: this.clampScore(r.score),
      filePath: r.filePath,
      snippet: r.content,
      brainSource: r.brainSource,
    }));

    // Deduplicate by file path (local wins)
    const localFilePaths = new Set(
      localMerged
        .filter((r) => r.filePath)
        .map((r) => r.filePath),
    );

    const dedupedBrain = brainMerged.filter(
      (r) => !r.filePath || !localFilePaths.has(r.filePath),
    );

    // Combine, sort by score, and cap
    const all = [...localMerged, ...dedupedBrain];
    all.sort((a, b) => b.score - a.score);

    return all.slice(0, limit);
  }

  /**
   * Clamp score to valid 0-1 range.
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/intelligence/rag/result-merger.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add src/intelligence/rag/result-merger.ts src/intelligence/rag/result-merger.test.ts
git commit -m "feat: add RAG result merger for dual-source local+Brain search"
```

---

### Task 4: Context Enrichment — project history from Brain

**Files:**
- Create: `src/bridge/context-enrichment.ts`
- Create: `src/bridge/context-enrichment.test.ts`

Context enrichment pulls additional intelligence from Brain when connected: project history, previous conversation context for specific files, and Brain's learned patterns about the codebase. This enrichment is used to provide better context to tools and the MCP host. When Brain is disconnected, enrichment returns empty results with zero latency.

**Step 1: Write the failing test**

```typescript
// src/bridge/context-enrichment.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/context-enrichment.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/context-enrichment.ts
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/context-enrichment.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/bridge/context-enrichment.ts src/bridge/context-enrichment.test.ts
git commit -m "feat: add context enrichment with Brain memory integration and caching"
```

---

### Task 5: Brain Manager — lifecycle and integration

**Files:**
- Create: `src/bridge/brain-manager.ts`
- Create: `src/bridge/brain-manager.test.ts`

The Brain Manager is the top-level integration point. It initializes the BrainClient, BrainHealthManager, ContextEnrichment, and ResultMerger. It wires the result merger into the RAG manager for dual-source search. It exposes `isConnected()` for the MCP server status and handles clean shutdown.

**Step 1: Write the failing test**

```typescript
// src/bridge/brain-manager.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrainManager, type BrainManagerOptions } from './brain-manager.js';
import { createServer, type Server } from 'node:http';

function createMockBrainApi(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
        return;
      }
      if (req.url === '/api/memory/search') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: [] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('BrainManager', () => {
  let mockServer: Server;
  let manager: BrainManager;

  afterEach(async () => {
    manager?.shutdown();
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('should be disabled when brainUrl is empty', () => {
    manager = new BrainManager({ brainUrl: '', brainApiKey: '' });
    expect(manager.isEnabled()).toBe(false);
    expect(manager.isConnected()).toBe(false);
  });

  it('should initialize and connect to Brain', async () => {
    const { server, port } = await createMockBrainApi();
    mockServer = server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${port}`,
      brainApiKey: 'test-key',
      heartbeatIntervalMs: 60000,
    });

    expect(manager.isEnabled()).toBe(true);

    await manager.initialize();

    expect(manager.isConnected()).toBe(true);
    expect(manager.getBrainVersion()).toBe('4.1.0');
  });

  it('should expose client, health manager, and enrichment', async () => {
    const { server, port } = await createMockBrainApi();
    mockServer = server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${port}`,
      brainApiKey: 'test-key',
    });

    await manager.initialize();

    expect(manager.getClient()).toBeDefined();
    expect(manager.getHealthManager()).toBeDefined();
    expect(manager.getEnrichment()).toBeDefined();
    expect(manager.getResultMerger()).toBeDefined();
  });

  it('should handle initialization when Brain is unreachable', async () => {
    manager = new BrainManager({
      brainUrl: 'http://127.0.0.1:19999',
      brainApiKey: 'test-key',
      timeoutMs: 1000,
      maxRetries: 0,
    });

    // Should not throw — graceful degradation
    await manager.initialize();

    expect(manager.isEnabled()).toBe(true);
    expect(manager.isConnected()).toBe(false);
  });

  it('should shut down cleanly', async () => {
    const { server, port } = await createMockBrainApi();
    mockServer = server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${port}`,
      brainApiKey: 'test-key',
    });

    await manager.initialize();
    expect(manager.isConnected()).toBe(true);

    manager.shutdown();
    // After shutdown, health manager should be stopped
    expect(manager.isConnected()).toBe(false);
  });

  it('should emit connection state changes', async () => {
    const { server, port } = await createMockBrainApi();
    mockServer = server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${port}`,
      brainApiKey: 'test-key',
    });

    const events: string[] = [];
    manager.on('brainStateChange', (state: string) => events.push(state));

    await manager.initialize();

    expect(events).toContain('connected');
  });

  it('should provide status summary', async () => {
    const { server, port } = await createMockBrainApi();
    mockServer = server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${port}`,
      brainApiKey: 'test-key',
    });

    await manager.initialize();
    const status = manager.getStatus();

    expect(status.enabled).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.brainVersion).toBe('4.1.0');
    expect(status.brainUrl).toBe(`http://127.0.0.1:${port}`);
  });

  it('should provide status summary when disabled', () => {
    manager = new BrainManager({ brainUrl: '', brainApiKey: '' });
    const status = manager.getStatus();

    expect(status.enabled).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.brainVersion).toBeNull();
  });

  it('should not start heartbeat when disabled', () => {
    manager = new BrainManager({ brainUrl: '', brainApiKey: '' });
    // Calling initialize on disabled manager should be a no-op
    expect(manager.isEnabled()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/brain-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/brain-manager.ts
import { EventEmitter } from 'node:events';
import { BrainClient, type BrainClientOptions } from './brain-client.js';
import { BrainHealthManager, type BrainConnectionState } from './brain-health.js';
import { ContextEnrichment, type ContextEnrichmentOptions } from './context-enrichment.js';
import { ResultMerger } from '../intelligence/rag/result-merger.js';

export interface BrainManagerOptions {
  /** Brain HTTP base URL (empty string = disabled) */
  brainUrl: string;
  /** API key for Brain authentication */
  brainApiKey: string;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** Heartbeat interval in ms (default: 60000) */
  heartbeatIntervalMs?: number;
  /** Max retries on failure (default: 3) */
  maxRetries?: number;
  /** Base retry delay in ms (default: 1000) */
  baseRetryDelayMs?: number;
  /** Max retry delay in ms (default: 30000) */
  maxRetryDelayMs?: number;
  /** Enrichment cache TTL in ms (default: 30000) */
  enrichmentCacheTtlMs?: number;
}

export interface BrainStatus {
  enabled: boolean;
  connected: boolean;
  state: BrainConnectionState | 'disabled';
  brainVersion: string | null;
  brainUrl: string;
}

/**
 * Top-level integration manager for the Brain bridge.
 *
 * Responsibilities:
 * - Creates and owns BrainClient, BrainHealthManager, ContextEnrichment, ResultMerger
 * - Performs initial health check on initialize()
 * - Starts periodic heartbeat
 * - Forwards state change events
 * - Provides isConnected() for MCP server status
 * - Clean shutdown of all components
 *
 * When brainUrl is empty, all components are null and isEnabled() returns false.
 * The MCP server should check isEnabled() before attempting any Brain operations.
 */
export class BrainManager extends EventEmitter {
  private client: BrainClient | null = null;
  private healthManager: BrainHealthManager | null = null;
  private enrichment: ContextEnrichment | null = null;
  private resultMerger: ResultMerger | null = null;
  private readonly enabled: boolean;
  private readonly options: BrainManagerOptions;

  constructor(options: BrainManagerOptions) {
    super();
    this.options = options;
    this.enabled = Boolean(options.brainUrl && options.brainUrl.trim());
  }

  /**
   * Whether Brain integration is configured (brainUrl is set).
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Whether Brain is currently reachable.
   * Returns false if disabled or disconnected.
   */
  isConnected(): boolean {
    return this.healthManager?.isConnected() ?? false;
  }

  /**
   * Brain version from last successful health check.
   */
  getBrainVersion(): string | null {
    return this.healthManager?.getBrainVersion() ?? null;
  }

  /**
   * Initialize all Brain bridge components and perform initial health check.
   * Safe to call even when disabled (no-op).
   */
  async initialize(): Promise<void> {
    if (!this.enabled) return;

    // Create HTTP client
    this.client = new BrainClient({
      baseUrl: this.options.brainUrl,
      apiKey: this.options.brainApiKey,
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      baseRetryDelayMs: this.options.baseRetryDelayMs,
      maxRetryDelayMs: this.options.maxRetryDelayMs,
    });

    // Create health manager
    this.healthManager = new BrainHealthManager(this.client, {
      heartbeatIntervalMs: this.options.heartbeatIntervalMs,
    });

    // Forward state change events
    this.healthManager.on('stateChange', (state: BrainConnectionState) => {
      this.emit('brainStateChange', state);
    });

    // Create context enrichment
    this.enrichment = new ContextEnrichment(this.client, this.healthManager, {
      cacheTtlMs: this.options.enrichmentCacheTtlMs,
    });

    // Create result merger
    this.resultMerger = new ResultMerger();

    // Initial health check (don't throw on failure)
    await this.healthManager.checkNow();

    // Start periodic heartbeat
    this.healthManager.start();
  }

  /**
   * Stop heartbeat and release all resources.
   */
  shutdown(): void {
    if (this.healthManager) {
      this.healthManager.stop();
      this.healthManager.removeAllListeners();
    }

    if (this.enrichment) {
      this.enrichment.clearCache();
    }

    this.client = null;
    this.healthManager = null;
    this.enrichment = null;
    this.resultMerger = null;
  }

  /**
   * Get the Brain HTTP client (null if disabled).
   */
  getClient(): BrainClient | null {
    return this.client;
  }

  /**
   * Get the health manager (null if disabled).
   */
  getHealthManager(): BrainHealthManager | null {
    return this.healthManager;
  }

  /**
   * Get the context enrichment service (null if disabled).
   */
  getEnrichment(): ContextEnrichment | null {
    return this.enrichment;
  }

  /**
   * Get the result merger (null if disabled).
   */
  getResultMerger(): ResultMerger | null {
    return this.resultMerger;
  }

  /**
   * Full status summary for diagnostics.
   */
  getStatus(): BrainStatus {
    return {
      enabled: this.enabled,
      connected: this.isConnected(),
      state: this.enabled
        ? (this.healthManager?.getState() ?? 'disconnected')
        : 'disabled',
      brainVersion: this.getBrainVersion(),
      brainUrl: this.options.brainUrl,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/brain-manager.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add src/bridge/brain-manager.ts src/bridge/brain-manager.test.ts
git commit -m "feat: add Brain manager for lifecycle orchestration and integration"
```

---

### Task 6: Integration test with mock Brain server

**Files:**
- Create: `src/bridge/brain-integration.test.ts`
- Create: `src/bridge/index.ts`

End-to-end integration test that boots a mock Brain HTTP server, initializes the full Brain bridge stack, verifies health monitoring, context enrichment, result merging, state transitions, and graceful shutdown. Also creates the barrel export for the bridge module.

**Step 1: Write the integration test**

```typescript
// src/bridge/brain-integration.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { BrainManager } from './brain-manager.js';
import { ResultMerger, type LocalSearchResult, type BrainSearchResult } from '../intelligence/rag/result-merger.js';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

/** Full mock Brain API server with all endpoints */
function createFullMockBrain(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Collect body for POST requests
      let body = '';
      if (req.method === 'POST') {
        body = await new Promise<string>((r) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => r(data));
        });
      }

      // GET /api/health
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
        return;
      }

      // POST /api/chat
      if (req.method === 'POST' && req.url === '/api/chat') {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: `Brain response to: ${parsed.message}`,
          metadata: { tokensUsed: 100 },
        }));
        return;
      }

      // POST /api/memory/search
      if (req.method === 'POST' && req.url === '/api/memory/search') {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          results: [
            {
              content: `Memory result for: ${parsed.query}`,
              score: 0.88,
              source: 'memory',
            },
            {
              content: `Related pattern for: ${parsed.query}`,
              score: 0.75,
              source: 'learning',
            },
          ],
        }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('Brain Bridge Integration', () => {
  let mockServer: Server;
  let manager: BrainManager;

  afterEach(async () => {
    manager?.shutdown();
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('should perform full lifecycle: init -> health -> enrich -> search -> shutdown', async () => {
    const { server, port } = await createFullMockBrain();
    mockServer = server;

    // 1. Initialize
    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${port}`,
      brainApiKey: 'integration-test-key',
      heartbeatIntervalMs: 60000,
    });

    await manager.initialize();

    // 2. Verify connected
    expect(manager.isConnected()).toBe(true);
    expect(manager.getBrainVersion()).toBe('4.1.0');

    // 3. Context enrichment
    const enrichment = manager.getEnrichment()!;
    const fileContext = await enrichment.enrichFileContext('Assets/Scripts/Health.cs');
    expect(fileContext.available).toBe(true);
    expect(fileContext.history.length).toBeGreaterThan(0);

    const queryContext = await enrichment.enrichQuery('How does combat work?');
    expect(queryContext.available).toBe(true);
    expect(queryContext.relatedContext.length).toBeGreaterThan(0);

    // 4. Chat
    const client = manager.getClient()!;
    const chatResult = await client.chat('What is HealthSystem?');
    expect(chatResult.ok).toBe(true);
    expect(chatResult.response).toContain('Brain response to');

    // 5. Result merging (simulated)
    const merger = manager.getResultMerger()!;
    const localResults: LocalSearchResult[] = [
      {
        source: 'local',
        score: 0.9,
        filePath: 'Assets/Scripts/Health.cs',
        name: 'HealthSystem',
        namespace: 'Game.Combat',
        type: 'class',
        startLine: 1,
        endLine: 30,
        snippet: 'public class HealthSystem : SystemBase { }',
      },
    ];
    const brainResults: BrainSearchResult[] = [
      {
        source: 'brain',
        content: 'Health regeneration pattern from Brain',
        score: 0.85,
        brainSource: 'memory',
      },
    ];
    const merged = merger.merge(localResults, brainResults, 10);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('local'); // Higher score
    expect(merged[1].source).toBe('brain');

    // 6. Status check
    const status = manager.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.brainVersion).toBe('4.1.0');

    // 7. Shutdown
    manager.shutdown();
    expect(manager.isConnected()).toBe(false);
  });

  it('should work in fully disconnected mode with zero degradation', async () => {
    // Brain unreachable
    manager = new BrainManager({
      brainUrl: 'http://127.0.0.1:19999',
      brainApiKey: 'test-key',
      timeoutMs: 500,
      maxRetries: 0,
    });

    await manager.initialize();

    expect(manager.isEnabled()).toBe(true);
    expect(manager.isConnected()).toBe(false);

    // Enrichment should return empty instantly
    const enrichment = manager.getEnrichment()!;
    const start = Date.now();
    const result = await enrichment.enrichFileContext('Health.cs');
    const elapsed = Date.now() - start;

    expect(result.available).toBe(false);
    expect(result.history).toEqual([]);
    expect(elapsed).toBeLessThan(50); // Should be near-instant

    // Result merger with no brain results
    const merger = manager.getResultMerger()!;
    const localOnly: LocalSearchResult[] = [
      {
        source: 'local',
        score: 0.9,
        filePath: 'Health.cs',
        name: 'Health',
        namespace: 'Game',
        type: 'struct',
        startLine: 1,
        endLine: 10,
        snippet: 'public struct Health : IComponent { }',
      },
    ];
    const merged = merger.merge(localOnly, [], 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('local');

    manager.shutdown();
  });

  it('should work when Brain integration is disabled (no URL)', () => {
    manager = new BrainManager({ brainUrl: '', brainApiKey: '' });

    expect(manager.isEnabled()).toBe(false);
    expect(manager.isConnected()).toBe(false);
    expect(manager.getClient()).toBeNull();
    expect(manager.getHealthManager()).toBeNull();
    expect(manager.getEnrichment()).toBeNull();
    expect(manager.getResultMerger()).toBeNull();

    const status = manager.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.state).toBe('disabled');
  });

  it('should detect Brain disconnection and recovery', async () => {
    let healthy = true;
    const setup = await new Promise<{ server: Server; port: number }>((resolve) => {
      const server = createServer((_req, res) => {
        if (healthy) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
        } else {
          res.writeHead(503);
          res.end('Down');
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({ server, port });
      });
    });
    mockServer = setup.server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${setup.port}`,
      brainApiKey: 'test-key',
      heartbeatIntervalMs: 100,
      timeoutMs: 2000,
      maxRetries: 0,
    });

    const stateChanges: string[] = [];
    manager.on('brainStateChange', (state: string) => stateChanges.push(state));

    await manager.initialize();
    expect(manager.isConnected()).toBe(true);

    // Simulate Brain going down
    healthy = false;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(manager.isConnected()).toBe(false);

    // Simulate Brain recovery
    healthy = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(manager.isConnected()).toBe(true);

    manager.shutdown();

    // Should have seen: connected -> disconnected -> connected
    expect(stateChanges.filter((s) => s === 'connected').length).toBeGreaterThanOrEqual(2);
    expect(stateChanges).toContain('disconnected');
  });

  it('should forward Authorization header to all Brain endpoints', async () => {
    const receivedHeaders: Record<string, string>[] = [];

    const setup = await new Promise<{ server: Server; port: number }>((resolve) => {
      const server = createServer((req, res) => {
        receivedHeaders.push({
          url: req.url ?? '',
          auth: (req.headers['authorization'] as string) ?? '',
        } as Record<string, string>);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/api/health') {
          res.end(JSON.stringify({ status: 'ok', version: '4.1.0' }));
        } else {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            res.end(JSON.stringify({ results: [] }));
          });
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({ server, port });
      });
    });
    mockServer = setup.server;

    manager = new BrainManager({
      brainUrl: `http://127.0.0.1:${setup.port}`,
      brainApiKey: 'secret-api-key-123',
    });

    await manager.initialize();

    // Make a memory search call
    const client = manager.getClient()!;
    await client.searchMemory('test query', 5);

    // Verify all requests had the auth header
    for (const h of receivedHeaders) {
      expect(h.auth).toBe('Bearer secret-api-key-123');
    }

    manager.shutdown();
  });
});
```

**Step 2: Write barrel export**

```typescript
// src/bridge/index.ts
export { BrainClient, type BrainClientOptions, type BrainHealthResult, type BrainChatResponse, type BrainMemoryResponse, type BrainMemorySearchResult, type BrainChatContext } from './brain-client.js';
export { BrainHealthManager, type BrainConnectionState, type BrainHealthOptions } from './brain-health.js';
export { ContextEnrichment, type EnrichmentResult, type ContextEnrichmentOptions } from './context-enrichment.js';
export { BrainManager, type BrainManagerOptions, type BrainStatus } from './brain-manager.js';
```

**Step 3: Run all tests**

Run: `npx vitest run src/bridge/`
Expected: ALL PASS (~39 tests)

Run: `npx vitest run src/intelligence/rag/result-merger.test.ts`
Expected: PASS (9 tests)

**Step 4: Run full test suite and typecheck**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Security review checklist**

Verify:
- [ ] BRAIN_API_KEY is never logged or included in tool/resource output
- [ ] API key is sent only in Authorization header, never in URL query params
- [ ] Brain HTTP responses are not passed raw to MCP clients without sanitization
- [ ] Enrichment cache does not persist to disk (memory-only, cleared on shutdown)
- [ ] Connection errors do not leak internal server details to MCP clients
- [ ] Health check endpoint does not expose sensitive configuration
- [ ] Result merger does not expose Brain's raw memory content without the merge flow

**Step 6: Commit and push**

```bash
git add src/bridge/brain-integration.test.ts src/bridge/index.ts
git add src/intelligence/rag/result-merger.ts src/intelligence/rag/result-merger.test.ts
git commit -m "feat: add Brain bridge integration tests and barrel exports"
git push origin main
```

---

**Phase 14 complete.** Deliverables:
- Brain HTTP client (chat, memory search, health check, retry with exponential backoff)
- Brain health manager (state machine, heartbeat, event emission)
- RAG result merger (dual-source interleave, dedup, score normalization)
- Context enrichment (file history, patterns, related context, caching, timeout)
- Brain manager (lifecycle orchestration, status reporting, clean shutdown)
- Barrel exports for bridge module
- ~48 tests passing (10 client + 8 health + 9 merger + 8 enrichment + 9 manager + 4 integration)
