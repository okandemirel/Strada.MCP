#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEditorInternal;
using UnityEngine;
using RuntimeErrorCode = Strada.Mcp.Runtime.ErrorCode;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handlers for project-level Unity editor operations: settings, builds, packages, and editor preferences.
    /// </summary>
    public static class ProjectCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("project.playerSettings", PlayerSettingsCommand);
            dispatcher.RegisterHandler("project.qualitySettings", QualitySettingsCommand);
            dispatcher.RegisterHandler("project.buildSettings", BuildSettingsCommand);
            dispatcher.RegisterHandler("project.settings", ProjectSettingsCommand);
            dispatcher.RegisterHandler("project.editorPreferences", EditorPreferencesCommand);
            dispatcher.RegisterHandler("project.buildPlayer", BuildPlayerCommand);
            dispatcher.RegisterHandler("project.packageManager", PackageManagerCommand);
        }

        private static object PlayerSettingsCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            var group = BuildPipeline.GetBuildTargetGroup(EditorUserBuildSettings.activeBuildTarget);

            if (action == "set")
            {
                var settings = GetNestedDictionary(@params, "settings");
                if (settings == null)
                    throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "settings is required for action=set");

                if (settings.TryGetValue("companyName", out object companyName) && companyName != null)
                    PlayerSettings.companyName = companyName.ToString();
                if (settings.TryGetValue("productName", out object productName) && productName != null)
                    PlayerSettings.productName = productName.ToString();
                if (settings.TryGetValue("bundleIdentifier", out object bundleIdentifier) && bundleIdentifier != null)
                    PlayerSettings.SetApplicationIdentifier(group, bundleIdentifier.ToString());
                if (settings.TryGetValue("applicationIdentifier", out object appId) && appId != null)
                    PlayerSettings.SetApplicationIdentifier(group, appId.ToString());
                if (settings.TryGetValue("colorSpace", out object colorSpace) && colorSpace != null
                    && Enum.TryParse(colorSpace.ToString(), true, out ColorSpace parsedColorSpace))
                    PlayerSettings.colorSpace = parsedColorSpace;
                if (settings.TryGetValue("scriptingBackend", out object scriptingBackend) && scriptingBackend != null
                    && Enum.TryParse(scriptingBackend.ToString(), true, out ScriptingImplementation parsedBackend))
                    PlayerSettings.SetScriptingBackend(group, parsedBackend);
            }

            return new Dictionary<string, object>
            {
                { "companyName", PlayerSettings.companyName },
                { "productName", PlayerSettings.productName },
                { "bundleIdentifier", PlayerSettings.GetApplicationIdentifier(group) },
                { "applicationIdentifier", PlayerSettings.GetApplicationIdentifier(group) },
                { "scriptingBackend", PlayerSettings.GetScriptingBackend(group).ToString() },
                { "colorSpace", PlayerSettings.colorSpace.ToString() },
                { "activeBuildTargetGroup", group.ToString() }
            };
        }

        private static object QualitySettingsCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            if (action == "set")
            {
                string levelName = GameObjectCommands.GetString(@params, "level");
                if (!string.IsNullOrEmpty(levelName))
                {
                    int index = Array.IndexOf(QualitySettings.names, levelName);
                    if (index < 0)
                        throw new JsonRpcException(RuntimeErrorCode.InvalidParams, $"Unknown quality level: {levelName}");
                    QualitySettings.SetQualityLevel(index, true);
                }

                var settings = GetNestedDictionary(@params, "settings");
                if (settings != null)
                {
                    if (settings.TryGetValue("shadowDistance", out object shadowDistance))
                        QualitySettings.shadowDistance = ToFloat(shadowDistance);
                    if (settings.TryGetValue("antiAliasing", out object antiAliasing))
                        QualitySettings.antiAliasing = Convert.ToInt32(antiAliasing);
                    if (settings.TryGetValue("lodBias", out object lodBias))
                        QualitySettings.lodBias = ToFloat(lodBias);
                    if (settings.TryGetValue("vSyncCount", out object vSyncCount))
                        QualitySettings.vSyncCount = Convert.ToInt32(vSyncCount);
                }
            }

            int currentIndex = QualitySettings.GetQualityLevel();
            return new Dictionary<string, object>
            {
                { "currentLevel", currentIndex >= 0 && currentIndex < QualitySettings.names.Length ? QualitySettings.names[currentIndex] : "Unknown" },
                { "levels", QualitySettings.names.Select(name => new Dictionary<string, object> { { "name", name } }).Cast<object>().ToList() },
                { "shadowDistance", QualitySettings.shadowDistance },
                { "antiAliasing", QualitySettings.antiAliasing },
                { "lodBias", QualitySettings.lodBias },
                { "vSyncCount", QualitySettings.vSyncCount }
            };
        }

        private static object BuildSettingsCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            if (action == "set")
            {
                var settings = GetNestedDictionary(@params, "settings");
                if (settings == null)
                    throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "settings is required for action=set");

                if (settings.TryGetValue("activeBuildTarget", out object targetObj) && targetObj != null)
                {
                    SwitchBuildTarget(targetObj.ToString());
                }

                if (settings.TryGetValue("scenes", out object scenesObj) && scenesObj is IList scenesList)
                {
                    var scenes = new List<EditorBuildSettingsScene>();
                    foreach (var item in scenesList)
                    {
                        if (item is string scenePathString)
                        {
                            scenes.Add(new EditorBuildSettingsScene(scenePathString, true));
                        }
                        else if (item is Dictionary<string, object> sceneDict)
                        {
                            string scenePath = sceneDict.TryGetValue("path", out object scenePathValue) ? scenePathValue?.ToString() : null;
                            bool enabled = !sceneDict.TryGetValue("enabled", out object enabledValue) || Convert.ToBoolean(enabledValue);
                            if (!string.IsNullOrEmpty(scenePath))
                            {
                                scenes.Add(new EditorBuildSettingsScene(scenePath, enabled));
                            }
                        }
                    }
                    if (scenes.Count > 0)
                    {
                        EditorBuildSettings.scenes = scenes.ToArray();
                    }
                }

                if (settings.TryGetValue("buildOptions", out object optionsObj) && optionsObj is IList optionsList)
                {
                    var optionNames = optionsList.Cast<object>().Select(item => item?.ToString() ?? string.Empty).ToList();
                    EditorUserBuildSettings.development = optionNames.Contains("Development");
                    EditorUserBuildSettings.allowDebugging = optionNames.Contains("AllowDebugging");
                }
            }

            return GetBuildSettingsSnapshot();
        }

        private static object ProjectSettingsCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            string category = GameObjectCommands.GetString(@params, "category");
            if (string.IsNullOrEmpty(category))
                throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "category is required");

            switch (category)
            {
                case "physics":
                    if (action == "set") ApplyPhysicsSettings(GetNestedDictionary(@params, "settings"));
                    return GetPhysicsSettings();
                case "time":
                    if (action == "set") ApplyTimeSettings(GetNestedDictionary(@params, "settings"));
                    return GetTimeSettings();
                case "input":
                    if (action == "set")
                        throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "InputManager writes are not supported through this bridge yet.");
                    return GetInputSettings();
                case "tags":
                    if (action == "set") ApplyTagManagerList("tags", GetNestedStringList(GetNestedDictionary(@params, "settings"), "tags"));
                    return new Dictionary<string, object> { { "category", "tags" }, { "tags", InternalEditorUtility.tags.Cast<object>().ToList() } };
                case "layers":
                    if (action == "set") ApplyLayers(GetNestedStringList(GetNestedDictionary(@params, "settings"), "layers"));
                    return new Dictionary<string, object> { { "category", "layers" }, { "layers", InternalEditorUtility.layers.Cast<object>().ToList() } };
                case "sorting-layers":
                    return new Dictionary<string, object> { { "category", "sorting-layers" }, { "sortingLayers", SortingLayer.layers.Select(layer => (object)layer.name).ToList() } };
                default:
                    throw new JsonRpcException(RuntimeErrorCode.InvalidParams, $"Unsupported project settings category: {category}");
            }
        }

        private static object EditorPreferencesCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            if (action == "delete")
            {
                var keys = GetStringList(@params, "keys");
                foreach (var key in keys)
                {
                    EditorPrefs.DeleteKey(key);
                }
                return new Dictionary<string, object> { { "deleted", keys.Cast<object>().ToList() } };
            }

            if (action == "set")
            {
                var values = GetNestedDictionary(@params, "values");
                if (values == null)
                    throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "values is required for action=set");

                foreach (var pair in values)
                {
                    SetEditorPref(pair.Key, pair.Value);
                }
            }

            var result = new Dictionary<string, object>();
            foreach (var key in GetStringList(@params, "keys"))
            {
                result[key] = GetEditorPref(key);
            }
            return new Dictionary<string, object> { { "values", result } };
        }

        private static object BuildPlayerCommand(Dictionary<string, object> @params)
        {
            string targetName = GameObjectCommands.GetString(@params, "target");
            string outputPath = GameObjectCommands.GetString(@params, "outputPath");
            if (string.IsNullOrEmpty(targetName) || string.IsNullOrEmpty(outputPath))
                throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "target and outputPath are required");

            if (!TryParseBuildTarget(targetName, out BuildTarget target, out BuildTargetGroup group))
                throw new JsonRpcException(RuntimeErrorCode.InvalidParams, $"Unsupported build target: {targetName}");

            var scenes = GetStringList(@params, "scenes");
            if (scenes.Count == 0)
            {
                scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToList();
            }
            if (scenes.Count == 0)
                throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "No enabled scenes available for the build.");

            if (GameObjectCommands.GetBool(@params, "preflight", true))
            {
                foreach (var scene in scenes)
                {
                    if (!File.Exists(scene))
                        throw new JsonRpcException(RuntimeErrorCode.AssetNotFound, $"Scene not found: {scene}");
                }
            }

            if (GameObjectCommands.GetBool(@params, "clean", false))
            {
                if (Directory.Exists(outputPath))
                    Directory.Delete(outputPath, true);
                else if (File.Exists(outputPath))
                    File.Delete(outputPath);
            }

            EditorUserBuildSettings.SwitchActiveBuildTarget(group, target);

            BuildOptions buildOptions = BuildOptions.None;
            if (GameObjectCommands.GetBool(@params, "development", false))
                buildOptions |= BuildOptions.Development;

            if (@params.TryGetValue("options", out object optionsObj) && optionsObj is IList optionsList)
            {
                foreach (var option in optionsList)
                {
                    string optionName = option?.ToString() ?? string.Empty;
                    if (optionName == "AllowDebugging") buildOptions |= BuildOptions.AllowDebugging;
                    if (optionName == "ConnectWithProfiler") buildOptions |= BuildOptions.ConnectWithProfiler;
                    if (optionName == "Development") buildOptions |= BuildOptions.Development;
                    if (optionName == "AutoRunPlayer") buildOptions |= BuildOptions.AutoRunPlayer;
                }
            }

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes.ToArray(),
                locationPathName = outputPath,
                target = target,
                options = buildOptions
            });

            var summary = report.summary;
            return new Dictionary<string, object>
            {
                { "success", summary.result == BuildResult.Succeeded },
                { "target", target.ToString() },
                { "outputPath", outputPath },
                { "artifactPath", outputPath },
                {
                    "summary",
                    new Dictionary<string, object>
                    {
                        { "result", summary.result.ToString() },
                        { "totalErrors", summary.totalErrors },
                        { "totalWarnings", summary.totalWarnings },
                        { "totalSize", summary.totalSize },
                        { "totalTimeSeconds", summary.totalTime.TotalSeconds }
                    }
                },
                { "issues", new List<object>() }
            };
        }

        private static object PackageManagerCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "list");
            string source = GameObjectCommands.GetString(@params, "source", "registry");

            switch (action)
            {
                case "list":
                    return ListPackages();
                case "resolve":
                    Client.Resolve();
                    return new Dictionary<string, object>
                    {
                        { "action", action },
                        { "source", source },
                        { "success", true },
                        { "detail", "Package resolution triggered." }
                    };
                case "remove":
                    string removeId = GameObjectCommands.GetString(@params, "packageId");
                    if (string.IsNullOrEmpty(removeId))
                        throw new JsonRpcException(RuntimeErrorCode.InvalidParams, "packageId is required for remove");
                    WaitForRequest(Client.Remove(removeId));
                    return new Dictionary<string, object>
                    {
                        { "action", action },
                        { "source", source },
                        { "packageId", removeId },
                        { "success", true }
                    };
                case "add":
                    return AddPackage(@params, source);
                default:
                    throw new JsonRpcException(RuntimeErrorCode.InvalidParams, $"Unsupported package action: {action}");
            }
        }

        private static object AddPackage(Dictionary<string, object> @params, string source)
        {
            if (source == "asset-store")
            {
                string assetPath = GameObjectCommands.GetString(@params, "assetPath");
                if (string.IsNullOrEmpty(assetPath))
                    throw new JsonRpcException(RuntimeErrorCode.PermissionDenied, "Asset Store automation is limited to already-downloaded local assets. Provide assetPath to a local .unitypackage.");
                if (!File.Exists(assetPath))
                    throw new JsonRpcException(RuntimeErrorCode.AssetNotFound, $"Local asset package not found: {assetPath}");

                AssetDatabase.ImportPackage(assetPath, false);
                return new Dictionary<string, object>
                {
                    { "action", "add" },
                    { "source", source },
                    { "success", true },
                    { "detail", $"Imported local asset package: {assetPath}" }
                };
            }

            string packageId = BuildPackageIdentifier(@params, source);
            if (string.IsNullOrEmpty(packageId))
                throw new JsonRpcException(RuntimeErrorCode.InvalidParams, $"Could not build a package identifier for source={source}");

            WaitForRequest(Client.Add(packageId));
            return new Dictionary<string, object>
            {
                { "action", "add" },
                { "source", source },
                { "packageId", packageId },
                { "success", true }
            };
        }

        private static object ListPackages()
        {
            ListRequest request = Client.List(true, false);
            WaitForRequest(request);

            return new Dictionary<string, object>
            {
                { "action", "list" },
                { "source", "registry" },
                {
                    "packages",
                    request.Result.Select(package => new Dictionary<string, object>
                    {
                        { "name", package.name },
                        { "displayName", package.displayName },
                        { "version", package.version },
                        { "source", package.source.ToString() },
                        { "resolvedPath", package.resolvedPath }
                    }).Cast<object>().ToList()
                },
                { "success", true }
            };
        }

        private static void WaitForRequest(Request request, int timeoutMs = 30000)
        {
            int waited = 0;
            while (!request.IsCompleted && waited < timeoutMs)
            {
                Thread.Sleep(100);
                waited += 100;
            }

            if (!request.IsCompleted)
                throw new JsonRpcException(RuntimeErrorCode.Timeout, "Package Manager request timed out.");
            if (request.Status == StatusCode.Failure)
                throw new JsonRpcException(RuntimeErrorCode.InternalError, request.Error?.message ?? "Package Manager request failed.");
        }

        private static object GetBuildSettingsSnapshot()
        {
            return new Dictionary<string, object>
            {
                { "activeBuildTarget", EditorUserBuildSettings.activeBuildTarget.ToString() },
                {
                    "scenes",
                    EditorBuildSettings.scenes.Select(scene => new Dictionary<string, object>
                    {
                        { "path", scene.path },
                        { "enabled", scene.enabled }
                    }).Cast<object>().ToList()
                },
                {
                    "buildOptions",
                    new List<object>
                    {
                        EditorUserBuildSettings.development ? "Development" : null,
                        EditorUserBuildSettings.allowDebugging ? "AllowDebugging" : null
                    }.Where(item => item != null).ToList()
                }
            };
        }

        private static Dictionary<string, object> GetPhysicsSettings()
        {
            return new Dictionary<string, object>
            {
                { "category", "physics" },
                { "gravity", new Dictionary<string, object> { { "x", Physics.gravity.x }, { "y", Physics.gravity.y }, { "z", Physics.gravity.z } } },
                { "defaultSolverIterations", Physics.defaultSolverIterations },
                { "defaultSolverVelocityIterations", Physics.defaultSolverVelocityIterations }
            };
        }

        private static void ApplyPhysicsSettings(Dictionary<string, object> settings)
        {
            if (settings == null) return;
            if (settings.TryGetValue("gravity", out object gravity) && gravity is Dictionary<string, object> gravityDict)
            {
                Physics.gravity = new Vector3(
                    GameObjectCommands.GetFloat(gravityDict, "x", Physics.gravity.x),
                    GameObjectCommands.GetFloat(gravityDict, "y", Physics.gravity.y),
                    GameObjectCommands.GetFloat(gravityDict, "z", Physics.gravity.z)
                );
            }
            if (settings.TryGetValue("defaultSolverIterations", out object iterations))
                Physics.defaultSolverIterations = Convert.ToInt32(iterations);
            if (settings.TryGetValue("defaultSolverVelocityIterations", out object velocityIterations))
                Physics.defaultSolverVelocityIterations = Convert.ToInt32(velocityIterations);
        }

        private static Dictionary<string, object> GetTimeSettings()
        {
            return new Dictionary<string, object>
            {
                { "category", "time" },
                { "fixedDeltaTime", Time.fixedDeltaTime },
                { "maximumDeltaTime", Time.maximumDeltaTime },
                { "timeScale", Time.timeScale }
            };
        }

        private static void ApplyTimeSettings(Dictionary<string, object> settings)
        {
            if (settings == null) return;
            if (settings.TryGetValue("fixedDeltaTime", out object fixedDeltaTime))
                Time.fixedDeltaTime = ToFloat(fixedDeltaTime);
            if (settings.TryGetValue("maximumDeltaTime", out object maximumDeltaTime))
                Time.maximumDeltaTime = ToFloat(maximumDeltaTime);
            if (settings.TryGetValue("timeScale", out object timeScale))
                Time.timeScale = ToFloat(timeScale);
        }

        private static Dictionary<string, object> GetInputSettings()
        {
            UnityEngine.Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if (assets == null || assets.Length == 0)
            {
                return new Dictionary<string, object> { { "category", "input" }, { "axes", new List<object>() } };
            }

            var serialized = new SerializedObject(assets[0]);
            var axes = serialized.FindProperty("m_Axes");
            var list = new List<object>();
            if (axes != null && axes.isArray)
            {
                for (int i = 0; i < axes.arraySize; i++)
                {
                    var axis = axes.GetArrayElementAtIndex(i);
                    list.Add(new Dictionary<string, object>
                    {
                        { "name", axis.FindPropertyRelative("m_Name")?.stringValue ?? string.Empty },
                        { "gravity", axis.FindPropertyRelative("gravity")?.floatValue ?? 0f },
                        { "dead", axis.FindPropertyRelative("dead")?.floatValue ?? 0f },
                        { "sensitivity", axis.FindPropertyRelative("sensitivity")?.floatValue ?? 0f },
                        { "type", axis.FindPropertyRelative("type")?.intValue ?? 0 }
                    });
                }
            }

            return new Dictionary<string, object> { { "category", "input" }, { "axes", list } };
        }

        private static void ApplyTagManagerList(string propertyName, List<string> values)
        {
            if (values == null) return;
            UnityEngine.Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0)
                throw new JsonRpcException(RuntimeErrorCode.InternalError, "TagManager.asset not found.");

            var serialized = new SerializedObject(assets[0]);
            var property = serialized.FindProperty(propertyName);
            if (property == null || !property.isArray)
                throw new JsonRpcException(RuntimeErrorCode.InternalError, $"TagManager property not found: {propertyName}");

            property.arraySize = values.Count;
            for (int i = 0; i < values.Count; i++)
            {
                property.GetArrayElementAtIndex(i).stringValue = values[i];
            }
            serialized.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
        }

        private static void ApplyLayers(List<string> values)
        {
            if (values == null) return;
            UnityEngine.Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0)
                throw new JsonRpcException(RuntimeErrorCode.InternalError, "TagManager.asset not found.");

            var serialized = new SerializedObject(assets[0]);
            var property = serialized.FindProperty("layers");
            if (property == null || !property.isArray)
                throw new JsonRpcException(RuntimeErrorCode.InternalError, "TagManager layers property not found.");

            for (int i = 8; i < property.arraySize && (i - 8) < values.Count; i++)
            {
                property.GetArrayElementAtIndex(i).stringValue = values[i - 8];
            }
            serialized.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
        }

        private static List<string> GetStringList(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out object raw) || raw == null)
                return new List<string>();
            if (raw is IList list)
                return list.Cast<object>().Where(item => item != null).Select(item => item.ToString()).ToList();
            return new List<string> { raw.ToString() };
        }

        private static List<string> GetNestedStringList(Dictionary<string, object> dict, string key)
        {
            return GetStringList(dict, key);
        }

        private static Dictionary<string, object> GetNestedDictionary(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out object raw) || raw == null)
                return null;
            return raw as Dictionary<string, object>;
        }

        private static void SetEditorPref(string key, object value)
        {
            if (value is bool boolValue)
            {
                EditorPrefs.SetBool(key, boolValue);
                return;
            }
            if (value is double || value is float)
            {
                EditorPrefs.SetFloat(key, ToFloat(value));
                return;
            }
            if (value is int || value is long)
            {
                EditorPrefs.SetInt(key, Convert.ToInt32(value));
                return;
            }

            EditorPrefs.SetString(key, value?.ToString() ?? string.Empty);
        }

        private static object GetEditorPref(string key)
        {
            if (!EditorPrefs.HasKey(key))
                return null;
            return EditorPrefs.GetString(key, null)
                ?? (object)EditorPrefs.GetFloat(key, 0f);
        }

        private static bool TryParseBuildTarget(string targetName, out BuildTarget target, out BuildTargetGroup group)
        {
            target = BuildTarget.NoTarget;
            group = BuildTargetGroup.Unknown;

            switch (targetName)
            {
                case "Android":
                    target = BuildTarget.Android;
                    group = BuildTargetGroup.Android;
                    return true;
                case "iOS":
                    target = BuildTarget.iOS;
                    group = BuildTargetGroup.iOS;
                    return true;
                case "WebGL":
                    target = BuildTarget.WebGL;
                    group = BuildTargetGroup.WebGL;
                    return true;
                case "StandaloneWindows64":
                    target = BuildTarget.StandaloneWindows64;
                    group = BuildTargetGroup.Standalone;
                    return true;
                case "StandaloneOSX":
                    target = BuildTarget.StandaloneOSX;
                    group = BuildTargetGroup.Standalone;
                    return true;
                case "StandaloneLinux64":
                    target = BuildTarget.StandaloneLinux64;
                    group = BuildTargetGroup.Standalone;
                    return true;
                default:
                    return false;
            }
        }

        private static void SwitchBuildTarget(string targetName)
        {
            if (!TryParseBuildTarget(targetName, out BuildTarget target, out BuildTargetGroup group))
                throw new JsonRpcException(RuntimeErrorCode.InvalidParams, $"Unsupported build target: {targetName}");

            EditorUserBuildSettings.SwitchActiveBuildTarget(group, target);
        }

        private static string BuildPackageIdentifier(Dictionary<string, object> @params, string source)
        {
            switch (source)
            {
                case "registry":
                    string packageId = GameObjectCommands.GetString(@params, "packageId");
                    string version = GameObjectCommands.GetString(@params, "version");
                    return string.IsNullOrEmpty(version) ? packageId : $"{packageId}@{version}";
                case "git":
                    return GameObjectCommands.GetString(@params, "gitUrl");
                case "local":
                    return GameObjectCommands.GetString(@params, "localPath");
                default:
                    return null;
            }
        }

        private static float ToFloat(object value)
        {
            if (value is float f) return f;
            if (value is double d) return (float)d;
            if (value is int i) return i;
            if (value is long l) return l;
            if (float.TryParse(value?.ToString(), out float parsed)) return parsed;
            return 0f;
        }
    }
}
#endif
