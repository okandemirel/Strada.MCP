import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConsoleAnalyzeTool,
  ConsoleLogTool,
  ConsoleClearTool,
  ConsoleReadTool,
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

describe('ConsoleReadTool', () => {
  let tool: ConsoleReadTool;
  let bridge: BridgeClient;
  let tempDir: string;

  beforeEach(async () => {
    tool = new ConsoleReadTool();
    bridge = createMockBridge({
      entries: [
        { type: 'error', message: 'CS0246: Missing symbol', file: 'Assets/Test.cs', line: 12 },
        { type: 'warning', message: 'Unused variable' },
      ],
      totalCount: 2,
    });
    tool.setBridgeClient(bridge);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-console-read-'));
  });

  afterEach(async () => {
    delete process.env.UNITY_EDITOR_LOG_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should read console logs via bridge', async () => {
    const result = await tool.execute({ limit: 25 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.getConsoleLogs', {
      includeStackTrace: true,
      limit: 25,
    });
    expect(result.content).toContain('Unity console snapshot');
    expect(result.content).toContain('CS0246');
  });

  it('should fall back to editor log data when the bridge request fails', async () => {
    const logPath = path.join(tempDir, 'Editor.log');
    await fs.writeFile(
      logPath,
      [
        'Assets/Test.cs(12,4): error CS0246: Missing symbol',
        'Assets/Test.cs(14,2): warning CS0168: Variable is declared but never used',
      ].join('\n'),
      'utf8',
    );
    process.env.UNITY_EDITOR_LOG_PATH = logPath;

    bridge = createMockBridge();
    (bridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection lost'));
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ limit: 10 }, createContext({ projectPath: tempDir }));
    expect(result.content).toContain('Diagnostics source: static_editor_log');
    expect(result.content).toContain('Live bridge fallback: Connection lost');
    expect(result.content).toContain('Missing symbol');
  });
});

describe('ConsoleAnalyzeTool', () => {
  let tool: ConsoleAnalyzeTool;
  let bridge: BridgeClient;
  let tempDir: string;

  beforeEach(async () => {
    tool = new ConsoleAnalyzeTool();
    bridge = createMockBridge({
      entries: [
        {
          type: 'error',
          message: 'CS0246: The type or namespace name Foo could not be found',
          file: 'Assets/Foo.cs',
          line: 4,
          stackTrace: 'Assets/Foo.cs:4',
        },
        {
          type: 'error',
          message: 'CS0246: The type or namespace name Foo could not be found',
          file: 'Assets/Foo.cs',
          line: 4,
          stackTrace: 'Assets/Foo.cs:4',
        },
      ],
      totalCount: 2,
    });
    tool.setBridgeClient(bridge);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-console-analyze-'));
  });

  afterEach(async () => {
    delete process.env.UNITY_EDITOR_LOG_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should group console issues', async () => {
    const result = await tool.execute({ limit: 50 }, createContext());
    expect(result.isError).toBeFalsy();
    expect(bridge.request).toHaveBeenCalledWith('editor.getConsoleLogs', {
      limit: 50,
      types: undefined,
      includeStackTrace: true,
    });
    expect(result.content).toContain('grouped issue');
    expect(result.content).toContain('2x');
  });

  it('should analyze fallback editor log entries when the live bridge is unavailable', async () => {
    const logPath = path.join(tempDir, 'Editor.log');
    await fs.writeFile(
      logPath,
      [
        'Assets/Foo.cs(4,2): error CS0246: The type or namespace name Foo could not be found',
        'Assets/Foo.cs(4,2): error CS0246: The type or namespace name Foo could not be found',
      ].join('\n'),
      'utf8',
    );
    process.env.UNITY_EDITOR_LOG_PATH = logPath;

    bridge = createMockBridge();
    (bridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Bridge offline'));
    tool.setBridgeClient(bridge);

    const result = await tool.execute({ limit: 20 }, createContext({ projectPath: tempDir }));
    expect(result.content).toContain('Diagnostics source: static_editor_log');
    expect(result.content).toContain('Live bridge fallback: Bridge offline');
    expect(result.content).toContain('2x');
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
