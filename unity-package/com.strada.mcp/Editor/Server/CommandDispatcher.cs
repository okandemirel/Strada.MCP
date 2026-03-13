#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using Strada.Mcp.Runtime;
using UnityEngine;

namespace Strada.Mcp.Editor.Server
{
    /// <summary>
    /// Registry-based JSON-RPC method dispatcher.
    /// Maps method names to handler functions and dispatches incoming requests.
    /// </summary>
    public sealed class CommandDispatcher
    {
        private readonly Dictionary<string, Func<Dictionary<string, object>, object>> _handlers
            = new Dictionary<string, Func<Dictionary<string, object>, object>>();

        /// <summary>
        /// Returns the number of registered handlers.
        /// </summary>
        public int HandlerCount => _handlers.Count;

        /// <summary>
        /// Returns all registered method names.
        /// </summary>
        public IEnumerable<string> RegisteredMethods => _handlers.Keys;

        /// <summary>
        /// Registers a handler for the given JSON-RPC method name.
        /// </summary>
        /// <param name="method">The JSON-RPC method name (e.g., "gameobject.create").</param>
        /// <param name="handler">Function that receives params dict and returns a result object.</param>
        public void RegisterHandler(string method, Func<Dictionary<string, object>, object> handler)
        {
            if (string.IsNullOrEmpty(method))
                throw new ArgumentNullException(nameof(method));
            if (handler == null)
                throw new ArgumentNullException(nameof(handler));

            _handlers[method] = handler;
        }

        /// <summary>
        /// Unregisters a handler for the given method name.
        /// </summary>
        /// <returns>True if the handler was found and removed.</returns>
        public bool UnregisterHandler(string method)
        {
            return _handlers.Remove(method);
        }

        /// <summary>
        /// Returns true if a handler is registered for the given method.
        /// </summary>
        public bool HasHandler(string method)
        {
            return _handlers.ContainsKey(method);
        }

        /// <summary>
        /// Dispatches a JSON-RPC request to the appropriate handler and returns a response.
        /// Handles all errors internally, returning error responses for failures.
        /// </summary>
        public JsonRpcResponse Dispatch(JsonRpcRequest request)
        {
            if (request == null)
            {
                return JsonRpcResponse.Error(null, ErrorCode.InvalidRequest, "Request is null");
            }

            if (string.IsNullOrEmpty(request.method))
            {
                return JsonRpcResponse.Error(request.id, ErrorCode.InvalidRequest, "Method is missing");
            }

            if (!_handlers.TryGetValue(request.method, out var handler))
            {
                return JsonRpcResponse.Error(
                    request.id,
                    ErrorCode.MethodNotFound,
                    $"Method not found: {request.method}"
                );
            }

            try
            {
                var parameters = request.@params ?? new Dictionary<string, object>();
                object result = handler(parameters);
                return JsonRpcResponse.Success(request.id, result);
            }
            catch (JsonRpcException ex)
            {
                // Handler threw a typed JSON-RPC error
                return JsonRpcResponse.Error(request.id, ex.Code, ex.Message, ex.Data);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[Strada.MCP] Handler error for '{request.method}': {ex}");
                return JsonRpcResponse.Error(
                    request.id,
                    ErrorCode.InternalError,
                    $"Internal error: {ex.Message}"
                );
            }
        }

        /// <summary>
        /// Processes a raw JSON message string: parses, dispatches, and returns the serialized response.
        /// Returns null for notifications (no response needed).
        /// </summary>
        public string ProcessMessage(string rawMessage)
        {
            try
            {
                string type = JsonRpcSerializer.Deserialize(
                    rawMessage,
                    out JsonRpcRequest request,
                    out JsonRpcResponse _,
                    out JsonRpcNotification _
                );

                if (type == "request" && request != null)
                {
                    JsonRpcResponse response = Dispatch(request);
                    return JsonRpcSerializer.Serialize(response);
                }

                // Notifications don't need a response
                // Responses are not expected from the MCP server in this direction
                return null;
            }
            catch (FormatException ex)
            {
                var errorResponse = JsonRpcResponse.Error(null, ErrorCode.ParseError, ex.Message);
                return JsonRpcSerializer.Serialize(errorResponse);
            }
        }
    }

    /// <summary>
    /// Exception type for JSON-RPC handler errors with specific error codes.
    /// </summary>
    public class JsonRpcException : Exception
    {
        public int Code { get; }
        public object Data { get; }

        public JsonRpcException(int code, string message, object data = null)
            : base(message)
        {
            Code = code;
            Data = data;
        }
    }
}
#endif
