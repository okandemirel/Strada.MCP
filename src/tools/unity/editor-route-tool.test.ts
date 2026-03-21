import { describe, expect, it, vi } from 'vitest';
import type { UnityEditorRouter } from '../../bridge/unity-editor-router.js';
import type { ToolContext } from '../tool.interface.js';
import { UnityEditorRouteTool } from './editor-route-tool.js';

describe('UnityEditorRouteTool', () => {
  it('returns router status for read actions', async () => {
    const router = createRouterStub();
    const tool = new UnityEditorRouteTool();
    tool.setEditorRouter(router);

    const result = await tool.execute({ action: 'status' }, createContext());
    const parsed = JSON.parse(result.content) as { activePort: number | null };

    expect(parsed.activePort).toBe(8123);
  });

  it('retargets through the runtime router', async () => {
    const router = createRouterStub();
    const tool = new UnityEditorRouteTool();
    tool.setEditorRouter(router);

    const result = await tool.execute({ action: 'connect', port: 9001 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(router.retarget).toHaveBeenCalledWith({
      instanceId: undefined,
      projectPath: undefined,
      port: 9001,
      includeStale: false,
      staleAfterMs: undefined,
    });
  });
});

function createRouterStub(): UnityEditorRouter {
  return {
    getStatus: vi.fn(() => ({
      connected: true,
      connectionState: 'connected',
      activePort: 8123,
      activeInstance: null,
      selectionSource: 'preferred-port',
      warnings: [],
      projectPath: '/project',
      preferredPort: 8123,
      preferredInstanceId: null,
      discoveryEnabled: true,
      discoveredCount: 1,
      discoveredEditors: [],
    })),
    listEditors: vi.fn(() => []),
    retarget: vi.fn(async () => ({
      status: 'connected',
      message: 'Connected',
      attemptedPort: 9001,
      resolution: null,
      target: {
        connected: true,
        connectionState: 'connected',
        activePort: 9001,
        activeInstance: null,
        selectionSource: 'preferred-port',
        warnings: [],
        projectPath: '/project',
        preferredPort: 9001,
        preferredInstanceId: null,
        discoveryEnabled: true,
        discoveredCount: 0,
      },
    })),
    disconnect: vi.fn(() => ({
      status: 'disconnected',
      message: 'Disconnected',
      attemptedPort: 8123,
      resolution: null,
      target: {
        connected: false,
        connectionState: 'disconnected',
        activePort: null,
        activeInstance: null,
        selectionSource: null,
        warnings: [],
        projectPath: '/project',
        preferredPort: 8123,
        preferredInstanceId: null,
        discoveryEnabled: true,
        discoveredCount: 0,
      },
    })),
  } as unknown as UnityEditorRouter;
}

function createContext(): ToolContext {
  return {
    projectPath: '/project',
    workingDirectory: '/project',
    readOnly: false,
    unityBridgeConnected: false,
  };
}
