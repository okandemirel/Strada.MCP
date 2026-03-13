import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const animationListSchema = z.object({
  instanceId: z.number().describe('Instance ID of the GameObject with Animator/Animation component'),
});

interface AnimClip {
  name?: string;
  length?: number;
  looping?: boolean;
}

interface AnimParameter {
  name?: string;
  type?: string;
  value?: unknown;
}

export class AnimationListTool extends BridgeTool {
  readonly name = 'unity_animation_list';
  readonly description = 'List animation clips and animator parameters on a GameObject';
  protected readonly rpcMethod = 'animation.list';
  protected readonly schema = animationListSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-subsystem';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { clips?: AnimClip[]; parameters?: AnimParameter[] };
    const clips = r.clips ?? [];
    const params = r.parameters ?? [];

    const clipLines = clips.map(
      (c) => `  - ${c.name ?? '?'} (${c.length?.toFixed(2) ?? '?'}s, loop: ${c.looping ?? '?'})`,
    );
    const paramLines = params.map(
      (p) => `  - ${p.name ?? '?'} (${p.type ?? '?'}): ${JSON.stringify(p.value)}`,
    );

    return [
      `Animation clips (${clips.length}):`,
      ...clipLines,
      `\nAnimator parameters (${params.length}):`,
      ...paramLines,
      '',
      JSON.stringify(result, null, 2),
    ].join('\n');
  }
}
