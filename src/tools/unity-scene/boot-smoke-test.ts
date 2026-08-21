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
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using Strada.Core.Bootstrap;
using Strada.Core.DI.Attributes;

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
        // Ask the framework, do not search the scene. GameBootstrapper assigns
        // Container/Services/World/Systems immediately after it finishes
        // initializing and clears them on shutdown, so a non-null static IS the
        // signal — and a stronger one than finding the object, which can turn up
        // a bootstrapper that never initialized. Strada.Core itself calls
        // FindFirstObjectByType exactly zero times; a check that scans the scene
        // is working outside the framework it is meant to be checking.
        var bootDeadline = Time.realtimeSinceStartup + 10f;
        while (Time.realtimeSinceStartup < bootDeadline)
        {
            if (GameBootstrapper.Services != null) break;
            yield return null;
        }

        Assert.IsNotNull(
            GameBootstrapper.Services,
            "No GameBootstrapper finished initializing within 10 seconds. Either the scene holds "
            + "none, or the one it holds never got through Initialize — its _gameConfig is usually "
            + "unassigned, or a module threw while starting.");

        Assert.IsNotNull(
            GameBootstrapper.Container,
            "The bootstrapper initialized without publishing a container, so no dependency can be "
            + "resolved and every [Inject] field will be null.");

        Assert.IsNotNull(
            GameBootstrapper.Systems,
            "The bootstrapper initialized without publishing a SystemRunner, so no system's "
            + "OnUpdate will ever run.");

        ReportInjectionWiring();

        // Fails the test on any error or exception logged during the frames
        // above, including ones no assertion was watching for.
        LogAssert.NoUnexpectedReceived();

${withCapture ? '        yield return CaptureIfRequested();' : '        // Recording omitted: this project has no screencapture/imageconversion module.'}
    }


    /// <summary>
    /// What the container actually holds, for every system that asks it for something.
    ///
    /// Strada.Core assigns an unresolvable [Inject] dependency as null and says
    /// nothing — a deliberate, permissive design — so the first sign of a missing
    /// registration is a NullReferenceException somewhere else entirely.
    /// Measured 2026-08-21: a run spent ninety minutes on a system whose injected
    /// service was null, unable to ask whether it had ever been registered. The
    /// live answer exists behind strada_container_graph and needs an editor
    /// bridge; a headless play-mode run has none. This reports the same fact from
    /// inside the run, where the question is actually being asked.
    ///
    /// It reports and does not fail. Whether an unresolved dependency is a defect
    /// is the framework's call, and the framework has made it.
    /// </summary>
    private static void ReportInjectionWiring()
    {
        var services = GameBootstrapper.Services;
        var runner = GameBootstrapper.Systems;
        if (services == null || runner == null) return;

        const BindingFlags Members = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        foreach (var system in runner.GetAllSystems())
        {
            if (system == null) continue;
            var type = system.GetType();
            var parts = new List<string>();

            foreach (var field in type.GetFields(Members))
                if (System.Attribute.IsDefined(field, typeof(InjectAttribute)))
                    parts.Add(Describe(services, field.FieldType));

            foreach (var prop in type.GetProperties(Members))
                if (System.Attribute.IsDefined(prop, typeof(InjectAttribute)))
                    parts.Add(Describe(services, prop.PropertyType));

            Debug.Log(parts.Count == 0
                ? $"[StradaWiring] {type.Name}: nothing injected"
                : $"[StradaWiring] {type.Name}: {string.Join(", ", parts)}");
        }
    }

    private static string Describe(Strada.Core.Modules.IServiceLocator services, System.Type dependency)
    {
        return services.IsRegistered(dependency)
            ? $"{dependency.Name}=registered"
            : $"{dependency.Name}=NOT REGISTERED";
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
/**
 * Our asmdef, keeping references somebody else added.
 *
 * This file is regenerated whenever a scene is built, and it is shared: Unity
 * allows one assembly definition per folder, so every play-mode test in
 * Assets/Tests/PlayMode compiles under ours. Measured 2026-08-21: regenerating
 * it replaced ten references with three and broke a win/loss test that had been
 * passing — nineteen compile errors, none of them in the file that was
 * rewritten. The boot test needs Strada.Core and the test runner; the tests
 * beside it need whatever they need, and that is not ours to drop.
 */
function mergedAsmdef(asmdefPath: string, generated: string): string {
  if (!existsSync(asmdefPath)) return generated;
  try {
    const existing = JSON.parse(readFileSync(asmdefPath, 'utf8')) as Record<string, unknown>;
    if (existing['name'] !== BOOT_TEST_ASSEMBLY) return generated;
    const ours = JSON.parse(generated) as Record<string, unknown>;
    const theirs = Array.isArray(existing['references']) ? (existing['references'] as string[]) : [];
    const mine = Array.isArray(ours['references']) ? (ours['references'] as string[]) : [];
    ours['references'] = [...new Set([...mine, ...theirs])];
    return JSON.stringify(ours, null, 2);
  } catch {
    // Unreadable or not JSON: ours is the one we know compiles.
    return generated;
  }
}

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
    writeFileSync(asmdefPath, mergedAsmdef(asmdefPath, asmdef));
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
