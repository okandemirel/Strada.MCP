import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const projectSettingsSchema = z.object({
  action: z.enum(['get', 'set']).describe("'get' to read, 'set' to write project settings"),
  category: z
    .enum(['physics', 'time', 'input', 'tags', 'layers', 'sorting-layers'])
    .describe('Settings category to access'),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe('Settings to write (required for set): category-specific key-value pairs'),
});

interface ProjectSettingsResult {
  category?: string;
  [key: string]: unknown;
}

export class ProjectSettingsTool extends BridgeTool {
  readonly name = 'unity_project_settings';
  readonly description = 'Get or set generic Unity project settings (physics, time, input, tags, layers, sorting layers)';
  protected readonly rpcMethod = 'project.settings';
  protected readonly schema = projectSettingsSchema;
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
    const r = result as ProjectSettingsResult;
    const lines: string[] = [`Project Settings (${r.category ?? 'unknown'}):`];

    for (const [key, value] of Object.entries(r)) {
      if (key === 'category') continue;
      if (Array.isArray(value)) {
        lines.push(`  ${key}:`);
        for (const item of value) {
          lines.push(`    - ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`);
        }
      } else {
        lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
      }
    }

    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}
