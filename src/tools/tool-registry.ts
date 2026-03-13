import type { ITool, ToolCategory } from './tool.interface.js';

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

  getAvailable(bridgeConnected: boolean): ITool[] {
    return this.getAll().filter((tool) => !tool.metadata.requiresBridge || bridgeConnected);
  }

  getByCategory(category: ToolCategory): ITool[] {
    return this.getAll().filter((tool) => tool.metadata.category === category);
  }
}
