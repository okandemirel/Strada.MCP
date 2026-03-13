import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneHierarchyResource } from './scene-hierarchy.js';
import { ConsoleLogsResource } from './console-logs.js';
import { PlayStateResource } from './play-state.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';

function createMockBridgeClient(
  responses: Record<string, unknown> = {},
): BridgeClient {
  return {
    request: vi.fn(async (method: string) => {
      if (method in responses) {
        return responses[method];
      }
      throw new Error(`Unknown method: ${method}`);
    }),
  } as unknown as BridgeClient;
}

describe('SceneHierarchyResource', () => {
  let resource: SceneHierarchyResource;

  beforeEach(() => {
    resource = new SceneHierarchyResource();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://scene-hierarchy');
    expect(resource.metadata.requiresBridge).toBe(true);
  });

  it('should throw when bridge not connected', async () => {
    await expect(resource.read()).rejects.toThrow('Unity bridge not connected');
  });

  it('should return scene hierarchy from bridge', async () => {
    const hierarchy = {
      sceneName: 'MainScene',
      rootObjects: [
        {
          name: 'Main Camera',
          id: 1,
          active: true,
          children: [],
          components: ['Camera', 'Transform'],
        },
      ],
    };

    const client = createMockBridgeClient({
      'unity/scene/hierarchy': hierarchy,
    });
    resource.setBridgeClient(client);

    const result = await resource.read();
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.text);
    expect(parsed.sceneName).toBe('MainScene');
    expect(parsed.rootObjects).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith('unity/scene/hierarchy');
  });

  it('should handle setBridgeClient(null)', async () => {
    const client = createMockBridgeClient({});
    resource.setBridgeClient(client);
    resource.setBridgeClient(null);
    await expect(resource.read()).rejects.toThrow('Unity bridge not connected');
  });
});

describe('ConsoleLogsResource', () => {
  let resource: ConsoleLogsResource;

  beforeEach(() => {
    resource = new ConsoleLogsResource();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://console-logs');
    expect(resource.metadata.requiresBridge).toBe(true);
  });

  it('should throw when bridge not connected', async () => {
    await expect(resource.read()).rejects.toThrow('Unity bridge not connected');
  });

  it('should return console logs from bridge', async () => {
    const logs = {
      entries: [
        {
          message: 'Game started',
          stackTrace: '',
          type: 'Log',
          timestamp: 1000,
        },
        {
          message: 'NullReferenceException',
          stackTrace: 'at Player.Update()',
          type: 'Error',
          timestamp: 1001,
        },
      ],
      totalCount: 2,
    };

    const client = createMockBridgeClient({ 'unity/console/logs': logs });
    resource.setBridgeClient(client);

    const result = await resource.read();
    const parsed = JSON.parse(result.text);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[1].type).toBe('Error');
    expect(client.request).toHaveBeenCalledWith('unity/console/logs');
  });
});

describe('PlayStateResource', () => {
  let resource: PlayStateResource;

  beforeEach(() => {
    resource = new PlayStateResource();
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://play-state');
    expect(resource.metadata.requiresBridge).toBe(true);
  });

  it('should throw when bridge not connected', async () => {
    await expect(resource.read()).rejects.toThrow('Unity bridge not connected');
  });

  it('should return play state from bridge', async () => {
    const state = {
      isPlaying: true,
      isPaused: false,
      isCompiling: false,
    };

    const client = createMockBridgeClient({ 'unity/editor/playState': state });
    resource.setBridgeClient(client);

    const result = await resource.read();
    const parsed = JSON.parse(result.text);
    expect(parsed.isPlaying).toBe(true);
    expect(parsed.isPaused).toBe(false);
    expect(client.request).toHaveBeenCalledWith('unity/editor/playState');
  });
});
