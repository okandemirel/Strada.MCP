import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhysicsRaycastTool } from './physics-raycast.js';
import { NavMeshBakeTool } from './navmesh-bake.js';
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
// PhysicsRaycastTool
// ---------------------------------------------------------------------------

describe('PhysicsRaycastTool', () => {
  let tool: PhysicsRaycastTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new PhysicsRaycastTool();
    bridge = createMockBridge({
      hits: [
        {
          instanceId: 10,
          name: 'Ground',
          point: { x: 0, y: 0, z: 5 },
          normal: { x: 0, y: 1, z: 0 },
          distance: 5.0,
        },
        {
          instanceId: 20,
          name: 'Wall',
          point: { x: 0, y: 1, z: 10 },
          normal: { x: 0, y: 0, z: -1 },
          distance: 10.0,
        },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_physics_raycast');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should cast a ray and return hits', async () => {
    const input = {
      origin: { x: 0, y: 10, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('physics.raycast', {
      origin: { x: 0, y: 10, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    });
    expect(result.content).toContain('2');
    expect(result.content).toContain('Ground');
  });

  it('should accept maxDistance', async () => {
    const input = {
      origin: { x: 0, y: 10, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      maxDistance: 100,
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('physics.raycast', input);
  });

  it('should accept layerMask', async () => {
    const input = {
      origin: { x: 0, y: 10, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      layerMask: 256,
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('physics.raycast', input);
  });

  it('should work in read-only mode', async () => {
    const input = {
      origin: { x: 0, y: 10, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    };
    const result = await tool.execute(input, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });

  it('should require origin and direction', async () => {
    const result = await tool.execute({ origin: { x: 0, y: 0, z: 0 } }, createContext());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NavMeshBakeTool
// ---------------------------------------------------------------------------

describe('NavMeshBakeTool', () => {
  let tool: NavMeshBakeTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new NavMeshBakeTool();
    bridge = createMockBridge({
      baked: true,
      vertexCount: 15000,
      triangleCount: 28000,
      area: 450.5,
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_navmesh_bake');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should bake navmesh with defaults', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('navmesh.bake', {});
    expect(result.content).toContain('15000');
  });

  it('should accept agent settings', async () => {
    const input = {
      agentRadius: 0.5,
      agentHeight: 2.0,
      maxSlope: 45,
      stepHeight: 0.4,
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('navmesh.bake', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute({}, createContext({ readOnly: true }));
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      {},
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});
