import { describe, it, expect, afterEach } from 'vitest';
import { BrainClient, type BrainClientOptions } from './brain-client.js';
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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

    const client = new BrainClient({
      baseUrl: `http://127.0.0.1:${setup.port}`,
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
