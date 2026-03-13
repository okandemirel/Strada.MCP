import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const lightingBakeSchema = z.object({
  quality: z.enum(['low', 'medium', 'high']).optional().describe('Bake quality preset'),
  directSamples: z.number().optional().describe('Number of direct light samples'),
  indirectSamples: z.number().optional().describe('Number of indirect light samples'),
  bounces: z.number().optional().describe('Number of light bounces'),
  resolution: z.number().optional().describe('Lightmap resolution (texels per unit)'),
});

export class LightingBakeTool extends BridgeTool {
  readonly name = 'unity_lighting_bake';
  readonly description = 'Bake lightmaps for the current scene';
  protected readonly rpcMethod = 'lighting.bake';
  protected readonly schema = lightingBakeSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-subsystem';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as {
      baked?: boolean;
      lightmapCount?: number;
      totalSizeBytes?: number;
      duration?: number;
    };
    const sizeMB = r.totalSizeBytes ? (r.totalSizeBytes / (1024 * 1024)).toFixed(2) : '?';
    return [
      `Lightmaps baked successfully.`,
      `  Lightmap count: ${r.lightmapCount ?? '?'}`,
      `  Total size: ${sizeMB} MB`,
      `  Duration: ${r.duration?.toFixed(1) ?? '?'} seconds`,
      '',
      JSON.stringify(result, null, 2),
    ].join('\n');
  }
}
