import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import {
  StradaContainerGraphTool,
  StradaHotReloadControlTool,
  StradaLogModulesTool,
  StradaModuleGraphTool,
  StradaSystemProfileTool,
  StradaValidateArchitectureLiveTool,
} from './live-tools.js';

function createMockBridge(response: unknown = { available: true, authority: 'authoritative' }): BridgeClient {
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

describe('Strada live tools', () => {
  let bridge: BridgeClient;

  beforeEach(() => {
    bridge = createMockBridge();
  });

  it('should read live module graph', async () => {
    const tool = new StradaModuleGraphTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('strada.moduleGraph', {});
  });

  it('should read live container graph', async () => {
    const tool = new StradaContainerGraphTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('strada.containerGraph', {});
  });

  it('should read live architecture validation', async () => {
    const tool = new StradaValidateArchitectureLiveTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('strada.architectureValidate', {});
  });

  it('should read live system profile', async () => {
    const tool = new StradaSystemProfileTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('strada.systemProfile', {});
  });

  it('should allow hot reload updates', async () => {
    const tool = new StradaHotReloadControlTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({ action: 'set', enabled: false }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('strada.hotReload', {
      action: 'set',
      enabled: false,
    });
  });

  it('should reject log settings writes in read-only mode', async () => {
    const tool = new StradaLogModulesTool();
    tool.setBridgeClient(bridge);
    const result = await tool.execute({
      action: 'set',
      showLogs: false,
    }, createContext({ readOnly: true }));
    expect(result.isError).toBe(true);
  });
});
