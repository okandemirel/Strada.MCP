import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

abstract class BridgeJsonResource implements IResource {
  abstract readonly uri: string;
  abstract readonly name: string;
  protected abstract readonly rpcMethod: string;

  readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Live data from the Unity bridge',
  };

  private bridgeClient: BridgeClient | null = null;

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async read(): Promise<ResourceContent> {
    if (!this.bridgeClient) {
      throw new Error(`Unity bridge not connected. ${this.name} requires a live bridge connection.`);
    }

    const payload = await this.bridgeClient.request(this.rpcMethod, {});
    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(payload, null, 2),
    };
  }
}

export class StradaModuleGraphResource extends BridgeJsonResource {
  readonly uri = 'strada://module-graph';
  readonly name = 'Strada Module Graph';
  protected readonly rpcMethod = 'strada.moduleGraph';
  override readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Live Strada.Core module graph from the Unity editor',
  };
}

export class StradaContainerGraphResource extends BridgeJsonResource {
  readonly uri = 'strada://container-graph';
  readonly name = 'Strada Container Graph';
  protected readonly rpcMethod = 'strada.containerGraph';
  override readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Live Strada.Core container graph from the Unity editor',
  };
}

export class StradaSystemProfileResource extends BridgeJsonResource {
  readonly uri = 'strada://system-profile';
  readonly name = 'Strada System Profile';
  protected readonly rpcMethod = 'strada.systemProfile';
  override readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Live Strada.Core system profiling metrics from the Unity editor',
  };
}

export class StradaHotReloadResource extends BridgeJsonResource {
  readonly uri = 'strada://hot-reload';
  readonly name = 'Strada Hot Reload';
  protected readonly rpcMethod = 'strada.hotReload';
  override readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Current Strada.Core hot reload state from the Unity editor',
  };
}

export class StradaValidationReportResource extends BridgeJsonResource {
  readonly uri = 'strada://validation-report';
  readonly name = 'Strada Validation Report';
  protected readonly rpcMethod = 'strada.validationReport';
  override readonly metadata: ResourceMetadata = {
    requiresBridge: true,
    description: 'Combined authoritative Strada.Core validation report from the Unity editor',
  };
}
