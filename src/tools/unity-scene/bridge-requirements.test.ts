/**
 * Codex round AG#9: six scene/prefab tools overrode `metadata` and dropped the
 * base class's `requiredBridgeMethods`, so capability filtering could not hide
 * them when the connected editor implements no handler for their RPC method.
 * The tool was offered, the call was made, and the bridge refused it.
 */
import { describe, it, expect } from 'vitest';
import { SceneSaveTool } from './scene-save.js';
import { SceneCreateTool } from './scene-create.js';
import { SceneOpenTool } from './scene-open.js';
import { SceneInfoTool } from './scene-info.js';
import { PrefabCreateTool } from './prefab-create.js';
import { PrefabInstantiateTool } from './prefab-instantiate.js';

describe('a bridge tool states the RPC method it needs', () => {
  it('every scene and prefab tool names its own method', () => {
    const tools = [
      [new SceneSaveTool(), 'scene.save'],
      [new SceneCreateTool(), 'scene.create'],
      [new SceneOpenTool(), 'scene.open'],
      [new SceneInfoTool(), 'scene.info'],
      [new PrefabCreateTool(), 'prefab.create'],
      [new PrefabInstantiateTool(), 'prefab.instantiate'],
    ] as const;
    for (const [tool, method] of tools) {
      expect(tool.metadata.requiredBridgeMethods, tool.name).toContain(method);
      expect(tool.metadata.requiresBridge, tool.name).toBe(true);
      // …and the override's own fields are still there.
      expect(tool.metadata.category, tool.name).toBe('unity-scene');
    }
  });
});
