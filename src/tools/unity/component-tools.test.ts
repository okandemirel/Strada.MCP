import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AddComponentTool,
  RemoveComponentTool,
  GetComponentsTool,
} from './component-tools.js';
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

describe('AddComponentTool', () => {
  let tool: AddComponentTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new AddComponentTool();
    bridge = createMockBridge({ componentType: 'Rigidbody', added: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_add_component');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.requiresBridge).toBe(true);
  });

  it('should add component via bridge', async () => {
    const result = await tool.execute(
      { instanceId: 10, componentType: 'Rigidbody' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('component.add', {
      instanceId: 10,
      componentType: 'Rigidbody',
    });
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 10, componentType: 'Rigidbody' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should validate required fields', async () => {
    const result = await tool.execute({ instanceId: 10 }, createContext());
    expect(result.isError).toBe(true);
  });

  it('should format response', async () => {
    const result = await tool.execute(
      { instanceId: 10, componentType: 'Rigidbody' },
      createContext(),
    );
    expect(result.content).toContain('Rigidbody');
  });
});

describe('RemoveComponentTool', () => {
  let tool: RemoveComponentTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new RemoveComponentTool();
    bridge = createMockBridge({ removed: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_remove_component');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(true);
  });

  it('should remove component via bridge', async () => {
    const result = await tool.execute(
      { instanceId: 10, componentType: 'Rigidbody' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('component.remove', {
      instanceId: 10,
      componentType: 'Rigidbody',
    });
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 10, componentType: 'Rigidbody' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('GetComponentsTool', () => {
  let tool: GetComponentsTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new GetComponentsTool();
    bridge = createMockBridge({
      components: [
        { type: 'Transform', properties: {} },
        { type: 'MeshRenderer', properties: {} },
        { type: 'BoxCollider', properties: {} },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_get_components');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get components via bridge', async () => {
    const result = await tool.execute({ instanceId: 10 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('component.list', { instanceId: 10 });
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 10 },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should format response listing components', async () => {
    const result = await tool.execute({ instanceId: 10 }, createContext());
    expect(result.content).toContain('3');
    expect(result.content).toContain('Transform');
    expect(result.content).toContain('MeshRenderer');
    expect(result.content).toContain('BoxCollider');
  });
});
