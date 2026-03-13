# Phase 8: Unity Runtime Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 18 Unity runtime tools that operate via the bridge protocol established in Phase 7. These tools enable full GameObject CRUD, component manipulation, transform/hierarchy control, play mode management, and editor utilities — all through JSON-RPC over the Unity bridge connection.

**Architecture:** All 18 tools extend a `BridgeTool` abstract base class that handles bridge connection checking and JSON-RPC call delegation. Each tool defines a Zod input schema, validates input, builds a JSON-RPC request, sends it via the bridge client, and parses the response. All tools have `requiresBridge: true` in metadata and return `ToolResult` with structured metadata.

**Tech Stack:** TypeScript, zod, bridge client from Phase 7 (`src/bridge/bridge-client.ts`)

---

### Task 1: BridgeTool abstract base class

**Files:**
- Create: `src/tools/unity/bridge-tool.ts`
- Create: `src/tools/unity/bridge-tool.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity/bridge-tool.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BridgeTool } from './bridge-tool.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';
import { z } from 'zod';

// Concrete test subclass
class TestBridgeTool extends BridgeTool {
  readonly name = 'test_bridge_tool';
  readonly description = 'Test bridge tool';
  readonly rpcMethod = 'test.method';

  protected schema = z.object({
    value: z.string(),
  });

  protected async buildRequest(input: { value: string }): Promise<Record<string, unknown>> {
    return { value: input.value };
  }

  protected formatResponse(result: unknown): string {
    return JSON.stringify(result, null, 2);
  }
}

describe('BridgeTool', () => {
  const connectedCtx: ToolContext = {
    projectPath: '/tmp/project',
    workingDirectory: '/tmp/project',
    readOnly: false,
    unityBridgeConnected: true,
  };

  const disconnectedCtx: ToolContext = {
    ...connectedCtx,
    unityBridgeConnected: false,
  };

  it('should return error when bridge is not connected', async () => {
    const tool = new TestBridgeTool();
    const result = await tool.execute({ value: 'test' }, disconnectedCtx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unity Editor is not connected');
  });

  it('should have requiresBridge: true in metadata', () => {
    const tool = new TestBridgeTool();
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.category).toBe('unity-runtime');
  });

  it('should validate input against schema', async () => {
    const tool = new TestBridgeTool();
    const result = await tool.execute({ value: 123 }, connectedCtx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Validation');
  });

  it('should expose inputSchema as JSON schema', () => {
    const tool = new TestBridgeTool();
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe('object');
  });

  it('should delegate to bridge client on valid input', async () => {
    const tool = new TestBridgeTool();
    // Mock the bridge client request method
    const mockRequest = vi.fn().mockResolvedValue({ success: true, data: { id: 1 } });
    tool.setBridgeClient({ request: mockRequest } as any);

    const result = await tool.execute({ value: 'hello' }, connectedCtx);
    expect(result.isError).toBeFalsy();
    expect(mockRequest).toHaveBeenCalledWith('test.method', { value: 'hello' });
  });

  it('should handle bridge request errors gracefully', async () => {
    const tool = new TestBridgeTool();
    const mockRequest = vi.fn().mockRejectedValue(new Error('Connection lost'));
    tool.setBridgeClient({ request: mockRequest } as any);

    const result = await tool.execute({ value: 'hello' }, connectedCtx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Connection lost');
  });

  it('should track execution time in metadata', async () => {
    const tool = new TestBridgeTool();
    const mockRequest = vi.fn().mockResolvedValue({ success: true, data: {} });
    tool.setBridgeClient({ request: mockRequest } as any);

    const result = await tool.execute({ value: 'hello' }, connectedCtx);
    expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/unity/bridge-tool.ts
import { z } from 'zod';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata, ToolCategory } from '../tool.interface.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';

export abstract class BridgeTool implements ITool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly rpcMethod: string;

  protected abstract schema: z.ZodType;
  protected abstract buildRequest(input: unknown): Promise<Record<string, unknown>>;
  protected abstract formatResponse(result: unknown): string;

  protected category: ToolCategory = 'unity-runtime';
  protected dangerous = false;
  protected readOnlyTool = true;

  private bridgeClient: BridgeClient | null = null;

  get metadata(): ToolMetadata {
    return {
      category: this.category,
      requiresBridge: true,
      dangerous: this.dangerous,
      readOnly: this.readOnlyTool,
    };
  }

  get inputSchema(): Record<string, unknown> {
    return zodToJsonSchema(this.schema);
  }

  setBridgeClient(client: BridgeClient): void {
    this.bridgeClient = client;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Check bridge connection
    if (!context.unityBridgeConnected) {
      return {
        content: `Unity Editor is not connected. Tool "${this.name}" requires an active bridge connection. Start Unity and ensure the Strada.MCP Editor package is running.`,
        isError: true,
      };
    }

    // 2. Validate input
    const parsed = this.schema.safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return {
        content: `Validation error: ${errors}`,
        isError: true,
      };
    }

    // 3. Check read-only mode for write tools
    if (!this.readOnlyTool && context.readOnly) {
      return {
        content: `Tool "${this.name}" requires write access but server is in read-only mode.`,
        isError: true,
      };
    }

    try {
      // 4. Build JSON-RPC request params
      const params = await this.buildRequest(parsed.data);

      // 5. Send via bridge
      if (!this.bridgeClient) {
        return {
          content: `Bridge client not initialized for tool "${this.name}".`,
          isError: true,
        };
      }

      const response = await this.bridgeClient.request(this.rpcMethod, params);

      // 6. Format response
      const content = this.formatResponse(response);
      const elapsed = Date.now() - startTime;

      return {
        content,
        metadata: { executionTimeMs: elapsed },
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Bridge error in "${this.name}": ${message}`,
        isError: true,
        metadata: { executionTimeMs: elapsed },
      };
    }
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity/bridge-tool.test.ts`
Expected: PASS (7 tests)

**Step 4: Commit**

```bash
git add src/tools/unity/bridge-tool.ts src/tools/unity/bridge-tool.test.ts
git commit -m "feat: add BridgeTool abstract base class for Unity runtime tools"
```

---

### Task 2: GameObject CRUD tools (5 tools)

**Files:**
- Create: `src/tools/unity/gameobject-create.ts`
- Create: `src/tools/unity/gameobject-find.ts`
- Create: `src/tools/unity/gameobject-modify.ts`
- Create: `src/tools/unity/gameobject-delete.ts`
- Create: `src/tools/unity/gameobject-duplicate.ts`
- Create: `src/tools/unity/gameobject-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity/gameobject-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameObjectCreateTool } from './gameobject-create.js';
import { GameObjectFindTool } from './gameobject-find.js';
import { GameObjectModifyTool } from './gameobject-modify.js';
import { GameObjectDeleteTool } from './gameobject-delete.js';
import { GameObjectDuplicateTool } from './gameobject-duplicate.js';
import type { ToolContext } from '../tool.interface.js';

const ctx: ToolContext = {
  projectPath: '/tmp/project',
  workingDirectory: '/tmp/project',
  readOnly: false,
  unityBridgeConnected: true,
};

const readOnlyCtx: ToolContext = { ...ctx, readOnly: true };

function mockBridge(response: unknown) {
  return { request: vi.fn().mockResolvedValue(response) } as any;
}

describe('unity_create_gameobject', () => {
  let tool: GameObjectCreateTool;

  beforeEach(() => {
    tool = new GameObjectCreateTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_create_gameobject');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.category).toBe('unity-runtime');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create empty GameObject', async () => {
    const bridge = mockBridge({
      instanceId: 12345,
      name: 'Player',
      path: '/Player',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ name: 'Player', type: 'empty' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Player');
    expect(result.content).toContain('12345');
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', {
      name: 'Player',
      type: 'empty',
    });
  });

  it('should create primitive with position', async () => {
    const bridge = mockBridge({
      instanceId: 99,
      name: 'MyCube',
      path: '/MyCube',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      name: 'MyCube',
      type: 'Cube',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', {
      name: 'MyCube',
      type: 'Cube',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    });
  });

  it('should create from prefab path', async () => {
    const bridge = mockBridge({
      instanceId: 200,
      name: 'Enemy',
      path: '/Enemy',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      name: 'Enemy',
      type: 'prefab',
      prefabPath: 'Assets/Prefabs/Enemy.prefab',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', {
      name: 'Enemy',
      type: 'prefab',
      prefabPath: 'Assets/Prefabs/Enemy.prefab',
    });
  });

  it('should create with parent', async () => {
    const bridge = mockBridge({
      instanceId: 300,
      name: 'Child',
      path: '/Parent/Child',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      name: 'Child',
      type: 'empty',
      parent: 'Parent',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', {
      name: 'Child',
      type: 'empty',
      parent: 'Parent',
    });
  });

  it('should reject invalid type', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ name: 'Test', type: 'InvalidPrimitive' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Validation');
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ name: 'Test', type: 'empty' }, readOnlyCtx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });
});

describe('unity_find_gameobjects', () => {
  let tool: GameObjectFindTool;

  beforeEach(() => {
    tool = new GameObjectFindTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_find_gameobjects');
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should find by name (exact)', async () => {
    const bridge = mockBridge([
      { instanceId: 1, name: 'Player', tag: 'Player', layer: 0, active: true, path: '/Player' },
    ]);
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ name: 'Player', matchMode: 'exact' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Player');
    expect(bridge.request).toHaveBeenCalledWith('gameobject.find', {
      name: 'Player',
      matchMode: 'exact',
    });
  });

  it('should find by tag', async () => {
    const bridge = mockBridge([
      { instanceId: 2, name: 'Enemy1', tag: 'Enemy', layer: 0, active: true, path: '/Enemy1' },
      { instanceId: 3, name: 'Enemy2', tag: 'Enemy', layer: 0, active: true, path: '/Enemy2' },
    ]);
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ tag: 'Enemy' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Enemy1');
    expect(result.content).toContain('Enemy2');
  });

  it('should find by component type', async () => {
    const bridge = mockBridge([
      { instanceId: 5, name: 'Cam', tag: 'MainCamera', layer: 0, active: true, path: '/Cam' },
    ]);
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ componentType: 'Camera' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.find', {
      componentType: 'Camera',
    });
  });

  it('should find by name with regex match', async () => {
    const bridge = mockBridge([]);
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ name: 'Enemy.*', matchMode: 'regex' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.find', {
      name: 'Enemy.*',
      matchMode: 'regex',
    });
  });

  it('should find by layer', async () => {
    const bridge = mockBridge([]);
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ layer: 8 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.find', { layer: 8 });
  });

  it('should require at least one search criterion', async () => {
    tool.setBridgeClient(mockBridge([]));
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('at least one');
  });
});

describe('unity_modify_gameobject', () => {
  let tool: GameObjectModifyTool;

  beforeEach(() => {
    tool = new GameObjectModifyTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_modify_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should modify name and tag', async () => {
    const bridge = mockBridge({ success: true, instanceId: 10, name: 'NewName', tag: 'Player' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'OldName',
      properties: { name: 'NewName', tag: 'Player' },
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.modify', {
      target: 'OldName',
      properties: { name: 'NewName', tag: 'Player' },
    });
  });

  it('should modify active state', async () => {
    const bridge = mockBridge({ success: true, instanceId: 10, active: false });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 10,
      properties: { active: false },
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.modify', {
      target: 10,
      properties: { active: false },
    });
  });

  it('should modify layer and static flags', async () => {
    const bridge = mockBridge({ success: true });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Terrain',
      properties: { layer: 8, isStatic: true },
    }, ctx);

    expect(result.isError).toBeFalsy();
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Test',
      properties: { name: 'New' },
    }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_delete_gameobject', () => {
  let tool: GameObjectDeleteTool;

  beforeEach(() => {
    tool = new GameObjectDeleteTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_delete_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(true);
  });

  it('should delete by name', async () => {
    const bridge = mockBridge({ success: true, deletedCount: 1 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ target: 'Obsolete' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.delete', {
      target: 'Obsolete',
      withChildren: true,
    });
  });

  it('should delete by instanceId', async () => {
    const bridge = mockBridge({ success: true, deletedCount: 1 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ target: 555 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.delete', {
      target: 555,
      withChildren: true,
    });
  });

  it('should support withChildren false', async () => {
    const bridge = mockBridge({ success: true, deletedCount: 1 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ target: 'Parent', withChildren: false }, ctx);
    expect(bridge.request).toHaveBeenCalledWith('gameobject.delete', {
      target: 'Parent',
      withChildren: false,
    });
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ target: 'Test' }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_duplicate_gameobject', () => {
  let tool: GameObjectDuplicateTool;

  beforeEach(() => {
    tool = new GameObjectDuplicateTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_duplicate_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should duplicate with default name', async () => {
    const bridge = mockBridge({
      instanceId: 400,
      name: 'Player (1)',
      path: '/Player (1)',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ target: 'Player' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('400');
    expect(bridge.request).toHaveBeenCalledWith('gameobject.duplicate', {
      target: 'Player',
    });
  });

  it('should duplicate with custom name and parent', async () => {
    const bridge = mockBridge({
      instanceId: 401,
      name: 'ClonedEnemy',
      path: '/Enemies/ClonedEnemy',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 100,
      newName: 'ClonedEnemy',
      parent: 'Enemies',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.duplicate', {
      target: 100,
      newName: 'ClonedEnemy',
      parent: 'Enemies',
    });
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ target: 'Test' }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement all 5 GameObject tools**

```typescript
// src/tools/unity/gameobject-create.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const inputSchema = z.object({
  name: z.string().min(1).describe('Name for the new GameObject'),
  type: z.enum(['empty', 'Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad', 'prefab'])
    .describe('Primitive type, "empty" for empty GameObject, or "prefab" to instantiate from prefabPath'),
  parent: z.union([z.string(), z.number()]).optional()
    .describe('Parent GameObject name or instanceId'),
  position: Vector3Schema.optional().describe('Initial world position'),
  rotation: Vector3Schema.optional().describe('Initial euler rotation (degrees)'),
  scale: Vector3Schema.optional().describe('Initial local scale'),
  prefabPath: z.string().optional()
    .describe('Asset path to prefab (required when type is "prefab")'),
});

export class GameObjectCreateTool extends BridgeTool {
  readonly name = 'unity_create_gameobject';
  readonly description = 'Create a new GameObject in the active scene. Supports primitives (Cube, Sphere, Capsule, Cylinder, Plane, Quad), empty GameObjects, and prefab instantiation.';
  readonly rpcMethod = 'gameobject.create';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      name: input.name,
      type: input.type,
    };
    if (input.parent !== undefined) params.parent = input.parent;
    if (input.position) params.position = input.position;
    if (input.rotation) params.rotation = input.rotation;
    if (input.scale) params.scale = input.scale;
    if (input.prefabPath) params.prefabPath = input.prefabPath;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId: number; name: string; path: string };
    return [
      `Created GameObject "${r.name}"`,
      `  Instance ID: ${r.instanceId}`,
      `  Hierarchy:   ${r.path}`,
    ].join('\n');
  }
}
```

```typescript
// src/tools/unity/gameobject-find.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';

const inputSchema = z.object({
  name: z.string().optional().describe('Name to search for'),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional()
    .describe('How to match the name (default: exact)'),
  tag: z.string().optional().describe('Filter by tag'),
  componentType: z.string().optional().describe('Filter by component type name'),
  layer: z.number().int().min(0).max(31).optional().describe('Filter by layer index'),
});

interface FoundGameObject {
  instanceId: number;
  name: string;
  tag: string;
  layer: number;
  active: boolean;
  path: string;
}

export class GameObjectFindTool extends BridgeTool {
  readonly name = 'unity_find_gameobjects';
  readonly description = 'Find GameObjects by name (exact/contains/regex), tag, component type, or layer. Returns an array of matching GameObjects with instanceId, hierarchy path, and metadata.';
  readonly rpcMethod = 'gameobject.find';

  protected schema = inputSchema;
  protected readOnlyTool = true;

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Custom validation: at least one search criterion required
    const hasAnyCriteria = input.name || input.tag || input.componentType || input.layer !== undefined;
    if (!hasAnyCriteria) {
      return {
        content: 'Provide at least one search criterion: name, tag, componentType, or layer.',
        isError: true,
      };
    }
    return super.execute(input, context);
  }

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    if (input.name !== undefined) params.name = input.name;
    if (input.matchMode !== undefined) params.matchMode = input.matchMode;
    if (input.tag !== undefined) params.tag = input.tag;
    if (input.componentType !== undefined) params.componentType = input.componentType;
    if (input.layer !== undefined) params.layer = input.layer;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const items = result as FoundGameObject[];
    if (items.length === 0) {
      return 'No GameObjects found matching the criteria.';
    }
    const header = `Found ${items.length} GameObject(s):\n`;
    const rows = items.map((go) =>
      `  [${go.instanceId}] ${go.path} (tag: ${go.tag}, layer: ${go.layer}, active: ${go.active})`,
    );
    return header + rows.join('\n');
  }
}
```

```typescript
// src/tools/unity/gameobject-modify.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId to modify'),
  properties: z.object({
    name: z.string().optional().describe('New name'),
    tag: z.string().optional().describe('New tag'),
    layer: z.number().int().min(0).max(31).optional().describe('New layer index'),
    active: z.boolean().optional().describe('Set active/inactive'),
    isStatic: z.boolean().optional().describe('Set static flag'),
  }).describe('Properties to update'),
});

export class GameObjectModifyTool extends BridgeTool {
  readonly name = 'unity_modify_gameobject';
  readonly description = 'Modify a GameObject\'s name, tag, layer, active state, or static flags.';
  readonly rpcMethod = 'gameobject.modify';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      target: input.target,
      properties: input.properties,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as Record<string, unknown>;
    return `GameObject modified successfully.\n${JSON.stringify(r, null, 2)}`;
  }
}
```

```typescript
// src/tools/unity/gameobject-delete.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId to delete'),
  withChildren: z.boolean().default(true)
    .describe('Also delete all child GameObjects (default: true)'),
});

export class GameObjectDeleteTool extends BridgeTool {
  readonly name = 'unity_delete_gameobject';
  readonly description = 'Delete a GameObject from the scene. Supports undo. By default deletes all children too.';
  readonly rpcMethod = 'gameobject.delete';

  protected schema = inputSchema;
  protected readOnlyTool = false;
  protected dangerous = true;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      target: input.target,
      withChildren: input.withChildren,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { success: boolean; deletedCount: number };
    return `Deleted ${r.deletedCount} GameObject(s). Use unity_undo_redo to reverse.`;
  }
}
```

```typescript
// src/tools/unity/gameobject-duplicate.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId to duplicate'),
  newName: z.string().optional()
    .describe('Name for the clone (default: Unity auto-names with suffix)'),
  parent: z.union([z.string(), z.number()]).optional()
    .describe('New parent for the clone'),
});

export class GameObjectDuplicateTool extends BridgeTool {
  readonly name = 'unity_duplicate_gameobject';
  readonly description = 'Duplicate (clone) a GameObject with all its components and children. Optionally rename and reparent the clone.';
  readonly rpcMethod = 'gameobject.duplicate';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { target: input.target };
    if (input.newName !== undefined) params.newName = input.newName;
    if (input.parent !== undefined) params.parent = input.parent;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId: number; name: string; path: string };
    return [
      `Duplicated GameObject`,
      `  New Name:    ${r.name}`,
      `  Instance ID: ${r.instanceId}`,
      `  Hierarchy:   ${r.path}`,
    ].join('\n');
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity/gameobject-tools.test.ts`
Expected: PASS (21+ tests)

**Step 4: Commit**

```bash
git add src/tools/unity/gameobject-*.ts
git commit -m "feat: add 5 GameObject CRUD tools (create, find, modify, delete, duplicate)"
```

---

### Task 3: Transform + Hierarchy tools (2 tools)

**Files:**
- Create: `src/tools/unity/transform-set.ts`
- Create: `src/tools/unity/gameobject-reparent.ts`
- Create: `src/tools/unity/transform-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity/transform-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetTransformTool } from './transform-set.js';
import { ReparentGameObjectTool } from './gameobject-reparent.js';
import type { ToolContext } from '../tool.interface.js';

const ctx: ToolContext = {
  projectPath: '/tmp/project',
  workingDirectory: '/tmp/project',
  readOnly: false,
  unityBridgeConnected: true,
};

const readOnlyCtx: ToolContext = { ...ctx, readOnly: true };

function mockBridge(response: unknown) {
  return { request: vi.fn().mockResolvedValue(response) } as any;
}

describe('unity_set_transform', () => {
  let tool: SetTransformTool;

  beforeEach(() => {
    tool = new SetTransformTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_set_transform');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.requiresBridge).toBe(true);
  });

  it('should set position in world space', async () => {
    const bridge = mockBridge({
      position: { x: 5, y: 10, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Player',
      position: { x: 5, y: 10, z: 0 },
      space: 'world',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('transform.set', {
      target: 'Player',
      position: { x: 5, y: 10, z: 0 },
      space: 'world',
    });
  });

  it('should set rotation and scale in local space', async () => {
    const bridge = mockBridge({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 42,
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
      space: 'local',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('transform.set', {
      target: 42,
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
      space: 'local',
    });
  });

  it('should default space to world', async () => {
    const bridge = mockBridge({ position: { x: 1, y: 1, z: 1 } });
    tool.setBridgeClient(bridge);

    await tool.execute({
      target: 'Obj',
      position: { x: 1, y: 1, z: 1 },
    }, ctx);

    expect(bridge.request).toHaveBeenCalledWith('transform.set', {
      target: 'Obj',
      position: { x: 1, y: 1, z: 1 },
      space: 'world',
    });
  });

  it('should require at least one transform property', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ target: 'Obj' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('at least one');
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Obj',
      position: { x: 0, y: 0, z: 0 },
    }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_reparent_gameobject', () => {
  let tool: ReparentGameObjectTool;

  beforeEach(() => {
    tool = new ReparentGameObjectTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_reparent_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should reparent to new parent', async () => {
    const bridge = mockBridge({
      instanceId: 10,
      name: 'Child',
      newPath: '/NewParent/Child',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Child',
      newParent: 'NewParent',
      worldPositionStays: true,
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.reparent', {
      target: 'Child',
      newParent: 'NewParent',
      worldPositionStays: true,
    });
  });

  it('should move to root with null parent', async () => {
    const bridge = mockBridge({
      instanceId: 10,
      name: 'Child',
      newPath: '/Child',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 10,
      newParent: null,
      worldPositionStays: false,
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.reparent', {
      target: 10,
      newParent: null,
      worldPositionStays: false,
    });
  });

  it('should default worldPositionStays to true', async () => {
    const bridge = mockBridge({ instanceId: 10, name: 'X', newPath: '/P/X' });
    tool.setBridgeClient(bridge);

    await tool.execute({ target: 'X', newParent: 'P' }, ctx);
    expect(bridge.request).toHaveBeenCalledWith('gameobject.reparent', {
      target: 'X',
      newParent: 'P',
      worldPositionStays: true,
    });
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'X',
      newParent: 'P',
    }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement both tools**

```typescript
// src/tools/unity/transform-set.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';

const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId'),
  position: Vector3Schema.optional().describe('New position'),
  rotation: Vector3Schema.optional().describe('New euler rotation (degrees)'),
  scale: Vector3Schema.optional().describe('New local scale'),
  space: z.enum(['local', 'world']).default('world')
    .describe('Coordinate space for position and rotation'),
});

export class SetTransformTool extends BridgeTool {
  readonly name = 'unity_set_transform';
  readonly description = 'Set position, rotation (euler angles), and/or scale of a GameObject. Specify coordinate space as local or world.';
  readonly rpcMethod = 'transform.set';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // At least one transform property required
    if (!input.position && !input.rotation && !input.scale) {
      return {
        content: 'Provide at least one transform property: position, rotation, or scale.',
        isError: true,
      };
    }
    return super.execute(input, context);
  }

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      target: input.target,
      space: input.space,
    };
    if (input.position) params.position = input.position;
    if (input.rotation) params.rotation = input.rotation;
    if (input.scale) params.scale = input.scale;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { position?: object; rotation?: object; scale?: object };
    const lines = ['Transform updated:'];
    if (r.position) lines.push(`  Position: ${JSON.stringify(r.position)}`);
    if (r.rotation) lines.push(`  Rotation: ${JSON.stringify(r.rotation)}`);
    if (r.scale) lines.push(`  Scale:    ${JSON.stringify(r.scale)}`);
    return lines.join('\n');
  }
}
```

```typescript
// src/tools/unity/gameobject-reparent.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId to reparent'),
  newParent: z.union([z.string(), z.number(), z.null()])
    .describe('New parent name or instanceId. Use null to move to scene root.'),
  worldPositionStays: z.boolean().default(true)
    .describe('If true, keeps world position unchanged when reparenting'),
});

export class ReparentGameObjectTool extends BridgeTool {
  readonly name = 'unity_reparent_gameobject';
  readonly description = 'Change a GameObject\'s parent in the hierarchy. Set newParent to null to move to scene root.';
  readonly rpcMethod = 'gameobject.reparent';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      target: input.target,
      newParent: input.newParent,
      worldPositionStays: input.worldPositionStays,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceId: number; name: string; newPath: string };
    return [
      `Reparented "${r.name}"`,
      `  New path: ${r.newPath}`,
    ].join('\n');
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity/transform-tools.test.ts`
Expected: PASS (10+ tests)

**Step 4: Commit**

```bash
git add src/tools/unity/transform-set.ts src/tools/unity/gameobject-reparent.ts src/tools/unity/transform-tools.test.ts
git commit -m "feat: add unity_set_transform and unity_reparent_gameobject tools"
```

---

### Task 4: Component tools (4 tools)

**Files:**
- Create: `src/tools/unity/component-add.ts`
- Create: `src/tools/unity/component-remove.ts`
- Create: `src/tools/unity/component-get.ts`
- Create: `src/tools/unity/component-modify.ts`
- Create: `src/tools/unity/component-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity/component-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddComponentTool } from './component-add.js';
import { RemoveComponentTool } from './component-remove.js';
import { GetComponentTool } from './component-get.js';
import { ModifyComponentTool } from './component-modify.js';
import type { ToolContext } from '../tool.interface.js';

const ctx: ToolContext = {
  projectPath: '/tmp/project',
  workingDirectory: '/tmp/project',
  readOnly: false,
  unityBridgeConnected: true,
};

const readOnlyCtx: ToolContext = { ...ctx, readOnly: true };

function mockBridge(response: unknown) {
  return { request: vi.fn().mockResolvedValue(response) } as any;
}

describe('unity_add_component', () => {
  let tool: AddComponentTool;

  beforeEach(() => {
    tool = new AddComponentTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_add_component');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.requiresBridge).toBe(true);
  });

  it('should add component by type', async () => {
    const bridge = mockBridge({
      componentType: 'Rigidbody',
      properties: { mass: 1, useGravity: true, drag: 0 },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Player',
      componentType: 'Rigidbody',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Rigidbody');
    expect(bridge.request).toHaveBeenCalledWith('component.add', {
      target: 'Player',
      componentType: 'Rigidbody',
    });
  });

  it('should add component with initial values', async () => {
    const bridge = mockBridge({
      componentType: 'Rigidbody',
      properties: { mass: 5, useGravity: false },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 42,
      componentType: 'Rigidbody',
      initialValues: { mass: 5, useGravity: false },
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('component.add', {
      target: 42,
      componentType: 'Rigidbody',
      initialValues: { mass: 5, useGravity: false },
    });
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Test',
      componentType: 'BoxCollider',
    }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_remove_component', () => {
  let tool: RemoveComponentTool;

  beforeEach(() => {
    tool = new RemoveComponentTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_remove_component');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(true);
  });

  it('should remove component', async () => {
    const bridge = mockBridge({ success: true, removed: 'Rigidbody' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Player',
      componentType: 'Rigidbody',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('component.remove', {
      target: 'Player',
      componentType: 'Rigidbody',
    });
  });

  it('should reject removal of Transform', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Player',
      componentType: 'Transform',
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Transform');
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Test',
      componentType: 'BoxCollider',
    }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_get_component', () => {
  let tool: GetComponentTool;

  beforeEach(() => {
    tool = new GetComponentTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_get_component');
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should get component properties', async () => {
    const bridge = mockBridge({
      componentType: 'Transform',
      properties: {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        localScale: { x: 1, y: 1, z: 1 },
      },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Player',
      componentType: 'Transform',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Transform');
    expect(result.content).toContain('position');
    expect(bridge.request).toHaveBeenCalledWith('component.get', {
      target: 'Player',
      componentType: 'Transform',
    });
  });

  it('should work with instanceId target', async () => {
    const bridge = mockBridge({
      componentType: 'MeshRenderer',
      properties: { enabled: true },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 999,
      componentType: 'MeshRenderer',
    }, ctx);

    expect(result.isError).toBeFalsy();
  });
});

describe('unity_modify_component', () => {
  let tool: ModifyComponentTool;

  beforeEach(() => {
    tool = new ModifyComponentTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_modify_component');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should modify component values', async () => {
    const bridge = mockBridge({
      componentType: 'Rigidbody',
      updatedProperties: { mass: 10, useGravity: false },
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: 'Player',
      componentType: 'Rigidbody',
      values: { mass: 10, useGravity: false },
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('component.modify', {
      target: 'Player',
      componentType: 'Rigidbody',
      values: { mass: 10, useGravity: false },
    });
  });

  it('should reject empty values', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Player',
      componentType: 'Rigidbody',
      values: {},
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('at least one');
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({
      target: 'Test',
      componentType: 'Rigidbody',
      values: { mass: 5 },
    }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement all 4 component tools**

```typescript
// src/tools/unity/component-add.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId'),
  componentType: z.string().min(1)
    .describe('Component type name (e.g., "Rigidbody", "BoxCollider", "AudioSource")'),
  initialValues: z.record(z.unknown()).optional()
    .describe('Initial property values to set after adding'),
});

export class AddComponentTool extends BridgeTool {
  readonly name = 'unity_add_component';
  readonly description = 'Add a component to a GameObject by type name. Optionally set initial property values. Returns the component\'s serialized properties.';
  readonly rpcMethod = 'component.add';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      target: input.target,
      componentType: input.componentType,
    };
    if (input.initialValues) params.initialValues = input.initialValues;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { componentType: string; properties: Record<string, unknown> };
    return [
      `Added component: ${r.componentType}`,
      `Properties:`,
      JSON.stringify(r.properties, null, 2),
    ].join('\n');
  }
}
```

```typescript
// src/tools/unity/component-remove.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';

const PROTECTED_COMPONENTS = ['Transform', 'RectTransform'];

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId'),
  componentType: z.string().min(1)
    .describe('Component type name to remove'),
});

export class RemoveComponentTool extends BridgeTool {
  readonly name = 'unity_remove_component';
  readonly description = 'Remove a component from a GameObject. Cannot remove Transform. Supports undo.';
  readonly rpcMethod = 'component.remove';

  protected schema = inputSchema;
  protected readOnlyTool = false;
  protected dangerous = true;

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Block removal of protected components before bridge call
    const componentType = input.componentType as string;
    if (PROTECTED_COMPONENTS.includes(componentType)) {
      return {
        content: `Cannot remove ${componentType} — it is a required component on every GameObject.`,
        isError: true,
      };
    }
    return super.execute(input, context);
  }

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      target: input.target,
      componentType: input.componentType,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { success: boolean; removed: string };
    return `Removed component: ${r.removed}. Use unity_undo_redo to reverse.`;
  }
}
```

```typescript
// src/tools/unity/component-get.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId'),
  componentType: z.string().min(1)
    .describe('Component type name to read'),
});

export class GetComponentTool extends BridgeTool {
  readonly name = 'unity_get_component';
  readonly description = 'Read a component\'s serialized properties as JSON. Returns all public and serialized fields.';
  readonly rpcMethod = 'component.get';

  protected schema = inputSchema;
  protected readOnlyTool = true;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      target: input.target,
      componentType: input.componentType,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { componentType: string; properties: Record<string, unknown> };
    return [
      `Component: ${r.componentType}`,
      JSON.stringify(r.properties, null, 2),
    ].join('\n');
  }
}
```

```typescript
// src/tools/unity/component-modify.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';

const inputSchema = z.object({
  target: z.union([z.string(), z.number()])
    .describe('GameObject name or instanceId'),
  componentType: z.string().min(1)
    .describe('Component type name to modify'),
  values: z.record(z.unknown())
    .describe('Key-value pairs of properties to update'),
});

export class ModifyComponentTool extends BridgeTool {
  readonly name = 'unity_modify_component';
  readonly description = 'Modify component property values. Provide key-value pairs for properties to update.';
  readonly rpcMethod = 'component.modify';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const values = input.values as Record<string, unknown> | undefined;
    if (!values || Object.keys(values).length === 0) {
      return {
        content: 'Provide at least one property to modify in the values object.',
        isError: true,
      };
    }
    return super.execute(input, context);
  }

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      target: input.target,
      componentType: input.componentType,
      values: input.values,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { componentType: string; updatedProperties: Record<string, unknown> };
    return [
      `Modified component: ${r.componentType}`,
      `Updated properties:`,
      JSON.stringify(r.updatedProperties, null, 2),
    ].join('\n');
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity/component-tools.test.ts`
Expected: PASS (13+ tests)

**Step 4: Commit**

```bash
git add src/tools/unity/component-*.ts
git commit -m "feat: add 4 component tools (add, remove, get, modify)"
```

---

### Task 5: Editor control tools (3 tools)

**Files:**
- Create: `src/tools/unity/play-mode.ts`
- Create: `src/tools/unity/console-logs.ts`
- Create: `src/tools/unity/screenshot.ts`
- Create: `src/tools/unity/editor-control-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity/editor-control-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayModeTool } from './play-mode.js';
import { ConsoleLogsTool } from './console-logs.js';
import { ScreenshotTool } from './screenshot.js';
import type { ToolContext } from '../tool.interface.js';

const ctx: ToolContext = {
  projectPath: '/tmp/project',
  workingDirectory: '/tmp/project',
  readOnly: false,
  unityBridgeConnected: true,
};

function mockBridge(response: unknown) {
  return { request: vi.fn().mockResolvedValue(response) } as any;
}

describe('unity_play_mode', () => {
  let tool: PlayModeTool;

  beforeEach(() => {
    tool = new PlayModeTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_play_mode');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.requiresBridge).toBe(true);
  });

  it('should enter play mode', async () => {
    const bridge = mockBridge({ state: 'playing', previousState: 'stopped' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'play' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('playing');
    expect(bridge.request).toHaveBeenCalledWith('editor.playMode', { action: 'play' });
  });

  it('should pause play mode', async () => {
    const bridge = mockBridge({ state: 'paused', previousState: 'playing' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'pause' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('paused');
  });

  it('should stop play mode', async () => {
    const bridge = mockBridge({ state: 'stopped', previousState: 'playing' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'stop' }, ctx);
    expect(result.isError).toBeFalsy();
  });

  it('should step one frame', async () => {
    const bridge = mockBridge({ state: 'paused', frame: 142 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'step' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.playMode', { action: 'step' });
  });

  it('should reject invalid action', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ action: 'restart' }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_console_logs', () => {
  let tool: ConsoleLogsTool;

  beforeEach(() => {
    tool = new ConsoleLogsTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_console_logs');
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should fetch recent logs with defaults', async () => {
    const bridge = mockBridge({
      logs: [
        { type: 'log', message: 'Hello', timestamp: '2026-03-13T10:00:00Z', stackTrace: '' },
        { type: 'warning', message: 'Deprecated API', timestamp: '2026-03-13T10:00:01Z', stackTrace: '' },
      ],
      total: 2,
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('Deprecated API');
    expect(bridge.request).toHaveBeenCalledWith('editor.consoleLogs', {
      count: 50,
      filter: 'all',
    });
  });

  it('should filter by error type', async () => {
    const bridge = mockBridge({
      logs: [
        { type: 'error', message: 'NullReferenceException', timestamp: '2026-03-13T10:00:00Z', stackTrace: 'at Foo.cs:10' },
      ],
      total: 1,
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ filter: 'error', count: 10 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('NullReferenceException');
    expect(bridge.request).toHaveBeenCalledWith('editor.consoleLogs', {
      count: 10,
      filter: 'error',
    });
  });

  it('should support text search', async () => {
    const bridge = mockBridge({ logs: [], total: 0 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ search: 'NullRef', count: 20 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.consoleLogs', {
      count: 20,
      filter: 'all',
      search: 'NullRef',
    });
  });

  it('should display empty result message', async () => {
    const bridge = mockBridge({ logs: [], total: 0 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('No console logs');
  });
});

describe('unity_screenshot', () => {
  let tool: ScreenshotTool;

  beforeEach(() => {
    tool = new ScreenshotTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_screenshot');
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should capture Game View with defaults', async () => {
    const bridge = mockBridge({
      base64: 'iVBORw0KGgoAAAANSUhEUg==',
      width: 1920,
      height: 1080,
      camera: 'Game',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('1920');
    expect(result.content).toContain('1080');
    expect(bridge.request).toHaveBeenCalledWith('editor.screenshot', {
      camera: 'Game',
    });
  });

  it('should capture Scene View', async () => {
    const bridge = mockBridge({
      base64: 'iVBORw0KGgoAAAANSUhEUg==',
      width: 1280,
      height: 720,
      camera: 'Scene',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ camera: 'Scene' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.screenshot', {
      camera: 'Scene',
    });
  });

  it('should capture with custom dimensions', async () => {
    const bridge = mockBridge({
      base64: 'abc123',
      width: 800,
      height: 600,
      camera: 'Game',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      camera: 'Game',
      width: 800,
      height: 600,
      superSize: 2,
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.screenshot', {
      camera: 'Game',
      width: 800,
      height: 600,
      superSize: 2,
    });
  });

  it('should capture from named camera', async () => {
    const bridge = mockBridge({
      base64: 'xyz',
      width: 1920,
      height: 1080,
      camera: 'SecurityCam',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ camera: 'SecurityCam' }, ctx);
    expect(result.isError).toBeFalsy();
  });
});
```

**Step 2: Implement all 3 editor control tools**

```typescript
// src/tools/unity/play-mode.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  action: z.enum(['play', 'pause', 'stop', 'step'])
    .describe('Play mode action: play, pause, stop, or step (single frame advance)'),
});

export class PlayModeTool extends BridgeTool {
  readonly name = 'unity_play_mode';
  readonly description = 'Control Unity Editor play mode. Play starts game execution, pause freezes it, stop exits, step advances one frame while paused.';
  readonly rpcMethod = 'editor.playMode';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return { action: input.action };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { state: string; previousState?: string; frame?: number };
    const lines = [`Play mode: ${r.state}`];
    if (r.previousState) lines.push(`  Previous: ${r.previousState}`);
    if (r.frame !== undefined) lines.push(`  Frame: ${r.frame}`);
    return lines.join('\n');
  }
}
```

```typescript
// src/tools/unity/console-logs.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  count: z.number().int().min(1).max(500).default(50)
    .describe('Number of log entries to retrieve (default: 50, max: 500)'),
  filter: z.enum(['log', 'warning', 'error', 'all']).default('all')
    .describe('Filter by log type'),
  search: z.string().optional()
    .describe('Text filter — only return logs containing this string'),
});

interface LogEntry {
  type: string;
  message: string;
  timestamp: string;
  stackTrace: string;
}

export class ConsoleLogsTool extends BridgeTool {
  readonly name = 'unity_console_logs';
  readonly description = 'Read Unity console output. Filter by type (log/warning/error) and search text. Returns recent log entries with timestamps and stack traces.';
  readonly rpcMethod = 'editor.consoleLogs';

  protected schema = inputSchema;
  protected readOnlyTool = true;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      count: input.count,
      filter: input.filter,
    };
    if (input.search) params.search = input.search;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { logs: LogEntry[]; total: number };
    if (r.logs.length === 0) {
      return 'No console logs matching the criteria.';
    }

    const typeIcons: Record<string, string> = {
      log: '[LOG]',
      warning: '[WARN]',
      error: '[ERR]',
    };

    const header = `Console logs (${r.logs.length} of ${r.total} total):\n`;
    const entries = r.logs.map((log) => {
      const icon = typeIcons[log.type] ?? `[${log.type.toUpperCase()}]`;
      const time = log.timestamp.split('T')[1]?.replace('Z', '') ?? log.timestamp;
      let line = `${time} ${icon} ${log.message}`;
      if (log.stackTrace) line += `\n  ${log.stackTrace.split('\n')[0]}`;
      return line;
    });

    return header + entries.join('\n');
  }
}
```

```typescript
// src/tools/unity/screenshot.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  camera: z.string().default('Game')
    .describe('Camera source: "Game" (Game View), "Scene" (Scene View), or a named camera GameObject'),
  width: z.number().int().min(1).max(7680).optional()
    .describe('Capture width in pixels'),
  height: z.number().int().min(1).max(4320).optional()
    .describe('Capture height in pixels'),
  superSize: z.number().int().min(1).max(8).optional()
    .describe('Super-sampling multiplier for higher quality (1-8)'),
});

export class ScreenshotTool extends BridgeTool {
  readonly name = 'unity_screenshot';
  readonly description = 'Capture a screenshot from the Game View, Scene View, or a specific camera. Returns base64-encoded PNG image data.';
  readonly rpcMethod = 'editor.screenshot';

  protected schema = inputSchema;
  protected readOnlyTool = true;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { camera: input.camera };
    if (input.width !== undefined) params.width = input.width;
    if (input.height !== undefined) params.height = input.height;
    if (input.superSize !== undefined) params.superSize = input.superSize;
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { base64: string; width: number; height: number; camera: string };
    return [
      `Screenshot captured from "${r.camera}"`,
      `  Resolution: ${r.width}x${r.height}`,
      `  Size: ${Math.round(r.base64.length * 0.75 / 1024)}KB (base64)`,
      `  Data: data:image/png;base64,${r.base64}`,
    ].join('\n');
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity/editor-control-tools.test.ts`
Expected: PASS (15+ tests)

**Step 4: Commit**

```bash
git add src/tools/unity/play-mode.ts src/tools/unity/console-logs.ts src/tools/unity/screenshot.ts src/tools/unity/editor-control-tools.test.ts
git commit -m "feat: add editor control tools (play_mode, console_logs, screenshot)"
```

---

### Task 6: Editor utility tools (4 tools)

**Files:**
- Create: `src/tools/unity/execute-menu-item.ts`
- Create: `src/tools/unity/undo-redo.ts`
- Create: `src/tools/unity/editor-state.ts`
- Create: `src/tools/unity/refresh.ts`
- Create: `src/tools/unity/editor-utility-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity/editor-utility-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteMenuItemTool } from './execute-menu-item.js';
import { UndoRedoTool } from './undo-redo.js';
import { EditorStateTool } from './editor-state.js';
import { RefreshTool } from './refresh.js';
import type { ToolContext } from '../tool.interface.js';

const ctx: ToolContext = {
  projectPath: '/tmp/project',
  workingDirectory: '/tmp/project',
  readOnly: false,
  unityBridgeConnected: true,
};

const readOnlyCtx: ToolContext = { ...ctx, readOnly: true };

function mockBridge(response: unknown) {
  return { request: vi.fn().mockResolvedValue(response) } as any;
}

describe('unity_execute_menu_item', () => {
  let tool: ExecuteMenuItemTool;

  beforeEach(() => {
    tool = new ExecuteMenuItemTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_execute_menu_item');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(true);
  });

  it('should execute menu item by path', async () => {
    const bridge = mockBridge({ success: true, menuPath: 'Edit/Preferences' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ menuPath: 'Edit/Preferences' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.executeMenuItem', {
      menuPath: 'Edit/Preferences',
    });
  });

  it('should reject empty menu path', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ menuPath: '' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ menuPath: 'File/Save' }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});

describe('unity_undo_redo', () => {
  let tool: UndoRedoTool;

  beforeEach(() => {
    tool = new UndoRedoTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_undo_redo');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should perform single undo', async () => {
    const bridge = mockBridge({ action: 'undo', count: 1, currentGroup: 'Move Player' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'undo' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.undoRedo', {
      action: 'undo',
      count: 1,
    });
  });

  it('should perform multiple redo', async () => {
    const bridge = mockBridge({ action: 'redo', count: 3 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'redo', count: 3 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.undoRedo', {
      action: 'redo',
      count: 3,
    });
  });

  it('should get undo history', async () => {
    const bridge = mockBridge({
      history: [
        { name: 'Move Player', group: 1 },
        { name: 'Add Component', group: 2 },
      ],
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'getHistory' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Move Player');
    expect(result.content).toContain('Add Component');
  });

  it('should begin undo group', async () => {
    const bridge = mockBridge({ action: 'beginGroup', groupName: 'Batch Edit' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      action: 'beginGroup',
      groupName: 'Batch Edit',
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.undoRedo', {
      action: 'beginGroup',
      groupName: 'Batch Edit',
    });
  });

  it('should end undo group', async () => {
    const bridge = mockBridge({ action: 'endGroup' });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'endGroup' }, ctx);
    expect(result.isError).toBeFalsy();
  });

  it('should reject in read-only mode (except getHistory)', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({ action: 'undo' }, readOnlyCtx);
    expect(result.isError).toBe(true);
  });

  it('should allow getHistory in read-only mode', async () => {
    const bridge = mockBridge({ history: [] });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'getHistory' }, readOnlyCtx);
    expect(result.isError).toBeFalsy();
  });
});

describe('unity_editor_state', () => {
  let tool: EditorStateTool;

  beforeEach(() => {
    tool = new EditorStateTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_editor_state');
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should return editor state', async () => {
    const bridge = mockBridge({
      playMode: 'stopped',
      isCompiling: false,
      currentSelection: ['Player', 'Enemy'],
      activeScene: 'Assets/Scenes/Main.unity',
      platform: 'StandaloneWindows64',
      unityVersion: '2022.3.20f1',
    });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('stopped');
    expect(result.content).toContain('Main.unity');
    expect(result.content).toContain('2022.3.20f1');
    expect(bridge.request).toHaveBeenCalledWith('editor.state', {});
  });
});

describe('unity_refresh', () => {
  let tool: RefreshTool;

  beforeEach(() => {
    tool = new RefreshTool();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_refresh');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should refresh assets by default', async () => {
    const bridge = mockBridge({ importedAssets: true, compiledScripts: false, duration: 1.2 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.refresh', {
      importAssets: true,
      compileScripts: false,
    });
  });

  it('should force both import and compile', async () => {
    const bridge = mockBridge({ importedAssets: true, compiledScripts: true, duration: 3.5 });
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      importAssets: true,
      compileScripts: true,
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.refresh', {
      importAssets: true,
      compileScripts: true,
    });
  });

  it('should reject in read-only mode', async () => {
    tool.setBridgeClient(mockBridge({}));
    const result = await tool.execute({}, readOnlyCtx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement all 4 editor utility tools**

```typescript
// src/tools/unity/execute-menu-item.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  menuPath: z.string().min(1)
    .describe('Unity menu item path (e.g., "Edit/Preferences", "GameObject/Create Empty", "Window/General/Console")'),
});

export class ExecuteMenuItemTool extends BridgeTool {
  readonly name = 'unity_execute_menu_item';
  readonly description = 'Trigger a Unity Editor menu item by its full path. Equivalent to clicking the menu manually.';
  readonly rpcMethod = 'editor.executeMenuItem';

  protected schema = inputSchema;
  protected readOnlyTool = false;
  protected dangerous = true;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return { menuPath: input.menuPath };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { success: boolean; menuPath: string };
    return `Executed menu item: ${r.menuPath}`;
  }
}
```

```typescript
// src/tools/unity/undo-redo.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';
import type { ToolContext, ToolResult } from '../tool.interface.js';

const inputSchema = z.object({
  action: z.enum(['undo', 'redo', 'getHistory', 'beginGroup', 'endGroup'])
    .describe('Action: undo, redo, getHistory, beginGroup, or endGroup'),
  count: z.number().int().min(1).max(100).default(1)
    .describe('Number of undo/redo steps (default: 1, only for undo/redo)'),
  groupName: z.string().optional()
    .describe('Name for the undo group (only for beginGroup)'),
});

interface UndoHistoryEntry {
  name: string;
  group: number;
}

export class UndoRedoTool extends BridgeTool {
  readonly name = 'unity_undo_redo';
  readonly description = 'Undo or redo editor operations. Supports grouping multiple operations into a single undo step. Use getHistory to see available undo entries.';
  readonly rpcMethod = 'editor.undoRedo';

  protected schema = inputSchema;
  // Dynamic read-only: getHistory is read-only, others are not
  protected readOnlyTool = false;

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // getHistory is safe in read-only mode; others are not
    const action = input.action as string;
    if (action === 'getHistory') {
      // Temporarily allow by skipping the read-only check in base class
      // We achieve this by calling base execute which checks readOnlyTool
      // So we override the check here
      const originalReadOnly = context.readOnly;
      const overriddenContext = { ...context, readOnly: false };
      return super.execute(input, overriddenContext);
    }
    return super.execute(input, context);
  }

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { action: input.action };
    if (input.action === 'undo' || input.action === 'redo') {
      params.count = input.count;
    }
    if (input.action === 'beginGroup' && input.groupName) {
      params.groupName = input.groupName;
    }
    return params;
  }

  protected formatResponse(result: unknown): string {
    const r = result as Record<string, unknown>;

    if (r.history) {
      const entries = r.history as UndoHistoryEntry[];
      if (entries.length === 0) return 'Undo history is empty.';
      const lines = entries.map((e, i) => `  ${i + 1}. ${e.name} (group: ${e.group})`);
      return `Undo history (${entries.length} entries):\n${lines.join('\n')}`;
    }

    const lines = [`Action: ${r.action}`];
    if (r.count) lines.push(`  Steps: ${r.count}`);
    if (r.currentGroup) lines.push(`  Current: ${r.currentGroup}`);
    if (r.groupName) lines.push(`  Group: ${r.groupName}`);
    return lines.join('\n');
  }
}
```

```typescript
// src/tools/unity/editor-state.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({});

interface EditorStateResponse {
  playMode: string;
  isCompiling: boolean;
  currentSelection: string[];
  activeScene: string;
  platform: string;
  unityVersion: string;
}

export class EditorStateTool extends BridgeTool {
  readonly name = 'unity_editor_state';
  readonly description = 'Get current Unity Editor state: play mode status, compile status, selected objects, active scene, build platform, and Unity version.';
  readonly rpcMethod = 'editor.state';

  protected schema = inputSchema;
  protected readOnlyTool = true;

  protected async buildRequest(_input: unknown): Promise<Record<string, unknown>> {
    return {};
  }

  protected formatResponse(result: unknown): string {
    const r = result as EditorStateResponse;
    const selection = r.currentSelection.length > 0
      ? r.currentSelection.join(', ')
      : '(none)';

    return [
      'Unity Editor State',
      `  Play Mode:   ${r.playMode}`,
      `  Compiling:   ${r.isCompiling}`,
      `  Selection:   ${selection}`,
      `  Scene:       ${r.activeScene}`,
      `  Platform:    ${r.platform}`,
      `  Version:     ${r.unityVersion}`,
    ].join('\n');
  }
}
```

```typescript
// src/tools/unity/refresh.ts
import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const inputSchema = z.object({
  importAssets: z.boolean().default(true)
    .describe('Force reimport of modified assets (default: true)'),
  compileScripts: z.boolean().default(false)
    .describe('Force script recompilation (default: false)'),
});

export class RefreshTool extends BridgeTool {
  readonly name = 'unity_refresh';
  readonly description = 'Force Unity to reimport assets and/or recompile scripts. Use after modifying files outside the editor.';
  readonly rpcMethod = 'editor.refresh';

  protected schema = inputSchema;
  protected readOnlyTool = false;

  protected async buildRequest(input: z.infer<typeof inputSchema>): Promise<Record<string, unknown>> {
    return {
      importAssets: input.importAssets,
      compileScripts: input.compileScripts,
    };
  }

  protected formatResponse(result: unknown): string {
    const r = result as { importedAssets: boolean; compiledScripts: boolean; duration: number };
    const actions: string[] = [];
    if (r.importedAssets) actions.push('Asset import completed');
    if (r.compiledScripts) actions.push('Script compilation completed');
    if (actions.length === 0) actions.push('Refresh completed (no changes detected)');
    return `${actions.join(', ')} (${r.duration.toFixed(1)}s)`;
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity/editor-utility-tools.test.ts`
Expected: PASS (15+ tests)

**Step 4: Commit**

```bash
git add src/tools/unity/execute-menu-item.ts src/tools/unity/undo-redo.ts src/tools/unity/editor-state.ts src/tools/unity/refresh.ts src/tools/unity/editor-utility-tools.test.ts
git commit -m "feat: add 4 editor utility tools (menu item, undo/redo, editor state, refresh)"
```

---

### Task 7: Register all 18 tools + barrel export + integration test

**Files:**
- Create: `src/tools/unity/index.ts`
- Create: `src/tools/unity/register-unity-tools.ts`
- Create: `src/tools/unity/unity-runtime-integration.test.ts`

**Step 1: Write the integration test**

```typescript
// src/tools/unity/unity-runtime-integration.test.ts
import { describe, it, expect, vi } from 'vitest';
import { registerUnityRuntimeTools } from './register-unity-tools.js';
import { ToolRegistry } from '../tool-registry.js';
import type { ToolContext } from '../tool.interface.js';

describe('Unity Runtime Tools — Integration', () => {
  const ALL_TOOL_NAMES = [
    'unity_create_gameobject',
    'unity_find_gameobjects',
    'unity_modify_gameobject',
    'unity_delete_gameobject',
    'unity_duplicate_gameobject',
    'unity_set_transform',
    'unity_reparent_gameobject',
    'unity_add_component',
    'unity_remove_component',
    'unity_get_component',
    'unity_modify_component',
    'unity_play_mode',
    'unity_console_logs',
    'unity_screenshot',
    'unity_execute_menu_item',
    'unity_undo_redo',
    'unity_editor_state',
    'unity_refresh',
  ];

  it('should register all 18 Unity runtime tools', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const tools = registry.getByCategory('unity-runtime');
    expect(tools).toHaveLength(18);
  });

  it('should register every expected tool name', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    for (const name of ALL_TOOL_NAMES) {
      const tool = registry.get(name);
      expect(tool, `Missing tool: ${name}`).toBeDefined();
    }
  });

  it('should mark all tools as requiresBridge', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const tools = registry.getByCategory('unity-runtime');
    for (const tool of tools) {
      expect(tool.metadata.requiresBridge, `${tool.name} should require bridge`).toBe(true);
    }
  });

  it('should hide all 18 tools when bridge is disconnected', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const available = registry.getAvailable(false);
    const runtimeTools = available.filter((t) => t.metadata.category === 'unity-runtime');
    expect(runtimeTools).toHaveLength(0);
  });

  it('should show all 18 tools when bridge is connected', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const available = registry.getAvailable(true);
    const runtimeTools = available.filter((t) => t.metadata.category === 'unity-runtime');
    expect(runtimeTools).toHaveLength(18);
  });

  it('should have valid inputSchema on every tool', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    for (const name of ALL_TOOL_NAMES) {
      const tool = registry.get(name)!;
      expect(tool.inputSchema, `${name} missing inputSchema`).toBeDefined();
      expect(tool.inputSchema.type, `${name} inputSchema.type should be "object"`).toBe('object');
    }
  });

  it('should have descriptions on every tool', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    for (const name of ALL_TOOL_NAMES) {
      const tool = registry.get(name)!;
      expect(tool.description.length, `${name} has empty description`).toBeGreaterThan(10);
    }
  });

  it('should return bridge-not-connected error for all tools when disconnected', async () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const disconnectedCtx: ToolContext = {
      projectPath: '/tmp/project',
      workingDirectory: '/tmp/project',
      readOnly: false,
      unityBridgeConnected: false,
    };

    for (const name of ALL_TOOL_NAMES) {
      const tool = registry.get(name)!;
      const result = await tool.execute({}, disconnectedCtx);
      expect(result.isError, `${name} should error when disconnected`).toBe(true);
      expect(result.content).toContain('not connected');
    }
  });

  it('should identify read-only vs write tools correctly', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const readOnlyTools = ['unity_find_gameobjects', 'unity_get_component', 'unity_console_logs', 'unity_screenshot', 'unity_editor_state'];
    const writeTools = ALL_TOOL_NAMES.filter((n) => !readOnlyTools.includes(n));

    for (const name of readOnlyTools) {
      const tool = registry.get(name)!;
      expect(tool.metadata.readOnly, `${name} should be read-only`).toBe(true);
    }

    for (const name of writeTools) {
      const tool = registry.get(name)!;
      expect(tool.metadata.readOnly, `${name} should NOT be read-only`).toBe(false);
    }
  });

  it('should identify dangerous tools correctly', () => {
    const registry = new ToolRegistry();
    registerUnityRuntimeTools(registry);

    const dangerousTools = ['unity_delete_gameobject', 'unity_remove_component', 'unity_execute_menu_item'];

    for (const name of dangerousTools) {
      const tool = registry.get(name)!;
      expect(tool.metadata.dangerous, `${name} should be dangerous`).toBe(true);
    }
  });
});
```

**Step 2: Write barrel export**

```typescript
// src/tools/unity/index.ts
export { BridgeTool } from './bridge-tool.js';

// GameObject CRUD
export { GameObjectCreateTool } from './gameobject-create.js';
export { GameObjectFindTool } from './gameobject-find.js';
export { GameObjectModifyTool } from './gameobject-modify.js';
export { GameObjectDeleteTool } from './gameobject-delete.js';
export { GameObjectDuplicateTool } from './gameobject-duplicate.js';

// Transform + Hierarchy
export { SetTransformTool } from './transform-set.js';
export { ReparentGameObjectTool } from './gameobject-reparent.js';

// Components
export { AddComponentTool } from './component-add.js';
export { RemoveComponentTool } from './component-remove.js';
export { GetComponentTool } from './component-get.js';
export { ModifyComponentTool } from './component-modify.js';

// Editor Control
export { PlayModeTool } from './play-mode.js';
export { ConsoleLogsTool } from './console-logs.js';
export { ScreenshotTool } from './screenshot.js';

// Editor Utilities
export { ExecuteMenuItemTool } from './execute-menu-item.js';
export { UndoRedoTool } from './undo-redo.js';
export { EditorStateTool } from './editor-state.js';
export { RefreshTool } from './refresh.js';

// Registration
export { registerUnityRuntimeTools } from './register-unity-tools.js';
```

**Step 3: Write registration function**

```typescript
// src/tools/unity/register-unity-tools.ts
import type { ToolRegistry } from '../tool-registry.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';

import { GameObjectCreateTool } from './gameobject-create.js';
import { GameObjectFindTool } from './gameobject-find.js';
import { GameObjectModifyTool } from './gameobject-modify.js';
import { GameObjectDeleteTool } from './gameobject-delete.js';
import { GameObjectDuplicateTool } from './gameobject-duplicate.js';
import { SetTransformTool } from './transform-set.js';
import { ReparentGameObjectTool } from './gameobject-reparent.js';
import { AddComponentTool } from './component-add.js';
import { RemoveComponentTool } from './component-remove.js';
import { GetComponentTool } from './component-get.js';
import { ModifyComponentTool } from './component-modify.js';
import { PlayModeTool } from './play-mode.js';
import { ConsoleLogsTool } from './console-logs.js';
import { ScreenshotTool } from './screenshot.js';
import { ExecuteMenuItemTool } from './execute-menu-item.js';
import { UndoRedoTool } from './undo-redo.js';
import { EditorStateTool } from './editor-state.js';
import { RefreshTool } from './refresh.js';
import type { BridgeTool } from './bridge-tool.js';

export function registerUnityRuntimeTools(
  registry: ToolRegistry,
  bridgeClient?: BridgeClient,
): void {
  const tools: BridgeTool[] = [
    // GameObject CRUD
    new GameObjectCreateTool(),
    new GameObjectFindTool(),
    new GameObjectModifyTool(),
    new GameObjectDeleteTool(),
    new GameObjectDuplicateTool(),

    // Transform + Hierarchy
    new SetTransformTool(),
    new ReparentGameObjectTool(),

    // Components
    new AddComponentTool(),
    new RemoveComponentTool(),
    new GetComponentTool(),
    new ModifyComponentTool(),

    // Editor Control
    new PlayModeTool(),
    new ConsoleLogsTool(),
    new ScreenshotTool(),

    // Editor Utilities
    new ExecuteMenuItemTool(),
    new UndoRedoTool(),
    new EditorStateTool(),
    new RefreshTool(),
  ];

  for (const tool of tools) {
    if (bridgeClient) {
      tool.setBridgeClient(bridgeClient);
    }
    registry.register(tool);
  }
}
```

**Step 4: Run all Phase 8 tests**

Run: `npx vitest run src/tools/unity/`
Expected: ALL PASS (~80 tests across 5 test files)

**Step 5: Run quality gates**

```bash
npx tsc --noEmit
npx vitest run
```

**Step 6: Commit**

```bash
git add src/tools/unity/index.ts src/tools/unity/register-unity-tools.ts src/tools/unity/unity-runtime-integration.test.ts
git commit -m "feat: register all 18 Unity runtime tools with integration tests"
```

---

### Task 8: Push Phase 8

```bash
git push origin main
```

**Phase 8 complete.** Deliverables:
- `BridgeTool` abstract base class with connection checking, Zod validation, JSON-RPC delegation, and execution time tracking
- 5 GameObject CRUD tools (create, find, modify, delete, duplicate)
- 2 Transform + Hierarchy tools (set_transform, reparent)
- 4 Component tools (add, remove, get, modify)
- 3 Editor control tools (play_mode, console_logs, screenshot)
- 4 Editor utility tools (execute_menu_item, undo_redo, editor_state, refresh)
- Registration function with optional bridge client injection
- ~80 tests passing across 5 test suites + 1 integration suite
