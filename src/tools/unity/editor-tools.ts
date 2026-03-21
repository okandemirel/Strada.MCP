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
// unity_console_read
// ---------------------------------------------------------------------------

const consoleReadSchema = z.object({
  limit: z.number().int().min(1).max(500).optional().default(100),
  types: z.array(z.enum(['log', 'warning', 'error', 'exception', 'assert'])).optional(),
  includeStackTrace: z.boolean().optional().default(true),
});

interface ConsoleLogEntry {
  type?: string;
  message?: string;
  stackTrace?: string;
  file?: string | null;
  line?: number | null;
  category?: string;
  timestamp?: number;
}

interface ConsoleLogSnapshot {
  entries?: ConsoleLogEntry[];
  totalCount?: number;
}

export class ConsoleReadTool extends BridgeTool {
  readonly name = 'unity_console_read';
  readonly description = 'Read a structured snapshot of recent Unity console logs';
  protected readonly rpcMethod = 'editor.getConsoleLogs';
  protected readonly schema = consoleReadSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const snapshot = result as ConsoleLogSnapshot;
    const entries = snapshot.entries ?? [];
    const counts = entries.reduce<Record<string, number>>((acc, entry) => {
      const key = String(entry.type ?? 'unknown').toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const lines = [
      `Unity console snapshot: ${entries.length}/${snapshot.totalCount ?? entries.length} entries`,
      `Counts: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    ];

    for (const entry of entries.slice(0, 10)) {
      lines.push(
        `- [${entry.type ?? 'unknown'}] ${entry.message ?? ''}` +
        `${entry.file ? ` (${entry.file}${entry.line ? `:${entry.line}` : ''})` : ''}`,
      );
    }

    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// unity_console_analyze
// ---------------------------------------------------------------------------

const consoleAnalyzeSchema = z.object({
  limit: z.number().int().min(1).max(500).optional().default(100),
  includeWarnings: z.boolean().optional().default(true),
});

export class ConsoleAnalyzeTool extends BridgeTool {
  readonly name = 'unity_console_analyze';
  readonly description = 'Analyze recent Unity console logs and group likely root causes';
  protected readonly rpcMethod = 'editor.getConsoleLogs';
  protected readonly schema = consoleAnalyzeSchema;
  protected readonly readOnlyTool = true;
  protected readonly dangerousTool = false;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    const includeWarnings = Boolean(input.includeWarnings ?? true);
    return {
      limit: input.limit,
      types: includeWarnings ? undefined : ['error', 'exception', 'assert'],
      includeStackTrace: true,
    };
  }

  protected formatResponse(result: unknown): string {
    const snapshot = result as ConsoleLogSnapshot;
    const entries = (snapshot.entries ?? []).filter((entry) => Boolean(entry.message));
    if (entries.length === 0) {
      return 'Unity console analysis: no recent logs to analyze.';
    }

    const grouped = new Map<string, { count: number; severity: number; sample: ConsoleLogEntry }>();
    for (const entry of entries) {
      const key = buildConsoleGroupKey(entry);
      const severity = consoleSeverity(entry.type);
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        current.severity = Math.max(current.severity, severity);
      } else {
        grouped.set(key, { count: 1, severity, sample: entry });
      }
    }

    const ordered = [...grouped.values()].sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return b.count - a.count;
    });

    const lines = [`Unity console analysis: ${ordered.length} grouped issue(s)`];
    ordered.slice(0, 10).forEach((group, index) => {
      const entry = group.sample;
      lines.push(
        `${index + 1}. [${entry.type ?? 'unknown'}] ${group.count}x ${normalizeConsoleMessage(entry.message ?? '')}`,
      );
      if (entry.file) {
        lines.push(`   Location: ${entry.file}${entry.line ? `:${entry.line}` : ''}`);
      }
      if (entry.stackTrace) {
        const firstFrame = entry.stackTrace.split('\n').map((line) => line.trim()).find(Boolean);
        if (firstFrame) {
          lines.push(`   Stack: ${firstFrame}`);
        }
      }
    });
    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
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

function consoleSeverity(type: string | undefined): number {
  switch (String(type ?? '').toLowerCase()) {
    case 'exception':
    case 'error':
    case 'assert':
      return 3;
    case 'warning':
      return 2;
    default:
      return 1;
  }
}

function normalizeConsoleMessage(message: string): string {
  return message
    .replace(/\s+/g, ' ')
    .replace(/\(at [^)]+\)/g, '')
    .trim();
}

function buildConsoleGroupKey(entry: ConsoleLogEntry): string {
  const normalizedMessage = normalizeConsoleMessage(entry.message ?? '');
  if (entry.file) {
    return `${String(entry.type ?? '').toLowerCase()}|${entry.file}|${normalizedMessage}`;
  }

  const firstLine = normalizedMessage.split(':')[0] ?? normalizedMessage;
  return `${String(entry.type ?? '').toLowerCase()}|${firstLine}`;
}
