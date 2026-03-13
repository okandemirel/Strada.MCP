import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

export class ConsoleLogsResource implements IResource {
  readonly uri = 'unity://console-logs';
  readonly name = 'Unity Console Logs';
  readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Recent console logs from Unity bridge',
  };

  private bridgeClient: BridgeClient | null = null;

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async read(): Promise<ResourceContent> {
    if (!this.bridgeClient) {
      throw new Error('Unity bridge not connected. Console logs require a live bridge connection.');
    }

    const logs = await this.bridgeClient.request<ConsoleLogData>(
      'unity/console/logs',
    );

    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(logs, null, 2),
    };
  }
}

interface ConsoleLogEntry {
  message: string;
  stackTrace: string;
  type: 'Log' | 'Warning' | 'Error' | 'Exception' | 'Assert';
  timestamp: number;
}

interface ConsoleLogData {
  entries: ConsoleLogEntry[];
  totalCount: number;
}
