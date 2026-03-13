import { EventEmitter } from 'node:events';
import {
  type JsonRpcResponseType,
  parseJsonRpcMessage,
} from './protocol.js';
import { ConnectionManager, ConnectionState } from './connection-manager.js';

export interface BridgeClientOptions {
  timeoutMs: number; // per-request timeout
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class BridgeClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();

  constructor(
    private readonly connection: ConnectionManager,
    private readonly options: BridgeClientOptions,
  ) {
    super();
    this.connection.on('message', (raw: string) => this.handleMessage(raw));
    this.connection.on('stateChange', (state: ConnectionState) => {
      if (state === ConnectionState.Disconnected) {
        this.rejectAllPending(new Error('Connection lost'));
      }
    });
  }

  /**
   * Sends a JSON-RPC request and waits for the matching response.
   */
  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connection.isConnected()) {
      throw new Error('Not connected to Unity');
    }

    const id = this.nextId++;
    const message = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined && { params }),
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method} (id=${id}, ${this.options.timeoutMs}ms)`));
      }, this.options.timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      try {
        this.connection.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Sends a JSON-RPC notification (no response expected).
   */
  notify(method: string, params?: Record<string, unknown>): void {
    const message = JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params !== undefined && { params }),
    });
    this.connection.send(message);
  }

  /**
   * Returns the number of pending requests.
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Cleans up all pending requests and removes listeners.
   */
  destroy(): void {
    this.rejectAllPending(new Error('Bridge client destroyed'));
    this.connection.removeAllListeners('message');
  }

  private handleMessage(raw: string): void {
    let parsed;
    try {
      parsed = parseJsonRpcMessage(raw);
    } catch {
      // Not a valid JSON-RPC message, ignore
      return;
    }

    if (parsed.type === 'response') {
      this.handleResponse(parsed.message);
    } else if (parsed.type === 'notification') {
      this.emit('notification', parsed.message);
    }
    // Requests from Unity are forwarded as events
    else if (parsed.type === 'request') {
      this.emit('request', parsed.message);
    }
  }

  private handleResponse(response: JsonRpcResponseType): void {
    const pending = this.pending.get(response.id as number | string);
    if (!pending) return; // No matching request (orphan response)

    clearTimeout(pending.timer);
    this.pending.delete(response.id as number | string);

    if (response.error) {
      const err = new Error(response.error.message);
      (err as Error & { code: number }).code = response.error.code;
      (err as Error & { data: unknown }).data = response.error.data;
      pending.reject(err);
    } else {
      pending.resolve(response.result);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [_id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
