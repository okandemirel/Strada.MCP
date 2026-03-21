import type { BridgeClient } from './bridge-client.js';
import { BridgeManager } from './bridge-manager.js';
import { ConnectionState } from './connection-manager.js';
import {
  discoverUnityEditorInstances,
  resolveUnityEditorTarget,
  type UnityEditorInstanceInfo,
  type UnityEditorTargetResolution,
} from './editor-instance-registry.js';
import type { ToolContext } from '../tools/tool.interface.js';
import type { Logger } from '../utils/logger.js';

export interface EditorRouterAware {
  setEditorRouter(router: UnityEditorRouter | null): void;
}

export interface BridgeAwareTarget {
  setBridgeClient(client: unknown): void;
}

export interface UnityEditorRouteRequest {
  instanceId?: string;
  projectPath?: string;
  port?: number;
  includeStale?: boolean;
  staleAfterMs?: number;
}

export interface UnityEditorRouteStatus {
  connected: boolean;
  connectionState: ConnectionState | 'disconnected';
  activePort: number | null;
  activeInstance: UnityEditorInstanceInfo | null;
  selectionSource: UnityEditorTargetResolution['source'] | null;
  warnings: string[];
  projectPath: string;
  preferredPort: number;
  preferredInstanceId: string | null;
  discoveryEnabled: boolean;
  discoveredCount: number;
  discoveredEditors?: UnityEditorInstanceInfo[];
}

export interface UnityEditorRouteResult {
  status: 'connected' | 'disconnected' | 'noop' | 'error';
  message: string;
  target: UnityEditorRouteStatus;
  attemptedPort: number | null;
  resolution: UnityEditorTargetResolution | null;
}

export interface BridgeManagerLike {
  readonly client: BridgeClient;
  readonly isConnected: boolean;
  readonly state: ConnectionState;
  connect(): Promise<void>;
  destroy(): void;
  on(event: 'stateChange', handler: (state: ConnectionState) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
}

export interface UnityEditorRouterOptions {
  projectPath: string;
  preferredPort: number;
  preferredInstanceId?: string;
  discoveryEnabled: boolean;
  staleAfterMs: number;
  registryDir?: string;
  autoConnect: boolean;
  timeoutMs: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logger: Logger;
  toolContext: ToolContext;
  bridgeAwareTools: BridgeAwareTarget[];
  bridgeAwareResources: BridgeAwareTarget[];
  editorRouterAwareTools?: EditorRouterAware[];
  managerFactory?: (port: number) => BridgeManagerLike;
}

export class UnityEditorRouter {
  private readonly managerFactory: (port: number) => BridgeManagerLike;
  private currentManager: BridgeManagerLike | null = null;
  private currentSelection: UnityEditorInstanceInfo | null = null;
  private currentSource: UnityEditorTargetResolution['source'] | null = null;
  private currentWarnings: string[] = [];
  private currentPort: number | null = null;

  constructor(private readonly options: UnityEditorRouterOptions) {
    this.managerFactory = options.managerFactory ?? ((port) => new BridgeManager({
      port,
      autoConnect: true,
      timeoutMs: options.timeoutMs,
      logLevel: options.logLevel,
    }));

    this.applyBridgeClient(null);
    this.options.toolContext.unityBridgeConnected = false;
    for (const tool of options.editorRouterAwareTools ?? []) {
      tool.setEditorRouter(this);
    }
  }

  async initialize(): Promise<UnityEditorRouteStatus> {
    if (!this.options.autoConnect) {
      return this.getStatus({ includeDiscovered: true });
    }

    const result = await this.retarget({
      projectPath: this.options.projectPath,
    });

    if (result.status === 'error') {
      this.options.logger.warn(result.message);
    }

    return result.target;
  }

  listEditors(options: {
    includeStale?: boolean;
    staleAfterMs?: number;
  } = {}): UnityEditorInstanceInfo[] {
    return discoverUnityEditorInstances({
      registryDir: this.options.registryDir,
      includeStale: options.includeStale,
      staleAfterMs: options.staleAfterMs ?? this.options.staleAfterMs,
    });
  }

  getStatus(options: {
    includeDiscovered?: boolean;
    includeStale?: boolean;
    staleAfterMs?: number;
  } = {}): UnityEditorRouteStatus {
    const discoveredEditors = options.includeDiscovered
      ? this.listEditors({
        includeStale: options.includeStale,
        staleAfterMs: options.staleAfterMs,
      })
      : undefined;

    return {
      connected: this.currentManager?.isConnected ?? false,
      connectionState: this.currentManager?.state ?? 'disconnected',
      activePort: this.currentPort,
      activeInstance: this.currentSelection,
      selectionSource: this.currentSource,
      warnings: [...this.currentWarnings],
      projectPath: this.options.projectPath,
      preferredPort: this.options.preferredPort,
      preferredInstanceId: this.options.preferredInstanceId ?? null,
      discoveryEnabled: this.options.discoveryEnabled,
      discoveredCount: discoveredEditors?.length ?? this.listEditors().length,
      discoveredEditors,
    };
  }

  getBridgeClient(): BridgeClient | null {
    return this.currentManager?.client ?? null;
  }

  async retarget(request: UnityEditorRouteRequest = {}): Promise<UnityEditorRouteResult> {
    const resolution = resolveUnityEditorTarget({
      registryDir: this.options.registryDir,
      projectPath: request.projectPath ?? this.options.projectPath,
      preferredPort: request.port ?? this.options.preferredPort,
      preferredInstanceId: request.instanceId ?? this.options.preferredInstanceId,
      explicitPort: request.port !== undefined,
      discoveryEnabled: this.options.discoveryEnabled,
      staleAfterMs: request.staleAfterMs ?? this.options.staleAfterMs,
      includeStale: request.includeStale ?? false,
    });

    if (this.currentPort === resolution.port
      && this.currentSelection?.instanceId === resolution.selected?.instanceId
      && this.currentManager?.isConnected) {
      this.currentWarnings = resolution.warnings;
      this.currentSource = resolution.source;
      this.currentSelection = resolution.selected;
      return {
        status: 'noop',
        message: `Already connected to Unity editor on port ${resolution.port}.`,
        attemptedPort: resolution.port,
        resolution,
        target: this.getStatus({ includeDiscovered: true }),
      };
    }

    const nextManager = this.managerFactory(resolution.port);
    this.bindManager(nextManager);

    try {
      await nextManager.connect();
    } catch (error) {
      nextManager.destroy();
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        attemptedPort: resolution.port,
        resolution,
        target: this.getStatus({ includeDiscovered: true }),
      };
    }

    const previousManager = this.currentManager;
    this.currentManager = nextManager;
    this.currentPort = resolution.port;
    this.currentSelection = resolution.selected;
    this.currentSource = resolution.source;
    this.currentWarnings = [...resolution.warnings];
    this.options.toolContext.unityBridgeConnected = nextManager.isConnected;
    this.applyBridgeClient(nextManager.client);
    previousManager?.destroy();

    const connectedName = resolution.selected?.projectName ?? 'Unity editor';
    return {
      status: 'connected',
      message: `Connected to ${connectedName} on port ${resolution.port}.`,
      attemptedPort: resolution.port,
      resolution,
      target: this.getStatus({ includeDiscovered: true }),
    };
  }

  disconnect(): UnityEditorRouteResult {
    const previousPort = this.currentPort;
    const previousSelection = this.currentSelection;

    const previousManager = this.currentManager;
    this.currentManager = null;
    this.currentPort = null;
    this.currentSelection = null;
    this.currentSource = null;
    this.currentWarnings = [];
    this.options.toolContext.unityBridgeConnected = false;
    this.applyBridgeClient(null);
    previousManager?.destroy();

    return {
      status: 'disconnected',
      message: previousPort
        ? `Disconnected from Unity editor on port ${previousPort}.`
        : 'Unity editor bridge was already disconnected.',
      attemptedPort: previousPort,
      resolution: previousSelection
        ? {
          selected: previousSelection,
          discovered: this.listEditors(),
          port: previousPort ?? this.options.preferredPort,
          source: 'default',
          warnings: [],
        }
        : null,
      target: this.getStatus({ includeDiscovered: true }),
    };
  }

  destroy(): void {
    this.disconnect();
    for (const tool of this.options.editorRouterAwareTools ?? []) {
      tool.setEditorRouter(null);
    }
  }

  private bindManager(manager: BridgeManagerLike): void {
    manager.on('stateChange', (state) => {
      if (manager !== this.currentManager) {
        return;
      }

      const connected = state === ConnectionState.Connected;
      this.options.toolContext.unityBridgeConnected = connected;
      this.applyBridgeClient(connected ? manager.client : null);
      this.options.logger.info(`Unity bridge: ${state}`);
    });

    manager.on('error', (error) => {
      if (manager !== this.currentManager) {
        return;
      }

      this.options.logger.warn(`Unity bridge error: ${error.message}`);
    });
  }

  private applyBridgeClient(client: BridgeClient | null): void {
    for (const tool of this.options.bridgeAwareTools) {
      tool.setBridgeClient(client);
    }

    for (const resource of this.options.bridgeAwareResources) {
      resource.setBridgeClient(client);
    }
  }
}
