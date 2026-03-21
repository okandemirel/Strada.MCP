import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../utils/logger.js';

export interface HttpTransportHandle {
  close(): Promise<void>;
}

export async function startHttpTransport(
  server: McpServer,
  options: {
    host: string;
    port: number;
    logger: Logger;
  },
): Promise<HttpTransportHandle> {
  let transport: StreamableHTTPServerTransport | null = null;
  let activeSessionId: string | null = null;

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.statusCode = 400;
        res.end('Missing request URL');
        return;
      }

      const url = new URL(req.url, `http://${options.host}:${options.port}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          name: 'strada-mcp',
          transport: 'streamable-http',
          connected: server.isConnected(),
          sessionId: activeSessionId,
        }));
        return;
      }

      if (url.pathname !== '/mcp') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (req.method === 'POST') {
        const parsedBody = await readJsonBody(req);
        const sessionId = headerValue(req.headers['mcp-session-id']);

        if (sessionId && transport && sessionId === activeSessionId) {
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        if (sessionId && sessionId !== activeSessionId) {
          res.statusCode = 404;
          res.end('Unknown MCP session');
          return;
        }

        if (!isInitializeRequest(parsedBody)) {
          res.statusCode = 400;
          res.end('A valid initialize request is required to create a Streamable HTTP session.');
          return;
        }

        if (transport) {
          res.statusCode = 409;
          res.end('An MCP HTTP session is already active for this process.');
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            activeSessionId = sessionId;
            options.logger.info(`HTTP Streamable session initialized (${sessionId})`);
          },
        });

        transport.onclose = () => {
          options.logger.info('HTTP Streamable transport closed');
          transport = null;
          activeSessionId = null;
        };
        transport.onerror = (error) => {
          options.logger.warn(`HTTP Streamable transport error: ${error.message}`);
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        return;
      }

      if ((req.method === 'GET' || req.method === 'DELETE') && transport) {
        const sessionId = headerValue(req.headers['mcp-session-id']);
        if (!sessionId || sessionId !== activeSessionId) {
          res.statusCode = 400;
          res.end('A valid MCP session ID is required.');
          return;
        }

        await transport.handleRequest(req, res);
        return;
      }

      res.statusCode = 405;
      res.end('Method not allowed');
    } catch (error) {
      options.logger.error('HTTP transport request failed', error instanceof Error ? error : undefined);
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end(error instanceof Error ? error.message : 'Internal server error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  options.logger.info(`HTTP transport listening on http://${options.host}:${options.port}/mcp`);

  return {
    async close() {
      if (transport) {
        await transport.close().catch(() => undefined);
        transport = null;
        activeSessionId = null;
      }
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function isInitializeRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  return (body as { method?: unknown }).method === 'initialize';
}

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && value[0]) {
    return value[0];
  }
  return null;
}
