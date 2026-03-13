import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BridgeClient } from './bridge-client.js';
import { ConnectionManager, ConnectionState } from './connection-manager.js';
import net from 'node:net';

async function createMockServer(): Promise<{
  server: net.Server;
  port: number;
  connections: net.Socket[];
  waitForConnection: () => Promise<net.Socket>;
}> {
  const connections: net.Socket[] = [];
  let connectionResolve: ((socket: net.Socket) => void) | null = null;
  const server = net.createServer((socket) => {
    connections.push(socket);
    if (connectionResolve) {
      connectionResolve(socket);
      connectionResolve = null;
    }
    socket.on('close', () => {
      const idx = connections.indexOf(socket);
      if (idx >= 0) connections.splice(idx, 1);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        server,
        port: addr.port,
        connections,
        waitForConnection: () =>
          new Promise<net.Socket>((res) => {
            if (connections.length > 0) {
              res(connections[connections.length - 1]);
            } else {
              connectionResolve = res;
            }
          }),
      });
    });
  });
}

async function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    // Force close if it takes too long
    setTimeout(resolve, 500);
  });
}

describe('BridgeClient', () => {
  let mockServer: Awaited<ReturnType<typeof createMockServer>>;
  let connManager: ConnectionManager;
  let client: BridgeClient;

  beforeEach(async () => {
    mockServer = await createMockServer();
    connManager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });
    client = new BridgeClient(connManager, { timeoutMs: 500 });
    const connPromise = mockServer.waitForConnection();
    await connManager.connect();
    await connPromise;
  });

  afterEach(async () => {
    client.destroy();
    connManager.disconnect();
    // Destroy any remaining server-side connections before closing
    for (const conn of mockServer.connections) {
      conn.destroy();
    }
    await closeServer(mockServer.server);
  });

  it('should send a request and receive a response', async () => {
    // Mock server: echo back a success response for any request
    mockServer.connections[0].on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const req = JSON.parse(line);
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          result: { success: true, method: req.method },
        });
        mockServer.connections[0].write(response + '\n');
      }
    });

    const result = await client.request<{ success: boolean; method: string }>(
      'unity.getVersion',
      { detail: true },
    );
    expect(result).toEqual({ success: true, method: 'unity.getVersion' });
  });

  it('should handle error responses', async () => {
    mockServer.connections[0].on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const req = JSON.parse(line);
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: 'Method not found' },
        });
        mockServer.connections[0].write(response + '\n');
      }
    });

    await expect(client.request('unity.nonExistent')).rejects.toThrow('Method not found');
  });

  it('should timeout if no response is received', async () => {
    // Server does not respond
    await expect(client.request('unity.slow')).rejects.toThrow('Request timeout');
  });

  it('should clean up pending requests on disconnect', async () => {
    // Start a request that won't get a response
    const promise = client.request('unity.longRunning');

    // Disconnect immediately
    connManager.disconnect();

    await expect(promise).rejects.toThrow('Connection lost');
    expect(client.pendingCount).toBe(0);
  });

  it('should match responses to correct requests by id', async () => {
    // Server responds to requests in reverse order
    const receivedRequests: Array<{ id: number | string; method: string }> = [];
    mockServer.connections[0].on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const req = JSON.parse(line);
        receivedRequests.push(req);
      }
      // Wait, then respond in reverse order
      setTimeout(() => {
        for (let i = receivedRequests.length - 1; i >= 0; i--) {
          const req = receivedRequests[i];
          const response = JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { method: req.method },
          });
          mockServer.connections[0].write(response + '\n');
        }
      }, 20);
    });

    const [r1, r2] = await Promise.all([
      client.request<{ method: string }>('unity.first'),
      client.request<{ method: string }>('unity.second'),
    ]);

    expect(r1.method).toBe('unity.first');
    expect(r2.method).toBe('unity.second');
  });

  it('should emit notification events', async () => {
    const notifications: unknown[] = [];
    client.on('notification', (n) => notifications.push(n));

    // Server sends a notification (no id)
    const notif = JSON.stringify({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: { type: 'SceneChanged' },
    });
    mockServer.connections[0].write(notif + '\n');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notifications).toHaveLength(1);
  });

  it('should throw when requesting while disconnected', async () => {
    connManager.disconnect();
    await expect(client.request('unity.test')).rejects.toThrow('Not connected');
  });
});
