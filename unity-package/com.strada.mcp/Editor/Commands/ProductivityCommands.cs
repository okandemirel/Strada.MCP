#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace Strada.Mcp.Editor.Commands
{
    public static class ProductivityCommands
    {
        private static readonly string[] UguiButtonTypes =
        {
            "UnityEngine.UI.Button"
        };

        private static readonly string[] UguiToggleTypes =
        {
            "UnityEngine.UI.Toggle"
        };

        private static readonly string[] UguiSliderTypes =
        {
            "UnityEngine.UI.Slider",
            "UnityEngine.UI.Scrollbar"
        };

        private static readonly string[] UguiDropdownTypes =
        {
            "UnityEngine.UI.Dropdown",
            "TMPro.TMP_Dropdown"
        };

        private static readonly string[] UguiInputTypes =
        {
            "UnityEngine.UI.InputField",
            "TMPro.TMP_InputField"
        };

        private static readonly string[] UguiTextTypes =
        {
            "UnityEngine.UI.Text",
            "TMPro.TextMeshProUGUI",
            "TMPro.TMP_Text"
        };

        private static readonly string[] UguiSelectableTypes =
        {
            "UnityEngine.UI.Selectable"
        };

        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("editor.uiQuery", UiQueryCommand);
            dispatcher.RegisterHandler("editor.uiAction", UiActionCommand);
            dispatcher.RegisterHandler("editor.inputSimulate", InputSimulateCommand);
            dispatcher.RegisterHandler("editor.cameraManage", CameraManageCommand);
            dispatcher.RegisterHandler("editor.graphicsManage", GraphicsManageCommand);
            dispatcher.RegisterHandler("editor.importSettingsManage", ImportSettingsManageCommand);
            dispatcher.RegisterHandler("editor.addressablesManage", AddressablesManageCommand);
        }

        private static object UiQueryCommand(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            bool includeInactive = GameObjectCommands.GetBool(@params, "includeInactive", true);
            bool includeToolkit = GameObjectCommands.GetBool(@params, "includeToolkit", true);
            bool includeComponents = GameObjectCommands.GetBool(@params, "includeComponents", true);
            int maxDepth = GameObjectCommands.GetInt(@params, "maxDepth", 8);

            if (!string.IsNullOrEmpty(target))
            {
                if (TryFindUguiTarget(target, out var uguiTarget))
                {
                    return new Dictionary<string, object>
                    {
                        { "count", 1 },
                        { "elements", new List<object> { SerializeUguiElement(uguiTarget, 0, maxDepth, includeInactive, includeComponents) } }
                    };
                }

                if (includeToolkit && TryFindVisualElement(target, out var toolkitDocument, out var toolkitElement, out string toolkitPath))
                {
                    return new Dictionary<string, object>
                    {
                        { "count", 1 },
                        { "elements", new List<object> { SerializeVisualElement(toolkitDocument, toolkitElement, toolkitPath, 0, maxDepth) } }
                    };
                }

                throw new JsonRpcException(ErrorCode.GameObjectNotFound, $"UI target not found: {target}");
            }

            var elements = new List<object>();
            foreach (var canvas in FindCanvasRoots(includeInactive))
            {
                elements.Add(SerializeUguiElement(canvas, 0, maxDepth, includeInactive, includeComponents));
            }

            if (includeToolkit)
            {
                foreach (var document in FindUiDocuments(includeInactive))
                {
                    if (document.rootVisualElement == null)
                    {
                        continue;
                    }

                    string documentPath = $"/{document.gameObject.name}";
                    elements.Add(SerializeVisualElement(document, document.rootVisualElement, documentPath, 0, maxDepth));
                }
            }

            return new Dictionary<string, object>
            {
                { "count", elements.Count },
                { "elements", elements }
            };
        }

        private static object UiActionCommand(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            string action = GameObjectCommands.GetString(@params, "action");
            string system = GameObjectCommands.GetString(@params, "system", "auto");
            string direction = GameObjectCommands.GetString(@params, "direction");

            if (string.IsNullOrEmpty(target))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");
            }

            if (string.IsNullOrEmpty(action))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "action is required");
            }

            if (!string.Equals(system, "uitoolkit", StringComparison.OrdinalIgnoreCase)
                && TryFindUguiTarget(target, out var uguiTarget))
            {
                return ApplyUguiAction(uguiTarget, action, @params, direction);
            }

            if (!string.Equals(system, "ugui", StringComparison.OrdinalIgnoreCase)
                && TryFindVisualElement(target, out var document, out var element, out string toolkitPath))
            {
                return ApplyToolkitAction(document, element, toolkitPath, action, @params, direction);
            }

            throw new JsonRpcException(ErrorCode.GameObjectNotFound, $"UI target not found: {target}");
        }

        private static object InputSimulateCommand(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            string action = GameObjectCommands.GetString(@params, "action");
            string system = GameObjectCommands.GetString(@params, "system", "auto");

            if (string.IsNullOrEmpty(action))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "action is required");
            }

            if (string.IsNullOrEmpty(target))
            {
                target = Selection.activeGameObject != null
                    ? GameObjectCommands.GetGameObjectPath(Selection.activeGameObject)
                    : FindFocusedVisualElementTarget();
            }

            if (string.IsNullOrEmpty(target))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required when there is no active UI selection or focused UI Toolkit element.");
            }

            var translated = new Dictionary<string, object>
            {
                { "target", target },
                { "system", system }
            };

            switch (action)
            {
                case "mouseClick":
                    translated["action"] = "click";
                    break;
                case "keyboardText":
                    translated["action"] = "setText";
                    translated["value"] = GameObjectCommands.GetString(@params, "text", string.Empty);
                    break;
                case "submit":
                    translated["action"] = "submit";
                    break;
                case "navigate":
                    translated["action"] = "navigate";
                    translated["direction"] = GameObjectCommands.GetString(@params, "direction", "next");
                    break;
                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported simulated input action: {action}");
            }

            var result = UiActionCommand(translated) as Dictionary<string, object> ?? new Dictionary<string, object>();
            result["simulatedInput"] = action;
            return result;
        }

        private static object CameraManageCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "list");
            string target = GameObjectCommands.GetString(@params, "target");
            string name = GameObjectCommands.GetString(@params, "name", "MCP Camera");
            var settings = GetNestedDictionary(@params, "settings");

            switch (action)
            {
                case "list":
                    return new Dictionary<string, object>
                    {
                        { "cameras", FindSceneCameras().Select(camera => (object)SerializeCamera(camera)).ToList() },
                        { "virtualCameras", FindVirtualCameras().Cast<object>().ToList() }
                    };

                case "get":
                    return SerializeCamera(FindCamera(target));

                case "set":
                    var camera = FindCamera(target);
                    ApplyCameraSettings(camera, settings);
                    EditorUtility.SetDirty(camera);
                    EditorSceneManager.MarkSceneDirty(camera.gameObject.scene);
                    return SerializeCamera(camera);

                case "create":
                    var go = new GameObject(name);
                    Undo.RegisterCreatedObjectUndo(go, $"Create camera: {name}");
                    var newCamera = go.AddComponent<Camera>();
                    ApplyCameraSettings(newCamera, settings);
                    EditorSceneManager.MarkSceneDirty(go.scene);
                    return SerializeCamera(newCamera);

                case "delete":
                    var existing = FindCamera(target);
                    string path = GameObjectCommands.GetGameObjectPath(existing.gameObject);
                    Undo.DestroyObjectImmediate(existing.gameObject);
                    return new Dictionary<string, object>
                    {
                        { "deleted", true },
                        { "target", path }
                    };

                case "attachCinemachineBrain":
                    var host = FindCamera(target);
                    return AttachCinemachineBrain(host.gameObject);

                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported camera action: {action}");
            }
        }

        private static object GraphicsManageCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            var settings = GetNestedDictionary(@params, "settings");

            switch (action)
            {
                case "get":
                    return GetGraphicsSnapshot();
                case "set":
                    ApplyGraphicsSettings(settings);
                    return GetGraphicsSnapshot();
                case "bakeLighting":
                    Lightmapping.BakeAsync();
                    return new Dictionary<string, object>
                    {
                        { "started", true },
                        { "isRunning", Lightmapping.isRunning },
                        { "snapshot", GetGraphicsSnapshot() }
                    };
                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported graphics action: {action}");
            }
        }

        private static object ImportSettingsManageCommand(Dictionary<string, object> @params)
        {
            string action = GameObjectCommands.GetString(@params, "action", "get");
            string assetPath = GameObjectCommands.GetString(@params, "assetPath");
            if (string.IsNullOrEmpty(assetPath))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "assetPath is required");
            }

            var importer = AssetImporter.GetAtPath(assetPath);
            if (importer == null)
            {
                throw new JsonRpcException(ErrorCode.AssetNotFound, $"Importer not found for asset path: {assetPath}");
            }

            switch (action)
            {
                case "get":
                    return SerializeImporter(importer, assetPath);
                case "set":
                    ApplyImporterSettings(importer, GetNestedDictionary(@params, "settings"));
                    importer.SaveAndReimport();
                    return SerializeImporter(importer, assetPath);
                case "reimport":
                    importer.SaveAndReimport();
                    return new Dictionary<string, object>
                    {
                        { "reimported", true },
                        { "assetPath", assetPath },
                        { "settings", SerializeImporter(importer, assetPath) }
                    };
                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported import settings action: {action}");
            }
        }

        private static object AddressablesManageCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.Addressables.AddressablesCommands, StradaMcp.Editor.Addressables",
                "Manage",
                @params,
                "unity-addressables");
        }

        private static IEnumerable<GameObject> FindCanvasRoots(bool includeInactive)
        {
            return Resources.FindObjectsOfTypeAll<Canvas>()
                .Where(canvas => canvas != null && canvas.gameObject != null && canvas.gameObject.scene.IsValid() && canvas.gameObject.scene.isLoaded)
                .Select(canvas => canvas.gameObject)
                .Where(go => includeInactive || go.activeInHierarchy)
                .Distinct();
        }

        private static IEnumerable<UIDocument> FindUiDocuments(bool includeInactive)
        {
            return Resources.FindObjectsOfTypeAll<UIDocument>()
                .Where(document => document != null && document.gameObject != null && document.gameObject.scene.IsValid() && document.gameObject.scene.isLoaded)
                .Where(document => includeInactive || document.gameObject.activeInHierarchy);
        }

        private static bool TryFindUguiTarget(string target, out GameObject gameObject)
        {
            gameObject = null;
            try
            {
                gameObject = GameObjectCommands.FindGameObject(target);
                return gameObject != null && IsUiGameObject(gameObject);
            }
            catch
            {
                return false;
            }
        }

        private static bool TryFindVisualElement(string target, out UIDocument document, out VisualElement element, out string elementPath)
        {
            document = null;
            element = null;
            elementPath = null;

            foreach (var uiDocument in FindUiDocuments(includeInactive: true))
            {
                if (uiDocument.rootVisualElement == null)
                {
                    continue;
                }

                string documentPath = $"/{uiDocument.gameObject.name}";
                if (TryFindVisualElementRecursive(uiDocument.rootVisualElement, target, documentPath, out var foundElement, out var foundPath))
                {
                    document = uiDocument;
                    element = foundElement;
                    elementPath = foundPath;
                    return true;
                }
            }

            return false;
        }

        private static bool TryFindVisualElementRecursive(VisualElement current, string target, string currentPath, out VisualElement element, out string elementPath)
        {
            string currentName = string.IsNullOrEmpty(current.name) ? current.GetType().Name : current.name;
            string nextPath = currentPath == "/"
                ? $"/{currentName}"
                : $"{currentPath}/{currentName}";

            if (string.Equals(current.name, target, StringComparison.OrdinalIgnoreCase)
                || string.Equals(nextPath, target, StringComparison.OrdinalIgnoreCase)
                || string.Equals(currentName, target, StringComparison.OrdinalIgnoreCase))
            {
                element = current;
                elementPath = nextPath;
                return true;
            }

            for (int i = 0; i < current.hierarchy.childCount; i++)
            {
                if (TryFindVisualElementRecursive(current.hierarchy.ElementAt(i), target, nextPath, out element, out elementPath))
                {
                    return true;
                }
            }

            element = null;
            elementPath = null;
            return false;
        }

        private static object SerializeUguiElement(GameObject gameObject, int depth, int maxDepth, bool includeInactive, bool includeComponents)
        {
            var payload = new Dictionary<string, object>
            {
                { "system", "ugui" },
                { "name", gameObject.name },
                { "path", GameObjectCommands.GetGameObjectPath(gameObject) },
                { "instanceId", gameObject.GetInstanceID() },
                { "active", gameObject.activeSelf },
                { "activeInHierarchy", gameObject.activeInHierarchy },
                { "type", GetPrimaryUiType(gameObject) },
                { "interactable", TryGetInteractable(gameObject) },
                { "text", TryGetText(gameObject) },
                { "value", TryGetValue(gameObject) }
            };

            if (includeComponents)
            {
                payload["components"] = gameObject.GetComponents<Component>()
                    .Where(component => component != null)
                    .Select(component => (object)component.GetType().Name)
                    .ToList();
            }

            if (depth < maxDepth)
            {
                var children = new List<object>();
                for (int i = 0; i < gameObject.transform.childCount; i++)
                {
                    var child = gameObject.transform.GetChild(i).gameObject;
                    if (!includeInactive && !child.activeInHierarchy)
                    {
                        continue;
                    }

                    if (IsUiGameObject(child))
                    {
                        children.Add(SerializeUguiElement(child, depth + 1, maxDepth, includeInactive, includeComponents));
                    }
                }

                payload["children"] = children;
            }

            return payload;
        }

        private static object SerializeVisualElement(UIDocument document, VisualElement element, string path, int depth, int maxDepth)
        {
            var payload = new Dictionary<string, object>
            {
                { "system", "uitoolkit" },
                { "document", document.gameObject.name },
                { "name", string.IsNullOrEmpty(element.name) ? element.GetType().Name : element.name },
                { "path", path },
                { "type", element.GetType().Name },
                { "visible", element.visible },
                { "enabled", element.enabledInHierarchy },
                { "classes", element.GetClasses().Cast<object>().ToList() },
                { "bindingPath", GetMemberValue(element, "bindingPath") },
                { "text", TryGetToolkitText(element) },
                { "value", TryGetToolkitValue(element) }
            };

            if (depth < maxDepth)
            {
                var children = new List<object>();
                for (int i = 0; i < element.hierarchy.childCount; i++)
                {
                    var child = element.hierarchy.ElementAt(i);
                    string childName = string.IsNullOrEmpty(child.name) ? child.GetType().Name : child.name;
                    children.Add(SerializeVisualElement(document, child, $"{path}/{childName}", depth + 1, maxDepth));
                }
                payload["children"] = children;
            }

            return payload;
        }

        private static object ApplyUguiAction(GameObject gameObject, string action, Dictionary<string, object> @params, string direction)
        {
            switch (action)
            {
                case "click":
                case "submit":
                    if (TryInvokeButton(gameObject))
                    {
                        return BuildUiActionResult("ugui", gameObject, action, true, null);
                    }

                    if (TrySetToggle(gameObject, @params.ContainsKey("value") ? @params["value"] : null))
                    {
                        return BuildUiActionResult("ugui", gameObject, action, true, TryGetValue(gameObject));
                    }

                    throw new JsonRpcException(ErrorCode.ComponentNotFound, $"No clickable UI component found on {gameObject.name}");

                case "toggle":
                    if (!TrySetToggle(gameObject, @params.ContainsKey("value") ? @params["value"] : null))
                    {
                        throw new JsonRpcException(ErrorCode.ComponentNotFound, $"No toggle component found on {gameObject.name}");
                    }
                    return BuildUiActionResult("ugui", gameObject, action, true, TryGetValue(gameObject));

                case "setText":
                    if (!TrySetText(gameObject, GameObjectCommands.GetString(@params, "value", string.Empty)))
                    {
                        throw new JsonRpcException(ErrorCode.ComponentNotFound, $"No text input component found on {gameObject.name}");
                    }
                    return BuildUiActionResult("ugui", gameObject, action, true, TryGetText(gameObject));

                case "select":
                    if (!TrySelectOption(gameObject, @params.ContainsKey("value") ? @params["value"] : null))
                    {
                        FocusSelectable(gameObject);
                    }
                    return BuildUiActionResult("ugui", gameObject, action, true, TryGetValue(gameObject));

                case "dragSlider":
                    if (!TrySetSlider(gameObject, @params.ContainsKey("value") ? @params["value"] : null))
                    {
                        throw new JsonRpcException(ErrorCode.ComponentNotFound, $"No slider component found on {gameObject.name}");
                    }
                    return BuildUiActionResult("ugui", gameObject, action, true, TryGetValue(gameObject));

                case "navigate":
                    string targetPath = NavigateSelectable(gameObject, direction);
                    return new Dictionary<string, object>
                    {
                        { "system", "ugui" },
                        { "target", GameObjectCommands.GetGameObjectPath(gameObject) },
                        { "action", action },
                        { "direction", direction },
                        { "selectedTarget", targetPath }
                    };

                case "focus":
                    FocusSelectable(gameObject);
                    return BuildUiActionResult("ugui", gameObject, action, true, null);

                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported UI action: {action}");
            }
        }

        private static object ApplyToolkitAction(UIDocument document, VisualElement element, string path, string action, Dictionary<string, object> @params, string direction)
        {
            switch (action)
            {
                case "focus":
                    element.Focus();
                    return BuildToolkitActionResult(document, element, path, action, true, null);

                case "setText":
                    if (!TrySetToolkitValue(element, GameObjectCommands.GetString(@params, "value", string.Empty)))
                    {
                        throw new JsonRpcException(ErrorCode.ComponentNotFound, $"UI Toolkit element does not expose a writable value: {element.GetType().Name}");
                    }
                    return BuildToolkitActionResult(document, element, path, action, true, TryGetToolkitValue(element));

                case "toggle":
                case "select":
                case "dragSlider":
                    if (!TrySetToolkitValue(element, @params.ContainsKey("value") ? @params["value"] : null))
                    {
                        throw new JsonRpcException(ErrorCode.ComponentNotFound, $"UI Toolkit element does not expose a writable value: {element.GetType().Name}");
                    }
                    return BuildToolkitActionResult(document, element, path, action, true, TryGetToolkitValue(element));

                case "click":
                case "submit":
                    if (!TryInvokeToolkitClick(element))
                    {
                        throw new JsonRpcException(ErrorCode.ComponentNotFound, $"UI Toolkit element does not expose a clickable action: {element.GetType().Name}");
                    }
                    return BuildToolkitActionResult(document, element, path, action, true, null);

                case "navigate":
                    element.Focus();
                    return new Dictionary<string, object>
                    {
                        { "system", "uitoolkit" },
                        { "document", document.gameObject.name },
                        { "path", path },
                        { "action", action },
                        { "direction", direction },
                        { "focused", true }
                    };

                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported UI Toolkit action: {action}");
            }
        }

        private static object GetGraphicsSnapshot()
        {
            return new Dictionary<string, object>
            {
                { "renderPipeline", GetRenderPipelineSnapshot() },
                {
                    "quality",
                    new Dictionary<string, object>
                    {
                        { "currentLevel", QualitySettings.names.ElementAtOrDefault(QualitySettings.GetQualityLevel()) ?? "Unknown" },
                        { "levels", QualitySettings.names.Cast<object>().ToList() },
                        { "shadowDistance", QualitySettings.shadowDistance },
                        { "antiAliasing", QualitySettings.antiAliasing },
                        { "vSyncCount", QualitySettings.vSyncCount },
                        { "pixelLightCount", QualitySettings.pixelLightCount }
                    }
                },
                {
                    "renderSettings",
                    new Dictionary<string, object>
                    {
                        { "fog", RenderSettings.fog },
                        { "fogColor", SerializeColor(RenderSettings.fogColor) },
                        { "fogDensity", RenderSettings.fogDensity },
                        { "ambientIntensity", RenderSettings.ambientIntensity },
                        { "ambientMode", RenderSettings.ambientMode.ToString() }
                    }
                },
                {
                    "player",
                    new Dictionary<string, object>
                    {
                        { "colorSpace", PlayerSettings.colorSpace.ToString() }
                    }
                },
                {
                    "lightmapping",
                    new Dictionary<string, object>
                    {
                        { "isRunning", Lightmapping.isRunning },
                        { "realtimeGI", GetStaticProperty("UnityEditor.Lightmapping, UnityEditor", "realtimeGI") },
                        { "bakedGI", GetStaticProperty("UnityEditor.Lightmapping, UnityEditor", "bakedGI") },
                        { "workflowMode", GetStaticProperty("UnityEditor.Lightmapping, UnityEditor", "giWorkflowMode")?.ToString() }
                    }
                }
            };
        }

        private static void ApplyGraphicsSettings(Dictionary<string, object> settings)
        {
            if (settings == null)
            {
                return;
            }

            if (settings.TryGetValue("renderPipelineAssetPath", out object renderPipelineAssetPath) && renderPipelineAssetPath != null)
            {
                SetRenderPipeline(renderPipelineAssetPath.ToString());
            }

            if (settings.TryGetValue("fog", out object fog))
            {
                RenderSettings.fog = Convert.ToBoolean(fog);
            }

            if (settings.TryGetValue("fogDensity", out object fogDensity))
            {
                RenderSettings.fogDensity = ToFloat(fogDensity);
            }

            if (settings.TryGetValue("fogColor", out object fogColor) && fogColor is Dictionary<string, object> fogColorDict)
            {
                RenderSettings.fogColor = ParseColor(fogColorDict, RenderSettings.fogColor);
            }

            if (settings.TryGetValue("ambientIntensity", out object ambientIntensity))
            {
                RenderSettings.ambientIntensity = ToFloat(ambientIntensity);
            }

            if (settings.TryGetValue("shadowDistance", out object shadowDistance))
            {
                QualitySettings.shadowDistance = ToFloat(shadowDistance);
            }

            if (settings.TryGetValue("antiAliasing", out object antiAliasing))
            {
                QualitySettings.antiAliasing = Convert.ToInt32(antiAliasing);
            }

            if (settings.TryGetValue("vSyncCount", out object vSyncCount))
            {
                QualitySettings.vSyncCount = Convert.ToInt32(vSyncCount);
            }

            if (settings.TryGetValue("pixelLightCount", out object pixelLightCount))
            {
                QualitySettings.pixelLightCount = Convert.ToInt32(pixelLightCount);
            }

            if (settings.TryGetValue("activeQualityLevel", out object activeQualityLevel) && activeQualityLevel != null)
            {
                if (activeQualityLevel is string qualityName)
                {
                    int index = Array.IndexOf(QualitySettings.names, qualityName);
                    if (index >= 0)
                    {
                        QualitySettings.SetQualityLevel(index, true);
                    }
                }
                else
                {
                    QualitySettings.SetQualityLevel(Convert.ToInt32(activeQualityLevel), true);
                }
            }

            if (settings.TryGetValue("realtimeGI", out object realtimeGI))
            {
                SetStaticProperty("UnityEditor.Lightmapping, UnityEditor", "realtimeGI", Convert.ToBoolean(realtimeGI));
            }

            if (settings.TryGetValue("bakedGI", out object bakedGI))
            {
                SetStaticProperty("UnityEditor.Lightmapping, UnityEditor", "bakedGI", Convert.ToBoolean(bakedGI));
            }
        }

        private static object SerializeImporter(AssetImporter importer, string assetPath)
        {
            var payload = new Dictionary<string, object>
            {
                { "assetPath", assetPath },
                { "importerType", importer.GetType().Name },
                { "assetBundleName", importer.assetBundleName },
                { "userData", importer.userData }
            };

            if (importer is TextureImporter textureImporter)
            {
                payload["kind"] = "texture";
                payload["settings"] = new Dictionary<string, object>
                {
                    { "textureType", textureImporter.textureType.ToString() },
                    { "maxTextureSize", textureImporter.maxTextureSize },
                    { "textureCompression", textureImporter.textureCompression.ToString() },
                    { "sRGBTexture", textureImporter.sRGBTexture },
                    { "mipmapEnabled", textureImporter.mipmapEnabled },
                    { "alphaIsTransparency", textureImporter.alphaIsTransparency },
                    { "isReadable", textureImporter.isReadable },
                    { "wrapMode", textureImporter.wrapMode.ToString() }
                };
            }
            else if (importer is ModelImporter modelImporter)
            {
                payload["kind"] = "model";
                payload["settings"] = new Dictionary<string, object>
                {
                    { "globalScale", modelImporter.globalScale },
                    { "meshCompression", modelImporter.meshCompression.ToString() },
                    { "isReadable", modelImporter.isReadable },
                    { "importBlendShapes", modelImporter.importBlendShapes },
                    { "importCameras", modelImporter.importCameras },
                    { "importLights", modelImporter.importLights },
                    { "materialImportMode", modelImporter.materialImportMode.ToString() }
                };
            }
            else if (importer is AudioImporter audioImporter)
            {
                var sampleSettings = audioImporter.defaultSampleSettings;
                payload["kind"] = "audio";
                payload["settings"] = new Dictionary<string, object>
                {
                    { "forceToMono", audioImporter.forceToMono },
                    { "loadInBackground", audioImporter.loadInBackground },
                    { "preloadAudioData", GetMemberValue(audioImporter, "preloadAudioData") },
                    { "compressionFormat", sampleSettings.compressionFormat.ToString() },
                    { "loadType", sampleSettings.loadType.ToString() },
                    { "quality", sampleSettings.quality },
                    { "sampleRateSetting", sampleSettings.sampleRateSetting.ToString() }
                };
            }
            else
            {
                payload["kind"] = "generic";
            }

            return payload;
        }

        private static void ApplyImporterSettings(AssetImporter importer, Dictionary<string, object> settings)
        {
            if (settings == null)
            {
                return;
            }

            if (settings.TryGetValue("assetBundleName", out object assetBundleName) && assetBundleName != null)
            {
                importer.assetBundleName = assetBundleName.ToString();
            }

            if (settings.TryGetValue("userData", out object userData) && userData != null)
            {
                importer.userData = userData.ToString();
            }

            if (importer is TextureImporter textureImporter)
            {
                if (settings.TryGetValue("maxTextureSize", out object maxTextureSize))
                    textureImporter.maxTextureSize = Convert.ToInt32(maxTextureSize);
                if (settings.TryGetValue("sRGBTexture", out object sRgbTexture))
                    textureImporter.sRGBTexture = Convert.ToBoolean(sRgbTexture);
                if (settings.TryGetValue("mipmapEnabled", out object mipmapEnabled))
                    textureImporter.mipmapEnabled = Convert.ToBoolean(mipmapEnabled);
                if (settings.TryGetValue("alphaIsTransparency", out object alphaIsTransparency))
                    textureImporter.alphaIsTransparency = Convert.ToBoolean(alphaIsTransparency);
                if (settings.TryGetValue("isReadable", out object isReadable))
                    textureImporter.isReadable = Convert.ToBoolean(isReadable);
                if (settings.TryGetValue("textureCompression", out object compression)
                    && Enum.TryParse(compression.ToString(), true, out TextureImporterCompression parsedCompression))
                    textureImporter.textureCompression = parsedCompression;
                if (settings.TryGetValue("textureType", out object textureType)
                    && Enum.TryParse(textureType.ToString(), true, out TextureImporterType parsedTextureType))
                    textureImporter.textureType = parsedTextureType;
            }
            else if (importer is ModelImporter modelImporter)
            {
                if (settings.TryGetValue("globalScale", out object globalScale))
                    modelImporter.globalScale = ToFloat(globalScale);
                if (settings.TryGetValue("isReadable", out object isReadable))
                    modelImporter.isReadable = Convert.ToBoolean(isReadable);
                if (settings.TryGetValue("importBlendShapes", out object importBlendShapes))
                    modelImporter.importBlendShapes = Convert.ToBoolean(importBlendShapes);
                if (settings.TryGetValue("importCameras", out object importCameras))
                    modelImporter.importCameras = Convert.ToBoolean(importCameras);
                if (settings.TryGetValue("importLights", out object importLights))
                    modelImporter.importLights = Convert.ToBoolean(importLights);
                if (settings.TryGetValue("meshCompression", out object meshCompression)
                    && Enum.TryParse(meshCompression.ToString(), true, out ModelImporterMeshCompression parsedCompression))
                    modelImporter.meshCompression = parsedCompression;
                if (settings.TryGetValue("materialImportMode", out object materialImportMode)
                    && Enum.TryParse(materialImportMode.ToString(), true, out ModelImporterMaterialImportMode parsedMaterialImportMode))
                    modelImporter.materialImportMode = parsedMaterialImportMode;
            }
            else if (importer is AudioImporter audioImporter)
            {
                var sampleSettings = audioImporter.defaultSampleSettings;
                if (settings.TryGetValue("forceToMono", out object forceToMono))
                    audioImporter.forceToMono = Convert.ToBoolean(forceToMono);
                if (settings.TryGetValue("loadInBackground", out object loadInBackground))
                    audioImporter.loadInBackground = Convert.ToBoolean(loadInBackground);
                if (settings.TryGetValue("preloadAudioData", out object preloadAudioData))
                    SetMemberValue(audioImporter, "preloadAudioData", Convert.ToBoolean(preloadAudioData));
                if (settings.TryGetValue("quality", out object quality))
                    sampleSettings.quality = ToFloat(quality);
                if (settings.TryGetValue("compressionFormat", out object compressionFormat)
                    && Enum.TryParse(compressionFormat.ToString(), true, out AudioCompressionFormat parsedCompressionFormat))
                    sampleSettings.compressionFormat = parsedCompressionFormat;
                if (settings.TryGetValue("loadType", out object loadType)
                    && Enum.TryParse(loadType.ToString(), true, out AudioClipLoadType parsedLoadType))
                    sampleSettings.loadType = parsedLoadType;
                if (settings.TryGetValue("sampleRateSetting", out object sampleRateSetting)
                    && Enum.TryParse(sampleRateSetting.ToString(), true, out AudioSampleRateSetting parsedSampleRateSetting))
                    sampleSettings.sampleRateSetting = parsedSampleRateSetting;
                audioImporter.defaultSampleSettings = sampleSettings;
            }
        }

        private static IEnumerable<Camera> FindSceneCameras()
        {
            return Resources.FindObjectsOfTypeAll<Camera>()
                .Where(camera => camera != null && camera.gameObject != null && camera.gameObject.scene.IsValid() && camera.gameObject.scene.isLoaded)
                .Distinct();
        }

        private static Camera FindCamera(string target)
        {
            if (string.IsNullOrEmpty(target))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");
            }

            foreach (var camera in FindSceneCameras())
            {
                if (string.Equals(camera.name, target, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(GameObjectCommands.GetGameObjectPath(camera.gameObject), target, StringComparison.OrdinalIgnoreCase))
                {
                    return camera;
                }
            }

            var gameObject = GameObjectCommands.FindGameObject(target);
            var attachedCamera = gameObject.GetComponent<Camera>();
            if (attachedCamera == null)
            {
                throw new JsonRpcException(ErrorCode.ComponentNotFound, $"No Camera component found on target: {target}");
            }

            return attachedCamera;
        }

        private static object SerializeCamera(Camera camera)
        {
            return new Dictionary<string, object>
            {
                { "name", camera.name },
                { "path", GameObjectCommands.GetGameObjectPath(camera.gameObject) },
                { "instanceId", camera.GetInstanceID() },
                { "enabled", camera.enabled },
                { "main", camera == Camera.main },
                { "fieldOfView", camera.fieldOfView },
                { "orthographic", camera.orthographic },
                { "orthographicSize", camera.orthographicSize },
                { "nearClipPlane", camera.nearClipPlane },
                { "farClipPlane", camera.farClipPlane },
                { "clearFlags", camera.clearFlags.ToString() },
                { "backgroundColor", SerializeColor(camera.backgroundColor) },
                { "depth", camera.depth },
                { "tag", camera.tag },
                { "position", SerializeVector3(camera.transform.position) },
                { "rotation", SerializeVector3(camera.transform.eulerAngles) },
                { "hasCinemachineBrain", HasCinemachineBrain(camera.gameObject) }
            };
        }

        private static void ApplyCameraSettings(Camera camera, Dictionary<string, object> settings)
        {
            if (camera == null || settings == null)
            {
                return;
            }

            if (settings.TryGetValue("enabled", out object enabled))
                camera.enabled = Convert.ToBoolean(enabled);
            if (settings.TryGetValue("fieldOfView", out object fieldOfView))
                camera.fieldOfView = ToFloat(fieldOfView);
            if (settings.TryGetValue("orthographic", out object orthographic))
                camera.orthographic = Convert.ToBoolean(orthographic);
            if (settings.TryGetValue("orthographicSize", out object orthographicSize))
                camera.orthographicSize = ToFloat(orthographicSize);
            if (settings.TryGetValue("nearClipPlane", out object nearClipPlane))
                camera.nearClipPlane = ToFloat(nearClipPlane);
            if (settings.TryGetValue("farClipPlane", out object farClipPlane))
                camera.farClipPlane = ToFloat(farClipPlane);
            if (settings.TryGetValue("depth", out object depth))
                camera.depth = ToFloat(depth);
            if (settings.TryGetValue("tag", out object tag) && tag != null)
                camera.tag = tag.ToString();
            if (settings.TryGetValue("clearFlags", out object clearFlags)
                && Enum.TryParse(clearFlags.ToString(), true, out CameraClearFlags parsedClearFlags))
                camera.clearFlags = parsedClearFlags;
            if (settings.TryGetValue("backgroundColor", out object backgroundColor) && backgroundColor is Dictionary<string, object> colorDict)
                camera.backgroundColor = ParseColor(colorDict, camera.backgroundColor);

            if (GameObjectCommands.TryGetVector3(settings, "position", out Vector3 position))
                camera.transform.position = position;
            if (GameObjectCommands.TryGetVector3(settings, "rotation", out Vector3 rotation))
                camera.transform.eulerAngles = rotation;
        }

        private static object AttachCinemachineBrain(GameObject gameObject)
        {
            var brainType = FindTypeByNames("Cinemachine.CinemachineBrain", "Unity.Cinemachine.CinemachineBrain");
            if (brainType == null)
            {
                return OptionalCommandRouter.Unavailable("cinemachine", "Cinemachine package is not installed.");
            }

            var existing = gameObject.GetComponent(brainType);
            if (existing == null)
            {
                Undo.AddComponent(gameObject, brainType);
            }

            return new Dictionary<string, object>
            {
                { "attached", true },
                { "camera", GameObjectCommands.GetGameObjectPath(gameObject) },
                { "brainType", brainType.FullName }
            };
        }

        private static IEnumerable<object> FindVirtualCameras()
        {
            var virtualCameraTypes = new[]
            {
                FindTypeByNames("Cinemachine.CinemachineVirtualCameraBase", "Unity.Cinemachine.CinemachineVirtualCameraBase"),
                FindTypeByNames("Cinemachine.CinemachineCamera", "Unity.Cinemachine.CinemachineCamera"),
                FindTypeByNames("Cinemachine.CinemachineVirtualCamera", "Unity.Cinemachine.CinemachineVirtualCamera")
            }
            .Where(type => type != null)
            .Distinct()
            .ToList();

            var cameras = new List<object>();
            foreach (var type in virtualCameraTypes)
            {
                foreach (var component in Resources.FindObjectsOfTypeAll(type).Cast<Component>())
                {
                    if (component == null || component.gameObject == null || !component.gameObject.scene.isLoaded)
                    {
                        continue;
                    }

                    cameras.Add(new Dictionary<string, object>
                    {
                        { "name", component.name },
                        { "path", GameObjectCommands.GetGameObjectPath(component.gameObject) },
                        { "type", type.Name }
                    });
                }
            }

            return cameras;
        }

        private static bool IsUiGameObject(GameObject gameObject)
        {
            if (gameObject == null)
            {
                return false;
            }

            if (gameObject.GetComponent<RectTransform>() != null)
            {
                return true;
            }

            return FindUiComponent(gameObject,
                UguiButtonTypes
                    .Concat(UguiToggleTypes)
                    .Concat(UguiSliderTypes)
                    .Concat(UguiDropdownTypes)
                    .Concat(UguiInputTypes)
                    .Concat(UguiTextTypes)
                    .ToArray()) != null;
        }

        private static string GetPrimaryUiType(GameObject gameObject)
        {
            if (FindUiComponent(gameObject, UguiButtonTypes) != null) return "Button";
            if (FindUiComponent(gameObject, UguiToggleTypes) != null) return "Toggle";
            if (FindUiComponent(gameObject, UguiSliderTypes) != null) return "Slider";
            if (FindUiComponent(gameObject, UguiDropdownTypes) != null) return "Dropdown";
            if (FindUiComponent(gameObject, UguiInputTypes) != null) return "Input";
            if (FindUiComponent(gameObject, UguiTextTypes) != null) return "Text";
            if (gameObject.GetComponent<Canvas>() != null) return "Canvas";
            return "UIElement";
        }

        private static object TryGetInteractable(GameObject gameObject)
        {
            var selectable = FindUiComponent(gameObject, UguiSelectableTypes);
            return selectable != null ? GetMemberValue(selectable, "interactable") : null;
        }

        private static object TryGetText(GameObject gameObject)
        {
            var input = FindUiComponent(gameObject, UguiInputTypes);
            if (input != null)
            {
                return GetMemberValue(input, "text");
            }

            var text = FindUiComponent(gameObject, UguiTextTypes);
            return text != null ? GetMemberValue(text, "text") : null;
        }

        private static object TryGetValue(GameObject gameObject)
        {
            var toggle = FindUiComponent(gameObject, UguiToggleTypes);
            if (toggle != null)
            {
                return GetMemberValue(toggle, "isOn");
            }

            var slider = FindUiComponent(gameObject, UguiSliderTypes);
            if (slider != null)
            {
                return GetMemberValue(slider, "value");
            }

            var dropdown = FindUiComponent(gameObject, UguiDropdownTypes);
            if (dropdown != null)
            {
                return GetMemberValue(dropdown, "value");
            }

            return null;
        }

        private static bool TryInvokeButton(GameObject gameObject)
        {
            var button = FindUiComponent(gameObject, UguiButtonTypes);
            if (button == null)
            {
                return false;
            }

            var onClick = GetMemberValue(button, "onClick");
            if (onClick == null)
            {
                return false;
            }

            InvokeMember(onClick, "Invoke");
            return true;
        }

        private static bool TrySetToggle(GameObject gameObject, object value)
        {
            var toggle = FindUiComponent(gameObject, UguiToggleTypes);
            if (toggle == null)
            {
                return false;
            }

            bool current = Convert.ToBoolean(GetMemberValue(toggle, "isOn") ?? false);
            SetMemberValue(toggle, "isOn", value != null ? Convert.ToBoolean(value) : !current);
            return true;
        }

        private static bool TrySetText(GameObject gameObject, string value)
        {
            var input = FindUiComponent(gameObject, UguiInputTypes);
            if (input != null)
            {
                SetMemberValue(input, "text", value);
                return true;
            }

            var text = FindUiComponent(gameObject, UguiTextTypes);
            if (text != null)
            {
                SetMemberValue(text, "text", value);
                return true;
            }

            return false;
        }

        private static bool TrySelectOption(GameObject gameObject, object value)
        {
            var dropdown = FindUiComponent(gameObject, UguiDropdownTypes);
            if (dropdown == null)
            {
                return false;
            }

            if (value == null)
            {
                return false;
            }

            int optionIndex = value is string optionName
                ? FindDropdownOptionIndex(dropdown, optionName)
                : Convert.ToInt32(value);
            if (optionIndex < 0)
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, $"Dropdown option not found: {value}");
            }

            SetMemberValue(dropdown, "value", optionIndex);
            InvokeOptional(dropdown, "RefreshShownValue");
            return true;
        }

        private static bool TrySetSlider(GameObject gameObject, object value)
        {
            var slider = FindUiComponent(gameObject, UguiSliderTypes);
            if (slider == null)
            {
                return false;
            }

            SetMemberValue(slider, "value", value != null ? Convert.ToSingle(value) : 0f);
            return true;
        }

        private static void FocusSelectable(GameObject gameObject)
        {
            var selectable = FindUiComponent(gameObject, UguiSelectableTypes);
            if (selectable == null)
            {
                return;
            }

            InvokeOptional(selectable, "Select");
            Selection.activeGameObject = gameObject;
        }

        private static string NavigateSelectable(GameObject gameObject, string direction)
        {
            var selectable = FindUiComponent(gameObject, UguiSelectableTypes);
            if (selectable == null)
            {
                return GameObjectCommands.GetGameObjectPath(gameObject);
            }

            string methodName = (direction ?? "next").ToLowerInvariant() switch
            {
                "up" => "FindSelectableOnUp",
                "down" => "FindSelectableOnDown",
                "left" => "FindSelectableOnLeft",
                "right" => "FindSelectableOnRight",
                "previous" => "FindSelectableOnLeft",
                _ => "FindSelectableOnRight"
            };

            var next = InvokeOptional(selectable, methodName) as Component;
            if (next != null)
            {
                InvokeOptional(next, "Select");
                if (next.gameObject != null)
                {
                    Selection.activeGameObject = next.gameObject;
                    return GameObjectCommands.GetGameObjectPath(next.gameObject);
                }
            }

            FocusSelectable(gameObject);
            return GameObjectCommands.GetGameObjectPath(gameObject);
        }

        private static Component FindUiComponent(GameObject gameObject, params string[] typeNames)
        {
            foreach (var typeName in typeNames)
            {
                var type = FindTypeByNames(typeName);
                if (type == null)
                {
                    continue;
                }

                var component = gameObject.GetComponent(type);
                if (component != null)
                {
                    return component;
                }
            }

            return null;
        }

        private static string FindDropdownOptionIndexDebugName(object option) =>
            GetMemberValue(option, "text")?.ToString() ?? option?.ToString() ?? string.Empty;

        private static int FindDropdownOptionIndex(Component dropdown, string optionName)
        {
            if (!(GetMemberValue(dropdown, "options") is IList options))
            {
                return -1;
            }

            for (int i = 0; i < options.Count; i++)
            {
                if (string.Equals(FindDropdownOptionIndexDebugName(options[i]), optionName, StringComparison.OrdinalIgnoreCase))
                {
                    return i;
                }
            }

            return -1;
        }

        private static object BuildUiActionResult(string system, GameObject gameObject, string action, bool performed, object value)
        {
            return new Dictionary<string, object>
            {
                { "system", system },
                { "path", GameObjectCommands.GetGameObjectPath(gameObject) },
                { "action", action },
                { "performed", performed },
                { "value", value }
            };
        }

        private static object BuildToolkitActionResult(UIDocument document, VisualElement element, string path, string action, bool performed, object value)
        {
            return new Dictionary<string, object>
            {
                { "system", "uitoolkit" },
                { "document", document.gameObject.name },
                { "path", path },
                { "elementType", element.GetType().Name },
                { "action", action },
                { "performed", performed },
                { "value", value }
            };
        }

        private static string FindFocusedVisualElementTarget()
        {
            foreach (var document in FindUiDocuments(includeInactive: true))
            {
                var panel = document.rootVisualElement?.panel;
                var focusedElement = panel?.focusController?.focusedElement as VisualElement;
                if (focusedElement != null && TryFindVisualElementRecursive(document.rootVisualElement, focusedElement.name, $"/{document.gameObject.name}", out _, out string elementPath))
                {
                    return elementPath;
                }
            }

            return null;
        }

        private static object TryGetToolkitText(VisualElement element)
        {
            return GetMemberValue(element, "text");
        }

        private static object TryGetToolkitValue(VisualElement element)
        {
            return GetMemberValue(element, "value");
        }

        private static bool TrySetToolkitValue(VisualElement element, object value)
        {
            if (SetMemberValue(element, "value", value))
            {
                return true;
            }

            var method = element.GetType().GetMethod("SetValueWithoutNotify", BindingFlags.Public | BindingFlags.Instance);
            if (method != null)
            {
                method.Invoke(element, new[] { value });
                return true;
            }

            return false;
        }

        private static bool TryInvokeToolkitClick(VisualElement element)
        {
            var clickable = GetMemberValue(element, "clickable");
            if (clickable != null)
            {
                if (InvokeOptional(clickable, "SimulateSingleClick") != null)
                {
                    return true;
                }

                if (InvokeOptional(clickable, "Invoke") != null)
                {
                    return true;
                }

                var clickedMember = clickable.GetType().GetField("clicked", BindingFlags.NonPublic | BindingFlags.Instance)
                    ?? clickable.GetType().GetField("clicked", BindingFlags.Public | BindingFlags.Instance);
                if (clickedMember?.GetValue(clickable) is Delegate callback)
                {
                    callback.DynamicInvoke();
                    return true;
                }
            }

            if (element is Button button)
            {
                var clickedEvent = button.GetType().GetField("clicked", BindingFlags.NonPublic | BindingFlags.Instance);
                if (clickedEvent?.GetValue(button) is Delegate delegateValue)
                {
                    delegateValue.DynamicInvoke();
                    return true;
                }
            }

            return false;
        }

        private static object GetRenderPipelineSnapshot()
        {
            var graphicsSettingsType = FindTypeByNames("UnityEngine.Rendering.GraphicsSettings");
            var qualitySettingsType = typeof(QualitySettings);
            var currentPipeline = GetStaticProperty(graphicsSettingsType, "currentRenderPipeline")
                ?? GetStaticProperty(graphicsSettingsType, "renderPipelineAsset")
                ?? GetStaticProperty(graphicsSettingsType, "defaultRenderPipeline");
            var qualityPipeline = qualitySettingsType.GetProperty("renderPipeline", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);

            return new Dictionary<string, object>
            {
                { "active", SerializeAssetReference(currentPipeline as UnityEngine.Object) },
                { "qualityOverride", SerializeAssetReference(qualityPipeline as UnityEngine.Object) }
            };
        }

        private static void SetRenderPipeline(string assetPath)
        {
            var asset = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(assetPath);
            if (asset == null)
            {
                throw new JsonRpcException(ErrorCode.AssetNotFound, $"Render pipeline asset not found: {assetPath}");
            }

            var graphicsSettingsType = FindTypeByNames("UnityEngine.Rendering.GraphicsSettings");
            if (!SetStaticProperty(graphicsSettingsType, "defaultRenderPipeline", asset))
            {
                SetStaticProperty(graphicsSettingsType, "renderPipelineAsset", asset);
            }

            var qualitySettingsProperty = typeof(QualitySettings).GetProperty("renderPipeline", BindingFlags.Public | BindingFlags.Static);
            qualitySettingsProperty?.SetValue(null, asset);
        }

        private static object SerializeAssetReference(UnityEngine.Object asset)
        {
            if (asset == null)
            {
                return null;
            }

            return new Dictionary<string, object>
            {
                { "name", asset.name },
                { "path", AssetDatabase.GetAssetPath(asset) },
                { "type", asset.GetType().Name }
            };
        }

        private static Dictionary<string, object> SerializeColor(Color color)
        {
            return new Dictionary<string, object>
            {
                { "r", color.r },
                { "g", color.g },
                { "b", color.b },
                { "a", color.a }
            };
        }

        private static Dictionary<string, object> SerializeVector3(Vector3 vector)
        {
            return new Dictionary<string, object>
            {
                { "x", vector.x },
                { "y", vector.y },
                { "z", vector.z }
            };
        }

        private static Color ParseColor(Dictionary<string, object> color, Color fallback)
        {
            return new Color(
                GameObjectCommands.GetFloat(color, "r", fallback.r),
                GameObjectCommands.GetFloat(color, "g", fallback.g),
                GameObjectCommands.GetFloat(color, "b", fallback.b),
                GameObjectCommands.GetFloat(color, "a", fallback.a));
        }

        private static bool HasCinemachineBrain(GameObject gameObject)
        {
            return FindTypeByNames("Cinemachine.CinemachineBrain", "Unity.Cinemachine.CinemachineBrain") != null
                && gameObject.GetComponent(FindTypeByNames("Cinemachine.CinemachineBrain", "Unity.Cinemachine.CinemachineBrain")) != null;
        }

        private static Dictionary<string, object> GetNestedDictionary(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out object raw) || raw == null)
            {
                return null;
            }

            return raw as Dictionary<string, object>;
        }

        private static Type FindTypeByNames(params string[] typeNames)
        {
            foreach (var typeName in typeNames)
            {
                foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
                {
                    var type = assembly.GetType(typeName, false, true);
                    if (type != null)
                    {
                        return type;
                    }
                }
            }

            return null;
        }

        private static object GetMemberValue(object target, string memberName)
        {
            if (target == null)
            {
                return null;
            }

            var type = target.GetType();
            var property = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
            if (property != null)
            {
                return property.GetValue(target);
            }

            var field = type.GetField(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
            return field?.GetValue(target);
        }

        private static bool SetMemberValue(object target, string memberName, object value)
        {
            if (target == null)
            {
                return false;
            }

            var type = target.GetType();
            var property = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (property != null && property.CanWrite)
            {
                property.SetValue(target, ConvertForMember(property.PropertyType, value));
                return true;
            }

            var field = type.GetField(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (field != null)
            {
                field.SetValue(target, ConvertForMember(field.FieldType, value));
                return true;
            }

            return false;
        }

        private static object InvokeMember(object target, string methodName, params object[] args)
        {
            var method = FindMethod(target?.GetType(), methodName, args?.Length ?? 0);
            return method?.Invoke(target, args);
        }

        private static object InvokeOptional(object target, string methodName, params object[] args)
        {
            var method = FindMethod(target?.GetType(), methodName, args?.Length ?? 0);
            return method?.Invoke(target, args);
        }

        private static object GetStaticProperty(Type type, string propertyName)
        {
            return type?.GetProperty(propertyName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                ?.GetValue(null);
        }

        private static object GetStaticProperty(string typeName, string propertyName)
        {
            return GetStaticProperty(FindTypeByNames(typeName), propertyName);
        }

        private static bool SetStaticProperty(Type type, string propertyName, object value)
        {
            var property = type?.GetProperty(propertyName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
            if (property == null || !property.CanWrite)
            {
                return false;
            }

            property.SetValue(null, ConvertForMember(property.PropertyType, value));
            return true;
        }

        private static bool SetStaticProperty(string typeName, string propertyName, object value)
        {
            return SetStaticProperty(FindTypeByNames(typeName), propertyName, value);
        }

        private static object ConvertForMember(Type targetType, object value)
        {
            if (value == null)
            {
                return null;
            }

            if (targetType.IsInstanceOfType(value))
            {
                return value;
            }

            if (targetType == typeof(string))
            {
                return value.ToString();
            }

            if (targetType == typeof(bool))
            {
                return Convert.ToBoolean(value);
            }

            if (targetType == typeof(int))
            {
                return Convert.ToInt32(value);
            }

            if (targetType == typeof(float))
            {
                return Convert.ToSingle(value);
            }

            if (targetType == typeof(double))
            {
                return Convert.ToDouble(value);
            }

            if (targetType.IsEnum)
            {
                return Enum.Parse(targetType, value.ToString(), true);
            }

            return value;
        }

        private static float ToFloat(object value)
        {
            if (value == null)
            {
                return 0f;
            }

            if (value is float floatValue) return floatValue;
            if (value is double doubleValue) return (float)doubleValue;
            if (value is int intValue) return intValue;
            if (value is long longValue) return longValue;
            if (float.TryParse(value.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float parsed))
            {
                return parsed;
            }

            return 0f;
        }

        private static MethodInfo FindMethod(Type type, string methodName, int argumentCount)
        {
            return type?
                .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .FirstOrDefault(method =>
                    string.Equals(method.Name, methodName, StringComparison.Ordinal)
                    && method.GetParameters().Length == argumentCount);
        }
    }
}
#endif
