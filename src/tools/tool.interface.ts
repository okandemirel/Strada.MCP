export interface ToolContext {
  projectPath: string;
  workingDirectory: string;
  readOnly: boolean;
  unityBridgeConnected: boolean;
  allowedPaths?: string[];
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  metadata?: {
    executionTimeMs?: number;
    filesAffected?: string[];
  };
}

export type ToolCategory =
  | 'strada'
  | 'unity-runtime'
  | 'unity-scene'
  | 'unity-asset'
  | 'unity-subsystem'
  | 'unity-config'
  | 'file'
  | 'search'
  | 'git'
  | 'dotnet'
  | 'analysis'
  | 'advanced';

export interface ToolMetadata {
  category: ToolCategory;
  requiresBridge: boolean;
  dangerous: boolean;
  readOnly: boolean;
  requiredBridgeMethods?: string[];
  requiredBridgeCapabilities?: string[];
  /**
   * How long this tool may legitimately run, in milliseconds.
   *
   * Hosts cap tool calls to keep a stuck tool from hanging an agent, and that
   * cap is tuned for tools that answer in seconds. A tool that compiles a Unity
   * project headlessly needs minutes, so without a way to say so it is offered
   * and then killed mid-work — measured, unity_verify_change reached the agent
   * and died at 30002ms every time, three calls in a row.
   *
   * Omit it for ordinary tools; the host's default is right for them.
   */
  timeoutMs?: number;
}

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly metadata: ToolMetadata;
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
