import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ToolContext } from '../tool.interface.js';
import { DependencyGraphTool } from './dependency-graph.js';

let tmpDir: string;
let ctx: ToolContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-graph-test-'));
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

describe('DependencyGraphTool', () => {
  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------
  it('should have correct metadata', () => {
    const tool = new DependencyGraphTool();
    expect(tool.name).toBe('dependency_graph');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Assembly definition references
  // -----------------------------------------------------------------------
  it('should parse .asmdef files and extract assembly references', async () => {
    const dir = path.join(tmpDir, 'Assets', 'Game');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'Game.asmdef'),
      JSON.stringify({
        name: 'Game',
        references: ['Strada.Core', 'Unity.Mathematics'],
      }),
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.assemblies).toBeDefined();
    expect(report.assemblies.length).toBe(1);
    expect(report.assemblies[0].name).toBe('Game');
    expect(report.assemblies[0].references).toContain('Strada.Core');
    expect(report.assemblies[0].references).toContain('Unity.Mathematics');
  });

  // -----------------------------------------------------------------------
  // Namespace dependencies from using directives
  // -----------------------------------------------------------------------
  it('should extract namespace dependencies from using directives', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'Player.cs'),
      `
using Strada.Core.ECS;
using Game.Components;

namespace Game.Systems
{
    public class PlayerSystem : SystemBase {}
}`,
    );
    await fs.writeFile(
      path.join(dir, 'Health.cs'),
      `
namespace Game.Components
{
    public struct Health : IComponent { public float Value; }
}`,
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.namespaceDeps).toBeDefined();
    const sysDep = report.namespaceDeps.find(
      (d: { namespace: string }) => d.namespace === 'Game.Systems',
    );
    expect(sysDep).toBeDefined();
    expect(sysDep.dependsOn).toContain('Game.Components');
  });

  // -----------------------------------------------------------------------
  // Circular dependency detection
  // -----------------------------------------------------------------------
  it('should detect circular dependencies between namespaces', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'A.cs'),
      `
using Ns.B;
namespace Ns.A { public class Foo {} }`,
    );
    await fs.writeFile(
      path.join(dir, 'B.cs'),
      `
using Ns.A;
namespace Ns.B { public class Bar {} }`,
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.circularDeps).toBeDefined();
    expect(report.circularDeps.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // No circular deps for clean code
  // -----------------------------------------------------------------------
  it('should report no circular deps for clean architecture', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'Comp.cs'),
      `
namespace Game.Components { public struct Speed : IComponent { public float Value; } }`,
    );
    await fs.writeFile(
      path.join(dir, 'Sys.cs'),
      `
using Game.Components;
namespace Game.Systems { public class SpeedSystem : SystemBase {} }`,
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.circularDeps.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Multiple .asmdef files
  // -----------------------------------------------------------------------
  it('should handle multiple assembly definitions', async () => {
    const dirA = path.join(tmpDir, 'Assets', 'Core');
    const dirB = path.join(tmpDir, 'Assets', 'Game');
    await fs.mkdir(dirA, { recursive: true });
    await fs.mkdir(dirB, { recursive: true });

    await fs.writeFile(
      path.join(dirA, 'Core.asmdef'),
      JSON.stringify({ name: 'Core', references: [] }),
    );
    await fs.writeFile(
      path.join(dirB, 'Game.asmdef'),
      JSON.stringify({ name: 'Game', references: ['Core', 'Strada.Core'] }),
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.assemblies.length).toBe(2);
    const game = report.assemblies.find((a: { name: string }) => a.name === 'Game');
    expect(game.references).toContain('Core');
  });

  // -----------------------------------------------------------------------
  // Human-readable summary
  // -----------------------------------------------------------------------
  it('should include a human-readable summary', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'Foo.cs'),
      'namespace Foo { public class Bar {} }',
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.summary).toBeDefined();
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Empty project
  // -----------------------------------------------------------------------
  it('should handle empty project', async () => {
    const tool = new DependencyGraphTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.assemblies).toEqual([]);
    expect(report.namespaceDeps).toEqual([]);
    expect(report.circularDeps).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Custom path
  // -----------------------------------------------------------------------
  it('should accept a custom scan path', async () => {
    const subDir = path.join(tmpDir, 'sub', 'Scripts');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, 'A.cs'),
      'namespace Sub.A { public class Foo {} }',
    );

    const tool = new DependencyGraphTool();
    const result = await tool.execute({ path: 'sub' }, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.namespaceDeps.length).toBeGreaterThanOrEqual(1);
  });
});
