import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayModeTool, GetPlayStateTool, ExecuteMenuTool } from './playmode-tools.js';
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

describe('PlayModeTool', () => {
  let tool: PlayModeTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new PlayModeTool();
    bridge = createMockBridge({ state: 'playing' });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_play');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should send play action', async () => {
    const result = await tool.execute({ action: 'play' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.playMode', { action: 'play' });
  });

  it('should send pause action', async () => {
    await tool.execute({ action: 'pause' }, createContext());
    expect(bridge.request).toHaveBeenCalledWith('editor.playMode', { action: 'pause' });
  });

  it('should send stop action', async () => {
    await tool.execute({ action: 'stop' }, createContext());
    expect(bridge.request).toHaveBeenCalledWith('editor.playMode', { action: 'stop' });
  });

  it('should send step action', async () => {
    await tool.execute({ action: 'step' }, createContext());
    expect(bridge.request).toHaveBeenCalledWith('editor.playMode', { action: 'step' });
  });

  it('should reject invalid action', async () => {
    const result = await tool.execute({ action: 'invalid' }, createContext());
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'play' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should format response with state', async () => {
    const result = await tool.execute({ action: 'play' }, createContext());
    expect(result.content).toContain('playing');
  });
});

describe('GetPlayStateTool', () => {
  let tool: GetPlayStateTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new GetPlayStateTool();
    bridge = createMockBridge({ state: 'stopped', isPaused: false });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_get_play_state');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get play state via bridge', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.getPlayState', {});
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute({}, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });

  it('should format response with state info', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.content).toContain('stopped');
  });
});

describe('ExecuteMenuTool', () => {
  let tool: ExecuteMenuTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ExecuteMenuTool();
    bridge = createMockBridge({ executed: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_execute_menu');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(true);
  });

  it('should execute menu via bridge', async () => {
    const result = await tool.execute(
      { menuPath: 'GameObject/Create Empty' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.executeMenu', {
      menuPath: 'GameObject/Create Empty',
    });
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { menuPath: 'File/Save' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should validate required menuPath', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBe(true);
  });

  it('should format response on success', async () => {
    const result = await tool.execute(
      { menuPath: 'GameObject/Create Empty' },
      createContext(),
    );
    expect(result.content).toContain('Menu command executed successfully');
  });
});
