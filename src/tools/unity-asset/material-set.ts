import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const materialSetSchema = z.object({
  assetPath: z.string().describe('Asset path to the material (e.g. Assets/Materials/Wood.mat)'),
  properties: z.record(z.string(), z.any()).optional().describe('Map of property name to value'),
  shader: z.string().optional().describe('Set the material shader by name'),
});

export class MaterialSetTool extends BridgeTool {
  readonly name = 'unity_material_set';
  readonly description = 'Set material properties such as colors, textures, floats, or change shader';
  protected readonly rpcMethod = 'material.set';
  protected readonly schema = materialSetSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { updated?: boolean; propertyCount?: number };
    return `Material updated (${r.propertyCount ?? 0} properties changed).\n${JSON.stringify(result, null, 2)}`;
  }
}
