import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const qualitySettingsSchema = z.object({
  action: z.enum(['get', 'set']).describe("'get' to read, 'set' to write quality settings"),
  level: z.string().optional().describe('Quality level name to get/set (e.g. "Ultra", "Medium")'),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe('Settings to write: shadowDistance, pixelLightCount, textureQuality, antiAliasing, vSyncCount, etc.'),
});

interface QualityLevel {
  name?: string;
  shadowDistance?: number;
  pixelLightCount?: number;
  textureQuality?: number;
  antiAliasing?: number;
  vSyncCount?: number;
  [key: string]: unknown;
}

interface QualitySettingsResult {
  currentLevel?: string;
  levels?: QualityLevel[];
  [key: string]: unknown;
}

export class QualitySettingsTool extends BridgeTool {
  readonly name = 'unity_quality_settings';
  readonly description = 'Get or set Unity quality levels and settings (shadow distance, anti-aliasing, texture quality, etc.)';
  protected readonly rpcMethod = 'project.qualitySettings';
  protected readonly schema = qualitySettingsSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-config';

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'get';
  }

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as QualitySettingsResult;
    const lines: string[] = ['Quality Settings:'];

    if (r.currentLevel) {
      lines.push(`  Current Level: ${r.currentLevel}`);
    }

    if (r.levels) {
      lines.push(`  Levels (${r.levels.length}):`);
      for (const level of r.levels) {
        lines.push(`    - ${level.name ?? '?'}`);
      }
    }

    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}
