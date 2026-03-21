import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverUnityEditorInstances,
  resolveUnityEditorTarget,
} from './editor-instance-registry.js';

describe('editor-instance-registry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-editors-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('discovers fresh Unity editor instances from the registry', async () => {
    await writeInstance(tmpDir, 'arrow-1', {
      instanceId: 'arrow-1',
      projectPath: '/work/Arrow',
      port: 7781,
      lastHeartbeatUtc: new Date().toISOString(),
    });

    const discovered = discoverUnityEditorInstances({ registryDir: tmpDir });
    expect(discovered).toHaveLength(1);
    expect(discovered[0].instanceId).toBe('arrow-1');
    expect(discovered[0].port).toBe(7781);
  });

  it('filters stale editor instances by default', async () => {
    await writeInstance(tmpDir, 'stale-editor', {
      instanceId: 'stale-editor',
      projectPath: '/work/Stale',
      port: 7782,
      lastHeartbeatUtc: new Date(Date.now() - 60_000).toISOString(),
    });

    const discovered = discoverUnityEditorInstances({ registryDir: tmpDir, staleAfterMs: 5_000 });
    expect(discovered).toHaveLength(0);
  });

  it('selects the matching project when multiple editors are present', async () => {
    await writeInstance(tmpDir, 'wrong-project', {
      instanceId: 'wrong-project',
      projectPath: '/work/Other',
      port: 7783,
      lastHeartbeatUtc: new Date(Date.now() - 2_000).toISOString(),
    });
    await writeInstance(tmpDir, 'arrow-project', {
      instanceId: 'arrow-project',
      projectPath: '/work/Arrow',
      port: 7784,
      lastHeartbeatUtc: new Date().toISOString(),
    });

    const resolution = resolveUnityEditorTarget({
      registryDir: tmpDir,
      projectPath: '/work/Arrow',
      preferredPort: 7691,
    });

    expect(resolution.selected?.instanceId).toBe('arrow-project');
    expect(resolution.source).toBe('project-path');
    expect(resolution.port).toBe(7784);
  });

  it('falls back to the preferred port when no discovery match exists', () => {
    const resolution = resolveUnityEditorTarget({
      registryDir: tmpDir,
      projectPath: '/work/Arrow',
      preferredPort: 7691,
      explicitPort: true,
    });

    expect(resolution.selected).toBeNull();
    expect(resolution.port).toBe(7691);
    expect(resolution.source).toBe('default');
  });
});

async function writeInstance(
  registryDir: string,
  fileStem: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await fs.writeFile(
    path.join(registryDir, `${fileStem}.json`),
    JSON.stringify({
      projectName: 'TestProject',
      pid: 1234,
      unityVersion: '6000.0.67f1',
      productName: 'TestProject',
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
