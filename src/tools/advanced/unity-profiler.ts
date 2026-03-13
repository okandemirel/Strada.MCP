import { z } from 'zod';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';

const MAX_FRAME_COUNT = 2000;

const inputSchema = z.object({
  action: z.enum(['start', 'stop', 'getFrameData', 'getSummary']),
  frameCount: z.number().int().min(1).optional().default(60),
});

export class UnityProfilerTool implements ITool {
  readonly name = 'unity_profiler';
  readonly description =
    'Access Unity Profiler data. Start/stop recording, get per-frame CPU/GPU timing, memory allocations, draw calls, and performance summaries with hot function analysis.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop', 'getFrameData', 'getSummary'],
        description: 'Profiler operation',
      },
      frameCount: {
        type: 'number',
        description: 'Number of frames to retrieve (default: 60, max: 2000)',
        default: 60,
      },
    },
    required: ['action'],
  };
  readonly metadata: ToolMetadata = {
    category: 'advanced',
    requiresBridge: true,
    dangerous: false,
    readOnly: true,
  };

  private bridgeClient: BridgeClient | null = null;

  /** Inject the bridge client instance. */
  setBridgeClient(client: BridgeClient): void {
    this.bridgeClient = client;
  }

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    // 1. Check bridge connection
    if (!context.unityBridgeConnected || !this.bridgeClient) {
      return {
        content: `Error: Unity bridge is not connected. Cannot execute ${this.name}.`,
        isError: true,
      };
    }

    // 2. Zod parse + clamp frameCount
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        content: `Invalid input: ${parsed.error.message}`,
        isError: true,
      };
    }

    const { action } = parsed.data;
    let { frameCount } = parsed.data;

    // Clamp frameCount to MAX_FRAME_COUNT
    frameCount = Math.min(frameCount, MAX_FRAME_COUNT);

    const start = performance.now();

    try {
      switch (action) {
        case 'start':
          return await this.profilerAction('profiler.start', {}, start);

        case 'stop':
          return await this.profilerAction('profiler.stop', {}, start);

        case 'getFrameData':
          return await this.profilerAction(
            'profiler.getFrameData',
            { frameCount },
            start,
          );

        case 'getSummary':
          return await this.profilerAction('profiler.getSummary', {}, start);

        default:
          return {
            content: `Error: Unknown action "${action}"`,
            isError: true,
          };
      }
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      return {
        content: `Error in ${this.name}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
        metadata: { executionTimeMs: elapsed },
      };
    }
  }

  private async profilerAction(
    method: string,
    params: Record<string, unknown>,
    start: number,
  ): Promise<ToolResult> {
    const result = await this.bridgeClient!.request<{
      success: boolean;
      result?: unknown;
      error?: string;
    }>(method, params);

    const elapsed = Math.round(performance.now() - start);

    if (result.success && result.result !== undefined) {
      return {
        content: JSON.stringify(result.result, null, 2),
        metadata: { executionTimeMs: elapsed },
      };
    }

    return {
      content: `Error: ${result.error ?? 'Unknown profiler error'}`,
      isError: true,
      metadata: { executionTimeMs: elapsed },
    };
  }
}
