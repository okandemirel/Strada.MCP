import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ToolContext } from '../tool.interface.js';
import { ComponentCreateTool } from './component-create.js';
import { SystemCreateTool } from './system-create.js';
import { ModuleCreateTool } from './module-create.js';
import { MediatorCreateTool } from './mediator-create.js';
import { ServiceCreateTool } from './service-create.js';
import { ControllerCreateTool } from './controller-create.js';
import { ModelCreateTool } from './model-create.js';
import { ProjectAnalyzeTool } from './project-analyze.js';
import { ArchitectureValidateTool } from './architecture-validate.js';
import { FeatureScaffoldTool } from './feature-scaffold.js';

let tmpDir: string;
let ctx: ToolContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strada-test-'));
  ctx = { projectPath: tmpDir, workingDirectory: tmpDir, readOnly: false, unityBridgeConnected: false };
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. strada_create_component
// ---------------------------------------------------------------------------
describe('ComponentCreateTool', () => {
  it('should generate valid component struct', async () => {
    const tool = new ComponentCreateTool();
    const result = await tool.execute({
      name: 'Health',
      namespace: 'Game.Components',
      path: 'Assets/Scripts/Components',
      fields: [
        { name: 'Current', type: 'float' },
        { name: 'Max', type: 'float' },
      ],
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/Components/Health.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.ECS;');
    expect(file).toContain('using System.Runtime.InteropServices;');
    expect(file).toContain('namespace Game.Components');
    expect(file).toContain('public struct Health : IComponent');
    expect(file).toContain('public float Current;');
    expect(file).toContain('public float Max;');
    expect(file).toContain('[StructLayout(LayoutKind.Sequential)]');
  });

  it('should include XML doc when description is provided', async () => {
    const tool = new ComponentCreateTool();
    await tool.execute({
      name: 'Speed',
      namespace: 'Game',
      path: 'Assets',
      fields: [{ name: 'Value', type: 'float' }],
      description: 'Movement speed component',
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/Speed.cs'), 'utf-8');
    expect(file).toContain('/// <summary>');
    expect(file).toContain('/// Movement speed component');
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
    expect(result.content).toContain('Invalid C# identifier');
  });

  it('should reject invalid field identifier', async () => {
    const tool = new ComponentCreateTool();
    const result = await tool.execute({
      name: 'Valid',
      namespace: 'Game',
      path: 'Assets',
      fields: [{ name: 'class', type: 'int' }],
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Invalid field identifier');
  });

  it('should reject in read-only mode', async () => {
    const tool = new ComponentCreateTool();
    const result = await tool.execute(
      { name: 'Test', namespace: 'Game', path: 'Assets', fields: [] },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('read-only');
  });

  it('should report metadata', () => {
    const tool = new ComponentCreateTool();
    expect(tool.name).toBe('strada_create_component');
    expect(tool.metadata.category).toBe('strada');
    expect(tool.metadata.requiresBridge).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. strada_create_system
// ---------------------------------------------------------------------------
describe('SystemCreateTool', () => {
  it('should generate SystemBase with attributes', async () => {
    const tool = new SystemCreateTool();
    const result = await tool.execute({
      name: 'MovementSystem',
      namespace: 'Game.Systems',
      path: 'Assets/Scripts/Systems',
      baseType: 'SystemBase',
      updatePhase: 'Update',
      executionOrder: 10,
      components: ['Position', 'Velocity'],
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/Systems/MovementSystem.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.ECS;');
    expect(file).toContain('using Strada.Core.ECS.Systems;');
    expect(file).toContain('using Strada.Core.ECS.Query;');
    expect(file).toContain('[StradaSystem]');
    expect(file).toContain('[UpdatePhase(UpdatePhase.Update)]');
    expect(file).toContain('[ExecutionOrder(10)]');
    expect(file).toContain('class MovementSystem : SystemBase');
    expect(file).toContain('ForEach<Position, Velocity>');
    expect(file).toContain('ref Position c0, ref Velocity c1');
    expect(file).toContain('OnInitialize()');
    expect(file).toContain('OnUpdate(float deltaTime)');
    expect(file).toContain('OnDispose()');
  });

  it('should handle runBefore and runAfter', async () => {
    const tool = new SystemCreateTool();
    await tool.execute({
      name: 'PhysicsSystem',
      namespace: 'Game',
      path: 'Assets',
      baseType: 'BurstSystemBase',
      runBefore: ['RenderSystem'],
      runAfter: ['InputSystem'],
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/PhysicsSystem.cs'), 'utf-8');
    expect(file).toContain('[RunBefore(typeof(RenderSystem))]');
    expect(file).toContain('[RunAfter(typeof(InputSystem))]');
    expect(file).toContain('BurstSystemBase');
  });

  it('should reject invalid identifier', async () => {
    const tool = new SystemCreateTool();
    const result = await tool.execute({
      name: 'class',
      namespace: 'Game',
      path: 'Assets',
      baseType: 'SystemBase',
    }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const tool = new SystemCreateTool();
    const result = await tool.execute(
      { name: 'Test', namespace: 'Game', path: 'Assets', baseType: 'SystemBase' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. strada_create_module
// ---------------------------------------------------------------------------
describe('ModuleCreateTool', () => {
  it('should create module folder structure with config and asmdef', async () => {
    const tool = new ModuleCreateTool();
    const result = await tool.execute({
      moduleName: 'Combat',
      namespace: 'Game.Combat',
      path: 'Assets/Modules',
    }, ctx);

    expect(result.isError).toBeFalsy();
    const config = await fs.readFile(
      path.join(tmpDir, 'Assets/Modules/Combat/Scripts/CombatModuleConfig.cs'),
      'utf-8',
    );
    expect(config).toContain('using Strada.Core.Modules;');
    expect(config).toContain('using Strada.Core.DI;');
    expect(config).toContain('class CombatModuleConfig : ModuleConfig');
    expect(config).toContain('Configure(IModuleBuilder builder)');
    expect(config).toContain('Initialize(IServiceLocator services)');
    expect(config).toContain('Shutdown()');

    const asmdef = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, 'Assets/Modules/Combat/Game.Combat.asmdef'),
        'utf-8',
      ),
    );
    expect(asmdef.name).toBe('Game.Combat');
    expect(asmdef.references).toContain('Strada.Core');
  });

  it('should create editor folder when hasEditor is true', async () => {
    const tool = new ModuleCreateTool();
    await tool.execute({
      moduleName: 'UI',
      namespace: 'Game.UI',
      path: 'Assets/Modules',
      hasEditor: true,
    }, ctx);

    const editorAsmdef = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, 'Assets/Modules/UI/Editor/Game.UI.Editor.asmdef'),
        'utf-8',
      ),
    );
    expect(editorAsmdef.includePlatforms).toContain('Editor');
    expect(editorAsmdef.references).toContain('Game.UI');
  });

  it('should include extra references', async () => {
    const tool = new ModuleCreateTool();
    await tool.execute({
      moduleName: 'Net',
      namespace: 'Game.Net',
      path: 'Assets',
      references: ['Unity.Netcode'],
    }, ctx);

    const asmdef = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'Assets/Net/Game.Net.asmdef'), 'utf-8'),
    );
    expect(asmdef.references).toContain('Unity.Netcode');
    expect(asmdef.references).toContain('Strada.Core');
  });

  it('should reject invalid identifier', async () => {
    const tool = new ModuleCreateTool();
    const result = await tool.execute({
      moduleName: '1Bad',
      namespace: 'Game',
      path: 'Assets',
    }, ctx);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. strada_create_mediator
// ---------------------------------------------------------------------------
describe('MediatorCreateTool', () => {
  it('should generate mediator with sync and push bindings', async () => {
    const tool = new MediatorCreateTool();
    const result = await tool.execute({
      name: 'HealthMediator',
      namespace: 'Game.Mediators',
      path: 'Assets/Scripts',
      viewType: 'HealthBarView',
      syncBindings: [{ component: 'Health', viewProperty: 'HealthValue' }],
      pushBindings: [{ component: 'Health', viewProperty: 'HealthValue' }],
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/HealthMediator.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.ECS;');
    expect(file).toContain('using Strada.Core.Sync;');
    expect(file).toContain('using Strada.Core.Patterns;');
    expect(file).toContain('class HealthMediator : EntityMediator<HealthBarView>');
    expect(file).toContain('SetupSyncBindings()');
    expect(file).toContain('Sync<Health>');
    expect(file).toContain('SetupPushBindings()');
    expect(file).toContain('Push<Health>');
  });

  it('should omit push bindings when not specified', async () => {
    const tool = new MediatorCreateTool();
    await tool.execute({
      name: 'SimpleMediator',
      namespace: 'Game',
      path: 'Assets',
      viewType: 'SimpleView',
      syncBindings: [{ component: 'Position', viewProperty: 'Pos' }],
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/SimpleMediator.cs'), 'utf-8');
    expect(file).toContain('SetupSyncBindings()');
    expect(file).not.toContain('SetupPushBindings()');
  });

  it('should reject invalid identifier', async () => {
    const tool = new MediatorCreateTool();
    const result = await tool.execute({
      name: 'void',
      namespace: 'Game',
      path: 'Assets',
      viewType: 'V',
      syncBindings: [],
    }, ctx);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. strada_create_service
// ---------------------------------------------------------------------------
describe('ServiceCreateTool', () => {
  it('should generate a basic Service', async () => {
    const tool = new ServiceCreateTool();
    const result = await tool.execute({
      name: 'AudioService',
      namespace: 'Game.Services',
      path: 'Assets/Scripts',
      serviceType: 'Service',
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/AudioService.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.Patterns;');
    expect(file).toContain('class AudioService : Service');
    expect(file).not.toContain('Tick(float deltaTime)');
  });

  it('should generate TickableService with Tick method', async () => {
    const tool = new ServiceCreateTool();
    await tool.execute({
      name: 'UpdateService',
      namespace: 'Game',
      path: 'Assets',
      serviceType: 'TickableService',
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/UpdateService.cs'), 'utf-8');
    expect(file).toContain('TickableService');
    expect(file).toContain('Tick(float deltaTime)');
  });

  it('should generate OrderedService with Order property', async () => {
    const tool = new ServiceCreateTool();
    await tool.execute({
      name: 'PriorityService',
      namespace: 'Game',
      path: 'Assets',
      serviceType: 'OrderedService',
      tickOrder: 5,
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/PriorityService.cs'), 'utf-8');
    expect(file).toContain('OrderedService');
    expect(file).toContain('override int Order => 5');
  });

  it('should reject in read-only mode', async () => {
    const tool = new ServiceCreateTool();
    const result = await tool.execute(
      { name: 'Test', namespace: 'G', path: 'A' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. strada_create_controller
// ---------------------------------------------------------------------------
describe('ControllerCreateTool', () => {
  it('should generate controller with model and view injection', async () => {
    const tool = new ControllerCreateTool();
    const result = await tool.execute({
      name: 'InventoryController',
      namespace: 'Game.Controllers',
      path: 'Assets/Scripts',
      modelType: 'InventoryModel',
      viewType: 'InventoryView',
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/InventoryController.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.Patterns;');
    expect(file).toContain('using Strada.Core.DI;');
    expect(file).toContain('class InventoryController : Controller<InventoryModel>');
    expect(file).toContain('[Inject] private readonly InventoryView _view;');
    expect(file).toContain('Initialize()');
    expect(file).toContain('Dispose()');
  });

  it('should reject invalid identifier', async () => {
    const tool = new ControllerCreateTool();
    const result = await tool.execute({
      name: 'return',
      namespace: 'G',
      path: 'A',
      modelType: 'M',
      viewType: 'V',
    }, ctx);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. strada_create_model
// ---------------------------------------------------------------------------
describe('ModelCreateTool', () => {
  it('should generate basic Model with properties', async () => {
    const tool = new ModelCreateTool();
    const result = await tool.execute({
      name: 'PlayerModel',
      namespace: 'Game.Models',
      path: 'Assets/Scripts',
      properties: [
        { name: 'Name', type: 'string' },
        { name: 'Level', type: 'int' },
      ],
    }, ctx);

    expect(result.isError).toBeFalsy();
    const file = await fs.readFile(
      path.join(tmpDir, 'Assets/Scripts/PlayerModel.cs'),
      'utf-8',
    );
    expect(file).toContain('using Strada.Core.Patterns;');
    expect(file).toContain('class PlayerModel : Model');
    expect(file).toContain('public string Name { get; set; }');
    expect(file).toContain('public int Level { get; set; }');
    expect(file).not.toContain('ReactiveProperty');
  });

  it('should generate ReactiveModel with reactive properties', async () => {
    const tool = new ModelCreateTool();
    await tool.execute({
      name: 'ScoreModel',
      namespace: 'Game',
      path: 'Assets',
      properties: [
        { name: 'Score', type: 'int', reactive: true },
        { name: 'Label', type: 'string' },
      ],
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/ScoreModel.cs'), 'utf-8');
    expect(file).toContain('using Strada.Core.Sync;');
    expect(file).toContain('class ScoreModel : ReactiveModel');
    expect(file).toContain('ReactiveProperty<int> Score');
    expect(file).toContain('public string Label { get; set; }');
  });

  it('should generate Model<TData> when dataType is specified', async () => {
    const tool = new ModelCreateTool();
    await tool.execute({
      name: 'SaveModel',
      namespace: 'Game',
      path: 'Assets',
      properties: [],
      dataType: 'SaveData',
    }, ctx);

    const file = await fs.readFile(path.join(tmpDir, 'Assets/SaveModel.cs'), 'utf-8');
    expect(file).toContain('class SaveModel : Model<SaveData>');
  });
});

// ---------------------------------------------------------------------------
// 8. strada_analyze_project
// ---------------------------------------------------------------------------
describe('ProjectAnalyzeTool', () => {
  it('should scan and categorize .cs files', async () => {
    // Create sample files
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(path.join(dir, 'Health.cs'), `
using Strada.Core.ECS;
namespace Game.Components
{
    public struct Health : IComponent { public float Current; }
}
`);
    await fs.writeFile(path.join(dir, 'MovementSystem.cs'), `
using Strada.Core.ECS.Systems;
namespace Game.Systems
{
    [StradaSystem]
    public class MovementSystem : SystemBase { }
}
`);
    await fs.writeFile(path.join(dir, 'GameModule.cs'), `
namespace Game
{
    public class GameModuleConfig : ModuleConfig { public override void Configure(IModuleBuilder b) {} }
}
`);

    const tool = new ProjectAnalyzeTool();
    const result = await tool.execute({}, ctx);

    expect(result.isError).toBeFalsy();
    const analysis = JSON.parse(result.content);
    expect(analysis.fileCount).toBe(3);
    expect(analysis.components.length).toBe(1);
    expect(analysis.components[0]).toContain('Health');
    expect(analysis.systems.length).toBe(1);
    expect(analysis.systems[0]).toContain('MovementSystem');
    expect(analysis.modules.length).toBe(1);
    expect(analysis.modules[0]).toContain('GameModuleConfig');
    expect(analysis.namespaces).toContain('Game.Components');
  });

  it('should handle empty project', async () => {
    const tool = new ProjectAnalyzeTool();
    const result = await tool.execute({}, ctx);

    expect(result.isError).toBeFalsy();
    const analysis = JSON.parse(result.content);
    expect(analysis.fileCount).toBe(0);
  });

  it('should accept custom path', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'Test.cs'), 'namespace Sub {}');

    const tool = new ProjectAnalyzeTool();
    const result = await tool.execute({ path: 'sub' }, ctx);

    expect(result.isError).toBeFalsy();
    const analysis = JSON.parse(result.content);
    expect(analysis.fileCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. strada_validate_architecture
// ---------------------------------------------------------------------------
describe('ArchitectureValidateTool', () => {
  it('should detect missing [StradaSystem] attribute', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'BadSystem.cs'), `
namespace Game
{
    public class BadSystem : SystemBase
    {
        protected override void OnUpdate(float deltaTime) {}
    }
}
`);

    const tool = new ArchitectureValidateTool();
    const result = await tool.execute({}, ctx);

    const report = JSON.parse(result.content);
    expect(report.passed).toBe(false);
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues.some((i: { rule: string }) => i.rule === 'system-attribute')).toBe(true);
  });

  it('should detect component as class instead of struct', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'BadComp.cs'), `
namespace Game
{
    public class BadComp : IComponent { }
}
`);

    const tool = new ArchitectureValidateTool();
    const result = await tool.execute({}, ctx);

    const report = JSON.parse(result.content);
    expect(report.issues.some((i: { rule: string }) => i.rule === 'component-struct')).toBe(true);
  });

  it('should pass for correct code', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'Good.cs'), `
using System.Runtime.InteropServices;
namespace Game
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent { public float Value; }

    [StradaSystem]
    [UpdatePhase(UpdatePhase.Update)]
    public class HealthSystem : SystemBase { }

    public class GameModuleConfig : ModuleConfig
    {
        public override void Configure(IModuleBuilder b) {}
    }
}
`);

    const tool = new ArchitectureValidateTool();
    const result = await tool.execute({}, ctx);

    const report = JSON.parse(result.content);
    expect(report.passed).toBe(true);
    expect(report.errors).toBe(0);
  });

  it('should warn about missing system suffix', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'Movement.cs'), `
namespace Game
{
    [StradaSystem]
    [UpdatePhase(UpdatePhase.Update)]
    public class Movement : SystemBase { }
}
`);

    const tool = new ArchitectureValidateTool();
    const result = await tool.execute({}, ctx);

    const report = JSON.parse(result.content);
    expect(report.warnings).toBeGreaterThan(0);
    expect(report.issues.some((i: { rule: string }) => i.rule === 'naming-system-suffix')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. strada_scaffold_feature
// ---------------------------------------------------------------------------
describe('FeatureScaffoldTool', () => {
  it('should scaffold a complete feature with module, components, and systems', async () => {
    const tool = new FeatureScaffoldTool();
    const result = await tool.execute({
      featureName: 'Combat',
      path: 'Assets/Modules',
      components: [
        { name: 'Health', fields: [{ name: 'Current', type: 'float' }] },
        { name: 'Damage', fields: [{ name: 'Amount', type: 'int' }] },
      ],
      systems: [
        { name: 'DamageSystem', components: ['Health', 'Damage'] },
      ],
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.metadata?.filesAffected).toBeDefined();
    const files = result.metadata!.filesAffected!;

    // Module files
    expect(files.some((f) => f.includes('CombatModuleConfig.cs'))).toBe(true);
    expect(files.some((f) => f.includes('.asmdef'))).toBe(true);

    // Component files
    expect(files.some((f) => f.includes('Health.cs'))).toBe(true);
    expect(files.some((f) => f.includes('Damage.cs'))).toBe(true);

    // System files
    expect(files.some((f) => f.includes('DamageSystem.cs'))).toBe(true);

    // Verify file contents
    const systemFile = await fs.readFile(
      path.join(tmpDir, 'Assets/Modules/Combat/Scripts/Systems/DamageSystem.cs'),
      'utf-8',
    );
    expect(systemFile).toContain('ForEach<Health, Damage>');
  });

  it('should scaffold with MVCS view layer when hasView is true', async () => {
    const tool = new FeatureScaffoldTool();
    const result = await tool.execute({
      featureName: 'Inventory',
      path: 'Assets/Modules',
      components: [
        { name: 'ItemSlot', fields: [{ name: 'ItemId', type: 'int' }] },
      ],
      systems: [],
      hasView: true,
    }, ctx);

    expect(result.isError).toBeFalsy();
    const files = result.metadata!.filesAffected!;

    expect(files.some((f) => f.includes('InventoryModel.cs'))).toBe(true);
    expect(files.some((f) => f.includes('InventoryController.cs'))).toBe(true);
    expect(files.some((f) => f.includes('InventoryMediator.cs'))).toBe(true);
    expect(files.some((f) => f.includes('InventoryService.cs'))).toBe(true);
  });

  it('should scaffold minimal feature with only module', async () => {
    const tool = new FeatureScaffoldTool();
    const result = await tool.execute({
      featureName: 'Audio',
      path: 'Assets',
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.metadata?.filesAffected?.length).toBeGreaterThanOrEqual(2); // config + asmdef
  });

  it('should reject invalid feature name', async () => {
    const tool = new FeatureScaffoldTool();
    const result = await tool.execute({
      featureName: '123bad',
      path: 'Assets',
    }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should reject in read-only mode', async () => {
    const tool = new FeatureScaffoldTool();
    const result = await tool.execute(
      { featureName: 'Test', path: 'Assets' },
      { ...ctx, readOnly: true },
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: all tools have correct metadata
// ---------------------------------------------------------------------------
describe('Tool metadata', () => {
  const tools = [
    new ComponentCreateTool(),
    new SystemCreateTool(),
    new ModuleCreateTool(),
    new MediatorCreateTool(),
    new ServiceCreateTool(),
    new ControllerCreateTool(),
    new ModelCreateTool(),
    new ProjectAnalyzeTool(),
    new ArchitectureValidateTool(),
    new FeatureScaffoldTool(),
  ];

  it('all tools have unique names', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all tools have strada category', () => {
    for (const tool of tools) {
      expect(tool.metadata.category).toBe('strada');
    }
  });

  it('no tools require bridge', () => {
    for (const tool of tools) {
      expect(tool.metadata.requiresBridge).toBe(false);
    }
  });

  it('analyze and validate tools are readOnly', () => {
    const analyzeTool = tools.find((t) => t.name === 'strada_analyze_project')!;
    const validateTool = tools.find((t) => t.name === 'strada_validate_architecture')!;
    expect(analyzeTool.metadata.readOnly).toBe(true);
    expect(validateTool.metadata.readOnly).toBe(true);
  });
});
