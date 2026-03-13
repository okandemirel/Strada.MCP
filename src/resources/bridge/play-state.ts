import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

export class PlayStateResource implements IResource {
  readonly uri = 'unity://play-state';
  readonly name = 'Unity Play Mode State';
  readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Current play mode state from Unity bridge',
  };

  private bridgeClient: BridgeClient | null = null;

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async read(): Promise<ResourceContent> {
    if (!this.bridgeClient) {
      throw new Error('Unity bridge not connected. Play state requires a live bridge connection.');
    }

    const state = await this.bridgeClient.request<PlayStateData>(
      'unity/editor/playState',
    );

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(state, null, 2),
    };
  }
}

interface PlayStateData {
  isPlaying: boolean;
  isPaused: boolean;
  isCompiling: boolean;
}
