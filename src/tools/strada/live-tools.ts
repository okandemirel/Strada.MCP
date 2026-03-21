import { z } from 'zod';
import { BridgeTool } from '../unity/bridge-tool.js';

const emptySchema = z.object({});
const hotReloadSchema = z.object({
  action: z.enum(['get', 'set']).optional().default('get'),
  enabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});
const logSettingsSchema = z.object({
  action: z.enum(['get', 'set']).optional().default('get'),
  showLogs: z.boolean().optional(),
  deepLogsEnabled: z.boolean().optional(),
  maxLogEntries: z.number().int().min(100).max(100000).optional(),
  moduleVisibility: z.record(z.string(), z.boolean()).optional(),
});

abstract class StradaLiveTool extends BridgeTool {
  protected override readonly toolCategory = 'strada' as const;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return JSON.stringify(result, null, 2);
  }
}

export class StradaModuleGraphTool extends StradaLiveTool {
  readonly name = 'strada_module_graph';
  readonly description = 'Read the live Strada.Core module graph from the Unity editor';
  protected readonly rpcMethod = 'strada.moduleGraph';
  protected readonly schema = emptySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class StradaContainerGraphTool extends StradaLiveTool {
  readonly name = 'strada_container_graph';
  readonly description = 'Read the live Strada.Core container registration graph from the Unity editor';
  protected readonly rpcMethod = 'strada.containerGraph';
  protected readonly schema = emptySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class StradaValidateArchitectureLiveTool extends StradaLiveTool {
  readonly name = 'strada_validate_architecture_live';
  readonly description = 'Run authoritative Strada.Core architecture validation from the Unity editor';
  protected readonly rpcMethod = 'strada.architectureValidate';
  protected readonly schema = emptySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class StradaValidateModulesLiveTool extends StradaLiveTool {
  readonly name = 'strada_validate_modules_live';
  readonly description = 'Run authoritative Strada.Core module validation from the Unity editor';
  protected readonly rpcMethod = 'strada.moduleValidate';
  protected readonly schema = emptySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class StradaSystemProfileTool extends StradaLiveTool {
  readonly name = 'strada_system_profile';
  readonly description = 'Read live Strada.Core system profiling metrics from the Unity editor';
  protected readonly rpcMethod = 'strada.systemProfile';
  protected readonly schema = emptySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class StradaHotReloadStatusTool extends StradaLiveTool {
  readonly name = 'strada_hot_reload_status';
  readonly description = 'Read Strada.Core hot reload status and last reload outcome';
  protected readonly rpcMethod = 'strada.hotReload';
  protected readonly schema = emptySchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;
}

export class StradaHotReloadControlTool extends StradaLiveTool {
  readonly name = 'strada_hot_reload_control';
  readonly description = 'Enable or disable Strada.Core hot reload and notifications';
  protected readonly rpcMethod = 'strada.hotReload';
  protected readonly schema = hotReloadSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'get';
  }
}

export class StradaLogModulesTool extends StradaLiveTool {
  readonly name = 'strada_log_modules';
  readonly description = 'Read or update Strada.Core log settings and module visibility';
  protected readonly rpcMethod = 'strada.logSettings';
  protected readonly schema = logSettingsSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'get';
  }
}
