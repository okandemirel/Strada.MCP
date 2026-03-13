import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

const physicsRaycastSchema = z.object({
  origin: vector3Schema.describe('Ray origin point in world space'),
  direction: vector3Schema.describe('Ray direction vector'),
  maxDistance: z.number().optional().describe('Maximum ray distance (default: Infinity)'),
  layerMask: z.number().optional().describe('Layer mask to filter collisions'),
});

interface RaycastHit {
  instanceId?: number;
  name?: string;
  point?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  distance?: number;
}

export class PhysicsRaycastTool extends BridgeTool {
  readonly name = 'unity_physics_raycast';
  readonly description = 'Cast a ray in the physics world and return all hits with position, normal, and distance';
  protected readonly rpcMethod = 'physics.raycast';
  protected readonly schema = physicsRaycastSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-subsystem';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { hits?: RaycastHit[] };
    const hits = r.hits ?? [];
    const lines = hits.map(
      (h) =>
        `  - ${h.name ?? '?'} (id: ${h.instanceId ?? '?'}) at dist ${h.distance?.toFixed(2) ?? '?'} point (${h.point?.x.toFixed(2) ?? '?'}, ${h.point?.y.toFixed(2) ?? '?'}, ${h.point?.z.toFixed(2) ?? '?'})`,
    );
    return `Raycast returned ${hits.length} hit(s):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
