#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { bootstrap } from './bootstrap.js';
import { BridgeManager } from './bridge/bridge-manager.js';
import { loadConfig } from './config/config.js';
import { createLogger } from './utils/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, 'StradaMCP');

  logger.info(`Starting Strada.MCP (transport: ${config.transport})`);

  const { server, toolRegistry, resourceRegistry, promptRegistry } = createMcpServer();

  // Register all tools, resources, and prompts
  const result = bootstrap({ config, server, toolRegistry, resourceRegistry, promptRegistry });
  logger.info(
    `Registered ${toolRegistry.getAll().length} tools, ` +
    `${resourceRegistry.getAll().length} resources, ` +
    `${promptRegistry.getAll().length} prompts`,
  );

  // Start Unity bridge (non-blocking)
  let bridgeManager: BridgeManager | null = null;
  if (config.unityBridgeAutoConnect) {
    bridgeManager = BridgeManager.fromConfig(config);
    bridgeManager.on('stateChange', (state: string) => {
      logger.info(`Unity bridge: ${state}`);
      // Update the shared toolContext when bridge connects/disconnects
      result.toolContext.unityBridgeConnected = state === 'connected';

      // Inject bridge client into bridge-aware tools and resources
      if (state === 'connected' && bridgeManager) {
        const client = bridgeManager.client;
        for (const tool of result.bridgeAwareTools) {
          tool.setBridgeClient(client);
        }
        for (const resource of result.bridgeAwareResources) {
          resource.setBridgeClient(client);
        }
      }
    });
    bridgeManager.on('error', (err: Error) => {
      logger.warn(`Unity bridge error: ${err.message}`);
    });
    bridgeManager.connect().catch((err: Error) => {
      logger.warn(`Unity bridge connect failed: ${err.message}`);
    });
  }

  // Transport
  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Connected via stdio transport');
  } else {
    logger.warn('HTTP transport not yet implemented, falling back to stdio');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    bridgeManager?.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
