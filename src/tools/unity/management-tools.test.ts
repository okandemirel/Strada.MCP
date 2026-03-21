import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import { BuildPipelineTool, EditorPreferencesTool, PackageManageTool } from './management-tools.js';

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

describe('BuildPipelineTool', () => {
  let tool: BuildPipelineTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new BuildPipelineTool();
    bridge = createMockBridge({
      success: true,
      target: 'Android',
      outputPath: 'Builds/Android',
      summary: { result: 'Succeeded', totalErrors: 0, totalWarnings: 1 },
    });
    tool.setBridgeClient(bridge);
  });

  it('should execute a build through the bridge', async () => {
    const input = { target: 'Android', outputPath: 'Builds/Android', development: true };
    const result = await tool.execute(input, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.buildPlayer', {
      target: 'Android',
      outputPath: 'Builds/Android',
      development: true,
      clean: false,
      preflight: true,
      options: [],
    });
    expect(result.content).toContain('completed');
  });
});

describe('PackageManageTool', () => {
  let tool: PackageManageTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new PackageManageTool();
    bridge = createMockBridge({
      action: 'list',
      packages: [{ name: 'com.unity.textmeshpro', version: '3.0.0' }],
      success: true,
    });
    tool.setBridgeClient(bridge);
  });

  it('should list packages in read-only mode', async () => {
    const result = await tool.execute({ action: 'list' }, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.packageManager', {
      action: 'list',
      source: 'registry',
    });
    expect(result.content).toContain('Packages: 1');
  });

  it('should reject writes in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'add', source: 'registry', packageId: 'com.unity.nuget.newtonsoft-json' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('EditorPreferencesTool', () => {
  let tool: EditorPreferencesTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new EditorPreferencesTool();
    bridge = createMockBridge({
      values: { 'strada.port': 7691, 'strada.autoStart': true },
    });
    tool.setBridgeClient(bridge);
  });

  it('should read editor preferences', async () => {
    const result = await tool.execute({ action: 'get', keys: ['strada.port'] }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('project.editorPreferences', {
      action: 'get',
      keys: ['strada.port'],
    });
    expect(result.content).toContain('strada.port');
  });
});
