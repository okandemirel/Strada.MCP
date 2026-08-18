import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildBootSmokeTest,
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
    expect(buildBootSmokeTest('Main').source).toMatch(/for \(var frame = 0; frame < \d+/);
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
