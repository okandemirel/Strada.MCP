#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Strada.Mcp.Editor.Events
{
    /// <summary>
    /// Broadcasts Unity Editor events as JSON-RPC notifications over the TCP bridge.
    /// Hooks into hierarchy changes, console messages, compilation, play mode, and selection.
    /// </summary>
    public sealed class EventBroadcaster
    {
        private readonly TcpBridgeServer _server;
        private bool _subscribed;

        public EventBroadcaster(TcpBridgeServer server)
        {
            _server = server ?? throw new ArgumentNullException(nameof(server));
            Subscribe();
        }

        /// <summary>
        /// Subscribes to all Unity Editor callbacks.
        /// </summary>
        public void Subscribe()
        {
            if (_subscribed) return;
            _subscribed = true;

            EditorApplication.hierarchyChanged += OnHierarchyChanged;
            Application.logMessageReceived += OnLogMessage;
            CompilationPipeline.compilationStarted += OnCompileStarted;
            CompilationPipeline.compilationFinished += OnCompileFinished;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;
            Selection.selectionChanged += OnSelectionChanged;
        }

        /// <summary>
        /// Unsubscribes from all Unity Editor callbacks.
        /// Must be called on shutdown to prevent leaks.
        /// </summary>
        public void Unsubscribe()
        {
            if (!_subscribed) return;
            _subscribed = false;

            EditorApplication.hierarchyChanged -= OnHierarchyChanged;
            Application.logMessageReceived -= OnLogMessage;
            CompilationPipeline.compilationStarted -= OnCompileStarted;
            CompilationPipeline.compilationFinished -= OnCompileFinished;
            EditorApplication.playModeStateChanged -= OnPlayModeChanged;
            Selection.selectionChanged -= OnSelectionChanged;
        }

        // --- Event Handlers ---

        private void OnHierarchyChanged()
        {
            var data = new Dictionary<string, object>
            {
                { "scene", SceneManager.GetActiveScene().name },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };
            SendNotification("unity.sceneChanged", data);
        }

        private void OnLogMessage(string condition, string stackTrace, LogType type)
        {
            ConsoleLogBuffer.Record(condition, stackTrace, type);

            string logType;
            switch (type)
            {
                case LogType.Error:
                    logType = "error";
                    break;
                case LogType.Assert:
                    logType = "assert";
                    break;
                case LogType.Warning:
                    logType = "warning";
                    break;
                case LogType.Exception:
                    logType = "exception";
                    break;
                default:
                    logType = "log";
                    break;
            }

            var data = new Dictionary<string, object>
            {
                { "message", condition },
                { "stackTrace", stackTrace },
                { "type", logType },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };
            SendNotification("unity.consoleMessage", data);
        }

        private void OnCompileStarted(object context)
        {
            var data = new Dictionary<string, object>
            {
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };
            SendNotification("unity.compileStarted", data);
        }

        private void OnCompileFinished(object context)
        {
            var data = new Dictionary<string, object>
            {
                { "success", !EditorApplication.isCompiling },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };
            SendNotification("unity.compileFinished", data);
        }

        private void OnPlayModeChanged(PlayModeStateChange state)
        {
            string stateName;
            switch (state)
            {
                case PlayModeStateChange.EnteredEditMode:
                    stateName = "enteredEditMode";
                    break;
                case PlayModeStateChange.ExitingEditMode:
                    stateName = "exitingEditMode";
                    break;
                case PlayModeStateChange.EnteredPlayMode:
                    stateName = "enteredPlayMode";
                    break;
                case PlayModeStateChange.ExitingPlayMode:
                    stateName = "exitingPlayMode";
                    break;
                default:
                    stateName = state.ToString();
                    break;
            }

            var data = new Dictionary<string, object>
            {
                { "state", stateName },
                { "isPlaying", EditorApplication.isPlaying },
                { "isPaused", EditorApplication.isPaused },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };
            SendNotification("unity.playModeChanged", data);
        }

        private void OnSelectionChanged()
        {
            var selected = new List<object>();
            foreach (var obj in Selection.objects)
            {
                if (obj == null) continue;

                var info = new Dictionary<string, object>
                {
                    { "name", obj.name },
                    { "instanceId", obj.GetInstanceID() },
                    { "type", obj.GetType().Name }
                };

                if (obj is GameObject go)
                {
                    info["path"] = GetGameObjectPath(go);
                }

                selected.Add(info);
            }

            var data = new Dictionary<string, object>
            {
                { "count", selected.Count },
                { "objects", selected },
                { "activeGameObject", Selection.activeGameObject != null ? Selection.activeGameObject.name : null },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };
            SendNotification("unity.selectionChanged", data);
        }

        // --- Helpers ---

        private void SendNotification(string method, Dictionary<string, object> data)
        {
            if (!_server.IsClientConnected) return;

            try
            {
                var notification = JsonRpcNotification.Create(method, data);
                string json = JsonRpcSerializer.Serialize(notification);
                _server.Send(json);
            }
            catch (Exception ex)
            {
                // Avoid recursive logging for consoleMessage events
                if (method != "unity.consoleMessage")
                {
                    Debug.LogWarning($"[Strada.MCP] Failed to send notification '{method}': {ex.Message}");
                }
            }
        }

        private static string GetGameObjectPath(GameObject go)
        {
            if (go == null) return "";
            string path = go.name;
            Transform parent = go.transform.parent;
            while (parent != null)
            {
                path = parent.name + "/" + path;
                parent = parent.parent;
            }
            return "/" + path;
        }
    }
}
#endif
