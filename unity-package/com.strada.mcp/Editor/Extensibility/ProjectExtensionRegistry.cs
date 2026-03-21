#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using Strada.Mcp.Runtime.Extensibility;
using UnityEditor;

namespace Strada.Mcp.Editor.Extensibility
{
    internal static class ProjectExtensionRegistry
    {
        private static readonly Dictionary<string, MethodInfo> ToolMethods = new Dictionary<string, MethodInfo>(StringComparer.Ordinal);

        public static Dictionary<string, object> BuildManifest()
        {
            ToolMethods.Clear();

            var tools = new List<object>();
            foreach (var method in TypeCache.GetMethodsWithAttribute<McpToolAttribute>())
            {
                var attribute = method.GetCustomAttribute<McpToolAttribute>();
                if (attribute == null || !IsSupportedToolMethod(method))
                {
                    continue;
                }

                ToolMethods[attribute.Name] = method;
                tools.Add(new Dictionary<string, object>
                {
                    { "name", attribute.Name },
                    { "description", attribute.Description },
                    { "readOnly", attribute.ReadOnly },
                    { "dangerous", attribute.Dangerous },
                    { "category", attribute.Category },
                    { "declaringType", method.DeclaringType?.FullName ?? "Unknown" },
                    { "methodName", method.Name },
                    { "inputContract", DescribeInputContract(method) }
                });
            }

            var prompts = new List<object>();
            foreach (var method in TypeCache.GetMethodsWithAttribute<McpPromptAttribute>())
            {
                var attribute = method.GetCustomAttribute<McpPromptAttribute>();
                if (attribute == null)
                {
                    continue;
                }

                prompts.Add(new Dictionary<string, object>
                {
                    { "name", attribute.Name },
                    { "description", attribute.Description },
                    { "declaringType", method.DeclaringType?.FullName ?? "Unknown" },
                    { "methodName", method.Name }
                });
            }

            var resources = new List<object>();
            foreach (var method in TypeCache.GetMethodsWithAttribute<McpResourceAttribute>())
            {
                var attribute = method.GetCustomAttribute<McpResourceAttribute>();
                if (attribute == null)
                {
                    continue;
                }

                resources.Add(new Dictionary<string, object>
                {
                    { "uri", attribute.Uri },
                    { "description", attribute.Description },
                    { "mimeType", attribute.MimeType },
                    { "declaringType", method.DeclaringType?.FullName ?? "Unknown" },
                    { "methodName", method.Name }
                });
            }

            return new Dictionary<string, object>
            {
                { "tools", tools },
                { "prompts", prompts },
                { "resources", resources },
                { "toolCount", tools.Count },
                { "promptCount", prompts.Count },
                { "resourceCount", resources.Count }
            };
        }

        public static object InvokeTool(Dictionary<string, object> parameters)
        {
            var manifest = BuildManifest();
            string toolName = GetString(parameters, "name");
            if (string.IsNullOrEmpty(toolName))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "name is required");
            }

            if (!ToolMethods.TryGetValue(toolName, out var method))
            {
                throw new JsonRpcException(ErrorCode.MethodNotFound, $"Project MCP tool not found: {toolName}");
            }

            object result;
            var methodParameters = method.GetParameters();
            if (methodParameters.Length == 0)
            {
                result = method.Invoke(null, null);
            }
            else if (methodParameters.Length == 1 && typeof(Dictionary<string, object>).IsAssignableFrom(methodParameters[0].ParameterType))
            {
                var input = GetNestedDictionary(parameters, "input") ?? new Dictionary<string, object>();
                result = method.Invoke(null, new object[] { input });
            }
            else
            {
                throw new JsonRpcException(ErrorCode.InvalidParams,
                    $"Unsupported project MCP tool signature for {toolName}. Expected zero parameters or Dictionary<string, object>.");
            }

            return new Dictionary<string, object>
            {
                { "invoked", true },
                { "name", toolName },
                { "manifest", manifest },
                { "result", result }
            };
        }

        private static bool IsSupportedToolMethod(MethodInfo method)
        {
            if (method == null || !method.IsStatic)
            {
                return false;
            }

            var parameters = method.GetParameters();
            return parameters.Length == 0 ||
                (parameters.Length == 1 && typeof(Dictionary<string, object>).IsAssignableFrom(parameters[0].ParameterType));
        }

        private static string DescribeInputContract(MethodInfo method)
        {
            var parameters = method.GetParameters();
            if (parameters.Length == 0)
            {
                return "none";
            }

            if (parameters.Length == 1 && typeof(Dictionary<string, object>).IsAssignableFrom(parameters[0].ParameterType))
            {
                return "dictionary";
            }

            return "unsupported";
        }

        private static string GetString(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out var raw) || raw == null)
            {
                return null;
            }

            return raw.ToString();
        }

        private static Dictionary<string, object> GetNestedDictionary(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out var raw) || raw == null)
            {
                return null;
            }

            return raw as Dictionary<string, object>;
        }
    }
}
#endif
