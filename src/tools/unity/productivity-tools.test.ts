import { describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import {
  AddressablesManageTool,
  CameraManageTool,
  GraphicsManageTool,
  ImportSettingsManageTool,
  InputSimulateTool,
  UiActionTool,
  UiQueryTool,
} from './productivity-tools.js';

function createMockBridge(
  handler: (method: string, params?: Record<string, unknown>) => unknown | Promise<unknown>,
): BridgeClient {
  return {
    request: vi.fn(handler),
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

describe('UiQueryTool', () => {
  it('queries editor.uiQuery', async () => {
    const bridge = createMockBridge(async () => ({ count: 1, elements: [{ name: 'Canvas' }] }));
    const tool = new UiQueryTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.uiQuery', {
      includeInactive: true,
      includeToolkit: true,
      includeComponents: true,
      maxDepth: 8,
    });
  });
});

describe('UiActionTool', () => {
  it('blocks write actions in read-only mode', async () => {
    const bridge = createMockBridge(async () => ({ performed: true }));
    const tool = new UiActionTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: '/Canvas/Button',
      action: 'click',
    }, createContext({ readOnly: true }));

    expect(result.isError).toBe(true);
  });
});

describe('InputSimulateTool', () => {
  it('maps input simulation to editor.inputSimulate', async () => {
    const bridge = createMockBridge(async () => ({ simulatedInput: 'mouseClick' }));
    const tool = new InputSimulateTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      target: '/Canvas/Button',
      action: 'mouseClick',
    }, createContext());

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.inputSimulate', {
      target: '/Canvas/Button',
      system: 'auto',
      action: 'mouseClick',
    });
  });
});

describe('CameraManageTool', () => {
  it('allows read actions in read-only mode', async () => {
    const bridge = createMockBridge(async () => ({ cameras: [] }));
    const tool = new CameraManageTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'list' }, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });
});

describe('GraphicsManageTool', () => {
  it('uses unity-config category', () => {
    const tool = new GraphicsManageTool();
    expect(tool.metadata.category).toBe('unity-config');
  });
});

describe('AddressablesManageTool', () => {
  it('treats list actions as read-only', async () => {
    const bridge = createMockBridge(async () => ({ available: true, groups: [] }));
    const tool = new AddressablesManageTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ action: 'listGroups' }, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });
});

describe('ImportSettingsManageTool', () => {
  it('serializes get requests', async () => {
    const bridge = createMockBridge(async () => ({ kind: 'texture' }));
    const tool = new ImportSettingsManageTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({
      action: 'get',
      assetPath: 'Assets/Texture.png',
    }, createContext());

    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.importSettingsManage', {
      action: 'get',
      assetPath: 'Assets/Texture.png',
    });
  });
});
