import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const shaderListSchema = z.object({
  namePattern: z.string().optional().describe('Glob pattern to filter shader names'),
});

interface ShaderEntry {
  name?: string;
  passCount?: number;
}

export class ShaderListTool extends BridgeTool {
  readonly name = 'unity_shader_list';
  readonly description = 'List available shaders in the Unity project';
  protected readonly rpcMethod = 'shader.list';
  protected readonly schema = shaderListSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { shaders?: ShaderEntry[] };
    const shaders = r.shaders ?? [];
    const lines = shaders.map(
      (s) => `  - ${s.name ?? '?'} (${s.passCount ?? '?'} passes)`,
    );
    return `Found ${shaders.length} shader(s):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
