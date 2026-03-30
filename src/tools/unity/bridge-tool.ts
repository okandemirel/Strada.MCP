import type { z } from 'zod';
import { zodToJsonSchema } from '../../utils/zod-to-json-schema.js';
import type { BridgeClient } from '../../bridge/bridge-client.js';
import type { ITool, ToolContext, ToolResult, ToolMetadata, ToolCategory } from '../tool.interface.js';

/**
 * Abstract base class for all Unity bridge-dependent tools.
 *
 * Subclasses define: name, description, rpcMethod, schema, buildRequest(), formatResponse().
 * This base handles: bridge check, zod validation, read-only guard, RPC dispatch, timing.
 */
export abstract class BridgeTool implements ITool {
  abstract readonly name: string;
  abstract readonly description: string;

  /** The JSON-RPC method to call on the Unity bridge. */
  protected abstract readonly rpcMethod: string;

  /** Zod schema for input validation. */
  protected abstract readonly schema: z.ZodObject<z.ZodRawShape>;

  /** Whether this tool only reads state (true) or mutates it (false). */
  protected abstract readonly readOnlyTool: boolean;

  /** Whether this tool is dangerous (e.g., delete operations). */
  protected abstract readonly dangerousTool: boolean;

  /** Override to change the tool category from the default 'unity-runtime'. */
  protected readonly toolCategory: ToolCategory = 'unity-runtime';

  /** Override when a tool needs bridge features beyond the raw JSON-RPC method. */
  protected readonly requiredBridgeCapabilities: readonly string[] = [];

  private bridgeClient: BridgeClient | null = null;
  private _inputSchema: Record<string, unknown> | null = null;

  get inputSchema(): Record<string, unknown> {
    if (!this._inputSchema) {
      this._inputSchema = zodToJsonSchema(this.schema);
    }
    return this._inputSchema;
  }

  get metadata(): ToolMetadata {
    return {
      category: this.toolCategory,
      requiresBridge: true,
      dangerous: this.dangerousTool,
      readOnly: this.readOnlyTool,
      requiredBridgeMethods: [this.rpcMethod],
      requiredBridgeCapabilities: [...this.requiredBridgeCapabilities],
    };
  }

  /** Inject the bridge client instance. */
  setBridgeClient(client: BridgeClient | null): void {
    this.bridgeClient = client;
  }

  protected get client(): BridgeClient | null {
    return this.bridgeClient;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();

    try {
      // Check bridge connection
      if (!context.unityBridgeConnected || !this.client) {
        return {
          content: `Error: Unity bridge is not connected. Cannot execute ${this.name}.`,
          isError: true,
        };
      }

      // Check read-only mode for write tools (allow read actions through)
      if (!this.readOnlyTool && !this.isReadAction(input) && context.readOnly) {
        return {
          content: `Error: Cannot execute ${this.name} in read-only mode.`,
          isError: true,
        };
      }

      // Validate input
      const parsed = this.schema.parse(input);

      // Build RPC params and send request
      const params = this.buildRequest(parsed as Record<string, unknown>);
      const result = await this.client.request(this.rpcMethod, params);

      // Format response
      const content = this.formatResponse(result);
      const elapsed = performance.now() - start;

      return {
        content,
        metadata: { executionTimeMs: Math.round(elapsed) },
      };
    } catch (err) {
      const elapsed = performance.now() - start;
      return {
        content: `Error in ${this.name}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
        metadata: { executionTimeMs: Math.round(elapsed) },
      };
    }
  }

  /**
   * Override in subclasses with get/set actions to allow read operations in read-only mode.
   * Returns true if the given input represents a read-only action (e.g., action === 'get').
   */
  protected isReadAction(_input: Record<string, unknown>): boolean {
    return false;
  }

  /** Build the JSON-RPC params from validated input. */
  protected abstract buildRequest(input: Record<string, unknown>): Record<string, unknown>;

  /** Format the bridge response into a human-readable string. */
  protected abstract formatResponse(result: unknown): string;
}
