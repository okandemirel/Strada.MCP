import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolMetadata } from '../tool.interface.js';

const sceneCreateSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  template: z.enum(['default', 'empty', '2d', '3d']).optional(),
});

export class SceneCreateTool extends BridgeTool {
  readonly name = 'unity_create_scene';
  readonly description = 'Create a new Unity scene with optional template (default, empty, 2d, 3d)';
  protected readonly rpcMethod = 'scene.create';
  protected readonly schema = sceneCreateSchema;
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
    const r = result as { scenePath?: string; success?: boolean };
    return `Scene created at "${r.scenePath ?? 'unknown'}"\n${JSON.stringify(result, null, 2)}`;
  }
}
