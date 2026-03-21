import { z } from 'zod';
import { BridgeTool } from './bridge-tool.js';

const buildPipelineSchema = z.object({
  target: z.enum([
    'Android',
    'iOS',
    'WebGL',
    'StandaloneWindows64',
    'StandaloneOSX',
    'StandaloneLinux64',
  ]),
  outputPath: z.string().min(1),
  scenes: z.array(z.string()).optional(),
  development: z.boolean().optional().default(false),
  clean: z.boolean().optional().default(false),
  preflight: z.boolean().optional().default(true),
  options: z.array(z.string()).optional().default([]),
});

interface BuildPipelineResult {
  success?: boolean;
  target?: string;
  outputPath?: string;
  artifactPath?: string;
  summary?: Record<string, unknown>;
  issues?: unknown[];
}

export class BuildPipelineTool extends BridgeTool {
  readonly name = 'unity_build_pipeline';
  readonly description = 'Run a Unity build for Android, iOS, WebGL, or standalone targets';
  protected readonly rpcMethod = 'project.buildPlayer';
  protected readonly schema = buildPipelineSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = true;

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const build = result as BuildPipelineResult;
    const lines = [
      `Unity build ${build.success ? 'completed' : 'failed'}${build.target ? ` for ${build.target}` : ''}.`,
    ];
    if (build.outputPath) {
      lines.push(`Output: ${build.outputPath}`);
    }
    if (build.artifactPath && build.artifactPath !== build.outputPath) {
      lines.push(`Artifact: ${build.artifactPath}`);
    }
    if (build.summary) {
      lines.push(`Summary: ${JSON.stringify(build.summary)}`);
    }
    if (Array.isArray(build.issues) && build.issues.length > 0) {
      lines.push(`Issues: ${build.issues.length}`);
    }
    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}

const packageManageSchema = z.object({
  action: z.enum(['list', 'add', 'remove', 'resolve']),
  source: z.enum(['registry', 'git', 'local', 'asset-store']).optional().default('registry'),
  packageId: z.string().optional(),
  version: z.string().optional(),
  gitUrl: z.string().optional(),
  localPath: z.string().optional(),
  assetPath: z.string().optional(),
});

interface PackageManageResult {
  action?: string;
  source?: string;
  packageId?: string;
  success?: boolean;
  packages?: Array<Record<string, unknown>>;
  detail?: string;
}

export class PackageManageTool extends BridgeTool {
  readonly name = 'unity_package_manage';
  readonly description = 'List, add, remove, or resolve Unity packages from registry, git, local, or supported asset imports';
  protected readonly rpcMethod = 'project.packageManager';
  protected readonly schema = packageManageSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'list';
  }

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const packageResult = result as PackageManageResult;
    const lines = [
      `Unity package manager: ${packageResult.action ?? 'unknown'}${packageResult.success === false ? ' failed' : ' completed'}.`,
    ];
    if (packageResult.packageId) {
      lines.push(`Package: ${packageResult.packageId}`);
    }
    if (packageResult.detail) {
      lines.push(`Detail: ${packageResult.detail}`);
    }
    if (packageResult.packages) {
      lines.push(`Packages: ${packageResult.packages.length}`);
    }
    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}

const editorPreferencesSchema = z.object({
  action: z.enum(['get', 'set', 'delete']),
  keys: z.array(z.string()).optional(),
  values: z.record(z.string(), z.any()).optional(),
});

interface EditorPreferencesResult {
  values?: Record<string, unknown>;
  deleted?: string[];
}

export class EditorPreferencesTool extends BridgeTool {
  readonly name = 'unity_editor_preferences';
  readonly description = 'Get, set, or delete Unity EditorPrefs / editor preferences';
  protected readonly rpcMethod = 'project.editorPreferences';
  protected readonly schema = editorPreferencesSchema;
  protected readonly readOnlyTool = false;
  protected readonly dangerousTool = false;
  protected override readonly toolCategory = 'unity-config' as const;

  protected override isReadAction(input: Record<string, unknown>): boolean {
    return input.action === 'get';
  }

  protected buildRequest(input: Record<string, unknown>): Record<string, unknown> {
    return input;
  }

  protected formatResponse(result: unknown): string {
    const prefs = result as EditorPreferencesResult;
    const lines = ['Unity editor preferences updated.'];
    if (prefs.values) {
      lines[0] = 'Unity editor preferences snapshot.';
      lines.push(`Keys: ${Object.keys(prefs.values).join(', ') || 'none'}`);
    }
    if (prefs.deleted && prefs.deleted.length > 0) {
      lines.push(`Deleted: ${prefs.deleted.join(', ')}`);
    }
    lines.push('', JSON.stringify(result, null, 2));
    return lines.join('\n');
  }
}
