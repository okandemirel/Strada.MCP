import { z } from 'zod';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import {
  discoverUnityEditorInstances,
  resolveUnityEditorTarget,
} from '../../bridge/editor-instance-registry.js';

const editorInstancesSchema = z.object({
  includeStale: z.boolean().optional().default(false),
  projectPath: z.string().optional(),
  preferredPort: z.number().int().min(1).max(65535).optional(),
  instanceId: z.string().optional(),
  staleAfterMs: z.number().int().min(1000).max(300000).optional().default(20_000),
});

export class EditorInstancesTool implements ITool {
  readonly name = 'unity_editor_instances';
  readonly description =
    'List discovered Unity editor bridge instances and show which one would be selected for the current project';

  private _inputSchema: Record<string, unknown> | null = null;

  get inputSchema(): Record<string, unknown> {
    if (!this._inputSchema) {
      this._inputSchema = zodToJsonSchema(editorInstancesSchema);
    }
    return this._inputSchema;
  }

  get metadata(): ToolMetadata {
    return {
      category: 'unity-runtime',
      requiresBridge: false,
      dangerous: false,
      readOnly: true,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const parsed = editorInstancesSchema.parse(input);
    const projectPath = parsed.projectPath ?? context.projectPath;
    const preferredPort = parsed.preferredPort ?? resolvePreferredPortFromEnv();
    const preferredInstanceId = parsed.instanceId ?? process.env.UNITY_BRIDGE_INSTANCE_ID;

    const discovered = discoverUnityEditorInstances({
      includeStale: parsed.includeStale,
      staleAfterMs: parsed.staleAfterMs,
    });
    const resolution = resolveUnityEditorTarget({
      projectPath,
      preferredPort,
      preferredInstanceId,
      explicitPort: process.env.UNITY_BRIDGE_PORT !== undefined || parsed.preferredPort !== undefined,
      staleAfterMs: parsed.staleAfterMs,
      includeStale: parsed.includeStale,
    });

    return {
      content: JSON.stringify({
        requested: {
          projectPath,
          preferredPort,
          preferredInstanceId,
          includeStale: parsed.includeStale,
        },
        selected: resolution.selected,
        selectionSource: resolution.source,
        warnings: resolution.warnings,
        count: discovered.length,
        editors: discovered,
      }, null, 2),
    };
  }
}

function resolvePreferredPortFromEnv(): number | undefined {
  const raw = process.env.UNITY_BRIDGE_PORT;
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return undefined;
  }

  return parsed;
}
