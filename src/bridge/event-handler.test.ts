import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventHandler } from './event-handler.js';
import { BridgeClient } from './bridge-client.js';
import { ConnectionManager } from './connection-manager.js';
import type { UnityEvent } from './protocol.js';
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

describe('EventHandler', () => {
  let mockServer: Awaited<ReturnType<typeof createMockServer>>;
  let connManager: ConnectionManager;
  let client: BridgeClient;
  let handler: EventHandler;

  beforeEach(async () => {
    mockServer = await createMockServer();
    connManager = new ConnectionManager({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
    });
    client = new BridgeClient(connManager, { timeoutMs: 500 });
    handler = new EventHandler(client);
    const connPromise = mockServer.waitForConnection();
    await connManager.connect();
    await connPromise;
  });

  afterEach(async () => {
    handler.destroy();
    client.destroy();
    connManager.disconnect();
    await closeServer(mockServer.server);
  });

  function sendNotification(params: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method: 'unity.event', params });
    mockServer.connections[0].write(msg + '\n');
  }

  it('should emit typed events for Unity notifications', async () => {
    const events: UnityEvent[] = [];
    handler.on('SceneChanged', (e) => events.push(e));

    sendNotification({ type: 'SceneChanged', timestamp: 1000, data: { scene: 'Main' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SceneChanged');
    expect(events[0].data).toEqual({ scene: 'Main' });
  });

  it('should emit generic event for all Unity notifications', async () => {
    const events: UnityEvent[] = [];
    handler.on('event', (e) => events.push(e));

    sendNotification({ type: 'CompileStarted', timestamp: 1000, data: {} });
    sendNotification({ type: 'CompileFinished', timestamp: 1001, data: { errors: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('CompileStarted');
    expect(events[1].type).toBe('CompileFinished');
  });

  it('should buffer recent events per type', async () => {
    sendNotification({ type: 'ConsoleLine', timestamp: 1, data: { line: 'a' } });
    sendNotification({ type: 'ConsoleLine', timestamp: 2, data: { line: 'b' } });
    sendNotification({ type: 'SceneChanged', timestamp: 3, data: { scene: 'X' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const consoleEvents = handler.getRecentEvents('ConsoleLine');
    expect(consoleEvents).toHaveLength(2);

    const sceneEvents = handler.getRecentEvents('SceneChanged');
    expect(sceneEvents).toHaveLength(1);

    const allEvents = handler.getRecentEvents();
    expect(allEvents).toHaveLength(3);
    // Should be sorted by timestamp
    expect(allEvents[0].timestamp).toBe(1);
    expect(allEvents[2].timestamp).toBe(3);
  });

  it('should cap buffer at 100 events per type', async () => {
    // Send 105 events
    for (let i = 0; i < 105; i++) {
      sendNotification({ type: 'ConsoleLine', timestamp: i, data: { line: `msg-${i}` } });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    const events = handler.getRecentEvents('ConsoleLine');
    expect(events).toHaveLength(100);
    // Should have dropped the oldest 5
    expect(events[0].timestamp).toBe(5);
    expect(events[99].timestamp).toBe(104);
  });

  it('should clear events', async () => {
    sendNotification({ type: 'ConsoleLine', timestamp: 1, data: {} });
    sendNotification({ type: 'SceneChanged', timestamp: 2, data: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));

    handler.clearEvents('ConsoleLine');
    expect(handler.getRecentEvents('ConsoleLine')).toHaveLength(0);
    expect(handler.getRecentEvents('SceneChanged')).toHaveLength(1);

    handler.clearEvents();
    expect(handler.getRecentEvents()).toHaveLength(0);
  });

  it('should ignore non-Unity event notifications', async () => {
    const events: UnityEvent[] = [];
    handler.on('event', (e) => events.push(e));

    // Send a notification that doesn't match UnityEventSchema
    const msg = JSON.stringify({ jsonrpc: '2.0', method: 'other.event', params: { foo: 'bar' } });
    mockServer.connections[0].write(msg + '\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events).toHaveLength(0);
  });
});
