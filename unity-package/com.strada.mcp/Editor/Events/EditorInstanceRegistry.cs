#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace Strada.Mcp.Editor.Events
{
    [InitializeOnLoad]
    public static class EditorInstanceRegistry
    {
        private const string RegistryFolderName = "strada-mcp-editors";
        private const double HeartbeatIntervalSeconds = 3.0d;

        private static readonly string StartedAtUtc = DateTime.UtcNow.ToString("o");
        private static string _manifestPath;
        private static int _port;
        private static double _nextHeartbeatAt;

        static EditorInstanceRegistry()
        {
            EditorApplication.update += OnEditorUpdate;
            EditorApplication.playModeStateChanged += _ => WriteManifestIfRunning();
            CompilationPipeline.compilationStarted += _ => WriteManifestIfRunning();
            CompilationPipeline.compilationFinished += _ => WriteManifestIfRunning();
            AssemblyReloadEvents.beforeAssemblyReload += Stop;
        }

        internal static string RegistryDirectoryPath => Path.Combine(Path.GetTempPath(), RegistryFolderName);

        public static string CurrentManifestPath => _manifestPath;

        internal static void Start(int port)
        {
            _port = port;
            Directory.CreateDirectory(RegistryDirectoryPath);
            _manifestPath = Path.Combine(RegistryDirectoryPath, BuildManifestFileName());
            _nextHeartbeatAt = 0d;
            WriteManifest();
        }

        internal static void Stop()
        {
            _port = 0;
            _nextHeartbeatAt = 0d;

            if (string.IsNullOrEmpty(_manifestPath))
            {
                return;
            }

            try
            {
                if (File.Exists(_manifestPath))
                {
                    File.Delete(_manifestPath);
                }
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogWarning($"[Strada.MCP] Failed to remove editor registry manifest: {ex.Message}");
            }
            finally
            {
                _manifestPath = null;
            }
        }

        internal static Dictionary<string, object> GetCurrentRecord()
        {
            return new Dictionary<string, object>
            {
                { "instanceId", BuildInstanceId() },
                { "projectPath", GetProjectPath() },
                { "projectName", GetProjectName() },
                { "port", _port },
                { "pid", GetProcessId() },
                { "unityVersion", Application.unityVersion },
                { "productName", Application.productName },
                { "isBatchMode", Application.isBatchMode },
                { "isPlaying", EditorApplication.isPlaying },
                { "isCompiling", EditorApplication.isCompiling },
                { "isUpdating", EditorApplication.isUpdating },
                { "bridgeRunning", McpBridge.IsRunning },
                { "startedAtUtc", StartedAtUtc },
                { "lastHeartbeatUtc", DateTime.UtcNow.ToString("o") }
            };
        }

        private static void OnEditorUpdate()
        {
            if (_port <= 0 || !McpBridge.IsRunning)
            {
                return;
            }

            if (EditorApplication.timeSinceStartup < _nextHeartbeatAt)
            {
                return;
            }

            WriteManifest();
        }

        private static void WriteManifestIfRunning()
        {
            if (_port > 0 && McpBridge.IsRunning)
            {
                WriteManifest();
            }
        }

        private static void WriteManifest()
        {
            if (_port <= 0 || string.IsNullOrEmpty(_manifestPath))
            {
                return;
            }

            try
            {
                File.WriteAllText(_manifestPath, MiniJson.Serialize(GetCurrentRecord()));
                _nextHeartbeatAt = EditorApplication.timeSinceStartup + HeartbeatIntervalSeconds;
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogWarning($"[Strada.MCP] Failed to write editor registry manifest: {ex.Message}");
            }
        }

        private static string BuildManifestFileName()
        {
            return $"editor-{GetProcessId()}-{SanitizeFileName(GetProjectName())}.json";
        }

        private static string BuildInstanceId()
        {
            return $"{GetProjectName()}-{GetProcessId()}";
        }

        private static int GetProcessId()
        {
            try
            {
                return Process.GetCurrentProcess().Id;
            }
            catch
            {
                return 0;
            }
        }

        private static string GetProjectPath()
        {
            var projectPath = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
            return projectPath.Replace('\\', '/');
        }

        private static string GetProjectName()
        {
            return Path.GetFileName(GetProjectPath().TrimEnd('/', '\\')) ?? "UnityProject";
        }

        private static string SanitizeFileName(string value)
        {
            foreach (var invalid in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(invalid, '_');
            }

            return string.IsNullOrWhiteSpace(value) ? "UnityProject" : value;
        }
    }
}
#endif
