#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handlers for Component-related JSON-RPC commands.
    /// All destructive operations use the Undo system.
    /// </summary>
    public static class ComponentCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("component.add", Add);
            dispatcher.RegisterHandler("component.remove", Remove);
            dispatcher.RegisterHandler("component.list", ListComponents);
        }

        /// <summary>
        /// Adds a component to a GameObject.
        /// Params: target (string), component (string - type name)
        /// </summary>
        private static object Add(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            string componentName = GameObjectCommands.GetString(@params, "component");

            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");
            if (string.IsNullOrEmpty(componentName))
                throw new JsonRpcException(ErrorCode.InvalidParams, "component is required");

            GameObject go = GameObjectCommands.FindGameObject(target);
            Type componentType = ResolveComponentType(componentName);

            Component added = Undo.AddComponent(go, componentType);
            if (added == null)
                throw new JsonRpcException(ErrorCode.InternalError, $"Failed to add component: {componentName}");

            return new Dictionary<string, object>
            {
                { "gameObject", go.name },
                { "component", componentType.Name },
                { "fullType", componentType.FullName }
            };
        }

        /// <summary>
        /// Removes a component from a GameObject.
        /// Params: target (string), component (string - type name), index? (int - if multiple of same type)
        /// </summary>
        private static object Remove(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            string componentName = GameObjectCommands.GetString(@params, "component");
            int index = GameObjectCommands.GetInt(@params, "index");

            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");
            if (string.IsNullOrEmpty(componentName))
                throw new JsonRpcException(ErrorCode.InvalidParams, "component is required");

            GameObject go = GameObjectCommands.FindGameObject(target);
            Type componentType = ResolveComponentType(componentName);

            Component[] components = go.GetComponents(componentType);
            if (components == null || components.Length == 0)
                throw new JsonRpcException(ErrorCode.ComponentNotFound,
                    $"Component not found on {go.name}: {componentName}");

            if (index < 0 || index >= components.Length)
                throw new JsonRpcException(ErrorCode.InvalidParams,
                    $"Component index {index} out of range (0-{components.Length - 1})");

            Component toRemove = components[index];

            // Cannot remove Transform
            if (toRemove is Transform)
                throw new JsonRpcException(ErrorCode.InvalidParams, "Cannot remove Transform component");

            Undo.DestroyObjectImmediate(toRemove);

            return new Dictionary<string, object>
            {
                { "removed", true },
                { "gameObject", go.name },
                { "component", componentType.Name }
            };
        }

        /// <summary>
        /// Lists all components on a GameObject.
        /// Params: target (string)
        /// </summary>
        private static object ListComponents(Dictionary<string, object> @params)
        {
            string target = GameObjectCommands.GetString(@params, "target");
            if (string.IsNullOrEmpty(target))
                throw new JsonRpcException(ErrorCode.InvalidParams, "target is required");

            GameObject go = GameObjectCommands.FindGameObject(target);
            Component[] components = go.GetComponents<Component>();

            var list = new List<object>();
            for (int i = 0; i < components.Length; i++)
            {
                Component comp = components[i];
                if (comp == null) continue; // Can happen with missing scripts

                var info = new Dictionary<string, object>
                {
                    { "index", i },
                    { "type", comp.GetType().Name },
                    { "fullType", comp.GetType().FullName },
                    { "enabled", IsComponentEnabled(comp) }
                };
                list.Add(info);
            }

            return new Dictionary<string, object>
            {
                { "gameObject", go.name },
                { "count", list.Count },
                { "components", list }
            };
        }

        // --- Helpers ---

        private static Type ResolveComponentType(string typeName)
        {
            // Try direct lookup first
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type = assembly.GetType(typeName, false, true);
                if (type != null && typeof(Component).IsAssignableFrom(type))
                    return type;
            }

            // Try with UnityEngine prefix
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type = assembly.GetType($"UnityEngine.{typeName}", false, true);
                if (type != null && typeof(Component).IsAssignableFrom(type))
                    return type;
            }

            throw new JsonRpcException(ErrorCode.ComponentNotFound, $"Component type not found: {typeName}");
        }

        private static bool IsComponentEnabled(Component comp)
        {
            if (comp is Behaviour behaviour) return behaviour.enabled;
            if (comp is Renderer renderer) return renderer.enabled;
            if (comp is Collider collider) return collider.enabled;
            return true; // Transform and others are always "enabled"
        }
    }
}
#endif
