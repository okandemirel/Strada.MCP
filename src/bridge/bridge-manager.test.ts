import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BridgeManager } from './bridge-manager.js';
import { ConnectionState } from './connection-manager.js';
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
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('BridgeManager', () => {
  let mockServer: Awaited<ReturnType<typeof createMockServer>>;
  let manager: BridgeManager;

  beforeEach(async () => {
    mockServer = await createMockServer();
  });

  afterEach(async () => {
    manager?.destroy();
    await closeServer(mockServer.server);
  });

  it('should connect and report connected state', async () => {
    manager = new BridgeManager({
      port: mockServer.port,
      autoConnect: false,
      timeoutMs: 500,
      logLevel: 'error',
    });

    expect(manager.isConnected).toBe(false);
    expect(manager.state).toBe(ConnectionState.Disconnected);

    await manager.connect();

    expect(manager.isConnected).toBe(true);
    expect(manager.state).toBe(ConnectionState.Connected);
  });

  it('should disconnect cleanly', async () => {
    manager = new BridgeManager({
      port: mockServer.port,
      autoConnect: false,
      timeoutMs: 500,
      logLevel: 'error',
    });

    await manager.connect();
    manager.disconnect();

    expect(manager.isConnected).toBe(false);
    expect(manager.state).toBe(ConnectionState.Disconnected);
  });

  it('should expose client and events', async () => {
    manager = new BridgeManager({
      port: mockServer.port,
      autoConnect: false,
      timeoutMs: 500,
      logLevel: 'error',
    });

    expect(manager.client).toBeDefined();
    expect(manager.events).toBeDefined();
  });

  it('should forward stateChange events', async () => {
    manager = new BridgeManager({
      port: mockServer.port,
      autoConnect: false,
      timeoutMs: 500,
      logLevel: 'error',
    });

    const states: ConnectionState[] = [];
    manager.on('stateChange', (s) => states.push(s));

    await manager.connect();
    manager.disconnect();

    expect(states).toContain(ConnectionState.Connected);
    expect(states).toContain(ConnectionState.Disconnected);
  });

  it('should forward Unity events', async () => {
    manager = new BridgeManager({
      port: mockServer.port,
      autoConnect: false,
      timeoutMs: 500,
      logLevel: 'error',
    });

    const connPromise = mockServer.waitForConnection();
    await manager.connect();
    await connPromise;

    const events: unknown[] = [];
    manager.on('unityEvent', (e) => events.push(e));

    const notification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: { type: 'PlayModeChanged', timestamp: Date.now(), data: { isPlaying: true } },
    });
    mockServer.connections[0].write(notification + '\n');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toHaveLength(1);
  });

  it('should create from config', () => {
    const config = {
      unityBridgePort: mockServer.port,
      unityBridgeAutoConnect: false,
      unityBridgeTimeout: 3000,
      logLevel: 'error' as const,
      // Other config fields with defaults
      transport: 'stdio' as const,
      httpPort: 3100,
      httpHost: '127.0.0.1',
      embeddingProvider: 'gemini' as const,
      embeddingModel: 'gemini-embedding-2-preview',
      embeddingDimensions: 768,
      ragAutoIndex: true,
      ragWatchFiles: false,
      readOnly: false,
      scriptExecuteEnabled: false,
      maxFileSize: 10485760,
    };

    manager = BridgeManager.fromConfig(config);
    expect(manager).toBeDefined();
    expect(manager.isConnected).toBe(false);
  });

  it('should clean up on destroy', async () => {
    manager = new BridgeManager({
      port: mockServer.port,
      autoConnect: false,
      timeoutMs: 500,
      logLevel: 'error',
    });

    await manager.connect();
    manager.destroy();

    expect(manager.isConnected).toBe(false);
  });
});
