# Phase 4: Strada Framework Tools + API Reference

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 10 Strada.Core framework-aware tools — the unique differentiator that no competitor has. These tools generate compile-clean C# code following Strada.Core patterns.

**Architecture:** All Strada tools share the `strada-api-reference.ts` constants module as the single source of truth for namespaces, base classes, attributes, and API patterns. Each tool generates C# code using template functions, NOT string concatenation.

**Tech Stack:** TypeScript template functions, zod validation, fs/promises

**Reference:** `/Users/okanunico/Documents/Strada/Strada.Brain/src/agents/context/strada-api-reference.ts` — authoritative API constants. `/Users/okanunico/Documents/Strada/Strada.Core/` — framework source code.

---

### Task 1: Strada API Reference Constants

**Files:**
- Create: `src/context/strada-api-reference.ts`

This is the single source of truth for all Strada.Core API references. Ported and expanded from Strada.Brain.

```typescript
// src/context/strada-api-reference.ts
export const STRADA_API = {
  namespaces: {
    root: 'Strada.Core',
    ecs: 'Strada.Core.ECS',
    ecsCore: 'Strada.Core.ECS.Core',
    systems: 'Strada.Core.ECS.Systems',
    query: 'Strada.Core.ECS.Query',
    storage: 'Strada.Core.ECS.Storage',
    jobs: 'Strada.Core.ECS.Jobs',
    di: 'Strada.Core.DI',
    diAttributes: 'Strada.Core.DI.Attributes',
    modules: 'Strada.Core.Modules',
    sync: 'Strada.Core.Sync',
    communication: 'Strada.Core.Communication',
    patterns: 'Strada.Core.Patterns',
    pooling: 'Strada.Core.Pooling',
    stateMachine: 'Strada.Core.StateMachine',
    commands: 'Strada.Core.Commands',
    bootstrap: 'Strada.Core.Bootstrap',
    logging: 'Strada.Core.Logging',
  },

  baseClasses: {
    systems: ['SystemBase', 'JobSystemBase', 'BurstSystemBase'],
    patterns: {
      view: 'View',
      controller: 'Controller',
      controllerGeneric: 'Controller<TModel>',
      model: 'Model',
      modelGeneric: 'Model<TData>',
      reactiveModel: 'ReactiveModel',
      service: 'Service',
      tickableService: 'TickableService',
      fixedTickableService: 'FixedTickableService',
      orderedService: 'OrderedService',
    },
    mediator: 'EntityMediator<TView>',
    moduleConfig: 'ModuleConfig',
  },

  systemAttributes: {
    stradaSystem: '[StradaSystem]',
    updatePhase: (phase: string) => `[UpdatePhase(UpdatePhase.${phase})]`,
    executionOrder: (order: number) => `[ExecutionOrder(${order})]`,
    runBefore: (type: string) => `[RunBefore(typeof(${type}))]`,
    runAfter: (type: string) => `[RunAfter(typeof(${type}))]`,
    requiresSystem: (type: string) => `[RequiresSystem(typeof(${type}))]`,
  },

  updatePhases: ['Initialization', 'Update', 'LateUpdate', 'FixedUpdate'] as const,

  systemApi: {
    abstractMethod: 'OnUpdate(float deltaTime)',
    lifecycleMethods: ['OnInitialize()', 'OnDispose()'],
    queryPattern: 'ForEach<T1, T2>((int entity, ref T1 c1, ref T2 c2) => { })',
    genericVariants: 8,
    builtInProperties: ['EntityManager', 'EventBus', 'HandleRegistry'],
  },

  diApi: {
    fieldInjection: '[Inject] private readonly T _field;',
    registration: {
      service: 'builder.RegisterService<TInterface, TImpl>()',
      controller: 'builder.RegisterController<T>()',
      model: 'builder.RegisterModel<TInterface, TImpl>()',
      factory: 'builder.RegisterFactory<TInterface, TImpl>()',
      instance: 'builder.RegisterInstance<T>(instance)',
    },
    lifetimes: ['Singleton', 'Transient', 'Scoped'] as const,
  },

  componentApi: {
    interface: 'IComponent',
    structLayout: '[StructLayout(LayoutKind.Sequential)]',
    constraint: 'unmanaged',
    maxQueryComponents: 8,
  },

  moduleApi: {
    configureMethods: ['Configure(IModuleBuilder builder)'],
    lifecycleMethods: ['Initialize(IServiceLocator services)', 'Shutdown()'],
    systemEntry: 'SystemEntry',
    serviceEntry: 'ServiceEntry',
  },

  syncApi: {
    reactiveProperty: 'ReactiveProperty<T>',
    reactiveCollection: 'ReactiveCollection<T>',
    computedProperty: 'ComputedProperty<T>',
    syncEvents: ['ComponentChanged<T>', 'ComponentAdded<T>', 'ComponentRemoved<T>', 'EntityCreated', 'EntityDestroyed'],
  },

  communicationApi: {
    publish: 'Publish<TEvent>(TEvent)',
    subscribe: 'Subscribe<TEvent>(Action<TEvent>)',
    send: 'Send<TSignal>(TSignal)',
    query: 'Query<TQuery, TResult>(TQuery)',
  },

  assemblyReferences: {
    core: 'Strada.Core',
  },
} as const;
```

```bash
git add src/context/
git commit -m "feat: add authoritative Strada.Core API reference constants"
```

---

### Task 2: strada_create_component

**Files:**
- Create: `src/tools/strada/component-create.ts`
- Create: `src/tools/strada/component-create.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/strada/component-create.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentCreateTool } from './component-create.js';
import type { ToolContext } from '../tool.interface.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('ComponentCreateTool', () => {
  let tmpDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-test-'));
    ctx = { projectPath: tmpDir, workingDirectory: tmpDir, readOnly: false, unityBridgeConnected: false };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should generate valid component struct', async () => {
    const tool = new ComponentCreateTool();
    const result = await tool.execute({
      name: 'Health',
      namespace: 'Game.Components',
      path: 'Assets/Scripts/Components',
      fields: [
        { name: 'Current', type: 'float', default_value: '100f' },
        { name: 'Max', type: 'float', default_value: '100f' },
      ],
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/Components/Health.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.ECS;');
    expect(file).toContain('namespace Game.Components');
    expect(file).toContain('public struct Health : IComponent');
    expect(file).toContain('public float Current');
    expect(file).toContain('public float Max');
    expect(file).toContain('[StructLayout(LayoutKind.Sequential)]');
  });

  it('should reject invalid C# identifier', async () => {
    const tool = new ComponentCreateTool();
    const result = await tool.execute({
      name: '123Invalid',
      namespace: 'Game',
      path: 'Assets',
      fields: [],
    }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const tool = new ComponentCreateTool();
    const result = await tool.execute(
      { name: 'Test', namespace: 'Game', path: 'Assets', fields: [] },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement component creation tool**

The tool generates:
```csharp
using System.Runtime.InteropServices;
using Strada.Core.ECS;

namespace Game.Components
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent
    {
        public float Current;
        public float Max;
    }
}
```

**Step 3: Run tests, commit**

```bash
npx vitest run src/tools/strada/component-create.test.ts
git add src/tools/strada/component-create.*
git commit -m "feat: add strada_create_component tool"
```

---

### Task 3: strada_create_system

Similar pattern to Task 2. Generates SystemBase/JobSystemBase/BurstSystemBase with:
- `[StradaSystem]` attribute
- `[UpdatePhase(...)]` attribute
- `[ExecutionOrder(...)]` attribute
- `OnInitialize()`, `OnUpdate(float deltaTime)`, `OnDispose()` lifecycle
- ForEach query if components specified
- `[Inject]` fields for dependencies

```bash
git commit -m "feat: add strada_create_system tool"
```

---

### Task 4: strada_create_module

Generates ModuleConfig + .asmdef + folder structure:
- `{Name}ModuleConfig.cs` — ScriptableObject with Configure/Initialize/Shutdown
- `{Name}.asmdef` — Assembly definition with Strada.Core reference
- Folder structure: `{path}/{Name}/Scripts/`, `{path}/{Name}/Editor/`

```bash
git commit -m "feat: add strada_create_module tool"
```

---

### Task 5: strada_create_mediator

Generates EntityMediator<TView> binding ECS to Unity Views:
- Component bindings
- SyncBindings/PushBindings implementation
- Event subscriptions for ComponentChanged

```bash
git commit -m "feat: add strada_create_mediator tool"
```

---

### Task 6: strada_create_service, strada_create_controller, strada_create_model

Three MVCS pattern tools:
- Service: Service/TickableService/OrderedService base class selection
- Controller: Controller<TModel> with typed model reference
- Model: Model/ReactiveModel with ReactiveProperty fields

```bash
git commit -m "feat: add strada service, controller, and model creation tools"
```

---

### Task 7: strada_analyze_project

Scans Unity project directory for:
- All ModuleConfig ScriptableObjects
- All SystemBase subclasses (via regex + file scan)
- Component structs (IComponent)
- Assembly definitions
- Dependency graph (which module references which)
- Statistics (file count, namespace distribution)

Returns structured JSON analysis.

```bash
git commit -m "feat: add strada_analyze_project tool"
```

---

### Task 8: strada_validate_architecture

Validates against Strada.Core best practices:
- Components must be unmanaged structs
- Systems must have [StradaSystem] attribute
- Modules must have Configure method
- Services should be registered as singletons
- No circular assembly references
- Naming conventions (PascalCase, *System suffix, *Component suffix)

Returns validation report with warnings and errors.

```bash
git commit -m "feat: add strada_validate_architecture tool"
```

---

### Task 9: strada_scaffold_feature

Generates a complete feature module with all parts:
- ModuleConfig
- Components (specified by user)
- Systems (specified by user)
- Views + Controllers + Models (if MVCS requested)
- Mediator (if ECS + View bridge needed)
- Assembly definition
- Folder structure

This is the "wizard" tool that combines all other Strada tools.

```bash
git commit -m "feat: add strada_scaffold_feature tool"
```

---

### Task 10: Register all Strada tools + push

```bash
npx vitest run
npx tsc --noEmit
git add .
git commit -m "feat: register all 10 Strada framework tools"
git push origin main
```

**Phase 4 complete.** Deliverables:
- Authoritative Strada.Core API reference (expanded from Brain)
- 10 Strada framework tools — unique competitive advantage
- Framework-aware code generation with compile-clean output
- ~85 tests passing
