import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

// ---------------------------------------------------------------------------
// unity_console_log
// ---------------------------------------------------------------------------

const consoleLogSchema = z.object({
  message: z.string(),
  type: z.enum(['log', 'warning', 'error']),
});

export class ConsoleLogTool extends BridgeTool {
  readonly name = 'unity_console_log';
  readonly description =
    'Write a message to the Unity console (log, warning, or error)';
  protected readonly rpcMethod = 'editor.log';
  protected readonly schema = consoleLogSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Console message sent successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_console_clear
// ---------------------------------------------------------------------------

const consoleClearSchema = z.object({});

export class ConsoleClearTool extends BridgeTool {
  readonly name = 'unity_console_clear';
  readonly description = 'Clear the Unity editor console';
  protected readonly rpcMethod = 'editor.clearConsole';
  protected readonly schema = consoleClearSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Console cleared successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_selection_get
// ---------------------------------------------------------------------------

const selectionGetSchema = z.object({});

export class SelectionGetTool extends BridgeTool {
  readonly name = 'unity_selection_get';
  readonly description = 'Get the currently selected objects in the Unity editor';
  protected readonly rpcMethod = 'editor.getSelection';
  protected readonly schema = selectionGetSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const r = result as { instanceIds?: number[]; names?: string[] };
    const ids = r.instanceIds ?? [];
    return `Selection: ${ids.length} object(s) selected.\n${JSON.stringify(result, null, 2)}`;
  }
}

// ---------------------------------------------------------------------------
// unity_selection_set
// ---------------------------------------------------------------------------

const selectionSetSchema = z.object({
  instanceIds: z.array(z.number()),
});

export class SelectionSetTool extends BridgeTool {
  readonly name = 'unity_selection_set';
  readonly description = 'Set the editor selection to the specified instance IDs';
  protected readonly rpcMethod = 'editor.setSelection';
  protected readonly schema = selectionSetSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    return `Selection updated successfully.\n${JSON.stringify(result, null, 2)}`;
  }
}
