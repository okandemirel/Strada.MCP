import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ITool, ToolContext, ToolResult, ToolMetadata } from '../tool.interface.js';
import { findUnityEditor } from './local-diagnostics.js';
import { parseTestRun, failedTests, playmodeVerdict } from './nunit-results.js';
import type { FailedTest } from './nunit-results.js';

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

/**
 * The Unity command line for a play-mode run.
 *
 * Pure and exported so the two rules that make its verdict trustworthy can be
 * tested without an Editor:
 *
 * - `-quit` is never present. The test runner owns EditorApplication.Exit and
 *   returns a code that reflects the results; -quit overrides it with 0.
 * - `-nographics` is dropped when recording, and only then. It is what makes a
 *   headless run cheap, and also what leaves no graphics device to render into.
 */
export function buildPlaymodeArgs(options: {
  projectPath: string;
  resultsPath: string;
  logPath: string;
  capture?: boolean;
  testFilter?: string;
  categories?: string;
}): string[] {
  const args = [
    '-batchmode',
    ...(options.capture === true ? [] : ['-nographics']),
    '-projectPath', options.projectPath,
    '-runTests',
    '-testPlatform', 'PlayMode',
    '-testResults', options.resultsPath,
    '-logFile', options.logPath,
  ];
  const filter = options.testFilter?.trim();
  if (filter) args.push('-testFilter', filter);
  const categories = options.categories?.trim();
  if (categories) args.push('-testCategory', categories);
  return args;
}

export class PlaymodeVerifyTool implements ITool {
  readonly name = 'unity_playmode_verify';
  readonly description =
    'Run the project\'s PlayMode tests headlessly, with no Unity Editor open, and report a ' +
    'verdict backed by the NUnit results: how many tests actually executed, which failed, and ' +
    'any exception thrown while play mode was running. Use after assembling a scene to check ' +
    'that the game boots and runs, not only that it compiles. A run in which no test executed ' +
    'is reported as a failure, not a pass. It locates the Unity editor matching the project ' +
    'itself — you do not need to search the filesystem for one.';

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
      capture: {
        type: 'boolean',
        description:
          'Record the run. Renders with a real graphics device instead of -nographics, writes PNG ' +
          'frames, and encodes them to an mp4 when ffmpeg is installed. Slower, and it needs a ' +
          'camera in the scene — a recording of a scene nothing renders is a stack of blank frames.',
      },
      captureDir: {
        type: 'string',
        description:
          'Where to leave the frames and video. Defaults to <projectPath>/Recordings, which sits ' +
          'beside Assets/ rather than inside it — Unity imports anything written under Assets/, ' +
          'and a few hundred PNGs would become a few hundred textures in the project.',
      },
      captureFrames: {
        type: 'number',
        description: 'How many frames to record (default 120, about two seconds at 60 fps).',
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
      // Capture needs a real graphics device, which is exactly what -nographics
      // withholds. Verified on this path: batch mode without it initializes a
      // Metal device and the tests still run headlessly.
      const capture = input['capture'] === true;
      const captureDir = capture
        ? String(input['captureDir'] ?? join(projectPath, 'Recordings'))
        : null;
      if (captureDir !== null) {
        try {
          mkdirSync(captureDir, { recursive: true });
          // Frames left by an earlier run would otherwise be counted, encoded
          // and reported as this one's recording — including for a run that
          // captured nothing because it failed before play even started.
          for (const stale of readdirSync(captureDir)) {
            if (/^frame_\d+\.png$/.test(stale)) rmSync(join(captureDir, stale), { force: true });
          }
        } catch { /* reported below as no frames */ }
      }

      const args = buildPlaymodeArgs({
        projectPath,
        resultsPath,
        logPath,
        capture,
        testFilter: typeof input['testFilter'] === 'string' ? input['testFilter'] : undefined,
        categories: typeof input['categories'] === 'string' ? input['categories'] : undefined,
      });

      const captureEnv: Record<string, string> = {};
      if (captureDir !== null) {
        captureEnv['STRADA_CAPTURE_DIR'] = captureDir;
        const frames = input['captureFrames'];
        if (typeof frames === 'number' && frames > 0) {
          captureEnv['STRADA_CAPTURE_FRAMES'] = String(Math.floor(frames));
        }
      }

      const exitCode = await this.runUnity(editor.binary, args, 580_000, captureEnv);
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
        content:
          this.render(outcome, exceptions, failedTests(xml), exitCode, verdict.reason, log) +
          (captureDir === null ? '' : this.renderCapture(captureDir, log)),
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
  /**
   * What the recording produced, said plainly.
   *
   * Encodes to mp4 only when ffmpeg is on the machine. Frames alone are still a
   * usable artifact, and claiming a video that was never made is worse than
   * saying the encoder is missing.
   */
  private renderCapture(captureDir: string, log: string): string {
    let frames: string[] = [];
    try {
      frames = readdirSync(captureDir).filter((f) => f.endsWith('.png')).sort();
    } catch { /* reported as none */ }

    if (frames.length === 0) {
      // The test says why in the log when it declined; pass that through rather
      // than guessing at the reason here.
      const reason = /\[StradaCapture\][^\n]*/.exec(log)?.[0];
      return `\n\nNo frames were captured. ${reason ?? 'The boot test may predate capture support; reassemble the scene to regenerate it.'}`;
    }

    const lines = [`\n\nRecorded ${frames.length} frame(s) in ${captureDir}`];
    const video = join(captureDir, 'playmode.mp4');
    const ffmpeg = spawnSync('ffmpeg', [
      '-y', '-framerate', '30',
      '-i', join(captureDir, 'frame_%05d.png'),
      '-pix_fmt', 'yuv420p', video,
      // Bounded: this blocks the tool, and an encode that never returns would
      // hang the whole call for a nicety on top of a verification that already
      // succeeded.
    ], { stdio: 'ignore', timeout: 120_000 });

    if (ffmpeg.error || ffmpeg.status !== 0) {
      lines.push(
        'ffmpeg is not installed or failed, so the frames were left unencoded. ' +
        `Encode them with: ffmpeg -framerate 30 -i ${join(captureDir, 'frame_%05d.png')} -pix_fmt yuv420p ${video}`,
      );
    } else {
      lines.push(`Video: ${video}`);
    }
    return lines.join('\n');
  }

  private playModeExceptions(log: string): string[] {
    const seen = new Set<string>();
    for (const line of log.split('\n')) {
      if (!/\b\w*Exception\b/.test(line)) continue;
      // The runner reports expected exceptions from LogAssert cases too; those
      // carry the test-runner prefix and are not the game misbehaving.
      if (line.includes('UnityEngine.TestTools')) continue;
      if (line.includes('Expected log did not appear')) continue;
      // A test that deliberately expects an exception logs it, and LogAssert
      // then reports the match. Counting those failed a green run for doing
      // exactly what it was written to do.
      if (line.includes('LogAssert.Expect') || line.includes('Expected log message')) continue;
      const trimmed = line.trim();
      if (trimmed !== '') seen.add(trimmed);
      if (seen.size >= 10) break;
    }
    return [...seen];
  }

  /** Compile errors visible in a Unity log, deduplicated on the message. */
  private compileErrorsIn(log: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of log.split('\n')) {
      if (!line.includes('error CS')) continue;
      const key = line.replace(/^.*?\((\d+),(\d+)\):\s*/u, '').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line.trim());
      if (out.length >= 10) break;
    }
    return out;
  }

  private renderNoResults(exitCode: number, log: string): string {
    const compileErrors = this.compileErrorsIn(log);
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
    failures: readonly FailedTest[],
    exitCode: number,
    reason: string,
    log: string,
  ): string {
    const lines: string[] = [];

    if (reason === 'nothing-ran') {
      // A results file with zero tests looks the same whether the project has
      // no tests or simply failed to build them. Measured: an agent called this
      // thirteen times against a project that did not compile and was told each
      // time to look for a missing test assembly.
      const compileErrors = this.compileErrorsIn(log);
      if (compileErrors.length > 0) {
        lines.push(
          'PlayMode verification FAILED: no test executed, because the project does not ' +
          'compile — the test assembly was never built. Fix these first:',
          ...compileErrors.map((e) => `  ${e}`),
        );
      } else {
        lines.push(
          'PlayMode verification FAILED: no test executed. An empty run is not a pass — ' +
          'the project has no PlayMode tests, or the filter matched nothing.',
        );
      }
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
      for (const failure of failures) {
        lines.push(`  ${failure.name}`);
        // The name says which test; this says what it found.
        if (failure.message) lines.push(`      ${failure.message}`);
      }
    }
    if (exceptions.length > 0) {
      lines.push('', 'Exceptions logged during play:');
      for (const e of exceptions) lines.push(`  ${e}`);
    }
    return lines.join('\n');
  }

  private runUnity(
    binary: string,
    args: string[],
    timeoutMs: number,
    env: Record<string, string> = {},
  ): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(binary, args, {
        stdio: 'ignore',
        env: { ...process.env, ...env },
      });
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
