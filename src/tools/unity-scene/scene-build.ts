import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from '../unity/local-diagnostics.js';

/**
 * Assemble a Unity scene from a declarative spec, with no Editor open.
 *
 * The gap this closes is not a connection, it is a verb. Across the bridge's
 * eighty operations — component.add, gameobject.modify, prefab.create and the
 * rest — none sets a serialized field, so `GameBootstrapper._gameConfig` was
 * never assignable by any tool, connected or not. A measured 104-minute run
 * produced nine modules, fifty C# files and sixteen test assemblies, and zero
 * scenes, prefabs or wiring: a library, not a game.
 *
 * `requiresBridge: false` is the load-bearing line. The host removes
 * bridge-requiring tools outright when no Editor is connected, so a tool that
 * claims to need one can never be offered on the path it was built for.
 */
export class SceneBuildTool implements ITool {
  readonly name = 'unity_scene_build';
  readonly description =
    'Assemble a Unity scene from a declarative spec without opening the Editor: create ' +
    'ScriptableObject assets, GameObjects and components, assign serialized field references ' +
    '(including the GameBootstrapper config), save the scene, and verify on disk that every ' +
    'reference is a real link rather than a null that looks like one. Returns what was created, ' +
    'what was assigned, and any problem found.';

  readonly inputSchema = {
    type: 'object',
    properties: {
      spec: {
        type: 'object',
        description:
          'The scene specification. Shape: { specVersion, scene: {path, mode, addToBuildSettings}, ' +
          'assets: [{id, type, path, fields}], objects: [{id, name, parent, components: [{type, fields}]}] }. ' +
          'A field is {name, kind, ...} where kind is "reference" | "string" | "int" | "bool" | "float"; ' +
          'a reference carries {reference: "<id of an asset or object in this spec>"}.',
      },
      specPath: {
        type: 'string',
        description: 'Path to a spec file, as an alternative to passing it inline.',
      },
      projectPath: {
        type: 'string',
        description: 'Unity project root. Defaults to the tool context project path.',
      },
    },
    required: [],
  };

  get metadata(): ToolMetadata {
    return {
      category: 'unity-scene',
      // The whole point: this path exists precisely because the Editor is shut.
      requiresBridge: false,
      dangerous: false,
      readOnly: false,
      requiredBridgeMethods: [],
      requiredBridgeCapabilities: [],
      // A cold Library plus a compile is minutes, not seconds.
      timeoutMs: 360_000,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.readOnly) {
      return { content: `Error: Cannot execute ${this.name} in read-only mode.`, isError: true };
    }

    const projectPath = String(input['projectPath'] ?? context.projectPath ?? '');
    if (!projectPath) {
      return { content: 'Error: no projectPath given and none in context.', isError: true };
    }

    const specJson = this.resolveSpec(input);
    if (specJson === null) {
      return {
        content: 'Error: pass either `spec` (an object) or `specPath` (a readable file).',
        isError: true,
      };
    }

    const editor = await findUnityEditor(projectPath);
    if (!editor) {
      return {
        content:
          'Error: no Unity editor found for this project. Set UNITY_EDITOR_PATH or install the ' +
          'version named in ProjectSettings/ProjectVersion.txt.',
        isError: true,
      };
    }

    // Scratch, never inside the project: a spec or result written under Assets/
    // becomes a stray asset Unity then imports.
    const scratch = mkdtempSync(join(tmpdir(), 'strada-scene-'));
    const specPath = join(scratch, 'spec.json');
    const resultPath = join(scratch, 'result.json');
    const logPath = join(scratch, 'build.log');
    writeFileSync(specPath, specJson);

    try {
      // No -quit, deliberately: the builder owns EditorApplication.Exit, and that
      // ownership is the only thing that makes the exit code mean anything.
      const args = [
        '-batchmode',
        '-nographics',
        '-projectPath', projectPath,
        '-executeMethod', 'Strada.Core.Editor.Headless.StradaSceneBuilder.Build',
        '-stradaSpec', specPath,
        '-stradaResult', resultPath,
        '-logFile', logPath,
      ];
      const exitCode = await this.runUnity(editor.binary, args, 350_000);

      if (!existsSync(resultPath)) {
        // No verdict file means the method never ran — almost always a compile
        // error, which Unity reports by aborting before -executeMethod.
        const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
        const compileErrors = log
          .split('\n')
          .filter((l) => l.includes('error CS'))
          .slice(0, 10);
        return {
          content:
            `Scene build did not run (Unity exit ${exitCode}). ` +
            (compileErrors.length > 0
              ? `Scripts do not compile, so the builder was never reached:\n${compileErrors.join('\n')}`
              : 'No result file and no compile errors — check the Unity log.'),
          isError: true,
        };
      }

      const verdict = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        assembled: boolean;
        exitCode: number;
        created: string[];
        assigned: string[];
        problems: string[];
      };

      return {
        content: this.render(verdict),
        // A wrong wiring has to be loud: the run that quietly delivered a
        // library is the failure this tool exists to make impossible.
        isError: !verdict.assembled,
      };
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch { /* scratch */ }
    }
  }

  private resolveSpec(input: Record<string, unknown>): string | null {
    const inline = input['spec'];
    if (inline && typeof inline === 'object') return JSON.stringify(inline);

    const path = input['specPath'];
    if (typeof path === 'string' && existsSync(path)) return readFileSync(path, 'utf8');

    return null;
  }

  private runUnity(binary: string, args: string[], timeoutMs: number): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(binary, args, { stdio: 'ignore' });
      // We never pass -quit, so a hung Editor is otherwise unbounded.
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }, timeoutMs);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(-1);
      });
    });
  }

  private render(v: {
    assembled: boolean;
    exitCode: number;
    created: string[];
    assigned: string[];
    problems: string[];
  }): string {
    const lines: string[] = [];
    lines.push(v.assembled ? 'Scene assembled and verified on disk.' : 'Scene NOT assembled.');
    lines.push(`Created ${v.created.length} artifact(s), assigned ${v.assigned.length} field(s).`);
    if (v.created.length > 0) {
      lines.push('', 'Created:');
      for (const c of v.created.slice(0, 40)) lines.push(`  ${c}`);
    }
    if (v.problems.length > 0) {
      lines.push('', 'Problems:');
      for (const p of v.problems) lines.push(`  ${p}`);
    }
    lines.push('', JSON.stringify(v));
    return lines.join('\n');
  }
}
