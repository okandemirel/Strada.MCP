import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrefabAnalyzeTool } from './prefab-analyze.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SAMPLE_PREFAB = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &1000
GameObject:
  m_ObjectHideFlags: 0
  m_Name: Player
  m_TagString: Player
  m_IsActive: 1
  m_Component:
  - component: {fileID: 1001}
  - component: {fileID: 1002}
  - component: {fileID: 1003}
  - component: {fileID: 1004}
--- !u!4 &1001
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 1000}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_Children:
  - {fileID: 2001}
  m_Father: {fileID: 0}
--- !u!114 &1002
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 1000}
  m_Script: {fileID: 11500000, guid: abc123def456}
--- !u!54 &1003
Rigidbody:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 1000}
--- !u!65 &1004
BoxCollider:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 1000}
--- !u!1 &2000
GameObject:
  m_ObjectHideFlags: 0
  m_Name: WeaponMount
  m_TagString: Untagged
  m_IsActive: 1
  m_Component:
  - component: {fileID: 2001}
--- !u!4 &2001
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 2000}
  m_Children: []
  m_Father: {fileID: 1001}`;

const NESTED_PREFAB = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &1000
GameObject:
  m_ObjectHideFlags: 0
  m_Name: EnemySquad
  m_TagString: Untagged
  m_IsActive: 1
  m_Component:
  - component: {fileID: 1001}
--- !u!4 &1001
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 1000}
  m_Children: []
  m_Father: {fileID: 0}
--- !u!1001 &3000
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_SourcePrefab: {fileID: 100100000, guid: nested123guid, type: 3}
--- !u!1001 &3001
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_SourcePrefab: {fileID: 100100000, guid: nested456guid, type: 3}`;

describe('PrefabAnalyzeTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-prefab-test-'));
    await fs.mkdir(path.join(tmpDir, 'Assets/Prefabs'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'Assets/Prefabs/Player.prefab'), SAMPLE_PREFAB);
    await fs.writeFile(path.join(tmpDir, 'Assets/Prefabs/EnemySquad.prefab'), NESTED_PREFAB);
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata (no bridge required)', () => {
    const tool = new PrefabAnalyzeTool();
    expect(tool.name).toBe('unity_prefab_analyze');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should count GameObjects in prefab', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Prefabs/Player.prefab' }, ctx);
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content);
    expect(data.gameObjectCount).toBe(2); // Player + WeaponMount
  });

  it('should list components', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Prefabs/Player.prefab' }, ctx);
    const data = JSON.parse(result.content);

    expect(data.componentDistribution).toBeDefined();
    expect(data.componentDistribution['Transform']).toBe(2);
    expect(data.componentDistribution['MonoBehaviour']).toBe(1);
    expect(data.componentDistribution['Rigidbody']).toBe(1);
    expect(data.componentDistribution['BoxCollider']).toBe(1);
  });

  it('should report hierarchy depth', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Prefabs/Player.prefab' }, ctx);
    const data = JSON.parse(result.content);

    expect(data.hierarchyDepth).toBe(2); // Player -> WeaponMount
    expect(data.rootName).toBe('Player');
  });

  it('should detect nested prefab references', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Prefabs/EnemySquad.prefab' }, ctx);
    const data = JSON.parse(result.content);

    expect(data.nestedPrefabCount).toBe(2);
    expect(data.nestedPrefabGuids).toContain('nested123guid');
    expect(data.nestedPrefabGuids).toContain('nested456guid');
  });

  it('should report MonoBehaviour script GUIDs', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Prefabs/Player.prefab' }, ctx);
    const data = JSON.parse(result.content);

    expect(data.scriptGuids).toBeDefined();
    expect(data.scriptGuids).toContain('abc123def456');
  });

  it('should reject path traversal', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: '../../etc/passwd' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should reject non-.prefab files', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scenes/Main.unity' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.prefab');
  });

  it('should return file size info', async () => {
    const tool = new PrefabAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Prefabs/Player.prefab' }, ctx);
    const data = JSON.parse(result.content);
    expect(data.fileSizeBytes).toBeGreaterThan(0);
  });
});
