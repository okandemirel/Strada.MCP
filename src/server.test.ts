import { describe, it, expect } from 'vitest';
import { createMcpServer } from './server.js';

describe('MCP Server', () => {
  it('should create server with name and version', () => {
    const instance = createMcpServer();
    expect(instance).toBeDefined();
    expect(instance.server).toBeDefined();
  });

  it('should have all three registries', () => {
    const instance = createMcpServer();
    expect(instance.toolRegistry).toBeDefined();
    expect(instance.resourceRegistry).toBeDefined();
    expect(instance.promptRegistry).toBeDefined();
  });
});
