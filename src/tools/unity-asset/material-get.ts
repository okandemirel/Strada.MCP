import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const materialGetSchema = z.object({
  assetPath: z.string().optional().describe('Asset path to the material (e.g. Assets/Materials/Wood.mat)'),
  instanceId: z.number().optional().describe('Instance ID of a runtime material'),
});

interface MaterialProperty {
  name?: string;
  type?: string;
  value?: unknown;
}

export class MaterialGetTool extends BridgeTool {
  readonly name = 'unity_material_get';
  readonly description = 'Get material properties including shader, colors, textures, and float values';
  protected readonly rpcMethod = 'material.get';
  protected readonly schema = materialGetSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { name?: string; shader?: string; properties?: MaterialProperty[] };
    const props = r.properties ?? [];
    const lines = props.map(
      (p) => `  - ${p.name ?? '?'} (${p.type ?? '?'}): ${JSON.stringify(p.value)}`,
    );
    return `Material "${r.name ?? 'unknown'}" (shader: ${r.shader ?? 'unknown'})\nProperties (${props.length}):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
