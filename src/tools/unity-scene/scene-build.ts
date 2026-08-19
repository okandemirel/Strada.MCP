import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from '../unity/local-diagnostics.js';
import { emitBootSmokeTest } from './boot-smoke-test.js';

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
          'MINIMAL WORKING SPEC — a scene without these three pieces compiles and runs nothing:\n' +
          '  1. an asset of type Strada.Core.Bootstrap.GameBootstrapperConfig\n' +
          '  2. an object with a Strada.Core.Bootstrap.GameBootstrapper component\n' +
          '  3. that component\'s _gameConfig field, kind "reference", pointing at the asset id\n' +
          'Example: {"assets":[{"id":"cfg","type":"Strada.Core.Bootstrap.GameBootstrapperConfig",' +
          '"path":"Assets/Settings/Bootstrap.asset","fields":[]}],' +
          '"objects":[{"id":"boot","name":"GameBootstrapper","components":[{' +
          '"type":"Strada.Core.Bootstrap.GameBootstrapper","fields":[' +
          '{"name":"_gameConfig","kind":"reference","reference":"cfg"}]}]}]}\n' +
          'Anything the game spawns at runtime — tiles, enemies, projectiles — belongs in the spec ' +
          'as an object with a prefabPath and keepInScene: false, not as a scene object.\n' +
          'A list field takes kind "referenceList" with an ids array. GameBootstrapperConfig._modules ' +
          'is the one that matters: without it the bootstrapper is wired to a config that starts ' +
          'nothing. It holds wrapper structs, so name the field inside each element:\n' +
          '  {"name":"_modules","kind":"referenceList","elementField":"_config",' +
          '"references":["boardCfg","scoreCfg"]}\n\n' +
          'The scene specification. Shape: { specVersion, scene: {path, mode, addToBuildSettings}, ' +
          'assets: [{id, type, path, fields}], objects: [{id, name, parent, prefabPath, keepInScene, ' +
          'components: [{type, fields}]}] }. ' +
          'A field is {name, kind, ...} where kind is "reference" | "prefab" | "string" | "int" | ' +
          '"bool" | "float"; a reference or prefab carries {reference: "<id in this spec>"}. ' +
          'Give an object a prefabPath to save it as a prefab asset once its fields are applied, and ' +
          'keepInScene: false when it is only a template the game spawns at runtime — otherwise the ' +
          'first frame has two of it. kind "prefab" resolves to the saved prefab ASSET while kind ' +
          '"reference" resolves to the scene INSTANCE; a field holding something to spawn wants the ' +
          'asset, a field holding what is already on screen wants the instance.',
      },
      specPath: {
        type: 'string',
        description: 'Path to a spec file, as an alternative to passing it inline.',
      },
      projectPath: {
        type: 'string',
        description: 'Unity project root. Defaults to the tool context project path.',
      },
      emitCapture: {
        type: 'boolean',
        description:
          'Include frame-recording code in the generated boot test (default true). It renders the ' +
          'camera into a RenderTexture and only runs when unity_playmode_verify asks for a ' +
          'recording, so it costs nothing otherwise. Turn it off for a project whose Unity build ' +
          'lacks the image-conversion module.',
      },
      emitBootTest: {
        type: 'boolean',
        description:
          'Also write a PlayMode test that loads the assembled scene and asserts the ' +
          'GameBootstrapper initialized (default true). Without it, unity_playmode_verify has ' +
          'nothing to run, and a run of nothing is not a pass.',
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
      // Written before Unity is invoked so the test compiles in the same pass
      // that assembles the scene, rather than needing a second cold start.
      const boot = input['emitBootTest'] === false
        ? { written: false, reason: 'not requested', paths: [] as string[] }
        : emitBootSmokeTest(projectPath, this.sceneName(specJson), input['emitCapture'] !== false);

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
        content: this.render(verdict) + this.renderBootTest(boot),
        // A wrong wiring has to be loud: the run that quietly delivered a
        // library is the failure this tool exists to make impossible.
        isError: !verdict.assembled,
      };
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch { /* scratch */ }
    }
  }

  /**
   * The scene's name as SceneManager.LoadSceneAsync wants it: no directory, no
   * extension. Taken from the spec rather than guessed.
   */
  private sceneName(specJson: string): string {
    try {
      const spec = JSON.parse(specJson) as { scene?: { path?: string } };
      const path = spec.scene?.path ?? '';
      const base = path.replace(/\\/g, '/').split('/').pop() ?? '';
      return base.replace(/\.unity$/i, '') || 'Main';
    } catch {
      return 'Main';
    }
  }

  private renderBootTest(
    boot: { written: boolean; reason?: string; paths: string[]; capture?: boolean },
  ): string {
    if (boot.written) {
      const note = boot.capture === false ? `\n  note: ${boot.reason}` : '';
      return `\n\nBoot test written (run it with unity_playmode_verify):\n  ${boot.paths.join('\n  ')}${note}`;
    }
    return `\n\nNo boot test written: ${boot.reason ?? 'unknown reason'}`;
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
