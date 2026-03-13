import { describe, it, expect } from 'vitest';
import {
  SceneCreateTool,
  SceneOpenTool,
  SceneSaveTool,
  SceneInfoTool,
  SceneAnalyzeTool,
  PrefabCreateTool,
  PrefabInstantiateTool,
  PrefabAnalyzeTool,
} from './index.js';
import { ToolRegistry } from '../tool-registry.js';

describe('Phase 9 Integration', () => {
  it('should register all 8 tools without conflicts', () => {
    const registry = new ToolRegistry();
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    for (const tool of tools) {
      registry.register(tool);
    }

    expect(registry.getAll()).toHaveLength(8);
    expect(registry.getByCategory('unity-scene')).toHaveLength(8);
  });

  it('should have 6 bridge tools and 2 non-bridge tools', () => {
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    const bridgeTools = tools.filter((t) => t.metadata.requiresBridge);
    const localTools = tools.filter((t) => !t.metadata.requiresBridge);

    expect(bridgeTools).toHaveLength(6);
    expect(localTools).toHaveLength(2);

    // Local tools are the analysis ones
    expect(localTools.map((t) => t.name).sort()).toEqual([
      'unity_prefab_analyze',
      'unity_scene_analyze',
    ]);
  });

  it('should have correct read-only flags', () => {
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    const readOnlyTools = tools.filter((t) => t.metadata.readOnly);
    expect(readOnlyTools.map((t) => t.name).sort()).toEqual([
      'unity_get_scene_info',
      'unity_prefab_analyze',
      'unity_scene_analyze',
    ]);
  });

  it('all tools should have valid Zod input schemas', () => {
    const tools = [
      new SceneCreateTool(),
      new SceneOpenTool(),
      new SceneSaveTool(),
      new SceneInfoTool(),
      new SceneAnalyzeTool(),
      new PrefabCreateTool(),
      new PrefabInstantiateTool(),
      new PrefabAnalyzeTool(),
    ];

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
