import { describe, it, expect } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import type { ITool } from './tool.interface.js';
import type { BridgeCapabilityManifestType } from '../bridge/capabilities.js';

function createMockTool(
  name: string,
  requiresBridge = false,
  requiredBridgeMethods: string[] = [],
  requiredBridgeCapabilities: string[] = [],
): ITool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: { type: 'object', properties: {} },
    metadata: {
      category: 'file',
      requiresBridge,
      dangerous: false,
      readOnly: true,
      requiredBridgeMethods,
      requiredBridgeCapabilities,
    },
    execute: async () => ({ content: 'ok' }),
  };
}

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('test_tool');
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('should reject duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('dup'));
    expect(() => registry.register(createMockTool('dup'))).toThrow('already registered');
  });

  it('should filter by bridge requirement', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('local', false));
    registry.register(createMockTool('bridge', true));
    const available = registry.getAvailable(false);
    expect(available).toHaveLength(1);
    expect(available[0].name).toBe('local');
  });

  it('should return all tools when bridge connected', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('local', false));
    registry.register(createMockTool('bridge', true));
    expect(registry.getAvailable(true)).toHaveLength(2);
  });

  it('should filter bridge tools by capability manifest when provided', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('supported', true, ['editor.ok'], ['feature.ok']));
    registry.register(createMockTool('unsupported-method', true, ['editor.missing']));
    registry.register(createMockTool('unsupported-feature', true, [], ['feature.missing']));

    const manifest: BridgeCapabilityManifestType = {
      manifestVersion: 1,
      bridgeVersion: '1.0.0',
      protocolVersion: '2.0',
      supportedMethods: ['editor.ok'],
      supportedFeatures: ['feature.ok'],
      metadata: {},
    };

    const available = registry.getAvailable(true, manifest);
    expect(available.map((tool) => tool.name)).toEqual(['supported']);
  });

  it('should filter by category', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('strada_tool');
    tool.metadata.category = 'strada';
    registry.register(tool);
    registry.register(createMockTool('file_tool'));
    expect(registry.getByCategory('strada')).toHaveLength(1);
  });
});
