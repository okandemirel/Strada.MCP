import { describe, it, expect } from 'vitest';
import { StructuralChunker, type CodeChunk } from './chunker.js';

const SAMPLE_CS = `
using System;
using Strada.Core.ECS;

namespace Game.Combat
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Health : IComponent
    {
        public float Current;
        public float Max;
    }

    [StradaSystem]
    public class HealthSystem : SystemBase
    {
        public override void OnInitialize()
        {
            // setup
        }

        public override void OnUpdate(float deltaTime)
        {
            ForEach<Health>((int entity, ref Health h) =>
            {
                if (h.Current <= 0) { /* handle death */ }
            });
        }

        private void RegenerateHealth(ref Health health, float rate)
        {
            health.Current = Math.Min(health.Current + rate, health.Max);
        }
    }
}
`;

describe('StructuralChunker', () => {
  const chunker = new StructuralChunker();

  it('should split file into class/struct level chunks', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const structChunk = chunks.find((c) => c.name === 'Health');
    expect(structChunk).toBeDefined();
    expect(structChunk!.type).toBe('struct');
    expect(structChunk!.filePath).toBe('Assets/Scripts/Combat/Health.cs');
    expect(structChunk!.namespace).toBe('Game.Combat');
    expect(structChunk!.content).toContain('public float Current');
  });

  it('should extract method-level chunks from classes', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    const methods = chunks.filter((c) => c.type === 'method');
    expect(methods.length).toBeGreaterThanOrEqual(2);

    const updateMethod = methods.find((c) => c.name === 'OnUpdate');
    expect(updateMethod).toBeDefined();
    expect(updateMethod!.parentClass).toBe('HealthSystem');
    expect(updateMethod!.content).toContain('ForEach<Health>');
  });

  it('should preserve line range metadata', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    for (const chunk of chunks) {
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });

  it('should include using directives in file-level context', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    const classChunk = chunks.find((c) => c.type === 'class');
    expect(classChunk).toBeDefined();
    expect(classChunk!.usings).toContain('System');
    expect(classChunk!.usings).toContain('Strada.Core.ECS');
  });

  it('should generate content hash for each chunk', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    for (const chunk of chunks) {
      expect(chunk.contentHash).toBeDefined();
      expect(chunk.contentHash).toHaveLength(64); // SHA-256 hex
    }
  });

  it('should return empty array for empty input', () => {
    const chunks = chunker.chunk('', 'empty.cs');
    expect(chunks).toEqual([]);
  });

  it('should handle file with only using statements', () => {
    const chunks = chunker.chunk('using System;\nusing System.Linq;', 'usings.cs');
    expect(chunks).toEqual([]);
  });

  it('should handle interface declarations', () => {
    const code = `
namespace Game.Interfaces
{
    public interface IDamageable
    {
        void TakeDamage(float amount);
        bool IsAlive { get; }
    }
}`;
    const chunks = chunker.chunk(code, 'IDamageable.cs');
    const iface = chunks.find((c) => c.type === 'interface');
    expect(iface).toBeDefined();
    expect(iface!.name).toBe('IDamageable');
  });

  it('should handle enum declarations', () => {
    const code = `
namespace Game.Types
{
    public enum DamageType
    {
        Physical,
        Magical,
        True
    }
}`;
    const chunks = chunker.chunk(code, 'DamageType.cs');
    const enumChunk = chunks.find((c) => c.type === 'enum');
    expect(enumChunk).toBeDefined();
    expect(enumChunk!.name).toBe('DamageType');
  });

  it('should extract base types and attributes', () => {
    const chunks = chunker.chunk(SAMPLE_CS, 'Assets/Scripts/Combat/Health.cs');
    const system = chunks.find((c) => c.name === 'HealthSystem');
    expect(system).toBeDefined();
    expect(system!.baseTypes).toContain('SystemBase');
    expect(system!.attributes).toContain('StradaSystem');
  });
});
