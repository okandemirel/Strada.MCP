# Phase 9: Unity Scene, Prefab & Asset Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 8 tools for Unity scene management, prefab workflows, and scene/prefab analysis. Bridge tools use the Phase 7 UnityBridge for editor commands, while analysis tools parse Unity YAML files directly (no bridge required).

**Architecture:** Scene and prefab CRUD tools extend `BridgeTool` base class (from Phase 8). Analysis tools (`scene_analyze`, `prefab_analyze`) parse `.unity` and `.prefab` YAML files directly using a shared Unity YAML parser utility, enabling them to work even when Unity Editor is closed.

**Tech Stack:** Unity bridge (Phase 7), zod, fs/promises, Unity YAML parser

**Depends on:** Phase 8 (Unity Runtime Tools -- provides BridgeTool base class, bridge command patterns)

---

### Task 1: Unity YAML parser utility

**Files:**
- Create: `src/utils/unity-yaml-parser.ts`
- Create: `src/utils/unity-yaml-parser.test.ts`

Unity `.unity` (scene) and `.prefab` files use a custom YAML-like format with `--- !u!` document separators and `&anchor` references. This utility parses those files into structured objects.

**Step 1: Write the failing test**

```typescript
// src/utils/unity-yaml-parser.test.ts
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
```

**Step 2: Write implementation**

```typescript
// src/utils/unity-yaml-parser.ts

/** Known Unity class IDs -> human-readable type names */
const UNITY_CLASS_MAP: Record<number, string> = {
  1: 'GameObject',
  2: 'Component',
  4: 'Transform',
  8: 'Behaviour',
  20: 'Camera',
  21: 'Material',
  23: 'MeshRenderer',
  25: 'Renderer',
  28: 'Texture2D',
  29: 'OcclusionCullingSettings',
  33: 'MeshFilter',
  43: 'Mesh',
  48: 'Shader',
  54: 'Rigidbody',
  64: 'MeshCollider',
  65: 'BoxCollider',
  68: 'SphereCollider',
  70: 'CapsuleCollider',
  82: 'AudioSource',
  83: 'AudioListener',
  87: 'ParticleSystem',
  91: 'MonoScript',
  95: 'Animator',
  102: 'TextAsset',
  104: 'RenderSettings',
  108: 'Light',
  111: 'LightmapSettings',
  114: 'MonoBehaviour',
  115: 'ScriptableObject',
  120: 'LineRenderer',
  128: 'NavMeshSettings',
  136: 'Terrain',
  157: 'LightProbes',
  196: 'NavMeshAgent',
  198: 'NavMeshObstacle',
  205: 'LODGroup',
  212: 'SpriteRenderer',
  218: 'Tilemap',
  220: 'TilemapRenderer',
  222: 'Canvas',
  223: 'CanvasRenderer',
  224: 'RectTransform',
  225: 'CanvasGroup',
  226: 'Image',
  228: 'Text',
  258: 'EventSystem',
  290: 'ReflectionProbe',
  1001: 'Prefab',
  1101: 'PrefabInstance',
};

export interface UnityObject {
  classId: number;
  fileId: number;
  typeName: string;
  properties: Record<string, unknown>;
  rawYaml: string;
}

export type UnityDocument = UnityObject;

/**
 * Parses Unity YAML content (scene, prefab, material, etc.) into structured objects.
 * Unity uses a custom YAML format with `--- !u!{classId} &{fileId}` document separators.
 */
export function parseUnityYaml(content: string): UnityDocument[] {
  if (!content.trim()) return [];

  const documents: UnityDocument[] = [];
  const docRegex = /^--- !u!(\d+) &(\d+)/gm;
  const matches: { classId: number; fileId: number; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = docRegex.exec(content)) !== null) {
    matches.push({
      classId: parseInt(match[1], 10),
      fileId: parseInt(match[2], 10),
      index: match.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const rawYaml = content.slice(start, end).trim();

    const lines = rawYaml.split('\n');
    // First line is `--- !u!XX &YY`, second line is `TypeName:`
    const typeLine = lines[1]?.trim() ?? '';
    const parsedTypeName = typeLine.endsWith(':') ? typeLine.slice(0, -1) : typeLine;
    const typeName =
      UNITY_CLASS_MAP[matches[i].classId] ?? parsedTypeName || `Unknown_${matches[i].classId}`;

    const properties = parseProperties(lines.slice(2));

    documents.push({
      classId: matches[i].classId,
      fileId: matches[i].fileId,
      typeName,
      properties,
      rawYaml,
    });
  }

  return documents;
}

/** Extracts top-level key-value properties from Unity YAML indented block */
function parseProperties(lines: string[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Top-level property (2-space indent in Unity YAML)
    if (indent === 2 || indent === 0) {
      // Flush any pending array
      if (currentKey && currentArray) {
        props[currentKey] = currentArray;
        currentArray = null;
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === '' || value === '[]') {
        currentKey = key;
        if (value === '[]') {
          props[key] = [];
          currentKey = null;
        }
      } else {
        props[key] = parseValue(value);
        currentKey = key;
        currentArray = null;
      }
    } else if (indent > 2 && trimmed.startsWith('- ')) {
      // Array item
      if (currentKey) {
        if (!currentArray) currentArray = [];
        currentArray.push(parseValue(trimmed.slice(2).trim()));
      }
    }
  }

  // Flush final array
  if (currentKey && currentArray) {
    props[currentKey] = currentArray;
  }

  return props;
}

/** Parse a Unity YAML value (handles inline objects, numbers, strings) */
function parseValue(value: string): unknown {
  // Inline object: {x: 0, y: 1, z: -10}
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1);
    const obj: Record<string, unknown> = {};
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const [k, ...rest] = pair.split(':');
      if (k && rest.length > 0) {
        obj[k.trim()] = parseScalar(rest.join(':').trim());
      }
    }
    return obj;
  }
  return parseScalar(value);
}

/** Parse scalar value (number, boolean, string) */
function parseScalar(value: string): string | number | boolean {
  if (value === '1' || value === '0') return parseInt(value, 10);
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}
```

**Step 3: Run tests**

Run: `npx vitest run src/utils/unity-yaml-parser.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/unity-yaml-parser.*
git commit -m "feat: add Unity YAML parser for scene and prefab files"
```

---

### Task 2: Scene tools -- create, open, save, get_scene_info (4 bridge tools)

**Files:**
- Create: `src/tools/unity-scene/scene-create.ts`
- Create: `src/tools/unity-scene/scene-open.ts`
- Create: `src/tools/unity-scene/scene-save.ts`
- Create: `src/tools/unity-scene/scene-info.ts`
- Create: `src/tools/unity-scene/scene-tools.test.ts`

All 4 tools require Unity bridge. They follow the same `BridgeTool` pattern from Phase 8.

**Step 1: Write the failing test**

```typescript
// src/tools/unity-scene/scene-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneCreateTool } from './scene-create.js';
import { SceneOpenTool } from './scene-open.js';
import { SceneSaveTool } from './scene-save.js';
import { SceneInfoTool } from './scene-info.js';
import type { ToolContext } from '../tool.interface.js';

// Mock bridge from Phase 7
const mockBridge = {
  send: vi.fn(),
  isConnected: () => true,
};

function createCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectPath: '/Users/test/project',
    workingDirectory: '/Users/test/project',
    readOnly: false,
    unityBridgeConnected: true,
    bridge: mockBridge,
    ...overrides,
  } as ToolContext;
}

describe('SceneCreateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new SceneCreateTool();
    expect(tool.name).toBe('unity_create_scene');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should send create scene command via bridge', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { scenePath: 'Assets/Scenes/NewScene.unity' },
    });

    const tool = new SceneCreateTool();
    const result = await tool.execute(
      { name: 'NewScene', path: 'Assets/Scenes', template: 'default' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scene.create', {
      name: 'NewScene',
      path: 'Assets/Scenes',
      template: 'default',
    });
    expect(result.content).toContain('NewScene');
  });

  it('should reject when bridge not connected', async () => {
    const tool = new SceneCreateTool();
    const result = await tool.execute(
      { name: 'Test' },
      createCtx({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('bridge');
  });

  it('should reject in read-only mode', async () => {
    const tool = new SceneCreateTool();
    const result = await tool.execute(
      { name: 'Test' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });
});

describe('SceneOpenTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new SceneOpenTool();
    expect(tool.name).toBe('unity_open_scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should open scene in single mode', async () => {
    mockBridge.send.mockResolvedValueOnce({ success: true, data: { loaded: true } });

    const tool = new SceneOpenTool();
    const result = await tool.execute(
      { path: 'Assets/Scenes/Main.unity', additive: false },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scene.open', {
      path: 'Assets/Scenes/Main.unity',
      additive: false,
    });
  });

  it('should support additive scene loading', async () => {
    mockBridge.send.mockResolvedValueOnce({ success: true, data: { loaded: true } });

    const tool = new SceneOpenTool();
    const result = await tool.execute(
      { path: 'Assets/Scenes/UI.unity', additive: true },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scene.open', {
      path: 'Assets/Scenes/UI.unity',
      additive: true,
    });
  });

  it('should validate scene path ends with .unity', async () => {
    const tool = new SceneOpenTool();
    const result = await tool.execute(
      { path: 'Assets/Scenes/Main.txt' },
      createCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.unity');
  });
});

describe('SceneSaveTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new SceneSaveTool();
    expect(tool.name).toBe('unity_save_scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should save active scene', async () => {
    mockBridge.send.mockResolvedValueOnce({ success: true, data: { saved: true } });

    const tool = new SceneSaveTool();
    const result = await tool.execute({}, createCtx());

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scene.save', {});
  });

  it('should save scene to specific path (Save As)', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { saved: true, path: 'Assets/Scenes/Copy.unity' },
    });

    const tool = new SceneSaveTool();
    const result = await tool.execute(
      { path: 'Assets/Scenes/Copy.unity' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scene.save', {
      path: 'Assets/Scenes/Copy.unity',
    });
  });
});

describe('SceneInfoTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new SceneInfoTool();
    expect(tool.name).toBe('unity_get_scene_info');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should return scene metadata and hierarchy', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        name: 'MainScene',
        path: 'Assets/Scenes/MainScene.unity',
        isDirty: false,
        rootCount: 3,
        gameObjectCount: 42,
        hierarchy: [
          { name: 'Main Camera', id: 100, children: [] },
          { name: 'Directional Light', id: 200, children: [] },
          { name: 'Canvas', id: 300, children: [
            { name: 'Panel', id: 301, children: [] },
          ]},
        ],
      },
    });

    const tool = new SceneInfoTool();
    const result = await tool.execute({}, createCtx());

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('MainScene');
    expect(result.content).toContain('42');
  });

  it('should accept optional scene index', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        name: 'AdditiveScene',
        path: 'Assets/Scenes/UI.unity',
        rootCount: 1,
        gameObjectCount: 5,
        hierarchy: [],
      },
    });

    const tool = new SceneInfoTool();
    const result = await tool.execute({ sceneIndex: 1 }, createCtx());

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scene.info', { sceneIndex: 1 });
  });
});
```

**Step 2: Implement all 4 scene tools**

Each tool follows the BridgeTool pattern:
1. Validate input with Zod schema
2. Check bridge connection (`requiresBridge: true`)
3. Check read-only mode for write operations
4. Send command via `bridge.send(command, params)`
5. Return formatted ToolResult

Key schemas:
- `scene.create`: `{ name: string, path?: string, template?: 'default' | 'empty' | '2d' | '3d' }`
- `scene.open`: `{ path: string, additive?: boolean }` -- path must end with `.unity`
- `scene.save`: `{ path?: string }` -- optional path for "Save As"
- `scene.info`: `{ sceneIndex?: number }` -- optional index for multi-scene

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-scene/scene-tools.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-scene/scene-create.ts src/tools/unity-scene/scene-open.ts src/tools/unity-scene/scene-save.ts src/tools/unity-scene/scene-info.ts src/tools/unity-scene/scene-tools.test.ts
git commit -m "feat: add 4 scene bridge tools (create, open, save, info)"
```

---

### Task 3: Scene analysis tool -- unity_scene_analyze (YAML-based, no bridge)

**Files:**
- Create: `src/tools/unity-scene/scene-analyze.ts`
- Create: `src/tools/unity-scene/scene-analyze.test.ts`

This tool parses `.unity` scene files directly from disk -- no bridge required. It provides statistics about the scene structure: GameObject count, component distribution, hierarchy depth, tag/layer usage, and potential performance concerns.

**Step 1: Write the failing test**

```typescript
// src/tools/unity-scene/scene-analyze.test.ts
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
```

**Step 2: Write implementation**

The tool:
1. Validates path (path-guard, must end in `.unity`)
2. Reads the `.unity` file from disk
3. Parses with `parseUnityYaml()`
4. Extracts stats: GameObject count, component distribution, hierarchy depth, tag usage
5. Calculates hierarchy by following Transform `m_Father`/`m_Children` references
6. Returns structured JSON

Output schema:
```typescript
{
  scenePath: string;
  fileSizeBytes: number;
  gameObjectCount: number;
  totalObjectCount: number;
  rootObjectCount: number;
  maxHierarchyDepth: number;
  componentDistribution: Record<string, number>;  // type -> count
  tagUsage: Record<string, number>;               // tag -> count
  warnings: string[];                              // e.g., "Deep hierarchy (>10 levels)"
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-scene/scene-analyze.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-scene/scene-analyze.*
git commit -m "feat: add unity_scene_analyze tool (YAML-based, no bridge)"
```

---

### Task 4: Prefab tools -- create_prefab, instantiate_prefab (2 bridge tools)

**Files:**
- Create: `src/tools/unity-scene/prefab-create.ts`
- Create: `src/tools/unity-scene/prefab-instantiate.ts`
- Create: `src/tools/unity-scene/prefab-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-scene/prefab-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrefabCreateTool } from './prefab-create.js';
import { PrefabInstantiateTool } from './prefab-instantiate.js';
import type { ToolContext } from '../tool.interface.js';

const mockBridge = {
  send: vi.fn(),
  isConnected: () => true,
};

function createCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectPath: '/Users/test/project',
    workingDirectory: '/Users/test/project',
    readOnly: false,
    unityBridgeConnected: true,
    bridge: mockBridge,
    ...overrides,
  } as ToolContext;
}

describe('PrefabCreateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new PrefabCreateTool();
    expect(tool.name).toBe('unity_create_prefab');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create prefab from existing GameObject', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        prefabPath: 'Assets/Prefabs/Player.prefab',
        gameObjectName: 'Player',
      },
    });

    const tool = new PrefabCreateTool();
    const result = await tool.execute(
      {
        gameObjectName: 'Player',
        savePath: 'Assets/Prefabs',
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('prefab.create', {
      gameObjectName: 'Player',
      savePath: 'Assets/Prefabs',
    });
    expect(result.content).toContain('Player.prefab');
  });

  it('should support creating prefab from selection by instance ID', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { prefabPath: 'Assets/Prefabs/Enemy.prefab' },
    });

    const tool = new PrefabCreateTool();
    const result = await tool.execute(
      { gameObjectId: 12345, savePath: 'Assets/Prefabs', prefabName: 'Enemy' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('prefab.create', {
      gameObjectId: 12345,
      savePath: 'Assets/Prefabs',
      prefabName: 'Enemy',
    });
  });

  it('should reject when bridge not connected', async () => {
    const tool = new PrefabCreateTool();
    const result = await tool.execute(
      { gameObjectName: 'Test', savePath: 'Assets/Prefabs' },
      createCtx({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const tool = new PrefabCreateTool();
    const result = await tool.execute(
      { gameObjectName: 'Test', savePath: 'Assets/Prefabs' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('PrefabInstantiateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new PrefabInstantiateTool();
    expect(tool.name).toBe('unity_instantiate_prefab');
    expect(tool.metadata.category).toBe('unity-scene');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should instantiate prefab at default position', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        instanceId: 54321,
        name: 'Player(Clone)',
        position: { x: 0, y: 0, z: 0 },
      },
    });

    const tool = new PrefabInstantiateTool();
    const result = await tool.execute(
      { prefabPath: 'Assets/Prefabs/Player.prefab' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('prefab.instantiate', {
      prefabPath: 'Assets/Prefabs/Player.prefab',
    });
    expect(result.content).toContain('Player(Clone)');
  });

  it('should instantiate at specified position, rotation, and parent', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        instanceId: 54322,
        name: 'Enemy(Clone)',
        position: { x: 5, y: 0, z: 10 },
      },
    });

    const tool = new PrefabInstantiateTool();
    const result = await tool.execute(
      {
        prefabPath: 'Assets/Prefabs/Enemy.prefab',
        position: { x: 5, y: 0, z: 10 },
        rotation: { x: 0, y: 90, z: 0 },
        parentName: 'EnemyContainer',
        instanceName: 'Enemy_01',
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('prefab.instantiate', {
      prefabPath: 'Assets/Prefabs/Enemy.prefab',
      position: { x: 5, y: 0, z: 10 },
      rotation: { x: 0, y: 90, z: 0 },
      parentName: 'EnemyContainer',
      instanceName: 'Enemy_01',
    });
  });

  it('should validate prefab path ends with .prefab', async () => {
    const tool = new PrefabInstantiateTool();
    const result = await tool.execute(
      { prefabPath: 'Assets/Prefabs/Player.unity' },
      createCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.prefab');
  });
});
```

**Step 2: Implement both prefab tools**

Key schemas:
- `prefab.create`: `{ gameObjectName?: string, gameObjectId?: number, savePath: string, prefabName?: string }` -- at least one of name/id required
- `prefab.instantiate`: `{ prefabPath: string, position?: {x,y,z}, rotation?: {x,y,z}, parentName?: string, instanceName?: string }` -- path must end in `.prefab`

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-scene/prefab-tools.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-scene/prefab-create.ts src/tools/unity-scene/prefab-instantiate.ts src/tools/unity-scene/prefab-tools.test.ts
git commit -m "feat: add prefab create and instantiate bridge tools"
```

---

### Task 5: Prefab analysis tool -- unity_prefab_analyze (YAML-based, no bridge)

**Files:**
- Create: `src/tools/unity-scene/prefab-analyze.ts`
- Create: `src/tools/unity-scene/prefab-analyze.test.ts`

Like `scene_analyze`, this parses `.prefab` files directly from disk. It reports prefab structure, nested prefab references, component list, and variant status.

**Step 1: Write the failing test**

```typescript
// src/tools/unity-scene/prefab-analyze.test.ts
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
```

**Step 2: Write implementation**

The tool:
1. Validates path (path-guard, must end in `.prefab`)
2. Reads `.prefab` file from disk
3. Parses with `parseUnityYaml()`
4. Extracts: GameObject count, component distribution, hierarchy depth, root name
5. Detects nested prefab instances (classId 1001/1101) and extracts their source GUIDs
6. Extracts MonoBehaviour script GUIDs for cross-referencing
7. Returns structured JSON

Output schema:
```typescript
{
  prefabPath: string;
  fileSizeBytes: number;
  rootName: string;
  gameObjectCount: number;
  totalObjectCount: number;
  hierarchyDepth: number;
  componentDistribution: Record<string, number>;
  nestedPrefabCount: number;
  nestedPrefabGuids: string[];
  scriptGuids: string[];
  warnings: string[];  // e.g., "Deep nesting (>5 levels)", "Many nested prefabs (>10)"
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-scene/prefab-analyze.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-scene/prefab-analyze.*
git commit -m "feat: add unity_prefab_analyze tool (YAML-based, no bridge)"
```

---

### Task 6: Barrel export + register all 8 tools + integration tests

**Files:**
- Create: `src/tools/unity-scene/index.ts`
- Update: tool registration in server setup (from Phase 1)
- Create: `src/tools/unity-scene/integration.test.ts`

**Step 1: Create barrel export**

```typescript
// src/tools/unity-scene/index.ts
export { SceneCreateTool } from './scene-create.js';
export { SceneOpenTool } from './scene-open.js';
export { SceneSaveTool } from './scene-save.js';
export { SceneInfoTool } from './scene-info.js';
export { SceneAnalyzeTool } from './scene-analyze.js';
export { PrefabCreateTool } from './prefab-create.js';
export { PrefabInstantiateTool } from './prefab-instantiate.js';
export { PrefabAnalyzeTool } from './prefab-analyze.js';
```

**Step 2: Write integration test**

```typescript
// src/tools/unity-scene/integration.test.ts
import { describe, it, expect } from 'vitest';
import {
  SceneCreateTool,
  SceneOpenTool,
  SceneSaveTool,
  SceneInfoTool,
  SceneAnalyzeTool,
  PrefabCreateTool,
  PrefabInstantiateTool,
  PrefabAnalyzeTool,
} from './index.js';
import { ToolRegistry } from '../tool-registry.js';

describe('Phase 9 Integration', () => {
  it('should register all 8 tools without conflicts', () => {
    const registry = new ToolRegistry();
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    for (const tool of tools) {
      registry.register(tool);
    }

    expect(registry.getAll()).toHaveLength(8);
    expect(registry.getByCategory('unity-scene')).toHaveLength(8);
  });

  it('should have 6 bridge tools and 2 non-bridge tools', () => {
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    const bridgeTools = tools.filter((t) => t.metadata.requiresBridge);
    const localTools = tools.filter((t) => !t.metadata.requiresBridge);

    expect(bridgeTools).toHaveLength(6);
    expect(localTools).toHaveLength(2);

    // Local tools are the analysis ones
    expect(localTools.map((t) => t.name).sort()).toEqual([
      'unity_prefab_analyze',
      'unity_scene_analyze',
    ]);
  });

  it('should have correct read-only flags', () => {
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    const readOnlyTools = tools.filter((t) => t.metadata.readOnly);
    expect(readOnlyTools.map((t) => t.name).sort()).toEqual([
      'unity_get_scene_info',
      'unity_prefab_analyze',
      'unity_scene_analyze',
    ]);
  });

  it('all tools should have valid Zod input schemas', () => {
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
```

**Step 3: Run all Phase 9 tests**

Run: `npx vitest run src/tools/unity-scene/ src/utils/unity-yaml-parser.test.ts`
Expected: ALL PASS

**Step 4: Run full quality gates**

```bash
npx tsc --noEmit
npx vitest run
```

**Step 5: Commit and push**

```bash
git add src/tools/unity-scene/ src/utils/unity-yaml-parser.*
git commit -m "feat: register all 8 scene and prefab tools + integration tests"
git push origin main
```

**Phase 9 complete.** Deliverables:
- Unity YAML parser utility (shared by scene and prefab analysis)
- 4 scene tools: create, open (additive), save, get_scene_info -- via bridge
- 1 scene analysis tool: scene_analyze -- YAML-based, works without bridge
- 2 prefab tools: create_prefab, instantiate_prefab -- via bridge
- 1 prefab analysis tool: prefab_analyze -- YAML-based, nested prefab tracking
- ~45 new tests passing (cumulative ~195)
