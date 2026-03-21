import { z } from 'zod';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import { searchSymbols } from '../analysis/csharp-symbol-utils.js';

const inputSchema = z.object({
  typeName: z.string().optional(),
  pattern: z.string().optional(),
  includeMembers: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export class UnityReflectApiTool implements ITool {
  readonly name = 'unity_reflect_api';
  readonly description =
    'Inspect Unity and project API surface using bridge reflection when available, with project symbol fallback when reflection is unavailable';
  readonly inputSchema = zodToJsonSchema(inputSchema);
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: false,
    dangerous: false,
    readOnly: true,
  };

  private bridgeClient: BridgeClient | null = null;

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();
    const parsed = inputSchema.parse(input);

    if (!parsed.typeName && !parsed.pattern) {
      return {
        content: 'Provide typeName or pattern.',
        isError: true,
      };
    }

    if (context.unityBridgeConnected && this.bridgeClient) {
      try {
        if (parsed.typeName) {
          const members = await this.bridgeClient.request<unknown>('reflection.getMembers', {
            typeName: parsed.typeName,
          });

          return {
            content: JSON.stringify({
              backend: 'bridge-reflection',
              authority: 'authoritative',
              typeName: parsed.typeName,
              members,
            }, null, 2),
            metadata: { executionTimeMs: Math.round(performance.now() - start) },
          };
        }

        const types = await this.bridgeClient.request<unknown>('reflection.findTypes', {
          pattern: parsed.pattern,
        });
        return {
          content: JSON.stringify({
            backend: 'bridge-reflection',
            authority: 'authoritative',
            pattern: parsed.pattern,
            results: types,
          }, null, 2),
          metadata: { executionTimeMs: Math.round(performance.now() - start) },
        };
      } catch {
        // fall back to local project symbol surface below
      }
    }

    const query = parsed.typeName ?? parsed.pattern!;
    const matches = await searchSymbols(context.projectPath, {
      query,
      limit: parsed.limit,
      exact: Boolean(parsed.typeName),
      kinds: ['class', 'struct', 'interface', 'enum'],
    });

    return {
      content: JSON.stringify({
        backend: 'project-symbol-index',
        authority: 'inferred',
        query,
        count: matches.length,
        matches,
      }, null, 2),
      metadata: { executionTimeMs: Math.round(performance.now() - start) },
    };
  }
}
