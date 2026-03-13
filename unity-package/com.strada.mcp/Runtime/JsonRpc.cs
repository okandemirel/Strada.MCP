using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Strada.Mcp.Runtime
{
    // --- JSON-RPC 2.0 Message Types ---

    [Serializable]
    public class JsonRpcRequest
    {
        public string jsonrpc = "2.0";
        public string id;
        public string method;

        // Unity's JsonUtility cannot serialize Dictionary, so params are handled separately
        [NonSerialized]
        public Dictionary<string, object> @params;

        public static JsonRpcRequest Create(string method, Dictionary<string, object> parameters = null)
        {
            return new JsonRpcRequest
            {
                jsonrpc = "2.0",
                id = NextId().ToString(),
                method = method,
                @params = parameters
            };
        }

        private static int _nextId;
        private static int NextId() => ++_nextId;

        /// <summary>
        /// Resets the request ID counter. Only used in tests.
        /// </summary>
        public static void ResetIdCounter() => _nextId = 0;
    }

    [Serializable]
    public class JsonRpcResponse
    {
        public string jsonrpc = "2.0";
        public string id;

        [NonSerialized]
        public object result;

        [NonSerialized]
        public JsonRpcError error;

        /// <summary>
        /// Creates a success response for the given request ID.
        /// </summary>
        public static JsonRpcResponse Success(string requestId, object resultData)
        {
            return new JsonRpcResponse
            {
                jsonrpc = "2.0",
                id = requestId,
                result = resultData,
                error = null
            };
        }

        /// <summary>
        /// Creates an error response for the given request ID.
        /// </summary>
        public static JsonRpcResponse Error(string requestId, int code, string message, object data = null)
        {
            return new JsonRpcResponse
            {
                jsonrpc = "2.0",
                id = requestId,
                result = null,
                error = new JsonRpcError { code = code, message = message, data = data }
            };
        }
    }

    [Serializable]
    public class JsonRpcError
    {
        public int code;
        public string message;

        [NonSerialized]
        public object data;
    }

    [Serializable]
    public class JsonRpcNotification
    {
        public string jsonrpc = "2.0";
        public string method;

        [NonSerialized]
        public Dictionary<string, object> @params;

        public static JsonRpcNotification Create(string method, Dictionary<string, object> parameters = null)
        {
            return new JsonRpcNotification
            {
                jsonrpc = "2.0",
                method = method,
                @params = parameters
            };
        }
    }

    // --- Standard JSON-RPC Error Codes ---

    public static class ErrorCode
    {
        // Standard JSON-RPC
        public const int ParseError = -32700;
        public const int InvalidRequest = -32600;
        public const int MethodNotFound = -32601;
        public const int InvalidParams = -32602;
        public const int InternalError = -32603;

        // Unity-specific (-32000 to -32099)
        public const int UnityNotReady = -32000;
        public const int GameObjectNotFound = -32001;
        public const int ComponentNotFound = -32002;
        public const int SceneNotLoaded = -32003;
        public const int CompileError = -32004;
        public const int PlayModeRequired = -32005;
        public const int EditModeRequired = -32006;
        public const int AssetNotFound = -32007;
        public const int PermissionDenied = -32008;
        public const int Timeout = -32009;
    }

    // --- JSON Serialization Helpers ---
    // Unity's built-in JsonUtility doesn't handle Dictionary or polymorphic types,
    // so we use a lightweight MiniJson-style approach for serialization.

    public static class JsonRpcSerializer
    {
        /// <summary>
        /// Serializes a JSON-RPC request to a JSON string.
        /// </summary>
        public static string Serialize(JsonRpcRequest request)
        {
            var sb = new StringBuilder();
            sb.Append("{\"jsonrpc\":\"2.0\",\"id\":");
            AppendJsonValue(sb, request.id);
            sb.Append(",\"method\":");
            AppendJsonString(sb, request.method);
            if (request.@params != null && request.@params.Count > 0)
            {
                sb.Append(",\"params\":");
                AppendJsonValue(sb, request.@params);
            }
            sb.Append('}');
            return sb.ToString();
        }

        /// <summary>
        /// Serializes a JSON-RPC response to a JSON string.
        /// </summary>
        public static string Serialize(JsonRpcResponse response)
        {
            var sb = new StringBuilder();
            sb.Append("{\"jsonrpc\":\"2.0\",\"id\":");
            AppendJsonValue(sb, response.id);
            if (response.error != null)
            {
                sb.Append(",\"error\":{\"code\":");
                sb.Append(response.error.code);
                sb.Append(",\"message\":");
                AppendJsonString(sb, response.error.message);
                if (response.error.data != null)
                {
                    sb.Append(",\"data\":");
                    AppendJsonValue(sb, response.error.data);
                }
                sb.Append('}');
            }
            else
            {
                sb.Append(",\"result\":");
                AppendJsonValue(sb, response.result);
            }
            sb.Append('}');
            return sb.ToString();
        }

        /// <summary>
        /// Serializes a JSON-RPC notification to a JSON string.
        /// </summary>
        public static string Serialize(JsonRpcNotification notification)
        {
            var sb = new StringBuilder();
            sb.Append("{\"jsonrpc\":\"2.0\",\"method\":");
            AppendJsonString(sb, notification.method);
            if (notification.@params != null && notification.@params.Count > 0)
            {
                sb.Append(",\"params\":");
                AppendJsonValue(sb, notification.@params);
            }
            sb.Append('}');
            return sb.ToString();
        }

        /// <summary>
        /// Deserializes a raw JSON string into a parsed JSON-RPC message.
        /// Returns the type of message: "request", "response", or "notification".
        /// </summary>
        public static string Deserialize(string raw, out JsonRpcRequest request, out JsonRpcResponse response, out JsonRpcNotification notification)
        {
            request = null;
            response = null;
            notification = null;

            if (string.IsNullOrEmpty(raw))
                throw new FormatException("Empty JSON-RPC message");

            var dict = MiniJson.Deserialize(raw) as Dictionary<string, object>;
            if (dict == null)
                throw new FormatException("Invalid JSON: could not parse as object");

            string jsonrpc = GetString(dict, "jsonrpc");
            if (jsonrpc != "2.0")
                throw new FormatException($"Invalid jsonrpc version: {jsonrpc}");

            bool hasId = dict.ContainsKey("id");
            bool hasMethod = dict.ContainsKey("method");
            bool hasResult = dict.ContainsKey("result");
            bool hasError = dict.ContainsKey("error");

            // Response: has id + (result or error)
            if (hasId && (hasResult || hasError))
            {
                response = new JsonRpcResponse
                {
                    jsonrpc = "2.0",
                    id = GetString(dict, "id")
                };
                if (hasError && dict["error"] is Dictionary<string, object> errDict)
                {
                    response.error = new JsonRpcError
                    {
                        code = GetInt(errDict, "code"),
                        message = GetString(errDict, "message"),
                        data = errDict.ContainsKey("data") ? errDict["data"] : null
                    };
                }
                else if (hasResult)
                {
                    response.result = dict["result"];
                }
                return "response";
            }

            // Request: has id + method
            if (hasId && hasMethod)
            {
                request = new JsonRpcRequest
                {
                    jsonrpc = "2.0",
                    id = GetString(dict, "id"),
                    method = GetString(dict, "method"),
                    @params = GetParams(dict)
                };
                return "request";
            }

            // Notification: has method, no id
            if (hasMethod && !hasId)
            {
                notification = new JsonRpcNotification
                {
                    jsonrpc = "2.0",
                    method = GetString(dict, "method"),
                    @params = GetParams(dict)
                };
                return "notification";
            }

            throw new FormatException($"Unrecognized JSON-RPC message: {raw.Substring(0, Math.Min(raw.Length, 200))}");
        }

        /// <summary>
        /// Convenience method to deserialize a request specifically.
        /// </summary>
        public static JsonRpcRequest DeserializeRequest(string raw)
        {
            string type = Deserialize(raw, out var request, out _, out _);
            if (type != "request" || request == null)
                throw new FormatException($"Expected JSON-RPC request, got {type}");
            return request;
        }

        // --- Internal Helpers ---

        private static string GetString(Dictionary<string, object> dict, string key)
        {
            if (!dict.TryGetValue(key, out object val) || val == null) return null;
            return val.ToString();
        }

        private static int GetInt(Dictionary<string, object> dict, string key)
        {
            if (!dict.TryGetValue(key, out object val) || val == null) return 0;
            if (val is double d) return (int)d;
            if (val is long l) return (int)l;
            if (val is int i) return i;
            if (int.TryParse(val.ToString(), out int parsed)) return parsed;
            return 0;
        }

        private static Dictionary<string, object> GetParams(Dictionary<string, object> dict)
        {
            if (!dict.TryGetValue("params", out object val)) return null;
            return val as Dictionary<string, object>;
        }

        internal static void AppendJsonValue(StringBuilder sb, object value)
        {
            if (value == null)
            {
                sb.Append("null");
                return;
            }

            if (value is string s)
            {
                AppendJsonString(sb, s);
                return;
            }

            if (value is bool b)
            {
                sb.Append(b ? "true" : "false");
                return;
            }

            if (value is int i)
            {
                sb.Append(i);
                return;
            }

            if (value is long l)
            {
                sb.Append(l);
                return;
            }

            if (value is float f)
            {
                sb.Append(f.ToString(System.Globalization.CultureInfo.InvariantCulture));
                return;
            }

            if (value is double d)
            {
                sb.Append(d.ToString(System.Globalization.CultureInfo.InvariantCulture));
                return;
            }

            if (value is Dictionary<string, object> dict)
            {
                sb.Append('{');
                bool first = true;
                foreach (var kv in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    AppendJsonString(sb, kv.Key);
                    sb.Append(':');
                    AppendJsonValue(sb, kv.Value);
                }
                sb.Append('}');
                return;
            }

            if (value is System.Collections.IList list)
            {
                sb.Append('[');
                for (int idx = 0; idx < list.Count; idx++)
                {
                    if (idx > 0) sb.Append(',');
                    AppendJsonValue(sb, list[idx]);
                }
                sb.Append(']');
                return;
            }

            // Fallback: treat as string
            AppendJsonString(sb, value.ToString());
        }

        internal static void AppendJsonString(StringBuilder sb, string value)
        {
            if (value == null)
            {
                sb.Append("null");
                return;
            }

            sb.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20)
                            sb.AppendFormat("\\u{0:x4}", (int)c);
                        else
                            sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }

    // --- Minimal JSON Parser ---
    // A self-contained JSON parser since Unity's JsonUtility doesn't handle Dictionary<string, object>.

    public static class MiniJson
    {
        public static object Deserialize(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            int index = 0;
            return ParseValue(json, ref index);
        }

        public static string Serialize(object obj)
        {
            var sb = new StringBuilder();
            JsonRpcSerializer.AppendJsonValue(sb, obj);
            return sb.ToString();
        }

        private static object ParseValue(string json, ref int index)
        {
            SkipWhitespace(json, ref index);
            if (index >= json.Length) return null;

            char c = json[index];
            switch (c)
            {
                case '"': return ParseString(json, ref index);
                case '{': return ParseObject(json, ref index);
                case '[': return ParseArray(json, ref index);
                case 't':
                case 'f': return ParseBool(json, ref index);
                case 'n': return ParseNull(json, ref index);
                default: return ParseNumber(json, ref index);
            }
        }

        private static string ParseString(string json, ref int index)
        {
            index++; // skip opening quote
            var sb = new StringBuilder();
            while (index < json.Length)
            {
                char c = json[index++];
                if (c == '"') return sb.ToString();
                if (c == '\\' && index < json.Length)
                {
                    char next = json[index++];
                    switch (next)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'u':
                            if (index + 4 <= json.Length)
                            {
                                string hex = json.Substring(index, 4);
                                index += 4;
                                sb.Append((char)Convert.ToInt32(hex, 16));
                            }
                            break;
                        default: sb.Append(next); break;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }
            throw new FormatException("Unterminated string in JSON");
        }

        private static Dictionary<string, object> ParseObject(string json, ref int index)
        {
            index++; // skip '{'
            var dict = new Dictionary<string, object>();
            SkipWhitespace(json, ref index);

            if (index < json.Length && json[index] == '}')
            {
                index++;
                return dict;
            }

            while (index < json.Length)
            {
                SkipWhitespace(json, ref index);
                string key = ParseString(json, ref index);
                SkipWhitespace(json, ref index);

                if (index < json.Length && json[index] == ':')
                    index++;

                object value = ParseValue(json, ref index);
                dict[key] = value;

                SkipWhitespace(json, ref index);
                if (index < json.Length && json[index] == ',')
                {
                    index++;
                }
                else if (index < json.Length && json[index] == '}')
                {
                    index++;
                    return dict;
                }
                else
                {
                    break;
                }
            }
            return dict;
        }

        private static List<object> ParseArray(string json, ref int index)
        {
            index++; // skip '['
            var list = new List<object>();
            SkipWhitespace(json, ref index);

            if (index < json.Length && json[index] == ']')
            {
                index++;
                return list;
            }

            while (index < json.Length)
            {
                object value = ParseValue(json, ref index);
                list.Add(value);

                SkipWhitespace(json, ref index);
                if (index < json.Length && json[index] == ',')
                {
                    index++;
                }
                else if (index < json.Length && json[index] == ']')
                {
                    index++;
                    return list;
                }
                else
                {
                    break;
                }
            }
            return list;
        }

        private static object ParseNumber(string json, ref int index)
        {
            int start = index;
            if (index < json.Length && json[index] == '-') index++;
            while (index < json.Length && char.IsDigit(json[index])) index++;

            bool isFloat = false;
            if (index < json.Length && json[index] == '.')
            {
                isFloat = true;
                index++;
                while (index < json.Length && char.IsDigit(json[index])) index++;
            }
            if (index < json.Length && (json[index] == 'e' || json[index] == 'E'))
            {
                isFloat = true;
                index++;
                if (index < json.Length && (json[index] == '+' || json[index] == '-')) index++;
                while (index < json.Length && char.IsDigit(json[index])) index++;
            }

            string numStr = json.Substring(start, index - start);
            if (isFloat)
            {
                if (double.TryParse(numStr, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out double d))
                    return d;
            }
            else
            {
                if (long.TryParse(numStr, out long l))
                {
                    if (l >= int.MinValue && l <= int.MaxValue) return (int)l;
                    return l;
                }
            }
            return 0;
        }

        private static bool ParseBool(string json, ref int index)
        {
            if (json.Substring(index, 4) == "true")
            {
                index += 4;
                return true;
            }
            if (json.Substring(index, 5) == "false")
            {
                index += 5;
                return false;
            }
            throw new FormatException($"Invalid boolean at position {index}");
        }

        private static object ParseNull(string json, ref int index)
        {
            if (json.Substring(index, 4) == "null")
            {
                index += 4;
                return null;
            }
            throw new FormatException($"Invalid null at position {index}");
        }

        private static void SkipWhitespace(string json, ref int index)
        {
            while (index < json.Length && char.IsWhiteSpace(json[index]))
                index++;
        }
    }
}
