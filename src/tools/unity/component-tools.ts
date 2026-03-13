import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

// ---------------------------------------------------------------------------
// unity_add_component
// ---------------------------------------------------------------------------

const addComponentSchema = z.object({
  instanceId: z.number(),
  componentType: z.string(),
});

export class AddComponentTool extends BridgeTool {
  readonly name = 'unity_add_component';
  readonly description = 'Add a component to a GameObject by type name';
  protected readonly rpcMethod = 'component.add';
  protected readonly schema = addComponentSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { componentType?: string; added?: boolean };
    return `Added component "${r.componentType ?? 'unknown'}" successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_remove_component
// ---------------------------------------------------------------------------

const removeComponentSchema = z.object({
  instanceId: z.number(),
  componentType: z.string(),
});

export class RemoveComponentTool extends BridgeTool {
  readonly name = 'unity_remove_component';
  readonly description = 'Remove a component from a GameObject by type name (dangerous)';
  protected readonly rpcMethod = 'component.remove';
  protected readonly schema = removeComponentSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Component removed successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_get_components
// ---------------------------------------------------------------------------

const getComponentsSchema = z.object({
  instanceId: z.number(),
});

export class GetComponentsTool extends BridgeTool {
  readonly name = 'unity_get_components';
  readonly description = 'List all components attached to a GameObject';
  protected readonly rpcMethod = 'component.list';
  protected readonly schema = getComponentsSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { components?: Array<{ type?: string }> };
    const components = r.components ?? [];
    const lines = components.map((c) => `  - ${c.type ?? 'unknown'}`);
    return `Found ${components.length} component(s):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}
