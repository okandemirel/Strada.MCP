/**
 * unity_build_player — produce a runnable artifact with no Editor open.
 *
 * Every other build path in this toolchain needed a live Editor bridge, so
 * "delivery" meant an Editor project a person still had to build (audited
 * 2026-09-10). This drives Strada.Core's headless StradaPlayerBuilder: the
 * enabled scenes become a player for the requested target, and the verdict
 * is what the build report and the file system say — the artifact's path,
 * its size on disk, the build's duration and every error the report holds.
 */
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from './local-diagnostics.js';
import { runUnityProcess } from './playmode-verify.js';
import { resolveProjectPath } from './project-path.js';

export const BUILD_TARGETS = ['android', 'ios', 'webgl', 'windows', 'macos', 'linux'] as const;
export type BuildTargetName = (typeof BUILD_TARGETS)[number];
const DEFAULT_TIMEOUT_MS = 30 * 60_000;

export interface PlayerBuildResult {
  built: boolean;
  exitCode: number;
  target: string;
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
  warnings: number;
  scenes: string[];
  errors: string[];
}

export interface PlayerBuildVerdict {
  readonly ok: boolean;
  readonly reasons: string[];
  readonly result: PlayerBuildResult | null;
  /** Measured on disk after the build, independent of the report's own number. */
  readonly artifact: { readonly path: string; readonly exists: boolean; readonly sizeBytes: number } | null;
  readonly measuredAt: string;
}

export function buildPlayerArgs(options: {
  projectPath: string;
  resultPath: string;
  logPath: string;
  target?: string;
  outputDir?: string;
}): string[] {
  const args = [
    '-batchmode',
    '-nographics',
    '-projectPath',
    options.projectPath,
    '-executeMethod',
    'Strada.Core.Editor.Headless.StradaPlayerBuilder.Build',
    '-stradaResult',
    options.resultPath,
    '-logFile',
    options.logPath,
  ];
  // No -quit: the builder owns EditorApplication.Exit and its code is the verdict.
  if (options.target) args.push('-stradaTarget', options.target);
  if (options.outputDir) args.push('-stradaOutput', options.outputDir);
  return args;
}

export function sizeOnDisk(path: string): number {
  try {
    const st = statSync(path);
    if (st.isFile()) return st.size;
    if (!st.isDirectory()) return 0;
    let total = 0;
    const stack = [path];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) total += statSync(full).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** Judge a finished build from the result file and the file system. Pure, so it is testable without Unity. */
export function judgePlayerBuild(resultPath: string, exitCode: number, log: string): PlayerBuildVerdict {
  const reasons: string[] = [];
  let result: PlayerBuildResult | null = null;
  if (existsSync(resultPath)) {
    try {
      result = JSON.parse(readFileSync(resultPath, 'utf8')) as PlayerBuildResult;
    } catch (error) {
      reasons.push(`the build result file is not valid JSON (${String(error)})`);
    }
  } else {
    const compileErrors = log
      .split('\n')
      .filter((l) => /error CS\d{4}/.test(l))
      .slice(0, 8);
    reasons.push(
      `no build result was written (Unity exit ${exitCode}) — ` +
        (compileErrors.length > 0
          ? `scripts do not compile, so the builder was never reached:\n${compileErrors.join('\n')}`
          : 'the builder was never reached; check the Unity log (is Strada.Core.Editor in the project?)'),
    );
  }
  let artifact: PlayerBuildVerdict['artifact'] = null;
  if (result !== null) {
    if (!result.built) reasons.push(...(result.errors.length > 0 ? result.errors : [`build failed with exit code ${result.exitCode}`]));
    if (result.outputPath) {
      const exists = existsSync(result.outputPath);
      artifact = { path: result.outputPath, exists, sizeBytes: exists ? sizeOnDisk(result.outputPath) : 0 };
      if (result.built && !exists) reasons.push(`the report says built but nothing exists at ${result.outputPath}`);
      if (result.built && exists && artifact.sizeBytes === 0) reasons.push(`the artifact at ${result.outputPath} is empty`);
    } else if (result.built) {
      reasons.push('the report says built but names no output path');
    }
  }
  return { ok: reasons.length === 0, reasons, result, artifact, measuredAt: new Date().toISOString() };
}

export function renderPlayerBuild(verdict: PlayerBuildVerdict): string {
  const lines: string[] = [];
  const r = verdict.result;
  lines.push(verdict.ok ? `PLAYER BUILT (${r?.target}).` : 'PLAYER BUILD FAILED.');
  if (r) {
    lines.push(
      `Target ${r.target}; ${r.scenes.length} scene(s): ${r.scenes.join(', ') || 'none'}; ` +
        `${(r.durationMs / 1000).toFixed(0)} s; ${r.warnings} warning(s); ${r.errors.length} error(s).`,
    );
  }
  if (verdict.artifact) {
    const a = verdict.artifact;
    lines.push(`Artifact: ${a.path} — ${a.exists ? `${(a.sizeBytes / (1024 * 1024)).toFixed(1)} MB on disk` : 'MISSING'}.`);
  }
  if (!verdict.ok) lines.push(`Why not ok:\n  - ${verdict.reasons.join('\n  - ')}`);
  lines.push('', '```json', JSON.stringify({ ok: verdict.ok, reasons: verdict.reasons, result: verdict.result, artifact: verdict.artifact, measuredAt: verdict.measuredAt }), '```');
  return lines.join('\n');
}

export class BuildPlayerTool implements ITool {
  readonly name = 'unity_build_player';
  readonly description =
    'Build a runnable player with no Unity Editor open: the enabled scenes become an APK/AAB, an Xcode ' +
    'project, a WebGL folder or a desktop executable for the requested target, through Strada.Core\'s headless ' +
    'StradaPlayerBuilder. Reports the artifact path, its measured size on disk, the build duration and every ' +
    'error the build report holds. A missing build-support module, no enabled scene, or a build error is a ' +
    'refusal that names itself. Use this to turn a delivered project into something a person can install and run.';

  readonly inputSchema = {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: 'Unity project root. Defaults to the tool context project path.' },
      target: { type: 'string', enum: [...BUILD_TARGETS], description: 'Build target. Defaults to the project\'s active build target.' },
      outputDir: { type: 'string', description: 'Where the artifact goes (default <projectPath>/Builds/<target>).' },
      timeoutMs: { type: 'number', description: `Build time budget (default ${DEFAULT_TIMEOUT_MS} ms). A player build is minutes; a first IL2CPP build can be many.` },
    },
    required: [],
  };

  get metadata(): ToolMetadata {
    return {
      category: 'unity-runtime',
      requiresBridge: false,
      dangerous: false,
      readOnly: false,
      requiredBridgeMethods: [],
      requiredBridgeCapabilities: [],
      timeoutMs: DEFAULT_TIMEOUT_MS + 60_000,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const resolved = resolveProjectPath(input['projectPath'], context.projectPath);
    const result = await this.run(input, resolved.projectPath);
    return resolved.mismatchNote === undefined ? result : { ...result, content: `${result.content}\n\n${resolved.mismatchNote}` };
  }

  private async run(input: Record<string, unknown>, projectPath: string): Promise<ToolResult> {
    if (!projectPath) return { content: 'Error: no projectPath given and none in context.', isError: true };
    const target = typeof input['target'] === 'string' ? input['target'].trim().toLowerCase() : undefined;
    if (target !== undefined && !(BUILD_TARGETS as readonly string[]).includes(target)) {
      return { content: `Error: unknown target "${target}" — one of ${BUILD_TARGETS.join(', ')}.`, isError: true };
    }
    const editor = await findUnityEditor(projectPath);
    if (!editor) {
      return { content: 'Error: no Unity editor found for this project. Set UNITY_EDITOR_PATH or install the version named in ProjectSettings/ProjectVersion.txt.', isError: true };
    }
    const outputDir =
      typeof input['outputDir'] === 'string' && input['outputDir'].trim() !== ''
        ? isAbsolute(input['outputDir'])
          ? input['outputDir']
          : join(projectPath, input['outputDir'])
        : undefined;
    const timeoutMs = typeof input['timeoutMs'] === 'number' && input['timeoutMs'] > 0 ? Math.floor(input['timeoutMs']) : DEFAULT_TIMEOUT_MS;
    const scratch = mkdtempSync(join(tmpdir(), 'strada-build-'));
    const resultPath = join(scratch, 'result.json');
    const logPath = join(scratch, 'build.log');
    try {
      const args = buildPlayerArgs({ projectPath, resultPath, logPath, target, outputDir });
      const exitCode = await runUnityProcess(editor.binary, args, timeoutMs);
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      const verdict = judgePlayerBuild(resultPath, exitCode, log);
      return { content: renderPlayerBuild(verdict), isError: !verdict.ok };
    } finally {
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* scratch */
      }
    }
  }
}
