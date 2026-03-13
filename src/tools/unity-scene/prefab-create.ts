import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolMetadata } from '../tool.interface.js';

const prefabCreateSchema = z.object({
  gameObjectName: z.string().optional(),
  gameObjectId: z.number().optional(),
  savePath: z.string(),
  prefabName: z.string().optional(),
});

export class PrefabCreateTool extends BridgeTool {
  readonly name = 'unity_create_prefab';
  readonly description =
    'Create a prefab from an existing GameObject (by name or instance ID)';
  protected readonly rpcMethod = 'prefab.create';
  protected readonly schema = prefabCreateSchema;
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

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { prefabPath?: string; gameObjectName?: string };
    return `Prefab created at "${r.prefabPath ?? 'unknown'}"\n${JSON.stringify(result, null, 2)}`;
  }
}
