import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';

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

  private bridgeClient: BridgeClient | null = null;

  constructor(private readonly config: ScriptExecuteConfig) {}

  /** Inject the bridge client instance. */
  setBridgeClient(client: BridgeClient): void {
    this.bridgeClient = client;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Security gate: check config.scriptExecuteEnabled
    if (!this.config.scriptExecuteEnabled) {
      return {
        content:
          'Error: Script execution is disabled. Set SCRIPT_EXECUTE_ENABLED=true to enable this dangerous operation.',
        isError: true,
      };
    }

    // 2. Check read-only mode
    if (context.readOnly) {
      return {
        content: `Error: Cannot execute ${this.name} in read-only mode.`,
        isError: true,
      };
    }

    // 3. Check bridge connection
    if (!context.unityBridgeConnected || !this.bridgeClient) {
      return {
        content: `Error: Unity bridge is not connected. Cannot execute ${this.name}.`,
        isError: true,
      };
    }

    // 4. Zod parse
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const { code, assemblies } = parsed.data;

    // 5. Send JSON-RPC to bridge
    const start = performance.now();
    try {
      const result = await this.bridgeClient.request<{
        success: boolean;
        result?: { stdout: string; returnValue: unknown };
        error?: string;
      }>('script.execute', { code, assemblies });

      const elapsed = Math.round(performance.now() - start);

      // 6. Handle response
      if (result.success && result.result) {
        const parts: string[] = [];
        if (result.result.stdout) {
          parts.push(`Output:\n${result.result.stdout}`);
        }
        if (result.result.returnValue !== null && result.result.returnValue !== undefined) {
          parts.push(`Return value: ${JSON.stringify(result.result.returnValue)}`);
        }
        if (parts.length === 0) {
          parts.push('Script executed successfully (no output).');
        }
        return {
          content: parts.join('\n'),
          metadata: { executionTimeMs: elapsed },
        };
      }

      return {
        content: `Script execution error: ${result.error ?? 'Unknown error'}`,
        isError: true,
        metadata: { executionTimeMs: elapsed },
      };
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      return {
        content: `Error in ${this.name}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
        metadata: { executionTimeMs: elapsed },
      };
    }
  }
}
