import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from './local-diagnostics.js';
import { parseTestRun, failedTestNames, playmodeVerdict } from './nunit-results.js';

/**
 * Run the game in play mode and report whether it survived, with no Editor open.
 *
 * Every other play-mode tool here — unity_play, unity_get_play_state — is a
 * BridgeTool, and the host removes bridge-requiring tools outright when no
 * Editor is connected. So on the path this product actually runs on, headless
 * and unattended, there was no way to press play at all. A scene could be
 * assembled and verified on disk and still throw on its first frame, and nothing
 * would have noticed before delivery.
 *
 * `-runTests -testPlatform PlayMode` is the supported way in: the test runner
 * enters play mode, runs, and exits with a code that reflects the result. Two
 * rules make that verdict worth having, and both were violated by the fixture
 * this replaces:
 *
 * - Never pass `-quit`. The runner owns EditorApplication.Exit; `-quit` takes
 *   that over and returns 0 whatever the tests did.
 * - Never accept a run of nothing. Zero executed tests satisfies "none failed".
 */
export class PlaymodeVerifyTool implements ITool {
  readonly name = 'unity_playmode_verify';
  readonly description =
    'Run the project\'s PlayMode tests headlessly, with no Unity Editor open, and report a ' +
    'verdict backed by the NUnit results: how many tests actually executed, which failed, and ' +
    'any exception thrown while play mode was running. Use after assembling a scene to check ' +
    'that the game boots and runs, not only that it compiles. A run in which no test executed ' +
    'is reported as a failure, not a pass.';

  readonly inputSchema = {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Unity project root. Defaults to the tool context project path.',
      },
      testFilter: {
        type: 'string',
        description:
          'Optional NUnit filter, e.g. "Game.Modules.Board.Tests" or a full test name, to run a ' +
          'subset instead of every PlayMode test.',
      },
      categories: {
        type: 'string',
        description: 'Optional comma-separated NUnit categories to include.',
      },
    },
    required: [],
  };

  get metadata(): ToolMetadata {
    return {
      category: 'unity-runtime',
      // The reason this tool exists: the Editor is shut.
      requiresBridge: false,
      dangerous: false,
      readOnly: false,
      requiredBridgeMethods: [],
      requiredBridgeCapabilities: [],
      // A cold Library, a domain reload and a play-mode entry per test assembly.
      timeoutMs: 600_000,
    };
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const projectPath = String(input['projectPath'] ?? context.projectPath ?? '');
    if (!projectPath) {
      return { content: 'Error: no projectPath given and none in context.', isError: true };
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

    // Scratch, never under Assets/: Unity imports anything written there.
    const scratch = mkdtempSync(join(tmpdir(), 'strada-playmode-'));
    const resultsPath = join(scratch, 'results.xml');
    const logPath = join(scratch, 'playmode.log');

    try {
      const args = [
        '-batchmode',
        '-nographics',
        // No -quit. See the class comment: it would make the exit code a lie.
        '-projectPath', projectPath,
        '-runTests',
        '-testPlatform', 'PlayMode',
        '-testResults', resultsPath,
        '-logFile', logPath,
      ];
      const filter = input['testFilter'];
      if (typeof filter === 'string' && filter.trim() !== '') {
        args.push('-testFilter', filter.trim());
      }
      const categories = input['categories'];
      if (typeof categories === 'string' && categories.trim() !== '') {
        args.push('-testCategory', categories.trim());
      }

      const exitCode = await this.runUnity(editor.binary, args, 580_000);
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

      if (!existsSync(resultsPath)) {
        return { content: this.renderNoResults(exitCode, log), isError: true };
      }

      const xml = readFileSync(resultsPath, 'utf8');
      const outcome = parseTestRun(xml);
      if (outcome === null) {
        return {
          content:
            `PlayMode run wrote a results file with no <test-run> element (Unity exit ${exitCode}). ` +
            `First lines:\n${xml.slice(0, 400)}`,
          isError: true,
        };
      }

      const exceptions = this.playModeExceptions(log);
      const verdict = playmodeVerdict(outcome, exceptions);

      return {
        content: this.render(outcome, exceptions, failedTestNames(xml), exitCode, verdict.reason),
        isError: !verdict.passed,
      };
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch { /* scratch */ }
    }
  }

  /**
   * Exceptions Unity logged while play mode was running.
   *
   * A test can pass while the game throws: an exception on a MonoBehaviour that
   * no assertion observes is reported to the console and nowhere else. The log
   * is the only place that shows up headlessly.
   */
  private playModeExceptions(log: string): string[] {
    const seen = new Set<string>();
    for (const line of log.split('\n')) {
      if (!/\b\w*Exception\b/.test(line)) continue;
      // The runner reports expected exceptions from LogAssert cases too; those
      // carry the test-runner prefix and are not the game misbehaving.
      if (line.includes('UnityEngine.TestTools')) continue;
      if (line.includes('Expected log did not appear')) continue;
      const trimmed = line.trim();
      if (trimmed !== '') seen.add(trimmed);
      if (seen.size >= 10) break;
    }
    return [...seen];
  }

  private renderNoResults(exitCode: number, log: string): string {
    const compileErrors = log
      .split('\n')
      .filter((l) => l.includes('error CS'))
      .slice(0, 10);
    if (compileErrors.length > 0) {
      return (
        `PlayMode tests never ran (Unity exit ${exitCode}): the project does not compile, so ` +
        `the test runner was never reached.\n${compileErrors.join('\n')}`
      );
    }
    return (
      `PlayMode tests never ran and no results file was written (Unity exit ${exitCode}). ` +
      `This is usually no PlayMode test assembly in the project, or a Unity that failed to ` +
      `open it. Last lines of the log:\n${log.split('\n').slice(-20).join('\n')}`
    );
  }

  private render(
    outcome: { result: string; total: number; passed: number; failed: number; skipped: number },
    exceptions: string[],
    failures: string[],
    exitCode: number,
    reason: string,
  ): string {
    const lines: string[] = [];

    if (reason === 'nothing-ran') {
      lines.push(
        'PlayMode verification FAILED: no test executed. An empty run is not a pass — ' +
        'the project has no PlayMode tests, or the filter matched nothing.',
      );
    } else if (reason === 'tests-failed') {
      lines.push(`PlayMode verification FAILED: ${outcome.failed} of ${outcome.total} tests failed.`);
    } else if (reason === 'threw') {
      lines.push(
        `PlayMode tests all passed, but the game threw while running. ` +
        'A passing assertion does not mean nothing broke.',
      );
    } else {
      lines.push(`PlayMode verification passed: ${outcome.passed} of ${outcome.total} tests ran clean.`);
    }

    lines.push(
      `total=${outcome.total} passed=${outcome.passed} failed=${outcome.failed} ` +
      `skipped=${outcome.skipped} runResult=${outcome.result} unityExit=${exitCode}`,
    );

    if (failures.length > 0) {
      lines.push('', 'Failed:');
      for (const name of failures) lines.push(`  ${name}`);
    }
    if (exceptions.length > 0) {
      lines.push('', 'Exceptions logged during play:');
      for (const e of exceptions) lines.push(`  ${e}`);
    }
    return lines.join('\n');
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
}
