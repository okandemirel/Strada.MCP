import { describe, it, expect, afterEach } from 'vitest';
import { BrainManager } from './brain-manager.js';
import { type LocalSearchResult, type BrainSearchResult } from '../intelligence/rag/result-merger.js';
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
