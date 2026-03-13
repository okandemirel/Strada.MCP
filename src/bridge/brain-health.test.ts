import { describe, it, expect, afterEach } from 'vitest';
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
