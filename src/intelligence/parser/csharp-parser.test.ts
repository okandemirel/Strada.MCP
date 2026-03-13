import { describe, it, expect } from 'vitest';
import { CSharpParser, type CSharpNode } from './csharp-parser.js';

const parser = new CSharpParser();

describe('CSharpParser', () => {
  // -----------------------------------------------------------------------
  // Simple class
  // -----------------------------------------------------------------------
  it('should parse a simple class', () => {
    const code = `
public class PlayerController
{
    private int _health;
    public string Name { get; set; }

    public void TakeDamage(int amount) {}
}`;
    const nodes = parser.parse(code);
    const cls = nodes.find((n) => n.type === 'class' && n.name === 'PlayerController');
    expect(cls).toBeDefined();
    expect(cls!.modifiers).toContain('public');
    expect(cls!.children.some((c) => c.type === 'field' && c.name === '_health')).toBe(true);
    expect(cls!.children.some((c) => c.type === 'property' && c.name === 'Name')).toBe(true);
    expect(cls!.children.some((c) => c.type === 'method' && c.name === 'TakeDamage')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Struct with IComponent
  // -----------------------------------------------------------------------
  it('should parse a struct implementing IComponent', () => {
    const code = `
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct Health : IComponent
{
    public float Current;
    public float Max;
}`;
    const nodes = parser.parse(code);
    const struct = nodes.find((n) => n.type === 'struct' && n.name === 'Health');
    expect(struct).toBeDefined();
    expect(struct!.attributes).toContain('StructLayout');
    expect(struct!.baseTypes).toContain('IComponent');
    expect(struct!.children.filter((c) => c.type === 'field')).toHaveLength(2);
    expect(struct!.children.find((c) => c.name === 'Current')).toBeDefined();
    expect(struct!.children.find((c) => c.name === 'Max')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // SystemBase subclass
  // -----------------------------------------------------------------------
  it('should parse a SystemBase subclass with attributes', () => {
    const code = `
[StradaSystem]
[UpdatePhase(UpdatePhase.Update)]
[ExecutionOrder(10)]
public class MovementSystem : SystemBase
{
    private int _counter;

    protected override void OnUpdate(float deltaTime)
    {
        ForEach<Position, Velocity>((int entity, ref Position c0, ref Velocity c1) => { });
    }
}`;
    const nodes = parser.parse(code);
    const sys = nodes.find((n) => n.type === 'class' && n.name === 'MovementSystem');
    expect(sys).toBeDefined();
    expect(sys!.attributes).toContain('StradaSystem');
    expect(sys!.attributes).toContain('UpdatePhase');
    expect(sys!.attributes).toContain('ExecutionOrder');
    expect(sys!.baseTypes).toContain('SystemBase');
    expect(sys!.children.some((c) => c.type === 'method' && c.name === 'OnUpdate')).toBe(true);
    const onUpdate = sys!.children.find((c) => c.name === 'OnUpdate')!;
    expect(onUpdate.parameters).toBeDefined();
    expect(onUpdate.parameters!.length).toBe(1);
    expect(onUpdate.parameters![0].name).toBe('deltaTime');
    expect(onUpdate.parameters![0].type).toBe('float');
  });

  // -----------------------------------------------------------------------
  // Generic class
  // -----------------------------------------------------------------------
  it('should parse a generic class with type parameters', () => {
    const code = `
public class Repository<T, U> : BaseRepo<T> where T : struct
{
    public T GetItem(int id) { return default; }
}`;
    const nodes = parser.parse(code);
    const cls = nodes.find((n) => n.type === 'class' && n.name === 'Repository');
    expect(cls).toBeDefined();
    expect(cls!.genericParams).toContain('T');
    expect(cls!.genericParams).toContain('U');
    expect(cls!.baseTypes).toContain('BaseRepo');
  });

  // -----------------------------------------------------------------------
  // Nested classes
  // -----------------------------------------------------------------------
  it('should parse nested classes', () => {
    const code = `
public class Outer
{
    public class Inner
    {
        public int Value;
    }

    private class PrivateInner {}
}`;
    const nodes = parser.parse(code);
    const outer = nodes.find((n) => n.type === 'class' && n.name === 'Outer');
    expect(outer).toBeDefined();
    const inner = outer!.children.find((c) => c.type === 'class' && c.name === 'Inner');
    expect(inner).toBeDefined();
    expect(inner!.modifiers).toContain('public');
    expect(inner!.children.some((c) => c.type === 'field' && c.name === 'Value')).toBe(true);
    const privateInner = outer!.children.find((c) => c.name === 'PrivateInner');
    expect(privateInner).toBeDefined();
    expect(privateInner!.modifiers).toContain('private');
  });

  // -----------------------------------------------------------------------
  // Namespace + using extraction
  // -----------------------------------------------------------------------
  it('should extract namespaces and using directives', () => {
    const code = `
using System;
using System.Collections.Generic;
using Strada.Core.ECS;

namespace Game.Components
{
    public struct Position : IComponent
    {
        public float X;
        public float Y;
    }
}`;
    const nodes = parser.parse(code);
    const usings = nodes.filter((n) => n.type === 'using');
    expect(usings.length).toBe(3);
    expect(usings.map((u) => u.name)).toContain('System');
    expect(usings.map((u) => u.name)).toContain('System.Collections.Generic');
    expect(usings.map((u) => u.name)).toContain('Strada.Core.ECS');

    const ns = nodes.find((n) => n.type === 'namespace');
    expect(ns).toBeDefined();
    expect(ns!.name).toBe('Game.Components');
    expect(ns!.children.some((c) => c.type === 'struct' && c.name === 'Position')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Interface
  // -----------------------------------------------------------------------
  it('should parse interfaces', () => {
    const code = `
public interface IMovable
{
    void Move(float speed);
}`;
    const nodes = parser.parse(code);
    const iface = nodes.find((n) => n.type === 'interface' && n.name === 'IMovable');
    expect(iface).toBeDefined();
    expect(iface!.modifiers).toContain('public');
  });

  // -----------------------------------------------------------------------
  // Enum
  // -----------------------------------------------------------------------
  it('should parse enums', () => {
    const code = `
public enum Direction { Up, Down, Left, Right }`;
    const nodes = parser.parse(code);
    const enumNode = nodes.find((n) => n.type === 'enum' && n.name === 'Direction');
    expect(enumNode).toBeDefined();
    expect(enumNode!.modifiers).toContain('public');
  });

  // -----------------------------------------------------------------------
  // Line numbers
  // -----------------------------------------------------------------------
  it('should track start and end lines', () => {
    const code = `public class Foo
{
    public int X;
}`;
    const nodes = parser.parse(code);
    const cls = nodes.find((n) => n.type === 'class' && n.name === 'Foo');
    expect(cls).toBeDefined();
    expect(cls!.startLine).toBe(1);
    expect(cls!.endLine).toBe(4);
  });

  // -----------------------------------------------------------------------
  // Method parameters
  // -----------------------------------------------------------------------
  it('should extract method parameters with modifiers', () => {
    const code = `
public class Svc
{
    public void Process(int a, ref float b, out string c) {}
}`;
    const nodes = parser.parse(code);
    const cls = nodes.find((n) => n.type === 'class')!;
    const method = cls.children.find((c) => c.type === 'method' && c.name === 'Process')!;
    expect(method.parameters).toHaveLength(3);
    expect(method.parameters![0]).toEqual({ name: 'a', type: 'int' });
    expect(method.parameters![1]).toEqual({ name: 'b', type: 'float', modifier: 'ref' });
    expect(method.parameters![2]).toEqual({ name: 'c', type: 'string', modifier: 'out' });
  });

  // -----------------------------------------------------------------------
  // Multiple modifiers
  // -----------------------------------------------------------------------
  it('should capture multiple modifiers', () => {
    const code = `
public abstract class Base
{
    protected virtual void OnInit() {}
    private static readonly int _val = 0;
}`;
    const nodes = parser.parse(code);
    const cls = nodes.find((n) => n.type === 'class' && n.name === 'Base')!;
    expect(cls.modifiers).toContain('public');
    expect(cls.modifiers).toContain('abstract');

    const method = cls.children.find((c) => c.type === 'method' && c.name === 'OnInit')!;
    expect(method.modifiers).toContain('protected');
    expect(method.modifiers).toContain('virtual');

    const field = cls.children.find((c) => c.type === 'field' && c.name === '_val')!;
    expect(field.modifiers).toContain('private');
    expect(field.modifiers).toContain('static');
    expect(field.modifiers).toContain('readonly');
  });

  // -----------------------------------------------------------------------
  // Empty code
  // -----------------------------------------------------------------------
  it('should return empty array for empty code', () => {
    const nodes = parser.parse('');
    expect(nodes).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Multiple base types (class + interfaces)
  // -----------------------------------------------------------------------
  it('should capture multiple base types', () => {
    const code = `
public class Player : MonoBehaviour, IMovable, IDamageable {}`;
    const nodes = parser.parse(code);
    const cls = nodes.find((n) => n.type === 'class' && n.name === 'Player')!;
    expect(cls.baseTypes).toContain('MonoBehaviour');
    expect(cls.baseTypes).toContain('IMovable');
    expect(cls.baseTypes).toContain('IDamageable');
  });
});
