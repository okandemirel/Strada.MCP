import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';

const sceneOpenSchema = z.object({
  path: z.string(),
  additive: z.boolean().optional(),
});

export class SceneOpenTool extends BridgeTool {
  readonly name = 'unity_open_scene';
  readonly description = 'Open a Unity scene by path, optionally in additive mode';
  protected readonly rpcMethod = 'scene.open';
  protected readonly schema = sceneOpenSchema;
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
    // Validate path ends with .unity before passing to base
    const pathStr = input.path as string | undefined;
    if (pathStr && !pathStr.endsWith('.unity')) {
      return {
        content: 'Error: Scene path must end with .unity',
        isError: true,
      };
    }
    return super.execute(input, context);
  }

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { loaded?: boolean };
    return `Scene opened successfully (loaded: ${r.loaded ?? true})\n${JSON.stringify(result, null, 2)}`;
  }
}
