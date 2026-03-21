#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Compilation;

namespace Strada.Mcp.Editor.Events
{
    [InitializeOnLoad]
    internal static class EditorRuntimeState
    {
        private static long? _lastCompileStartedAt;
        private static long? _lastCompileFinishedAt;
        private static bool? _lastCompileSucceeded;
        private static bool _isReloading;
        private static int _assemblyReloadCount;
        private static long? _lastBeforeReloadAt;
        private static long? _lastAfterReloadAt;

        static EditorRuntimeState()
        {
            CompilationPipeline.compilationStarted += OnCompilationStarted;
            CompilationPipeline.compilationFinished += OnCompilationFinished;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
            AssemblyReloadEvents.afterAssemblyReload += OnAfterAssemblyReload;
        }

        public static Dictionary<string, object> GetCompileStatus()
        {
            var compileEntries = ConsoleLogBuffer.SnapshotEntries(
                100,
                new[] { "error", "exception", "assert" },
                true,
                "compile",
                _lastCompileStartedAt);

            return new Dictionary<string, object>
            {
                { "isCompiling", EditorApplication.isCompiling },
                { "isReloading", _isReloading },
                { "lastStartedAt", _lastCompileStartedAt },
                { "lastFinishedAt", _lastCompileFinishedAt },
                { "lastSucceeded", _lastCompileSucceeded },
                { "compileIssueCount", compileEntries.Count },
                { "compileIssues", compileEntries.Cast<object>().ToList() },
                { "assemblyReloadCount", _assemblyReloadCount }
            };
        }

        public static Dictionary<string, object> GetAssemblyReloadStatus()
        {
            return new Dictionary<string, object>
            {
                { "isReloading", _isReloading },
                { "assemblyReloadCount", _assemblyReloadCount },
                { "lastBeforeReloadAt", _lastBeforeReloadAt },
                { "lastAfterReloadAt", _lastAfterReloadAt },
                { "isCompiling", EditorApplication.isCompiling }
            };
        }

        private static void OnCompilationStarted(object context)
        {
            _lastCompileStartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _lastCompileSucceeded = null;
        }

        private static void OnCompilationFinished(object context)
        {
            _lastCompileFinishedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            var compileEntries = ConsoleLogBuffer.SnapshotEntries(
                100,
                new[] { "error", "exception", "assert" },
                true,
                "compile",
                _lastCompileStartedAt);

            _lastCompileSucceeded = compileEntries.Count == 0;
        }

        private static void OnBeforeAssemblyReload()
        {
            _isReloading = true;
            _assemblyReloadCount++;
            _lastBeforeReloadAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        private static void OnAfterAssemblyReload()
        {
            _isReloading = false;
            _lastAfterReloadAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
    }
}
#endif
