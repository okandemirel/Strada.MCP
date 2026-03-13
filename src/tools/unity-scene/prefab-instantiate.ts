import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

const prefabInstantiateSchema = z.object({
  prefabPath: z.string(),
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  parentName: z.string().optional(),
  instanceName: z.string().optional(),
});

export class PrefabInstantiateTool extends BridgeTool {
  readonly name = 'unity_instantiate_prefab';
  readonly description =
    'Instantiate a prefab in the scene at a given position, rotation, and parent';
  protected readonly rpcMethod = 'prefab.instantiate';
  protected readonly schema = prefabInstantiateSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  override get metadata(): ToolMetadata {
    return {
      category: 'unity-scene',
      requiresBridge: true,
      dangerous: this.dangerousTool,
      readOnly: this.readOnlyTool,
    };
  }

  override async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    // Validate prefab path ends with .prefab
    const pathStr = input.prefabPath as string | undefined;
    if (pathStr && !pathStr.endsWith('.prefab')) {
      return {
        content: 'Error: Prefab path must end with .prefab',
        isError: true,
      };
    }
    return super.execute(input, context);
  }

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId?: number; name?: string; position?: Record<string, number> };
    return `Instantiated "${r.name ?? 'unknown'}" (instanceId: ${r.instanceId ?? 'unknown'})\n${JSON.stringify(result, null, 2)}`;
  }
}
