import { describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ToolContext } from '../tool.interface.js';
import { UnityReflectApiTool } from './unity-reflect-api.js';
import { UnityFixCompileLoopTool } from './unity-fix-compile-loop.js';

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

describe('UnityReflectApiTool', () => {
  it('uses bridge reflection when available', async () => {
    const bridge = createMockBridge(async (method) => {
      if (method === 'reflection.getMembers') {
        return { typeName: 'UnityEngine.Transform', methods: [{ name: 'Translate' }] };
      }
      return {};
    });
    const tool = new UnityReflectApiTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ typeName: 'UnityEngine.Transform' }, createContext());
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('bridge-reflection');
  });
});

describe('UnityFixCompileLoopTool', () => {
  it('aggregates compile and console diagnostics', async () => {
    const bridge = createMockBridge(async (method) => {
      switch (method) {
        case 'editor.recompile':
          return { requested: true };
        case 'editor.compileStatus':
          return { isCompiling: false, isReloading: false, compileIssues: [] };
        case 'editor.getConsoleLogs':
          return { entries: [] };
        default:
          return {};
      }
    });
    const tool = new UnityFixCompileLoopTool();
    tool.setBridgeClient(bridge);

    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('bridge+project-symbol-index');
  });
});
