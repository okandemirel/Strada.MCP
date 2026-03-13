# Phase 12: Advanced Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 5 advanced tools — batch execution, Roslyn script execution, C# syntax validation, runtime reflection, and Unity profiler integration. These are power-user tools with elevated security requirements.

**Architecture:** `batch_execute` is a pure orchestrator that delegates to the tool registry. `script_execute` and `csharp_reflection` are bridge-based tools with explicit security gates (disabled by default). `script_validate` has dual mode: basic (tree-sitter from Phase 5) and strict (Roslyn via bridge). `unity_profiler` reads performance data via bridge.

**Tech Stack:** TypeScript, zod, tool registry (for batch), tree-sitter (for basic validation), Unity bridge protocol (for Roslyn + reflection + profiler)

**Depends on:** Phase 8 (Unity Runtime Tools — bridge protocol)

**Security note:** This phase contains 2 DANGEROUS tools (`script_execute`, `csharp_reflection` with invoke). Both are disabled by default and require explicit configuration flags.

---

### Task 1: Batch execution tool (batch_execute)

**Files:**
- Create: `src/tools/advanced/batch-execute.ts`
- Create: `src/tools/advanced/batch-execute.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/advanced/batch-execute.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BatchExecuteTool } from './batch-execute.js';
import { ToolRegistry } from '../tool-registry.js';
import type { ITool, ToolContext, ToolResult } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockTool(name: string, handler: (input: Record<string, unknown>) => ToolResult): ITool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: { type: 'object', properties: {} },
    metadata: { category: 'file', requiresBridge: false, dangerous: false, readOnly: true },
    execute: async (input) => handler(input),
  };
}

describe('BatchExecuteTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let registry: ToolRegistry;
  let tool: BatchExecuteTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
    registry = new ToolRegistry();
    registry.register(
      createMockTool('tool_a', () => ({ content: 'result_a' })),
    );
    registry.register(
      createMockTool('tool_b', () => ({ content: 'result_b' })),
    );
    registry.register(
      createMockTool('tool_fail', () => ({ content: 'failed', isError: true })),
    );
    tool = new BatchExecuteTool(registry);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('batch_execute');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should execute multiple operations sequentially', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_b', input: {} },
        ],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('result_a');
    expect(result.content).toContain('result_b');
  });

  it('should return all results as structured array', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_b', input: {} },
        ],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].tool).toBe('tool_a');
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[1].tool).toBe('tool_b');
  });

  it('should stop on failure when rollback is enabled', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_fail', input: {} },
          { tool: 'tool_b', input: {} },
        ],
        stopOnError: true,
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[1].success).toBe(false);
    expect(parsed.stopped).toBe(true);
  });

  it('should continue on failure when stopOnError is false', async () => {
    const result = await tool.execute(
      {
        operations: [
          { tool: 'tool_a', input: {} },
          { tool: 'tool_fail', input: {} },
          { tool: 'tool_b', input: {} },
        ],
        stopOnError: false,
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[2].success).toBe(true);
  });

  it('should reject unknown tool name', async () => {
    const result = await tool.execute(
      {
        operations: [{ tool: 'nonexistent_tool', input: {} }],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results[0].success).toBe(false);
    expect(parsed.results[0].error).toContain('not found');
  });

  it('should reject empty operations array', async () => {
    const result = await tool.execute(
      { operations: [] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('at least one operation');
  });

  it('should prevent recursive batch calls', async () => {
    // Register the batch tool itself to test recursion prevention
    registry.register(tool);
    const result = await tool.execute(
      {
        operations: [
          { tool: 'batch_execute', input: { operations: [{ tool: 'tool_a', input: {} }] } },
        ],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results[0].success).toBe(false);
    expect(parsed.results[0].error).toContain('recursive');
  });

  it('should enforce maximum operations limit', async () => {
    const ops = Array.from({ length: 51 }, (_, i) => ({
      tool: 'tool_a',
      input: {},
    }));
    const result = await tool.execute(
      { operations: ops },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('maximum');
  });

  it('should include execution time per operation', async () => {
    const result = await tool.execute(
      {
        operations: [{ tool: 'tool_a', input: {} }],
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.results[0]).toHaveProperty('durationMs');
    expect(typeof parsed.results[0].durationMs).toBe('number');
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/advanced/batch-execute.ts
import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import type { ToolRegistry } from '../tool-registry.js';

const operationSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()),
});

const inputSchema = z.object({
  operations: z.array(operationSchema).min(1).max(50),
  stopOnError: z.boolean().optional().default(true),
});

interface BatchResult {
  tool: string;
  success: boolean;
  content: string;
  error?: string;
  durationMs: number;
}

interface BatchOutput {
  results: BatchResult[];
  totalDurationMs: number;
  stopped: boolean;
  successCount: number;
  failureCount: number;
}

const MAX_OPERATIONS = 50;

export class BatchExecuteTool implements ITool {
  readonly name = 'batch_execute';
  readonly description =
    'Execute multiple tool operations in a single call. Sequential execution with optional stop-on-error. Maximum 50 operations per batch.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Tool name to execute' },
            input: { type: 'object', description: 'Tool input parameters' },
          },
          required: ['tool', 'input'],
        },
        description: 'Array of tool operations to execute',
        maxItems: MAX_OPERATIONS,
      },
      stopOnError: {
        type: 'boolean',
        description: 'Stop execution on first failure (default: true)',
        default: true,
      },
    },
    required: ['operations'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  constructor(private readonly registry: ToolRegistry) {}

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const { operations, stopOnError } = parsed.data;

    if (operations.length === 0) {
      return { content: 'Batch requires at least one operation', isError: true };
    }

    if (operations.length > MAX_OPERATIONS) {
      return { content: `Batch exceeds maximum of ${MAX_OPERATIONS} operations`, isError: true };
    }

    const batchStart = Date.now();
    const results: BatchResult[] = [];
    let stopped = false;

    for (const op of operations) {
      // Prevent recursive batch calls
      if (op.tool === 'batch_execute') {
        results.push({
          tool: op.tool,
          success: false,
          content: '',
          error: 'Recursive batch_execute calls are not allowed',
          durationMs: 0,
        });
        if (stopOnError) {
          stopped = true;
          break;
        }
        continue;
      }

      const tool = this.registry.get(op.tool);
      if (!tool) {
        results.push({
          tool: op.tool,
          success: false,
          content: '',
          error: `Tool "${op.tool}" not found in registry`,
          durationMs: 0,
        });
        if (stopOnError) {
          stopped = true;
          break;
        }
        continue;
      }

      const opStart = Date.now();
      try {
        const result = await tool.execute(op.input, context);
        results.push({
          tool: op.tool,
          success: !result.isError,
          content: result.content,
          error: result.isError ? result.content : undefined,
          durationMs: Date.now() - opStart,
        });

        if (result.isError && stopOnError) {
          stopped = true;
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          tool: op.tool,
          success: false,
          content: '',
          error: message,
          durationMs: Date.now() - opStart,
        });
        if (stopOnError) {
          stopped = true;
          break;
        }
      }
    }

    const output: BatchOutput = {
      results,
      totalDurationMs: Date.now() - batchStart,
      stopped,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
    };

    return { content: JSON.stringify(output, null, 2) };
  }
}
```

**Security considerations:**
- Recursive `batch_execute` calls are blocked to prevent infinite loops
- Maximum 50 operations per batch prevents resource exhaustion
- Each sub-tool inherits the same `ToolContext` (read-only mode, bridge status)
- `stopOnError` defaults to `true` for fail-fast safety

**Step 3: Run tests**

Run: `npx vitest run src/tools/advanced/batch-execute.test.ts`
Expected: PASS (10 tests)

**Step 4: Commit**

```bash
git add src/tools/advanced/batch-execute.*
git commit -m "feat: add batch_execute tool with sequential orchestration and stop-on-error"
```

---

### Task 2: Script execution tool (script_execute)

**Files:**
- Create: `src/tools/advanced/script-execute.ts`
- Create: `src/tools/advanced/script-execute.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/advanced/script-execute.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScriptExecuteTool } from './script-execute.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Mock the bridge client
const mockBridgeSend = vi.fn();
vi.mock('../../integration/unity-bridge.js', () => ({
  getBridgeClient: () => ({
    send: mockBridgeSend,
    connected: true,
  }),
}));

describe('ScriptExecuteTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let ctxDisabled: ToolContext;
  let tool: ScriptExecuteTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    ctxDisabled = { ...ctx, unityBridgeConnected: false };
    tool = new ScriptExecuteTool({ scriptExecuteEnabled: true });
    mockBridgeSend.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('script_execute');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.dangerous).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should reject when SCRIPT_EXECUTE_ENABLED is false', async () => {
    const disabledTool = new ScriptExecuteTool({ scriptExecuteEnabled: false });
    const result = await disabledTool.execute(
      { code: 'Debug.Log("hello");' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('disabled');
    expect(result.content).toContain('SCRIPT_EXECUTE_ENABLED');
  });

  it('should reject when bridge is not connected', async () => {
    const result = await tool.execute(
      { code: 'Debug.Log("hello");' },
      ctxDisabled,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should execute C# code via bridge', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { stdout: 'hello\n', returnValue: null },
    });

    const result = await tool.execute(
      { code: 'Debug.Log("hello");' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('hello');
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'script.execute',
        params: expect.objectContaining({ code: 'Debug.Log("hello");' }),
      }),
    );
  });

  it('should pass additional assembly references', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { stdout: '', returnValue: '42' },
    });

    const result = await tool.execute(
      {
        code: 'return 42;',
        assemblies: ['System.Linq'],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          assemblies: ['System.Linq'],
        }),
      }),
    );
  });

  it('should handle compilation errors from bridge', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: false,
      error: 'CS1002: ; expected at line 1',
    });

    const result = await tool.execute(
      { code: 'invalid code here' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('CS1002');
  });

  it('should handle runtime exceptions from bridge', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: false,
      error: 'NullReferenceException: Object reference not set',
    });

    const result = await tool.execute(
      { code: 'string s = null; s.Length;' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('NullReferenceException');
  });

  it('should enforce timeout', async () => {
    mockBridgeSend.mockImplementation(
      () => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 100),
      ),
    );

    const result = await tool.execute(
      { code: 'while(true){}' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Timeout');
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { code: 'Debug.Log("test");' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject empty code', async () => {
    const result = await tool.execute({ code: '' }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/advanced/script-execute.ts
import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  code: z.string().min(1, 'Code cannot be empty'),
  assemblies: z.array(z.string()).optional().default([]),
});

interface ScriptExecuteConfig {
  scriptExecuteEnabled: boolean;
}

export class ScriptExecuteTool implements ITool {
  readonly name = 'script_execute';
  readonly description =
    'Execute C# code via Roslyn dynamic compilation in Unity. DANGEROUS: disabled by default — requires SCRIPT_EXECUTE_ENABLED=true. Code runs in the Unity Editor process with full access.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'C# code to compile and execute',
      },
      assemblies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional assembly references (e.g. "System.Linq")',
      },
    },
    required: ['code'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: true,
    dangerous: true,
    readOnly: false,
  };

  constructor(private readonly config: ScriptExecuteConfig) {}

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Security gate: check config.scriptExecuteEnabled
    // 2. Check read-only mode
    // 3. Check bridge connection
    // 4. Zod parse
    // 5. Send JSON-RPC to bridge: { method: 'script.execute', params: { code, assemblies } }
    // 6. Handle response: success -> return stdout + returnValue; error -> return error details
    // 7. Timeout enforcement (30s default)
  }
}
```

**Security considerations:**
- **Disabled by default** — `SCRIPT_EXECUTE_ENABLED=true` required in environment
- **Requires bridge** — code executes in Unity Editor process, not MCP server
- **Read-only mode blocks execution** — prevents accidental modifications
- **Timeout enforcement** — 30-second default prevents infinite loops
- **No filesystem access from MCP side** — code runs in Unity sandbox
- **Dangerous flag** — tool is marked as dangerous in metadata for UI indicators

**Step 3: Run tests**

Run: `npx vitest run src/tools/advanced/script-execute.test.ts`
Expected: PASS (10 tests)

**Step 4: Commit**

```bash
git add src/tools/advanced/script-execute.*
git commit -m "feat: add script_execute tool with Roslyn dynamic compilation (disabled by default)"
```

---

### Task 3: Script validation tool (script_validate)

**Files:**
- Create: `src/tools/advanced/script-validate.ts`
- Create: `src/tools/advanced/script-validate.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/advanced/script-validate.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScriptValidateTool } from './script-validate.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const mockBridgeSend = vi.fn();
vi.mock('../../integration/unity-bridge.js', () => ({
  getBridgeClient: () => ({
    send: mockBridgeSend,
    connected: true,
  }),
}));

describe('ScriptValidateTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: ScriptValidateTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    tool = new ScriptValidateTool();
    mockBridgeSend.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('script_validate');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(false); // basic mode works without bridge
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should validate correct C# in basic mode (tree-sitter)', async () => {
    const result = await tool.execute(
      {
        code: `using System;
namespace Game
{
    public class Player
    {
        public int Health { get; set; }
        public void TakeDamage(int amount) { Health -= amount; }
    }
}`,
        mode: 'basic',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('valid');
  });

  it('should detect syntax errors in basic mode', async () => {
    const result = await tool.execute(
      {
        code: `public class Broken {
    public void Method( { // missing closing paren
    }
}`,
        mode: 'basic',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy(); // Not a tool error — validation result
    expect(result.content).toContain('error');
  });

  it('should report error line numbers in basic mode', async () => {
    const result = await tool.execute(
      {
        code: `public class Test {
    int x = ;
}`,
        mode: 'basic',
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]).toHaveProperty('line');
  });

  it('should validate in strict mode via bridge', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { errors: [], warnings: [] },
    });

    const result = await tool.execute(
      {
        code: 'public class Valid { }',
        mode: 'strict',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'script.validate' }),
    );
  });

  it('should return Roslyn errors in strict mode', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: {
        errors: [
          { code: 'CS0246', message: "The type 'NonExistent' could not be found", line: 1, column: 15 },
        ],
        warnings: [],
      },
    });

    const result = await tool.execute(
      {
        code: 'public class Test : NonExistent { }',
        mode: 'strict',
      },
      ctx,
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].code).toBe('CS0246');
    expect(parsed.errors[0].line).toBe(1);
  });

  it('should fallback to basic when strict requested but bridge unavailable', async () => {
    const result = await tool.execute(
      {
        code: 'public class Test { }',
        mode: 'strict',
      },
      { ...ctx, unityBridgeConnected: false },
    );
    expect(result.isError).toBeFalsy();
    // Should still validate, just using tree-sitter instead of Roslyn
    expect(result.content).toContain('basic'); // Indicates fallback
  });

  it('should default to basic mode', async () => {
    const result = await tool.execute(
      { code: 'public class Test { }' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(mockBridgeSend).not.toHaveBeenCalled(); // basic mode doesn't use bridge
  });

  it('should reject empty code', async () => {
    const result = await tool.execute({ code: '', mode: 'basic' }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/advanced/script-validate.ts
import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  code: z.string().min(1, 'Code cannot be empty'),
  mode: z.enum(['basic', 'strict']).optional().default('basic'),
});

interface ValidationError {
  code?: string;
  message: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  mode: 'basic' | 'strict';
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class ScriptValidateTool implements ITool {
  readonly name = 'script_validate';
  readonly description =
    'Validate C# syntax without execution. Basic mode uses tree-sitter (no bridge needed). Strict mode uses Roslyn compilation check via bridge.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'C# code to validate',
      },
      mode: {
        type: 'string',
        enum: ['basic', 'strict'],
        description: 'Validation mode: basic (tree-sitter syntax) or strict (Roslyn compilation). Default: basic.',
        default: 'basic',
      },
    },
    required: ['code'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: false, // basic mode works offline
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Zod parse
    // 2. If mode is basic OR (mode is strict AND bridge unavailable):
    //    - Use tree-sitter C# parser from Phase 5 to parse the code
    //    - Walk AST for ERROR nodes — extract line numbers and context
    //    - Return ValidationResult with basic mode indicator
    // 3. If mode is strict AND bridge connected:
    //    - Send to bridge: { method: 'script.validate', params: { code } }
    //    - Parse Roslyn diagnostics into ValidationError[]
    //    - Return ValidationResult with strict mode indicator
    // 4. Format and return structured JSON
  }

  private async validateBasic(code: string): Promise<ValidationResult> {
    // Uses tree-sitter parser from src/intelligence/parser/csharp-parser.ts
    // Parse code, walk tree for ERROR/MISSING nodes, extract positions
  }

  private async validateStrict(code: string): Promise<ValidationResult> {
    // Sends to Unity bridge for full Roslyn compilation check
    // Returns detailed errors with CS codes
  }
}
```

**Security considerations:**
- Read-only tool: never modifies files or executes code
- Basic mode requires no bridge — works fully offline
- Strict mode gracefully falls back to basic when bridge unavailable
- No dangerous operations

**Step 3: Run tests**

Run: `npx vitest run src/tools/advanced/script-validate.test.ts`
Expected: PASS (9 tests)

**Step 4: Commit**

```bash
git add src/tools/advanced/script-validate.*
git commit -m "feat: add script_validate tool with dual-mode syntax checking"
```

---

### Task 4: C# reflection tool (csharp_reflection)

**Files:**
- Create: `src/tools/advanced/csharp-reflection.ts`
- Create: `src/tools/advanced/csharp-reflection.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/advanced/csharp-reflection.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CSharpReflectionTool } from './csharp-reflection.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const mockBridgeSend = vi.fn();
vi.mock('../../integration/unity-bridge.js', () => ({
  getBridgeClient: () => ({
    send: mockBridgeSend,
    connected: true,
  }),
}));

describe('CSharpReflectionTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: CSharpReflectionTool;
  let toolInvokeEnabled: CSharpReflectionTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    tool = new CSharpReflectionTool({ reflectionInvokeEnabled: false });
    toolInvokeEnabled = new CSharpReflectionTool({ reflectionInvokeEnabled: true });
    mockBridgeSend.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('csharp_reflection');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.dangerous).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should find types by pattern', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: {
        types: [
          { fullName: 'Game.Player', assembly: 'Assembly-CSharp', isClass: true },
          { fullName: 'Game.PlayerController', assembly: 'Assembly-CSharp', isClass: true },
        ],
      },
    });

    const result = await tool.execute(
      { action: 'findTypes', pattern: 'Player' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.types).toHaveLength(2);
    expect(parsed.types[0].fullName).toBe('Game.Player');
  });

  it('should get members of a type', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: {
        typeName: 'Game.Player',
        fields: [{ name: 'health', type: 'System.Int32', isPublic: true }],
        properties: [{ name: 'IsAlive', type: 'System.Boolean', hasGetter: true, hasSetter: false }],
        methods: [{ name: 'TakeDamage', returnType: 'System.Void', parameters: ['System.Int32'] }],
      },
    });

    const result = await tool.execute(
      { action: 'getMembers', typeName: 'Game.Player' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.properties).toHaveLength(1);
    expect(parsed.methods).toHaveLength(1);
  });

  it('should reject invoke when reflectionInvokeEnabled is false', async () => {
    const result = await tool.execute(
      {
        action: 'invoke',
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('disabled');
  });

  it('should invoke method when reflectionInvokeEnabled is true', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { returnValue: null, stdout: '' },
    });

    const result = await toolInvokeEnabled.execute(
      {
        action: 'invoke',
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'reflection.invoke',
        params: expect.objectContaining({
          typeName: 'Game.Player',
          methodName: 'TakeDamage',
          args: [10],
        }),
      }),
    );
  });

  it('should reject invoke in read-only mode even when enabled', async () => {
    const result = await toolInvokeEnabled.execute(
      {
        action: 'invoke',
        typeName: 'Game.Player',
        methodName: 'TakeDamage',
        args: [10],
      },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'findTypes', pattern: 'Player' },
      { ...ctx, unityBridgeConnected: false },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should require typeName for getMembers', async () => {
    const result = await tool.execute(
      { action: 'getMembers' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('typeName');
  });

  it('should require typeName and methodName for invoke', async () => {
    const result = await toolInvokeEnabled.execute(
      { action: 'invoke', typeName: 'Game.Player' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('methodName');
  });

  it('should handle type not found error from bridge', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: false,
      error: 'Type "Game.NonExistent" not found',
    });

    const result = await tool.execute(
      { action: 'getMembers', typeName: 'Game.NonExistent' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('should allow findTypes and getMembers in read-only mode', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { types: [] },
    });

    const result = await tool.execute(
      { action: 'findTypes', pattern: 'Player' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBeFalsy();
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/advanced/csharp-reflection.ts
import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const inputSchema = z.object({
  action: z.enum(['findTypes', 'getMembers', 'invoke']),
  typeName: z.string().optional(),
  pattern: z.string().optional(),
  methodName: z.string().optional(),
  args: z.array(z.unknown()).optional().default([]),
});

interface ReflectionConfig {
  reflectionInvokeEnabled: boolean;
}

export class CSharpReflectionTool implements ITool {
  readonly name = 'csharp_reflection';
  readonly description =
    'Runtime C# reflection via Unity bridge. Find types, inspect members, and optionally invoke methods. Invoke is disabled by default for safety.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['findTypes', 'getMembers', 'invoke'],
        description: 'Reflection operation: findTypes (search), getMembers (inspect), invoke (call method)',
      },
      typeName: {
        type: 'string',
        description: 'Fully qualified type name (required for getMembers and invoke)',
      },
      pattern: {
        type: 'string',
        description: 'Search pattern for findTypes (supports wildcards)',
      },
      methodName: {
        type: 'string',
        description: 'Method name to invoke (required for invoke action)',
      },
      args: {
        type: 'array',
        items: {},
        description: 'Arguments for method invocation',
      },
    },
    required: ['action'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: true,
    dangerous: true,
    readOnly: false,
  };

  constructor(private readonly config: ReflectionConfig) {}

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Check bridge connection
    // 2. Zod parse
    // 3. For findTypes:
    //    - Bridge call: { method: 'reflection.findTypes', params: { pattern } }
    //    - Return type list (readonly, works in read-only mode)
    // 4. For getMembers:
    //    - Require typeName
    //    - Bridge call: { method: 'reflection.getMembers', params: { typeName } }
    //    - Return fields, properties, methods (readonly, works in read-only mode)
    // 5. For invoke:
    //    - Check config.reflectionInvokeEnabled — reject if false
    //    - Check read-only mode — reject if true
    //    - Require typeName and methodName
    //    - Bridge call: { method: 'reflection.invoke', params: { typeName, methodName, args } }
    //    - Return result or error
  }
}
```

**Security considerations:**
- **findTypes and getMembers are read-only** — safe to use in read-only mode
- **invoke is disabled by default** — requires `reflectionInvokeEnabled: true` in config
- **invoke blocked in read-only mode** — even when enabled, read-only overrides
- **Bridge required** — all operations happen in Unity Editor process
- **Dangerous flag** — marked dangerous due to invoke capability
- **No arbitrary code execution** — only invokes existing methods (unlike `script_execute`)

**Step 3: Run tests**

Run: `npx vitest run src/tools/advanced/csharp-reflection.test.ts`
Expected: PASS (11 tests)

**Step 4: Commit**

```bash
git add src/tools/advanced/csharp-reflection.*
git commit -m "feat: add csharp_reflection tool with type discovery and guarded invocation"
```

---

### Task 5: Unity profiler tool (unity_profiler)

**Files:**
- Create: `src/tools/advanced/unity-profiler.ts`
- Create: `src/tools/advanced/unity-profiler.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/advanced/unity-profiler.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnityProfilerTool } from './unity-profiler.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const mockBridgeSend = vi.fn();
vi.mock('../../integration/unity-bridge.js', () => ({
  getBridgeClient: () => ({
    send: mockBridgeSend,
    connected: true,
  }),
}));

describe('UnityProfilerTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: UnityProfilerTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: true,
    };
    tool = new UnityProfilerTool();
    mockBridgeSend.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_profiler');
    expect(tool.metadata.category).toBe('advanced');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should start profiling', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { status: 'recording' },
    });

    const result = await tool.execute(
      { action: 'start' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('recording');
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'profiler.start' }),
    );
  });

  it('should stop profiling', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { status: 'stopped', framesRecorded: 300 },
    });

    const result = await tool.execute(
      { action: 'stop' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('stopped');
  });

  it('should get frame data', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: {
        frames: [
          {
            frameIndex: 0,
            cpuTimeMs: 16.5,
            gpuTimeMs: 12.3,
            drawCalls: 150,
            triangles: 50000,
            memoryMB: 512.4,
          },
          {
            frameIndex: 1,
            cpuTimeMs: 15.2,
            gpuTimeMs: 11.8,
            drawCalls: 148,
            triangles: 49800,
            memoryMB: 512.5,
          },
        ],
      },
    });

    const result = await tool.execute(
      { action: 'getFrameData', frameCount: 2 },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.frames[0].cpuTimeMs).toBe(16.5);
    expect(parsed.frames[0].drawCalls).toBe(150);
  });

  it('should get performance summary', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: {
        summary: {
          avgCpuMs: 15.8,
          avgGpuMs: 12.0,
          maxCpuMs: 25.3,
          maxGpuMs: 18.7,
          avgFps: 63.2,
          minFps: 39.5,
          totalAllocatedMB: 1024.0,
          gcCollections: 3,
          avgDrawCalls: 149,
          avgTriangles: 49900,
          frameCount: 300,
          hotFunctions: [
            { name: 'Physics.Simulate', avgMs: 4.2, percentage: 26.6 },
            { name: 'Camera.Render', avgMs: 3.8, percentage: 24.1 },
          ],
        },
      },
    });

    const result = await tool.execute(
      { action: 'getSummary' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.summary.avgFps).toBeCloseTo(63.2, 1);
    expect(parsed.summary.hotFunctions).toHaveLength(2);
    expect(parsed.summary.hotFunctions[0].name).toBe('Physics.Simulate');
  });

  it('should reject when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'start' },
      { ...ctx, unityBridgeConnected: false },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should default frameCount to 60', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { frames: [] },
    });

    await tool.execute({ action: 'getFrameData' }, ctx);
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ frameCount: 60 }),
      }),
    );
  });

  it('should handle profiler not recording error', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: false,
      error: 'Profiler is not currently recording',
    });

    const result = await tool.execute(
      { action: 'getFrameData' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not currently recording');
  });

  it('should clamp frameCount to valid range', async () => {
    mockBridgeSend.mockResolvedValueOnce({
      success: true,
      result: { frames: [] },
    });

    await tool.execute({ action: 'getFrameData', frameCount: 5000 }, ctx);
    expect(mockBridgeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ frameCount: 2000 }),
      }),
    );
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/advanced/unity-profiler.ts
import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const MAX_FRAME_COUNT = 2000;

const inputSchema = z.object({
  action: z.enum(['start', 'stop', 'getFrameData', 'getSummary']),
  frameCount: z.number().int().min(1).max(MAX_FRAME_COUNT).optional().default(60),
});

export class UnityProfilerTool implements ITool {
  readonly name = 'unity_profiler';
  readonly description =
    'Access Unity Profiler data. Start/stop recording, get per-frame CPU/GPU timing, memory allocations, draw calls, and performance summaries with hot function analysis.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop', 'getFrameData', 'getSummary'],
        description: 'Profiler operation',
      },
      frameCount: {
        type: 'number',
        description: 'Number of frames to retrieve (default: 60, max: 2000)',
        default: 60,
      },
    },
    required: ['action'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: true,
    dangerous: false,
    readOnly: true,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Check bridge connection
    // 2. Zod parse + clamp frameCount to MAX_FRAME_COUNT
    // 3. Route by action:
    //    start:        bridge { method: 'profiler.start' }
    //    stop:         bridge { method: 'profiler.stop' }
    //    getFrameData: bridge { method: 'profiler.getFrameData', params: { frameCount } }
    //    getSummary:   bridge { method: 'profiler.getSummary' }
    // 4. Format and return results
  }
}
```

**Security considerations:**
- **Read-only tool** — profiling observes but does not modify
- **No start/stop restriction in read-only mode** — profiler recording is ephemeral and non-destructive
- **Frame count clamping** — prevents excessive memory usage from requesting too many frames
- **Bridge required** — all operations happen in Unity Editor
- **Not dangerous** — purely observational

**Step 3: Run tests**

Run: `npx vitest run src/tools/advanced/unity-profiler.test.ts`
Expected: PASS (9 tests)

**Step 4: Commit**

```bash
git add src/tools/advanced/unity-profiler.*
git commit -m "feat: add unity_profiler tool with frame data and performance summary"
```

---

### Task 6: Register all 5 tools + barrel export + security review

**Files:**
- Create: `src/tools/advanced/index.ts`
- Modify: Tool registration

**Step 1: Create barrel export**

```typescript
// src/tools/advanced/index.ts
export { BatchExecuteTool } from './batch-execute.js';
export { ScriptExecuteTool } from './script-execute.js';
export { ScriptValidateTool } from './script-validate.js';
export { CSharpReflectionTool } from './csharp-reflection.js';
export { UnityProfilerTool } from './unity-profiler.js';
```

**Step 2: Register tools in the tool registry**

```typescript
// In the registration function
import {
  BatchExecuteTool,
  ScriptExecuteTool,
  ScriptValidateTool,
  CSharpReflectionTool,
  UnityProfilerTool,
} from './tools/advanced/index.js';

// batch_execute needs registry reference for delegation
const batchTool = new BatchExecuteTool(registry);
registry.register(batchTool);

// script_execute — DANGEROUS, gated by config
registry.register(new ScriptExecuteTool({
  scriptExecuteEnabled: config.scriptExecuteEnabled,
}));

// script_validate — safe, dual-mode
registry.register(new ScriptValidateTool());

// csharp_reflection — DANGEROUS invoke, gated by config
registry.register(new CSharpReflectionTool({
  reflectionInvokeEnabled: config.scriptExecuteEnabled, // reuses same flag
}));

// unity_profiler — safe, read-only
registry.register(new UnityProfilerTool());
```

**Step 3: Security review checklist**

| Tool | Dangerous | Gate | Read-Only Behavior |
|------|-----------|------|-------------------|
| `batch_execute` | No | N/A | Sub-tools inherit read-only context |
| `script_execute` | **YES** | `SCRIPT_EXECUTE_ENABLED=true` | Blocked entirely |
| `script_validate` | No | N/A | Always works (read-only tool) |
| `csharp_reflection` | **YES** (invoke) | `SCRIPT_EXECUTE_ENABLED=true` | findTypes/getMembers work; invoke blocked |
| `unity_profiler` | No | N/A | Always works (read-only tool) |

**Step 4: Run full test suite**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: ALL PASS

**Step 5: Commit and push**

```bash
git add .
git commit -m "feat: register all 5 advanced tools with security gates"
git push origin main
```

---

### Extension Candidates (Deferred)

The following 3 advanced tools from the design document are deferred to a future phase or can be added as extensions. They are domain-specific and independent of the core advanced tool infrastructure:

| Tool | Description | Depends On |
|------|-------------|------------|
| `unity_2d_sprite` | Sprite create/set/info — SpriteRenderer, Sprite Atlas, slicing | Bridge |
| `unity_2d_tilemap` | Tilemap create/set/fill/clear — grid, tile palette, rule tiles | Bridge |
| `unity_cinemachine` | Virtual camera, blend, dolly track — CinemachineVirtualCamera setup | Bridge |

These tools follow the same bridge-based pattern as Unity runtime tools (Phase 8) and can be implemented as:
- A standalone Phase 12b
- Individual contributions via the extension system
- Part of Phase 17 (Integration Tests + Polish) if time permits

Each would need:
- Zod input schema
- Bridge JSON-RPC methods
- C# handler in the Unity package (Phase 15)
- Tests with mocked bridge responses

---

**Phase 12 complete.** Deliverables:
- `batch_execute` — Sequential multi-tool orchestration with stop-on-error (max 50 ops)
- `script_execute` — Roslyn C# execution via bridge (DANGEROUS, disabled by default)
- `script_validate` — Dual-mode C# validation (tree-sitter basic + Roslyn strict)
- `csharp_reflection` — Runtime type discovery + member inspection + guarded method invocation
- `unity_profiler` — Performance profiling data collection and analysis
- Security review for all dangerous tools
- 3 extension candidates documented for future phases
- ~50 new tests passing
