import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerSettingsTool } from './player-settings.js';
import { QualitySettingsTool } from './quality-settings.js';
import { BuildSettingsTool } from './build-settings.js';
import { ProjectSettingsTool } from './project-settings.js';
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
// PlayerSettingsTool
// ---------------------------------------------------------------------------

describe('PlayerSettingsTool', () => {
  let tool: PlayerSettingsTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new PlayerSettingsTool();
    bridge = createMockBridge({
      companyName: 'Strada',
      productName: 'MyGame',
      bundleIdentifier: 'com.strada.mygame',
      scriptingBackend: 'IL2CPP',
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_player_settings');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.requiresBridge).toBe(true);
  });

  it('should get player settings', async () => {
    const result = await tool.execute({ action: 'get' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.playerSettings', { action: 'get' });
    expect(result.content).toContain('Strada');
    expect(result.content).toContain('MyGame');
    expect(result.content).toContain('IL2CPP');
  });

  it('should set player settings', async () => {
    const input = { action: 'set', settings: { companyName: 'NewCo' } };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.playerSettings', input);
  });

  it('should reject in read-only mode for set action', async () => {
    const result = await tool.execute(
      { action: 'set', settings: { companyName: 'X' } },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'get' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });

  it('should reject invalid action', async () => {
    const result = await tool.execute({ action: 'delete' }, createContext());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QualitySettingsTool
// ---------------------------------------------------------------------------

describe('QualitySettingsTool', () => {
  let tool: QualitySettingsTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new QualitySettingsTool();
    bridge = createMockBridge({
      currentLevel: 'Ultra',
      levels: [
        { name: 'Low', shadowDistance: 20 },
        { name: 'Medium', shadowDistance: 70 },
        { name: 'Ultra', shadowDistance: 150, antiAliasing: 4 },
      ],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_quality_settings');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get quality settings', async () => {
    const result = await tool.execute({ action: 'get' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.qualitySettings', { action: 'get' });
    expect(result.content).toContain('Ultra');
    expect(result.content).toContain('3');
  });

  it('should set quality settings for a level', async () => {
    const input = { action: 'set', level: 'Ultra', settings: { shadowDistance: 200 } };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.qualitySettings', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'set', level: 'Low', settings: { shadowDistance: 10 } },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'get' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BuildSettingsTool
// ---------------------------------------------------------------------------

describe('BuildSettingsTool', () => {
  let tool: BuildSettingsTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new BuildSettingsTool();
    bridge = createMockBridge({
      activeBuildTarget: 'StandaloneWindows64',
      scenes: [
        { path: 'Assets/Scenes/Main.unity', enabled: true },
        { path: 'Assets/Scenes/Menu.unity', enabled: true },
        { path: 'Assets/Scenes/Test.unity', enabled: false },
      ],
      buildOptions: ['Development', 'AllowDebugging'],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_build_settings');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get build settings', async () => {
    const result = await tool.execute({ action: 'get' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.buildSettings', { action: 'get' });
    expect(result.content).toContain('StandaloneWindows64');
    expect(result.content).toContain('Main.unity');
    expect(result.content).toContain('[disabled]');
  });

  it('should set build settings', async () => {
    const input = { action: 'set', settings: { activeBuildTarget: 'Android' } };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.buildSettings', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'set', settings: { activeBuildTarget: 'iOS' } },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'get' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProjectSettingsTool
// ---------------------------------------------------------------------------

describe('ProjectSettingsTool', () => {
  let tool: ProjectSettingsTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ProjectSettingsTool();
    bridge = createMockBridge({
      category: 'physics',
      gravity: { x: 0, y: -9.81, z: 0 },
      defaultSolverIterations: 6,
      defaultSolverVelocityIterations: 1,
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_project_settings');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get physics settings', async () => {
    const result = await tool.execute(
      { action: 'get', category: 'physics' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.settings', {
      action: 'get',
      category: 'physics',
    });
    expect(result.content).toContain('physics');
    expect(result.content).toContain('-9.81');
  });

  it('should get tags', async () => {
    (bridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      category: 'tags',
      tags: ['Untagged', 'Player', 'Enemy'],
    });
    const result = await tool.execute(
      { action: 'get', category: 'tags' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Player');
    expect(result.content).toContain('Enemy');
  });

  it('should set time settings', async () => {
    const input = { action: 'set', category: 'time', settings: { fixedDeltaTime: 0.01 } };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.settings', input);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'set', category: 'physics', settings: { gravity: { y: -20 } } },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should reject invalid category', async () => {
    const result = await tool.execute(
      { action: 'get', category: 'invalid' },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });

  it('should fail when bridge is not connected', async () => {
    const result = await tool.execute(
      { action: 'get', category: 'physics' },
      createContext({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});
