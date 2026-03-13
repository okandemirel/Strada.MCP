#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handlers for Editor-related JSON-RPC commands (play mode, selection, console, menus).
    /// </summary>
    public static class EditorCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("editor.playMode", PlayMode);
            dispatcher.RegisterHandler("editor.getPlayState", GetPlayState);
            dispatcher.RegisterHandler("editor.executeMenu", ExecuteMenu);
            dispatcher.RegisterHandler("editor.log", Log);
            dispatcher.RegisterHandler("editor.clearConsole", ClearConsole);
            dispatcher.RegisterHandler("editor.getSelection", GetSelection);
            dispatcher.RegisterHandler("editor.setSelection", SetSelection);
        }

        /// <summary>
        /// Controls play mode.
        /// Params: action ("play"|"pause"|"stop"|"step")
        /// </summary>
        private static object PlayMode(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action");
            if (string.IsNullOrEmpty(action))
                throw new JsonRpcException(ErrorCode.InvalidParams, "action is required");

            switch (action.ToLowerInvariant())
            {
                case "play":
                    EditorApplication.isPlaying = true;
                    break;
                case "pause":
                    EditorApplication.isPaused = !EditorApplication.isPaused;
                    break;
                case "stop":
                    EditorApplication.isPlaying = false;
                    break;
                case "step":
                    EditorApplication.Step();
                    break;
                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams,
                        $"Invalid action: {action}. Use play, pause, stop, or step");
            }

            return new Dictionary<string, object>
            {
                { "action", action },
                { "isPlaying", EditorApplication.isPlaying },
                { "isPaused", EditorApplication.isPaused }
            };
        }

        /// <summary>
        /// Returns the current play mode state.
        /// </summary>
        private static object GetPlayState(Dictionary<string, object> @params)
        {
            return new Dictionary<string, object>
            {
                { "isPlaying", EditorApplication.isPlaying },
                { "isPaused", EditorApplication.isPaused },
                { "isCompiling", EditorApplication.isCompiling },
                { "isPlayingOrWillChangePlaymode", EditorApplication.isPlayingOrWillChangePlaymode }
            };
        }

        /// <summary>
        /// Executes a Unity menu item.
        /// Params: menuPath (string)
        /// </summary>
        private static object ExecuteMenu(Dictionary<string, object> @params)
        {
            string menuPath = GameObjectCommands.GetString(@params, "menuPath");
            if (string.IsNullOrEmpty(menuPath))
                throw new JsonRpcException(ErrorCode.InvalidParams, "menuPath is required");

            bool result = EditorApplication.ExecuteMenuItem(menuPath);

            return new Dictionary<string, object>
            {
                { "executed", result },
                { "menuPath", menuPath }
            };
        }

        /// <summary>
        /// Writes a message to the Unity console.
        /// Params: message (string), type? ("log"|"warning"|"error", default: "log")
        /// </summary>
        private static object Log(Dictionary<string, object> @params)
        {
            string message = GameObjectCommands.GetString(@params, "message");
            if (string.IsNullOrEmpty(message))
                throw new JsonRpcException(ErrorCode.InvalidParams, "message is required");

            string type = GameObjectCommands.GetString(@params, "type", "log");

            switch (type.ToLowerInvariant())
            {
                case "warning":
                    Debug.LogWarning($"[MCP] {message}");
                    break;
                case "error":
                    Debug.LogError($"[MCP] {message}");
                    break;
                default:
                    Debug.Log($"[MCP] {message}");
                    break;
            }

            return new Dictionary<string, object>
            {
                { "logged", true },
                { "type", type }
            };
        }

        /// <summary>
        /// Clears the Unity console.
        /// </summary>
        private static object ClearConsole(Dictionary<string, object> @params)
        {
            // Use reflection to access the internal LogEntries.Clear method
            try
            {
                var logEntries = Type.GetType("UnityEditor.LogEntries, UnityEditor");
                if (logEntries != null)
                {
                    var clearMethod = logEntries.GetMethod("Clear", BindingFlags.Static | BindingFlags.Public);
                    clearMethod?.Invoke(null, null);
                }
            }
            catch (Exception ex)
            {
                throw new JsonRpcException(ErrorCode.InternalError, $"Failed to clear console: {ex.Message}");
            }

            return new Dictionary<string, object>
            {
                { "cleared", true }
            };
        }

        /// <summary>
        /// Returns the current editor selection.
        /// </summary>
        private static object GetSelection(Dictionary<string, object> @params)
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
                    info["path"] = GameObjectCommands.GetGameObjectPath(go);
                    info["active"] = go.activeSelf;
                }

                selected.Add(info);
            }

            return new Dictionary<string, object>
            {
                { "count", selected.Count },
                { "objects", selected },
                { "activeGameObject", Selection.activeGameObject != null ? Selection.activeGameObject.name : null }
            };
        }

        /// <summary>
        /// Sets the editor selection.
        /// Params: targets (string[] - names or paths), additive? (bool, default: false)
        /// </summary>
        private static object SetSelection(Dictionary<string, object> @params)
        {
            if (!@params.ContainsKey("targets"))
                throw new JsonRpcException(ErrorCode.InvalidParams, "targets is required");

            object targetsRaw = @params["targets"];
            var targetNames = new List<string>();

            if (targetsRaw is System.Collections.IList list)
            {
                foreach (var item in list)
                {
                    if (item != null) targetNames.Add(item.ToString());
                }
            }
            else if (targetsRaw is string singleTarget)
            {
                targetNames.Add(singleTarget);
            }

            var objects = new List<UnityEngine.Object>();
            var notFound = new List<string>();

            foreach (string name in targetNames)
            {
                try
                {
                    var go = GameObjectCommands.FindGameObject(name);
                    objects.Add(go);
                }
                catch (JsonRpcException)
                {
                    notFound.Add(name);
                }
            }

            bool additive = GameObjectCommands.GetBool(@params, "additive");
            if (additive && Selection.objects != null)
            {
                objects.AddRange(Selection.objects);
            }

            Selection.objects = objects.ToArray();

            return new Dictionary<string, object>
            {
                { "selected", objects.Count },
                { "notFound", notFound }
            };
        }
    }
}
#endif
