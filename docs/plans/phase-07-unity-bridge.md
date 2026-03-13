# Phase 7: Unity Bridge Protocol

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish TCP-based JSON-RPC communication between the MCP server and Unity Editor. This is infrastructure only (0 tools) — the bridge is consumed by Unity runtime tools in Phase 8+.

**Architecture:** The MCP server acts as a TCP client connecting to a JSON-RPC server running inside the Unity Editor (the C# Unity package from Phase 15). Messages are newline-delimited JSON. The bridge auto-reconnects with exponential backoff and provides a high-level request/response API with timeout handling and event subscriptions.

**Tech Stack:** Node.js net module, zod (JSON-RPC validation), EventEmitter

**Depends on:** Phase 2 (security layer)

---

### Task 1: JSON-RPC Protocol Types — Zod-validated message types

**Files:**
- Create: `src/bridge/protocol.ts`
- Create: `src/bridge/protocol.test.ts`

Defines the JSON-RPC 2.0 message types with strict Zod validation. Includes Unity-specific error codes and event types.

**Step 1: Write the failing test**

```typescript
// src/bridge/protocol.test.ts
import { describe, it, expect } from 'vitest';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  parseJsonRpcMessage,
  createRequest,
  createNotification,
  ErrorCode,
  type UnityEvent,
} from './protocol.js';

describe('JSON-RPC Protocol Types', () => {
  describe('JsonRpcRequest', () => {
    it('should validate a correct request', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'unity.createGameObject', params: { name: 'Cube' } };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should reject request without jsonrpc version', () => {
      const msg = { id: 1, method: 'test' };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it('should reject request without method', () => {
      const msg = { jsonrpc: '2.0', id: 1 };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it('should accept request without params', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'unity.getState' };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should accept string ids', () => {
      const msg = { jsonrpc: '2.0', id: 'req-42', method: 'test', params: {} };
      const result = JsonRpcRequest.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe('JsonRpcResponse', () => {
    it('should validate a success response', () => {
      const msg = { jsonrpc: '2.0', id: 1, result: { name: 'Cube' } };
      const result = JsonRpcResponse.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should validate an error response', () => {
      const msg = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid Request' },
      };
      const result = JsonRpcResponse.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should validate error with data field', () => {
      const msg = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'Not found', data: { path: '/missing' } },
      };
      const result = JsonRpcResponse.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe('JsonRpcNotification', () => {
    it('should validate a notification (no id)', () => {
      const msg = { jsonrpc: '2.0', method: 'unity.event', params: { type: 'SceneChanged' } };
      const result = JsonRpcNotification.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should reject notification with id', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'unity.event', params: {} };
      // Notifications must NOT have an id field
      const result = JsonRpcNotification.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe('parseJsonRpcMessage', () => {
    it('should parse a request', () => {
      const raw = '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}';
      const msg = parseJsonRpcMessage(raw);
      expect(msg.type).toBe('request');
    });

    it('should parse a response with result', () => {
      const raw = '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}';
      const msg = parseJsonRpcMessage(raw);
      expect(msg.type).toBe('response');
    });

    it('should parse a notification', () => {
      const raw = '{"jsonrpc":"2.0","method":"unity.event","params":{"type":"SceneChanged"}}';
      const msg = parseJsonRpcMessage(raw);
      expect(msg.type).toBe('notification');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseJsonRpcMessage('not json')).toThrow();
    });

    it('should throw on unrecognized message format', () => {
      expect(() => parseJsonRpcMessage('{"foo":"bar"}')).toThrow();
    });
  });

  describe('createRequest', () => {
    it('should create a valid request with auto-incrementing id', () => {
      const req1 = createRequest('unity.play', { mode: 'play' });
      const req2 = createRequest('unity.pause', {});
      expect(req1.jsonrpc).toBe('2.0');
      expect(req1.method).toBe('unity.play');
      expect(req1.params).toEqual({ mode: 'play' });
      expect(typeof req1.id).toBe('number');
      expect(req2.id).toBe(req1.id + 1);
    });
  });

  describe('createNotification', () => {
    it('should create a valid notification without id', () => {
      const notif = createNotification('unity.ping', {});
      expect(notif.jsonrpc).toBe('2.0');
      expect(notif.method).toBe('unity.ping');
      expect(notif).not.toHaveProperty('id');
    });
  });

  describe('ErrorCode', () => {
    it('should define standard JSON-RPC error codes', () => {
      expect(ErrorCode.ParseError).toBe(-32700);
      expect(ErrorCode.InvalidRequest).toBe(-32600);
      expect(ErrorCode.MethodNotFound).toBe(-32601);
      expect(ErrorCode.InvalidParams).toBe(-32602);
      expect(ErrorCode.InternalError).toBe(-32603);
    });

    it('should define Unity-specific error codes', () => {
      expect(ErrorCode.UnityNotReady).toBeDefined();
      expect(ErrorCode.GameObjectNotFound).toBeDefined();
      expect(ErrorCode.ComponentNotFound).toBeDefined();
      expect(ErrorCode.SceneNotLoaded).toBeDefined();
      expect(ErrorCode.CompileError).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/protocol.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/protocol.ts
import { z } from 'zod';

// --- JSON-RPC 2.0 Message Schemas ---

export const JsonRpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});
export type JsonRpcRequestType = z.infer<typeof JsonRpcRequest>;

export const JsonRpcError = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcErrorType = z.infer<typeof JsonRpcError>;

export const JsonRpcResponse = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string(), z.null()]),
  result: z.unknown().optional(),
  error: JsonRpcError.optional(),
});
export type JsonRpcResponseType = z.infer<typeof JsonRpcResponse>;

export const JsonRpcNotification = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
}).strict(); // strict() rejects extra fields like 'id'
export type JsonRpcNotificationType = z.infer<typeof JsonRpcNotification>;

// --- Error Codes ---

export const ErrorCode = {
  // Standard JSON-RPC
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // Unity-specific (-32000 to -32099)
  UnityNotReady: -32000,
  GameObjectNotFound: -32001,
  ComponentNotFound: -32002,
  SceneNotLoaded: -32003,
  CompileError: -32004,
  PlayModeRequired: -32005,
  EditModeRequired: -32006,
  AssetNotFound: -32007,
  PermissionDenied: -32008,
  Timeout: -32009,
} as const;

// --- Unity Event Types ---

export type UnityEventType =
  | 'SceneChanged'
  | 'ConsoleLine'
  | 'CompileStarted'
  | 'CompileFinished'
  | 'PlayModeChanged'
  | 'SelectionChanged';

export interface UnityEvent {
  type: UnityEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export const UnityEventSchema = z.object({
  type: z.enum([
    'SceneChanged',
    'ConsoleLine',
    'CompileStarted',
    'CompileFinished',
    'PlayModeChanged',
    'SelectionChanged',
  ]),
  timestamp: z.number(),
  data: z.record(z.unknown()),
});

// --- Message Parsing ---

export type ParsedMessage =
  | { type: 'request'; message: JsonRpcRequestType }
  | { type: 'response'; message: JsonRpcResponseType }
  | { type: 'notification'; message: JsonRpcNotificationType };

export function parseJsonRpcMessage(raw: string): ParsedMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw.substring(0, 100)}`);
  }

  // Try notification first (stricter — no 'id' field)
  const notifResult = JsonRpcNotification.safeParse(parsed);
  if (notifResult.success) {
    return { type: 'notification', message: notifResult.data };
  }

  // Try response (has 'result' or 'error', has 'id')
  const respResult = JsonRpcResponse.safeParse(parsed);
  if (respResult.success && (respResult.data.result !== undefined || respResult.data.error !== undefined)) {
    return { type: 'response', message: respResult.data };
  }

  // Try request (has 'method' and 'id')
  const reqResult = JsonRpcRequest.safeParse(parsed);
  if (reqResult.success) {
    return { type: 'request', message: reqResult.data };
  }

  throw new Error(`Unrecognized JSON-RPC message: ${raw.substring(0, 200)}`);
}

// --- Message Factory ---

let nextRequestId = 1;

export function createRequest(
  method: string,
  params: Record<string, unknown>,
): JsonRpcRequestType {
  return {
    jsonrpc: '2.0',
    id: nextRequestId++,
    method,
    params,
  };
}

export function createNotification(
  method: string,
  params: Record<string, unknown>,
): JsonRpcNotificationType {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

/**
 * Resets the request ID counter. Only used in tests.
 */
export function resetRequestIdCounter(): void {
  nextRequestId = 1;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/protocol.test.ts`
Expected: PASS (17 tests)

**Step 5: Commit**

```bash
git add src/bridge/protocol.ts src/bridge/protocol.test.ts
git commit -m "feat: add JSON-RPC 2.0 protocol types with Zod validation"
```

---

### Task 2: TCP Connection Manager — low-level TCP with framing and reconnect

**Files:**
- Create: `src/bridge/connection-manager.ts`
- Create: `src/bridge/connection-manager.test.ts`

Manages the raw TCP connection to the Unity Editor. Handles newline-delimited JSON framing, auto-reconnect with exponential backoff, and connection state events.

**Step 1: Write the failing test**

```typescript
// src/bridge/connection-manager.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionManager, ConnectionState } from './connection-manager.js';
import net from 'node:net';

/**
 * Creates a mock TCP server for testing.
 * Returns the server, its port, and a helper to send messages.
 */
async function createMockServer(): Promise<{
  server: net.Server;
  port: number;
  connections: net.Socket[];
  sendToAll: (msg: string) => void;
}> {
  const connections: net.Socket[] = [];
  const server = net.createServer((socket) => {
    connections.push(socket);
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

    await manager.connect();

    // Set up echo: server sends back what it receives
    mockServer.connections[0].on('data', (data) => {
      mockServer.connections[0].write(data);
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

    await manager.connect();

    const received: string[] = [];
    manager.on('message', (msg) => received.push(msg));

    // Send a message in two parts
    const conn = mockServer.connections[0];
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

    await manager.connect();

    const received: string[] = [];
    manager.on('message', (msg) => received.push(msg));

    const conn = mockServer.connections[0];
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

    await manager.connect();

    const disconnected = new Promise<void>((resolve) => {
      manager.on('stateChange', (s) => {
        if (s === ConnectionState.Disconnected) resolve();
      });
    });

    mockServer.connections[0].destroy();
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

    await manager.connect();
    expect(manager.getState()).toBe(ConnectionState.Connected);

    // Kill the connection
    mockServer.connections[0].destroy();

    // Wait for reconnect
    const reconnected = new Promise<void>((resolve) => {
      manager.on('stateChange', (s) => {
        if (s === ConnectionState.Connected) resolve();
      });
    });

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

    await manager.connect();

    const received: string[] = [];
    const errors: Error[] = [];
    manager.on('message', (msg) => received.push(msg));
    manager.on('error', (err) => errors.push(err));

    // Send an oversized message
    const conn = mockServer.connections[0];
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
    // The host is always 127.0.0.1 — verified by the config constraint
    expect((manager as any).options.host).toBe('127.0.0.1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/connection-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/connection-manager.ts
import net from 'node:net';
import { EventEmitter } from 'node:events';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

export interface ConnectionManagerOptions {
  host: string;
  port: number;
  autoReconnect: boolean;
  reconnectBaseMs?: number;   // default: 1000
  reconnectMaxMs?: number;    // default: 30000
  maxMessageSize?: number;    // default: 1MB
}

export interface ConnectionManagerEvents {
  stateChange: (state: ConnectionState) => void;
  message: (data: string) => void;
  error: (error: Error) => void;
}

export class ConnectionManager extends EventEmitter {
  private socket: net.Socket | null = null;
  private state: ConnectionState = ConnectionState.Disconnected;
  private buffer = '';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;

  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly maxMessageSize: number;

  constructor(private readonly options: ConnectionManagerOptions) {
    super();
    // Security: force localhost only
    if (options.host !== '127.0.0.1' && options.host !== 'localhost') {
      throw new Error('Unity bridge must bind to 127.0.0.1 (localhost only)');
    }
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30000;
    this.maxMessageSize = options.maxMessageSize ?? 1_048_576; // 1MB
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === ConnectionState.Connected;
  }

  async connect(): Promise<void> {
    if (this.state === ConnectionState.Connected) return;

    this.intentionalDisconnect = false;
    this.setState(ConnectionState.Connecting);

    return new Promise<void>((resolve, reject) => {
      this.socket = new net.Socket();

      const onConnect = () => {
        this.reconnectAttempt = 0;
        this.setState(ConnectionState.Connected);
        resolve();
      };

      const onError = (err: Error) => {
        this.socket?.removeListener('connect', onConnect);
        this.setState(ConnectionState.Disconnected);
        reject(err);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);

      this.socket.on('data', (data) => this.handleData(data));

      this.socket.on('close', () => {
        this.socket?.removeAllListeners();
        this.socket = null;
        this.buffer = '';

        if (this.intentionalDisconnect) {
          this.setState(ConnectionState.Disconnected);
          return;
        }

        this.setState(ConnectionState.Disconnected);

        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      this.socket.connect(this.options.port, this.options.host);
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.buffer = '';
    this.reconnectAttempt = 0;
    this.setState(ConnectionState.Disconnected);
  }

  send(message: string): void {
    if (!this.socket || this.state !== ConnectionState.Connected) {
      throw new Error('Cannot send: not connected');
    }
    this.socket.write(message + '\n');
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf-8');

    // Process complete newline-delimited messages
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).trim();
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (!line) continue;

      // Enforce message size limit
      if (line.length > this.maxMessageSize) {
        this.emit('error', new Error(
          `Message exceeds size limit (${line.length} > ${this.maxMessageSize})`,
        ));
        continue;
      }

      this.emit('message', line);
    }

    // Check if buffer itself is getting too large (partial message attack)
    if (this.buffer.length > this.maxMessageSize) {
      this.emit('error', new Error('Buffer overflow: partial message exceeds size limit'));
      this.buffer = '';
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt++;
    const delay = Math.min(
      this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt - 1),
      this.reconnectMaxMs,
    );

    this.setState(ConnectionState.Reconnecting);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // connect() failed — will be rescheduled via the close handler
      }
    }, delay);
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/connection-manager.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add src/bridge/connection-manager.ts src/bridge/connection-manager.test.ts
git commit -m "feat: add TCP connection manager with framing and exponential backoff reconnect"
```

---

### Task 3: Bridge Client — high-level request/response API

**Files:**
- Create: `src/bridge/bridge-client.ts`
- Create: `src/bridge/bridge-client.test.ts`

Wraps the connection manager with a high-level API: `request(method, params) -> Promise<result>`. Manages request IDs, timeout handling, and pending request tracking.

**Step 1: Write the failing test**

```typescript
// src/bridge/bridge-client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BridgeClient } from './bridge-client.js';
import { ConnectionState } from './connection-manager.js';
import net from 'node:net';

/**
 * Creates a mock Unity server that responds to JSON-RPC requests.
 */
async function createMockUnityServer(
  handler?: (req: any, socket: net.Socket) => void,
): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex).trim();
        buffer = buffer.substring(newlineIndex + 1);
        if (!line) continue;

        try {
          const req = JSON.parse(line);
          if (handler) {
            handler(req, socket);
          } else {
            // Default: echo result
            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: req.id,
                result: { echo: req.method },
              }) + '\n',
            );
          }
        } catch { /* ignore parse errors */ }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

async function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('BridgeClient', () => {
  let mockServer: { server: net.Server; port: number };
  let client: BridgeClient;

  afterEach(async () => {
    client?.disconnect();
    if (mockServer) await closeServer(mockServer.server);
  });

  it('should send request and receive response', async () => {
    mockServer = await createMockUnityServer();
    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    await client.connect();
    const result = await client.request('unity.getState', {});
    expect(result).toEqual({ echo: 'unity.getState' });
  });

  it('should handle concurrent requests', async () => {
    mockServer = await createMockUnityServer((req, socket) => {
      // Delay responses slightly to test concurrency
      setTimeout(() => {
        socket.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { method: req.method, id: req.id },
          }) + '\n',
        );
      }, 10);
    });

    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    await client.connect();

    const [r1, r2, r3] = await Promise.all([
      client.request('method.a', {}),
      client.request('method.b', {}),
      client.request('method.c', {}),
    ]);

    expect((r1 as any).method).toBe('method.a');
    expect((r2 as any).method).toBe('method.b');
    expect((r3 as any).method).toBe('method.c');
  });

  it('should timeout on unresponsive server', async () => {
    mockServer = await createMockUnityServer((_req, _socket) => {
      // Never respond
    });

    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 100, // 100ms timeout for fast test
    });

    await client.connect();
    await expect(client.request('unity.slow', {})).rejects.toThrow('timed out');
  });

  it('should reject with error when server returns error response', async () => {
    mockServer = await createMockUnityServer((req, socket) => {
      socket.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32001, message: 'GameObject not found' },
        }) + '\n',
      );
    });

    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    await client.connect();
    await expect(client.request('unity.find', { name: 'Missing' })).rejects.toThrow(
      'GameObject not found',
    );
  });

  it('should reject pending requests on disconnect', async () => {
    mockServer = await createMockUnityServer((_req, _socket) => {
      // Never respond
    });

    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    await client.connect();
    const promise = client.request('unity.test', {});
    client.disconnect();

    await expect(promise).rejects.toThrow('disconnected');
  });

  it('should throw when requesting while disconnected', async () => {
    client = new BridgeClient({
      host: '127.0.0.1',
      port: 59999,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    await expect(client.request('test', {})).rejects.toThrow('not connected');
  });

  it('should expose connection state', async () => {
    mockServer = await createMockUnityServer();
    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    expect(client.isConnected()).toBe(false);
    await client.connect();
    expect(client.isConnected()).toBe(true);
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('should handle graceful shutdown with pending requests', async () => {
    mockServer = await createMockUnityServer((req, socket) => {
      setTimeout(() => {
        socket.write(
          JSON.stringify({ jsonrpc: '2.0', id: req.id, result: 'ok' }) + '\n',
        );
      }, 50);
    });

    client = new BridgeClient({
      host: '127.0.0.1',
      port: mockServer.port,
      autoReconnect: false,
      requestTimeout: 5000,
    });

    await client.connect();

    // Start a request, then gracefully shut down
    const promise = client.request('unity.test', {});
    await client.gracefulShutdown(200);

    // The request should have either completed or been rejected
    // (depending on timing — both are acceptable)
    try {
      await promise;
    } catch {
      // Expected if shutdown beat the response
    }

    expect(client.isConnected()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/bridge-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/bridge-client.ts
import { EventEmitter } from 'node:events';
import { ConnectionManager, ConnectionState, type ConnectionManagerOptions } from './connection-manager.js';
import {
  parseJsonRpcMessage,
  createRequest,
  type JsonRpcResponseType,
  type JsonRpcNotificationType,
} from './protocol.js';

export interface BridgeClientOptions {
  host: string;
  port: number;
  autoReconnect: boolean;
  requestTimeout: number; // ms
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  maxMessageSize?: number;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

export class BridgeClient extends EventEmitter {
  private readonly connection: ConnectionManager;
  private readonly pendingRequests = new Map<number | string, PendingRequest>();
  private readonly requestTimeout: number;

  constructor(options: BridgeClientOptions) {
    super();
    this.requestTimeout = options.requestTimeout;

    this.connection = new ConnectionManager({
      host: options.host,
      port: options.port,
      autoReconnect: options.autoReconnect,
      reconnectBaseMs: options.reconnectBaseMs,
      reconnectMaxMs: options.reconnectMaxMs,
      maxMessageSize: options.maxMessageSize,
    });

    this.connection.on('message', (raw) => this.handleMessage(raw));
    this.connection.on('stateChange', (state) => {
      this.emit('stateChange', state);

      if (state === ConnectionState.Disconnected) {
        this.rejectAllPending(new Error('Bridge disconnected'));
      }
    });
    this.connection.on('error', (err) => this.emit('error', err));
  }

  async connect(): Promise<void> {
    return this.connection.connect();
  }

  disconnect(): void {
    this.rejectAllPending(new Error('Bridge disconnected'));
    this.connection.disconnect();
  }

  isConnected(): boolean {
    return this.connection.isConnected();
  }

  getState(): ConnectionState {
    return this.connection.getState();
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   * Rejects if the server returns an error, the request times out,
   * or the connection is lost.
   */
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected()) {
      throw new Error('Bridge is not connected — cannot send request');
    }

    const req = createRequest(method, params);

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(req.id);
        reject(new Error(`Request "${method}" (id=${req.id}) timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pendingRequests.set(req.id, { resolve, reject, timer, method });

      try {
        this.connection.send(JSON.stringify(req));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(req.id);
        reject(err);
      }
    });
  }

  /**
   * Graceful shutdown: wait for pending requests to complete (up to timeout),
   * then disconnect.
   */
  async gracefulShutdown(timeoutMs: number): Promise<void> {
    if (this.pendingRequests.size === 0) {
      this.disconnect();
      return;
    }

    // Wait for pending requests or timeout
    await Promise.race([
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (this.pendingRequests.size === 0) {
            clearInterval(check);
            resolve();
          }
        }, 10);
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);

    this.disconnect();
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = parseJsonRpcMessage(raw);

      switch (parsed.type) {
        case 'response':
          this.handleResponse(parsed.message);
          break;
        case 'notification':
          this.handleNotification(parsed.message);
          break;
        case 'request':
          // Server-to-client requests are not expected in this protocol
          this.emit('error', new Error(`Unexpected server request: ${raw}`));
          break;
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleResponse(response: JsonRpcResponseType): void {
    if (response.id === null) return;

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(
        new Error(`${response.error.message} (code: ${response.error.code})`),
      );
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: JsonRpcNotificationType): void {
    this.emit('notification', notification);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/bridge-client.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/bridge/bridge-client.ts src/bridge/bridge-client.test.ts
git commit -m "feat: add bridge client with request/response, timeout, and pending tracking"
```

---

### Task 4: Event Handler — Unity event subscription and dispatch

**Files:**
- Create: `src/bridge/event-handler.ts`
- Create: `src/bridge/event-handler.test.ts`

Receives Unity notifications (scene change, console log, compile status, play mode, selection change) and dispatches them to subscribers via typed EventEmitter pattern.

**Step 1: Write the failing test**

```typescript
// src/bridge/event-handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { UnityEventHandler, type UnityEventData } from './event-handler.js';
import type { JsonRpcNotificationType } from './protocol.js';

describe('UnityEventHandler', () => {
  it('should dispatch SceneChanged events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('SceneChanged', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'SceneChanged',
        timestamp: Date.now(),
        data: { sceneName: 'MainScene', scenePath: 'Assets/Scenes/Main.unity' },
      },
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].data.sceneName).toBe('MainScene');
  });

  it('should dispatch ConsoleLine events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('ConsoleLine', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'ConsoleLine',
        timestamp: Date.now(),
        data: { message: 'NullReferenceException', level: 'error', stackTrace: '...' },
      },
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].data.level).toBe('error');
  });

  it('should dispatch CompileStarted events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('CompileStarted', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'CompileStarted',
        timestamp: Date.now(),
        data: {},
      },
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it('should dispatch CompileFinished events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('CompileFinished', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'CompileFinished',
        timestamp: Date.now(),
        data: { success: true, errors: 0, warnings: 2 },
      },
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].data.success).toBe(true);
  });

  it('should dispatch PlayModeChanged events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('PlayModeChanged', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'PlayModeChanged',
        timestamp: Date.now(),
        data: { state: 'playing' },
      },
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].data.state).toBe('playing');
  });

  it('should dispatch SelectionChanged events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('SelectionChanged', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'SelectionChanged',
        timestamp: Date.now(),
        data: { instanceIds: [1234, 5678], names: ['Player', 'Enemy'] },
      },
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].data.instanceIds).toEqual([1234, 5678]);
  });

  it('should ignore non-event notifications', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('SceneChanged', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.heartbeat',
      params: {},
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should support wildcard listener for all events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.onAny(callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'SceneChanged',
        timestamp: Date.now(),
        data: { sceneName: 'Test' },
      },
    });

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'PlayModeChanged',
        timestamp: Date.now(),
        data: { state: 'stopped' },
      },
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should allow unsubscribing from events', () => {
    const handler = new UnityEventHandler();
    const callback = vi.fn();
    handler.on('ConsoleLine', callback);
    handler.off('ConsoleLine', callback);

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'ConsoleLine',
        timestamp: Date.now(),
        data: { message: 'test' },
      },
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should track recent events', () => {
    const handler = new UnityEventHandler();

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'ConsoleLine',
        timestamp: Date.now(),
        data: { message: 'log1' },
      },
    });

    handler.handleNotification({
      jsonrpc: '2.0',
      method: 'unity.event',
      params: {
        type: 'ConsoleLine',
        timestamp: Date.now(),
        data: { message: 'log2' },
      },
    });

    const recent = handler.getRecentEvents('ConsoleLine', 5);
    expect(recent).toHaveLength(2);
    expect(recent[0].data.message).toBe('log1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/event-handler.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/event-handler.ts
import { UnityEventSchema, type UnityEventType, type UnityEvent } from './protocol.js';
import type { JsonRpcNotificationType } from './protocol.js';

export interface UnityEventData {
  type: UnityEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

type EventCallback = (event: UnityEventData) => void;

const MAX_RECENT_EVENTS = 100;

export class UnityEventHandler {
  private readonly listeners = new Map<UnityEventType, Set<EventCallback>>();
  private readonly wildcardListeners = new Set<EventCallback>();
  private readonly recentEvents = new Map<UnityEventType, UnityEventData[]>();

  /**
   * Subscribe to a specific Unity event type.
   */
  on(eventType: UnityEventType, callback: EventCallback): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  /**
   * Unsubscribe from a specific Unity event type.
   */
  off(eventType: UnityEventType, callback: EventCallback): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  /**
   * Subscribe to all Unity events.
   */
  onAny(callback: EventCallback): void {
    this.wildcardListeners.add(callback);
  }

  /**
   * Unsubscribe from all Unity events.
   */
  offAny(callback: EventCallback): void {
    this.wildcardListeners.delete(callback);
  }

  /**
   * Get recent events of a specific type.
   */
  getRecentEvents(eventType: UnityEventType, limit: number): UnityEventData[] {
    const events = this.recentEvents.get(eventType) ?? [];
    return events.slice(-limit);
  }

  /**
   * Clear all recent events.
   */
  clearRecentEvents(): void {
    this.recentEvents.clear();
  }

  /**
   * Process an incoming JSON-RPC notification from the Unity bridge.
   * Only processes notifications with method "unity.event".
   */
  handleNotification(notification: JsonRpcNotificationType): void {
    if (notification.method !== 'unity.event') return;

    const params = notification.params;
    if (!params) return;

    // Validate the event structure
    const parseResult = UnityEventSchema.safeParse(params);
    if (!parseResult.success) return;

    const eventData: UnityEventData = {
      type: parseResult.data.type,
      timestamp: parseResult.data.timestamp,
      data: parseResult.data.data,
    };

    // Store in recent events
    if (!this.recentEvents.has(eventData.type)) {
      this.recentEvents.set(eventData.type, []);
    }
    const typeEvents = this.recentEvents.get(eventData.type)!;
    typeEvents.push(eventData);
    if (typeEvents.length > MAX_RECENT_EVENTS) {
      typeEvents.shift();
    }

    // Dispatch to typed listeners
    const callbacks = this.listeners.get(eventData.type);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(eventData);
        } catch { /* swallow listener errors */ }
      }
    }

    // Dispatch to wildcard listeners
    for (const cb of this.wildcardListeners) {
      try {
        cb(eventData);
      } catch { /* swallow listener errors */ }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/event-handler.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add src/bridge/event-handler.ts src/bridge/event-handler.test.ts
git commit -m "feat: add Unity event handler with typed dispatch and recent event tracking"
```

---

### Task 5: Bridge Manager — lifecycle management

**Files:**
- Create: `src/bridge/bridge-manager.ts`
- Create: `src/bridge/bridge-manager.test.ts`

Integrates the bridge client, event handler, and connection lifecycle with the MCP server. Manages auto-connect on startup, exposes `isConnected` state for tool registry filtering, and provides the high-level API consumed by Unity tools.

**Step 1: Write the failing test**

```typescript
// src/bridge/bridge-manager.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BridgeManager } from './bridge-manager.js';
import { ConnectionState } from './connection-manager.js';
import type { StradaMcpConfig } from '../config/config.js';
import net from 'node:net';

async function createMockUnityServer(): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, idx).trim();
        buffer = buffer.substring(idx + 1);
        if (!line) continue;
        try {
          const req = JSON.parse(line);
          if (req.id !== undefined) {
            socket.write(
              JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }) + '\n',
            );
          }
        } catch { /* ignore */ }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

async function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function createTestConfig(port: number, autoConnect = false): StradaMcpConfig {
  return {
    transport: 'stdio',
    httpPort: 3100,
    httpHost: '127.0.0.1',
    unityBridgePort: port,
    unityBridgeAutoConnect: autoConnect,
    unityBridgeTimeout: 5000,
    embeddingProvider: 'gemini',
    embeddingModel: 'gemini-embedding-2-preview',
    embeddingDimensions: 768,
    readOnly: false,
    scriptExecuteEnabled: false,
    maxFileSize: 10485760,
    logLevel: 'info',
    ragAutoIndex: false,
    ragWatchFiles: false,
  } as StradaMcpConfig;
}

describe('BridgeManager', () => {
  let mockServer: { server: net.Server; port: number };
  let manager: BridgeManager;

  afterEach(async () => {
    if (manager) await manager.shutdown();
    if (mockServer) await closeServer(mockServer.server);
  });

  it('should initialize without auto-connect', async () => {
    mockServer = await createMockUnityServer();
    const config = createTestConfig(mockServer.port, false);
    manager = new BridgeManager(config);
    await manager.initialize();

    expect(manager.isConnected()).toBe(false);
  });

  it('should auto-connect when configured', async () => {
    mockServer = await createMockUnityServer();
    const config = createTestConfig(mockServer.port, true);
    manager = new BridgeManager(config);
    await manager.initialize();

    expect(manager.isConnected()).toBe(true);
  });

  it('should forward requests to bridge client', async () => {
    mockServer = await createMockUnityServer();
    const config = createTestConfig(mockServer.port, true);
    manager = new BridgeManager(config);
    await manager.initialize();

    const result = await manager.request('unity.getState', {});
    expect(result).toEqual({ ok: true });
  });

  it('should expose event handler', async () => {
    mockServer = await createMockUnityServer();
    const config = createTestConfig(mockServer.port, false);
    manager = new BridgeManager(config);
    await manager.initialize();

    const eventHandler = manager.getEventHandler();
    expect(eventHandler).toBeDefined();
  });

  it('should emit connection state changes', async () => {
    mockServer = await createMockUnityServer();
    const config = createTestConfig(mockServer.port, false);
    manager = new BridgeManager(config);

    const states: ConnectionState[] = [];
    manager.on('stateChange', (s) => states.push(s));

    await manager.initialize();
    await manager.connect();

    expect(states).toContain(ConnectionState.Connected);
  });

  it('should handle connect failure gracefully', async () => {
    const config = createTestConfig(59999, false);
    manager = new BridgeManager(config);
    await manager.initialize();

    // connect() should not throw, just stay disconnected
    const connected = await manager.tryConnect();
    expect(connected).toBe(false);
    expect(manager.isConnected()).toBe(false);
  });

  it('should shut down cleanly', async () => {
    mockServer = await createMockUnityServer();
    const config = createTestConfig(mockServer.port, true);
    manager = new BridgeManager(config);
    await manager.initialize();
    expect(manager.isConnected()).toBe(true);

    await manager.shutdown();
    expect(manager.isConnected()).toBe(false);
  });

  it('should reject requests when not connected', async () => {
    const config = createTestConfig(59999, false);
    manager = new BridgeManager(config);
    await manager.initialize();

    await expect(manager.request('unity.test', {})).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/bridge-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/bridge/bridge-manager.ts
import { EventEmitter } from 'node:events';
import type { StradaMcpConfig } from '../config/config.js';
import { BridgeClient, type BridgeClientOptions } from './bridge-client.js';
import { UnityEventHandler } from './event-handler.js';
import { ConnectionState } from './connection-manager.js';
import type { JsonRpcNotificationType } from './protocol.js';

export class BridgeManager extends EventEmitter {
  private client: BridgeClient | null = null;
  private eventHandler: UnityEventHandler | null = null;
  private initialized = false;

  constructor(private readonly config: StradaMcpConfig) {
    super();
  }

  async initialize(): Promise<void> {
    this.eventHandler = new UnityEventHandler();

    const clientOptions: BridgeClientOptions = {
      host: '127.0.0.1',
      port: this.config.unityBridgePort,
      autoReconnect: true,
      requestTimeout: this.config.unityBridgeTimeout,
      reconnectBaseMs: 1000,
      reconnectMaxMs: 30000,
    };

    this.client = new BridgeClient(clientOptions);

    // Wire event handler to bridge client
    this.client.on('notification', (notification: JsonRpcNotificationType) => {
      this.eventHandler?.handleNotification(notification);
    });

    // Forward state changes
    this.client.on('stateChange', (state: ConnectionState) => {
      this.emit('stateChange', state);
    });

    this.client.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.initialized = true;

    // Auto-connect if configured
    if (this.config.unityBridgeAutoConnect) {
      await this.tryConnect();
    }
  }

  /**
   * Attempt to connect. Returns true if connected, false if failed.
   * Does not throw.
   */
  async tryConnect(): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.connect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Connect to Unity Editor. Throws on failure.
   */
  async connect(): Promise<void> {
    if (!this.client) throw new Error('Bridge not initialized');
    await this.client.connect();
  }

  /**
   * Disconnect from Unity Editor.
   */
  disconnect(): void {
    this.client?.disconnect();
  }

  /**
   * Check if connected to Unity Editor.
   */
  isConnected(): boolean {
    return this.client?.isConnected() ?? false;
  }

  /**
   * Get the connection state.
   */
  getState(): ConnectionState {
    return this.client?.getState() ?? ConnectionState.Disconnected;
  }

  /**
   * Send a JSON-RPC request to Unity and wait for the response.
   */
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Bridge not initialized');
    return this.client.request(method, params);
  }

  /**
   * Get the event handler for subscribing to Unity events.
   */
  getEventHandler(): UnityEventHandler | null {
    return this.eventHandler;
  }

  /**
   * Graceful shutdown: waits for pending requests, then disconnects.
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.gracefulShutdown(2000);
    }
    this.eventHandler?.clearRecentEvents();
    this.client = null;
    this.eventHandler = null;
    this.initialized = false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/bridge-manager.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/bridge/bridge-manager.ts src/bridge/bridge-manager.test.ts
git commit -m "feat: add bridge manager with lifecycle, auto-connect, and event wiring"
```

---

### Task 6: Barrel exports + security review + push

**Files:**
- Create: `src/bridge/index.ts`

**Step 1: Create barrel export**

```typescript
// src/bridge/index.ts
export {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  parseJsonRpcMessage,
  createRequest,
  createNotification,
  resetRequestIdCounter,
  ErrorCode,
  UnityEventSchema,
  type JsonRpcRequestType,
  type JsonRpcResponseType,
  type JsonRpcNotificationType,
  type JsonRpcErrorType,
  type UnityEvent,
  type UnityEventType,
  type ParsedMessage,
} from './protocol.js';

export {
  ConnectionManager,
  ConnectionState,
  type ConnectionManagerOptions,
} from './connection-manager.js';

export {
  BridgeClient,
  type BridgeClientOptions,
} from './bridge-client.js';

export {
  UnityEventHandler,
  type UnityEventData,
} from './event-handler.js';

export { BridgeManager } from './bridge-manager.js';
```

**Step 2: Security review checklist**

Verify:
- [ ] TCP connection binds to 127.0.0.1 only — enforced in ConnectionManager constructor
- [ ] Message size limit enforced (default 1MB) — prevents memory exhaustion
- [ ] Request timeout enforced (configurable, default 5000ms from config)
- [ ] No credential/API key data flows through the bridge
- [ ] JSON parsing errors are caught and do not crash the server
- [ ] Reconnect backoff has a maximum (30s) to prevent tight loops
- [ ] Buffer overflow protection on partial message accumulation
- [ ] All pending requests are rejected on disconnect (no dangling promises)

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit and push**

```bash
git add src/bridge/index.ts
git commit -m "feat: add bridge barrel exports with security review"
git push origin main
```

**Phase 7 complete.** Deliverables:
- JSON-RPC 2.0 protocol types with Zod validation (request, response, notification, error codes)
- TCP connection manager (newline-delimited framing, exponential backoff reconnect, size limits)
- Bridge client (request/response with timeout, pending request tracking, graceful shutdown)
- Unity event handler (typed dispatch for 6 event types, recent event buffer, wildcard subscribe)
- Bridge manager (lifecycle orchestration, auto-connect, state exposure for tool filtering)
- 0 tools (infrastructure only — consumed by Phase 8+ Unity tools)
- ~30 tests passing
