import { z } from 'zod';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { ITool, ToolContext, ToolMetadata, ToolResult } from '../tool.interface.js';
import { searchSymbols } from '../analysis/csharp-symbol-utils.js';

const inputSchema = z.object({
  recompile: z.boolean().optional().default(true),
  compileTimeoutMs: z.number().int().min(1000).max(120000).optional().default(30000),
  pollIntervalMs: z.number().int().min(50).max(5000).optional().default(250),
  consoleLimit: z.number().int().min(1).max(500).optional().default(100),
});

interface CompileIssue {
  message?: string;
  file?: string | null;
  line?: number | null;
}

export class UnityFixCompileLoopTool implements ITool {
  readonly name = 'unity_fix_compile_loop';
  readonly description =
    'Aggregate compile status, console diagnostics, local symbol context, and actionable fix recommendations for Unity compile failures';
  readonly inputSchema = zodToJsonSchema(inputSchema);
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: true,
    dangerous: false,
    readOnly: false,
  };

  private bridgeClient: BridgeClient | null = null;

  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (!context.unityBridgeConnected || !this.bridgeClient) {
      return {
        content: 'Error: Unity bridge is not connected.',
        isError: true,
      };
    }

    const parsed = inputSchema.parse(input);
    if (context.readOnly && parsed.recompile) {
      return {
        content: 'Error: Cannot recompile in read-only mode.',
        isError: true,
      };
    }

    const start = performance.now();

    if (parsed.recompile) {
      await this.bridgeClient.request('editor.recompile', { reason: 'unity_fix_compile_loop' });
    }

    const compile = await waitForCompile(this.bridgeClient, parsed.compileTimeoutMs, parsed.pollIntervalMs);
    const consoleSnapshot = await this.bridgeClient.request<{ entries?: CompileIssue[] }>('editor.getConsoleLogs', {
      limit: parsed.consoleLimit,
      types: ['error', 'exception', 'assert'],
      includeStackTrace: true,
    });

    const compileIssues = (compile.compileIssues as CompileIssue[] | undefined) ?? [];
    const relevantIssues = compileIssues.length > 0 ? compileIssues : (consoleSnapshot.entries ?? []);
    const recommendations = await Promise.all(relevantIssues.slice(0, 5).map(async (issue) => {
      const symbolQuery = extractLikelySymbol(issue.message ?? '');
      const matches = symbolQuery
        ? await searchSymbols(context.projectPath, { query: symbolQuery, limit: 5 })
        : [];
      return {
        issue,
        symbolQuery,
        symbolMatches: matches,
        recommendation: buildRecommendation(issue, symbolQuery),
      };
    }));

    return {
      content: JSON.stringify({
        backend: 'bridge+project-symbol-index',
        authority: 'mixed',
        compile,
        diagnostics: consoleSnapshot,
        recommendations,
      }, null, 2),
      metadata: { executionTimeMs: Math.round(performance.now() - start) },
      isError: Boolean(relevantIssues.length),
    };
  }
}

async function waitForCompile(
  client: BridgeClient,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: Record<string, unknown> = {};

  while (Date.now() <= deadline) {
    lastStatus = await client.request<Record<string, unknown>>('editor.compileStatus', {});
    if (!lastStatus.isCompiling && !lastStatus.isReloading) {
      return lastStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    ...lastStatus,
    status: 'timeout',
  };
}

function extractLikelySymbol(message: string): string | null {
  const match = /\b([A-Z][A-Za-z0-9_<>.]*)\b/.exec(message);
  return match?.[1] ?? null;
}

function buildRecommendation(issue: CompileIssue, symbolQuery: string | null): string {
  const filePart = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : 'the reported location';
  if (symbolQuery) {
    return `Inspect ${filePart} and verify the symbol "${symbolQuery}" still exists, is imported, and is used with the correct signature.`;
  }
  return `Inspect ${filePart}, compare the failing line against the latest compile message, and re-run compilation after patching the reported syntax or API mismatch.`;
}
