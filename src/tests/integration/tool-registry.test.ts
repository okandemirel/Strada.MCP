import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../tools/tool-registry.js';
import type { ToolCategory } from '../../tools/tool.interface.js';

// Import all tool categories
import * as unity from '../../tools/unity/index.js';
import * as strada from '../../tools/strada/index.js';
import * as file from '../../tools/file/index.js';
import * as search from '../../tools/search/index.js';
import * as git from '../../tools/git/index.js';
import * as dotnet from '../../tools/dotnet/index.js';
import * as advanced from '../../tools/advanced/index.js';
import * as unityScene from '../../tools/unity-scene/index.js';
import * as unityAsset from '../../tools/unity-asset/index.js';
import * as unitySubsystem from '../../tools/unity-subsystem/index.js';
import * as unityConfig from '../../tools/unity-config/index.js';
import { CodeSearchRagTool } from '../../tools/analysis/code-search-rag.js';
import { ProjectHealthTool } from '../../tools/analysis/project-health.js';
import { CSharpParseTool } from '../../tools/analysis/csharp-parse.js';
import { RagIndexTool } from '../../tools/analysis/rag-index.js';
import { RagStatusTool } from '../../tools/analysis/rag-status.js';
import { CodeQualityTool } from '../../tools/analysis/code-quality.js';
import { DependencyGraphTool } from '../../tools/analysis/dependency-graph.js';

function createAllTools() {
  const tools = [];

  // Unity runtime tools (18)
  for (const Ctor of Object.values(unity)) {
    if (typeof Ctor === 'function' && Ctor.name !== 'BridgeTool') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Strada tools (10)
  for (const Ctor of Object.values(strada)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // File tools (6)
  for (const Ctor of Object.values(file)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Search tools (3)
  for (const Ctor of Object.values(search)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Git tools (6)
  for (const Ctor of Object.values(git)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Dotnet tools (2)
  for (const Ctor of Object.values(dotnet)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Advanced tools (5)
  for (const Ctor of Object.values(advanced)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Unity scene tools (8)
  for (const Ctor of Object.values(unityScene)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Unity asset tools (8)
  for (const Ctor of Object.values(unityAsset)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Unity subsystem tools (6)
  for (const Ctor of Object.values(unitySubsystem)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Unity config tools (4)
  for (const Ctor of Object.values(unityConfig)) {
    if (typeof Ctor === 'function') {
      tools.push(new (Ctor as new () => InstanceType<typeof Ctor>)());
    }
  }

  // Analysis tools (7) — no barrel, import individually
  tools.push(new CodeSearchRagTool());
  tools.push(new ProjectHealthTool());
  tools.push(new CSharpParseTool());
  tools.push(new RagIndexTool());
  tools.push(new RagStatusTool());
  tools.push(new CodeQualityTool());
  tools.push(new DependencyGraphTool());

  return tools;
}

describe('Tool Registry Integration', () => {
  it('should register all tools without name conflicts', () => {
    const registry = new ToolRegistry();
    const tools = createAllTools();

    for (const tool of tools) {
      registry.register(tool);
    }

    expect(registry.getAll().length).toBe(tools.length);
  });

  it('should have 83 total tools', () => {
    const tools = createAllTools();
    expect(tools.length).toBe(83);
  });

  it('should have no duplicate tool names', () => {
    const tools = createAllTools();
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should have correct category distribution', () => {
    const registry = new ToolRegistry();
    const tools = createAllTools();
    for (const tool of tools) {
      registry.register(tool);
    }

    const expected: Record<ToolCategory, number> = {
      'unity-runtime': 18,
      'strada': 10,
      'file': 6,
      'search': 3,
      'git': 6,
      'dotnet': 2,
      'advanced': 5,
      'unity-scene': 8,
      'unity-asset': 8,
      'unity-subsystem': 6,
      'unity-config': 4,
      'analysis': 7,
    };

    for (const [category, count] of Object.entries(expected)) {
      const actual = registry.getByCategory(category as ToolCategory).length;
      expect(actual, `Category ${category}`).toBe(count);
    }
  });

  it('should filter bridge-dependent tools when bridge is disconnected', () => {
    const registry = new ToolRegistry();
    const tools = createAllTools();
    for (const tool of tools) {
      registry.register(tool);
    }

    const all = registry.getAll();
    const available = registry.getAvailable(false);

    // Some tools require bridge, so available should be less
    expect(available.length).toBeLessThan(all.length);
    expect(available.length).toBeGreaterThan(0);

    // All bridge tools should be filtered out
    for (const tool of available) {
      expect(tool.metadata.requiresBridge).toBe(false);
    }
  });

  it('should return all tools when bridge is connected', () => {
    const registry = new ToolRegistry();
    const tools = createAllTools();
    for (const tool of tools) {
      registry.register(tool);
    }

    const available = registry.getAvailable(true);
    expect(available.length).toBe(tools.length);
  });

  it('every tool should have valid inputSchema', () => {
    const tools = createAllTools();
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} inputSchema`).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });

  it('every tool should have valid metadata', () => {
    const tools = createAllTools();
    for (const tool of tools) {
      expect(tool.metadata, `${tool.name} metadata`).toBeDefined();
      expect(typeof tool.metadata.category).toBe('string');
      expect(typeof tool.metadata.requiresBridge).toBe('boolean');
      expect(typeof tool.metadata.dangerous).toBe('boolean');
      expect(typeof tool.metadata.readOnly).toBe('boolean');
    }
  });
});
