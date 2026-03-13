import { describe, it, expect } from 'vitest';
import { DebugPerformancePrompt } from './debug-performance.js';
import { SetupScenePrompt } from './setup-scene.js';
import { OptimizeBuildPrompt } from './optimize-build.js';

describe('DebugPerformancePrompt', () => {
  const prompt = new DebugPerformancePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('debug_performance');
    expect(prompt.arguments).toHaveLength(1);
    expect(prompt.arguments[0].required).toBe(true);
  });

  it('should render performance debug messages', async () => {
    const messages = await prompt.render({ symptom: 'low fps' });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[0].content.text).toContain('low fps');
  });

  it('should include debugging steps', async () => {
    const messages = await prompt.render({ symptom: 'memory leak' });
    const text = messages[1].content.text;
    expect(text).toContain('Measure First');
    expect(text).toContain('Common Strada.Core ECS Performance Issues');
    expect(text).toContain('Debugging Approach');
    expect(text).toContain('Common Fixes');
  });

  it('should throw when symptom missing', async () => {
    await expect(prompt.render({})).rejects.toThrow('symptom is required');
  });

  it('should include ECS-specific advice', async () => {
    const messages = await prompt.render({ symptom: 'frame drops' });
    const text = messages[1].content.text;
    expect(text).toContain('ForEach');
    expect(text).toContain('ReactiveProperty');
    expect(text).toContain('BurstSystemBase');
  });
});

describe('SetupScenePrompt', () => {
  const prompt = new SetupScenePrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('setup_scene');
    expect(prompt.arguments).toHaveLength(2);
    expect(prompt.arguments[0].required).toBe(true);
    expect(prompt.arguments[1].required).toBe(false);
  });

  it('should render gameplay scene setup', async () => {
    const messages = await prompt.render({ sceneName: 'BattleArena', sceneType: 'gameplay' });
    expect(messages).toHaveLength(2);
    const text = messages[1].content.text;
    expect(text).toContain('BattleArena');
    expect(text).toContain('StradaBootstrap');
    expect(text).toContain('GAMEPLAY');
    expect(text).toContain('ModuleConfig');
  });

  it('should render menu scene setup', async () => {
    const messages = await prompt.render({ sceneName: 'MainMenu', sceneType: 'menu' });
    const text = messages[1].content.text;
    expect(text).toContain('MainMenu');
    expect(text).toContain('PlayButton');
    expect(text).toContain('SettingsButton');
  });

  it('should render loading scene setup', async () => {
    const messages = await prompt.render({ sceneName: 'Loading', sceneType: 'loading' });
    const text = messages[1].content.text;
    expect(text).toContain('Loading');
    expect(text).toContain('ProgressBar');
    expect(text).toContain('allowSceneActivation');
  });

  it('should default to gameplay scene type', async () => {
    const messages = await prompt.render({ sceneName: 'World' });
    const text = messages[1].content.text;
    expect(text).toContain('gameplay');
  });

  it('should throw when sceneName missing', async () => {
    await expect(prompt.render({})).rejects.toThrow('sceneName is required');
  });

  it('should throw for invalid sceneType', async () => {
    await expect(
      prompt.render({ sceneName: 'Test', sceneType: 'invalid' }),
    ).rejects.toThrow('Invalid sceneType "invalid"');
  });
});

describe('OptimizeBuildPrompt', () => {
  const prompt = new OptimizeBuildPrompt();

  it('should have correct name and arguments', () => {
    expect(prompt.name).toBe('optimize_build');
    expect(prompt.arguments).toHaveLength(1);
    expect(prompt.arguments[0].required).toBe(true);
  });

  it('should render android optimizations', async () => {
    const messages = await prompt.render({ platform: 'android' });
    expect(messages).toHaveLength(2);
    const text = messages[1].content.text;
    expect(text).toContain('Android');
    expect(text).toContain('ASTC');
    expect(text).toContain('Vulkan');
    expect(text).toContain('ARM64');
  });

  it('should render ios optimizations', async () => {
    const messages = await prompt.render({ platform: 'ios' });
    const text = messages[1].content.text;
    expect(text).toContain('iOS');
    expect(text).toContain('Metal');
    expect(text).toContain('App Store');
  });

  it('should render webgl optimizations', async () => {
    const messages = await prompt.render({ platform: 'webgl' });
    const text = messages[1].content.text;
    expect(text).toContain('WebGL');
    expect(text).toContain('Brotli');
    expect(text).toContain('browser');
  });

  it('should render standalone optimizations', async () => {
    const messages = await prompt.render({ platform: 'standalone' });
    const text = messages[1].content.text;
    expect(text).toContain('Standalone');
    expect(text).toContain('DX12');
    expect(text).toContain('resolution');
  });

  it('should include common optimizations for all platforms', async () => {
    for (const platform of ['android', 'ios', 'webgl', 'standalone']) {
      const messages = await prompt.render({ platform });
      const text = messages[1].content.text;
      expect(text).toContain('Common Optimizations');
      expect(text).toContain('Strada.Core Specific');
      expect(text).toContain('IL2CPP');
    }
  });

  it('should throw when platform missing', async () => {
    await expect(prompt.render({})).rejects.toThrow('platform is required');
  });

  it('should throw for invalid platform', async () => {
    await expect(prompt.render({ platform: 'ps5' })).rejects.toThrow(
      'Invalid platform "ps5"',
    );
  });
});
