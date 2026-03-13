import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SetTransformTool,
  GetTransformTool,
  SetParentTool,
} from './transform-tools.js';
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

describe('SetTransformTool', () => {
  let tool: SetTransformTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new SetTransformTool();
    bridge = createMockBridge({ applied: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_set_transform');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should set position', async () => {
    const input = { instanceId: 1, position: { x: 1, y: 2, z: 3 } };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('transform.set', input);
  });

  it('should set rotation and scale', async () => {
    const input = {
      instanceId: 1,
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('transform.set', input);
  });

  it('should pass space parameter', async () => {
    const input = {
      instanceId: 1,
      position: { x: 0, y: 5, z: 0 },
      space: 'world',
    };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('transform.set', input);
  });

  it('should reject invalid space value', async () => {
    const input = {
      instanceId: 1,
      position: { x: 0, y: 0, z: 0 },
      space: 'invalid',
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 1, position: { x: 0, y: 0, z: 0 } },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should require instanceId', async () => {
    const result = await tool.execute(
      { position: { x: 0, y: 0, z: 0 } },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });
});

describe('GetTransformTool', () => {
  let tool: GetTransformTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new GetTransformTool();
    bridge = createMockBridge({
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      localPosition: { x: 1, y: 2, z: 3 },
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_get_transform');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get transform via bridge', async () => {
    const result = await tool.execute({ instanceId: 1 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('transform.get', { instanceId: 1 });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 1 },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should format response with transform values', async () => {
    const result = await tool.execute({ instanceId: 1 }, createContext());
    expect(result.content).toContain('position');
    expect(result.content).toContain('rotation');
    expect(result.content).toContain('scale');
  });
});

describe('SetParentTool', () => {
  let tool: SetParentTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new SetParentTool();
    bridge = createMockBridge({ success: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_set_parent');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should set parent via bridge', async () => {
    const input = { instanceId: 1, parentId: 2 };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('transform.setParent', input);
  });

  it('should allow null parentId to unparent', async () => {
    const input = { instanceId: 1, parentId: null };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('transform.setParent', input);
  });

  it('should pass worldPositionStays', async () => {
    const input = { instanceId: 1, parentId: 2, worldPositionStays: false };
    await tool.execute(input, createContext());
    expect(bridge.request).toHaveBeenCalledWith('transform.setParent', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 1, parentId: 2 },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});
