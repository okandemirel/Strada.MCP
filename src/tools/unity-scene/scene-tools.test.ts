import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneCreateTool } from './scene-create.js';
import { SceneOpenTool } from './scene-open.js';
import { SceneSaveTool } from './scene-save.js';
import { SceneInfoTool } from './scene-info.js';
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

describe('SceneCreateTool', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge({ scenePath: 'Assets/Scenes/NewScene.unity' });
  });

  it('should have correct metadata', () => {
    const tool = new SceneCreateTool();
    expect(tool.name).toBe('unity_create_scene');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should send create scene command via bridge', async () => {
    const tool = new SceneCreateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { name: 'NewScene', path: 'Assets/Scenes', template: 'default' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scene.create', {
      name: 'NewScene',
      path: 'Assets/Scenes',
      template: 'default',
    });
    expect(result.content).toContain('NewScene');
  });

  it('should reject when bridge not connected', async () => {
    const tool = new SceneCreateTool();
    const result = await tool.execute(
      { name: 'Test' },
      createCtx({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should reject in read-only mode', async () => {
    const tool = new SceneCreateTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({ name: 'Test' }, createCtx({ readOnly: true }));
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });
});

describe('SceneOpenTool', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge({ loaded: true });
  });

  it('should have correct metadata', () => {
    const tool = new SceneOpenTool();
    expect(tool.name).toBe('unity_open_scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should open scene in single mode', async () => {
    const tool = new SceneOpenTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { path: 'Assets/Scenes/Main.unity', additive: false },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scene.open', {
      path: 'Assets/Scenes/Main.unity',
      additive: false,
    });
  });

  it('should support additive scene loading', async () => {
    const tool = new SceneOpenTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { path: 'Assets/Scenes/UI.unity', additive: true },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scene.open', {
      path: 'Assets/Scenes/UI.unity',
      additive: true,
    });
  });

  it('should validate scene path ends with .unity', async () => {
    const tool = new SceneOpenTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({ path: 'Assets/Scenes/Main.txt' }, createCtx());
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.unity');
  });
});

describe('SceneSaveTool', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge({ saved: true });
  });

  it('should have correct metadata', () => {
    const tool = new SceneSaveTool();
    expect(tool.name).toBe('unity_save_scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should save active scene', async () => {
    const tool = new SceneSaveTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({}, createCtx());

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scene.save', {});
  });

  it('should save scene to specific path (Save As)', async () => {
    const tool = new SceneSaveTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute(
      { path: 'Assets/Scenes/Copy.unity' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scene.save', {
      path: 'Assets/Scenes/Copy.unity',
    });
  });
});

describe('SceneInfoTool', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge({
      name: 'MainScene',
      path: 'Assets/Scenes/MainScene.unity',
      isDirty: false,
      rootCount: 3,
      gameObjectCount: 42,
      hierarchy: [
        { name: 'Main Camera', id: 100, children: [] },
        { name: 'Directional Light', id: 200, children: [] },
        {
          name: 'Canvas',
          id: 300,
          children: [{ name: 'Panel', id: 301, children: [] }],
        },
      ],
    });
  });

  it('should have correct metadata', () => {
    const tool = new SceneInfoTool();
    expect(tool.name).toBe('unity_get_scene_info');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should return scene metadata and hierarchy', async () => {
    const tool = new SceneInfoTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({}, createCtx());

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('MainScene');
    expect(result.content).toContain('42');
  });

  it('should accept optional scene index', async () => {
    bridge = createMockBridge({
      name: 'AdditiveScene',
      path: 'Assets/Scenes/UI.unity',
      rootCount: 1,
      gameObjectCount: 5,
      hierarchy: [],
    });
    const tool = new SceneInfoTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({ sceneIndex: 1 }, createCtx());

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scene.info', { sceneIndex: 1 });
  });
});
