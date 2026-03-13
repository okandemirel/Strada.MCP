import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, ConnectionState } from './connection-manager.js';
import net from 'node:net';

/**
 * Creates a mock TCP server for testing.
 */
async function createMockServer(): Promise<{
  server: net.Server;
  port: number;
  connections: net.Socket[];
  sendToAll: (msg: string) => void;
  waitForConnection: () => Promise<net.Socket>;
}> {
  const connections: net.Socket[] = [];
  const waiters: Array<(socket: net.Socket) => void> = [];
  const server = net.createServer((socket) => {
    connections.push(socket);
    const waiter = waiters.shift();
    if (waiter) waiter(socket);
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
        sendToAll: (msg: string) => {
          for (const conn of connections) {
            conn.write(msg + '\n');
          }
        },
        waitForConnection: () =>
          new Promise<net.Socket>((res) => {
            waiters.push(res);
          }),
      });
    });
  });
}

async function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('ConnectionManager', () => {
  let mockServer: Awaited<ReturnType<typeof createMockServer>>;
  let manager: ConnectionManager;

  beforeEach(async () => {
    mockServer = await createMockServer();
  });

  afterEach(async () => {
    manager?.disconnect();
    await closeServer(mockServer.server);
  });

  it('should connect to a TCP server', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });

    const stateChanges: ConnectionState[] = [];
    manager.on('stateChange', (s) => stateChanges.push(s));

    await manager.connect();
    expect(manager.getState()).toBe(ConnectionState.Connected);
    expect(stateChanges).toContain(ConnectionState.Connected);
  });

  it('should send and receive newline-delimited messages', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });

    const serverConn = mockServer.waitForConnection();
    await manager.connect();
    const conn = await serverConn;

    // Set up echo: server sends back what it receives
    conn.on('data', (data) => {
      conn.write(data);
    });

    const received: string[] = [];
    manager.on('message', (msg) => received.push(msg));

    manager.send('{"jsonrpc":"2.0","id":1,"method":"test"}');

    // Wait for echo
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('"method":"test"');
  });

  it('should handle partial messages (framing)', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });

    const serverConn = mockServer.waitForConnection();
    await manager.connect();
    const conn = await serverConn;

    const received: string[] = [];
    manager.on('message', (msg) => received.push(msg));

    // Send a message in two parts
    conn.write('{"jsonrpc":"2.0",');
    await new Promise((resolve) => setTimeout(resolve, 20));
    conn.write('"id":1,"method":"test"}\n');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0])).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
    });
  });

  it('should handle multiple messages in one chunk', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });

    const serverConn = mockServer.waitForConnection();
    await manager.connect();
    const conn = await serverConn;

    const received: string[] = [];
    manager.on('message', (msg) => received.push(msg));

    conn.write('{"jsonrpc":"2.0","id":1,"method":"a"}\n{"jsonrpc":"2.0","id":2,"method":"b"}\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(2);
  });

  it('should emit disconnected state on server close', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });

    const serverConn = mockServer.waitForConnection();
    await manager.connect();
    const conn = await serverConn;

    const disconnected = new Promise<void>((resolve) => {
      manager.on('stateChange', (s) => {
        if (s === ConnectionState.Disconnected) resolve();
      });
    });

    conn.destroy();
    await disconnected;

    expect(manager.getState()).toBe(ConnectionState.Disconnected);
  });

  it('should auto-reconnect with exponential backoff', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: true,
      reconnectBaseMs: 50, // fast for testing
      reconnectMaxMs: 200,
    });

    const serverConn = mockServer.waitForConnection();
    await manager.connect();
    const conn = await serverConn;
    expect(manager.getState()).toBe(ConnectionState.Connected);

    // Wait for reconnect
    const reconnected = new Promise<void>((resolve) => {
      manager.on('stateChange', (s) => {
        if (s === ConnectionState.Connected) resolve();
      });
    });

    // Kill the connection
    conn.destroy();

    await reconnected;
    expect(manager.getState()).toBe(ConnectionState.Connected);
  });

  it('should fail to connect to non-existent server', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: 59999, // unlikely to be in use
      autoReconnect: false,
    });

    await expect(manager.connect()).rejects.toThrow();
    expect(manager.getState()).toBe(ConnectionState.Disconnected);
  });

  it('should disconnect cleanly', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });

    await manager.connect();
    manager.disconnect();
    expect(manager.getState()).toBe(ConnectionState.Disconnected);
  });

  it('should enforce message size limit', async () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      maxMessageSize: 100,
    });

    const serverConn = mockServer.waitForConnection();
    await manager.connect();
    const conn = await serverConn;

    const received: string[] = [];
    const errors: Error[] = [];
    manager.on('message', (msg) => received.push(msg));
    manager.on('error', (err) => errors.push(err));

    // Send an oversized message
    conn.write('x'.repeat(200) + '\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should bind to localhost only', () => {
    manager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });
    expect((manager as any).options.host).toBe('127.0.0.1');
  });

  it('should reject non-localhost hosts', () => {
    expect(
      () =>
        new ConnectionManager({
          host: '192.168.1.1',
          port: 7691,
          autoReconnect: false,
        }),
    ).toThrow('localhost only');
  });
});
