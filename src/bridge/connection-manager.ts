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
  reconnectBaseMs?: number; // default: 1000
  reconnectMaxMs?: number; // default: 30000
  maxMessageSize?: number; // default: 1MB
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

      const onConnect = (): void => {
        this.reconnectAttempt = 0;
        this.setState(ConnectionState.Connected);
        resolve();
      };

      const onError = (err: Error): void => {
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

  private handleData(data: Buffer | string): void {
    this.buffer += data.toString('utf-8');

    // Process complete newline-delimited messages
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).trim();
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (!line) continue;

      // Enforce message size limit
      if (line.length > this.maxMessageSize) {
        this.emit(
          'error',
          new Error(`Message exceeds size limit (${line.length} > ${this.maxMessageSize})`),
        );
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
        // connect() failed -- will be rescheduled via the close handler
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
