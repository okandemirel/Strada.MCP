import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';

const inputSchema = z.object({
  action: z.enum(['findTypes', 'getMembers', 'invoke']),
  typeName: z.string().optional(),
  pattern: z.string().optional(),
  methodName: z.string().optional(),
  args: z.array(z.any()).optional().default([]),
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
        description:
          'Reflection operation: findTypes (search), getMembers (inspect), invoke (call method)',
      },
      typeName: {
        type: 'string',
        description:
          'Fully qualified type name (required for getMembers and invoke)',
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

  private bridgeClient: BridgeClient | null = null;

  constructor(private readonly config: ReflectionConfig) {}

  /** Inject the bridge client instance. */
  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    // 1. Check bridge connection
    if (!context.unityBridgeConnected || !this.bridgeClient) {
      return {
        content: `Error: Unity bridge is not connected. Cannot execute ${this.name}.`,
        isError: true,
      };
    }

    // 2. Zod parse
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        content: `Invalid input: ${parsed.error.message}`,
        isError: true,
      };
    }

    const { action, typeName, pattern, methodName, args } = parsed.data;

    const start = performance.now();

    try {
      switch (action) {
        case 'findTypes':
          return await this.findTypes(pattern, start);

        case 'getMembers':
          if (!typeName) {
            return {
              content: 'Error: typeName is required for getMembers action',
              isError: true,
            };
          }
          return await this.getMembers(typeName, start);

        case 'invoke':
          // Security gate: check config
          if (!this.config.reflectionInvokeEnabled) {
            return {
              content:
                'Error: Reflection invocation is disabled. Set REFLECTION_INVOKE_ENABLED=true to enable this dangerous operation.',
              isError: true,
            };
          }
          // Check read-only mode
          if (context.readOnly) {
            return {
              content: `Error: Cannot invoke methods in read-only mode.`,
              isError: true,
            };
          }
          if (!typeName) {
            return {
              content: 'Error: typeName is required for invoke action',
              isError: true,
            };
          }
          if (!methodName) {
            return {
              content: 'Error: methodName is required for invoke action',
              isError: true,
            };
          }
          return await this.invoke(typeName, methodName, args, start);

        default:
          return {
            content: `Error: Unknown action "${action}"`,
            isError: true,
          };
      }
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      return {
        content: `Error in ${this.name}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
        metadata: { executionTimeMs: elapsed },
      };
    }
  }

  private async findTypes(
    pattern: string | undefined,
    start: number,
  ): Promise<ToolResult> {
    const result = await this.bridgeClient!.request<{
      success: boolean;
      result?: { types: unknown[] };
      error?: string;
    }>('reflection.findTypes', { pattern: pattern ?? '*' });

    const elapsed = Math.round(performance.now() - start);

    if (result.success && result.result) {
      return {
        content: JSON.stringify(result.result, null, 2),
        metadata: { executionTimeMs: elapsed },
      };
    }

    return {
      content: `Error: ${result.error ?? 'Unknown error finding types'}`,
      isError: true,
      metadata: { executionTimeMs: elapsed },
    };
  }

  private async getMembers(
    typeName: string,
    start: number,
  ): Promise<ToolResult> {
    const result = await this.bridgeClient!.request<{
      success: boolean;
      result?: {
        typeName: string;
        fields: unknown[];
        properties: unknown[];
        methods: unknown[];
      };
      error?: string;
    }>('reflection.getMembers', { typeName });

    const elapsed = Math.round(performance.now() - start);

    if (result.success && result.result) {
      return {
        content: JSON.stringify(result.result, null, 2),
        metadata: { executionTimeMs: elapsed },
      };
    }

    return {
      content: `Error: ${result.error ?? 'Unknown error getting members'}`,
      isError: true,
      metadata: { executionTimeMs: elapsed },
    };
  }

  private async invoke(
    typeName: string,
    methodName: string,
    args: unknown[],
    start: number,
  ): Promise<ToolResult> {
    const result = await this.bridgeClient!.request<{
      success: boolean;
      result?: { returnValue: unknown; stdout: string };
      error?: string;
    }>('reflection.invoke', { typeName, methodName, args });

    const elapsed = Math.round(performance.now() - start);

    if (result.success && result.result) {
      const parts: string[] = [];
      if (result.result.stdout) {
        parts.push(`Output:\n${result.result.stdout}`);
      }
      if (
        result.result.returnValue !== null &&
        result.result.returnValue !== undefined
      ) {
        parts.push(
          `Return value: ${JSON.stringify(result.result.returnValue)}`,
        );
      }
      if (parts.length === 0) {
        parts.push('Method invoked successfully (no output).');
      }
      return {
        content: parts.join('\n'),
        metadata: { executionTimeMs: elapsed },
      };
    }

    return {
      content: `Error: ${result.error ?? 'Unknown error invoking method'}`,
      isError: true,
      metadata: { executionTimeMs: elapsed },
    };
  }
}
