import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SceneAnalyzeTool } from './scene-analyze.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SAMPLE_SCENE = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
--- !u!1 &100
GameObject:
  m_ObjectHideFlags: 0
  m_Name: Main Camera
  m_TagString: MainCamera
  m_IsActive: 1
  m_Component:
  - component: {fileID: 101}
  - component: {fileID: 102}
--- !u!4 &101
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 100}
  m_LocalPosition: {x: 0, y: 1, z: -10}
  m_Children: []
  m_Father: {fileID: 0}
--- !u!20 &102
Camera:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 100}
--- !u!1 &200
GameObject:
  m_ObjectHideFlags: 0
  m_Name: Player
  m_TagString: Player
  m_IsActive: 1
  m_Component:
  - component: {fileID: 201}
  - component: {fileID: 202}
  - component: {fileID: 203}
--- !u!4 &201
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 200}
  m_Children:
  - {fileID: 301}
  m_Father: {fileID: 0}
--- !u!114 &202
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 200}
  m_Script: {fileID: 11500000, guid: abc123}
--- !u!54 &203
Rigidbody:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 200}
--- !u!1 &300
GameObject:
  m_ObjectHideFlags: 0
  m_Name: WeaponPivot
  m_TagString: Untagged
  m_IsActive: 1
  m_Component:
  - component: {fileID: 301}
--- !u!4 &301
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 300}
  m_Children: []
  m_Father: {fileID: 201}`;

describe('SceneAnalyzeTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-scene-test-'));
    await fs.mkdir(path.join(tmpDir, 'Assets/Scenes'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'Assets/Scenes/Test.unity'), SAMPLE_SCENE);
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
    const tool = new SceneAnalyzeTool();
    expect(tool.name).toBe('unity_scene_analyze');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should count GameObjects', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scenes/Test.unity' }, ctx);
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content);
    expect(data.gameObjectCount).toBe(3);
  });

  it('should report component distribution', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scenes/Test.unity' }, ctx);
    const data = JSON.parse(result.content);

    expect(data.componentDistribution).toBeDefined();
    expect(data.componentDistribution['Transform']).toBe(3);
    expect(data.componentDistribution['Camera']).toBe(1);
    expect(data.componentDistribution['MonoBehaviour']).toBe(1);
    expect(data.componentDistribution['Rigidbody']).toBe(1);
  });

  it('should calculate hierarchy depth', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scenes/Test.unity' }, ctx);
    const data = JSON.parse(result.content);

    // Root GameObjects: Main Camera, Player; Child: WeaponPivot under Player
    expect(data.maxHierarchyDepth).toBe(2);
    expect(data.rootObjectCount).toBe(2);
  });

  it('should report tag usage', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scenes/Test.unity' }, ctx);
    const data = JSON.parse(result.content);

    expect(data.tagUsage).toBeDefined();
    expect(data.tagUsage['MainCamera']).toBe(1);
    expect(data.tagUsage['Player']).toBe(1);
  });

  it('should reject path traversal', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: '../../etc/passwd' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should reject non-.unity files', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scripts/Foo.cs' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.unity');
  });

  it('should return file size info', async () => {
    const tool = new SceneAnalyzeTool();
    const result = await tool.execute({ path: 'Assets/Scenes/Test.unity' }, ctx);
    const data = JSON.parse(result.content);
    expect(data.fileSizeBytes).toBeGreaterThan(0);
  });
});
