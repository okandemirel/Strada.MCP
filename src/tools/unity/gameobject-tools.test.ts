import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateGameObjectTool,
  FindGameObjectsTool,
  ModifyGameObjectTool,
  DeleteGameObjectTool,
  DuplicateGameObjectTool,
} from './gameobject-tools.js';
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

function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    projectPath: '/project',
    workingDirectory: '/project',
    readOnly: false,
    unityBridgeConnected: true,
    ...overrides,
  };
}

describe('CreateGameObjectTool', () => {
  let tool: CreateGameObjectTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new CreateGameObjectTool();
    bridge = createMockBridge({ instanceId: 12345, name: 'Cube' });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_create_gameobject');
    expect(tool.metadata.category).toBe('unity-runtime');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should create a basic empty gameobject', async () => {
    const result = await tool.execute({ name: 'MyObject', type: 'empty' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', {
      name: 'MyObject',
      type: 'empty',
    });
  });

  it('should create a primitive with transform', async () => {
    const input = {
      name: 'MyCube',
      type: 'Cube',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', input);
  });

  it('should create from prefab', async () => {
    const input = {
      name: 'Enemy',
      type: 'prefab',
      prefabPath: 'Assets/Prefabs/Enemy.prefab',
    };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', input);
  });

  it('should include parent in params', async () => {
    const input = { name: 'Child', type: 'empty', parent: 99 };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('gameobject.create', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { name: 'Test', type: 'empty' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject invalid type', async () => {
    const result = await tool.execute(
      { name: 'Test', type: 'invalid_type' },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });

  it('should format response with instance id', async () => {
    const result = await tool.execute({ name: 'Cube', type: 'Cube' }, createContext());
    expect(result.content).toContain('12345');
    expect(result.content).toContain('Cube');
  });
});

describe('FindGameObjectsTool', () => {
  let tool: FindGameObjectsTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new FindGameObjectsTool();
    bridge = createMockBridge({
      objects: [
        { instanceId: 1, name: 'Player', tag: 'Player' },
        { instanceId: 2, name: 'Enemy', tag: 'Enemy' },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_find_gameobjects');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should find by name', async () => {
    const result = await tool.execute({ query: 'Player' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.find', { query: 'Player' });
  });

  it('should pass optional params', async () => {
    await tool.execute({ query: 'Enemy', recursive: true, limit: 10 }, createContext());
    expect(bridge.request).toHaveBeenCalledWith('gameobject.find', {
      query: 'Enemy',
      recursive: true,
      limit: 10,
    });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { query: 'Player' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should format response listing found objects', async () => {
    const result = await tool.execute({ query: 'Player' }, createContext());
    expect(result.content).toContain('Player');
    expect(result.content).toContain('2'); // count
  });
});

describe('ModifyGameObjectTool', () => {
  let tool: ModifyGameObjectTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ModifyGameObjectTool();
    bridge = createMockBridge({ instanceId: 100, name: 'Renamed' });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_modify_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should modify name and active state', async () => {
    const input = { instanceId: 100, name: 'NewName', active: false };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.modify', input);
  });

  it('should modify tag and layer', async () => {
    const input = { instanceId: 100, tag: 'Player', layer: 8 };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('gameobject.modify', input);
  });

  it('should modify static flag', async () => {
    const input = { instanceId: 100, static: true };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('gameobject.modify', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 100, name: 'X' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should require instanceId', async () => {
    const result = await tool.execute({ name: 'X' }, createContext());
    expect(result.isError).toBe(true);
  });
});

describe('DeleteGameObjectTool', () => {
  let tool: DeleteGameObjectTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new DeleteGameObjectTool();
    bridge = createMockBridge({ deleted: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_delete_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(true);
  });

  it('should delete by instance id', async () => {
    const result = await tool.execute({ instanceId: 42 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.delete', { instanceId: 42 });
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 42 },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('DuplicateGameObjectTool', () => {
  let tool: DuplicateGameObjectTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new DuplicateGameObjectTool();
    bridge = createMockBridge({ instanceId: 200, name: 'Copy' });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_duplicate_gameobject');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should duplicate with defaults', async () => {
    const result = await tool.execute({ instanceId: 100 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('gameobject.duplicate', { instanceId: 100 });
  });

  it('should pass optional newName, parent, offset', async () => {
    const input = {
      instanceId: 100,
      newName: 'CopyOfThing',
      parent: 50,
      offset: { x: 1, y: 0, z: 0 },
    };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('gameobject.duplicate', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 100 },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});
