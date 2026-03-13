import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolMetadata } from '../tool.interface.js';

const sceneSaveSchema = z.object({
  path: z.string().optional(),
});

export class SceneSaveTool extends BridgeTool {
  readonly name = 'unity_save_scene';
  readonly description = 'Save the current Unity scene, optionally to a new path (Save As)';
  protected readonly rpcMethod = 'scene.save';
  protected readonly schema = sceneSaveSchema;
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
    const r = result as { saved?: boolean; path?: string };
    const pathInfo = r.path ? ` to "${r.path}"` : '';
    return `Scene saved${pathInfo}\n${JSON.stringify(result, null, 2)}`;
  }
}
