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
      // THE BASE'S REQUIREMENTS SURVIVE THE OVERRIDE. Dropping them let a
      // tool be offered while the connected editor implements no handler
      // for its RPC method, so the call was accepted and then refused at
      // dispatch (Codex 2026-09-13 AG#9).
      ...super.metadata,
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
