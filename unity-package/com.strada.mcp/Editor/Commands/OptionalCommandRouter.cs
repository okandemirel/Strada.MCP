#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Reflection;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;

namespace Strada.Mcp.Editor.Commands
{
    internal static class OptionalCommandRouter
    {
        public static object Invoke(
            string typeName,
            string methodName,
            Dictionary<string, object> parameters,
            string capabilityName)
        {
            var type = Type.GetType(typeName, false);
            if (type == null)
            {
                return Unavailable(capabilityName, "Required Unity package or integration assembly is not installed.");
            }

            var method = type.GetMethod(methodName, BindingFlags.Public | BindingFlags.Static);
            if (method == null)
            {
                return Unavailable(capabilityName, $"Optional command method was not found: {methodName}");
            }

            try
            {
                return method.Invoke(null, new object[] { parameters ?? new Dictionary<string, object>() });
            }
            catch (TargetInvocationException ex) when (ex.InnerException is JsonRpcException jsonRpc)
            {
                throw jsonRpc;
            }
            catch (TargetInvocationException ex)
            {
                throw new JsonRpcException(ErrorCode.InternalError, ex.InnerException?.Message ?? ex.Message);
            }
        }

        public static Dictionary<string, object> Unavailable(string capabilityName, string reason)
        {
            return new Dictionary<string, object>
            {
                { "available", false },
                { "status", "unavailable" },
                { "capability", capabilityName },
                { "reason", reason }
            };
        }
    }
}
#endif
