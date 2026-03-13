import { describe, it, expect } from 'vitest';
import { PromptRegistry } from './prompt-registry.js';
import type { IPrompt } from './prompt.interface.js';

function createMockPrompt(name: string): IPrompt {
  return {
    name,
    description: `Mock prompt ${name}`,
    arguments: [{ name: 'arg1', description: 'test arg', required: true }],
    render: async () => [
      { role: 'user', content: { type: 'text', text: 'mock' } },
    ],
  };
}

describe('PromptRegistry', () => {
  it('should register and retrieve a prompt', () => {
    const registry = new PromptRegistry();
    const prompt = createMockPrompt('test_prompt');
    registry.register(prompt);
    expect(registry.get('test_prompt')).toBe(prompt);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('should reject duplicate registration', () => {
    const registry = new PromptRegistry();
    registry.register(createMockPrompt('dup'));
    expect(() => registry.register(createMockPrompt('dup'))).toThrow(
      'already registered',
    );
  });

  it('should return undefined for unknown name', () => {
    const registry = new PromptRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should return empty array when no prompts registered', () => {
    const registry = new PromptRegistry();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('should return all registered prompts', () => {
    const registry = new PromptRegistry();
    registry.register(createMockPrompt('p1'));
    registry.register(createMockPrompt('p2'));
    registry.register(createMockPrompt('p3'));
    expect(registry.getAll()).toHaveLength(3);
  });
});
