#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Strada.Mcp.Editor.Events;
using Strada.Mcp.Editor.Extensibility;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Strada.Mcp.Editor.Commands
{
    public static class DiagnosticsCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("editor.compileStatus", CompileStatusCommand);
            dispatcher.RegisterHandler("editor.recompile", RecompileCommand);
            dispatcher.RegisterHandler("editor.assemblyReloadStatus", AssemblyReloadStatusCommand);
            dispatcher.RegisterHandler("editor.testList", TestListCommand);
            dispatcher.RegisterHandler("editor.testRun", TestRunCommand);
            dispatcher.RegisterHandler("editor.testResults", TestResultsCommand);
            dispatcher.RegisterHandler("editor.screenshotCapture", ScreenshotCaptureCommand);
            dispatcher.RegisterHandler("editor.screenshotCompare", ScreenshotCompareCommand);
            dispatcher.RegisterHandler("editor.visualSnapshot", VisualSnapshotCommand);
            dispatcher.RegisterHandler("editor.projectToolManifest", ProjectToolManifestCommand);
            dispatcher.RegisterHandler("editor.projectToolInvoke", ProjectToolInvokeCommand);
        }

        private static object CompileStatusCommand(Dictionary<string, object> @params)
        {
            return EditorRuntimeState.GetCompileStatus();
        }

        private static object RecompileCommand(Dictionary<string, object> @params)
        {
            string reason = GameObjectCommands.GetString(@params, "reason", "manual");

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            CompilationPipeline.RequestScriptCompilation();

            return new Dictionary<string, object>
            {
                { "requested", true },
                { "reason", reason },
                { "status", EditorRuntimeState.GetCompileStatus() }
            };
        }

        private static object AssemblyReloadStatusCommand(Dictionary<string, object> @params)
        {
            return EditorRuntimeState.GetAssemblyReloadStatus();
        }

        private static object TestListCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.TestFramework.TestFrameworkCommands, StradaMcp.Editor.TestFramework",
                "ListTests",
                @params,
                "unity-test-framework");
        }

        private static object TestRunCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.TestFramework.TestFrameworkCommands, StradaMcp.Editor.TestFramework",
                "RunTests",
                @params,
                "unity-test-framework");
        }

        private static object TestResultsCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.TestFramework.TestFrameworkCommands, StradaMcp.Editor.TestFramework",
                "GetResults",
                @params,
                "unity-test-framework");
        }

        private static object ScreenshotCaptureCommand(Dictionary<string, object> @params)
        {
            return CaptureVisual(@params, includeHierarchy: false);
        }

        private static object VisualSnapshotCommand(Dictionary<string, object> @params)
        {
            return CaptureVisual(@params, includeHierarchy: GameObjectCommands.GetBool(@params, "includeHierarchy", true));
        }

        private static object ProjectToolManifestCommand(Dictionary<string, object> @params)
        {
            return ProjectExtensionRegistry.BuildManifest();
        }

        private static object ProjectToolInvokeCommand(Dictionary<string, object> @params)
        {
            return ProjectExtensionRegistry.InvokeTool(@params);
        }

        private static object ScreenshotCompareCommand(Dictionary<string, object> @params)
        {
            string baselinePath = GameObjectCommands.GetString(@params, "baselinePath");
            string candidatePath = GameObjectCommands.GetString(@params, "candidatePath");
            if (string.IsNullOrEmpty(baselinePath) || string.IsNullOrEmpty(candidatePath))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "baselinePath and candidatePath are required");
            }

            if (!File.Exists(baselinePath))
            {
                throw new JsonRpcException(ErrorCode.AssetNotFound, $"Baseline screenshot not found: {baselinePath}");
            }

            if (!File.Exists(candidatePath))
            {
                throw new JsonRpcException(ErrorCode.AssetNotFound, $"Candidate screenshot not found: {candidatePath}");
            }

            int pixelThreshold = GameObjectCommands.GetInt(@params, "pixelThreshold", 0);
            float tolerancePercent = GameObjectCommands.GetFloat(@params, "tolerancePercent", 0f);

            var baseline = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            var candidate = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            baseline.LoadImage(File.ReadAllBytes(baselinePath));
            candidate.LoadImage(File.ReadAllBytes(candidatePath));

            if (baseline.width != candidate.width || baseline.height != candidate.height)
            {
                return new Dictionary<string, object>
                {
                    { "identical", false },
                    { "reason", "dimension-mismatch" },
                    { "baseline", new Dictionary<string, object> { { "width", baseline.width }, { "height", baseline.height } } },
                    { "candidate", new Dictionary<string, object> { { "width", candidate.width }, { "height", candidate.height } } }
                };
            }

            var baselinePixels = baseline.GetPixels32();
            var candidatePixels = candidate.GetPixels32();
            int differencePixels = 0;

            for (int i = 0; i < baselinePixels.Length; i++)
            {
                if (ChannelDifference(baselinePixels[i], candidatePixels[i]) > pixelThreshold)
                {
                    differencePixels++;
                }
            }

            float differencePercent = baselinePixels.Length == 0
                ? 0f
                : (differencePixels * 100f) / baselinePixels.Length;

            UnityEngine.Object.DestroyImmediate(baseline);
            UnityEngine.Object.DestroyImmediate(candidate);

            return new Dictionary<string, object>
            {
                { "identical", differencePixels == 0 || differencePercent <= tolerancePercent },
                { "differencePixels", differencePixels },
                { "differencePercent", differencePercent },
                { "pixelThreshold", pixelThreshold },
                { "tolerancePercent", tolerancePercent },
                { "width", baselinePixels.Length == 0 ? 0 : baseline.width },
                { "height", baselinePixels.Length == 0 ? 0 : baseline.height }
            };
        }

        private static object CaptureVisual(Dictionary<string, object> @params, bool includeHierarchy)
        {
            string outputPath = GameObjectCommands.GetString(@params, "outputPath");
            if (string.IsNullOrEmpty(outputPath))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "outputPath is required");
            }

            int width = GameObjectCommands.GetInt(@params, "width", 1280);
            int height = GameObjectCommands.GetInt(@params, "height", 720);
            string source = GameObjectCommands.GetString(@params, "source", "scene");
            string cameraName = GameObjectCommands.GetString(@params, "cameraName");
            bool transparent = GameObjectCommands.GetBool(@params, "transparent", false);

            Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
            var captureCamera = ResolveCaptureCamera(source, cameraName, width, height, out bool createdCamera);
            if (captureCamera == null)
            {
                throw new JsonRpcException(ErrorCode.UnityNotReady, "No camera was available to capture a visual snapshot.");
            }

            var previousTarget = captureCamera.targetTexture;
            var previousClearFlags = captureCamera.clearFlags;
            var previousBackground = captureCamera.backgroundColor;
            var renderTexture = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);

            try
            {
                captureCamera.targetTexture = renderTexture;
                if (transparent)
                {
                    captureCamera.clearFlags = CameraClearFlags.SolidColor;
                    captureCamera.backgroundColor = new Color(0f, 0f, 0f, 0f);
                }

                captureCamera.Render();
                RenderTexture.active = renderTexture;
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                texture.Apply();
                File.WriteAllBytes(outputPath, texture.EncodeToPNG());

                var payload = new Dictionary<string, object>
                {
                    { "captured", true },
                    { "outputPath", outputPath },
                    { "source", source },
                    { "camera", captureCamera.name },
                    { "width", width },
                    { "height", height },
                    { "bytes", new FileInfo(outputPath).Length },
                    { "scene", SceneManager.GetActiveScene().name },
                    { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                };

                if (includeHierarchy)
                {
                    payload["selection"] = Selection.objects.Select(obj => obj != null ? (object)obj.name : null).Where(name => name != null).ToList();
                    payload["roots"] = SceneManager.GetActiveScene().GetRootGameObjects()
                        .Select(go => (object)new Dictionary<string, object>
                        {
                            { "name", go.name },
                            { "active", go.activeSelf }
                        })
                        .ToList();
                }

                return payload;
            }
            finally
            {
                captureCamera.targetTexture = previousTarget;
                captureCamera.clearFlags = previousClearFlags;
                captureCamera.backgroundColor = previousBackground;
                RenderTexture.active = null;
                UnityEngine.Object.DestroyImmediate(renderTexture);
                UnityEngine.Object.DestroyImmediate(texture);

                if (createdCamera && captureCamera != null)
                {
                    UnityEngine.Object.DestroyImmediate(captureCamera.gameObject);
                }
            }
        }

        private static Camera ResolveCaptureCamera(string source, string cameraName, int width, int height, out bool createdCamera)
        {
            createdCamera = false;

            if (source == "scene" && SceneView.lastActiveSceneView != null && SceneView.lastActiveSceneView.camera != null)
            {
                return SceneView.lastActiveSceneView.camera;
            }

            if (!string.IsNullOrEmpty(cameraName))
            {
                var namedCamera = Camera.allCameras.FirstOrDefault(cam => cam != null && cam.name == cameraName);
                if (namedCamera != null)
                {
                    return namedCamera;
                }
            }

            var candidate = Camera.main ?? Camera.allCameras.FirstOrDefault(cam => cam != null);
            if (candidate != null)
            {
                return candidate;
            }

            var temporary = new GameObject("StradaMcpTemporaryCaptureCamera");
            var camera = temporary.AddComponent<Camera>();
            camera.transform.position = new Vector3(0f, 0f, -10f);
            camera.transform.LookAt(Vector3.zero);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = Color.black;
            camera.orthographic = true;
            camera.orthographicSize = Math.Max(width, height) / 200f;
            createdCamera = true;
            return camera;
        }

        private static int ChannelDifference(Color32 a, Color32 b)
        {
            return Math.Max(
                Math.Max(Math.Abs(a.r - b.r), Math.Abs(a.g - b.g)),
                Math.Max(Math.Abs(a.b - b.b), Math.Abs(a.a - b.a)));
        }
    }
}
#endif
