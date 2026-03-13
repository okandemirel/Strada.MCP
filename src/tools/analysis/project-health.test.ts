import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ToolContext } from '../tool.interface.js';
import { ProjectHealthTool } from './project-health.js';

let tmpDir: string;
let ctx: ToolContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-health-test-'));
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

describe('ProjectHealthTool', () => {
  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------
  it('should have correct metadata', () => {
    const tool = new ProjectHealthTool();
    expect(tool.name).toBe('project_health');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Empty project
  // -----------------------------------------------------------------------
  it('should handle empty project gracefully', async () => {
    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.codeQuality).toBeDefined();
    expect(report.codeQuality.score).toBe(100);
    expect(report.fileStats).toBeDefined();
    expect(report.fileStats.csFileCount).toBe(0);
    expect(report.fileStats.totalLoc).toBe(0);
    expect(report.dependencyHealth).toBeDefined();
    expect(report.overallScore).toBe(100);
  });

  // -----------------------------------------------------------------------
  // File statistics
  // -----------------------------------------------------------------------
  it('should compute file statistics', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'A.cs'),
      `namespace Game.Components
{
    public struct Health : IComponent
    {
        public float Value;
    }
}`,
    );
    await fs.writeFile(
      path.join(dir, 'B.cs'),
      `namespace Game.Systems
{
    public class HealthSystem : SystemBase {}
}`,
    );

    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.fileStats.csFileCount).toBe(2);
    expect(report.fileStats.totalLoc).toBeGreaterThan(0);
    expect(report.fileStats.namespaceDistribution).toBeDefined();
    expect(Object.keys(report.fileStats.namespaceDistribution).length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Namespace distribution
  // -----------------------------------------------------------------------
  it('should calculate namespace distribution', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'A.cs'),
      'namespace Game.Components { public struct Pos : IComponent { public float X; } }',
    );
    await fs.writeFile(
      path.join(dir, 'B.cs'),
      'namespace Game.Components { public struct Vel : IComponent { public float X; } }',
    );
    await fs.writeFile(
      path.join(dir, 'C.cs'),
      'namespace Game.Systems { public class MoveSys : SystemBase {} }',
    );

    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.fileStats.namespaceDistribution['Game.Components']).toBe(2);
    expect(report.fileStats.namespaceDistribution['Game.Systems']).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Code quality integration
  // -----------------------------------------------------------------------
  it('should include code quality score', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    // Create code with issues
    await fs.writeFile(
      path.join(dir, 'Bad.cs'),
      `
namespace Game
{
    public struct Bad : IComponent { public string Name; }
    public class BadSys : SystemBase {}
}`,
    );

    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.codeQuality.score).toBeLessThan(100);
    expect(report.codeQuality.issueCount).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Dependency health
  // -----------------------------------------------------------------------
  it('should include dependency health with circular ref detection', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'X.cs'),
      `
using Ns.B;
namespace Ns.A { public class Foo {} }`,
    );
    await fs.writeFile(
      path.join(dir, 'Y.cs'),
      `
using Ns.A;
namespace Ns.B { public class Bar {} }`,
    );

    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.dependencyHealth.circularDepCount).toBeGreaterThan(0);
    expect(report.dependencyHealth.namespaceCount).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Overall score calculation
  // -----------------------------------------------------------------------
  it('should calculate overall score from sub-scores', async () => {
    const dir = path.join(tmpDir, 'Assets');
    await fs.mkdir(dir, { recursive: true });

    // Clean code
    await fs.writeFile(
      path.join(dir, 'Good.cs'),
      `
using System.Runtime.InteropServices;

namespace Game.Components
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent
    {
        public float Value;
    }
}`,
    );

    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  // -----------------------------------------------------------------------
  // Summary text
  // -----------------------------------------------------------------------
  it('should include a human-readable summary', async () => {
    const tool = new ProjectHealthTool();
    const result = await tool.execute({}, ctx);
    const report = JSON.parse(result.content);

    expect(report.summary).toBeDefined();
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Custom path
  // -----------------------------------------------------------------------
  it('should accept a custom scan path', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, 'Test.cs'),
      'namespace Sub { public class Foo {} }',
    );

    const tool = new ProjectHealthTool();
    const result = await tool.execute({ path: 'sub' }, ctx);
    const report = JSON.parse(result.content);

    expect(result.isError).toBeFalsy();
    expect(report.fileStats.csFileCount).toBe(1);
  });
});
