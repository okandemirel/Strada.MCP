import type { IResource } from './resource.interface.js';

export class ResourceRegistry {
  private readonly resources = new Map<string, IResource>();

  register(resource: IResource): void {
    if (this.resources.has(resource.uri)) {
      throw new Error(`Resource "${resource.uri}" already registered`);
    }
    this.resources.set(resource.uri, resource);
  }

  get(uri: string): IResource | undefined {
    return this.resources.get(uri);
  }

  getAll(): IResource[] {
    return Array.from(this.resources.values());
  }

  getAvailable(bridgeConnected: boolean): IResource[] {
    return this.getAll().filter(
      (resource) => !resource.metadata.requiresBridge || bridgeConnected,
    );
  }
}
