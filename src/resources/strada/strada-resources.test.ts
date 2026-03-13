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

  it('should return markdown content', async () => {
    const result = await resource.read();
    expect(result.uri).toBe('strada://api-reference');
    expect(result.mimeType).toBe('text/markdown');
    expect(result.text).toContain('# Strada.Core API Reference');
  });

  it('should include all major sections', async () => {
    const result = await resource.read();
    expect(result.text).toContain('## Namespaces');
    expect(result.text).toContain('## Base Classes');
    expect(result.text).toContain('## System Attributes');
    expect(result.text).toContain('## Update Phases');
    expect(result.text).toContain('## System API');
    expect(result.text).toContain('## Dependency Injection API');
    expect(result.text).toContain('## Component API');
    expect(result.text).toContain('## Module API');
    expect(result.text).toContain('## Sync API');
    expect(result.text).toContain('## Communication API');
    expect(result.text).toContain('## Assembly References');
  });

  it('should include namespace values', async () => {
    const result = await resource.read();
    expect(result.text).toContain('Strada.Core.ECS');
    expect(result.text).toContain('Strada.Core.DI');
    expect(result.text).toContain('Strada.Core.Modules');
  });
});

describe('NamespacesResource', () => {
  const resource = new NamespacesResource();

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('strada://namespaces');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should return JSON content', async () => {
    const result = await resource.read();
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.text);
    expect(parsed.name).toBe('Strada.Core');
    expect(parsed.fullPath).toBe('Strada.Core');
  });

  it('should build correct hierarchy', async () => {
    const result = await resource.read();
    const hierarchy = JSON.parse(result.text);
    expect(hierarchy.children.length).toBeGreaterThan(0);

    // ECS should be a child of root
    const ecs = hierarchy.children.find(
      (c: { name: string }) => c.name === 'ECS',
    );
    expect(ecs).toBeDefined();
    expect(ecs.fullPath).toBe('Strada.Core.ECS');

    // ECS should have children like Core, Systems, Query etc.
    expect(ecs.children.length).toBeGreaterThan(0);
  });
});

describe('ExamplesResource', () => {
  const resource = new ExamplesResource();

  it('should have correct URI and metadata', () => {
    expect(resource.uri).toBe('strada://examples/{pattern}');
    expect(resource.metadata.requiresBridge).toBe(false);
  });

  it('should list patterns when no param', async () => {
    const result = await resource.read();
    expect(result.text).toContain('Available patterns');
    expect(result.text).toContain('ecs');
    expect(result.text).toContain('mvcs');
    expect(result.text).toContain('di');
    expect(result.text).toContain('mediator');
    expect(result.text).toContain('module');
  });

  it('should return ECS example', async () => {
    const result = await resource.read({ pattern: 'ecs' });
    expect(result.uri).toBe('strada://examples/ecs');
    expect(result.mimeType).toBe('text/markdown');
    expect(result.text).toContain('ECS Pattern');
    expect(result.text).toContain('IComponent');
    expect(result.text).toContain('SystemBase');
  });

  it('should return MVCS example', async () => {
    const result = await resource.read({ pattern: 'mvcs' });
    expect(result.text).toContain('MVCS Pattern');
    expect(result.text).toContain('Controller');
    expect(result.text).toContain('Model');
    expect(result.text).toContain('View');
  });

  it('should return DI example', async () => {
    const result = await resource.read({ pattern: 'di' });
    expect(result.text).toContain('Dependency Injection');
    expect(result.text).toContain('[Inject]');
  });

  it('should return mediator example', async () => {
    const result = await resource.read({ pattern: 'mediator' });
    expect(result.text).toContain('Mediator Pattern');
    expect(result.text).toContain('EntityMediator');
  });

  it('should return module example', async () => {
    const result = await resource.read({ pattern: 'module' });
    expect(result.text).toContain('Module Pattern');
    expect(result.text).toContain('ModuleConfig');
  });

  it('should throw for unknown pattern', async () => {
    await expect(resource.read({ pattern: 'unknown' })).rejects.toThrow(
      'Unknown pattern "unknown"',
    );
  });
});
