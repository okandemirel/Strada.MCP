import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load default config', () => {
    const config = loadConfig();
    expect(config.transport).toBe('stdio');
    expect(config.httpPort).toBe(3100);
    expect(config.httpHost).toBe('127.0.0.1');
    expect(config.unityBridgePort).toBe(7691);
    expect(config.unityBridgeAutoConnect).toBe(true);
    expect(config.embeddingProvider).toBe('gemini');
    expect(config.embeddingDimensions).toBe(768);
    expect(config.readOnly).toBe(false);
    expect(config.scriptExecuteEnabled).toBe(false);
    expect(config.logLevel).toBe('info');
  });

  it('should override via environment variables', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '4000';
    process.env.UNITY_BRIDGE_PORT = '9999';
    process.env.READ_ONLY = 'true';
    process.env.LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.transport).toBe('http');
    expect(config.httpPort).toBe(4000);
    expect(config.unityBridgePort).toBe(9999);
    expect(config.readOnly).toBe(true);
    expect(config.logLevel).toBe('debug');
  });

  it('should reject invalid transport', () => {
    process.env.MCP_TRANSPORT = 'websocket';
    expect(() => loadConfig()).toThrow();
  });

  it('should reject invalid embedding dimensions', () => {
    process.env.EMBEDDING_DIMENSIONS = '50';
    expect(() => loadConfig()).toThrow();
  });

  it('should reject invalid log level', () => {
    process.env.LOG_LEVEL = 'verbose';
    expect(() => loadConfig()).toThrow();
  });
});
