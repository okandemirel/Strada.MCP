# Phase 10: Unity Asset, Material & Subsystem Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 14 tools covering Unity asset management (search, dependencies, materials, ScriptableObjects, shaders, textures) and core subsystems (animation, physics, navigation, particles, lighting). All tools use the Phase 7 Unity bridge.

**Architecture:** Asset & material tools are grouped under `src/tools/unity-asset/`. Subsystem tools are grouped under `src/tools/unity-subsystem/`. All extend `BridgeTool` base class (from Phase 8). Each tool validates input with Zod, sends a bridge command, and returns structured JSON results.

**Tech Stack:** Unity bridge (Phase 7), zod, BridgeTool base class (Phase 8)

**Depends on:** Phase 9 (Unity Scene, Prefab & Asset Tools)

---

### Task 1: Asset search & dependency tools (3 tools)

**Files:**
- Create: `src/tools/unity-asset/asset-find.ts`
- Create: `src/tools/unity-asset/asset-dependencies.ts`
- Create: `src/tools/unity-asset/asset-unused.ts`
- Create: `src/tools/unity-asset/asset-search.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-asset/asset-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetFindTool } from './asset-find.js';
import { AssetDependenciesTool } from './asset-dependencies.js';
import { AssetUnusedTool } from './asset-unused.js';
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

describe('AssetFindTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new AssetFindTool();
    expect(tool.name).toBe('unity_find_assets');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should search assets by type', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        assets: [
          { path: 'Assets/Materials/Metal.mat', type: 'Material', guid: 'guid1' },
          { path: 'Assets/Materials/Wood.mat', type: 'Material', guid: 'guid2' },
        ],
        totalCount: 2,
      },
    });

    const tool = new AssetFindTool();
    const result = await tool.execute(
      { type: 'Material' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('asset.find', { type: 'Material' });
    const data = JSON.parse(result.content);
    expect(data.assets).toHaveLength(2);
  });

  it('should search assets by name pattern', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        assets: [
          { path: 'Assets/Textures/player_diffuse.png', type: 'Texture2D', guid: 'guid3' },
        ],
        totalCount: 1,
      },
    });

    const tool = new AssetFindTool();
    const result = await tool.execute(
      { name: 'player*', type: 'Texture2D' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('asset.find', {
      name: 'player*',
      type: 'Texture2D',
    });
  });

  it('should search assets by label', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { assets: [], totalCount: 0 },
    });

    const tool = new AssetFindTool();
    const result = await tool.execute(
      { label: 'Environment' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('asset.find', { label: 'Environment' });
  });

  it('should support directory filter', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { assets: [], totalCount: 0 },
    });

    const tool = new AssetFindTool();
    await tool.execute(
      { type: 'Prefab', directory: 'Assets/Prefabs/Enemies' },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('asset.find', {
      type: 'Prefab',
      directory: 'Assets/Prefabs/Enemies',
    });
  });

  it('should reject when bridge not connected', async () => {
    const tool = new AssetFindTool();
    const result = await tool.execute(
      { type: 'Material' },
      createCtx({ unityBridgeConnected: false }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('AssetDependenciesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new AssetDependenciesTool();
    expect(tool.name).toBe('unity_asset_dependencies');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should return dependency graph for asset', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        assetPath: 'Assets/Prefabs/Player.prefab',
        directDependencies: [
          'Assets/Materials/Player.mat',
          'Assets/Textures/player_diffuse.png',
          'Assets/Scripts/PlayerController.cs',
        ],
        recursiveDependencyCount: 12,
        dependedOnBy: [
          'Assets/Scenes/GameScene.unity',
        ],
      },
    });

    const tool = new AssetDependenciesTool();
    const result = await tool.execute(
      { path: 'Assets/Prefabs/Player.prefab' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.directDependencies).toHaveLength(3);
    expect(data.dependedOnBy).toHaveLength(1);
  });

  it('should support recursive flag', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        assetPath: 'Assets/Prefabs/Player.prefab',
        directDependencies: [],
        allDependencies: ['dep1.mat', 'dep2.png', 'dep3.shader'],
        recursiveDependencyCount: 3,
      },
    });

    const tool = new AssetDependenciesTool();
    await tool.execute(
      { path: 'Assets/Prefabs/Player.prefab', recursive: true },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('asset.dependencies', {
      path: 'Assets/Prefabs/Player.prefab',
      recursive: true,
    });
  });

  it('should support reverse dependency lookup', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        assetPath: 'Assets/Textures/stone.png',
        dependedOnBy: ['Assets/Materials/Stone.mat', 'Assets/Materials/Brick.mat'],
      },
    });

    const tool = new AssetDependenciesTool();
    await tool.execute(
      { path: 'Assets/Textures/stone.png', reverse: true },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('asset.dependencies', {
      path: 'Assets/Textures/stone.png',
      reverse: true,
    });
  });
});

describe('AssetUnusedTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new AssetUnusedTool();
    expect(tool.name).toBe('unity_asset_unused');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should find unused assets', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        unusedAssets: [
          { path: 'Assets/Textures/old_banner.png', type: 'Texture2D', sizeBytes: 524288 },
          { path: 'Assets/Materials/Deprecated.mat', type: 'Material', sizeBytes: 1024 },
        ],
        totalCount: 2,
        totalSizeBytes: 525312,
      },
    });

    const tool = new AssetUnusedTool();
    const result = await tool.execute({}, createCtx());

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.unusedAssets).toHaveLength(2);
    expect(data.totalSizeBytes).toBe(525312);
  });

  it('should filter by asset type', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { unusedAssets: [], totalCount: 0, totalSizeBytes: 0 },
    });

    const tool = new AssetUnusedTool();
    await tool.execute({ type: 'Texture2D' }, createCtx());

    expect(mockBridge.send).toHaveBeenCalledWith('asset.unused', { type: 'Texture2D' });
  });

  it('should filter by directory', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { unusedAssets: [], totalCount: 0, totalSizeBytes: 0 },
    });

    const tool = new AssetUnusedTool();
    await tool.execute({ directory: 'Assets/OldAssets' }, createCtx());

    expect(mockBridge.send).toHaveBeenCalledWith('asset.unused', {
      directory: 'Assets/OldAssets',
    });
  });
});
```

**Step 2: Implement all 3 asset search tools**

Key schemas:
- `asset.find`: `{ type?: string, name?: string, label?: string, directory?: string, maxResults?: number }`
- `asset.dependencies`: `{ path: string, recursive?: boolean, reverse?: boolean }`
- `asset.unused`: `{ type?: string, directory?: string, excludePatterns?: string[] }`

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-asset/asset-search.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-asset/asset-find.ts src/tools/unity-asset/asset-dependencies.ts src/tools/unity-asset/asset-unused.ts src/tools/unity-asset/asset-search.test.ts
git commit -m "feat: add asset find, dependencies, and unused detection tools"
```

---

### Task 2: Material tools (2 tools)

**Files:**
- Create: `src/tools/unity-asset/material-create.ts`
- Create: `src/tools/unity-asset/material-modify.ts`
- Create: `src/tools/unity-asset/material-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-asset/material-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialCreateTool } from './material-create.js';
import { MaterialModifyTool } from './material-modify.js';
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

describe('MaterialCreateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new MaterialCreateTool();
    expect(tool.name).toBe('unity_create_material');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create material with default shader', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        materialPath: 'Assets/Materials/NewMat.mat',
        shader: 'Universal Render Pipeline/Lit',
      },
    });

    const tool = new MaterialCreateTool();
    const result = await tool.execute(
      { name: 'NewMat', path: 'Assets/Materials' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('material.create', {
      name: 'NewMat',
      path: 'Assets/Materials',
    });
  });

  it('should create material with specific shader', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        materialPath: 'Assets/Materials/Glass.mat',
        shader: 'Universal Render Pipeline/Unlit',
      },
    });

    const tool = new MaterialCreateTool();
    const result = await tool.execute(
      {
        name: 'Glass',
        path: 'Assets/Materials',
        shader: 'Universal Render Pipeline/Unlit',
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('material.create', {
      name: 'Glass',
      path: 'Assets/Materials',
      shader: 'Universal Render Pipeline/Unlit',
    });
  });

  it('should support initial property values', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { materialPath: 'Assets/Materials/Red.mat' },
    });

    const tool = new MaterialCreateTool();
    await tool.execute(
      {
        name: 'Red',
        path: 'Assets/Materials',
        properties: {
          _BaseColor: { r: 1, g: 0, b: 0, a: 1 },
          _Metallic: 0.8,
          _Smoothness: 0.6,
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('material.create', {
      name: 'Red',
      path: 'Assets/Materials',
      properties: {
        _BaseColor: { r: 1, g: 0, b: 0, a: 1 },
        _Metallic: 0.8,
        _Smoothness: 0.6,
      },
    });
  });

  it('should reject in read-only mode', async () => {
    const tool = new MaterialCreateTool();
    const result = await tool.execute(
      { name: 'Test', path: 'Assets/Materials' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });
});

describe('MaterialModifyTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new MaterialModifyTool();
    expect(tool.name).toBe('unity_modify_material');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should modify material properties', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true, materialPath: 'Assets/Materials/Metal.mat' },
    });

    const tool = new MaterialModifyTool();
    const result = await tool.execute(
      {
        path: 'Assets/Materials/Metal.mat',
        properties: {
          _Metallic: 1.0,
          _Smoothness: 0.9,
        },
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('material.modify', {
      path: 'Assets/Materials/Metal.mat',
      properties: { _Metallic: 1.0, _Smoothness: 0.9 },
    });
  });

  it('should change shader', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new MaterialModifyTool();
    await tool.execute(
      {
        path: 'Assets/Materials/Effect.mat',
        shader: 'Particles/Standard Unlit',
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('material.modify', {
      path: 'Assets/Materials/Effect.mat',
      shader: 'Particles/Standard Unlit',
    });
  });

  it('should set texture property', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new MaterialModifyTool();
    await tool.execute(
      {
        path: 'Assets/Materials/Ground.mat',
        textures: {
          _BaseMap: 'Assets/Textures/ground_diffuse.png',
          _BumpMap: 'Assets/Textures/ground_normal.png',
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('material.modify', {
      path: 'Assets/Materials/Ground.mat',
      textures: {
        _BaseMap: 'Assets/Textures/ground_diffuse.png',
        _BumpMap: 'Assets/Textures/ground_normal.png',
      },
    });
  });

  it('should validate material path ends with .mat', async () => {
    const tool = new MaterialModifyTool();
    const result = await tool.execute(
      { path: 'Assets/Materials/Test.png', properties: {} },
      createCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('.mat');
  });
});
```

**Step 2: Implement both material tools**

Key schemas:
- `material.create`: `{ name: string, path: string, shader?: string, properties?: Record<string, unknown> }`
- `material.modify`: `{ path: string, shader?: string, properties?: Record<string, unknown>, textures?: Record<string, string>, keywords?: string[] }` -- path must end in `.mat`

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-asset/material-tools.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-asset/material-create.ts src/tools/unity-asset/material-modify.ts src/tools/unity-asset/material-tools.test.ts
git commit -m "feat: add material create and modify bridge tools"
```

---

### Task 3: ScriptableObject, Shader, Texture tools (3 tools)

**Files:**
- Create: `src/tools/unity-asset/scriptableobject-create.ts`
- Create: `src/tools/unity-asset/shader-analyze.ts`
- Create: `src/tools/unity-asset/texture-manage.ts`
- Create: `src/tools/unity-asset/advanced-asset.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-asset/advanced-asset.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptableObjectCreateTool } from './scriptableobject-create.js';
import { ShaderAnalyzeTool } from './shader-analyze.js';
import { TextureManageTool } from './texture-manage.js';
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

describe('ScriptableObjectCreateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new ScriptableObjectCreateTool();
    expect(tool.name).toBe('unity_create_scriptableobject');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create ScriptableObject asset', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        assetPath: 'Assets/Data/EnemyConfig.asset',
        scriptPath: 'Assets/Scripts/Data/EnemyConfig.cs',
      },
    });

    const tool = new ScriptableObjectCreateTool();
    const result = await tool.execute(
      {
        className: 'EnemyConfig',
        assetPath: 'Assets/Data',
        namespace: 'Game.Data',
        fields: [
          { name: 'health', type: 'float', defaultValue: '100' },
          { name: 'speed', type: 'float', defaultValue: '5' },
          { name: 'prefab', type: 'GameObject' },
        ],
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('scriptableobject.create', {
      className: 'EnemyConfig',
      assetPath: 'Assets/Data',
      namespace: 'Game.Data',
      fields: [
        { name: 'health', type: 'float', defaultValue: '100' },
        { name: 'speed', type: 'float', defaultValue: '5' },
        { name: 'prefab', type: 'GameObject' },
      ],
    });
  });

  it('should support createMenuName option', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { assetPath: 'Assets/Data/WeaponData.asset' },
    });

    const tool = new ScriptableObjectCreateTool();
    await tool.execute(
      {
        className: 'WeaponData',
        assetPath: 'Assets/Data',
        createMenuName: 'Game/Weapon Data',
        fields: [],
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('scriptableobject.create', {
      className: 'WeaponData',
      assetPath: 'Assets/Data',
      createMenuName: 'Game/Weapon Data',
      fields: [],
    });
  });

  it('should reject in read-only mode', async () => {
    const tool = new ScriptableObjectCreateTool();
    const result = await tool.execute(
      { className: 'Test', assetPath: 'Assets/Data', fields: [] },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('ShaderAnalyzeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new ShaderAnalyzeTool();
    expect(tool.name).toBe('unity_shader_analyze');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should analyze shader properties and variants', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        shaderName: 'Universal Render Pipeline/Lit',
        propertyCount: 24,
        properties: [
          { name: '_BaseColor', type: 'Color', description: 'Base Color' },
          { name: '_Metallic', type: 'Range', description: 'Metallic', range: [0, 1] },
          { name: '_BaseMap', type: 'Texture', description: 'Albedo' },
        ],
        variantCount: 128,
        keywords: ['_NORMALMAP', '_EMISSION', '_METALLICSPECGLOSSMAP'],
        passCount: 4,
        passes: ['ForwardLit', 'ShadowCaster', 'DepthOnly', 'Meta'],
        isSupported: true,
        renderPipeline: 'URP',
      },
    });

    const tool = new ShaderAnalyzeTool();
    const result = await tool.execute(
      { shader: 'Universal Render Pipeline/Lit' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.propertyCount).toBe(24);
    expect(data.properties).toHaveLength(3);
    expect(data.keywords).toContain('_NORMALMAP');
  });

  it('should analyze shader by path', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { shaderName: 'Custom/MyShader', propertyCount: 5, properties: [] },
    });

    const tool = new ShaderAnalyzeTool();
    await tool.execute(
      { path: 'Assets/Shaders/MyShader.shader' },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('shader.analyze', {
      path: 'Assets/Shaders/MyShader.shader',
    });
  });

  it('should find which materials use a shader', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        shaderName: 'Custom/Water',
        usedByMaterials: ['Assets/Materials/Ocean.mat', 'Assets/Materials/River.mat'],
      },
    });

    const tool = new ShaderAnalyzeTool();
    await tool.execute(
      { shader: 'Custom/Water', includeUsage: true },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('shader.analyze', {
      shader: 'Custom/Water',
      includeUsage: true,
    });
  });
});

describe('TextureManageTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new TextureManageTool();
    expect(tool.name).toBe('unity_texture_manage');
    expect(tool.metadata.category).toBe('unity-asset');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get texture import settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        path: 'Assets/Textures/player.png',
        width: 2048,
        height: 2048,
        format: 'RGBA32',
        maxSize: 2048,
        compression: 'NormalQuality',
        mipmaps: true,
        sRGB: true,
        textureType: 'Default',
        memorySizeBytes: 16777216,
      },
    });

    const tool = new TextureManageTool();
    const result = await tool.execute(
      { action: 'info', path: 'Assets/Textures/player.png' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.width).toBe(2048);
    expect(data.compression).toBe('NormalQuality');
  });

  it('should update texture import settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true, path: 'Assets/Textures/icon.png' },
    });

    const tool = new TextureManageTool();
    const result = await tool.execute(
      {
        action: 'modify',
        path: 'Assets/Textures/icon.png',
        settings: {
          maxSize: 512,
          compression: 'HighQuality',
          mipmaps: false,
          textureType: 'Sprite',
        },
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('texture.manage', {
      action: 'modify',
      path: 'Assets/Textures/icon.png',
      settings: {
        maxSize: 512,
        compression: 'HighQuality',
        mipmaps: false,
        textureType: 'Sprite',
      },
    });
  });

  it('should set platform-specific overrides', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new TextureManageTool();
    await tool.execute(
      {
        action: 'modify',
        path: 'Assets/Textures/bg.png',
        platformOverrides: {
          Android: { maxSize: 1024, format: 'ETC2_RGBA8' },
          iOS: { maxSize: 1024, format: 'ASTC_6x6' },
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('texture.manage', {
      action: 'modify',
      path: 'Assets/Textures/bg.png',
      platformOverrides: {
        Android: { maxSize: 1024, format: 'ETC2_RGBA8' },
        iOS: { maxSize: 1024, format: 'ASTC_6x6' },
      },
    });
  });

  it('should reject modify action in read-only mode', async () => {
    const tool = new TextureManageTool();
    const result = await tool.execute(
      { action: 'modify', path: 'Assets/Textures/t.png', settings: {} },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should allow info action in read-only mode', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { path: 'Assets/Textures/t.png', width: 256, height: 256 },
    });

    const tool = new TextureManageTool();
    const result = await tool.execute(
      { action: 'info', path: 'Assets/Textures/t.png' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });
});
```

**Step 2: Implement all 3 tools**

Key schemas:
- `scriptableobject.create`: `{ className: string, assetPath: string, namespace?: string, createMenuName?: string, fields: Array<{ name, type, defaultValue? }> }`
- `shader.analyze`: `{ shader?: string, path?: string, includeUsage?: boolean }` -- at least one of shader/path required
- `texture.manage`: `{ action: 'info' | 'modify', path: string, settings?: { maxSize?, compression?, mipmaps?, textureType?, sRGB? }, platformOverrides?: Record<string, {...}> }`

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-asset/advanced-asset.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-asset/scriptableobject-create.ts src/tools/unity-asset/shader-analyze.ts src/tools/unity-asset/texture-manage.ts src/tools/unity-asset/advanced-asset.test.ts
git commit -m "feat: add ScriptableObject, shader analyze, and texture manage tools"
```

---

### Task 4: Animation tools (2 tools)

**Files:**
- Create: `src/tools/unity-subsystem/animator-analyze.ts`
- Create: `src/tools/unity-subsystem/animation-manage.ts`
- Create: `src/tools/unity-subsystem/animation-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-subsystem/animation-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnimatorAnalyzeTool } from './animator-analyze.js';
import { AnimationManageTool } from './animation-manage.js';
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

describe('AnimatorAnalyzeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new AnimatorAnalyzeTool();
    expect(tool.name).toBe('unity_animator_analyze');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(true);
  });

  it('should analyze animator controller', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        controllerPath: 'Assets/Animations/PlayerAnimator.controller',
        layerCount: 2,
        layers: [
          {
            name: 'Base Layer',
            stateCount: 5,
            states: ['Idle', 'Walk', 'Run', 'Jump', 'Fall'],
            defaultState: 'Idle',
            transitionCount: 8,
          },
          {
            name: 'Upper Body',
            stateCount: 3,
            states: ['Idle', 'Attack', 'Block'],
            defaultState: 'Idle',
            transitionCount: 4,
          },
        ],
        parameters: [
          { name: 'Speed', type: 'Float' },
          { name: 'IsGrounded', type: 'Bool' },
          { name: 'JumpTrigger', type: 'Trigger' },
        ],
        totalStateCount: 8,
        totalTransitionCount: 12,
      },
    });

    const tool = new AnimatorAnalyzeTool();
    const result = await tool.execute(
      { path: 'Assets/Animations/PlayerAnimator.controller' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.layerCount).toBe(2);
    expect(data.parameters).toHaveLength(3);
    expect(data.totalStateCount).toBe(8);
  });

  it('should analyze animator on a GameObject by name', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { controllerPath: 'Assets/Animations/Enemy.controller', layerCount: 1, layers: [] },
    });

    const tool = new AnimatorAnalyzeTool();
    await tool.execute(
      { gameObjectName: 'Enemy' },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('animator.analyze', {
      gameObjectName: 'Enemy',
    });
  });
});

describe('AnimationManageTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new AnimationManageTool();
    expect(tool.name).toBe('unity_animation_manage');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create animation clip', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { clipPath: 'Assets/Animations/Clips/NewClip.anim' },
    });

    const tool = new AnimationManageTool();
    const result = await tool.execute(
      {
        action: 'create',
        name: 'NewClip',
        path: 'Assets/Animations/Clips',
        length: 1.5,
        loop: true,
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('animation.manage', {
      action: 'create',
      name: 'NewClip',
      path: 'Assets/Animations/Clips',
      length: 1.5,
      loop: true,
    });
  });

  it('should get clip info', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        clipPath: 'Assets/Animations/Clips/Walk.anim',
        length: 0.833,
        frameRate: 30,
        isLooping: true,
        curveCount: 12,
        eventCount: 2,
      },
    });

    const tool = new AnimationManageTool();
    const result = await tool.execute(
      { action: 'info', path: 'Assets/Animations/Clips/Walk.anim' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.length).toBe(0.833);
    expect(data.isLooping).toBe(true);
  });

  it('should play animation on GameObject', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { playing: true, stateName: 'Walk' },
    });

    const tool = new AnimationManageTool();
    await tool.execute(
      { action: 'play', gameObjectName: 'Player', stateName: 'Walk', layer: 0 },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('animation.manage', {
      action: 'play',
      gameObjectName: 'Player',
      stateName: 'Walk',
      layer: 0,
    });
  });

  it('should reject create in read-only mode', async () => {
    const tool = new AnimationManageTool();
    const result = await tool.execute(
      { action: 'create', name: 'Test', path: 'Assets/Animations' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should allow info in read-only mode', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { clipPath: 'test.anim', length: 1.0 },
    });

    const tool = new AnimationManageTool();
    const result = await tool.execute(
      { action: 'info', path: 'Assets/Animations/test.anim' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });
});
```

**Step 2: Implement both animation tools**

Key schemas:
- `animator.analyze`: `{ path?: string, gameObjectName?: string }` -- analyze AnimatorController asset or runtime animator on a GameObject
- `animation.manage`: `{ action: 'create' | 'info' | 'play' | 'stop' | 'setParam', ...params }` -- multi-action tool, read-only check only applies to `create`

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-subsystem/animation-tools.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-subsystem/animator-analyze.ts src/tools/unity-subsystem/animation-manage.ts src/tools/unity-subsystem/animation-tools.test.ts
git commit -m "feat: add animator analyze and animation manage tools"
```

---

### Task 5: Physics + Navigation tools (2 tools)

**Files:**
- Create: `src/tools/unity-subsystem/physics-settings.ts`
- Create: `src/tools/unity-subsystem/navmesh-manage.ts`
- Create: `src/tools/unity-subsystem/physics-nav.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-subsystem/physics-nav.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhysicsSettingsTool } from './physics-settings.js';
import { NavMeshManageTool } from './navmesh-manage.js';
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

describe('PhysicsSettingsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new PhysicsSettingsTool();
    expect(tool.name).toBe('unity_physics_settings');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get current physics settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        gravity: { x: 0, y: -9.81, z: 0 },
        defaultSolverIterations: 6,
        defaultSolverVelocityIterations: 1,
        bounceThreshold: 2,
        sleepThreshold: 0.005,
        defaultContactOffset: 0.01,
        autoSimulation: true,
        layerCollisionMatrix: {},
      },
    });

    const tool = new PhysicsSettingsTool();
    const result = await tool.execute({ action: 'get' }, createCtx());

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.gravity.y).toBe(-9.81);
    expect(data.autoSimulation).toBe(true);
  });

  it('should modify physics settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new PhysicsSettingsTool();
    const result = await tool.execute(
      {
        action: 'set',
        settings: {
          gravity: { x: 0, y: -20, z: 0 },
          defaultSolverIterations: 12,
        },
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('physics.settings', {
      action: 'set',
      settings: {
        gravity: { x: 0, y: -20, z: 0 },
        defaultSolverIterations: 12,
      },
    });
  });

  it('should support Physics2D mode', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { gravity: { x: 0, y: -9.81 } },
    });

    const tool = new PhysicsSettingsTool();
    await tool.execute(
      { action: 'get', physics2d: true },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('physics.settings', {
      action: 'get',
      physics2d: true,
    });
  });

  it('should manage layer collision matrix', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new PhysicsSettingsTool();
    await tool.execute(
      {
        action: 'setLayerCollision',
        layer1: 'Player',
        layer2: 'Projectile',
        collide: false,
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('physics.settings', {
      action: 'setLayerCollision',
      layer1: 'Player',
      layer2: 'Projectile',
      collide: false,
    });
  });

  it('should reject set action in read-only mode', async () => {
    const tool = new PhysicsSettingsTool();
    const result = await tool.execute(
      { action: 'set', settings: { gravity: { x: 0, y: -5, z: 0 } } },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should allow get action in read-only mode', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { gravity: { x: 0, y: -9.81, z: 0 } },
    });

    const tool = new PhysicsSettingsTool();
    const result = await tool.execute(
      { action: 'get' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });
});

describe('NavMeshManageTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new NavMeshManageTool();
    expect(tool.name).toBe('unity_navmesh_manage');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should bake NavMesh', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        baked: true,
        triangleCount: 5420,
        areaSize: 2500.5,
        agentTypeId: 0,
      },
    });

    const tool = new NavMeshManageTool();
    const result = await tool.execute({ action: 'bake' }, createCtx());

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.baked).toBe(true);
    expect(data.triangleCount).toBe(5420);
  });

  it('should configure bake settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { baked: true },
    });

    const tool = new NavMeshManageTool();
    await tool.execute(
      {
        action: 'bake',
        settings: {
          agentRadius: 0.5,
          agentHeight: 2,
          maxSlope: 45,
          stepHeight: 0.4,
          dropHeight: 5,
          jumpDistance: 4,
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('navmesh.manage', {
      action: 'bake',
      settings: {
        agentRadius: 0.5,
        agentHeight: 2,
        maxSlope: 45,
        stepHeight: 0.4,
        dropHeight: 5,
        jumpDistance: 4,
      },
    });
  });

  it('should get NavMesh info', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        hasMesh: true,
        triangleCount: 3000,
        agentTypes: [{ id: 0, name: 'Humanoid', radius: 0.5 }],
        areas: [{ name: 'Walkable', cost: 1 }, { name: 'NotWalkable', cost: 0 }],
      },
    });

    const tool = new NavMeshManageTool();
    const result = await tool.execute({ action: 'info' }, createCtx());

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.hasMesh).toBe(true);
  });

  it('should add NavMesh obstacle', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { added: true, gameObject: 'Wall' },
    });

    const tool = new NavMeshManageTool();
    await tool.execute(
      {
        action: 'addObstacle',
        gameObjectName: 'Wall',
        carve: true,
        shape: 'Box',
        size: { x: 2, y: 3, z: 1 },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('navmesh.manage', {
      action: 'addObstacle',
      gameObjectName: 'Wall',
      carve: true,
      shape: 'Box',
      size: { x: 2, y: 3, z: 1 },
    });
  });

  it('should reject bake in read-only mode', async () => {
    const tool = new NavMeshManageTool();
    const result = await tool.execute(
      { action: 'bake' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement both tools**

Key schemas:
- `physics.settings`: `{ action: 'get' | 'set' | 'setLayerCollision', physics2d?: boolean, settings?: {...}, layer1?: string, layer2?: string, collide?: boolean }`
- `navmesh.manage`: `{ action: 'bake' | 'info' | 'addObstacle' | 'addAgent', settings?: {...}, gameObjectName?: string, carve?: boolean, shape?: string, size?: {x,y,z} }`

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-subsystem/physics-nav.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-subsystem/physics-settings.ts src/tools/unity-subsystem/navmesh-manage.ts src/tools/unity-subsystem/physics-nav.test.ts
git commit -m "feat: add physics settings and NavMesh management tools"
```

---

### Task 6: Visual tools -- particle_system, lighting_manage (2 tools)

**Files:**
- Create: `src/tools/unity-subsystem/particle-system.ts`
- Create: `src/tools/unity-subsystem/lighting-manage.ts`
- Create: `src/tools/unity-subsystem/visual-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-subsystem/visual-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParticleSystemTool } from './particle-system.js';
import { LightingManageTool } from './lighting-manage.js';
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

describe('ParticleSystemTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new ParticleSystemTool();
    expect(tool.name).toBe('unity_particle_system');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should create particle system', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        gameObjectName: 'Explosion',
        instanceId: 12345,
      },
    });

    const tool = new ParticleSystemTool();
    const result = await tool.execute(
      {
        action: 'create',
        name: 'Explosion',
        settings: {
          duration: 2.0,
          startLifetime: 1.5,
          startSpeed: 10,
          startSize: 0.5,
          maxParticles: 500,
          simulationSpace: 'World',
        },
      },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('particle.system', {
      action: 'create',
      name: 'Explosion',
      settings: {
        duration: 2.0,
        startLifetime: 1.5,
        startSpeed: 10,
        startSize: 0.5,
        maxParticles: 500,
        simulationSpace: 'World',
      },
    });
  });

  it('should modify existing particle system', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new ParticleSystemTool();
    await tool.execute(
      {
        action: 'modify',
        gameObjectName: 'Sparks',
        modules: {
          emission: { rateOverTime: 50, bursts: [{ time: 0, count: 20 }] },
          shape: { shapeType: 'Cone', angle: 25, radius: 0.5 },
          colorOverLifetime: {
            gradient: { start: { r: 1, g: 0.8, b: 0, a: 1 }, end: { r: 1, g: 0, b: 0, a: 0 } },
          },
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('particle.system', expect.objectContaining({
      action: 'modify',
      gameObjectName: 'Sparks',
    }));
  });

  it('should get particle system info', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        gameObjectName: 'Rain',
        isPlaying: true,
        particleCount: 342,
        duration: 0,
        isLooping: true,
        maxParticles: 1000,
        enabledModules: ['Emission', 'Shape', 'ColorOverLifetime', 'SizeOverLifetime'],
      },
    });

    const tool = new ParticleSystemTool();
    const result = await tool.execute(
      { action: 'info', gameObjectName: 'Rain' },
      createCtx(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.particleCount).toBe(342);
    expect(data.enabledModules).toContain('Emission');
  });

  it('should play/stop particle system', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { playing: true },
    });

    const tool = new ParticleSystemTool();
    await tool.execute(
      { action: 'play', gameObjectName: 'Smoke' },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('particle.system', {
      action: 'play',
      gameObjectName: 'Smoke',
    });
  });

  it('should reject create in read-only mode', async () => {
    const tool = new ParticleSystemTool();
    const result = await tool.execute(
      { action: 'create', name: 'Test' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });
});

describe('LightingManageTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    const tool = new LightingManageTool();
    expect(tool.name).toBe('unity_lighting_manage');
    expect(tool.metadata.category).toBe('unity-subsystem');
    expect(tool.metadata.requiresBridge).toBe(true);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get lighting settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: {
        skybox: 'Assets/Materials/Skybox.mat',
        ambientMode: 'Skybox',
        ambientIntensity: 1.0,
        realtimeGI: false,
        bakedGI: true,
        lightmapper: 'Progressive GPU',
        environmentReflections: 'Skybox',
        lightCount: 3,
        lights: [
          { name: 'Sun', type: 'Directional', intensity: 1.0, color: { r: 1, g: 0.96, b: 0.84 } },
          { name: 'Fill', type: 'Point', intensity: 0.5, range: 10 },
          { name: 'Rim', type: 'Spot', intensity: 0.8, spotAngle: 30 },
        ],
      },
    });

    const tool = new LightingManageTool();
    const result = await tool.execute({ action: 'info' }, createCtx());

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content);
    expect(data.lightCount).toBe(3);
    expect(data.bakedGI).toBe(true);
  });

  it('should bake lighting', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { baking: true, estimated: '2 minutes' },
    });

    const tool = new LightingManageTool();
    const result = await tool.execute({ action: 'bake' }, createCtx());

    expect(result.isError).toBeFalsy();
    expect(mockBridge.send).toHaveBeenCalledWith('lighting.manage', { action: 'bake' });
  });

  it('should modify lighting settings', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new LightingManageTool();
    await tool.execute(
      {
        action: 'set',
        settings: {
          ambientMode: 'Flat',
          ambientColor: { r: 0.2, g: 0.2, b: 0.3, a: 1 },
          bakedGI: false,
          realtimeGI: true,
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('lighting.manage', {
      action: 'set',
      settings: {
        ambientMode: 'Flat',
        ambientColor: { r: 0.2, g: 0.2, b: 0.3, a: 1 },
        bakedGI: false,
        realtimeGI: true,
      },
    });
  });

  it('should configure post-processing volume', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { modified: true },
    });

    const tool = new LightingManageTool();
    await tool.execute(
      {
        action: 'postProcessing',
        gameObjectName: 'GlobalVolume',
        overrides: {
          bloom: { intensity: 0.5, threshold: 1.0 },
          colorAdjustments: { contrast: 10, saturation: 5 },
          vignette: { intensity: 0.3 },
        },
      },
      createCtx(),
    );

    expect(mockBridge.send).toHaveBeenCalledWith('lighting.manage', expect.objectContaining({
      action: 'postProcessing',
      gameObjectName: 'GlobalVolume',
    }));
  });

  it('should reject bake in read-only mode', async () => {
    const tool = new LightingManageTool();
    const result = await tool.execute(
      { action: 'bake' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBe(true);
  });

  it('should allow info in read-only mode', async () => {
    mockBridge.send.mockResolvedValueOnce({
      success: true,
      data: { lightCount: 1, lights: [] },
    });

    const tool = new LightingManageTool();
    const result = await tool.execute(
      { action: 'info' },
      createCtx({ readOnly: true }),
    );
    expect(result.isError).toBeFalsy();
  });
});
```

**Step 2: Implement both visual tools**

Key schemas:
- `particle.system`: `{ action: 'create' | 'modify' | 'info' | 'play' | 'stop', name?: string, gameObjectName?: string, settings?: {...}, modules?: {...} }`
- `lighting.manage`: `{ action: 'info' | 'set' | 'bake' | 'postProcessing', settings?: {...}, gameObjectName?: string, overrides?: {...} }`

Read-only check: `info` actions are always allowed; `create`, `modify`, `set`, `bake`, `postProcessing` are write operations.

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-subsystem/visual-tools.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/unity-subsystem/particle-system.ts src/tools/unity-subsystem/lighting-manage.ts src/tools/unity-subsystem/visual-tools.test.ts
git commit -m "feat: add particle system and lighting management tools"
```

---

### Task 7: Barrel exports + register all 14 tools + integration tests

**Files:**
- Create: `src/tools/unity-asset/index.ts`
- Create: `src/tools/unity-subsystem/index.ts`
- Update: tool registration in server setup
- Create: `src/tools/unity-asset/integration.test.ts`
- Create: `src/tools/unity-subsystem/integration.test.ts`

**Step 1: Create barrel exports**

```typescript
// src/tools/unity-asset/index.ts
export { AssetFindTool } from './asset-find.js';
export { AssetDependenciesTool } from './asset-dependencies.js';
export { AssetUnusedTool } from './asset-unused.js';
export { MaterialCreateTool } from './material-create.js';
export { MaterialModifyTool } from './material-modify.js';
export { ScriptableObjectCreateTool } from './scriptableobject-create.js';
export { ShaderAnalyzeTool } from './shader-analyze.js';
export { TextureManageTool } from './texture-manage.js';
```

```typescript
// src/tools/unity-subsystem/index.ts
export { AnimatorAnalyzeTool } from './animator-analyze.js';
export { AnimationManageTool } from './animation-manage.js';
export { PhysicsSettingsTool } from './physics-settings.js';
export { NavMeshManageTool } from './navmesh-manage.js';
export { ParticleSystemTool } from './particle-system.js';
export { LightingManageTool } from './lighting-manage.js';
```

**Step 2: Write integration tests**

```typescript
// src/tools/unity-asset/integration.test.ts
import { describe, it, expect } from 'vitest';
import {
  AssetFindTool,
  AssetDependenciesTool,
  AssetUnusedTool,
  MaterialCreateTool,
  MaterialModifyTool,
  ScriptableObjectCreateTool,
  ShaderAnalyzeTool,
  TextureManageTool,
} from './index.js';
import { ToolRegistry } from '../tool-registry.js';

describe('Phase 10 Asset Integration', () => {
  it('should register all 8 asset tools without conflicts', () => {
    const registry = new ToolRegistry();
    const tools = [
      new AssetFindTool(),
      new AssetDependenciesTool(),
      new AssetUnusedTool(),
      new MaterialCreateTool(),
      new MaterialModifyTool(),
      new ScriptableObjectCreateTool(),
      new ShaderAnalyzeTool(),
      new TextureManageTool(),
    ];

    for (const tool of tools) {
      registry.register(tool);
    }

    expect(registry.getAll()).toHaveLength(8);
    expect(registry.getByCategory('unity-asset')).toHaveLength(8);
  });

  it('all tools should require bridge', () => {
    const tools = [
      new AssetFindTool(),
      new AssetDependenciesTool(),
      new AssetUnusedTool(),
      new MaterialCreateTool(),
      new MaterialModifyTool(),
      new ScriptableObjectCreateTool(),
      new ShaderAnalyzeTool(),
      new TextureManageTool(),
    ];

    for (const tool of tools) {
      expect(tool.metadata.requiresBridge).toBe(true);
    }
  });

  it('should have correct read-only flags', () => {
    const readOnlyTools = [
      new AssetFindTool(),
      new AssetDependenciesTool(),
      new AssetUnusedTool(),
      new ShaderAnalyzeTool(),
    ];
    for (const tool of readOnlyTools) {
      expect(tool.metadata.readOnly).toBe(true);
    }

    const writeTools = [
      new MaterialCreateTool(),
      new MaterialModifyTool(),
      new ScriptableObjectCreateTool(),
      new TextureManageTool(),
    ];
    for (const tool of writeTools) {
      expect(tool.metadata.readOnly).toBe(false);
    }
  });

  it('all tools should have valid Zod input schemas', () => {
    const tools = [
      new AssetFindTool(),
      new AssetDependenciesTool(),
      new AssetUnusedTool(),
      new MaterialCreateTool(),
      new MaterialModifyTool(),
      new ScriptableObjectCreateTool(),
      new ShaderAnalyzeTool(),
      new TextureManageTool(),
    ];

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
```

```typescript
// src/tools/unity-subsystem/integration.test.ts
import { describe, it, expect } from 'vitest';
import {
  AnimatorAnalyzeTool,
  AnimationManageTool,
  PhysicsSettingsTool,
  NavMeshManageTool,
  ParticleSystemTool,
  LightingManageTool,
} from './index.js';
import { ToolRegistry } from '../tool-registry.js';

describe('Phase 10 Subsystem Integration', () => {
  it('should register all 6 subsystem tools without conflicts', () => {
    const registry = new ToolRegistry();
    const tools = [
      new AnimatorAnalyzeTool(),
      new AnimationManageTool(),
      new PhysicsSettingsTool(),
      new NavMeshManageTool(),
      new ParticleSystemTool(),
      new LightingManageTool(),
    ];

    for (const tool of tools) {
      registry.register(tool);
    }

    expect(registry.getAll()).toHaveLength(6);
    expect(registry.getByCategory('unity-subsystem')).toHaveLength(6);
  });

  it('all tools should require bridge', () => {
    const tools = [
      new AnimatorAnalyzeTool(),
      new AnimationManageTool(),
      new PhysicsSettingsTool(),
      new NavMeshManageTool(),
      new ParticleSystemTool(),
      new LightingManageTool(),
    ];

    for (const tool of tools) {
      expect(tool.metadata.requiresBridge).toBe(true);
    }
  });

  it('should have correct read-only flags', () => {
    // AnimatorAnalyzeTool is purely read-only
    const analyzer = new AnimatorAnalyzeTool();
    expect(analyzer.metadata.readOnly).toBe(true);

    // All others are read-write (they have both read and write actions)
    const writeTools = [
      new AnimationManageTool(),
      new PhysicsSettingsTool(),
      new NavMeshManageTool(),
      new ParticleSystemTool(),
      new LightingManageTool(),
    ];
    for (const tool of writeTools) {
      expect(tool.metadata.readOnly).toBe(false);
    }
  });

  it('all 14 Phase 10 tools should coexist in a single registry', () => {
    const registry = new ToolRegistry();
    const allTools = [
      // Asset tools (8)
      new (await import('../unity-asset/index.js')).AssetFindTool(),
      new (await import('../unity-asset/index.js')).AssetDependenciesTool(),
      new (await import('../unity-asset/index.js')).AssetUnusedTool(),
      new (await import('../unity-asset/index.js')).MaterialCreateTool(),
      new (await import('../unity-asset/index.js')).MaterialModifyTool(),
      new (await import('../unity-asset/index.js')).ScriptableObjectCreateTool(),
      new (await import('../unity-asset/index.js')).ShaderAnalyzeTool(),
      new (await import('../unity-asset/index.js')).TextureManageTool(),
      // Subsystem tools (6)
      new AnimatorAnalyzeTool(),
      new AnimationManageTool(),
      new PhysicsSettingsTool(),
      new NavMeshManageTool(),
      new ParticleSystemTool(),
      new LightingManageTool(),
    ];

    for (const tool of allTools) {
      registry.register(tool);
    }

    expect(registry.getAll()).toHaveLength(14);
    expect(registry.getByCategory('unity-asset')).toHaveLength(8);
    expect(registry.getByCategory('unity-subsystem')).toHaveLength(6);
  });
});
```

**Step 3: Run all Phase 10 tests**

Run: `npx vitest run src/tools/unity-asset/ src/tools/unity-subsystem/`
Expected: ALL PASS

**Step 4: Run full quality gates**

```bash
npx tsc --noEmit
npx vitest run
```

**Step 5: Commit and push**

```bash
git add src/tools/unity-asset/ src/tools/unity-subsystem/
git commit -m "feat: register all 14 asset and subsystem tools + integration tests"
git push origin main
```

**Phase 10 complete.** Deliverables:
- 3 asset search tools: find_assets, asset_dependencies, asset_unused
- 2 material tools: create_material, modify_material
- 3 advanced asset tools: create_scriptableobject, shader_analyze, texture_manage
- 2 animation tools: animator_analyze, animation_manage
- 2 physics/nav tools: physics_settings, navmesh_manage
- 2 visual tools: particle_system, lighting_manage
- All 14 tools use bridge, Zod validation, read-only checks
- ~70 new tests passing (cumulative ~265)
