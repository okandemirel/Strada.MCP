import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The one test that proves an assembled scene is a game.
 *
 * Assembling a scene and verifying its YAML on disk shows that the references
 * are real links. It does not show that the game runs: a bootstrapper can be
 * wired to a config whose module list throws on the first frame, and the scene
 * file looks identical either way.
 *
 * Nothing else in the pipeline supplies this. Measured on two full runs, every
 * generated test assembly was an empty directory, so a headless PlayMode run
 * executed zero tests and Unity still reported `result="Passed"`. A verifier
 * with nothing to run is not a verifier, so the builder that assembles the scene
 * leaves behind the test that boots it.
 *
 * It asserts only what Strada.Core actually exposes — GameBootstrapper's
 * IsInitialized and its static Services — so it holds for any game built on the
 * framework, without knowing anything about this one.
 */

/** Where the generated check lives, relative to the project root. */
export const BOOT_TEST_DIR = 'Assets/Tests/PlayMode';
/** Where the check may live, in order of preference. */
export const TEST_DIR_CANDIDATES = [BOOT_TEST_DIR, 'Assets/Tests/StradaPlayMode'] as const;

/**
 * The first candidate folder that is free, or already ours.
 *
 * Free means: no .asmdef, or only the one this generator wrote. Returns null
 * when every candidate belongs to someone else, because adding a second .asmdef
 * to a folder is a compile error for everything in it.
 */
export function chooseTestDir(projectPath: string): string | null {
  for (const candidate of TEST_DIR_CANDIDATES) {
    const dir = join(projectPath, candidate);
    if (!existsSync(dir)) return dir;

    let foreign: string[];
    try {
      foreign = readdirSync(dir).filter(
        (f) => f.endsWith('.asmdef') && f !== `${BOOT_TEST_ASSEMBLY}.asmdef`,
      );
    } catch {
      continue;
    }
    if (foreign.length === 0) return dir;
  }
  return null;
}
export const BOOT_TEST_ASSEMBLY = 'Strada.Generated.PlayModeTests';

const CAPTURE_METHOD = `    /// <summary>
    /// Write PNG frames when the harness asked for them.
    ///
    /// Driven by an environment variable rather than a test parameter so the
    /// same generated test serves both runs: verification is the job, and a
    /// recording is something the caller may additionally want.
    ///
    /// Renders the camera into a RenderTexture rather than reading the screen.
    /// Batch mode has no screen buffer to read, and WaitForEndOfFrame does not
    /// reliably fire there either — Camera.Render() draws on demand and depends
    /// on neither.
    ///
    /// Reports and stops when the scene has no camera. A capture of a scene
    /// nothing renders is a stack of identical blank frames, which looks like a
    /// recording and shows nothing.
    /// </summary>
    private static IEnumerator CaptureIfRequested()
    {
        var dir = System.Environment.GetEnvironmentVariable("STRADA_CAPTURE_DIR");
        if (string.IsNullOrEmpty(dir)) yield break;

        if (Camera.allCamerasCount == 0)
        {
            Debug.Log("[StradaCapture] no camera in the scene; nothing would be rendered, so no frames were written.");
            yield break;
        }

        var frames = 120;
        var requestedFrames = System.Environment.GetEnvironmentVariable("STRADA_CAPTURE_FRAMES");
        if (!string.IsNullOrEmpty(requestedFrames) && int.TryParse(requestedFrames, out var parsed) && parsed > 0)
            frames = parsed;

        var camera = Camera.main != null ? Camera.main : Camera.allCameras[0];
        const int width = 1280;
        const int height = 720;

        // A Screen Space - Overlay Canvas is composited straight to the screen
        // and drawn by no camera, so it is absent from a RenderTexture by
        // construction. That is Unity's default for a new Canvas, which makes a
        // menu, card or puzzle game record as an empty skybox and still report
        // a recording. Point those canvases at the capture camera for the
        // duration, and put them back afterwards.
        var overlays = new System.Collections.Generic.List<Canvas>();
        foreach (var canvas in Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None))
        {
            if (canvas.renderMode != RenderMode.ScreenSpaceOverlay) continue;
            overlays.Add(canvas);
        }

        var target = new RenderTexture(width, height, 24);
        var readback = new Texture2D(width, height, TextureFormat.RGB24, false);
        var previousTarget = camera.targetTexture;
        var previousActive = RenderTexture.active;

        System.IO.Directory.CreateDirectory(dir);
        camera.targetTexture = target;
        foreach (var canvas in overlays)
        {
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = camera;
        }
        try
        {
            for (var i = 0; i < frames; i++)
            {
                // A frame of game logic first, so consecutive frames differ.
                yield return null;

                camera.Render();
                RenderTexture.active = target;
                readback.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                readback.Apply();
                System.IO.File.WriteAllBytes(
                    System.IO.Path.Combine(dir, $"frame_{i:D5}.png"),
                    readback.EncodeToPNG());
            }
        }
        finally
        {
            foreach (var canvas in overlays)
            {
                canvas.worldCamera = null;
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            }
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;
            Object.DestroyImmediate(readback);
            target.Release();
            Object.DestroyImmediate(target);
        }

        Debug.Log($"[StradaCapture] wrote {frames} frame(s) to {dir}");
    }
`;

export function buildBootSmokeTest(
  sceneName: string,
  withCapture = true,
): { source: string; asmdef: string } {
  const source = `// Generated by unity_scene_build. Regenerated whenever the scene is reassembled.
//
// Boots the assembled scene in play mode and asserts the framework came up.
// Edit freely: this file is only rewritten when the scene is rebuilt.
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using Strada.Core.Bootstrap;

public class StradaBootSmokeTest
{
    [UnityTest]
    public IEnumerator TheAssembledSceneBootsWithoutError()
    {
        yield return SceneManager.LoadSceneAsync(${JSON.stringify(sceneName)}, LoadSceneMode.Single);

        // Wait for the thing being asserted, not for a number of frames.
        // Measured: a scene with eleven modules initializes well past frame ten,
        // so a fixed count failed a game that boots correctly — and it would
        // have failed later, or on a slower machine, for a scene with fewer.
        var bootDeadline = Time.realtimeSinceStartup + 10f;
        while (Time.realtimeSinceStartup < bootDeadline)
        {
            var probe = Object.FindFirstObjectByType<GameBootstrapper>();
            if (probe != null && probe.IsInitialized) break;
            yield return null;
        }

        var bootstrapper = Object.FindFirstObjectByType<GameBootstrapper>();
        Assert.IsNotNull(
            bootstrapper,
            "The scene loaded but holds no GameBootstrapper, so nothing starts the modules.");

        Assert.IsTrue(
            bootstrapper.IsInitialized,
            "GameBootstrapper is in the scene but never finished initializing "
            + "within 10 seconds. Its _gameConfig is usually unassigned, or a module "
            + "threw while starting.");

        Assert.IsNotNull(
            GameBootstrapper.Services,
            "The bootstrapper initialized without publishing a service locator, "
            + "so nothing can resolve a service at runtime.");

        // Fails the test on any error or exception logged during the frames
        // above, including ones no assertion was watching for.
        LogAssert.NoUnexpectedReceived();

${withCapture ? '        yield return CaptureIfRequested();' : '        // Recording omitted: this project has no screencapture/imageconversion module.'}
    }

${withCapture ? CAPTURE_METHOD : ''}}
`;

  const asmdef = JSON.stringify(
    {
      name: BOOT_TEST_ASSEMBLY,
      rootNamespace: '',
      references: ['Strada.Core', 'UnityEngine.TestRunner', 'UnityEditor.TestRunner'],
      includePlatforms: [],
      excludePlatforms: [],
      allowUnsafeCode: false,
      // Not overrideReferences. Measured: with it on and only nunit listed, the
      // assembly loses the engine modules beyond the core, and
      // `ScreenCapture` — needed to record a run — fails to resolve with
      // CS0103. nunit arrives through the TestRunner reference anyway.
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: false,
      defineConstraints: ['UNITY_INCLUDE_TESTS'],
      versionDefines: [],
      noEngineReferences: false,
    },
    null,
    2,
  );

  return { source, asmdef };
}

/**
 * Is the Test Framework actually installed?
 *
 * Without it, an .asmdef referencing UnityEngine.TestRunner does not merely fail
 * to run — it fails to resolve, and Unity refuses to compile the project at all.
 * Adding a test must never be what breaks the build, so this is checked before
 * anything is written.
 */
export function hasTestFramework(projectPath: string): boolean {
  const manifest = join(projectPath, 'Packages', 'manifest.json');
  try {
    return readFileSync(manifest, 'utf8').includes('com.unity.test-framework');
  } catch {
    return false;
  }
}

export interface BootTestEmission {
  readonly written: boolean;
  readonly reason?: string;
  readonly paths: string[];
  /** Whether the written test can record; false when the modules are absent. */
  readonly capture?: boolean;
}

/** Writes the boot check into the project, or explains why it did not. */
export function emitBootSmokeTest(
  projectPath: string,
  sceneName: string,
  withCapture = true,
): BootTestEmission {
  if (!hasTestFramework(projectPath)) {
    return {
      written: false,
      reason:
        'com.unity.test-framework is not in Packages/manifest.json — a test assembly referencing ' +
        'UnityEngine.TestRunner would stop the whole project compiling, so no boot test was written.',
      paths: [],
    };
  }

  // Assets/Tests/PlayMode is not an arbitrary path — it is the folder Unity's
  // own Test Runner creates for "Create PlayMode Test Assembly Folder", complete
  // with its own .asmdef. Unity permits exactly one per folder, so writing a
  // second one there does not merely fail to add a test: it stops the folder
  // compiling, taking the user's existing tests with it.
  const dir = chooseTestDir(projectPath);
  if (dir === null) {
    return {
      written: false,
      reason:
        `every candidate folder (${TEST_DIR_CANDIDATES.join(', ')}) already holds an assembly ` +
        'definition that is not ours, and Unity allows only one per folder. Move or remove one, ' +
        'or pass emitBootTest: false and write the play-mode check yourself.',
      paths: [],
    };
  }

  const relativeDir = dir.slice(projectPath.length + 1).replace(/\\/g, '/');
  const { source, asmdef } = buildBootSmokeTest(sceneName, withCapture);
  const sourcePath = join(dir, 'StradaBootSmokeTest.cs');
  const asmdefPath = join(dir, `${BOOT_TEST_ASSEMBLY}.asmdef`);

  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(sourcePath, source);
    writeFileSync(asmdefPath, asmdef);
  } catch (error) {
    return { written: false, reason: `could not write the boot test: ${String(error)}`, paths: [] };
  }

  return {
    written: true,
    paths: [`${relativeDir}/StradaBootSmokeTest.cs`, `${relativeDir}/${BOOT_TEST_ASSEMBLY}.asmdef`],
    capture: withCapture,
    reason: withCapture ? undefined : 'recording was not requested',
  };
}
