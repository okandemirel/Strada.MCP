import { z } from 'zod';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { EditorRouterAware, UnityEditorRouter } from '../../bridge/unity-editor-router.js';

const editorRouteSchema = z.object({
  action: z.enum(['status', 'list', 'connect', 'disconnect']).optional().default('status'),
  instanceId: z.string().optional(),
  projectPath: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  includeStale: z.boolean().optional().default(false),
  staleAfterMs: z.number().int().min(1000).max(300000).optional(),
});

export class UnityEditorRouteTool implements ITool, EditorRouterAware {
  readonly name = 'unity_editor_route';
  readonly description =
    'Inspect, connect, disconnect, or retarget the live Unity bridge to a different discovered editor instance';

  private router: UnityEditorRouter | null = null;
  private _inputSchema: Record<string, unknown> | null = null;

  get inputSchema(): Record<string, unknown> {
    if (!this._inputSchema) {
      this._inputSchema = zodToJsonSchema(editorRouteSchema);
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

  setEditorRouter(router: UnityEditorRouter | null): void {
    this.router = router;
  }

  async execute(input: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    if (!this.router) {
      return {
        content: 'Error: Unity editor router is not available in this MCP runtime.',
        isError: true,
      };
    }

    const parsed = editorRouteSchema.parse(input);

    if (parsed.action === 'status') {
      return {
        content: JSON.stringify(this.router.getStatus({
          includeDiscovered: true,
          includeStale: parsed.includeStale,
          staleAfterMs: parsed.staleAfterMs,
        }), null, 2),
      };
    }

    if (parsed.action === 'list') {
      const editors = this.router.listEditors({
        includeStale: parsed.includeStale,
        staleAfterMs: parsed.staleAfterMs,
      });
      return {
        content: JSON.stringify({
          count: editors.length,
          editors,
        }, null, 2),
      };
    }

    if (parsed.action === 'disconnect') {
      const result = this.router.disconnect();
      return {
        content: JSON.stringify(result, null, 2),
        isError: result.status === 'error',
      };
    }

    const result = await this.router.retarget({
      instanceId: parsed.instanceId,
      projectPath: parsed.projectPath,
      port: parsed.port,
      includeStale: parsed.includeStale,
      staleAfterMs: parsed.staleAfterMs,
    });

    return {
      content: JSON.stringify(result, null, 2),
      isError: result.status === 'error',
    };
  }
}
