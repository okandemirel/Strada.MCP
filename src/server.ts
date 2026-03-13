import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from './tools/tool-registry.js';

export interface StradaMcpServerInstance {
  server: McpServer;
  toolRegistry: ToolRegistry;
}

export function createMcpServer(): StradaMcpServerInstance {
  const server = new McpServer({
    name: 'strada-mcp',
    version: '1.0.0',
  });

  const toolRegistry = new ToolRegistry();

  return { server, toolRegistry };
}
