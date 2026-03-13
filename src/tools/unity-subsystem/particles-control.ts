import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const particlesControlSchema = z.object({
  instanceId: z.number().describe('Instance ID of the GameObject with ParticleSystem component'),
  action: z.enum(['play', 'stop', 'restart']).describe('Particle system control action'),
  withChildren: z.boolean().optional().describe('Also affect child particle systems'),
});

export class ParticlesControlTool extends BridgeTool {
  readonly name = 'unity_particles_control';
  readonly description = 'Play, stop, or restart a particle system on a GameObject';
  protected readonly rpcMethod = 'particles.control';
  protected readonly schema = particlesControlSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-subsystem';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { playing?: boolean; particleCount?: number };
    const state = r.playing ? 'playing' : 'stopped';
    return `Particle system ${state} (${r.particleCount ?? 0} active particles)\n${JSON.stringify(result, null, 2)}`;
  }
}
