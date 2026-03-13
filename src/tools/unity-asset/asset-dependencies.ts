import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const assetDependenciesSchema = z.object({
  assetPath: z.string().describe('Path to the asset (e.g. Assets/Materials/Wood.mat)'),
  recursive: z.boolean().optional().default(false).describe('Include transitive dependencies'),
});

interface DependencyEntry {
  path?: string;
  type?: string;
}

export class AssetDependenciesTool extends BridgeTool {
  readonly name = 'unity_asset_dependencies';
  readonly description = 'Get the dependency tree for a Unity asset';
  protected readonly rpcMethod = 'asset.dependencies';
  protected readonly schema = assetDependenciesSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { assetPath?: string; dependencies?: DependencyEntry[] };
    const deps = r.dependencies ?? [];
    const lines = deps.map(
      (d) => `  - ${d.path ?? '?'} [${d.type ?? '?'}]`,
    );
    return `Asset "${r.assetPath ?? 'unknown'}" has ${deps.length} dependency(ies):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
