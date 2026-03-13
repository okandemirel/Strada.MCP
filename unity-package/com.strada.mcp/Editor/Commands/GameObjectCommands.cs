#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handlers for GameObject-related JSON-RPC commands.
    /// All destructive operations use the Undo system.
    /// </summary>
    public static class GameObjectCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("gameobject.create", Create);
            dispatcher.RegisterHandler("gameobject.find", Find);
            dispatcher.RegisterHandler("gameobject.modify", Modify);
            dispatcher.RegisterHandler("gameobject.delete", Delete);
            dispatcher.RegisterHandler("gameobject.duplicate", Duplicate);
        }

        /// <summary>
        /// Creates a new GameObject.
        /// Params: name (string), type? ("empty"|"cube"|"sphere"|"capsule"|"cylinder"|"plane"|"quad"|"prefab"),
        ///         prefabPath? (string), position? ([x,y,z]), rotation? ([x,y,z]), scale? ([x,y,z]),
        ///         parent? (string - name of parent)
        /// </summary>
        private static object Create(Dictionary<string, object> @params)
        {
            string name = GetString(@params, "name") ?? "New GameObject";
            string type = GetString(@params, "type") ?? "empty";

            GameObject go;

            if (type == "prefab")
            {
                string prefabPath = GetString(@params, "prefabPath");
                if (string.IsNullOrEmpty(prefabPath))
                    throw new JsonRpcException(ErrorCode.InvalidParams, "prefabPath required for prefab type");

                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
                if (prefab == null)
                    throw new JsonRpcException(ErrorCode.AssetNotFound, $"Prefab not found: {prefabPath}");

                go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                if (go == null)
                    throw new JsonRpcException(ErrorCode.InternalError, "Failed to instantiate prefab");

                Undo.RegisterCreatedObjectUndo(go, $"Create prefab instance: {name}");
            }
            else
            {
                PrimitiveType? primitive = type.ToLowerInvariant() switch
                {
                    "cube" => PrimitiveType.Cube,
                    "sphere" => PrimitiveType.Sphere,
                    "capsule" => PrimitiveType.Capsule,
                    "cylinder" => PrimitiveType.Cylinder,
                    "plane" => PrimitiveType.Plane,
                    "quad" => PrimitiveType.Quad,
                    "empty" => null,
                    _ => null
                };

                if (primitive.HasValue)
                {
                    go = GameObject.CreatePrimitive(primitive.Value);
                    Undo.RegisterCreatedObjectUndo(go, $"Create {type}: {name}");
                }
                else
                {
                    go = new GameObject();
                    Undo.RegisterCreatedObjectUndo(go, $"Create GameObject: {name}");
                }
            }

            go.name = name;

            // Set transform
            if (TryGetVector3(@params, "position", out Vector3 pos))
                go.transform.position = pos;
            if (TryGetVector3(@params, "rotation", out Vector3 rot))
                go.transform.eulerAngles = rot;
            if (TryGetVector3(@params, "scale", out Vector3 scale))
                go.transform.localScale = scale;

            // Set parent
            string parentName = GetString(@params, "parent");
            if (!string.IsNullOrEmpty(parentName))
            {
                var parent = GameObject.Find(parentName);
                if (parent != null)
                {
                    Undo.SetTransformParent(go.transform, parent.transform, $"Set parent of {name}");
                }
            }

            return new Dictionary<string, object>
            {
                { "instanceId", go.GetInstanceID() },
                { "name", go.name },
                { "path", GetGameObjectPath(go) }
            };
        }

        /// <summary>
        /// Finds GameObjects by criteria.
        /// Params: name? (string), tag? (string), layer? (int|string), component? (string), activeOnly? (bool)
        /// </summary>
        private static object Find(Dictionary<string, object> @params)
        {
            string name = GetString(@params, "name");
            string tag = GetString(@params, "tag");
            string component = GetString(@params, "component");
            bool activeOnly = GetBool(@params, "activeOnly", true);

            IEnumerable<GameObject> results;

            if (!string.IsNullOrEmpty(tag))
            {
                try
                {
                    results = GameObject.FindGameObjectsWithTag(tag);
                }
                catch (UnityException)
                {
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Invalid tag: {tag}");
                }
            }
            else
            {
                // Find all objects in scene
                results = Resources.FindObjectsOfTypeAll<GameObject>()
                    .Where(g => g.scene.isLoaded);
            }

            // Filter by name
            if (!string.IsNullOrEmpty(name))
            {
                results = results.Where(g => g.name.Contains(name, StringComparison.OrdinalIgnoreCase));
            }

            // Filter by layer
            if (@params.ContainsKey("layer"))
            {
                int layerValue;
                object layerParam = @params["layer"];
                if (layerParam is string layerName)
                {
                    layerValue = LayerMask.NameToLayer(layerName);
                    if (layerValue < 0)
                        throw new JsonRpcException(ErrorCode.InvalidParams, $"Invalid layer name: {layerName}");
                }
                else
                {
                    layerValue = GetInt(@params, "layer");
                }
                results = results.Where(g => g.layer == layerValue);
            }

            // Filter by component
            if (!string.IsNullOrEmpty(component))
            {
                Type componentType = FindType(component);
                if (componentType != null)
                {
                    results = results.Where(g => g.GetComponent(componentType) != null);
                }
            }

            // Filter active only
            if (activeOnly)
            {
                results = results.Where(g => g.activeInHierarchy);
            }

            var list = results.ToList();
            var output = new List<object>();
            foreach (var go in list)
            {
                output.Add(new Dictionary<string, object>
                {
                    { "instanceId", go.GetInstanceID() },
                    { "name", go.name },
                    { "path", GetGameObjectPath(go) },
                    { "active", go.activeSelf },
                    { "tag", go.tag },
                    { "layer", go.layer }
                });
            }

            return new Dictionary<string, object>
            {
                { "count", output.Count },
                { "objects", output }
            };
        }

        /// <summary>
        /// Modifies an existing GameObject.
        /// Params: target (string - name or path), name? (string), active? (bool), tag? (string),
        ///         layer? (int|string), isStatic? (bool)
        /// </summary>
        private static object Modify(Dictionary<string, object> @params)
        {
            string target = GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject go = FindGameObject(target);

            Undo.RecordObject(go, $"Modify {go.name}");

            if (@params.ContainsKey("name"))
                go.name = GetString(@params, "name");

            if (@params.ContainsKey("active"))
                go.SetActive(GetBool(@params, "active"));

            if (@params.ContainsKey("tag"))
            {
                string tagValue = GetString(@params, "tag");
                try { go.tag = tagValue; }
                catch (UnityException) { throw new JsonRpcException(ErrorCode.InvalidParams, $"Invalid tag: {tagValue}"); }
            }

            if (@params.ContainsKey("layer"))
            {
                object layerParam = @params["layer"];
                if (layerParam is string layerName)
                {
                    int layerIdx = LayerMask.NameToLayer(layerName);
                    if (layerIdx < 0)
                        throw new JsonRpcException(ErrorCode.InvalidParams, $"Invalid layer: {layerName}");
                    go.layer = layerIdx;
                }
                else
                {
                    go.layer = GetInt(@params, "layer");
                }
            }

            if (@params.ContainsKey("isStatic"))
                go.isStatic = GetBool(@params, "isStatic");

            EditorUtility.SetDirty(go);

            return new Dictionary<string, object>
            {
                { "instanceId", go.GetInstanceID() },
                { "name", go.name },
                { "active", go.activeSelf },
                { "tag", go.tag },
                { "layer", go.layer },
                { "isStatic", go.isStatic }
            };
        }

        /// <summary>
        /// Deletes a GameObject with Undo support.
        /// Params: target (string - name or path)
        /// </summary>
        private static object Delete(Dictionary<string, object> @params)
        {
            string target = GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject go = FindGameObject(target);
            string goName = go.name;
            int instanceId = go.GetInstanceID();

            Undo.DestroyObjectImmediate(go);

            return new Dictionary<string, object>
            {
                { "deleted", true },
                { "name", goName },
                { "instanceId", instanceId }
            };
        }

        /// <summary>
        /// Duplicates a GameObject with optional offset.
        /// Params: target (string - name or path), offset? ([x,y,z])
        /// </summary>
        private static object Duplicate(Dictionary<string, object> @params)
        {
            string target = GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject original = FindGameObject(target);

            // Use Selection + Duplicate to get proper Undo support
            GameObject copy = UnityEngine.Object.Instantiate(original);
            copy.name = original.name;
            Undo.RegisterCreatedObjectUndo(copy, $"Duplicate {original.name}");

            // Maintain same parent
            if (original.transform.parent != null)
            {
                Undo.SetTransformParent(copy.transform, original.transform.parent, "Set parent of duplicate");
            }

            // Apply offset
            if (TryGetVector3(@params, "offset", out Vector3 offset))
            {
                copy.transform.position = original.transform.position + offset;
            }

            return new Dictionary<string, object>
            {
                { "instanceId", copy.GetInstanceID() },
                { "name", copy.name },
                { "path", GetGameObjectPath(copy) }
            };
        }

        // --- Helper Methods ---

        internal static GameObject FindGameObject(string target)
        {
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.GameObjectNotFound, "Target name is empty");

            // Try path first (starts with /)
            if (target.StartsWith("/"))
            {
                var go = GameObject.Find(target);
                if (go != null) return go;
            }

            // Try name
            var found = GameObject.Find(target);
            if (found != null) return found;

            // Try instance ID
            if (int.TryParse(target, out int instanceId))
            {
                var obj = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (obj != null) return obj;
            }

            throw new JsonRpcException(ErrorCode.GameObjectNotFound, $"GameObject not found: {target}");
        }

        internal static string GetGameObjectPath(GameObject go)
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

        internal static string GetString(Dictionary<string, object> dict, string key, string defaultValue = null)
        {
            if (dict == null || !dict.TryGetValue(key, out object val) || val == null)
                return defaultValue;
            return val.ToString();
        }

        internal static int GetInt(Dictionary<string, object> dict, string key, int defaultValue = 0)
        {
            if (dict == null || !dict.TryGetValue(key, out object val) || val == null)
                return defaultValue;
            if (val is double d) return (int)d;
            if (val is long l) return (int)l;
            if (val is int i) return i;
            if (int.TryParse(val.ToString(), out int parsed)) return parsed;
            return defaultValue;
        }

        internal static float GetFloat(Dictionary<string, object> dict, string key, float defaultValue = 0f)
        {
            if (dict == null || !dict.TryGetValue(key, out object val) || val == null)
                return defaultValue;
            if (val is double d) return (float)d;
            if (val is float f) return f;
            if (val is int i) return i;
            if (val is long l) return l;
            if (float.TryParse(val.ToString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out float parsed))
                return parsed;
            return defaultValue;
        }

        internal static bool GetBool(Dictionary<string, object> dict, string key, bool defaultValue = false)
        {
            if (dict == null || !dict.TryGetValue(key, out object val) || val == null)
                return defaultValue;
            if (val is bool b) return b;
            if (val is string s) return s.ToLowerInvariant() == "true";
            return defaultValue;
        }

        internal static bool TryGetVector3(Dictionary<string, object> dict, string key, out Vector3 result)
        {
            result = Vector3.zero;
            if (dict == null || !dict.TryGetValue(key, out object val) || val == null)
                return false;

            if (val is System.Collections.IList list && list.Count >= 3)
            {
                result = new Vector3(
                    ToFloat(list[0]),
                    ToFloat(list[1]),
                    ToFloat(list[2])
                );
                return true;
            }

            // Also support dictionary with x, y, z keys
            if (val is Dictionary<string, object> vecDict)
            {
                result = new Vector3(
                    GetFloat(vecDict, "x"),
                    GetFloat(vecDict, "y"),
                    GetFloat(vecDict, "z")
                );
                return true;
            }

            return false;
        }

        private static float ToFloat(object val)
        {
            if (val is double d) return (float)d;
            if (val is float f) return f;
            if (val is int i) return i;
            if (val is long l) return l;
            if (float.TryParse(val?.ToString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out float parsed))
                return parsed;
            return 0f;
        }

        private static Type FindType(string typeName)
        {
            // Search all loaded assemblies for the type
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetType(typeName, false, true);
                if (type != null) return type;

                // Try with UnityEngine prefix
                type = assembly.GetType($"UnityEngine.{typeName}", false, true);
                if (type != null) return type;
            }
            return null;
        }
    }
}
#endif
