import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnimationPlayTool } from './animation-play.js';
import { AnimationListTool } from './animation-list.js';
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
// AnimationPlayTool
// ---------------------------------------------------------------------------

describe('AnimationPlayTool', () => {
  let tool: AnimationPlayTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new AnimationPlayTool();
    bridge = createMockBridge({ playing: true, clipName: 'Run', state: 'playing' });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_animation_play');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should play an animation clip', async () => {
    const input = { instanceId: 42, action: 'play', clipName: 'Run' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('animation.control', input);
    expect(result.content).toContain('Run');
  });

  it('should stop an animation', async () => {
    const input = { instanceId: 42, action: 'stop' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('animation.control', input);
  });

  it('should pause an animation', async () => {
    const input = { instanceId: 42, action: 'pause' };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('animation.control', input);
  });

  it('should accept crossFadeDuration', async () => {
    const input = { instanceId: 42, action: 'play', clipName: 'Walk', crossFadeDuration: 0.3 };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('animation.control', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 42, action: 'play', clipName: 'Run' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should require instanceId', async () => {
    const result = await tool.execute({ action: 'play', clipName: 'Run' }, createContext());
    expect(result.isError).toBe(true);
  });

  it('should reject invalid action', async () => {
    const result = await tool.execute(
      { instanceId: 42, action: 'rewind' },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AnimationListTool
// ---------------------------------------------------------------------------

describe('AnimationListTool', () => {
  let tool: AnimationListTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new AnimationListTool();
    bridge = createMockBridge({
      clips: [
        { name: 'Idle', length: 2.5, looping: true },
        { name: 'Run', length: 1.2, looping: true },
        { name: 'Jump', length: 0.8, looping: false },
      ],
      parameters: [
        { name: 'Speed', type: 'Float', value: 0 },
        { name: 'IsGrounded', type: 'Bool', value: true },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_animation_list');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should list animation clips and parameters', async () => {
    const result = await tool.execute({ instanceId: 42 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('animation.list', { instanceId: 42 });
    expect(result.content).toContain('3');
    expect(result.content).toContain('Idle');
    expect(result.content).toContain('Speed');
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute(
      { instanceId: 42 },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });

  it('should require instanceId', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBe(true);
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { instanceId: 42 },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});
