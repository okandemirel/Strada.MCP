import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import type { ToolRegistry } from '../tool-registry.js';

const operationSchema = z.object({
  tool: z.string(),
  input: z.object({}).passthrough(),
});

const batchInputSchema = z.object({
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
    const parsed = batchInputSchema.safeParse(input);
    if (!parsed.success) {
      // Check for empty array specifically for a better error message
      const ops = input.operations;
      if (Array.isArray(ops) && ops.length === 0) {
        return { content: 'Batch requires at least one operation', isError: true };
      }
      if (Array.isArray(ops) && ops.length > MAX_OPERATIONS) {
        return { content: `Batch exceeds maximum of ${MAX_OPERATIONS} operations`, isError: true };
      }
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
