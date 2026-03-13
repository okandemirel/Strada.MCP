import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

// ---------------------------------------------------------------------------
// unity_set_transform
// ---------------------------------------------------------------------------

const setTransformSchema = z.object({
  instanceId: z.number(),
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: vector3Schema.optional(),
  space: z.enum(['local', 'world']).optional(),
});

export class SetTransformTool extends BridgeTool {
  readonly name = 'unity_set_transform';
  readonly description =
    'Set position, rotation, and/or scale of a GameObject transform';
  protected readonly rpcMethod = 'transform.set';
  protected readonly schema = setTransformSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Transform updated successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_get_transform
// ---------------------------------------------------------------------------

const getTransformSchema = z.object({
  instanceId: z.number(),
});

export class GetTransformTool extends BridgeTool {
  readonly name = 'unity_get_transform';
  readonly description = 'Get the current transform (position, rotation, scale) of a GameObject';
  protected readonly rpcMethod = 'transform.get';
  protected readonly schema = getTransformSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as {
      position?: { x: number; y: number; z: number };
      rotation?: { x: number; y: number; z: number };
      scale?: { x: number; y: number; z: number };
    };
    const pos = r.position ? `(${r.position.x}, ${r.position.y}, ${r.position.z})` : 'N/A';
    const rot = r.rotation ? `(${r.rotation.x}, ${r.rotation.y}, ${r.rotation.z})` : 'N/A';
    const scl = r.scale ? `(${r.scale.x}, ${r.scale.y}, ${r.scale.z})` : 'N/A';
    return `Transform:\n  position: ${pos}\n  rotation: ${rot}\n  scale: ${scl}\n\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_set_parent
// ---------------------------------------------------------------------------

const setParentSchema = z.object({
  instanceId: z.number(),
  parentId: z.number().nullable(),
  worldPositionStays: z.boolean().optional(),
});

export class SetParentTool extends BridgeTool {
  readonly name = 'unity_set_parent';
  readonly description =
    'Set or clear the parent of a GameObject (null parentId to unparent)';
  protected readonly rpcMethod = 'transform.setParent';
  protected readonly schema = setParentSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Parent updated successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}
