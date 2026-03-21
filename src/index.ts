#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { bootstrap } from './bootstrap.js';
import { UnityEditorRouter } from './bridge/unity-editor-router.js';
import { loadConfig } from './config/config.js';
import { startHttpTransport, type HttpTransportHandle } from './http/http-transport.js';
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

  const unityEditorRouter = new UnityEditorRouter({
    projectPath: config.unityProjectPath ?? process.cwd(),
    preferredPort: config.unityBridgePort,
    preferredInstanceId: config.unityBridgeInstanceId,
    discoveryEnabled: config.unityBridgeDiscoveryEnabled,
    staleAfterMs: config.unityBridgeDiscoveryTtlMs,
    autoConnect: config.unityBridgeAutoConnect,
    timeoutMs: config.unityBridgeTimeout,
    logLevel: config.logLevel,
    logger: logger.child('unity-router'),
    toolContext: result.toolContext,
    bridgeAwareTools: result.bridgeAwareTools,
    bridgeAwareResources: result.bridgeAwareResources,
    editorRouterAwareTools: result.editorRouterAwareTools,
  });
  const initialRouteStatus = await unityEditorRouter.initialize();
  if (initialRouteStatus.activeInstance) {
    logger.info(
      `Selected Unity editor ${initialRouteStatus.activeInstance.instanceId} ` +
      `(${initialRouteStatus.activeInstance.projectName}) on port ${initialRouteStatus.activePort} ` +
      `via ${initialRouteStatus.selectionSource}`,
    );
  }
  for (const warning of initialRouteStatus.warnings) {
    logger.warn(warning);
  }

  // Transport
  let httpTransport: HttpTransportHandle | null = null;
  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Connected via stdio transport');
  } else {
    httpTransport = await startHttpTransport(server, {
      host: config.httpHost,
      port: config.httpPort,
      logger,
    });
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    unityEditorRouter.destroy();
    try { await httpTransport?.close(); } catch { /* ignore */ }
    try { await server.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
