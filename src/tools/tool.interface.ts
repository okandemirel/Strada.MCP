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
}

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly metadata: ToolMetadata;
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
