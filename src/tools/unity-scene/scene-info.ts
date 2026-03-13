import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolMetadata } from '../tool.interface.js';

const sceneInfoSchema = z.object({
  sceneIndex: z.number().optional(),
});

export class SceneInfoTool extends BridgeTool {
  readonly name = 'unity_get_scene_info';
  readonly description =
    'Get scene metadata and hierarchy info for the active or specified scene';
  protected readonly rpcMethod = 'scene.info';
  protected readonly schema = sceneInfoSchema;
  protected readonly readOnlyTool = true;
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
    const r = result as {
      name?: string;
      path?: string;
      isDirty?: boolean;
      rootCount?: number;
      gameObjectCount?: number;
    };
    const lines = [
      `Scene: ${r.name ?? 'unknown'}`,
      `Path: ${r.path ?? 'unknown'}`,
      `GameObjects: ${r.gameObjectCount ?? '?'}`,
      `Root objects: ${r.rootCount ?? '?'}`,
      `Dirty: ${r.isDirty ?? false}`,
    ];
    return `${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
