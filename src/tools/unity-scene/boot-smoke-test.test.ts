import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildBootSmokeTest,
  chooseTestDir,
  TEST_DIR_CANDIDATES,
  emitBootSmokeTest,
  hasTestFramework,
  BOOT_TEST_DIR,
} from './boot-smoke-test.js';

function project(manifest: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'boot-test-'));
  if (manifest !== null) {
    mkdirSync(join(root, 'Packages'), { recursive: true });
    writeFileSync(join(root, 'Packages', 'manifest.json'), manifest);
  }
  return root;
}

const WITH_FRAMEWORK = JSON.stringify({
  dependencies: { 'com.unity.test-framework': '1.4.5', 'com.strada.core': '1.0.0' },
});

describe('the generated boot check', () => {
  it('loads the scene it was generated for', () => {
    const { source } = buildBootSmokeTest('Main');

    expect(source).toContain('LoadSceneAsync("Main"');
  });

  it('asserts what Strada.Core actually exposes', () => {
    // If these drift from the framework the test stops compiling, which is the
    // point: it is pinned to the real contract, not to a guess about it.
    const { source } = buildBootSmokeTest('Main');

    expect(source).toContain('bootstrapper.IsInitialized');
    expect(source).toContain('GameBootstrapper.Services');
    expect(source).toContain('using Strada.Core.Bootstrap;');
  });

  it('waits past the first frame before asserting', () => {
    // Initialization spans frames; asserting immediately reads a half-built
    // world and fails a game that was fine.
    const source = buildBootSmokeTest('Main').source;

    expect(source).toContain('yield return null;');
    expect(source).toMatch(/while \(Time\.realtimeSinceStartup < bootDeadline\)/);
  });

  it('fails on an exception no assertion was watching', () => {
    expect(buildBootSmokeTest('Main').source).toContain('LogAssert.NoUnexpectedReceived()');
  });

  it('escapes a scene name rather than splicing it in raw', () => {
    const { source } = buildBootSmokeTest('My "Odd" Scene');

    expect(source).toContain('LoadSceneAsync("My \\"Odd\\" Scene"');
  });

  it('declares a test the runner will collect', () => {
    // The failure this whole layer exists to prevent: an assembly with no test
    // in it runs nothing and reports success.
    expect(buildBootSmokeTest('Main').source).toContain('[UnityTest]');
  });
});

describe('writing it into a project', () => {
  it('writes the source and its assembly', () => {
    const root = project(WITH_FRAMEWORK);

    const emission = emitBootSmokeTest(root, 'Main');

    expect(emission.written).toBe(true);
    expect(existsSync(join(root, BOOT_TEST_DIR, 'StradaBootSmokeTest.cs'))).toBe(true);
    const asmdef = JSON.parse(
      readFileSync(join(root, BOOT_TEST_DIR, 'Strada.Generated.PlayModeTests.asmdef'), 'utf8'),
    );
    expect(asmdef.references).toContain('UnityEngine.TestRunner');
    // Empty includePlatforms is what makes it eligible for PlayMode; ["Editor"]
    // would quietly make it an EditMode assembly that play mode never runs.
    expect(asmdef.includePlatforms).toEqual([]);
  });

  it('refuses when the Test Framework is absent', () => {
    // Writing it anyway would not merely fail to run: an unresolvable
    // UnityEngine.TestRunner reference stops the whole project compiling.
    const root = project(JSON.stringify({ dependencies: { 'com.strada.core': '1.0.0' } }));

    const emission = emitBootSmokeTest(root, 'Main');

    expect(emission.written).toBe(false);
    expect(emission.reason).toContain('com.unity.test-framework');
    expect(existsSync(join(root, BOOT_TEST_DIR))).toBe(false);
  });

  it('refuses when there is no manifest to read', () => {
    expect(hasTestFramework(project(null))).toBe(false);
    expect(emitBootSmokeTest(project(null), 'Main').written).toBe(false);
  });

  it('overwrites a stale check when the scene is reassembled', () => {
    const root = project(WITH_FRAMEWORK);
    emitBootSmokeTest(root, 'Main');

    emitBootSmokeTest(root, 'Level2');

    const source = readFileSync(join(root, BOOT_TEST_DIR, 'StradaBootSmokeTest.cs'), 'utf8');
    expect(source).toContain('LoadSceneAsync("Level2"');
    expect(source).not.toContain('LoadSceneAsync("Main"');
  });
});

describe('the recording it can do', () => {
  it('can be left out entirely, and the verification still stands', () => {
    // The recording is an extra on top of a check the caller still needs, so
    // omitting it must not touch what the test actually verifies.
    const { source } = buildBootSmokeTest('Main', false);

    expect(source).not.toContain('camera.Render()');
    expect(source).toContain('Recording omitted');
    expect(source).toContain('[UnityTest]');
    expect(source).toContain('bootstrapper.IsInitialized');
  });

  it('captures nothing unless the harness asks', () => {
    // The same generated test serves both runs: verifying is the job, a
    // recording is something the caller may additionally want.
    const { source } = buildBootSmokeTest('Main');

    expect(source).toContain('STRADA_CAPTURE_DIR');
    expect(source).toContain('if (string.IsNullOrEmpty(dir)) yield break;');
  });

  it('refuses to record a scene with no camera', () => {
    // A capture of a scene nothing renders is a stack of identical blank
    // frames, which looks like a recording and shows nothing.
    const { source } = buildBootSmokeTest('Main');

    expect(source).toContain('Camera.allCamerasCount == 0');
    expect(source).toContain('nothing would be rendered');
  });

  it('renders the camera instead of reading the screen', () => {
    // Batch mode has no screen buffer to read, and WaitForEndOfFrame does not
    // reliably fire there either. Camera.Render() into a RenderTexture depends
    // on neither.
    const { source } = buildBootSmokeTest('Main');

    expect(source).toContain('camera.Render()');
    expect(source).toContain('new RenderTexture(');
    // The call, not the word: the comment above it explains why it is absent.
    expect(source).not.toContain('yield return new WaitForEndOfFrame');
    expect(source).not.toContain('ScreenCapture.Capture');
  });

  it('puts the camera back and frees the textures', () => {
    // The capture runs inside a verification the caller still needs; leaving a
    // camera pointed at a released RenderTexture would break what follows.
    const { source } = buildBootSmokeTest('Main');

    expect(source).toContain('camera.targetTexture = previousTarget;');
    expect(source).toContain('target.Release();');
  });

  it('numbers frames so an encoder can find the sequence', () => {
    expect(buildBootSmokeTest('Main').source).toContain('frame_{i:D5}.png');
  });
});

describe("where the check is allowed to live", () => {
  const withAsmdef = (name: string): string => {
    const root = project(WITH_FRAMEWORK);
    const dir = join(root, BOOT_TEST_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), '{"name":"Whatever"}');
    return root;
  };

  it("uses the standard folder when it is free", () => {
    const root = project(WITH_FRAMEWORK);

    expect(chooseTestDir(root)).toBe(join(root, BOOT_TEST_DIR));
  });

  it("steps aside when Unity's Test Runner already owns that folder", () => {
    // Assets/Tests/PlayMode is exactly what "Create PlayMode Test Assembly
    // Folder" makes, complete with its own .asmdef. Unity allows one per
    // folder; a second is a compile error for everything in it, including the
    // user's own tests.
    const root = withAsmdef("Tests.asmdef");

    const chosen = chooseTestDir(root);

    expect(chosen).not.toBeNull();
    expect(chosen).not.toContain(BOOT_TEST_DIR);
    expect(chosen).toContain(TEST_DIR_CANDIDATES[1]);
  });

  it("reuses the folder when the .asmdef there is its own", () => {
    const root = withAsmdef("Strada.Generated.PlayModeTests.asmdef");

    expect(chooseTestDir(root)).toContain(BOOT_TEST_DIR);
  });

  it("refuses rather than breaking a folder when every candidate is taken", () => {
    const root = project(WITH_FRAMEWORK);
    for (const candidate of TEST_DIR_CANDIDATES) {
      const dir = join(root, candidate);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "Someone.asmdef"), "{}");
    }

    expect(chooseTestDir(root)).toBeNull();

    const emission = emitBootSmokeTest(root, "Main");
    expect(emission.written).toBe(false);
    expect(emission.reason).toContain("only one per folder");
  });
});

describe("recording a game whose screen is UI", () => {
  it("brings Screen Space - Overlay canvases into the capture", () => {
    // An overlay Canvas is composited straight to the screen and drawn by no
    // camera, so it is absent from a RenderTexture by construction — and that
    // is Unity's default for a new Canvas. A menu or card game recorded as an
    // empty skybox and still reported a recording.
    const { source } = buildBootSmokeTest("Main");

    expect(source).toContain("RenderMode.ScreenSpaceOverlay");
    expect(source).toContain("RenderMode.ScreenSpaceCamera");
    expect(source).toContain("canvas.worldCamera = camera;");
  });

  it("puts them back, because the capture runs inside a verification", () => {
    const { source } = buildBootSmokeTest("Main");
    const finallyBlock = source.slice(source.indexOf("finally"));

    expect(finallyBlock).toContain("RenderMode.ScreenSpaceOverlay");
    expect(finallyBlock).toContain("canvas.worldCamera = null;");
  });
});

describe('how long the boot test waits', () => {
  // Measured 2026-08-20 on a scene assembled from a real GDD run: eleven
  // modules, every reference correct on disk, and the generated test failed —
  // initialization had simply not finished by frame ten. Re-run with a wait on
  // the condition, the same scene passed. A false red, and it would have been
  // read as "the game does not boot".
  const { source } = buildBootSmokeTest('Main');

  it('waits for initialization rather than for a frame count', () => {
    expect(source).not.toContain('frame < 10');
    expect(source).toContain('IsInitialized');
    expect(source).toContain('realtimeSinceStartup');
  });

  it('gives up eventually instead of hanging the run', () => {
    expect(source).toContain('bootDeadline');
    expect(source).toContain('+ 10f');
  });

  it('says how long it waited when it gives up', () => {
    expect(source).toContain('within 10 seconds');
  });
});
