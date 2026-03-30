import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BridgeClient } from './bridge-client.js';
import { ConnectionManager } from './connection-manager.js';
import net from 'node:net';

function createCapabilityManifest(methods: string[]) {
  return {
    manifestVersion: 1,
    bridgeVersion: '1.0.0',
    protocolVersion: '2.0',
    supportedMethods: methods,
    supportedFeatures: ['bridge.capability-manifest'],
    metadata: { test: true },
  };
}

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
    attachRequestHandler(mockServer.connections[0], (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { success: true, method: req.method },
    }), ['unity.getVersion']);

    const result = await client.request<{ success: boolean; method: string }>(
      'unity.getVersion',
      { detail: true },
    );
    expect(result).toEqual({ success: true, method: 'unity.getVersion' });
  });

  it('should handle error responses', async () => {
    attachRequestHandler(mockServer.connections[0], (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: 'Method not found' },
    }), ['unity.nonExistent']);

    await expect(client.request('unity.nonExistent')).rejects.toThrow('Method not found');
  });

  it('should timeout if no response is received', async () => {
    attachRequestHandler(mockServer.connections[0], () => null, ['unity.slow']);
    await expect(client.request('unity.slow')).rejects.toThrow('Request timeout');
  });

  it('should clean up pending requests on disconnect', async () => {
    attachRequestHandler(mockServer.connections[0], (req) => {
      if (req.method === 'unity.longRunning') {
        return null;
      }

      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { ok: true },
      };
    }, ['unity.longRunning']);

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
    attachRequestHandler(mockServer.connections[0], (req) => {
      receivedRequests.push(req);
      return null;
    }, ['unity.first', 'unity.second']);

    mockServer.connections[0].on('data', () => {
      if (receivedRequests.length < 2) {
        return;
      }

      setTimeout(() => {
        for (let i = receivedRequests.length - 1; i >= 0; i--) {
          const req = receivedRequests[i];
          const response = JSON.stringify({
            jsonrpc: '2.0',
            id: String(req.id),
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

  it('should fetch and cache bridge capabilities before first use', async () => {
    const methodsSeen: string[] = [];
    attachRequestHandler(mockServer.connections[0], (req) => {
      methodsSeen.push(req.method);
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { ok: true },
      };
    }, ['unity.status']);

    await client.request('unity.status');

    expect(methodsSeen[0]).toBe('unity.status');
    expect(client.capabilities?.supportedMethods).toContain('unity.status');
    expect(client.supportsMethod('unity.status')).toBe(true);
  });

  it('should reject requests for methods missing from the capability manifest', async () => {
    attachRequestHandler(mockServer.connections[0], () => null, []);

    await expect(client.request('unity.missing')).rejects.toThrow('does not advertise JSON-RPC method');
  });

  it('should continue against legacy bridges that do not implement capability discovery', async () => {
    mockServer.connections[0].on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const req = JSON.parse(line);
        if (req.method === 'bridge.getCapabilities') {
          mockServer.connections[0].write(JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: 'Method not found: bridge.getCapabilities' },
          }) + '\n');
          continue;
        }

        if (req.method === 'unity.legacyStatus') {
          mockServer.connections[0].write(JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { ok: true, legacy: true },
          }) + '\n');
        }
      }
    });

    await expect(client.ensureCapabilities()).resolves.toBeNull();
    await expect(client.request('unity.legacyStatus')).resolves.toEqual({ ok: true, legacy: true });
    expect(client.capabilities).toBeNull();
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

function attachRequestHandler(
  socket: net.Socket,
  responder: (request: { id: number | string; method: string }) => Record<string, unknown> | null,
  supportedMethods: string[],
): void {
  socket.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      const req = JSON.parse(line);
      if (req.method === 'bridge.getCapabilities') {
        socket.write(JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          result: createCapabilityManifest(supportedMethods),
        }) + '\n');
        continue;
      }

      const response = responder(req);
      if (response) {
        socket.write(JSON.stringify(response) + '\n');
      }
    }
  });
}
