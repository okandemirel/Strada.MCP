import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConsoleLogTool,
  ConsoleClearTool,
  SelectionGetTool,
  SelectionSetTool,
} from './editor-tools.js';
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

describe('ConsoleLogTool', () => {
  let tool: ConsoleLogTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ConsoleLogTool();
    bridge = createMockBridge({ logged: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_console_log');
    expect(tool.metadata.category).toBe('unity-runtime');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should send log message', async () => {
    const result = await tool.execute(
      { message: 'Hello Unity', type: 'log' },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.log', {
      message: 'Hello Unity',
      type: 'log',
    });
  });

  it('should send warning message', async () => {
    await tool.execute(
      { message: 'Be careful', type: 'warning' },
      createContext(),
    );
    expect(bridge.request).toHaveBeenCalledWith('editor.log', {
      message: 'Be careful',
      type: 'warning',
    });
  });

  it('should send error message', async () => {
    await tool.execute(
      { message: 'Something broke', type: 'error' },
      createContext(),
    );
    expect(bridge.request).toHaveBeenCalledWith('editor.log', {
      message: 'Something broke',
      type: 'error',
    });
  });

  it('should reject invalid type', async () => {
    const result = await tool.execute(
      { message: 'test', type: 'debug' },
      createContext(),
    );
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { message: 'test', type: 'log' },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should require message', async () => {
    const result = await tool.execute({ type: 'log' }, createContext());
    expect(result.isError).toBe(true);
  });

  it('should format response on success', async () => {
    const result = await tool.execute(
      { message: 'Hello', type: 'warning' },
      createContext(),
    );
    expect(result.content).toContain('Console message sent');
  });
});

describe('ConsoleClearTool', () => {
  let tool: ConsoleClearTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new ConsoleClearTool();
    bridge = createMockBridge({ cleared: true });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_console_clear');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should clear console via bridge', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.clearConsole', {});
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute({}, createContext({ readOnly: true }));
    expect(result.isError).toBe(true);
  });

  it('should format response on success', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.content).toContain('Console cleared');
  });
});

describe('SelectionGetTool', () => {
  let tool: SelectionGetTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new SelectionGetTool();
    bridge = createMockBridge({
      instanceIds: [101, 202],
      names: ['Player', 'Camera'],
    });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_selection_get');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should get selection via bridge', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.getSelection', {});
  });

  it('should work in read-only mode', async () => {
    const result = await tool.execute({}, createContext({ readOnly: true }));
    expect(result.isError).toBeFalsy();
  });

  it('should format response with selection info', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.content).toContain('2');
    expect(result.content).toContain('101');
  });
});

describe('SelectionSetTool', () => {
  let tool: SelectionSetTool;
  let bridge: BridgeClient;

  beforeEach(() => {
    tool = new SelectionSetTool();
    bridge = createMockBridge({ selected: true, count: 3 });
    tool.setBridgeClient(bridge);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_selection_set');
    expect(tool.metadata.readOnly).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  it('should set selection via bridge', async () => {
    const result = await tool.execute(
      { instanceIds: [10, 20, 30] },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.setSelection', {
      instanceIds: [10, 20, 30],
    });
  });

  it('should set empty selection', async () => {
    const result = await tool.execute(
      { instanceIds: [] },
      createContext(),
    );
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.setSelection', {
      instanceIds: [],
    });
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { instanceIds: [1] },
      createContext({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should require instanceIds', async () => {
    const result = await tool.execute({}, createContext());
    expect(result.isError).toBe(true);
  });

  it('should format response on success', async () => {
    const result = await tool.execute(
      { instanceIds: [10, 20, 30] },
      createContext(),
    );
    expect(result.content).toContain('Selection updated');
  });
});
