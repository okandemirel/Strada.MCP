import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ToolContext } from '../tool.interface.js';
import { CSharpParseTool } from './csharp-parse.js';

let tmpDir: string;
let ctx: ToolContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csharp-parse-test-'));
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

describe('CSharpParseTool', () => {
  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------
  it('should have correct metadata', () => {
    const tool = new CSharpParseTool();
    expect(tool.name).toBe('csharp_parse');
    expect(tool.metadata.category).toBe('analysis');
    expect(tool.metadata.readOnly).toBe(true);
    expect(tool.metadata.requiresBridge).toBe(false);
    expect(tool.metadata.dangerous).toBe(false);
    expect(tool.description).toBeTruthy();
    expect(tool.inputSchema).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Parse raw code
  // -----------------------------------------------------------------------
  it('should parse raw C# code from input', async () => {
    const tool = new CSharpParseTool();
    const result = await tool.execute(
      {
        code: `
using Strada.Core.ECS;

namespace Game.Components
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent
    {
        public float Current;
        public float Max;
    }
}`,
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.nodes).toBeDefined();
    expect(Array.isArray(parsed.nodes)).toBe(true);

    const usings = parsed.nodes.filter((n: { type: string }) => n.type === 'using');
    expect(usings.length).toBe(1);
    expect(usings[0].name).toBe('Strada.Core.ECS');

    const ns = parsed.nodes.find((n: { type: string }) => n.type === 'namespace');
    expect(ns).toBeDefined();
    expect(ns.name).toBe('Game.Components');

    const struct = ns.children.find(
      (n: { type: string; name: string }) => n.type === 'struct' && n.name === 'Health',
    );
    expect(struct).toBeDefined();
    expect(struct.baseTypes).toContain('IComponent');
    expect(struct.attributes).toContain('StructLayout');
  });

  // -----------------------------------------------------------------------
  // Parse from file
  // -----------------------------------------------------------------------
  it('should parse C# code from a file path', async () => {
    const filePath = path.join(tmpDir, 'Test.cs');
    await fs.writeFile(
      filePath,
      `public class TestClass
{
    public int Value;
    public void DoStuff() {}
}`,
    );

    const tool = new CSharpParseTool();
    const result = await tool.execute({ filePath: 'Test.cs' }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.nodes.length).toBe(1);
    expect(parsed.nodes[0].type).toBe('class');
    expect(parsed.nodes[0].name).toBe('TestClass');
    expect(parsed.source).toBe('Test.cs');
  });

  // -----------------------------------------------------------------------
  // Error: no input
  // -----------------------------------------------------------------------
  it('should return error when neither code nor filePath is provided', async () => {
    const tool = new CSharpParseTool();
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('filePath');
  });

  // -----------------------------------------------------------------------
  // Error: file not found
  // -----------------------------------------------------------------------
  it('should return error for non-existent file', async () => {
    const tool = new CSharpParseTool();
    const result = await tool.execute({ filePath: 'nonexistent.cs' }, ctx);
    expect(result.isError).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Error: path traversal
  // -----------------------------------------------------------------------
  it('should reject path traversal', async () => {
    const tool = new CSharpParseTool();
    const result = await tool.execute({ filePath: '../../etc/passwd' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('outside');
  });

  // -----------------------------------------------------------------------
  // Complex class with SystemBase
  // -----------------------------------------------------------------------
  it('should parse a complex system class from file', async () => {
    const filePath = path.join(tmpDir, 'Movement.cs');
    await fs.writeFile(
      filePath,
      `
using Strada.Core.ECS;
using Strada.Core.ECS.Systems;

namespace Game.Systems
{
    [StradaSystem]
    [UpdatePhase(UpdatePhase.Update)]
    public class MovementSystem : SystemBase
    {
        protected override void OnUpdate(float deltaTime) {}
    }
}`,
    );

    const tool = new CSharpParseTool();
    const result = await tool.execute({ filePath: 'Movement.cs' }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    const ns = parsed.nodes.find((n: { type: string }) => n.type === 'namespace');
    const sys = ns.children.find(
      (n: { type: string; name: string }) => n.type === 'class' && n.name === 'MovementSystem',
    );
    expect(sys.attributes).toContain('StradaSystem');
    expect(sys.baseTypes).toContain('SystemBase');
  });

  // -----------------------------------------------------------------------
  // Reports execution time
  // -----------------------------------------------------------------------
  it('should report execution time in metadata', async () => {
    const tool = new CSharpParseTool();
    const result = await tool.execute(
      { code: 'public class Foo {}' },
      ctx,
    );
    expect(result.metadata?.executionTimeMs).toBeDefined();
    expect(result.metadata!.executionTimeMs!).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // Code takes priority over filePath
  // -----------------------------------------------------------------------
  it('should prefer code over filePath when both are provided', async () => {
    const filePath = path.join(tmpDir, 'File.cs');
    await fs.writeFile(filePath, 'public class FromFile {}');

    const tool = new CSharpParseTool();
    const result = await tool.execute(
      {
        code: 'public class FromCode {}',
        filePath: 'File.cs',
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.nodes[0].name).toBe('FromCode');
    expect(parsed.source).toBe('<inline>');
  });
});
