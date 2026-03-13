import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseUnityYaml, type UnityDocument, type UnityObject } from './unity-yaml-parser.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SAMPLE_SCENE = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
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
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Children: []
  m_Father: {fileID: 0}
--- !u!20 &102
Camera:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 100}
  m_Enabled: 1
  m_ClearFlags: 1
--- !u!1 &200
GameObject:
  m_ObjectHideFlags: 0
  m_Name: Directional Light
  m_TagString: Untagged
  m_IsActive: 1
  m_Component:
  - component: {fileID: 201}
  - component: {fileID: 202}
--- !u!4 &201
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 200}
  m_LocalPosition: {x: 0, y: 3, z: 0}
  m_Children: []
  m_Father: {fileID: 0}
--- !u!108 &202
Light:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 200}
  m_Type: 1`;

describe('UnityYamlParser', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-yaml-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should parse Unity YAML documents into typed objects', () => {
    const docs = parseUnityYaml(SAMPLE_SCENE);
    expect(docs.length).toBeGreaterThanOrEqual(7);
  });

  it('should extract class IDs and file IDs', () => {
    const docs = parseUnityYaml(SAMPLE_SCENE);
    const gameObjects = docs.filter((d) => d.classId === 1);
    expect(gameObjects).toHaveLength(2);
    expect(gameObjects[0].fileId).toBe(100);
    expect(gameObjects[1].fileId).toBe(200);
  });

  it('should extract component type names', () => {
    const docs = parseUnityYaml(SAMPLE_SCENE);
    const types = docs.map((d) => d.typeName);
    expect(types).toContain('GameObject');
    expect(types).toContain('Transform');
    expect(types).toContain('Camera');
    expect(types).toContain('Light');
  });

  it('should extract property values', () => {
    const docs = parseUnityYaml(SAMPLE_SCENE);
    const camera = docs.find((d) => d.typeName === 'GameObject' && d.fileId === 100);
    expect(camera).toBeDefined();
    expect(camera!.properties['m_Name']).toBe('Main Camera');
    expect(camera!.properties['m_TagString']).toBe('MainCamera');
  });

  it('should extract child component references', () => {
    const docs = parseUnityYaml(SAMPLE_SCENE);
    const go = docs.find((d) => d.typeName === 'GameObject' && d.fileId === 100);
    expect(go).toBeDefined();
    expect(go!.properties['m_Component']).toBeDefined();
  });

  it('should parse from file path', async () => {
    const scenePath = path.join(tmpDir, 'test.unity');
    await fs.writeFile(scenePath, SAMPLE_SCENE);
    const content = await fs.readFile(scenePath, 'utf-8');
    const docs = parseUnityYaml(content);
    expect(docs.length).toBeGreaterThanOrEqual(7);
  });

  it('should handle empty file', () => {
    const docs = parseUnityYaml('');
    expect(docs).toHaveLength(0);
  });

  it('should return classId-to-typeName mapping for known Unity types', () => {
    const docs = parseUnityYaml(SAMPLE_SCENE);
    const transform = docs.find((d) => d.classId === 4);
    expect(transform?.typeName).toBe('Transform');
  });
});
