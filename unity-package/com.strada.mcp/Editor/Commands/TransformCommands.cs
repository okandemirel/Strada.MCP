#if UNITY_EDITOR
using System.Collections.Generic;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handlers for Transform-related JSON-RPC commands.
    /// </summary>
    public static class TransformCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("transform.set", Set);
            dispatcher.RegisterHandler("transform.get", Get);
            dispatcher.RegisterHandler("transform.setParent", SetParent);
        }

        /// <summary>
        /// Sets transform values on a GameObject.
        /// Params: target (string), position? ([x,y,z]), rotation? ([x,y,z]), scale? ([x,y,z]),
        ///         space? ("local"|"world", default: "world")
        /// </summary>
        private static object Set(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject go = GameObjectCommands.FindGameObject(target);
            string space = GameObjectCommands.GetString(@params, "space", "world");
            bool isLocal = space.ToLowerInvariant() == "local";

            Undo.RecordObject(go.transform, $"Set transform of {go.name}");

            if (GameObjectCommands.TryGetVector3(@params, "position", out Vector3 pos))
            {
                if (isLocal)
                    go.transform.localPosition = pos;
                else
                    go.transform.position = pos;
            }

            if (GameObjectCommands.TryGetVector3(@params, "rotation", out Vector3 rot))
            {
                if (isLocal)
                    go.transform.localEulerAngles = rot;
                else
                    go.transform.eulerAngles = rot;
            }

            if (GameObjectCommands.TryGetVector3(@params, "scale", out Vector3 scale))
            {
                go.transform.localScale = scale;
            }

            EditorUtility.SetDirty(go);

            return BuildTransformResult(go);
        }

        /// <summary>
        /// Gets transform values from a GameObject.
        /// Params: target (string), space? ("local"|"world", default: "world")
        /// </summary>
        private static object Get(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject go = GameObjectCommands.FindGameObject(target);
            string space = GameObjectCommands.GetString(@params, "space", "world");
            bool isLocal = space.ToLowerInvariant() == "local";

            Vector3 position = isLocal ? go.transform.localPosition : go.transform.position;
            Vector3 rotation = isLocal ? go.transform.localEulerAngles : go.transform.eulerAngles;
            Vector3 scale = go.transform.localScale;

            return new Dictionary<string, object>
            {
                { "gameObject", go.name },
                { "space", isLocal ? "local" : "world" },
                { "position", Vec3ToList(position) },
                { "rotation", Vec3ToList(rotation) },
                { "scale", Vec3ToList(scale) },
                { "parent", go.transform.parent != null ? go.transform.parent.name : null }
            };
        }

        /// <summary>
        /// Sets the parent of a GameObject.
        /// Params: target (string), parent (string|null), worldPositionStays? (bool, default: true)
        /// </summary>
        private static object SetParent(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject go = GameObjectCommands.FindGameObject(target);
            bool worldPositionStays = GameObjectCommands.GetBool(@params, "worldPositionStays", true);

            string parentTarget = GameObjectCommands.GetString(@params, "parent");
            Transform newParent = null;

            if (!string.IsNullOrEmpty(parentTarget))
            {
                GameObject parentGo = GameObjectCommands.FindGameObject(parentTarget);
                newParent = parentGo.transform;
            }

            Undo.SetTransformParent(go.transform, newParent, $"Set parent of {go.name}");

            if (!worldPositionStays && newParent != null)
            {
                // SetTransformParent always uses worldPositionStays=true,
                // so we manually reset if requested
                Undo.RecordObject(go.transform, $"Reset local transform of {go.name}");
                go.transform.localPosition = Vector3.zero;
                go.transform.localRotation = Quaternion.identity;
                go.transform.localScale = Vector3.one;
            }

            return BuildTransformResult(go);
        }

        // --- Helpers ---

        private static Dictionary<string, object> BuildTransformResult(GameObject go)
        {
            return new Dictionary<string, object>
            {
                { "gameObject", go.name },
                { "worldPosition", Vec3ToList(go.transform.position) },
                { "worldRotation", Vec3ToList(go.transform.eulerAngles) },
                { "localPosition", Vec3ToList(go.transform.localPosition) },
                { "localRotation", Vec3ToList(go.transform.localEulerAngles) },
                { "localScale", Vec3ToList(go.transform.localScale) },
                { "parent", go.transform.parent != null ? go.transform.parent.name : null }
            };
        }

        private static List<object> Vec3ToList(Vector3 v)
        {
            return new List<object>
            {
                (double)v.x,
                (double)v.y,
                (double)v.z
            };
        }
    }
}
#endif
