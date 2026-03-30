import { EventEmitter } from 'node:events';
import {
  type JsonRpcResponseType,
  normalizeJsonRpcId,
  parseJsonRpcMessage,
} from './protocol.js';
import {
  BridgeCapabilityManifest,
  type BridgeCapabilityManifestType,
  supportsBridgeFeature,
  supportsBridgeMethod,
} from './capabilities.js';
import { ConnectionManager, ConnectionState } from './connection-manager.js';

export interface BridgeClientOptions {
  timeoutMs: number; // per-request timeout
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const CAPABILITY_METHOD = 'bridge.getCapabilities';

export class BridgeClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private capabilityManifest: BridgeCapabilityManifestType | null = null;
  private capabilityHandshake: Promise<BridgeCapabilityManifestType | null> | null = null;

  constructor(
    private readonly connection: ConnectionManager,
    private readonly options: BridgeClientOptions,
  ) {
    super();
    this.connection.on('message', (raw: string) => this.handleMessage(raw));
    this.connection.on('stateChange', (state: ConnectionState) => {
      if (state === ConnectionState.Disconnected) {
        this.capabilityManifest = null;
        this.capabilityHandshake = null;
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

    if (method !== CAPABILITY_METHOD) {
      const manifest = await this.ensureCapabilities();
      if (manifest && !supportsBridgeMethod(manifest, method)) {
        throw new Error(`Unity bridge does not advertise JSON-RPC method "${method}".`);
      }
    }

    return this.requestRaw<T>(method, params);
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

  get capabilities(): BridgeCapabilityManifestType | null {
    return this.capabilityManifest;
  }

  async ensureCapabilities(forceRefresh = false): Promise<BridgeCapabilityManifestType | null> {
    if (!this.connection.isConnected()) {
      throw new Error('Not connected to Unity');
    }

    if (!forceRefresh && this.capabilityManifest) {
      return this.capabilityManifest;
    }

    if (!forceRefresh && this.capabilityHandshake) {
      return this.capabilityHandshake;
    }

    this.capabilityManifest = null;
    this.capabilityHandshake = this.requestRaw<unknown>(CAPABILITY_METHOD, {}).then((result) => {
      const manifest = BridgeCapabilityManifest.parse(result);
      this.capabilityManifest = manifest;
      this.capabilityHandshake = null;
      return manifest;
    }).catch((error) => {
      this.capabilityHandshake = null;
      if (isOptionalCapabilityHandshakeError(error)) {
        this.capabilityManifest = null;
        return null;
      }

      throw error;
    });

    return this.capabilityHandshake;
  }

  supportsMethod(method: string): boolean | null {
    if (!this.capabilityManifest) {
      return null;
    }

    return supportsBridgeMethod(this.capabilityManifest, method);
  }

  supportsFeature(feature: string): boolean | null {
    if (!this.capabilityManifest) {
      return null;
    }

    return supportsBridgeFeature(this.capabilityManifest, feature);
  }

  /**
   * Cleans up all pending requests and removes listeners.
   */
  destroy(): void {
    this.capabilityManifest = null;
    this.capabilityHandshake = null;
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
    const normalizedId = normalizeJsonRpcId(response.id);
    if (!normalizedId) return;

    const pending = this.pending.get(normalizedId);
    if (!pending) return; // No matching request (orphan response)

    clearTimeout(pending.timer);
    this.pending.delete(normalizedId);

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

  private requestRaw<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const normalizedId = normalizeJsonRpcId(id)!;
    const message = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined && { params }),
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(normalizedId);
        reject(new Error(`Request timeout: ${method} (id=${id}, ${this.options.timeoutMs}ms)`));
      }, this.options.timeoutMs);

      this.pending.set(normalizedId, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      try {
        this.connection.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(normalizedId);
        reject(err);
      }
    });
  }
}

function isOptionalCapabilityHandshakeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as Error & { code?: number }).code;
  if (code === -32601) {
    return true;
  }

  return error.message.includes(`Request timeout: ${CAPABILITY_METHOD}`);
}
