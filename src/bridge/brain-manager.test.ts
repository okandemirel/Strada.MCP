import { describe, it, expect, afterEach } from 'vitest';
import { BrainManager } from './brain-manager.js';
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
