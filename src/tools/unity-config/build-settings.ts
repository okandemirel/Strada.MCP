import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const buildSettingsSchema = z.object({
  action: z.enum(['get', 'set']).describe("'get' to read, 'set' to write build settings"),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe('Settings to write: scenes (string[]), activeBuildTarget, buildOptions, etc.'),
});

interface BuildScene {
  path?: string;
  enabled?: boolean;
}

interface BuildSettingsResult {
  scenes?: BuildScene[];
  activeBuildTarget?: string;
  buildOptions?: string[];
  [key: string]: unknown;
}

export class BuildSettingsTool extends BridgeTool {
  readonly name = 'unity_build_settings';
  readonly description = 'Get or set Unity build settings (scenes list, target platform, build options)';
  protected readonly rpcMethod = 'project.buildSettings';
  protected readonly schema = buildSettingsSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-config';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as BuildSettingsResult;
    const lines: string[] = ['Build Settings:'];

    if (r.activeBuildTarget) {
      lines.push(`  Target: ${r.activeBuildTarget}`);
    }

    if (r.scenes) {
      lines.push(`  Scenes (${r.scenes.length}):`);
      for (const scene of r.scenes) {
        const status = scene.enabled === false ? ' [disabled]' : '';
        lines.push(`    - ${scene.path ?? '?'}${status}`);
      }
    }

    if (r.buildOptions) {
      lines.push(`  Options: ${r.buildOptions.join(', ')}`);
    }

    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}
