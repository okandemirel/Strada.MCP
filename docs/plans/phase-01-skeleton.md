# Phase 1: Project Skeleton + Transport + Config

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the Strada.MCP project with TypeScript, MCP SDK, dual transport (stdio + Streamable HTTP), and Zod-validated configuration.

**Architecture:** Entry point creates MCP Server instance, registers transports based on config, and initializes tool/resource/prompt registries.

**Tech Stack:** TypeScript 5.x, @modelcontextprotocol/sdk, zod, tsx, vitest

---

### Task 1: Initialize npm project and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.prettierrc`
- Create: `vitest.config.ts`

**Step 1: Initialize project**

```bash
cd /Users/okanunico/Documents/Strada/Strada.MCP
npm init -y
```

**Step 2: Install runtime dependencies**

```bash
npm install @modelcontextprotocol/sdk zod glob better-sqlite3 hnswlib-node tree-sitter tree-sitter-c-sharp
```

**Step 3: Install dev dependencies**

```bash
npm install -D typescript vitest @types/better-sqlite3 @types/node tsx
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.env
*.log
.DS_Store
*.sqlite
*.sqlite-journal
coverage/
```

**Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    testTimeout: 10000,
  },
});
```

**Step 7: Create .prettierrc**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

**Step 8: Update package.json scripts**

Add to package.json:
```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "prettier --check src/",
    "lint:fix": "prettier --write src/"
  },
  "bin": {
    "strada-mcp": "dist/index.js"
  }
}
```

**Step 9: Commit**

```bash
git add package.json tsconfig.json .gitignore .prettierrc vitest.config.ts package-lock.json
git commit -m "feat: initialize project with TypeScript, MCP SDK, and dev tooling"
```

---

### Task 2: Configuration system with Zod validation

**Files:**
- Create: `src/config/config.ts`
- Create: `src/config/config.test.ts`

**Step 1: Write the failing test**

```typescript
// src/config/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, type StradaMcpConfig } from './config.js';

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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/config.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/config/config.ts
import { z } from 'zod';

const configSchema = z.object({
  // Transport
  transport: z.enum(['stdio', 'http']).default('stdio'),
  httpPort: z.coerce.number().int().min(1).max(65535).default(3100),
  httpHost: z.string().default('127.0.0.1'),

  // Unity Bridge
  unityBridgePort: z.coerce.number().int().min(1).max(65535).default(7691),
  unityBridgeAutoConnect: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .or(z.boolean())
    .default(true),
  unityBridgeTimeout: z.coerce.number().int().min(1000).max(30000).default(5000),
  unityProjectPath: z.string().optional(),

  // RAG
  embeddingProvider: z.enum(['gemini', 'openai', 'ollama']).default('gemini'),
  embeddingModel: z.string().default('gemini-embedding-2-preview'),
  embeddingDimensions: z.coerce.number().int().min(128).max(3072).default(768),
  embeddingApiKey: z.string().optional(),
  ragAutoIndex: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .or(z.boolean())
    .default(true),
  ragWatchFiles: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .or(z.boolean())
    .default(false),

  // Brain Bridge
  brainUrl: z.string().url().optional().or(z.literal('')),
  brainApiKey: z.string().optional(),

  // Security
  allowedPaths: z.string().optional(),
  readOnly: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .or(z.boolean())
    .default(false),
  scriptExecuteEnabled: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .or(z.boolean())
    .default(false),
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
    maxFileSize: process.env.MAX_FILE_SIZE,
    logLevel: process.env.LOG_LEVEL,
    logFile: process.env.LOG_FILE,
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/config/
git commit -m "feat: add Zod-validated configuration system"
```

---

### Task 3: Logger utility

**Files:**
- Create: `src/utils/logger.ts`
- Create: `src/utils/logger.test.ts`

**Step 1: Write the failing test**

```typescript
// src/utils/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, type Logger } from './logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('should log at configured level', () => {
    const logger = createLogger('info');
    logger.info('test message');
    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('should skip logs below configured level', () => {
    const logger = createLogger('warn');
    logger.info('should not appear');
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('should include component name', () => {
    const logger = createLogger('debug');
    const child = logger.child('MyComponent');
    child.debug('test');
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(output).toContain('MyComponent');
  });

  it('should format errors with stack trace', () => {
    const logger = createLogger('error');
    const err = new Error('test error');
    logger.error('failed', err);
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(output).toContain('test error');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/logger.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/utils/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(component: string): Logger;
}

export function createLogger(level: LogLevel, component?: string): Logger {
  const minLevel = LEVEL_ORDER[level];

  function log(msgLevel: LogLevel, msg: string, args: unknown[]): void {
    if (LEVEL_ORDER[msgLevel] < minLevel) return;

    const timestamp = new Date().toISOString();
    const prefix = component ? `[${component}]` : '';
    const errorStr = args
      .filter((a) => a instanceof Error)
      .map((e) => `\n${(e as Error).stack ?? (e as Error).message}`)
      .join('');
    const extra = args
      .filter((a) => !(a instanceof Error))
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');

    process.stderr.write(
      `${timestamp} ${msgLevel.toUpperCase().padEnd(5)} ${prefix} ${msg}${extra ? ' ' + extra : ''}${errorStr}\n`,
    );
  }

  return {
    debug: (msg, ...args) => log('debug', msg, args),
    info: (msg, ...args) => log('info', msg, args),
    warn: (msg, ...args) => log('warn', msg, args),
    error: (msg, ...args) => log('error', msg, args),
    child: (name) => createLogger(level, component ? `${component}:${name}` : name),
  };
}
```

**Step 4: Run tests**

Run: `npx vitest run src/utils/logger.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/
git commit -m "feat: add structured logger utility"
```

---

### Task 4: Tool interface and registry

**Files:**
- Create: `src/tools/tool.interface.ts`
- Create: `src/tools/tool-registry.ts`
- Create: `src/tools/tool-registry.test.ts`

**Step 1: Write tool interface**

```typescript
// src/tools/tool.interface.ts
import { z } from 'zod';

export interface ToolContext {
  projectPath: string;
  workingDirectory: string;
  readOnly: boolean;
  unityBridgeConnected: boolean;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  metadata?: {
    executionTimeMs?: number;
    filesAffected?: string[];
  };
}

export type ToolCategory =
  | 'strada'
  | 'unity-runtime'
  | 'unity-scene'
  | 'unity-asset'
  | 'unity-subsystem'
  | 'unity-config'
  | 'file'
  | 'search'
  | 'git'
  | 'dotnet'
  | 'analysis'
  | 'advanced';

export interface ToolMetadata {
  category: ToolCategory;
  requiresBridge: boolean;
  dangerous: boolean;
  readOnly: boolean;
}

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly metadata: ToolMetadata;
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

**Step 2: Write the failing test**

```typescript
// src/tools/tool-registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import type { ITool, ToolContext, ToolResult } from './tool.interface.js';

function createMockTool(name: string, requiresBridge = false): ITool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: { type: 'object', properties: {} },
    metadata: {
      category: 'file',
      requiresBridge,
      dangerous: false,
      readOnly: true,
    },
    execute: async () => ({ content: 'ok' }),
  };
}

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('test_tool');
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('should reject duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('dup'));
    expect(() => registry.register(createMockTool('dup'))).toThrow('already registered');
  });

  it('should filter by bridge requirement', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('local', false));
    registry.register(createMockTool('bridge', true));
    const available = registry.getAvailable(false);
    expect(available).toHaveLength(1);
    expect(available[0].name).toBe('local');
  });

  it('should return all tools when bridge connected', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('local', false));
    registry.register(createMockTool('bridge', true));
    expect(registry.getAvailable(true)).toHaveLength(2);
  });

  it('should filter by category', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('strada_tool');
    tool.metadata.category = 'strada';
    registry.register(tool);
    registry.register(createMockTool('file_tool'));
    expect(registry.getByCategory('strada')).toHaveLength(1);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/tools/tool-registry.test.ts`
Expected: FAIL

**Step 4: Write implementation**

```typescript
// src/tools/tool-registry.ts
import type { ITool, ToolCategory } from './tool.interface.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ITool>();

  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  getAvailable(bridgeConnected: boolean): ITool[] {
    return this.getAll().filter(
      (tool) => !tool.metadata.requiresBridge || bridgeConnected,
    );
  }

  getByCategory(category: ToolCategory): ITool[] {
    return this.getAll().filter((tool) => tool.metadata.category === category);
  }
}
```

**Step 5: Run tests**

Run: `npx vitest run src/tools/tool-registry.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tools/
git commit -m "feat: add ITool interface and ToolRegistry"
```

---

### Task 5: MCP Server with dual transport

**Files:**
- Create: `src/server.ts`
- Create: `src/server.test.ts`
- Create: `src/index.ts`

**Step 1: Write the failing test**

```typescript
// src/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMcpServer } from './server.js';

describe('MCP Server', () => {
  it('should create server with name and version', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  it('should have tool registry', () => {
    const server = createMcpServer();
    expect(server.toolRegistry).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from './tools/tool-registry.js';
import type { StradaMcpConfig } from './config/config.js';
import type { Logger } from './utils/logger.js';

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
```

**Step 4: Write entry point**

```typescript
// src/index.ts
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
```

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/server.ts src/server.test.ts src/index.ts
git commit -m "feat: add MCP server with stdio transport and tool registry"
```

---

### Task 6: Push Phase 1

```bash
git push origin main
```

**Phase 1 complete.** Deliverables:
- npm project initialized with all dependencies
- Zod-validated configuration (20+ options)
- Structured logger with child loggers
- ITool interface + ToolRegistry
- MCP Server with stdio transport
- 14 tests passing
