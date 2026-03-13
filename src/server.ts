import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from './tools/tool-registry.js';
import { ResourceRegistry } from './resources/resource-registry.js';
import { PromptRegistry } from './prompts/prompt-registry.js';

export interface StradaMcpServerInstance {
  server: McpServer;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
}

export function createMcpServer(): StradaMcpServerInstance {
  const server = new McpServer({
    name: 'strada-mcp',
    version: '1.0.0',
  });

  const toolRegistry = new ToolRegistry();
  const resourceRegistry = new ResourceRegistry();
  const promptRegistry = new PromptRegistry();

  return { server, toolRegistry, resourceRegistry, promptRegistry };
}
