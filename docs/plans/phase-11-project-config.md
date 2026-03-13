# Phase 11: Unity Project Config Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 4 Unity project configuration tools — package management, assembly definitions, project settings, and editor script scaffolding. These tools manage Unity's project-level configuration files and metadata.

**Architecture:** Two file-based tools (asmdef, editor script) and two hybrid tools (package management uses bridge when available with file fallback, project settings uses YAML parsing for file-level access and bridge for runtime). All tools use path-guard for directory traversal prevention.

**Tech Stack:** TypeScript, zod, fs/promises, JSON parsing (manifest.json, .asmdef), YAML line-based parsing (ProjectSettings/*.asset)

**Depends on:** Phase 10 (Unity Subsystem Tools)

---

### Task 1: Package management tool (unity_package_manage)

**Files:**
- Create: `src/tools/unity-config/package-manage.ts`
- Create: `src/tools/unity-config/package-manage.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-config/package-manage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PackageManageTool } from './package-manage.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('PackageManageTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: PackageManageTool;

  const sampleManifest = {
    dependencies: {
      'com.unity.textmeshpro': '3.0.6',
      'com.unity.timeline': '1.7.6',
      'com.unity.ugui': '1.0.0',
    },
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'Packages'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'Packages/manifest.json'),
      JSON.stringify(sampleManifest, null, 2),
    );
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
    tool = new PackageManageTool();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_package_manage');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should list installed packages', async () => {
    const result = await tool.execute({ action: 'list' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('com.unity.textmeshpro');
    expect(result.content).toContain('3.0.6');
    expect(result.content).toContain('com.unity.timeline');
  });

  it('should add a package', async () => {
    const result = await tool.execute(
      { action: 'add', packageId: 'com.unity.inputsystem', version: '1.7.0' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const manifest = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'Packages/manifest.json'), 'utf-8'),
    );
    expect(manifest.dependencies['com.unity.inputsystem']).toBe('1.7.0');
  });

  it('should add a package without explicit version', async () => {
    const result = await tool.execute(
      { action: 'add', packageId: 'com.unity.inputsystem' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const manifest = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'Packages/manifest.json'), 'utf-8'),
    );
    expect(manifest.dependencies['com.unity.inputsystem']).toBeDefined();
  });

  it('should remove a package', async () => {
    const result = await tool.execute(
      { action: 'remove', packageId: 'com.unity.textmeshpro' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const manifest = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'Packages/manifest.json'), 'utf-8'),
    );
    expect(manifest.dependencies['com.unity.textmeshpro']).toBeUndefined();
  });

  it('should reject removing non-existent package', async () => {
    const result = await tool.execute(
      { action: 'remove', packageId: 'com.nonexistent.package' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('should search packages by keyword', async () => {
    const result = await tool.execute(
      { action: 'search', packageId: 'unity' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    // Search returns installed packages matching the keyword
    expect(result.content).toContain('com.unity');
  });

  it('should reject add in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'add', packageId: 'com.unity.inputsystem' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject remove in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'remove', packageId: 'com.unity.textmeshpro' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should require packageId for add action', async () => {
    const result = await tool.execute({ action: 'add' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should handle missing manifest.json', async () => {
    await fs.rm(path.join(tmpDir, 'Packages/manifest.json'));
    const result = await tool.execute({ action: 'list' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('manifest.json');
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/unity-config/package-manage.ts
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { validatePath } from '../../security/path-guard.js';

const inputSchema = z.object({
  action: z.enum(['add', 'remove', 'search', 'list']),
  packageId: z.string().optional(),
  version: z.string().optional(),
});

export class PackageManageTool implements ITool {
  readonly name = 'unity_package_manage';
  readonly description =
    'Manage Unity packages via UPM. Add, remove, search, or list packages in the project manifest.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'remove', 'search', 'list'],
        description: 'Package operation to perform',
      },
      packageId: {
        type: 'string',
        description: 'Package identifier (e.g. com.unity.inputsystem). Required for add/remove.',
      },
      version: {
        type: 'string',
        description: 'Package version (e.g. 1.7.0). Optional for add — defaults to latest.',
      },
    },
    required: ['action'],
  };
  readonly metadata: ToolMetadata = {
    category: 'unity-config',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const { action, packageId, version } = parsed.data;
    const manifestPath = validatePath('Packages/manifest.json', context.projectPath);

    if ((action === 'add' || action === 'remove') && context.readOnly) {
      return { content: 'Cannot modify packages in read-only mode', isError: true };
    }

    if ((action === 'add' || action === 'remove') && !packageId) {
      return { content: `packageId is required for ${action} action`, isError: true };
    }

    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      const deps: Record<string, string> = manifest.dependencies ?? {};

      switch (action) {
        case 'list': {
          const entries = Object.entries(deps);
          if (entries.length === 0) return { content: 'No packages installed.' };
          const lines = entries.map(([id, ver]) => `  ${id}@${ver}`).join('\n');
          return { content: `Installed packages (${entries.length}):\n${lines}` };
        }

        case 'search': {
          const keyword = (packageId ?? '').toLowerCase();
          const matches = Object.entries(deps).filter(([id]) =>
            id.toLowerCase().includes(keyword),
          );
          if (matches.length === 0) return { content: `No packages matching "${keyword}".` };
          const lines = matches.map(([id, ver]) => `  ${id}@${ver}`).join('\n');
          return { content: `Matching packages (${matches.length}):\n${lines}` };
        }

        case 'add': {
          const ver = version ?? 'latest';
          deps[packageId!] = ver;
          manifest.dependencies = deps;
          await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
          return {
            content: `Added ${packageId}@${ver} to manifest.json`,
            metadata: { filesAffected: [manifestPath] },
          };
        }

        case 'remove': {
          if (!(packageId! in deps)) {
            return { content: `Package "${packageId}" not found in manifest`, isError: true };
          }
          const removedVersion = deps[packageId!];
          delete deps[packageId!];
          manifest.dependencies = deps;
          await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
          return {
            content: `Removed ${packageId}@${removedVersion} from manifest.json`,
            metadata: { filesAffected: [manifestPath] },
          };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ENOENT')) {
        return { content: 'Packages/manifest.json not found — is this a Unity project?', isError: true };
      }
      return { content: `Package operation failed: ${message}`, isError: true };
    }
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-config/package-manage.test.ts`
Expected: PASS (11 tests)

**Step 4: Commit**

```bash
git add src/tools/unity-config/package-manage.*
git commit -m "feat: add unity_package_manage tool with UPM manifest operations"
```

---

### Task 2: Assembly definition tool (unity_asmdef_manage)

**Files:**
- Create: `src/tools/unity-config/asmdef-manage.ts`
- Create: `src/tools/unity-config/asmdef-manage.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-config/asmdef-manage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AsmdefManageTool } from './asmdef-manage.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('AsmdefManageTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: AsmdefManageTool;

  const sampleAsmdef = {
    name: 'Game.Core',
    rootNamespace: 'Game.Core',
    references: ['Strada.Core'],
    includePlatforms: [],
    excludePlatforms: [],
    allowUnsafeCode: false,
    overrideReferences: false,
    precompiledReferences: [],
    autoReferenced: true,
    defineConstraints: [],
    versionDefines: [],
    noEngineReferences: false,
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'Assets/Scripts/Core'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'Assets/Scripts/Core/Game.Core.asmdef'),
      JSON.stringify(sampleAsmdef, null, 2),
    );
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
    tool = new AsmdefManageTool();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_asmdef_manage');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should read existing asmdef', async () => {
    const result = await tool.execute(
      { action: 'read', path: 'Assets/Scripts/Core/Game.Core.asmdef' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Game.Core');
    expect(result.content).toContain('Strada.Core');
  });

  it('should create a new asmdef', async () => {
    const result = await tool.execute(
      {
        action: 'create',
        path: 'Assets/Scripts/UI',
        name: 'Game.UI',
        references: ['Game.Core', 'Strada.Core'],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const created = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'Assets/Scripts/UI/Game.UI.asmdef'), 'utf-8'),
    );
    expect(created.name).toBe('Game.UI');
    expect(created.references).toContain('Game.Core');
    expect(created.references).toContain('Strada.Core');
    expect(created.rootNamespace).toBe('Game.UI');
  });

  it('should update asmdef references', async () => {
    const result = await tool.execute(
      {
        action: 'update',
        path: 'Assets/Scripts/Core/Game.Core.asmdef',
        references: ['Strada.Core', 'Game.Shared'],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const updated = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, 'Assets/Scripts/Core/Game.Core.asmdef'),
        'utf-8',
      ),
    );
    expect(updated.references).toContain('Game.Shared');
    expect(updated.references).toContain('Strada.Core');
  });

  it('should update asmdef platforms', async () => {
    const result = await tool.execute(
      {
        action: 'update',
        path: 'Assets/Scripts/Core/Game.Core.asmdef',
        platforms: ['Editor'],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const updated = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, 'Assets/Scripts/Core/Game.Core.asmdef'),
        'utf-8',
      ),
    );
    expect(updated.includePlatforms).toContain('Editor');
  });

  it('should delete an asmdef', async () => {
    const result = await tool.execute(
      { action: 'delete', path: 'Assets/Scripts/Core/Game.Core.asmdef' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    await expect(
      fs.access(path.join(tmpDir, 'Assets/Scripts/Core/Game.Core.asmdef')),
    ).rejects.toThrow();
  });

  it('should detect circular references on create', async () => {
    // Create A referencing B
    await tool.execute(
      {
        action: 'create',
        path: 'Assets/Scripts/A',
        name: 'A',
        references: ['B'],
      },
      ctx,
    );
    // Create B referencing A — circular
    const result = await tool.execute(
      {
        action: 'create',
        path: 'Assets/Scripts/B',
        name: 'B',
        references: ['A'],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('circular');
  });

  it('should reject create in read-only mode', async () => {
    const result = await tool.execute(
      { action: 'create', path: 'Assets', name: 'Test' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject create without name', async () => {
    const result = await tool.execute(
      { action: 'create', path: 'Assets' },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it('should reject read of non-existent asmdef', async () => {
    const result = await tool.execute(
      { action: 'read', path: 'Assets/NonExistent.asmdef' },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it('should validate asmdef JSON schema on create', async () => {
    const result = await tool.execute(
      {
        action: 'create',
        path: 'Assets/Scripts/Valid',
        name: 'Valid.Assembly',
        references: ['Strada.Core'],
        platforms: ['Editor', 'Android', 'iOS'],
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const created = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, 'Assets/Scripts/Valid/Valid.Assembly.asmdef'),
        'utf-8',
      ),
    );
    // Verify complete asmdef schema
    expect(created).toHaveProperty('name');
    expect(created).toHaveProperty('rootNamespace');
    expect(created).toHaveProperty('references');
    expect(created).toHaveProperty('includePlatforms');
    expect(created).toHaveProperty('excludePlatforms');
    expect(created).toHaveProperty('allowUnsafeCode');
    expect(created).toHaveProperty('autoReferenced');
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/unity-config/asmdef-manage.ts
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { validatePath } from '../../security/path-guard.js';

const inputSchema = z.object({
  action: z.enum(['create', 'read', 'update', 'delete']),
  path: z.string(),
  name: z.string().optional(),
  references: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
});

interface AsmdefJson {
  name: string;
  rootNamespace: string;
  references: string[];
  includePlatforms: string[];
  excludePlatforms: string[];
  allowUnsafeCode: boolean;
  overrideReferences: boolean;
  precompiledReferences: string[];
  autoReferenced: boolean;
  defineConstraints: string[];
  versionDefines: unknown[];
  noEngineReferences: boolean;
}

export class AsmdefManageTool implements ITool {
  readonly name = 'unity_asmdef_manage';
  readonly description =
    'Manage Unity assembly definitions (.asmdef). Create, read, update, or delete asmdef files with reference cycle validation.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'read', 'update', 'delete'],
        description: 'CRUD operation',
      },
      path: {
        type: 'string',
        description: 'Path to asmdef file (for read/update/delete) or directory (for create)',
      },
      name: {
        type: 'string',
        description: 'Assembly name (required for create)',
      },
      references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Assembly references',
      },
      platforms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Include platforms (empty = all)',
      },
    },
    required: ['action', 'path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'unity-config',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Zod parse, path-guard, read-only check
    // For create: build AsmdefJson, scan existing .asmdef files, detect circular references
    // For read: parse and pretty-print the asmdef
    // For update: merge references/platforms into existing asmdef
    // For delete: remove file after path validation
    // Circular reference detection: build adjacency graph from all .asmdef files in project,
    // then DFS to detect cycles including the new/updated references
  }

  private createDefaultAsmdef(name: string, references: string[], platforms: string[]): AsmdefJson {
    return {
      name,
      rootNamespace: name,
      references,
      includePlatforms: platforms,
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    };
  }

  private async detectCircularReferences(
    projectPath: string,
    newName: string,
    newRefs: string[],
  ): Promise<string | null> {
    // 1. Glob all .asmdef files in project
    // 2. Parse each to build adjacency map: name -> references[]
    // 3. Add/update the new entry
    // 4. DFS from newName following references; if we revisit newName, return cycle path
    // Returns null if no cycle, or cycle description string if found
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-config/asmdef-manage.test.ts`
Expected: PASS (11 tests)

**Step 4: Commit**

```bash
git add src/tools/unity-config/asmdef-manage.*
git commit -m "feat: add unity_asmdef_manage tool with circular reference detection"
```

---

### Task 3: Project settings tool (unity_project_settings)

**Files:**
- Create: `src/tools/unity-config/project-settings.ts`
- Create: `src/tools/unity-config/project-settings.test.ts`
- Create: `src/utils/unity-yaml.ts`
- Create: `src/utils/unity-yaml.test.ts`

**Step 1: Write the YAML utility test**

Unity ProjectSettings files use a YAML-like format (with `%YAML 1.1` and `%TAG !u!` headers). This utility handles reading and writing key-value pairs from those files.

```typescript
// src/utils/unity-yaml.test.ts
import { describe, it, expect } from 'vitest';
import { parseUnityYaml, setUnityYamlValue, getUnityYamlValue } from './unity-yaml.js';

describe('UnityYaml', () => {
  const sampleTagManager = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!78 &1
TagManager:
  serializedVersion: 2
  tags:
  - Player
  - Enemy
  layers:
  - Default
  - TransparentFX
  - Ignore Raycast
  - ""
  - Water
  - UI`;

  it('should parse tags from TagManager', () => {
    const result = parseUnityYaml(sampleTagManager);
    expect(result.TagManager.tags).toEqual(['Player', 'Enemy']);
  });

  it('should parse layers from TagManager', () => {
    const result = parseUnityYaml(sampleTagManager);
    expect(result.TagManager.layers).toContain('Default');
    expect(result.TagManager.layers).toContain('Water');
  });

  it('should get nested value', () => {
    const result = parseUnityYaml(sampleTagManager);
    const tags = getUnityYamlValue(result, 'TagManager.tags');
    expect(tags).toEqual(['Player', 'Enemy']);
  });

  it('should set value and produce valid output', () => {
    const result = parseUnityYaml(sampleTagManager);
    const updated = setUnityYamlValue(result, 'TagManager.tags', ['Player', 'Enemy', 'NPC']);
    expect(updated.TagManager.tags).toEqual(['Player', 'Enemy', 'NPC']);
  });
});
```

**Step 2: Write the YAML utility implementation**

```typescript
// src/utils/unity-yaml.ts
// Lightweight Unity YAML parser — handles ProjectSettings/*.asset files
// NOT a full YAML parser — only supports the subset Unity uses
// Handles: scalar values, arrays (- item), nested objects (indentation-based)
// Skips: %YAML header, %TAG header, --- document separator
```

**Step 3: Write the project settings tool test**

```typescript
// src/tools/unity-config/project-settings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectSettingsTool } from './project-settings.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('ProjectSettingsTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: ProjectSettingsTool;

  const tagManagerContent = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!78 &1
TagManager:
  serializedVersion: 2
  tags:
  - Player
  - Enemy
  layers:
  - Default
  - TransparentFX
  - Ignore Raycast
  - ""
  - Water
  - UI
  - ""
  - ""`;

  const playerSettingsContent = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!129 &1
PlayerSettings:
  productName: MyGame
  companyName: MyCompany
  defaultScreenWidth: 1920
  defaultScreenHeight: 1080
  bundleVersion: 1.0.0
  bundleIdentifier: com.mycompany.mygame`;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'ProjectSettings'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'ProjectSettings/TagManager.asset'),
      tagManagerContent,
    );
    await fs.writeFile(
      path.join(tmpDir, 'ProjectSettings/ProjectSettings.asset'),
      playerSettingsContent,
    );
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
    tool = new ProjectSettingsTool();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_project_settings');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should get tags', async () => {
    const result = await tool.execute(
      { category: 'tags', action: 'get' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Player');
    expect(result.content).toContain('Enemy');
  });

  it('should set tags', async () => {
    const result = await tool.execute(
      { category: 'tags', action: 'set', values: ['Player', 'Enemy', 'NPC', 'Pickup'] },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const content = await fs.readFile(
      path.join(tmpDir, 'ProjectSettings/TagManager.asset'),
      'utf-8',
    );
    expect(content).toContain('NPC');
    expect(content).toContain('Pickup');
  });

  it('should get layers', async () => {
    const result = await tool.execute(
      { category: 'layers', action: 'get' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Default');
    expect(result.content).toContain('Water');
  });

  it('should get player settings', async () => {
    const result = await tool.execute(
      { category: 'player', action: 'get' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('MyGame');
    expect(result.content).toContain('MyCompany');
    expect(result.content).toContain('com.mycompany.mygame');
  });

  it('should set player settings', async () => {
    const result = await tool.execute(
      {
        category: 'player',
        action: 'set',
        values: { productName: 'NewGame', companyName: 'NewCompany' },
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('NewGame');
  });

  it('should reject set in read-only mode', async () => {
    const result = await tool.execute(
      { category: 'tags', action: 'set', values: ['Test'] },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should handle missing ProjectSettings directory', async () => {
    await fs.rm(path.join(tmpDir, 'ProjectSettings'), { recursive: true });
    const result = await tool.execute(
      { category: 'tags', action: 'get' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('should reject invalid category', async () => {
    const result = await tool.execute(
      { category: 'invalid', action: 'get' },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});
```

**Step 4: Write implementation**

```typescript
// src/tools/unity-config/project-settings.ts
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { validatePath } from '../../security/path-guard.js';
import { parseUnityYaml, setUnityYamlValue, serializeUnityYaml } from '../../utils/unity-yaml.js';

const inputSchema = z.object({
  category: z.enum(['tags', 'layers', 'input', 'quality', 'player']),
  action: z.enum(['get', 'set']),
  values: z.union([z.array(z.string()), z.record(z.string())]).optional(),
});

export class ProjectSettingsTool implements ITool {
  readonly name = 'unity_project_settings';
  readonly description =
    'Read or modify Unity project settings: tags, layers, input axes, quality levels, and player settings. Uses ProjectSettings/*.asset YAML files.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['tags', 'layers', 'input', 'quality', 'player'],
        description: 'Settings category',
      },
      action: {
        type: 'string',
        enum: ['get', 'set'],
        description: 'Read or write',
      },
      values: {
        description: 'Values to set. Array for tags/layers, object for player settings.',
      },
    },
    required: ['category', 'action'],
  };
  readonly metadata: ToolMetadata = {
    category: 'unity-config',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  // Category -> settings file mapping
  private readonly categoryFileMap: Record<string, string> = {
    tags: 'ProjectSettings/TagManager.asset',
    layers: 'ProjectSettings/TagManager.asset',
    input: 'ProjectSettings/InputManager.asset',
    quality: 'ProjectSettings/QualitySettings.asset',
    player: 'ProjectSettings/ProjectSettings.asset',
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Zod parse
    // 2. Read-only check for set actions
    // 3. Resolve settings file path via categoryFileMap
    // 4. Parse Unity YAML
    // 5. For get: extract and format the relevant section
    // 6. For set: update values, serialize back to Unity YAML, write file
  }
}
```

**Security considerations:**
- Path guard prevents writing outside project directory
- Read-only mode blocks all set operations
- Layer indices 0-7 are Unity built-in and cannot be modified; tool warns if user attempts to overwrite them

**Step 5: Run tests**

Run: `npx vitest run src/utils/unity-yaml.test.ts src/tools/unity-config/project-settings.test.ts`
Expected: PASS (12+ tests)

**Step 6: Commit**

```bash
git add src/utils/unity-yaml.* src/tools/unity-config/project-settings.*
git commit -m "feat: add unity_project_settings tool with Unity YAML parser"
```

---

### Task 4: Editor script scaffolding tool (unity_editor_script_create)

**Files:**
- Create: `src/tools/unity-config/editor-script-create.ts`
- Create: `src/tools/unity-config/editor-script-create.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/unity-config/editor-script-create.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorScriptCreateTool } from './editor-script-create.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('EditorScriptCreateTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;
  let tool: EditorScriptCreateTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    ctx = {
      projectPath: tmpDir,
      workingDirectory: tmpDir,
      readOnly: false,
      unityBridgeConnected: false,
    };
    tool = new EditorScriptCreateTool();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('unity_editor_script_create');
    expect(tool.metadata.category).toBe('unity-config');
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.metadata.readOnly).toBe(false);
  });

  it('should generate CustomEditor script', async () => {
    const result = await tool.execute(
      {
        type: 'CustomEditor',
        targetType: 'HealthComponent',
        path: 'Assets/Editor',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Editor/HealthComponentEditor.cs'),
      'utf-8',
    );
    expect(file).toContain('using UnityEditor;');
    expect(file).toContain('using UnityEngine;');
    expect(file).toContain('[CustomEditor(typeof(HealthComponent))]');
    expect(file).toContain('public class HealthComponentEditor : Editor');
    expect(file).toContain('public override void OnInspectorGUI()');
  });

  it('should generate PropertyDrawer script', async () => {
    const result = await tool.execute(
      {
        type: 'PropertyDrawer',
        targetType: 'RangeAttribute',
        path: 'Assets/Editor',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Editor/RangeAttributeDrawer.cs'),
      'utf-8',
    );
    expect(file).toContain('[CustomPropertyDrawer(typeof(RangeAttribute))]');
    expect(file).toContain('public class RangeAttributeDrawer : PropertyDrawer');
    expect(file).toContain('OnGUI(Rect position, SerializedProperty property, GUIContent label)');
  });

  it('should generate EditorWindow script', async () => {
    const result = await tool.execute(
      {
        type: 'EditorWindow',
        windowTitle: 'Level Editor',
        menuPath: 'Tools/Level Editor',
        path: 'Assets/Editor',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Editor/LevelEditorWindow.cs'),
      'utf-8',
    );
    expect(file).toContain('public class LevelEditorWindow : EditorWindow');
    expect(file).toContain('[MenuItem("Tools/Level Editor")]');
    expect(file).toContain('GetWindow<LevelEditorWindow>');
    expect(file).toContain('"Level Editor"');
    expect(file).toContain('void OnGUI()');
  });

  it('should generate ScriptableWizard script', async () => {
    const result = await tool.execute(
      {
        type: 'ScriptableWizard',
        windowTitle: 'Create Prefab',
        menuPath: 'Tools/Create Prefab',
        path: 'Assets/Editor',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Editor/CreatePrefabWizard.cs'),
      'utf-8',
    );
    expect(file).toContain('public class CreatePrefabWizard : ScriptableWizard');
    expect(file).toContain('[MenuItem("Tools/Create Prefab")]');
    expect(file).toContain('DisplayWizard<CreatePrefabWizard>');
    expect(file).toContain('void OnWizardCreate()');
  });

  it('should require targetType for CustomEditor', async () => {
    const result = await tool.execute(
      { type: 'CustomEditor', path: 'Assets/Editor' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('targetType');
  });

  it('should require targetType for PropertyDrawer', async () => {
    const result = await tool.execute(
      { type: 'PropertyDrawer', path: 'Assets/Editor' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('targetType');
  });

  it('should provide default menuPath for EditorWindow', async () => {
    const result = await tool.execute(
      {
        type: 'EditorWindow',
        windowTitle: 'My Tool',
        path: 'Assets/Editor',
      },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Editor/MyToolWindow.cs'),
      'utf-8',
    );
    expect(file).toContain('[MenuItem("Window/My Tool")]');
  });

  it('should reject in read-only mode', async () => {
    const result = await tool.execute(
      { type: 'EditorWindow', windowTitle: 'Test', path: 'Assets/Editor' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should reject path traversal', async () => {
    const result = await tool.execute(
      {
        type: 'EditorWindow',
        windowTitle: 'Evil',
        path: '../../etc',
      },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Write implementation**

```typescript
// src/tools/unity-config/editor-script-create.ts
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { validatePath } from '../../security/path-guard.js';

const inputSchema = z.object({
  type: z.enum(['CustomEditor', 'PropertyDrawer', 'EditorWindow', 'ScriptableWizard']),
  targetType: z.string().optional(),
  menuPath: z.string().optional(),
  windowTitle: z.string().optional(),
  path: z.string(),
});

export class EditorScriptCreateTool implements ITool {
  readonly name = 'unity_editor_script_create';
  readonly description =
    'Scaffold Unity editor scripts: CustomEditor, PropertyDrawer, EditorWindow, or ScriptableWizard. Generates compile-clean C# with proper attributes and base class.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['CustomEditor', 'PropertyDrawer', 'EditorWindow', 'ScriptableWizard'],
        description: 'Editor script type to generate',
      },
      targetType: {
        type: 'string',
        description: 'Target type for CustomEditor/PropertyDrawer (e.g. "HealthComponent")',
      },
      menuPath: {
        type: 'string',
        description: 'Menu item path (e.g. "Tools/My Tool")',
      },
      windowTitle: {
        type: 'string',
        description: 'Window title for EditorWindow/ScriptableWizard',
      },
      path: {
        type: 'string',
        description: 'Output directory path (e.g. "Assets/Editor")',
      },
    },
    required: ['type', 'path'],
  };
  readonly metadata: ToolMetadata = {
    category: 'unity-config',
    requiresBridge: false,
    dangerous: false,
    readOnly: false,
  };

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // 1. Zod parse
    // 2. Read-only check
    // 3. Validate path
    // 4. Validate required params per type (targetType for CustomEditor/PropertyDrawer)
    // 5. Generate C# code via template method
    // 6. Write file
  }

  private generateCustomEditor(targetType: string): { code: string; fileName: string } {
    const className = `${targetType}Editor`;
    const code = `using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(${targetType}))]
public class ${className} : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();

        ${targetType} target = (${targetType})this.target;

        // TODO: Add custom inspector GUI here
    }
}
`;
    return { code, fileName: `${className}.cs` };
  }

  private generatePropertyDrawer(targetType: string): { code: string; fileName: string } {
    const className = `${targetType}Drawer`;
    const code = `using UnityEditor;
using UnityEngine;

[CustomPropertyDrawer(typeof(${targetType}))]
public class ${className} : PropertyDrawer
{
    public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
    {
        EditorGUI.BeginProperty(position, label, property);

        // TODO: Draw custom property GUI here
        EditorGUI.PropertyField(position, property, label, true);

        EditorGUI.EndProperty();
    }

    public override float GetPropertyHeight(SerializedProperty property, GUIContent label)
    {
        return EditorGUI.GetPropertyHeight(property, label, true);
    }
}
`;
    return { code, fileName: `${className}.cs` };
  }

  private generateEditorWindow(
    windowTitle: string,
    menuPath?: string,
  ): { code: string; fileName: string } {
    const className = `${windowTitle.replace(/\s+/g, '')}Window`;
    const menu = menuPath ?? `Window/${windowTitle}`;
    const code = `using UnityEditor;
using UnityEngine;

public class ${className} : EditorWindow
{
    [MenuItem("${menu}")]
    public static void ShowWindow()
    {
        GetWindow<${className}>("${windowTitle}");
    }

    private void OnGUI()
    {
        GUILayout.Label("${windowTitle}", EditorStyles.boldLabel);

        // TODO: Add window GUI here
    }
}
`;
    return { code, fileName: `${className}.cs` };
  }

  private generateScriptableWizard(
    windowTitle: string,
    menuPath?: string,
  ): { code: string; fileName: string } {
    const className = `${windowTitle.replace(/\s+/g, '')}Wizard`;
    const menu = menuPath ?? `Tools/${windowTitle}`;
    const code = `using UnityEditor;
using UnityEngine;

public class ${className} : ScriptableWizard
{
    [MenuItem("${menu}")]
    public static void ShowWizard()
    {
        DisplayWizard<${className}>("${windowTitle}", "Create", "Apply");
    }

    private void OnWizardCreate()
    {
        // TODO: Implement wizard creation logic
    }

    private void OnWizardUpdate()
    {
        helpString = "Configure the wizard parameters above.";
    }

    private void OnWizardOtherButton()
    {
        // TODO: Implement "Apply" button logic
    }
}
`;
    return { code, fileName: `${className}.cs` };
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/tools/unity-config/editor-script-create.test.ts`
Expected: PASS (10 tests)

**Step 4: Commit**

```bash
git add src/tools/unity-config/editor-script-create.*
git commit -m "feat: add unity_editor_script_create tool with 4 script templates"
```

---

### Task 5: Register all 4 tools + barrel export + final tests

**Files:**
- Create: `src/tools/unity-config/index.ts`
- Modify: Tool registration (wherever tools are registered — server.ts or a central register file)

**Step 1: Create barrel export**

```typescript
// src/tools/unity-config/index.ts
export { PackageManageTool } from './package-manage.js';
export { AsmdefManageTool } from './asmdef-manage.js';
export { ProjectSettingsTool } from './project-settings.js';
export { EditorScriptCreateTool } from './editor-script-create.js';
```

**Step 2: Register tools in the tool registry**

```typescript
// In the registration function (server.ts or tools/register.ts)
import { PackageManageTool, AsmdefManageTool, ProjectSettingsTool, EditorScriptCreateTool } from './tools/unity-config/index.js';

registry.register(new PackageManageTool());
registry.register(new AsmdefManageTool());
registry.register(new ProjectSettingsTool());
registry.register(new EditorScriptCreateTool());
```

**Step 3: Run full test suite**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: ALL PASS

**Step 4: Commit and push**

```bash
git add .
git commit -m "feat: register all 4 Unity project config tools"
git push origin main
```

**Phase 11 complete.** Deliverables:
- `unity_package_manage` — UPM manifest.json operations (add, remove, search, list)
- `unity_asmdef_manage` — Assembly definition CRUD with circular reference detection
- `unity_project_settings` — Tags, layers, player settings via Unity YAML parsing
- `unity_editor_script_create` — 4 editor script templates (CustomEditor, PropertyDrawer, EditorWindow, ScriptableWizard)
- Unity YAML parser utility (reusable by other tools)
- ~45 new tests passing
