import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const assetFindSchema = z.object({
  type: z.string().optional().describe('Asset type filter (e.g. Texture2D, Material, Prefab)'),
  namePattern: z.string().optional().describe('Glob pattern to match asset names'),
  labels: z.array(z.string()).optional().describe('Asset label filters'),
  folder: z.string().optional().describe('Restrict search to a folder path'),
});

interface AssetEntry {
  path?: string;
  type?: string;
  guid?: string;
}

export class AssetFindTool extends BridgeTool {
  readonly name = 'unity_find_assets';
  readonly description = 'Search Unity assets by type, name pattern, labels, or folder';
  protected readonly rpcMethod = 'asset.find';
  protected readonly schema = assetFindSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { assets?: AssetEntry[] };
    const assets = r.assets ?? [];
    const lines = assets.map(
      (a) => `  - ${a.path ?? '?'} [${a.type ?? '?'}]`,
    );
    return `Found ${assets.length} asset(s):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
