import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ToolContext } from '../tool.interface.js';
import { CodeQualityTool } from './code-quality.js';

let tmpDir: string;
let ctx: ToolContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-quality-test-'));
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

describe('CodeQualityTool', () => {
  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------
  it('should have correct metadata', () => {
    const tool = new CodeQualityTool();
    expect(tool.name).toBe('code_quality');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Rule: Component struct with managed reference fields
  // -----------------------------------------------------------------------
  it('should detect component struct with managed reference fields', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'BadComp.cs'),
      `
namespace Game
{
    public struct BadComp : IComponent
    {
        public string Name;
        public int[] Scores;
        public float Value;
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.issues.some((i: { rule: string }) => i.rule === 'component-managed-field')).toBe(
      true,
    );
    const managedIssues = report.issues.filter(
      (i: { rule: string }) => i.rule === 'component-managed-field',
    );
    expect(managedIssues.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Rule: System without [StradaSystem] attribute
  // -----------------------------------------------------------------------
  it('should detect system without [StradaSystem] attribute', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'NoAttr.cs'),
      `
namespace Game
{
    public class MovementSystem : SystemBase
    {
        protected override void OnUpdate(float deltaTime) {}
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'system-missing-attribute'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: System with public mutable state
  // -----------------------------------------------------------------------
  it('should detect system with public mutable state', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'MutableSys.cs'),
      `
namespace Game
{
    [StradaSystem]
    public class MutableSystem : SystemBase
    {
        public int Counter;
        public string Label;

        protected override void OnUpdate(float deltaTime) {}
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'system-public-mutable-state'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: Service not registered as singleton
  // (Detected by checking if service class does not have marker comment/attribute)
  // Actually: we detect services extending Service/TickableService that are registered
  // with non-singleton lifetime. Since we parse code, we check module configs.
  // Simplified: detect service classes that aren't registered in any module config.
  // -----------------------------------------------------------------------
  it('should detect service not in a module registration', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'MyService.cs'),
      `
namespace Game
{
    public class AudioService : Service {}
}`,
    );
    // No module config registering it

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'service-not-registered'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: Module without Configure method
  // -----------------------------------------------------------------------
  it('should detect module without Configure method', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'BadModule.cs'),
      `
namespace Game
{
    public class BadModuleConfig : ModuleConfig
    {
        public void Initialize() {}
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'module-missing-configure'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: ForEach query with >8 components
  // -----------------------------------------------------------------------
  it('should detect ForEach query with more than 8 components', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'BigQuery.cs'),
      `
namespace Game
{
    [StradaSystem]
    public class BigQuerySystem : SystemBase
    {
        protected override void OnUpdate(float deltaTime)
        {
            ForEach<A, B, C, D, E, F, G, H, I>((int e, ref A a, ref B b, ref C c, ref D d, ref E ee, ref F f, ref G g, ref H h, ref I i) => {});
        }
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'foreach-too-many-components'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: Missing [StructLayout] on component
  // -----------------------------------------------------------------------
  it('should detect missing [StructLayout] on component', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'NoLayout.cs'),
      `
namespace Game
{
    public struct Speed : IComponent
    {
        public float Value;
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'component-missing-struct-layout'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: Direct EntityManager access outside systems
  // -----------------------------------------------------------------------
  it('should detect direct EntityManager access outside systems', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'BadAccess.cs'),
      `
namespace Game
{
    public class GameController : Controller<GameModel>
    {
        [Inject] private readonly EntityManager _entityManager;
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'entity-manager-outside-system'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rule: Circular namespace dependencies
  // -----------------------------------------------------------------------
  it('should detect circular namespace dependencies', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'A.cs'),
      `
using Game.Systems;
namespace Game.Components
{
    public struct Health : IComponent { public float Value; }
}`,
    );

    await fs.writeFile(
      path.join(dir, 'B.cs'),
      `
using Game.Components;
namespace Game.Systems
{
    [StradaSystem]
    public class HealthSystem : SystemBase {}
}`,
    );

    // This is NOT circular: Components -> Systems using, Systems -> Components using
    // That's fine. Let's create an actual cycle:
    await fs.writeFile(
      path.join(dir, 'C.cs'),
      `
using Game.Models;
namespace Game.Services
{
    public class DataService : Service {}
}`,
    );

    await fs.writeFile(
      path.join(dir, 'D.cs'),
      `
using Game.Services;
namespace Game.Models
{
    public class DataModel : Model {}
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(
      report.issues.some((i: { rule: string }) => i.rule === 'circular-namespace-dependency'),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Clean code should pass
  // -----------------------------------------------------------------------
  it('should report no issues for clean code', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'Good.cs'),
      `
using System.Runtime.InteropServices;

namespace Game.Components
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent
    {
        public float Current;
        public float Max;
    }
}`,
    );
    await fs.writeFile(
      path.join(dir, 'GoodSys.cs'),
      `
using Game.Components;

namespace Game.Systems
{
    [StradaSystem]
    [UpdatePhase(UpdatePhase.Update)]
    public class HealthSystem : SystemBase
    {
        private int _counter;

        protected override void OnUpdate(float deltaTime)
        {
            ForEach<Health>((int entity, ref Health h) => {});
        }
    }
}`,
    );
    await fs.writeFile(
      path.join(dir, 'GoodModule.cs'),
      `
namespace Game
{
    public class GameModuleConfig : ModuleConfig
    {
        public override void Configure(IModuleBuilder builder)
        {
        }
    }
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.issues.length).toBe(0);
    expect(report.score).toBe(100);
  });

  // -----------------------------------------------------------------------
  // Score calculation
  // -----------------------------------------------------------------------
  it('should calculate a score based on issues', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'Issues.cs'),
      `
namespace Game
{
    public struct Bad : IComponent { public string Name; }
    public class NoAttrSystem : SystemBase {}
}`,
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.score).toBeDefined();
    expect(report.score).toBeLessThan(100);
    expect(report.score).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // Custom path
  // -----------------------------------------------------------------------
  it('should accept a custom scan path', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, 'Test.cs'),
      'namespace Sub { public class Foo : SystemBase {} }',
    );

    const tool = new CodeQualityTool();
    const result = await tool.execute({ path: 'sub' }, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.issues.some((i: { rule: string }) => i.rule === 'system-missing-attribute')).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // Empty project
  // -----------------------------------------------------------------------
  it('should handle empty project', async () => {
    const tool = new CodeQualityTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.issues).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.filesScanned).toBe(0);
  });
});
