import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrefabCreateTool } from './prefab-create.js';
import { PrefabInstantiateTool } from './prefab-instantiate.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';

function createMockBridge(response: unknown = { success: true }): BridgeClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    notify: vi.fn(),
    pendingCount: 0,
    destroy: vi.fn(),
  } as unknown as BridgeClient;
}

function createCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectPath: '/Users/test/project',
    workingDirectory: '/Users/test/project',
    readOnly: false,
    unityBridgeConnected: true,
    ...overrides,
  };
}

describe('PrefabCreateTool', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge({
      prefabPath: 'Assets/Prefabs/Player.prefab',
      gameObjectName: 'Player',
    });
  });

  it('should have correct metadata', () => {
    const tool = new PrefabCreateTool();
    expect(tool.name).toBe('unity_create_prefab');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create prefab from existing GameObject', async () => {
    const tool = new PrefabCreateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      {
        gameObjectName: 'Player',
        savePath: 'Assets/Prefabs',
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('prefab.create', {
      gameObjectName: 'Player',
      savePath: 'Assets/Prefabs',
    });
    expect(result.content).toContain('Player.prefab');
  });

  it('should support creating prefab from selection by instance ID', async () => {
    bridge = createMockBridge({ prefabPath: 'Assets/Prefabs/Enemy.prefab' });
    const tool = new PrefabCreateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { gameObjectId: 12345, savePath: 'Assets/Prefabs', prefabName: 'Enemy' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('prefab.create', {
      gameObjectId: 12345,
      savePath: 'Assets/Prefabs',
      prefabName: 'Enemy',
    });
  });

  it('should reject when bridge not connected', async () => {
    const tool = new PrefabCreateTool();
    const result = await tool.execute(
      { gameObjectName: 'Test', savePath: 'Assets/Prefabs' },
      createCtx({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const tool = new PrefabCreateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { gameObjectName: 'Test', savePath: 'Assets/Prefabs' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('PrefabInstantiateTool', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge({
      instanceId: 54321,
      name: 'Player(Clone)',
      position: { x: 0, y: 0, z: 0 },
    });
  });

  it('should have correct metadata', () => {
    const tool = new PrefabInstantiateTool();
    expect(tool.name).toBe('unity_instantiate_prefab');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should instantiate prefab at default position', async () => {
    const tool = new PrefabInstantiateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { prefabPath: 'Assets/Prefabs/Player.prefab' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('prefab.instantiate', {
      prefabPath: 'Assets/Prefabs/Player.prefab',
    });
    expect(result.content).toContain('Player(Clone)');
  });

  it('should instantiate at specified position, rotation, and parent', async () => {
    bridge = createMockBridge({
      instanceId: 54322,
      name: 'Enemy(Clone)',
      position: { x: 5, y: 0, z: 10 },
    });
    const tool = new PrefabInstantiateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      {
        prefabPath: 'Assets/Prefabs/Enemy.prefab',
        position: { x: 5, y: 0, z: 10 },
        rotation: { x: 0, y: 90, z: 0 },
        parentName: 'EnemyContainer',
        instanceName: 'Enemy_01',
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('prefab.instantiate', {
      prefabPath: 'Assets/Prefabs/Enemy.prefab',
      position: { x: 5, y: 0, z: 10 },
      rotation: { x: 0, y: 90, z: 0 },
      parentName: 'EnemyContainer',
      instanceName: 'Enemy_01',
    });
  });

  it('should validate prefab path ends with .prefab', async () => {
    const tool = new PrefabInstantiateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { prefabPath: 'Assets/Prefabs/Player.unity' },
      createCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.prefab');
  });
});
