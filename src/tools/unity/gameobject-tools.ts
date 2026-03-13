import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

// ---------------------------------------------------------------------------
// unity_create_gameobject
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string(),
  type: z.enum(['empty', 'Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad', 'prefab']),
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: vector3Schema.optional(),
  parent: z.number().optional(),
  prefabPath: z.string().optional(),
});

export class CreateGameObjectTool extends BridgeTool {
  readonly name = 'unity_create_gameobject';
  readonly description =
    'Create a new GameObject in the Unity scene (empty, primitive, or from prefab)';
  protected readonly rpcMethod = 'gameobject.create';
  protected readonly schema = createSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId?: number; name?: string };
    return `Created GameObject "${r.name ?? 'unknown'}" (instanceId: ${r.instanceId ?? 'unknown'})\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_find_gameobjects
// ---------------------------------------------------------------------------

const findSchema = z.object({
  query: z.string(),
  recursive: z.boolean().optional(),
  limit: z.number().optional(),
});

export class FindGameObjectsTool extends BridgeTool {
  readonly name = 'unity_find_gameobjects';
  readonly description = 'Find GameObjects by name, tag, layer, or component type';
  protected readonly rpcMethod = 'gameobject.find';
  protected readonly schema = findSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { objects?: Array<{ instanceId?: number; name?: string }> };
    const objects = r.objects ?? [];
    const lines = objects.map(
      (o) => `  - ${o.name ?? '?'} (id: ${o.instanceId ?? '?'})`,
    );
    return `Found ${objects.length} GameObject(s):\n${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_modify_gameobject
// ---------------------------------------------------------------------------

const modifySchema = z.object({
  instanceId: z.number(),
  name: z.string().optional(),
  active: z.boolean().optional(),
  tag: z.string().optional(),
  layer: z.number().optional(),
  static: z.boolean().optional(),
});

export class ModifyGameObjectTool extends BridgeTool {
  readonly name = 'unity_modify_gameobject';
  readonly description = 'Modify a GameObject properties (name, active, tag, layer, static)';
  protected readonly rpcMethod = 'gameobject.modify';
  protected readonly schema = modifySchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId?: number; name?: string };
    return `Modified GameObject (instanceId: ${r.instanceId ?? 'unknown'})\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_delete_gameobject
// ---------------------------------------------------------------------------

const deleteSchema = z.object({
  instanceId: z.number(),
});

export class DeleteGameObjectTool extends BridgeTool {
  readonly name = 'unity_delete_gameobject';
  readonly description = 'Delete a GameObject from the scene by instance ID';
  protected readonly rpcMethod = 'gameobject.delete';
  protected readonly schema = deleteSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `GameObject deleted successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_duplicate_gameobject
// ---------------------------------------------------------------------------

const duplicateSchema = z.object({
  instanceId: z.number(),
  newName: z.string().optional(),
  parent: z.number().optional(),
  offset: vector3Schema.optional(),
});

export class DuplicateGameObjectTool extends BridgeTool {
  readonly name = 'unity_duplicate_gameobject';
  readonly description = 'Duplicate a GameObject, optionally with a new name, parent, or offset';
  protected readonly rpcMethod = 'gameobject.duplicate';
  protected readonly schema = duplicateSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId?: number; name?: string };
    return `Duplicated GameObject "${r.name ?? 'unknown'}" (instanceId: ${r.instanceId ?? 'unknown'})\n${JSON.stringify(result, null, 2)}`;
  }
}
