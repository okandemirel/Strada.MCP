import { z } from 'zod';

const boolFromEnv = z
  .string()
  .transform((v) => v === 'true')
  .pipe(z.boolean())
  .or(z.boolean());

const configSchema = z.object({
  // Transport
  transport: z.enum(['stdio', 'http']).default('stdio'),
  httpPort: z.coerce.number().int().min(1).max(65535).default(3100),
  httpHost: z.string().default('127.0.0.1'),

  // Unity Bridge
  unityBridgePort: z.coerce.number().int().min(1).max(65535).default(7691),
  unityBridgeAutoConnect: boolFromEnv.default(true),
  unityBridgeTimeout: z.coerce.number().int().min(1000).max(30000).default(5000),
  unityProjectPath: z.string().optional(),

  // RAG
  embeddingProvider: z.enum(['gemini', 'openai', 'ollama']).default('gemini'),
  embeddingModel: z.string().default('gemini-embedding-2-preview'),
  embeddingDimensions: z.coerce.number().int().min(128).max(3072).default(768),
  embeddingApiKey: z.string().optional(),
  ragAutoIndex: boolFromEnv.default(true),
  ragWatchFiles: boolFromEnv.default(false),

  // Brain Bridge
  brainUrl: z.string().url().optional().or(z.literal('')),
  brainApiKey: z.string().optional(),

  // Security
  allowedPaths: z.string().optional(),
  readOnly: boolFromEnv.default(false),
  scriptExecuteEnabled: boolFromEnv.default(false),
  reflectionInvokeEnabled: boolFromEnv.default(false),
  maxFileSize: z.coerce.number().int().min(1024).max(104857600).default(10485760),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),
});

export type StradaMcpConfig = z.infer<typeof configSchema>;

export function loadConfig(): StradaMcpConfig {
  return configSchema.parse({
    transport: process.env.MCP_TRANSPORT,
    httpPort: process.env.MCP_HTTP_PORT,
    httpHost: process.env.MCP_HTTP_HOST,
    unityBridgePort: process.env.UNITY_BRIDGE_PORT,
    unityBridgeAutoConnect: process.env.UNITY_BRIDGE_AUTO_CONNECT,
    unityBridgeTimeout: process.env.UNITY_BRIDGE_TIMEOUT,
    unityProjectPath: process.env.UNITY_PROJECT_PATH,
    embeddingProvider: process.env.EMBEDDING_PROVIDER,
    embeddingModel: process.env.EMBEDDING_MODEL,
    embeddingDimensions: process.env.EMBEDDING_DIMENSIONS,
    embeddingApiKey: process.env.EMBEDDING_API_KEY,
    ragAutoIndex: process.env.RAG_AUTO_INDEX,
    ragWatchFiles: process.env.RAG_WATCH_FILES,
    brainUrl: process.env.BRAIN_URL,
    brainApiKey: process.env.BRAIN_API_KEY,
    allowedPaths: process.env.ALLOWED_PATHS,
    readOnly: process.env.READ_ONLY,
    scriptExecuteEnabled: process.env.SCRIPT_EXECUTE_ENABLED,
    reflectionInvokeEnabled: process.env.REFLECTION_INVOKE_ENABLED,
    maxFileSize: process.env.MAX_FILE_SIZE,
    logLevel: process.env.LOG_LEVEL,
    logFile: process.env.LOG_FILE,
  });
}
