import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../../server.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { ResourceRegistry } from '../../resources/resource-registry.js';
import { PromptRegistry } from '../../prompts/prompt-registry.js';

describe('MCP Server Integration', () => {
  it('should create server instance', () => {
    const { server, toolRegistry } = createMcpServer();
    expect(server).toBeDefined();
    expect(toolRegistry).toBeDefined();
  });

  it('should have empty registries before bootstrap', () => {
    const { toolRegistry, resourceRegistry, promptRegistry } = createMcpServer();
    expect(toolRegistry.getAll()).toHaveLength(0);
    expect(resourceRegistry.getAll()).toHaveLength(0);
    expect(promptRegistry.getAll()).toHaveLength(0);
  });

  it('should register all tools/resources/prompts via bootstrap', async () => {
    const { server, toolRegistry, resourceRegistry, promptRegistry } = createMcpServer();
    const { loadConfig } = await import('../../config/config.js');
    const { bootstrap } = await import('../../bootstrap.js');
    const config = loadConfig();
    bootstrap({ config, server, toolRegistry, resourceRegistry, promptRegistry });

    // Verify substantial registration counts
    expect(toolRegistry.getAll().length).toBeGreaterThanOrEqual(60);
    expect(resourceRegistry.getAll().length).toBe(15);
    expect(promptRegistry.getAll().length).toBe(6);
  });

  it('should allow registering tools to the registry', () => {
    const { toolRegistry } = createMcpServer();
    const mockTool = {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: {} },
      metadata: { category: 'file' as const, requiresBridge: false, dangerous: false, readOnly: true },
      execute: async () => ({ content: 'ok' }),
    };
    toolRegistry.register(mockTool);
    expect(toolRegistry.getAll()).toHaveLength(1);
    expect(toolRegistry.get('test_tool')).toBe(mockTool);
  });

  it('resource registry should accept and retrieve resources', () => {
    const registry = new ResourceRegistry();
    const mockResource = {
      uri: 'strada://test',
      name: 'test',
      metadata: { requiresBridge: false, description: 'test' },
      read: async () => ({ uri: 'strada://test', mimeType: 'text/plain', text: 'ok' }),
    };
    registry.register(mockResource);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('strada://test')).toBe(mockResource);
  });

  it('resource registry should filter by bridge availability', () => {
    const registry = new ResourceRegistry();
    const bridgeResource = {
      uri: 'strada://bridge',
      name: 'bridge',
      metadata: { requiresBridge: true, description: 'needs bridge' },
      read: async () => ({ uri: 'strada://bridge', mimeType: 'text/plain', text: 'ok' }),
    };
    const localResource = {
      uri: 'strada://local',
      name: 'local',
      metadata: { requiresBridge: false, description: 'local' },
      read: async () => ({ uri: 'strada://local', mimeType: 'text/plain', text: 'ok' }),
    };
    registry.register(bridgeResource);
    registry.register(localResource);

    expect(registry.getAvailable(true)).toHaveLength(2);
    expect(registry.getAvailable(false)).toHaveLength(1);
    expect(registry.getAvailable(false)[0].uri).toBe('strada://local');
  });

  it('prompt registry should accept and retrieve prompts', () => {
    const registry = new PromptRegistry();
    const mockPrompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      arguments: [{ name: 'arg1', description: 'an arg', required: true }],
      render: async () => [{ role: 'user' as const, content: { type: 'text' as const, text: 'hello' } }],
    };
    registry.register(mockPrompt);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('test-prompt')).toBe(mockPrompt);
  });

  it('prompt registry should prevent duplicate names', () => {
    const registry = new PromptRegistry();
    const prompt = {
      name: 'dup',
      description: 'dup',
      arguments: [],
      render: async () => [],
    };
    registry.register(prompt);
    expect(() => registry.register(prompt)).toThrow('already registered');
  });

  it('tool registry should prevent duplicate tool names', () => {
    const { toolRegistry } = createMcpServer();
    const tool = {
      name: 'dup_tool',
      description: 'dup',
      inputSchema: {},
      metadata: { category: 'file' as const, requiresBridge: false, dangerous: false, readOnly: true },
      execute: async () => ({ content: 'ok' }),
    };
    toolRegistry.register(tool);
    expect(() => toolRegistry.register(tool)).toThrow('already registered');
  });

  it('resource registry should prevent duplicate URIs', () => {
    const registry = new ResourceRegistry();
    const resource = {
      uri: 'strada://dup',
      name: 'dup',
      metadata: { requiresBridge: false, description: 'dup' },
      read: async () => ({ uri: 'strada://dup', mimeType: 'text/plain', text: 'ok' }),
    };
    registry.register(resource);
    expect(() => registry.register(resource)).toThrow('already registered');
  });
});
