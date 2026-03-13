import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const navmeshBakeSchema = z.object({
  agentRadius: z.number().optional().describe('NavMesh agent radius'),
  agentHeight: z.number().optional().describe('NavMesh agent height'),
  maxSlope: z.number().optional().describe('Maximum walkable slope in degrees'),
  stepHeight: z.number().optional().describe('Maximum step height the agent can climb'),
});

export class NavMeshBakeTool extends BridgeTool {
  readonly name = 'unity_navmesh_bake';
  readonly description = 'Bake the NavMesh for AI navigation';
  protected readonly rpcMethod = 'navmesh.bake';
  protected readonly schema = navmeshBakeSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-subsystem';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as {
      baked?: boolean;
      vertexCount?: number;
      triangleCount?: number;
      area?: number;
    };
    return [
      `NavMesh baked successfully.`,
      `  Vertices: ${r.vertexCount ?? '?'}`,
      `  Triangles: ${r.triangleCount ?? '?'}`,
      `  Area: ${r.area?.toFixed(1) ?? '?'} m²`,
      '',
      JSON.stringify(result, null, 2),
    ].join('\n');
  }
}
