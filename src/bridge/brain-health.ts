import { EventEmitter } from 'node:events';
import { BrainClient } from './brain-client.js';

export type BrainConnectionState = 'disconnected' | 'connected' | 'error';

export interface BrainHealthOptions {
  /** Interval between heartbeat health checks in ms (default: 60000) */
  heartbeatIntervalMs?: number;
}

/**
 * Monitors Brain connectivity with periodic heartbeats.
 *
 * State machine:
 *   disconnected --[health ok]--> connected
 *   connected --[health fail]--> disconnected
 *   disconnected --[health fail]--> error
 *   error --[health ok]--> connected
 *   error --[health fail]--> error (no event)
 *
 * Emits:
 *   'stateChange' (newState: BrainConnectionState) — only when state changes
 */
export class BrainHealthManager extends EventEmitter {
  private state: BrainConnectionState = 'disconnected';
  private brainVersion: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly client: BrainClient,
    options: BrainHealthOptions = {},
  ) {
    super();
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60_000;
  }

  /**
   * Current connection state.
   */
  getState(): BrainConnectionState {
    return this.state;
  }

  /**
   * Whether Brain is currently reachable.
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Brain version string from last successful health check.
   */
  getBrainVersion(): string | null {
    return this.brainVersion;
  }

  /**
   * Perform an immediate health check and update state.
   */
  async checkNow(): Promise<BrainConnectionState> {
    const result = await this.client.healthCheck();

    if (result.ok) {
      this.brainVersion = result.version ?? null;
      this.setState('connected');
    } else {
      // Transition: connected -> disconnected, disconnected -> error
      if (this.state === 'connected') {
        this.setState('disconnected');
      } else if (this.state === 'disconnected') {
        this.setState('error');
      }
      // error -> error: no state change event
    }

    return this.state;
  }

  /**
   * Start periodic heartbeat.
   */
  start(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(async () => {
      await this.checkNow();
    }, this.heartbeatIntervalMs);

    // Run first check immediately
    void this.checkNow();
  }

  /**
   * Stop periodic heartbeat.
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(newState: BrainConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.emit('stateChange', newState);
  }
}
