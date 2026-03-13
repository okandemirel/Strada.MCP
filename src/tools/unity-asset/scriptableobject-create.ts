import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';
import type { ToolCategory } from '../tool.interface.js';

const scriptableObjectCreateSchema = z.object({
  typeName: z.string().describe('Fully qualified ScriptableObject type name'),
  savePath: z.string().describe('Asset path to save the new SO (e.g. Assets/Data/EnemyConfig.asset)'),
  fields: z.record(z.string(), z.any()).optional().describe('Initial field values to set on the SO'),
});

export class ScriptableObjectCreateTool extends BridgeTool {
  readonly name = 'unity_scriptableobject_create';
  readonly description = 'Create a new ScriptableObject asset instance';
  protected readonly rpcMethod = 'scriptableObject.create';
  protected readonly schema = scriptableObjectCreateSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory: ToolCategory = 'unity-asset';

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { path?: string; typeName?: string; created?: boolean };
    return `Created ScriptableObject "${r.typeName ?? 'unknown'}" at ${r.path ?? 'unknown'}\n${JSON.stringify(result, null, 2)}`;
  }
}
