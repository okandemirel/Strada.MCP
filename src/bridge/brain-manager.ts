import { EventEmitter } from 'node:events';
import { BrainClient } from './brain-client.js';
import { BrainHealthManager, type BrainConnectionState } from './brain-health.js';
import { ContextEnrichment } from './context-enrichment.js';
import { ResultMerger } from '../intelligence/rag/result-merger.js';

export interface BrainManagerOptions {
  /** Brain HTTP base URL (empty string = disabled) */
  brainUrl: string;
  /** API key for Brain authentication */
  brainApiKey: string;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** Heartbeat interval in ms (default: 60000) */
  heartbeatIntervalMs?: number;
  /** Max retries on failure (default: 3) */
  maxRetries?: number;
  /** Base retry delay in ms (default: 1000) */
  baseRetryDelayMs?: number;
  /** Max retry delay in ms (default: 30000) */
  maxRetryDelayMs?: number;
  /** Enrichment cache TTL in ms (default: 30000) */
  enrichmentCacheTtlMs?: number;
}

export interface BrainStatus {
  enabled: boolean;
  connected: boolean;
  state: BrainConnectionState | 'disabled';
  brainVersion: string | null;
  brainUrl: string;
}

/**
 * Top-level integration manager for the Brain bridge.
 *
 * Responsibilities:
 * - Creates and owns BrainClient, BrainHealthManager, ContextEnrichment, ResultMerger
 * - Performs initial health check on initialize()
 * - Starts periodic heartbeat
 * - Forwards state change events
 * - Provides isConnected() for MCP server status
 * - Clean shutdown of all components
 *
 * When brainUrl is empty, all components are null and isEnabled() returns false.
 * The MCP server should check isEnabled() before attempting any Brain operations.
 */
export class BrainManager extends EventEmitter {
  private client: BrainClient | null = null;
  private healthManager: BrainHealthManager | null = null;
  private enrichment: ContextEnrichment | null = null;
  private resultMerger: ResultMerger | null = null;
  private readonly enabled: boolean;
  private readonly options: BrainManagerOptions;

  constructor(options: BrainManagerOptions) {
    super();
    this.options = options;
    this.enabled = Boolean(options.brainUrl && options.brainUrl.trim());
  }

  /**
   * Whether Brain integration is configured (brainUrl is set).
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Whether Brain is currently reachable.
   * Returns false if disabled or disconnected.
   */
  isConnected(): boolean {
    return this.healthManager?.isConnected() ?? false;
  }

  /**
   * Brain version from last successful health check.
   */
  getBrainVersion(): string | null {
    return this.healthManager?.getBrainVersion() ?? null;
  }

  /**
   * Initialize all Brain bridge components and perform initial health check.
   * Safe to call even when disabled (no-op).
   */
  async initialize(): Promise<void> {
    if (!this.enabled) return;

    // Create HTTP client
    this.client = new BrainClient({
      baseUrl: this.options.brainUrl,
      apiKey: this.options.brainApiKey,
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      baseRetryDelayMs: this.options.baseRetryDelayMs,
      maxRetryDelayMs: this.options.maxRetryDelayMs,
    });

    // Create health manager
    this.healthManager = new BrainHealthManager(this.client, {
      heartbeatIntervalMs: this.options.heartbeatIntervalMs,
    });

    // Forward state change events
    this.healthManager.on('stateChange', (state: BrainConnectionState) => {
      this.emit('brainStateChange', state);
    });

    // Create context enrichment
    this.enrichment = new ContextEnrichment(this.client, this.healthManager, {
      cacheTtlMs: this.options.enrichmentCacheTtlMs,
    });

    // Create result merger
    this.resultMerger = new ResultMerger();

    // Initial health check (don't throw on failure)
    await this.healthManager.checkNow();

    // Start periodic heartbeat
    this.healthManager.start();
  }

  /**
   * Stop heartbeat and release all resources.
   */
  shutdown(): void {
    if (this.healthManager) {
      this.healthManager.stop();
      this.healthManager.removeAllListeners();
    }

    if (this.enrichment) {
      this.enrichment.clearCache();
    }

    this.client = null;
    this.healthManager = null;
    this.enrichment = null;
    this.resultMerger = null;
  }

  /**
   * Get the Brain HTTP client (null if disabled).
   */
  getClient(): BrainClient | null {
    return this.client;
  }

  /**
   * Get the health manager (null if disabled).
   */
  getHealthManager(): BrainHealthManager | null {
    return this.healthManager;
  }

  /**
   * Get the context enrichment service (null if disabled).
   */
  getEnrichment(): ContextEnrichment | null {
    return this.enrichment;
  }

  /**
   * Get the result merger (null if disabled).
   */
  getResultMerger(): ResultMerger | null {
    return this.resultMerger;
  }

  /**
   * Full status summary for diagnostics.
   */
  getStatus(): BrainStatus {
    return {
      enabled: this.enabled,
      connected: this.isConnected(),
      state: this.enabled
        ? (this.healthManager?.getState() ?? 'disconnected')
        : 'disabled',
      brainVersion: this.getBrainVersion(),
      brainUrl: this.options.brainUrl,
    };
  }
}
