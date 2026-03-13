import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RagManager } from './rag-manager.js';
import type { StradaMcpConfig } from '../../config/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createTestConfig(overrides: Partial<StradaMcpConfig> = {}): StradaMcpConfig {
  return {
    transport: 'stdio',
    httpPort: 3100,
    httpHost: '127.0.0.1',
    unityBridgePort: 7691,
    unityBridgeAutoConnect: false,
    unityBridgeTimeout: 5000,
    embeddingProvider: 'gemini',
    embeddingModel: 'gemini-embedding-2-preview',
    embeddingDimensions: 128,
    embeddingApiKey: undefined,
    ragAutoIndex: false,
    ragWatchFiles: false,
    readOnly: false,
    scriptExecuteEnabled: false,
    maxFileSize: 10485760,
    logLevel: 'info',
    ...overrides,
  } as StradaMcpConfig;
}

describe('RagManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-rag-mgr-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should initialize with mock provider when no API key', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    // Should not throw — falls back gracefully
    await expect(manager.initialize(tmpDir)).resolves.not.toThrow();
    manager.shutdown();
  });

  it('should expose indexer and search after initialization', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    await manager.initialize(tmpDir);

    expect(manager.getIndexer()).toBeDefined();
    expect(manager.getHybridSearch()).toBeDefined();
    expect(manager.getStore()).toBeDefined();
    manager.shutdown();
  });

  it('should report isInitialized correctly', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    expect(manager.isInitialized()).toBe(false);
    await manager.initialize(tmpDir);
    expect(manager.isInitialized()).toBe(true);
    manager.shutdown();
  });

  it('should shut down cleanly', async () => {
    const config = createTestConfig();
    const manager = new RagManager(config, tmpDir);
    await manager.initialize(tmpDir);
    manager.shutdown();
    expect(manager.isInitialized()).toBe(false);
  });
});
