#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { loadConfig } from './config/config.js';
import { createLogger } from './utils/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, 'StradaMCP');

  logger.info(`Starting Strada.MCP (transport: ${config.transport})`);

  const { server } = createMcpServer();

  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Connected via stdio transport');
  } else {
    // Streamable HTTP transport — implemented in Phase 7
    logger.warn('HTTP transport not yet implemented, falling back to stdio');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
