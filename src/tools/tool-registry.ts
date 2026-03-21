import type { ITool, ToolCategory } from './tool.interface.js';
import type { BridgeCapabilityManifestType } from '../bridge/capabilities.js';
import { supportsBridgeFeature, supportsBridgeMethod } from '../bridge/capabilities.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ITool>();

  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  getAvailable(
    bridgeConnected: boolean,
    bridgeCapabilities?: BridgeCapabilityManifestType | null,
  ): ITool[] {
    return this.getAll().filter((tool) => {
      if (!tool.metadata.requiresBridge) {
        return true;
      }

      if (!bridgeConnected) {
        return false;
      }

      if (!bridgeCapabilities) {
        return true;
      }

      const requiredMethods = tool.metadata.requiredBridgeMethods ?? [];
      const requiredCapabilities = tool.metadata.requiredBridgeCapabilities ?? [];

      return requiredMethods.every((method) => supportsBridgeMethod(bridgeCapabilities, method))
        && requiredCapabilities.every((feature) => supportsBridgeFeature(bridgeCapabilities, feature));
    });
  }

  getByCategory(category: ToolCategory): ITool[] {
    return this.getAll().filter((tool) => tool.metadata.category === category);
  }
}
