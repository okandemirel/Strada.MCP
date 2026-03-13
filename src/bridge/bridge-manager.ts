import { EventEmitter } from 'node:events';
import { ConnectionManager, ConnectionState } from './connection-manager.js';
import { BridgeClient } from './bridge-client.js';
import { EventHandler } from './event-handler.js';
import type { StradaMcpConfig } from '../config/config.js';
import { createLogger, type Logger } from '../utils/logger.js';

export interface BridgeManagerOptions {
  port: number;
  autoConnect: boolean;
  timeoutMs: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class BridgeManager extends EventEmitter {
  private readonly connectionManager: ConnectionManager;
  private readonly bridgeClient: BridgeClient;
  private readonly eventHandler: EventHandler;
  private readonly logger: Logger;

  constructor(options: BridgeManagerOptions) {
    super();

    this.logger = createLogger(options.logLevel ?? 'info', 'bridge');

    this.connectionManager = new ConnectionManager({
      host: '127.0.0.1',
      port: options.port,
      autoReconnect: true,
      reconnectBaseMs: 1000,
      reconnectMaxMs: 30000,
    });

    this.bridgeClient = new BridgeClient(this.connectionManager, {
      timeoutMs: options.timeoutMs,
    });

    this.eventHandler = new EventHandler(this.bridgeClient);

    // Forward connection state events
    this.connectionManager.on('stateChange', (state: ConnectionState) => {
      this.logger.info(`Connection state: ${state}`);
      this.emit('stateChange', state);
    });

    this.connectionManager.on('error', (err: Error) => {
      this.logger.error('Connection error', err);
      this.emit('error', err);
    });

    // Forward Unity events
    this.eventHandler.on('event', (event) => {
      this.emit('unityEvent', event);
    });
  }

  /**
   * Creates a BridgeManager from the application config.
   */
  static fromConfig(config: StradaMcpConfig): BridgeManager {
    return new BridgeManager({
      port: config.unityBridgePort,
      autoConnect: config.unityBridgeAutoConnect,
      timeoutMs: config.unityBridgeTimeout,
      logLevel: config.logLevel,
    });
  }

  /**
   * Connects to Unity Editor.
   */
  async connect(): Promise<void> {
    this.logger.info('Connecting to Unity...');
    await this.connectionManager.connect();
    this.logger.info('Connected to Unity');
  }

  /**
   * Disconnects from Unity Editor.
   */
  disconnect(): void {
    this.logger.info('Disconnecting from Unity');
    this.connectionManager.disconnect();
  }

  /**
   * Returns whether the bridge is currently connected.
   */
  get isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  /**
   * Returns the current connection state.
   */
  get state(): ConnectionState {
    return this.connectionManager.getState();
  }

  /**
   * Returns the bridge client for making requests.
   */
  get client(): BridgeClient {
    return this.bridgeClient;
  }

  /**
   * Returns the event handler for subscribing to Unity events.
   */
  get events(): EventHandler {
    return this.eventHandler;
  }

  /**
   * Cleans up all resources.
   */
  destroy(): void {
    this.logger.info('Destroying bridge manager');
    this.eventHandler.destroy();
    this.bridgeClient.destroy();
    this.connectionManager.disconnect();
    this.removeAllListeners();
  }
}
