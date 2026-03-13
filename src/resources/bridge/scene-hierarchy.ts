import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

export class SceneHierarchyResource implements IResource {
  readonly uri = 'unity://scene-hierarchy';
  readonly name = 'Unity Scene Hierarchy';
  readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Scene tree from Unity bridge',
  };

  private bridgeClient: BridgeClient | null = null;

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async read(): Promise<ResourceContent> {
    if (!this.bridgeClient) {
      throw new Error('Unity bridge not connected. Scene hierarchy requires a live bridge connection.');
    }

    const hierarchy = await this.bridgeClient.request<SceneHierarchyData>(
      'unity/scene/hierarchy',
    );

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(hierarchy, null, 2),
    };
  }
}

interface SceneNode {
  name: string;
  id: number;
  active: boolean;
  children: SceneNode[];
  components: string[];
}

interface SceneHierarchyData {
  sceneName: string;
  rootObjects: SceneNode[];
}
