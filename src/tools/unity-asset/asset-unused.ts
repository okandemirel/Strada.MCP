import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const assetUnusedSchema = z.object({
  type: z.string().optional().describe('Filter unused assets by type'),
  folder: z.string().optional().describe('Restrict search to a folder path'),
});

interface UnusedAssetEntry {
  path?: string;
  type?: string;
  sizeBytes?: number;
}

export class AssetUnusedTool extends BridgeTool {
  readonly name = 'unity_find_unused_assets';
  readonly description = 'Find unreferenced assets in the Unity project';
  protected readonly rpcMethod = 'asset.findUnused';
  protected readonly schema = assetUnusedSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { unusedAssets?: UnusedAssetEntry[]; totalSizeBytes?: number };
    const assets = r.unusedAssets ?? [];
    const totalMB = r.totalSizeBytes ? (r.totalSizeBytes / (1024 * 1024)).toFixed(2) : '0';
    const lines = assets.map(
      (a) => `  - ${a.path ?? '?'} [${a.type ?? '?'}] (${a.sizeBytes ? (a.sizeBytes / 1024).toFixed(1) + ' KB' : '?'})`,
    );
    return `Found ${assets.length} unused asset(s) (${totalMB} MB total):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
