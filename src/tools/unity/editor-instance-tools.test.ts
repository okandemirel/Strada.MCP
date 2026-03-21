import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_INSTANCE_REGISTRY_DIR } from '../../bridge/editor-instance-registry.js';
import type { ToolContext } from '../tool.interface.js';
import { EditorInstancesTool } from './editor-instance-tools.js';

describe('EditorInstancesTool', () => {
  const createdFiles: string[] = [];
  const originalInstanceId = process.env.UNITY_BRIDGE_INSTANCE_ID;

  beforeEach(async () => {
    await fs.mkdir(DEFAULT_EDITOR_INSTANCE_REGISTRY_DIR, { recursive: true });
  });

  afterEach(async () => {
    process.env.UNITY_BRIDGE_INSTANCE_ID = originalInstanceId;
    for (const filePath of createdFiles.splice(0, createdFiles.length)) {
      await fs.rm(filePath, { force: true });
    }
  });

  it('lists discovered editors and resolves the selected instance', async () => {
    const instanceId = `tool-test-${Date.now()}`;
    process.env.UNITY_BRIDGE_INSTANCE_ID = instanceId;

    const filePath = path.join(DEFAULT_EDITOR_INSTANCE_REGISTRY_DIR, `${instanceId}.json`);
    createdFiles.push(filePath);
    await fs.writeFile(filePath, JSON.stringify({
      instanceId,
      projectPath: '/project',
      projectName: 'Project',
      port: 8123,
      pid: 4321,
      unityVersion: '6000.0.67f1',
      productName: 'Project',
      isBatchMode: false,
      isPlaying: false,
      isCompiling: false,
      isUpdating: false,
      bridgeRunning: true,
      startedAtUtc: new Date().toISOString(),
      lastHeartbeatUtc: new Date().toISOString(),
    }), 'utf8');

    const tool = new EditorInstancesTool();
    const result = await tool.execute({}, createContext());
    const parsed = JSON.parse(result.content) as {
      selected: { instanceId: string; port: number } | null;
      selectionSource: string;
      editors: Array<{ instanceId: string }>;
    };

    expect(parsed.selected?.instanceId).toBe(instanceId);
    expect(parsed.selected?.port).toBe(8123);
    expect(parsed.selectionSource).toBe('instance-id');
    expect(parsed.editors.some((editor) => editor.instanceId === instanceId)).toBe(true);
  });
});

function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    projectPath: '/project',
    workingDirectory: '/project',
    readOnly: false,
    unityBridgeConnected: false,
    ...overrides,
  };
}
