import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const animationPlaySchema = z.object({
  instanceId: z.number().describe('Instance ID of the GameObject with Animator/Animation component'),
  action: z.enum(['play', 'stop', 'pause']).describe('Animation control action'),
  clipName: z.string().optional().describe('Name of the animation clip to play'),
  crossFadeDuration: z.number().optional().describe('Cross-fade duration in seconds'),
});

export class AnimationPlayTool extends BridgeTool {
  readonly name = 'unity_animation_play';
  readonly description = 'Play, stop, or pause an animation on a GameObject';
  protected readonly rpcMethod = 'animation.control';
  protected readonly schema = animationPlaySchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-subsystem';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { playing?: boolean; clipName?: string; state?: string };
    return `Animation ${r.state ?? 'updated'}: clip "${r.clipName ?? 'none'}"\n${JSON.stringify(result, null, 2)}`;
  }
}
