import { describe, it, expect } from 'vitest';
import { ResourceRegistry } from './resource-registry.js';
import type { IResource } from './resource.interface.js';

function createMockResource(
  uri: string,
  requiresBridge = false,
): IResource {
  return {
    uri,
    name: `mock-${uri}`,
    metadata: { requiresBridge, description: `Mock resource ${uri}` },
    read: async () => ({ uri, mimeType: 'text/plain', text: 'mock' }),
  };
}

describe('ResourceRegistry', () => {
  it('should register and retrieve a resource', () => {
    const registry = new ResourceRegistry();
    const resource = createMockResource('strada://test');
    registry.register(resource);
    expect(registry.get('strada://test')).toBe(resource);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('should reject duplicate registration', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://dup'));
    expect(() =>
      registry.register(createMockResource('strada://dup')),
    ).toThrow('already registered');
  });

  it('should return undefined for unknown URI', () => {
    const registry = new ResourceRegistry();
    expect(registry.get('strada://unknown')).toBeUndefined();
  });

  it('should filter by bridge requirement when bridge disconnected', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://local', false));
    registry.register(createMockResource('unity://bridge', true));
    const available = registry.getAvailable(false);
    expect(available).toHaveLength(1);
    expect(available[0].uri).toBe('strada://local');
  });

  it('should return all resources when bridge connected', () => {
    const registry = new ResourceRegistry();
    registry.register(createMockResource('strada://local', false));
    registry.register(createMockResource('unity://bridge', true));
    expect(registry.getAvailable(true)).toHaveLength(2);
  });

  it('should return empty array when no resources registered', () => {
    const registry = new ResourceRegistry();
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.getAvailable(false)).toHaveLength(0);
  });
});
