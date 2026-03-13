import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptableObjectCreateTool } from './scriptableobject-create.js';
import { TextureInfoTool } from './texture-info.js';
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

// ---------------------------------------------------------------------------
// ScriptableObjectCreateTool
// ---------------------------------------------------------------------------

describe('ScriptableObjectCreateTool', () => {
  let tool: ScriptableObjectCreateTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ScriptableObjectCreateTool();
    bridge = createMockBridge({
      path: 'Assets/Data/EnemyConfig.asset',
      typeName: 'EnemyConfig',
      created: true,
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_scriptableobject_create');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should create a ScriptableObject instance', async () => {
    const input = {
      typeName: 'EnemyConfig',
      savePath: 'Assets/Data/EnemyConfig.asset',
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scriptableObject.create', input);
    expect(result.content).toContain('EnemyConfig');
  });

  it('should pass initial field values', async () => {
    const input = {
      typeName: 'EnemyConfig',
      savePath: 'Assets/Data/EnemyConfig.asset',
      fields: { health: 100, speed: 5.5, name: 'Goblin' },
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('scriptableObject.create', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { typeName: 'EnemyConfig', savePath: 'Assets/Data/EnemyConfig.asset' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should require typeName', async () => {
    const result = await tool.execute(
      { savePath: 'Assets/Data/EnemyConfig.asset' },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });

  it('should require savePath', async () => {
    const result = await tool.execute({ typeName: 'EnemyConfig' }, createContext());
    expect(result.isError).toBe(true);
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { typeName: 'EnemyConfig', savePath: 'Assets/Data/EnemyConfig.asset' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TextureInfoTool
// ---------------------------------------------------------------------------

describe('TextureInfoTool', () => {
  let tool: TextureInfoTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new TextureInfoTool();
    bridge = createMockBridge({
      path: 'Assets/Textures/wood.png',
      width: 2048,
      height: 2048,
      format: 'RGBA32',
      mipmapCount: 12,
      compression: 'DXT5',
      sizeBytes: 4194304,
      isReadable: true,
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_texture_info');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get texture info by asset path', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Textures/wood.png' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('texture.info', {
      assetPath: 'Assets/Textures/wood.png',
    });
    expect(result.content).toContain('2048');
    expect(result.content).toContain('DXT5');
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Textures/wood.png' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should require assetPath', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBe(true);
  });

  it('should handle bridge errors gracefully', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Asset not found'),
    );
    const result = await tool.execute(
      { assetPath: 'Assets/Textures/missing.png' },
      createContext(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Asset not found');
  });
});
