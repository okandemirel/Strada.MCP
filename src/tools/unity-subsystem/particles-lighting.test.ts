import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParticlesControlTool } from './particles-control.js';
import { LightingBakeTool } from './lighting-bake.js';
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
// ParticlesControlTool
// ---------------------------------------------------------------------------

describe('ParticlesControlTool', () => {
  let tool: ParticlesControlTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ParticlesControlTool();
    bridge = createMockBridge({ playing: true, particleCount: 150 });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_particles_control');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should play a particle system', async () => {
    const input = { instanceId: 42, action: 'play' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('particles.control', input);
    expect(result.content).toContain('play');
  });

  it('should stop a particle system', async () => {
    const input = { instanceId: 42, action: 'stop' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('particles.control', input);
  });

  it('should restart a particle system', async () => {
    const input = { instanceId: 42, action: 'restart' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('particles.control', input);
  });

  it('should accept withChildren option', async () => {
    const input = { instanceId: 42, action: 'play', withChildren: true };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('particles.control', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 42, action: 'play' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject invalid action', async () => {
    const result = await tool.execute(
      { instanceId: 42, action: 'explode' },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });

  it('should require instanceId', async () => {
    const result = await tool.execute({ action: 'play' }, createContext());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LightingBakeTool
// ---------------------------------------------------------------------------

describe('LightingBakeTool', () => {
  let tool: LightingBakeTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new LightingBakeTool();
    bridge = createMockBridge({
      baked: true,
      lightmapCount: 4,
      totalSizeBytes: 16777216,
      duration: 12.5,
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_lighting_bake');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should bake lightmaps with defaults', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('lighting.bake', {});
    expect(result.content).toContain('4');
  });

  it('should accept quality settings', async () => {
    const input = {
      quality: 'high',
      directSamples: 32,
      indirectSamples: 128,
      bounces: 3,
    };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('lighting.bake', input);
  });

  it('should accept lightmap resolution', async () => {
    const input = { resolution: 40 };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('lighting.bake', input);
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

  it('should handle bridge errors gracefully', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Bake failed: out of memory'),
    );
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBe(true);
    expect(result.content).toContain('out of memory');
  });
});
