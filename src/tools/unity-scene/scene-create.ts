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
