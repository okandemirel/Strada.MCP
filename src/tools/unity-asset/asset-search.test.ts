import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetFindTool } from './asset-find.js';
import { AssetDependenciesTool } from './asset-dependencies.js';
import { AssetUnusedTool } from './asset-unused.js';
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
// AssetFindTool
// ---------------------------------------------------------------------------

describe('AssetFindTool', () => {
  let tool: AssetFindTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new AssetFindTool();
    bridge = createMockBridge({
      assets: [
        { path: 'Assets/Textures/wood.png', type: 'Texture2D', guid: 'abc123' },
        { path: 'Assets/Textures/stone.png', type: 'Texture2D', guid: 'def456' },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_find_assets');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.requiresBridge).toBe(true);
  });

  it('should have a valid input schema', () => {
    const schema = tool.inputSchema;
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
  });

  it('should search by type', async () => {
    const result = await tool.execute({ type: 'Texture2D' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.find', { type: 'Texture2D' });
    expect(result.content).toContain('2');
    expect(result.content).toContain('wood.png');
  });

  it('should search by name pattern', async () => {
    const result = await tool.execute({ namePattern: '*.png' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.find', { namePattern: '*.png' });
  });

  it('should search by label', async () => {
    const result = await tool.execute({ labels: ['environment'] }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.find', { labels: ['environment'] });
  });

  it('should combine search criteria', async () => {
    const input = { type: 'Texture2D', namePattern: 'wood*', folder: 'Assets/Textures' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.find', input);
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute({ type: 'Texture2D' }, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { type: 'Texture2D' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should handle bridge errors gracefully', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));
    const result = await tool.execute({ type: 'Texture2D' }, createContext());
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Timeout');
  });
});

// ---------------------------------------------------------------------------
// AssetDependenciesTool
// ---------------------------------------------------------------------------

describe('AssetDependenciesTool', () => {
  let tool: AssetDependenciesTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new AssetDependenciesTool();
    bridge = createMockBridge({
      assetPath: 'Assets/Materials/Wood.mat',
      dependencies: [
        { path: 'Assets/Textures/wood.png', type: 'Texture2D' },
        { path: 'Assets/Shaders/Standard.shader', type: 'Shader' },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_asset_dependencies');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get dependencies for an asset path', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.dependencies', {
      assetPath: 'Assets/Materials/Wood.mat',
      recursive: false,
    });
    expect(result.content).toContain('2');
    expect(result.content).toContain('wood.png');
  });

  it('should support recursive dependency search', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat', recursive: true },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.dependencies', {
      assetPath: 'Assets/Materials/Wood.mat',
      recursive: true,
    });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should require assetPath', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AssetUnusedTool
// ---------------------------------------------------------------------------

describe('AssetUnusedTool', () => {
  let tool: AssetUnusedTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new AssetUnusedTool();
    bridge = createMockBridge({
      unusedAssets: [
        { path: 'Assets/Textures/old_grass.png', type: 'Texture2D', sizeBytes: 524288 },
        { path: 'Assets/Models/unused_box.fbx', type: 'Model', sizeBytes: 1048576 },
      ],
      totalSizeBytes: 1572864,
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_find_unused_assets');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should find unused assets', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.findUnused', {});
    expect(result.content).toContain('2');
    expect(result.content).toContain('old_grass.png');
  });

  it('should filter by type', async () => {
    const result = await tool.execute({ type: 'Texture2D' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.findUnused', { type: 'Texture2D' });
  });

  it('should filter by folder', async () => {
    const result = await tool.execute({ folder: 'Assets/Textures' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('asset.findUnused', { folder: 'Assets/Textures' });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute({}, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });
});
