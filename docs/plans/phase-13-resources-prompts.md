# Phase 13: MCP Resources + Prompts

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose 10 MCP resources and 6 MCP prompts -- giving LLM clients rich, structured context about the Strada.Core framework and the Unity project without requiring tool calls.

**Architecture:** Resources use `server.resource()` from the MCP SDK to serve read-only data. Static Strada resources pull from `strada-api-reference.ts` (Phase 4). File-based Unity resources read from disk (manifest.json, ProjectSettings YAML, glob). Bridge-based Unity resources delegate to the Unity Editor via the bridge protocol (Phase 7). Prompts use `server.prompt()` to return structured multi-message prompt sequences that guide the LLM through complex scaffolding workflows.

**Tech Stack:** @modelcontextprotocol/sdk (`server.resource()`, `server.prompt()`), zod, fs/promises, glob, YAML parsing (lightweight regex -- no new dependency)

**Depends on:** Phase 4 (Strada tools + API reference), Phase 7 (Unity bridge -- for bridge-based resources, graceful degradation when unavailable)

---

### Task 1: Resource + Prompt interfaces and registries

**Files:**
- Create: `src/resources/resource.interface.ts`
- Create: `src/resources/resource-registry.ts`
- Create: `src/resources/resource-registry.test.ts`
- Create: `src/prompts/prompt.interface.ts`
- Create: `src/prompts/prompt-registry.ts`
- Create: `src/prompts/prompt-registry.test.ts`

**Step 1: Write the resource interface**

```typescript
// src/resources/resource.interface.ts
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceMetadata {
  /** Whether this resource requires a live Unity bridge connection */
  requiresBridge: boolean;
  /** Human-readable description for ListResources */
  description: string;
}

export interface IResource {
  readonly uri: string;
  readonly name: string;
  readonly metadata: ResourceMetadata;
  read(params?: Record<string, string>): Promise<ResourceContent>;
}
```

**Step 2: Write the prompt interface**

```typescript
// src/prompts/prompt.interface.ts
export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export interface IPrompt {
  readonly name: string;
  readonly description: string;
  readonly arguments: PromptArgument[];
  render(args: Record<string, string>): Promise<PromptMessage[]>;
}
```

**Step 3: Write failing resource registry test**

```typescript
// src/resources/resource-registry.test.ts
import { describe, it, expect } from 'vitest';
import { ResourceRegistry } from './resource-registry.js';
import type { IResource, ResourceContent } from './resource.interface.js';

function createMockResource(uri: string, requiresBridge = false): IResource {
  return {
    uri,
    name: uri.split('://')[1] ?? uri,
    metadata: { requiresBridge, description: `Mock ${uri}` },
    read: async () => ({ uri, mimeType: 'application/json', text: '{}' }),
  };
}

describe('ResourceRegistry', () => {
  it('should register and retrieve a resource', () => {
    const registry = new ResourceRegistry();
    const resource = createMockResource('strada://api-reference');
    registry.register(resource);
    expect(registry.get('strada://api-reference')).toBe(resource);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('should reject duplicate URI registration', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://api-reference'));
    expect(() =>
      registry.register(createMockResource('strada://api-reference')),
    ).toThrow('already registered');
  });

  it('should filter by bridge requirement', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://api-reference', false));
    registry.register(createMockResource('unity://scene-hierarchy', true));
    const available = registry.getAvailable(false);
    expect(available).toHaveLength(1);
    expect(available[0].uri).toBe('strada://api-reference');
  });

  it('should return all resources when bridge connected', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://api-reference', false));
    registry.register(createMockResource('unity://scene-hierarchy', true));
    expect(registry.getAvailable(true)).toHaveLength(2);
  });

  it('should match templated URIs', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://examples/{pattern}'));
    expect(registry.get('strada://examples/{pattern}')).toBeDefined();
  });
});
```

**Step 4: Implement resource registry**

```typescript
// src/resources/resource-registry.ts
import type { IResource } from './resource.interface.js';

export class ResourceRegistry {
  private readonly resources = new Map<string, IResource>();

  register(resource: IResource): void {
    if (this.resources.has(resource.uri)) {
      throw new Error(`Resource "${resource.uri}" already registered`);
    }
    this.resources.set(resource.uri, resource);
  }

  get(uri: string): IResource | undefined {
    return this.resources.get(uri);
  }

  getAll(): IResource[] {
    return Array.from(this.resources.values());
  }

  getAvailable(bridgeConnected: boolean): IResource[] {
    return this.getAll().filter(
      (r) => !r.metadata.requiresBridge || bridgeConnected,
    );
  }
}
```

**Step 5: Write failing prompt registry test**

```typescript
// src/prompts/prompt-registry.test.ts
import { describe, it, expect } from 'vitest';
import { PromptRegistry } from './prompt-registry.js';
import type { IPrompt, PromptMessage } from './prompt.interface.js';

function createMockPrompt(name: string): IPrompt {
  return {
    name,
    description: `Mock ${name}`,
    arguments: [{ name: 'featureName', description: 'Name', required: true }],
    render: async (args) => [
      { role: 'user', content: { type: 'text', text: `Create ${args.featureName}` } },
    ],
  };
}

describe('PromptRegistry', () => {
  it('should register and retrieve a prompt', () => {
    const registry = new PromptRegistry();
    const prompt = createMockPrompt('create_ecs_feature');
    registry.register(prompt);
    expect(registry.get('create_ecs_feature')).toBe(prompt);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('should reject duplicate registration', () => {
    const registry = new PromptRegistry();
    registry.register(createMockPrompt('dup'));
    expect(() => registry.register(createMockPrompt('dup'))).toThrow('already registered');
  });

  it('should list all prompt names', () => {
    const registry = new PromptRegistry();
    registry.register(createMockPrompt('a'));
    registry.register(createMockPrompt('b'));
    expect(registry.getAll().map((p) => p.name)).toEqual(['a', 'b']);
  });
});
```

**Step 6: Implement prompt registry**

```typescript
// src/prompts/prompt-registry.ts
import type { IPrompt } from './prompt.interface.js';

export class PromptRegistry {
  private readonly prompts = new Map<string, IPrompt>();

  register(prompt: IPrompt): void {
    if (this.prompts.has(prompt.name)) {
      throw new Error(`Prompt "${prompt.name}" already registered`);
    }
    this.prompts.set(prompt.name, prompt);
  }

  get(name: string): IPrompt | undefined {
    return this.prompts.get(name);
  }

  getAll(): IPrompt[] {
    return Array.from(this.prompts.values());
  }
}
```

**Step 7: Run tests**

Run: `npx vitest run src/resources/resource-registry.test.ts src/prompts/prompt-registry.test.ts`
Expected: PASS (8 tests)

**Step 8: Commit**

```bash
git add src/resources/ src/prompts/
git commit -m "feat: add Resource and Prompt interfaces with registries"
```

---

### Task 2: Strada resources (api-reference, namespaces, examples)

**Files:**
- Create: `src/resources/strada/api-reference.ts`
- Create: `src/resources/strada/namespaces.ts`
- Create: `src/resources/strada/examples.ts`
- Create: `src/resources/strada/strada-resources.test.ts`

**Step 1: Write the failing test**

```typescript
// src/resources/strada/strada-resources.test.ts
import { describe, it, expect } from 'vitest';
import { ApiReferenceResource } from './api-reference.js';
import { NamespacesResource } from './namespaces.js';
import { ExamplesResource } from './examples.js';

describe('ApiReferenceResource', () => {
  const resource = new ApiReferenceResource();

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('strada://api-reference');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should return complete API reference as text', async () => {
    const content = await resource.read();
    expect(content.uri).toBe('strada://api-reference');
    expect(content.mimeType).toBe('text/markdown');
    expect(content.text).toContain('Strada.Core');
    expect(content.text).toContain('IComponent');
    expect(content.text).toContain('SystemBase');
    expect(content.text).toContain('[Inject]');
    expect(content.text).toContain('ModuleConfig');
  });
});

describe('NamespacesResource', () => {
  const resource = new NamespacesResource();

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('strada://namespaces');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should return namespace hierarchy as JSON', async () => {
    const content = await resource.read();
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data).toHaveProperty('Strada.Core');
    expect(data['Strada.Core']).toContain('Strada.Core.ECS');
    expect(data['Strada.Core']).toContain('Strada.Core.DI');
  });
});

describe('ExamplesResource', () => {
  const resource = new ExamplesResource();

  it('should have correct URI with template', () => {
    expect(resource.uri).toBe('strada://examples/{pattern}');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should return ECS example', async () => {
    const content = await resource.read({ pattern: 'ecs' });
    expect(content.mimeType).toBe('text/markdown');
    expect(content.text).toContain('IComponent');
    expect(content.text).toContain('SystemBase');
    expect(content.text).toContain('ForEach');
  });

  it('should return MVCS example', async () => {
    const content = await resource.read({ pattern: 'mvcs' });
    expect(content.text).toContain('Controller');
    expect(content.text).toContain('Model');
    expect(content.text).toContain('Service');
  });

  it('should return DI example', async () => {
    const content = await resource.read({ pattern: 'di' });
    expect(content.text).toContain('[Inject]');
    expect(content.text).toContain('RegisterService');
  });

  it('should return mediator example', async () => {
    const content = await resource.read({ pattern: 'mediator' });
    expect(content.text).toContain('EntityMediator');
  });

  it('should return module example', async () => {
    const content = await resource.read({ pattern: 'module' });
    expect(content.text).toContain('ModuleConfig');
    expect(content.text).toContain('Configure');
  });

  it('should return error for unknown pattern', async () => {
    const content = await resource.read({ pattern: 'nonexistent' });
    expect(content.text).toContain('Unknown pattern');
  });

  it('should list all patterns when no param given', async () => {
    const content = await resource.read({});
    expect(content.text).toContain('ecs');
    expect(content.text).toContain('mvcs');
    expect(content.text).toContain('di');
    expect(content.text).toContain('mediator');
    expect(content.text).toContain('module');
  });
});
```

**Step 2: Implement api-reference resource**

```typescript
// src/resources/strada/api-reference.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import { STRADA_API } from '../../context/strada-api-reference.js';

export class ApiReferenceResource implements IResource {
  readonly uri = 'strada://api-reference';
  readonly name = 'Strada.Core API Reference';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Complete Strada.Core API documentation -- namespaces, base classes, attributes, patterns',
  };

  async read(): Promise<ResourceContent> {
    const api = STRADA_API;
    const md = [
      '# Strada.Core API Reference\n',
      '## Namespaces',
      ...Object.entries(api.namespaces).map(([key, ns]) => `- **${key}**: \`${ns}\``),
      '',
      '## ECS',
      `- Component interface: \`${api.componentApi.interface}\``,
      `- Struct layout: \`${api.componentApi.structLayout}\``,
      `- Constraint: \`${api.componentApi.constraint}\``,
      `- Max query components: ${api.componentApi.maxQueryComponents}`,
      '',
      '## Systems',
      `- Base classes: ${api.baseClasses.systems.map((s) => `\`${s}\``).join(', ')}`,
      `- Attribute: \`${api.systemAttributes.stradaSystem}\``,
      `- Update phases: ${api.updatePhases.join(', ')}`,
      `- Abstract method: \`${api.systemApi.abstractMethod}\``,
      `- Lifecycle: ${api.systemApi.lifecycleMethods.map((m) => `\`${m}\``).join(', ')}`,
      `- Query pattern: \`${api.systemApi.queryPattern}\``,
      `- Built-in properties: ${api.systemApi.builtInProperties.join(', ')}`,
      '',
      '## Dependency Injection',
      `- Field injection: \`${api.diApi.fieldInjection}\``,
      `- Lifetimes: ${api.diApi.lifetimes.join(', ')}`,
      '- Registration:',
      ...Object.entries(api.diApi.registration).map(([k, v]) => `  - ${k}: \`${v}\``),
      '',
      '## MVCS Pattern',
      ...Object.entries(api.baseClasses.patterns).map(([k, v]) => `- ${k}: \`${v}\``),
      '',
      '## Modules',
      `- Base class: \`${api.baseClasses.moduleConfig}\``,
      `- Configure: \`${api.moduleApi.configureMethods[0]}\``,
      `- Lifecycle: ${api.moduleApi.lifecycleMethods.map((m) => `\`${m}\``).join(', ')}`,
      `- Entry types: \`${api.moduleApi.systemEntry}\`, \`${api.moduleApi.serviceEntry}\``,
      '',
      '## Mediator',
      `- Base class: \`${api.baseClasses.mediator}\``,
      '',
      '## Reactive / Sync',
      `- \`${api.syncApi.reactiveProperty}\``,
      `- \`${api.syncApi.reactiveCollection}\``,
      `- \`${api.syncApi.computedProperty}\``,
      `- Events: ${api.syncApi.syncEvents.join(', ')}`,
      '',
      '## Communication (EventBus)',
      ...Object.entries(api.communicationApi).map(([k, v]) => `- ${k}: \`${v}\``),
    ].join('\n');

    return { uri: this.uri, mimeType: 'text/markdown', text: md };
  }
}
```

**Step 3: Implement namespaces resource**

```typescript
// src/resources/strada/namespaces.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import { STRADA_API } from '../../context/strada-api-reference.js';

export class NamespacesResource implements IResource {
  readonly uri = 'strada://namespaces';
  readonly name = 'Strada.Core Namespaces';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Namespace hierarchy with parent-child relationships',
  };

  async read(): Promise<ResourceContent> {
    const ns = STRADA_API.namespaces;
    const all = Object.values(ns);

    // Build parent -> children map
    const hierarchy: Record<string, string[]> = {};
    for (const namespace of all) {
      const parts = namespace.split('.');
      // Find direct children
      const children = all.filter((other) => {
        if (other === namespace) return false;
        return other.startsWith(namespace + '.') &&
          other.split('.').length === parts.length + 1;
      });
      if (children.length > 0) {
        hierarchy[namespace] = children;
      }
    }

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(hierarchy, null, 2),
    };
  }
}
```

**Step 4: Implement examples resource**

Contains five complete code examples for each Strada pattern (ecs, mvcs, di, mediator, module). Each example is a self-contained Markdown document with annotated C# code blocks.

The implementation maps pattern names to pre-built Markdown strings:

```typescript
// src/resources/strada/examples.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

// EXAMPLES map contains 5 keys: ecs, mvcs, di, mediator, module
// Each value is a complete Markdown document with C# code examples
// showing the canonical Strada.Core usage for that pattern.

export class ExamplesResource implements IResource {
  readonly uri = 'strada://examples/{pattern}';
  readonly name = 'Strada.Core Code Examples';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Code examples for Strada patterns: ecs, mvcs, di, mediator, module',
  };

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const pattern = params?.pattern;

    if (!pattern) {
      // List available patterns
      return {
        uri: this.uri,
        mimeType: 'text/markdown',
        text: '# Available Strada Examples\n\n- ecs\n- mvcs\n- di\n- mediator\n- module',
      };
    }

    const example = EXAMPLES[pattern.toLowerCase()];
    if (!example) {
      return {
        uri: `strada://examples/${pattern}`,
        mimeType: 'text/plain',
        text: `Unknown pattern: "${pattern}". Available: ${Object.keys(EXAMPLES).join(', ')}`,
      };
    }

    return {
      uri: `strada://examples/${pattern}`,
      mimeType: 'text/markdown',
      text: example,
    };
  }
}
```

The `EXAMPLES` constant contains full C# code samples:
- **ecs**: IComponent struct with StructLayout + SystemBase with ForEach query
- **mvcs**: ReactiveModel + Controller<TModel> + Service + View
- **di**: ModuleConfig.Configure() with RegisterService/Controller/Model + [Inject] fields
- **mediator**: EntityMediator<TView> with SyncBindings and PushBindings
- **module**: ModuleConfig + .asmdef + folder structure

**Step 5: Run tests**

Run: `npx vitest run src/resources/strada/strada-resources.test.ts`
Expected: PASS (10 tests)

**Step 6: Commit**

```bash
git add src/resources/strada/ src/context/
git commit -m "feat: add Strada resources -- api-reference, namespaces, examples"
```

---

### Task 3: Unity file-based resources (packages, assets, tags-layers, build-settings)

**Files:**
- Create: `src/resources/unity/packages.ts`
- Create: `src/resources/unity/assets.ts`
- Create: `src/resources/unity/tags-layers.ts`
- Create: `src/resources/unity/build-settings.ts`
- Create: `src/resources/unity/unity-file-resources.test.ts`

**Step 1: Write the failing test**

```typescript
// src/resources/unity/unity-file-resources.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PackagesResource } from './packages.js';
import { AssetsResource } from './assets.js';
import { TagsLayersResource } from './tags-layers.js';
import { BuildSettingsResource } from './build-settings.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('PackagesResource', () => {
  let tmpDir: string;
  const resource = new PackagesResource();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'Packages'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://packages');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should parse manifest.json', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Packages/manifest.json'),
      JSON.stringify({
        dependencies: {
          'com.unity.textmeshpro': '3.0.6',
          'com.unity.ugui': '1.0.0',
        },
      }),
    );
    const content = await resource.read({ projectPath: tmpDir });
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.dependencies).toHaveProperty('com.unity.textmeshpro');
    expect(data.dependencies['com.unity.ugui']).toBe('1.0.0');
  });

  it('should return error when manifest.json missing', async () => {
    const content = await resource.read({ projectPath: path.join(tmpDir, 'nonexistent') });
    expect(content.text).toContain('not found');
  });
});

describe('AssetsResource', () => {
  let tmpDir: string;
  const resource = new AssetsResource();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'Assets/Scripts'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'Assets/Prefabs'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'Assets/Scripts/Player.cs'), '// player');
    await fs.writeFile(path.join(tmpDir, 'Assets/Scripts/Enemy.cs'), '// enemy');
    await fs.writeFile(path.join(tmpDir, 'Assets/Prefabs/Player.prefab'), '--- prefab');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct URI with template', () => {
    expect(resource.uri).toBe('unity://assets/{type}');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should list .cs files when type is "scripts"', async () => {
    const content = await resource.read({ type: 'scripts', projectPath: tmpDir });
    expect(content.mimeType).toBe('application/json');
    const files = JSON.parse(content.text);
    expect(files).toHaveLength(2);
    expect(files.some((f: string) => f.includes('Player.cs'))).toBe(true);
  });

  it('should list .prefab files when type is "prefabs"', async () => {
    const content = await resource.read({ type: 'prefabs', projectPath: tmpDir });
    const files = JSON.parse(content.text);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('Player.prefab');
  });

  it('should list all known types when type is omitted', async () => {
    const content = await resource.read({ projectPath: tmpDir });
    expect(content.text).toContain('scripts');
    expect(content.text).toContain('prefabs');
    expect(content.text).toContain('scenes');
  });
});

describe('TagsLayersResource', () => {
  let tmpDir: string;
  const resource = new TagsLayersResource();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'ProjectSettings'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://tags-layers');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should parse TagManager.asset YAML for tags', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'ProjectSettings/TagManager.asset'),
      [
        '%YAML 1.1',
        '%TAG !u! tag:unity3d.com,2011:',
        '--- !u!78 &1',
        'TagManager:',
        '  tags:',
        '  - Enemy',
        '  - Projectile',
        '  - Pickup',
        '  layers:',
        '  - Default',
        '  - TransparentFX',
        '  - Ignore Raycast',
        '  - ',
        '  - Water',
        '  - UI',
        '  sortingLayers:',
        '  - name: Default',
        '    uniqueID: 0',
      ].join('\n'),
    );
    const content = await resource.read({ projectPath: tmpDir });
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.tags).toContain('Enemy');
    expect(data.tags).toContain('Projectile');
    expect(data.layers).toContain('Default');
    expect(data.layers).toContain('Water');
  });

  it('should return error when TagManager.asset missing', async () => {
    const content = await resource.read({ projectPath: path.join(tmpDir, 'nonexistent') });
    expect(content.text).toContain('not found');
  });
});

describe('BuildSettingsResource', () => {
  let tmpDir: string;
  const resource = new BuildSettingsResource();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'ProjectSettings'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('unity://build-settings');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should parse EditorBuildSettings.asset for scenes', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'ProjectSettings/EditorBuildSettings.asset'),
      [
        '%YAML 1.1',
        '%TAG !u! tag:unity3d.com,2011:',
        '--- !u!1045 &1',
        'EditorBuildSettings:',
        '  m_Scenes:',
        '  - enabled: 1',
        '    path: Assets/Scenes/Main.unity',
        '    guid: abc123',
        '  - enabled: 0',
        '    path: Assets/Scenes/Test.unity',
        '    guid: def456',
        '  - enabled: 1',
        '    path: Assets/Scenes/Menu.unity',
        '    guid: ghi789',
      ].join('\n'),
    );
    const content = await resource.read({ projectPath: tmpDir });
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.scenes).toHaveLength(3);
    expect(data.scenes[0].path).toBe('Assets/Scenes/Main.unity');
    expect(data.scenes[0].enabled).toBe(true);
    expect(data.scenes[1].enabled).toBe(false);
  });

  it('should return error when EditorBuildSettings.asset missing', async () => {
    const content = await resource.read({ projectPath: path.join(tmpDir, 'nonexistent') });
    expect(content.text).toContain('not found');
  });
});
```

**Step 2: Implement packages resource**

```typescript
// src/resources/unity/packages.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export class PackagesResource implements IResource {
  readonly uri = 'unity://packages';
  readonly name = 'Unity Packages';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Installed UPM packages from Packages/manifest.json',
  };

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const projectPath = params?.projectPath;
    if (!projectPath) {
      return { uri: this.uri, mimeType: 'text/plain', text: 'Error: projectPath not provided' };
    }

    const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify(manifest, null, 2),
      };
    } catch {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: `Error: Packages/manifest.json not found at ${projectPath}`,
      };
    }
  }
}
```

**Step 3: Implement assets resource**

Uses a type-to-glob map: `scripts -> **/*.cs`, `prefabs -> **/*.prefab`, `scenes -> **/*.unity`, etc. Scans `Assets/` directory with glob.

```typescript
// src/resources/unity/assets.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import { glob } from 'glob';
import path from 'node:path';

const ASSET_TYPE_MAP: Record<string, string> = {
  scripts: '**/*.cs',
  prefabs: '**/*.prefab',
  scenes: '**/*.unity',
  materials: '**/*.mat',
  textures: '**/*.{png,jpg,jpeg,tga,psd,exr}',
  shaders: '**/*.{shader,shadergraph,shadersubgraph}',
  animations: '**/*.{anim,controller}',
  audio: '**/*.{wav,mp3,ogg,aiff}',
  models: '**/*.{fbx,obj,blend,dae}',
  scriptableobjects: '**/*.asset',
};

export class AssetsResource implements IResource {
  readonly uri = 'unity://assets/{type}';
  readonly name = 'Unity Assets';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Asset list by type via glob (scripts, prefabs, scenes, materials, etc.)',
  };

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const projectPath = params?.projectPath;
    const type = params?.type;

    if (!type) {
      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          availableTypes: Object.keys(ASSET_TYPE_MAP),
          usage: 'unity://assets/{type}',
        }, null, 2),
      };
    }

    if (!projectPath) {
      return {
        uri: `unity://assets/${type}`,
        mimeType: 'text/plain',
        text: 'Error: projectPath not provided',
      };
    }

    const pattern = ASSET_TYPE_MAP[type.toLowerCase()];
    if (!pattern) {
      return {
        uri: `unity://assets/${type}`,
        mimeType: 'text/plain',
        text: `Unknown asset type: "${type}". Available: ${Object.keys(ASSET_TYPE_MAP).join(', ')}`,
      };
    }

    const assetsDir = path.join(projectPath, 'Assets');
    const files = await glob(pattern, { cwd: assetsDir, nodir: true });
    const relative = files.map((f) => `Assets/${f}`).sort();

    return {
      uri: `unity://assets/${type}`,
      mimeType: 'application/json',
      text: JSON.stringify(relative, null, 2),
    };
  }
}
```

**Step 4: Implement tags-layers resource**

Parses Unity TagManager.asset YAML with lightweight regex (no YAML library -- Unity YAML is a constrained subset).

```typescript
// src/resources/unity/tags-layers.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export class TagsLayersResource implements IResource {
  readonly uri = 'unity://tags-layers';
  readonly name = 'Unity Tags & Layers';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Tags and layers from ProjectSettings/TagManager.asset YAML',
  };

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const projectPath = params?.projectPath;
    if (!projectPath) {
      return { uri: this.uri, mimeType: 'text/plain', text: 'Error: projectPath not provided' };
    }

    const tagManagerPath = path.join(projectPath, 'ProjectSettings', 'TagManager.asset');
    try {
      const raw = await fs.readFile(tagManagerPath, 'utf-8');
      const tags = this.parseTags(raw);
      const layers = this.parseLayers(raw);
      const sortingLayers = this.parseSortingLayers(raw);

      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify({ tags, layers, sortingLayers }, null, 2),
      };
    } catch {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: `Error: TagManager.asset not found at ${projectPath}`,
      };
    }
  }

  private parseTags(yaml: string): string[] {
    const tagsMatch = yaml.match(/tags:\n((?:\s+- .+\n)*)/);
    if (!tagsMatch) return [];
    return tagsMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s+- /, '').trim())
      .filter(Boolean);
  }

  private parseLayers(yaml: string): string[] {
    const layersMatch = yaml.match(/layers:\n((?:\s+- .*\n)*)/);
    if (!layersMatch) return [];
    return layersMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s+- /, '').trim())
      .filter(Boolean);
  }

  private parseSortingLayers(yaml: string): Array<{ name: string; uniqueID: number }> {
    const match = yaml.match(/sortingLayers:\n((?:\s+- .*\n)*)/);
    if (!match) return [];
    const layers: Array<{ name: string; uniqueID: number }> = [];
    const entries = match[1].matchAll(/name: (.+)\n\s+uniqueID: (\d+)/g);
    for (const entry of entries) {
      layers.push({ name: entry[1].trim(), uniqueID: parseInt(entry[2], 10) });
    }
    return layers;
  }
}
```

**Step 5: Implement build-settings resource**

```typescript
// src/resources/unity/build-settings.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export class BuildSettingsResource implements IResource {
  readonly uri = 'unity://build-settings';
  readonly name = 'Unity Build Settings';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Build configuration from ProjectSettings/EditorBuildSettings.asset',
  };

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const projectPath = params?.projectPath;
    if (!projectPath) {
      return { uri: this.uri, mimeType: 'text/plain', text: 'Error: projectPath not provided' };
    }

    const settingsPath = path.join(
      projectPath, 'ProjectSettings', 'EditorBuildSettings.asset',
    );
    try {
      const raw = await fs.readFile(settingsPath, 'utf-8');
      const scenes = this.parseScenes(raw);
      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify({ scenes }, null, 2),
      };
    } catch {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: `Error: EditorBuildSettings.asset not found at ${projectPath}`,
      };
    }
  }

  private parseScenes(
    yaml: string,
  ): Array<{ enabled: boolean; path: string; guid: string }> {
    const scenes: Array<{ enabled: boolean; path: string; guid: string }> = [];
    const sceneRegex = /- enabled: (\d)\n\s+path: (.+)\n\s+guid: (.+)/g;
    let match: RegExpExecArray | null;
    while ((match = sceneRegex.exec(yaml)) !== null) {
      scenes.push({
        enabled: match[1] === '1',
        path: match[2].trim(),
        guid: match[3].trim(),
      });
    }
    return scenes;
  }
}
```

**Step 6: Run tests**

Run: `npx vitest run src/resources/unity/unity-file-resources.test.ts`
Expected: PASS (11 tests)

**Step 7: Commit**

```bash
git add src/resources/unity/
git commit -m "feat: add Unity file-based resources -- packages, assets, tags-layers, build-settings"
```

---

### Task 4: Unity bridge resources (project-info, scene-hierarchy, console-logs)

**Files:**
- Create: `src/resources/unity/project-info.ts`
- Create: `src/resources/unity/scene-hierarchy.ts`
- Create: `src/resources/unity/console-logs.ts`
- Create: `src/resources/unity/unity-bridge-resources.test.ts`

These three resources prefer live bridge data but degrade gracefully when the bridge is unavailable.

**Step 1: Write the failing test**

```typescript
// src/resources/unity/unity-bridge-resources.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectInfoResource } from './project-info.js';
import { SceneHierarchyResource } from './scene-hierarchy.js';
import { ConsoleLogsResource } from './console-logs.js';
import type { IBridgeClient } from '../../bridge/bridge-client.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMockBridge(connected: boolean, response?: unknown): IBridgeClient {
  return {
    isConnected: () => connected,
    request: vi.fn().mockResolvedValue(response ?? {}),
  } as unknown as IBridgeClient;
}

describe('ProjectInfoResource', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-mcp-test-'));
    await fs.mkdir(path.join(tmpDir, 'ProjectSettings'), { recursive: true });
  });

  it('should have correct URI and metadata', () => {
    const resource = new ProjectInfoResource();
    expect(resource.uri).toBe('unity://project-info');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should return bridge data when connected', async () => {
    const bridge = createMockBridge(true, {
      productName: 'MyGame',
      companyName: 'MyStudio',
      version: '1.0.0',
      unityVersion: '6000.0.24f1',
      platform: 'StandaloneWindows64',
      scripting: 'IL2CPP',
    });
    const resource = new ProjectInfoResource();
    const content = await resource.read({ projectPath: tmpDir, bridge: bridge as any });
    const data = JSON.parse(content.text);
    expect(data.productName).toBe('MyGame');
    expect(data.unityVersion).toBe('6000.0.24f1');
  });

  it('should fallback to ProjectSettings when bridge unavailable', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'ProjectSettings/ProjectSettings.asset'),
      [
        'PlayerSettings:',
        '  productName: FallbackGame',
        '  companyName: FallbackStudio',
        '  bundleVersion: 0.1.0',
      ].join('\n'),
    );
    const resource = new ProjectInfoResource();
    const content = await resource.read({ projectPath: tmpDir });
    const data = JSON.parse(content.text);
    expect(data.productName).toBe('FallbackGame');
    expect(data.source).toBe('file');
  });
});

describe('SceneHierarchyResource', () => {
  it('should have correct metadata -- requires bridge', () => {
    const resource = new SceneHierarchyResource();
    expect(resource.uri).toBe('unity://scene-hierarchy');
    expect(resource.metadata.requiresBridge).toBe(true);
  });

  it('should return hierarchy JSON from bridge', async () => {
    const hierarchy = {
      sceneName: 'Main',
      rootObjects: [
        { name: 'Player', children: [{ name: 'Camera', children: [] }] },
        { name: 'Environment', children: [] },
      ],
    };
    const bridge = createMockBridge(true, hierarchy);
    const resource = new SceneHierarchyResource();
    const content = await resource.read({ bridge: bridge as any });
    const data = JSON.parse(content.text);
    expect(data.sceneName).toBe('Main');
    expect(data.rootObjects).toHaveLength(2);
  });

  it('should return unavailable when bridge disconnected', async () => {
    const resource = new SceneHierarchyResource();
    const content = await resource.read({});
    expect(content.text).toContain('unavailable');
  });
});

describe('ConsoleLogsResource', () => {
  it('should have correct metadata -- requires bridge', () => {
    const resource = new ConsoleLogsResource();
    expect(resource.uri).toBe('unity://console-logs');
    expect(resource.metadata.requiresBridge).toBe(true);
  });

  it('should return recent logs from bridge', async () => {
    const logs = [
      { type: 'Log', message: 'Game started', timestamp: '2026-03-13T10:00:00Z' },
      { type: 'Warning', message: 'Low FPS', timestamp: '2026-03-13T10:00:01Z' },
      { type: 'Error', message: 'NullRef', timestamp: '2026-03-13T10:00:02Z', stackTrace: 'at Player.cs:42' },
    ];
    const bridge = createMockBridge(true, { logs });
    const resource = new ConsoleLogsResource();
    const content = await resource.read({ bridge: bridge as any });
    const data = JSON.parse(content.text);
    expect(data.logs).toHaveLength(3);
    expect(data.logs[2].type).toBe('Error');
  });

  it('should return unavailable when bridge disconnected', async () => {
    const resource = new ConsoleLogsResource();
    const content = await resource.read({});
    expect(content.text).toContain('unavailable');
  });
});
```

**Step 2: Define bridge client interface (minimal -- Phase 7 provides full implementation)**

```typescript
// src/bridge/bridge-client.interface.ts
export interface IBridgeClient {
  isConnected(): boolean;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
```

**Step 3: Implement project-info resource**

Prefers bridge data. Falls back to parsing `ProjectSettings/ProjectSettings.asset` YAML for productName, companyName, bundleVersion. Returns `{ source: 'bridge' | 'file' }` to indicate data origin.

```typescript
// src/resources/unity/project-info.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import type { IBridgeClient } from '../../bridge/bridge-client.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export class ProjectInfoResource implements IResource {
  readonly uri = 'unity://project-info';
  readonly name = 'Unity Project Info';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false, // graceful degradation
    description: 'Project metadata (bridge preferred, ProjectSettings fallback)',
  };

  async read(
    params?: Record<string, string> & { bridge?: IBridgeClient },
  ): Promise<ResourceContent> {
    const bridge = params?.bridge as IBridgeClient | undefined;

    if (bridge?.isConnected()) {
      try {
        const data = await bridge.request('getProjectInfo');
        return {
          uri: this.uri,
          mimeType: 'application/json',
          text: JSON.stringify({ ...data as object, source: 'bridge' }, null, 2),
        };
      } catch { /* fall through */ }
    }

    const projectPath = params?.projectPath;
    if (!projectPath) {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: 'Error: projectPath not provided and bridge not connected',
      };
    }

    try {
      const settingsPath = path.join(projectPath, 'ProjectSettings', 'ProjectSettings.asset');
      const raw = await fs.readFile(settingsPath, 'utf-8');
      const productName = raw.match(/productName:\s*(.+)/)?.[1]?.trim() ?? 'Unknown';
      const companyName = raw.match(/companyName:\s*(.+)/)?.[1]?.trim() ?? 'Unknown';
      const bundleVersion = raw.match(/bundleVersion:\s*(.+)/)?.[1]?.trim() ?? '0.0.0';

      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify({ productName, companyName, bundleVersion, source: 'file' }, null, 2),
      };
    } catch {
      return { uri: this.uri, mimeType: 'text/plain', text: 'Error: ProjectSettings.asset not found' };
    }
  }
}
```

**Step 4: Implement scene-hierarchy resource**

Bridge-only. Returns `unavailable` message when bridge not connected.

```typescript
// src/resources/unity/scene-hierarchy.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import type { IBridgeClient } from '../../bridge/bridge-client.interface.js';

export class SceneHierarchyResource implements IResource {
  readonly uri = 'unity://scene-hierarchy';
  readonly name = 'Unity Scene Hierarchy';
  readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Active scene hierarchy as JSON tree (requires Unity Editor)',
  };

  async read(
    params?: Record<string, string> & { bridge?: IBridgeClient },
  ): Promise<ResourceContent> {
    const bridge = params?.bridge as IBridgeClient | undefined;

    if (!bridge?.isConnected()) {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: 'Resource unavailable: Unity Editor bridge not connected.',
      };
    }

    try {
      const data = await bridge.request('getSceneHierarchy');
      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      };
    } catch (err) {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
```

**Step 5: Implement console-logs resource**

Bridge-only. Returns `unavailable` message when bridge not connected.

```typescript
// src/resources/unity/console-logs.ts
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import type { IBridgeClient } from '../../bridge/bridge-client.interface.js';

export class ConsoleLogsResource implements IResource {
  readonly uri = 'unity://console-logs';
  readonly name = 'Unity Console Logs';
  readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Recent Unity console output (requires Unity Editor)',
  };

  async read(
    params?: Record<string, string> & { bridge?: IBridgeClient },
  ): Promise<ResourceContent> {
    const bridge = params?.bridge as IBridgeClient | undefined;

    if (!bridge?.isConnected()) {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: 'Resource unavailable: Unity Editor bridge not connected.',
      };
    }

    try {
      const data = await bridge.request('getConsoleLogs');
      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      };
    } catch (err) {
      return {
        uri: this.uri,
        mimeType: 'text/plain',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
```

**Step 6: Run tests**

Run: `npx vitest run src/resources/unity/unity-bridge-resources.test.ts`
Expected: PASS (8 tests)

**Step 7: Commit**

```bash
git add src/resources/unity/ src/bridge/bridge-client.interface.ts
git commit -m "feat: add Unity bridge resources -- project-info, scene-hierarchy, console-logs"
```

---

### Task 5: ECS + MVCS prompts

**Files:**
- Create: `src/prompts/strada/create-ecs-feature.ts`
- Create: `src/prompts/strada/create-mvcs-feature.ts`
- Create: `src/prompts/strada/strada-prompts.test.ts`

**Step 1: Write the failing test**

```typescript
// src/prompts/strada/strada-prompts.test.ts
import { describe, it, expect } from 'vitest';
import { CreateEcsFeaturePrompt } from './create-ecs-feature.js';
import { CreateMvcsFeaturePrompt } from './create-mvcs-feature.js';

describe('CreateEcsFeaturePrompt', () => {
  const prompt = new CreateEcsFeaturePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('create_ecs_feature');
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'featureName', required: true }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'components', required: true }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'systems', required: true }),
    );
  });

  it('should render prompt with feature context', async () => {
    const messages = await prompt.render({
      featureName: 'Combat',
      components: 'Health,Damage,Armor',
      systems: 'DamageSystem,HealthRegenSystem',
    });
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content.text).toContain('Combat');
    expect(userMsg!.content.text).toContain('Health');
    expect(userMsg!.content.text).toContain('DamageSystem');

    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('IComponent');
    expect(allText).toContain('SystemBase');
    expect(allText).toContain('[StradaSystem]');
    expect(allText).toContain('StructLayout');
  });

  it('should include module scaffold instruction', async () => {
    const messages = await prompt.render({
      featureName: 'Inventory',
      components: 'Item,Stack',
      systems: 'PickupSystem',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('ModuleConfig');
    expect(allText).toContain('.asmdef');
  });
});

describe('CreateMvcsFeaturePrompt', () => {
  const prompt = new CreateMvcsFeaturePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('create_mvcs_feature');
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'featureName', required: true }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'hasModel', required: false }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'hasService', required: false }),
    );
  });

  it('should render MVCS prompt', async () => {
    const messages = await prompt.render({
      featureName: 'PlayerProfile',
      hasModel: 'true',
      hasService: 'true',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('PlayerProfile');
    expect(allText).toContain('Controller');
    expect(allText).toContain('Model');
    expect(allText).toContain('Service');
    expect(allText).toContain('View');
    expect(allText).toContain('ReactiveProperty');
  });

  it('should skip model section when hasModel is false', async () => {
    const messages = await prompt.render({
      featureName: 'SimpleUI',
      hasModel: 'false',
      hasService: 'false',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('SimpleUI');
    expect(allText).toContain('Controller');
    expect(allText).toContain('View');
  });
});
```

**Step 2: Implement create_ecs_feature prompt**

The prompt renders a two-message sequence:
1. **User message**: States the intent with feature name, component list, system list
2. **Assistant message**: Provides Strada.Core ECS conventions (IComponent rules, SystemBase rules, ModuleConfig), lists all files to create with folder structure, then indicates it will use strada_create_module/component/system tools

Key conventions embedded:
- Components: `IComponent`, `[StructLayout(LayoutKind.Sequential)]`, unmanaged only
- Systems: `SystemBase`, `[StradaSystem]`, `[UpdatePhase]`, `OnUpdate(float deltaTime)`, `ForEach<T>` queries
- Module: `ModuleConfig.Configure()`, `.asmdef` with `Strada.Core` reference

**Step 3: Implement create_mvcs_feature prompt**

Two-message sequence:
1. **User message**: Feature name + which parts to include (Model, Service flags)
2. **Assistant message**: MVCS conventions (Controller<TModel>, ReactiveModel, Service, View), DI registration patterns, file list

Conditional sections based on `hasModel` / `hasService` flags.

**Step 4: Run tests**

Run: `npx vitest run src/prompts/strada/strada-prompts.test.ts`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/prompts/strada/
git commit -m "feat: add create_ecs_feature and create_mvcs_feature prompts"
```

---

### Task 6: Refactoring + optimization prompts

**Files:**
- Create: `src/prompts/strada/refactor-to-strada.ts`
- Create: `src/prompts/strada/optimize-performance.ts`
- Create: `src/prompts/strada/refactor-optimize-prompts.test.ts`

**Step 1: Write the failing test**

```typescript
// src/prompts/strada/refactor-optimize-prompts.test.ts
import { describe, it, expect } from 'vitest';
import { RefactorToStradaPrompt } from './refactor-to-strada.js';
import { OptimizePerformancePrompt } from './optimize-performance.js';

describe('RefactorToStradaPrompt', () => {
  const prompt = new RefactorToStradaPrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('refactor_to_strada');
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'sourceFile', required: true }),
    );
  });

  it('should render refactoring guidance', async () => {
    const messages = await prompt.render({
      sourceFile: 'Assets/Scripts/OldPlayerManager.cs',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('OldPlayerManager.cs');
    expect(allText).toContain('MonoBehaviour');
    expect(allText).toContain('SystemBase');
    expect(allText).toContain('IComponent');
    expect(allText).toContain('[Inject]');
    expect(allText).toContain('Step');
  });
});

describe('OptimizePerformancePrompt', () => {
  const prompt = new OptimizePerformancePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('optimize_performance');
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'targetArea', required: true }),
    );
  });

  it('should render optimization guidance for ECS', async () => {
    const messages = await prompt.render({ targetArea: 'ecs' });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('BurstSystemBase');
    expect(allText).toContain('JobSystemBase');
    expect(allText).toContain('StructLayout');
    expect(allText).toContain('cache');
  });

  it('should render optimization guidance for rendering', async () => {
    const messages = await prompt.render({ targetArea: 'rendering' });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('draw call');
    expect(allText).toContain('batch');
  });

  it('should render optimization guidance for memory', async () => {
    const messages = await prompt.render({ targetArea: 'memory' });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('GC');
    expect(allText).toContain('pool');
  });

  it('should handle general optimization', async () => {
    const messages = await prompt.render({ targetArea: 'general' });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText.length).toBeGreaterThan(100);
  });
});
```

**Step 2: Implement refactor_to_strada prompt**

Two-message sequence:
1. **User**: "Refactor `{sourceFile}` from vanilla Unity to Strada.Core"
2. **Assistant**: 6-step migration guide:
   - Step 1: Identify pattern (God MonoBehaviour, Singleton, direct refs, Update polling, GetComponent)
   - Step 2: Extract data into IComponent structs
   - Step 3: Extract logic into SystemBase classes
   - Step 4: Extract services
   - Step 5: Create View if MonoBehaviour had rendering
   - Step 6: Register in ModuleConfig

Includes conversion table: vanilla Unity pattern -> Strada.Core equivalent.

**Step 3: Implement optimize_performance prompt**

Uses area-specific guide maps (ecs, rendering, memory, general). Each guide contains:
- **ecs**: BurstSystemBase, JobSystemBase, struct layout, cache optimization, query batching
- **rendering**: draw calls, batching, LOD, culling, lighting
- **memory**: GC pressure, object pooling, Span/stackalloc, texture compression
- **general**: profiling first, common wins, Strada-specific tips

Falls back to `general` for unknown areas.

**Step 4: Run tests**

Run: `npx vitest run src/prompts/strada/refactor-optimize-prompts.test.ts`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/prompts/strada/refactor-to-strada.ts src/prompts/strada/optimize-performance.ts src/prompts/strada/refactor-optimize-prompts.test.ts
git commit -m "feat: add refactor_to_strada and optimize_performance prompts"
```

---

### Task 7: UI + module prompts

**Files:**
- Create: `src/prompts/strada/create-ui-screen.ts`
- Create: `src/prompts/strada/setup-module.ts`
- Create: `src/prompts/strada/ui-module-prompts.test.ts`

**Step 1: Write the failing test**

```typescript
// src/prompts/strada/ui-module-prompts.test.ts
import { describe, it, expect } from 'vitest';
import { CreateUiScreenPrompt } from './create-ui-screen.js';
import { SetupModulePrompt } from './setup-module.js';

describe('CreateUiScreenPrompt', () => {
  const prompt = new CreateUiScreenPrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('create_ui_screen');
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'screenName', required: true }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'hasNavigation', required: false }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'dataBindings', required: false }),
    );
  });

  it('should render UI Toolkit scaffold', async () => {
    const messages = await prompt.render({
      screenName: 'Inventory',
      hasNavigation: 'true',
      dataBindings: 'ItemName,ItemCount,ItemIcon',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('Inventory');
    expect(allText).toContain('.uxml');
    expect(allText).toContain('.uss');
    expect(allText).toContain('VisualElement');
    expect(allText).toContain('ItemName');
    expect(allText).toContain('navigation');
  });

  it('should skip navigation when hasNavigation is false', async () => {
    const messages = await prompt.render({
      screenName: 'Settings',
      hasNavigation: 'false',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('Settings');
    expect(allText).toContain('.uxml');
  });
});

describe('SetupModulePrompt', () => {
  const prompt = new SetupModulePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('setup_module');
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'moduleName', required: true }),
    );
    expect(prompt.arguments).toContainEqual(
      expect.objectContaining({ name: 'features', required: false }),
    );
  });

  it('should render module setup wizard', async () => {
    const messages = await prompt.render({
      moduleName: 'Networking',
      features: 'lobby,matchmaking,replication',
    });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('Networking');
    expect(allText).toContain('ModuleConfig');
    expect(allText).toContain('.asmdef');
    expect(allText).toContain('lobby');
    expect(allText).toContain('matchmaking');
    expect(allText).toContain('Configure');
  });

  it('should render minimal module when no features specified', async () => {
    const messages = await prompt.render({ moduleName: 'Core' });
    const allText = messages.map((m) => m.content.text).join('\n');
    expect(allText).toContain('Core');
    expect(allText).toContain('ModuleConfig');
  });
});
```

**Step 2: Implement create_ui_screen prompt**

Two-message sequence with:
1. **User**: "Create UI Toolkit screen `{screenName}` with navigation and data bindings"
2. **Assistant**: File plan with inline UXML/USS examples showing:
   - UXML layout with VisualElement tree, optional navigation bar, data binding labels
   - USS styles for screen-root, nav-bar, screen-content
   - View class extending `View` with `OnBind()` querying UXML elements
   - Controller class for user input handling

Conditional navigation section based on `hasNavigation` flag. Data binding names rendered as Label elements in UXML.

**Step 3: Implement setup_module prompt**

Two-message sequence with:
1. **User**: "Set up module `{moduleName}` with features: ..."
2. **Assistant**: Complete module skeleton plan:
   - Folder structure with feature subdirectories
   - ModuleConfig with Configure() registering all feature services
   - Assembly definition JSON
   - Feature service interface + implementation pairs

Features list is optional -- when empty, generates minimal module skeleton.

**Step 4: Run tests**

Run: `npx vitest run src/prompts/strada/ui-module-prompts.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/prompts/strada/create-ui-screen.ts src/prompts/strada/setup-module.ts src/prompts/strada/ui-module-prompts.test.ts
git commit -m "feat: add create_ui_screen and setup_module prompts"
```

---

### Task 8: Register all resources + prompts with MCP server + integration test

**Files:**
- Create: `src/resources/register-resources.ts`
- Create: `src/prompts/register-prompts.ts`
- Create: `src/resources/register-resources.test.ts`
- Create: `src/prompts/register-prompts.test.ts`
- Modify: `src/server.ts` -- add resource/prompt registries to StradaMcpServerInstance

**Step 1: Write the failing registration test for resources**

```typescript
// src/resources/register-resources.test.ts
import { describe, it, expect } from 'vitest';
import { registerAllResources } from './register-resources.js';
import { ResourceRegistry } from './resource-registry.js';

describe('registerAllResources', () => {
  it('should register exactly 10 resources', () => {
    const registry = new ResourceRegistry();
    registerAllResources(registry);
    expect(registry.getAll()).toHaveLength(10);
  });

  it('should register all strada:// resources', () => {
    const registry = new ResourceRegistry();
    registerAllResources(registry);
    const uris = registry.getAll().map((r) => r.uri);
    expect(uris).toContain('strada://api-reference');
    expect(uris).toContain('strada://namespaces');
    expect(uris).toContain('strada://examples/{pattern}');
  });

  it('should register all unity:// resources', () => {
    const registry = new ResourceRegistry();
    registerAllResources(registry);
    const uris = registry.getAll().map((r) => r.uri);
    expect(uris).toContain('unity://project-info');
    expect(uris).toContain('unity://scene-hierarchy');
    expect(uris).toContain('unity://console-logs');
    expect(uris).toContain('unity://packages');
    expect(uris).toContain('unity://assets/{type}');
    expect(uris).toContain('unity://tags-layers');
    expect(uris).toContain('unity://build-settings');
  });

  it('should have 2 bridge-required resources', () => {
    const registry = new ResourceRegistry();
    registerAllResources(registry);
    const bridgeOnly = registry.getAll().filter((r) => r.metadata.requiresBridge);
    expect(bridgeOnly).toHaveLength(2);
  });

  it('should have 8 non-bridge resources available when disconnected', () => {
    const registry = new ResourceRegistry();
    registerAllResources(registry);
    const available = registry.getAvailable(false);
    expect(available).toHaveLength(8);
  });
});
```

**Step 2: Implement resource registration**

```typescript
// src/resources/register-resources.ts
import { ResourceRegistry } from './resource-registry.js';
import { ApiReferenceResource } from './strada/api-reference.js';
import { NamespacesResource } from './strada/namespaces.js';
import { ExamplesResource } from './strada/examples.js';
import { PackagesResource } from './unity/packages.js';
import { AssetsResource } from './unity/assets.js';
import { TagsLayersResource } from './unity/tags-layers.js';
import { BuildSettingsResource } from './unity/build-settings.js';
import { ProjectInfoResource } from './unity/project-info.js';
import { SceneHierarchyResource } from './unity/scene-hierarchy.js';
import { ConsoleLogsResource } from './unity/console-logs.js';

export function registerAllResources(registry: ResourceRegistry): void {
  // Strada resources (static)
  registry.register(new ApiReferenceResource());
  registry.register(new NamespacesResource());
  registry.register(new ExamplesResource());

  // Unity file-based resources
  registry.register(new PackagesResource());
  registry.register(new AssetsResource());
  registry.register(new TagsLayersResource());
  registry.register(new BuildSettingsResource());

  // Unity bridge resources
  registry.register(new ProjectInfoResource());     // requiresBridge: false (has fallback)
  registry.register(new SceneHierarchyResource());  // requiresBridge: true
  registry.register(new ConsoleLogsResource());     // requiresBridge: true
}
```

**Step 3: Write the failing registration test for prompts**

```typescript
// src/prompts/register-prompts.test.ts
import { describe, it, expect } from 'vitest';
import { registerAllPrompts } from './register-prompts.js';
import { PromptRegistry } from './prompt-registry.js';

describe('registerAllPrompts', () => {
  it('should register exactly 6 prompts', () => {
    const registry = new PromptRegistry();
    registerAllPrompts(registry);
    expect(registry.getAll()).toHaveLength(6);
  });

  it('should register all prompt names', () => {
    const registry = new PromptRegistry();
    registerAllPrompts(registry);
    const names = registry.getAll().map((p) => p.name);
    expect(names).toContain('create_ecs_feature');
    expect(names).toContain('create_mvcs_feature');
    expect(names).toContain('refactor_to_strada');
    expect(names).toContain('optimize_performance');
    expect(names).toContain('create_ui_screen');
    expect(names).toContain('setup_module');
  });

  it('should have descriptions for all prompts', () => {
    const registry = new PromptRegistry();
    registerAllPrompts(registry);
    for (const prompt of registry.getAll()) {
      expect(prompt.description.length).toBeGreaterThan(10);
    }
  });

  it('should have at least one required argument per prompt', () => {
    const registry = new PromptRegistry();
    registerAllPrompts(registry);
    for (const prompt of registry.getAll()) {
      const required = prompt.arguments.filter((a) => a.required);
      expect(required.length).toBeGreaterThanOrEqual(1);
    }
  });
});
```

**Step 4: Implement prompt registration**

```typescript
// src/prompts/register-prompts.ts
import { PromptRegistry } from './prompt-registry.js';
import { CreateEcsFeaturePrompt } from './strada/create-ecs-feature.js';
import { CreateMvcsFeaturePrompt } from './strada/create-mvcs-feature.js';
import { RefactorToStradaPrompt } from './strada/refactor-to-strada.js';
import { OptimizePerformancePrompt } from './strada/optimize-performance.js';
import { CreateUiScreenPrompt } from './strada/create-ui-screen.js';
import { SetupModulePrompt } from './strada/setup-module.js';

export function registerAllPrompts(registry: PromptRegistry): void {
  registry.register(new CreateEcsFeaturePrompt());
  registry.register(new CreateMvcsFeaturePrompt());
  registry.register(new RefactorToStradaPrompt());
  registry.register(new OptimizePerformancePrompt());
  registry.register(new CreateUiScreenPrompt());
  registry.register(new SetupModulePrompt());
}
```

**Step 5: Wire into MCP server**

Update `src/server.ts` to include ResourceRegistry and PromptRegistry in `StradaMcpServerInstance`. Wire each resource to `server.resource()` and each prompt to `server.prompt()`:

```typescript
// In src/server.ts -- updated exports and createMcpServer()
import { ResourceRegistry } from './resources/resource-registry.js';
import { PromptRegistry } from './prompts/prompt-registry.js';
import { registerAllResources } from './resources/register-resources.js';
import { registerAllPrompts } from './prompts/register-prompts.js';

export interface StradaMcpServerInstance {
  server: McpServer;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
}

// Inside createMcpServer():
// 1. Create registries
// 2. Call registerAllResources(resourceRegistry)
// 3. Call registerAllPrompts(promptRegistry)
// 4. For each resource: server.resource(name, uri, { description }, handler)
// 5. For each prompt: server.prompt(name, { description }, handler)
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (~65 tests for Phase 13)

**Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add src/resources/ src/prompts/ src/server.ts src/bridge/
git commit -m "feat: register all 10 resources + 6 prompts with MCP server"
```

---

### Phase 13 Test Summary

| Test file | Tests |
|-----------|-------|
| `resource-registry.test.ts` | 5 |
| `prompt-registry.test.ts` | 3 |
| `strada-resources.test.ts` | 10 |
| `unity-file-resources.test.ts` | 11 |
| `unity-bridge-resources.test.ts` | 8 |
| `strada-prompts.test.ts` | 7 |
| `refactor-optimize-prompts.test.ts` | 7 |
| `ui-module-prompts.test.ts` | 5 |
| `register-resources.test.ts` | 5 |
| `register-prompts.test.ts` | 4 |
| **Total** | **~65** |

### Phase 13 File Manifest

```
src/
  bridge/
    bridge-client.interface.ts           # IBridgeClient (minimal, Phase 7 provides full)
  resources/
    resource.interface.ts                # IResource, ResourceContent, ResourceMetadata
    resource-registry.ts                 # ResourceRegistry
    resource-registry.test.ts            # 5 tests
    register-resources.ts                # registerAllResources()
    register-resources.test.ts           # 5 tests
    strada/
      api-reference.ts                   # strada://api-reference
      namespaces.ts                      # strada://namespaces
      examples.ts                        # strada://examples/{pattern}
      strada-resources.test.ts           # 10 tests
    unity/
      packages.ts                        # unity://packages
      assets.ts                          # unity://assets/{type}
      tags-layers.ts                     # unity://tags-layers
      build-settings.ts                  # unity://build-settings
      project-info.ts                    # unity://project-info (bridge + fallback)
      scene-hierarchy.ts                 # unity://scene-hierarchy (bridge only)
      console-logs.ts                    # unity://console-logs (bridge only)
      unity-file-resources.test.ts       # 11 tests
      unity-bridge-resources.test.ts     # 8 tests
  prompts/
    prompt.interface.ts                  # IPrompt, PromptArgument, PromptMessage
    prompt-registry.ts                   # PromptRegistry
    prompt-registry.test.ts              # 3 tests
    register-prompts.ts                  # registerAllPrompts()
    register-prompts.test.ts             # 4 tests
    strada/
      create-ecs-feature.ts             # create_ecs_feature prompt
      create-mvcs-feature.ts            # create_mvcs_feature prompt
      refactor-to-strada.ts             # refactor_to_strada prompt
      optimize-performance.ts           # optimize_performance prompt
      create-ui-screen.ts               # create_ui_screen prompt
      setup-module.ts                   # setup_module prompt
      strada-prompts.test.ts            # 7 tests
      refactor-optimize-prompts.test.ts # 7 tests
      ui-module-prompts.test.ts         # 5 tests
```

**Phase 13 complete.** Deliverables:
- 10 MCP resources (3 Strada static, 4 Unity file-based, 3 Unity bridge)
- 6 MCP prompts (ECS, MVCS, refactor, optimize, UI, module)
- Resource + Prompt registries with bridge-aware availability filtering
- All resources wired to `server.resource()`, all prompts to `server.prompt()`
- ~65 tests passing
