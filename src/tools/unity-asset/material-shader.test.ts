import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialGetTool } from './material-get.js';
import { MaterialSetTool } from './material-set.js';
import { ShaderListTool } from './shader-list.js';
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
// MaterialGetTool
// ---------------------------------------------------------------------------

describe('MaterialGetTool', () => {
  let tool: MaterialGetTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new MaterialGetTool();
    bridge = createMockBridge({
      name: 'Wood',
      shader: 'Standard',
      properties: [
        { name: '_Color', type: 'Color', value: { r: 1, g: 0.8, b: 0.5, a: 1 } },
        { name: '_MainTex', type: 'Texture', value: 'Assets/Textures/wood.png' },
        { name: '_Glossiness', type: 'Float', value: 0.5 },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_material_get');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get material by asset path', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('material.get', {
      assetPath: 'Assets/Materials/Wood.mat',
    });
    expect(result.content).toContain('Wood');
    expect(result.content).toContain('Standard');
  });

  it('should get material by instance id', async () => {
    const result = await tool.execute({ instanceId: 42 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('material.get', { instanceId: 42 });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MaterialSetTool
// ---------------------------------------------------------------------------

describe('MaterialSetTool', () => {
  let tool: MaterialSetTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new MaterialSetTool();
    bridge = createMockBridge({ updated: true, propertyCount: 2 });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_material_set');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should set material properties by asset path', async () => {
    const input = {
      assetPath: 'Assets/Materials/Wood.mat',
      properties: { _Color: { r: 1, g: 0, b: 0, a: 1 }, _Glossiness: 0.8 },
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('material.set', input);
  });

  it('should set material shader', async () => {
    const input = {
      assetPath: 'Assets/Materials/Wood.mat',
      shader: 'Universal Render Pipeline/Lit',
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('material.set', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { assetPath: 'Assets/Materials/Wood.mat', properties: { _Glossiness: 0.5 } },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should require assetPath', async () => {
    const result = await tool.execute(
      { properties: { _Glossiness: 0.5 } },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ShaderListTool
// ---------------------------------------------------------------------------

describe('ShaderListTool', () => {
  let tool: ShaderListTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ShaderListTool();
    bridge = createMockBridge({
      shaders: [
        { name: 'Standard', passCount: 2 },
        { name: 'Universal Render Pipeline/Lit', passCount: 4 },
        { name: 'Unlit/Color', passCount: 1 },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_shader_list');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should list all shaders', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('shader.list', {});
    expect(result.content).toContain('3');
    expect(result.content).toContain('Standard');
  });

  it('should filter by name pattern', async () => {
    const result = await tool.execute({ namePattern: 'URP*' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('shader.list', { namePattern: 'URP*' });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute({}, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });
});
