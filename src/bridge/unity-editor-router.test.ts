import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState } from './connection-manager.js';
import { UnityEditorRouter, type BridgeManagerLike } from './unity-editor-router.js';
import type { ToolContext } from '../tools/tool.interface.js';
import { createLogger } from '../utils/logger.js';

describe('UnityEditorRouter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-router-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes against the matching project and injects the bridge client', async () => {
    await writeInstance(tmpDir, 'arrow-main', {
      instanceId: 'arrow-main',
      projectPath: '/work/Arrow',
      port: 9101,
      lastHeartbeatUtc: new Date().toISOString(),
    });

    const awareTool = { setBridgeClient: vi.fn() };
    const awareResource = { setBridgeClient: vi.fn() };
    const toolContext = createContext('/work/Arrow');

    const router = new UnityEditorRouter({
      projectPath: '/work/Arrow',
      preferredPort: 7691,
      discoveryEnabled: true,
      staleAfterMs: 20_000,
      registryDir: tmpDir,
      autoConnect: true,
      timeoutMs: 1_000,
      logger: createLogger('error', 'router-test'),
      toolContext,
      bridgeAwareTools: [awareTool],
      bridgeAwareResources: [awareResource],
      managerFactory: (port) => new FakeBridgeManager(port),
    });

    const status = await router.initialize();

    expect(status.activePort).toBe(9101);
    expect(toolContext.unityBridgeConnected).toBe(true);
    expect(awareTool.setBridgeClient).toHaveBeenCalled();
    expect(awareResource.setBridgeClient).toHaveBeenCalled();

    router.destroy();
  });

  it('supports explicit runtime retargeting and disconnect', async () => {
    const toolContext = createContext('/work/Arrow');
    const awareTool = { setBridgeClient: vi.fn() };

    const router = new UnityEditorRouter({
      projectPath: '/work/Arrow',
      preferredPort: 7691,
      discoveryEnabled: true,
      staleAfterMs: 20_000,
      registryDir: tmpDir,
      autoConnect: false,
      timeoutMs: 1_000,
      logger: createLogger('error', 'router-test'),
      toolContext,
      bridgeAwareTools: [awareTool],
      bridgeAwareResources: [],
      managerFactory: (port) => new FakeBridgeManager(port),
    });

    const result = await router.retarget({ port: 9102 });
    expect(result.status).toBe('connected');
    expect(result.target.activePort).toBe(9102);
    expect(toolContext.unityBridgeConnected).toBe(true);

    const disconnect = router.disconnect();
    expect(disconnect.status).toBe('disconnected');
    expect(router.getStatus().connected).toBe(false);
    expect(toolContext.unityBridgeConnected).toBe(false);

    router.destroy();
  });
});

class FakeBridgeManager extends EventEmitter implements BridgeManagerLike {
  readonly client = { name: 'fake-client' } as never;
  private connected = false;

  constructor(private readonly port: number) {
    super();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get state(): ConnectionState {
    return this.connected ? ConnectionState.Connected : ConnectionState.Disconnected;
  }

  async connect(): Promise<void> {
    if (this.port === 9999) {
      throw new Error('Connection refused');
    }

    this.connected = true;
    this.emit('stateChange', ConnectionState.Connected);
  }

  destroy(): void {
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) {
      this.emit('stateChange', ConnectionState.Disconnected);
    }
    this.removeAllListeners();
  }
}

function createContext(projectPath: string): ToolContext {
  return {
    projectPath,
    workingDirectory: projectPath,
    readOnly: false,
    unityBridgeConnected: false,
  };
}

async function writeInstance(
  registryDir: string,
  fileStem: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await fs.writeFile(
    path.join(registryDir, `${fileStem}.json`),
    JSON.stringify({
      projectName: 'Arrow',
      pid: 1234,
      unityVersion: '6000.0.67f1',
      productName: 'Arrow',
      isBatchMode: false,
      isPlaying: false,
      isCompiling: false,
      isUpdating: false,
      bridgeRunning: true,
      startedAtUtc: new Date().toISOString(),
      ...payload,
    }),
    'utf8',
  );
}
