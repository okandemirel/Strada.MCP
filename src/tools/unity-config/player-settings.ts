import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const playerSettingsSchema = z.object({
  action: z.enum(['get', 'set']).describe("'get' to read, 'set' to write player settings"),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe('Settings to write (required for set): companyName, productName, bundleIdentifier, scriptingBackend, apiCompatibility, etc.'),
});

interface PlayerSettingsResult {
  companyName?: string;
  productName?: string;
  bundleIdentifier?: string;
  scriptingBackend?: string;
  apiCompatibility?: string;
  [key: string]: unknown;
}

export class PlayerSettingsTool extends BridgeTool {
  readonly name = 'unity_player_settings';
  readonly description = 'Get or set Unity player settings (company name, product name, bundle ID, scripting backend, etc.)';
  protected readonly rpcMethod = 'project.playerSettings';
  protected readonly schema = playerSettingsSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-config';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as PlayerSettingsResult;
    const lines: string[] = ['Player Settings:'];

    for (const [key, value] of Object.entries(r)) {
      lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    }

    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}
