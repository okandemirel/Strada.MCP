import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

// ---------------------------------------------------------------------------
// unity_play
// ---------------------------------------------------------------------------

const playModeSchema = z.object({
  action: z.enum(['play', 'pause', 'stop', 'step']),
});

export class PlayModeTool extends BridgeTool {
  readonly name = 'unity_play';
  readonly description = 'Control Unity play mode (play, pause, stop, or step one frame)';
  protected readonly rpcMethod = 'editor.playMode';
  protected readonly schema = playModeSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { state?: string };
    return `Play mode action executed. Current state: ${r.state ?? 'unknown'}\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_get_play_state
// ---------------------------------------------------------------------------

const getPlayStateSchema = z.object({});

export class GetPlayStateTool extends BridgeTool {
  readonly name = 'unity_get_play_state';
  readonly description = 'Get the current Unity editor play state';
  protected readonly rpcMethod = 'editor.getPlayState';
  protected readonly schema = getPlayStateSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { state?: string; isPaused?: boolean };
    return `Editor play state: ${r.state ?? 'unknown'}${r.isPaused ? ' (paused)' : ''}\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_execute_menu
// ---------------------------------------------------------------------------

const executeMenuSchema = z.object({
  menuPath: z.string(),
});

export class ExecuteMenuTool extends BridgeTool {
  readonly name = 'unity_execute_menu';
  readonly description =
    'Execute a Unity editor menu command by path (e.g., "File/Save Scene")';
  protected readonly rpcMethod = 'editor.executeMenu';
  protected readonly schema = executeMenuSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Menu command executed successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}
