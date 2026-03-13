import { describe, it, expect } from 'vitest';
import { CreateEcsFeaturePrompt } from './create-ecs-feature.js';
import { CreateMvcsFeaturePrompt } from './create-mvcs-feature.js';
import { AnalyzeArchitecturePrompt } from './analyze-architecture.js';

describe('CreateEcsFeaturePrompt', () => {
  const prompt = new CreateEcsFeaturePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('create_ecs_feature');
    expect(prompt.arguments).toHaveLength(2);
    expect(prompt.arguments[0].required).toBe(true);
    expect(prompt.arguments[1].required).toBe(false);
  });

  it('should render ECS feature messages', async () => {
    const messages = await prompt.render({ featureName: 'Health' });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[0].content.text).toContain('Health');
    expect(messages[1].content.text).toContain('HealthComponent');
    expect(messages[1].content.text).toContain('HealthSystem');
    expect(messages[1].content.text).toContain('HealthModule');
  });

  it('should include description when provided', async () => {
    const messages = await prompt.render({
      featureName: 'Damage',
      description: 'Handles damage calculation',
    });
    expect(messages[0].content.text).toContain('Handles damage calculation');
  });

  it('should throw when featureName missing', async () => {
    await expect(prompt.render({})).rejects.toThrow('featureName is required');
  });

  it('should include ECS conventions', async () => {
    const messages = await prompt.render({ featureName: 'Test' });
    const text = messages[1].content.text;
    expect(text).toContain('IComponent');
    expect(text).toContain('StructLayout');
    expect(text).toContain('[StradaSystem]');
    expect(text).toContain('UpdatePhase');
    expect(text).toContain('ModuleConfig');
  });
});

describe('CreateMvcsFeaturePrompt', () => {
  const prompt = new CreateMvcsFeaturePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('create_mvcs_feature');
    expect(prompt.arguments).toHaveLength(2);
  });

  it('should render MVCS feature with UI', async () => {
    const messages = await prompt.render({ featureName: 'Inventory', hasUI: 'true' });
    expect(messages).toHaveLength(2);
    expect(messages[1].content.text).toContain('InventoryModel');
    expect(messages[1].content.text).toContain('InventoryView');
    expect(messages[1].content.text).toContain('InventoryController');
    expect(messages[1].content.text).toContain('InventoryService');
  });

  it('should render MVCS feature without UI', async () => {
    const messages = await prompt.render({ featureName: 'Score', hasUI: 'false' });
    const text = messages[1].content.text;
    expect(text).toContain('ScoreModel');
    expect(text).toContain('ScoreController');
    expect(text).toContain('ScoreService');
    expect(text).not.toContain('ScoreView');
  });

  it('should default to having UI', async () => {
    const messages = await prompt.render({ featureName: 'Player' });
    expect(messages[1].content.text).toContain('PlayerView');
  });

  it('should throw when featureName missing', async () => {
    await expect(prompt.render({})).rejects.toThrow('featureName is required');
  });
});

describe('AnalyzeArchitecturePrompt', () => {
  const prompt = new AnalyzeArchitecturePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('analyze_architecture');
    expect(prompt.arguments).toHaveLength(1);
    expect(prompt.arguments[0].required).toBe(false);
  });

  it('should render full review by default', async () => {
    const messages = await prompt.render({});
    expect(messages).toHaveLength(2);
    const text = messages[1].content.text;
    expect(text).toContain('ECS Architecture Review');
    expect(text).toContain('Dependency Injection Review');
    expect(text).toContain('Module Organization Review');
  });

  it('should render ECS-focused review', async () => {
    const messages = await prompt.render({ focus: 'ecs' });
    const text = messages[1].content.text;
    expect(text).toContain('ECS Architecture Review');
    expect(text).not.toContain('Dependency Injection Review');
  });

  it('should render DI-focused review', async () => {
    const messages = await prompt.render({ focus: 'di' });
    const text = messages[1].content.text;
    expect(text).toContain('Dependency Injection Review');
    expect(text).not.toContain('ECS Architecture Review');
  });

  it('should render modules-focused review', async () => {
    const messages = await prompt.render({ focus: 'modules' });
    const text = messages[1].content.text;
    expect(text).toContain('Module Organization Review');
    expect(text).not.toContain('ECS Architecture Review');
  });

  it('should throw for invalid focus', async () => {
    await expect(prompt.render({ focus: 'invalid' })).rejects.toThrow(
      'Invalid focus "invalid"',
    );
  });
});
