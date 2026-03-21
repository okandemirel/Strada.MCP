using System.Collections.Generic;
using NUnit.Framework;
using Strada.Mcp.Runtime;

namespace Strada.Mcp.Tests.Editor
{
    /// <summary>
    /// Pure C# tests for JSON-RPC serialization and deserialization.
    /// No Unity runtime dependencies required.
    /// </summary>
    [TestFixture]
    public class JsonRpcTests
    {
        [SetUp]
        public void SetUp()
        {
            JsonRpcRequest.ResetIdCounter();
        }

        // --- Request Serialization ---

        [Test]
        public void Serialize_Request_BasicMethod()
        {
            var request = JsonRpcRequest.Create("gameobject.create");
            string json = JsonRpcSerializer.Serialize(request);

            Assert.That(json, Does.Contain("\"jsonrpc\":\"2.0\""));
            Assert.That(json, Does.Contain("\"method\":\"gameobject.create\""));
            Assert.That(json, Does.Contain("\"id\":\"1\""));
        }

        [Test]
        public void Serialize_Request_WithParams()
        {
            var parameters = new Dictionary<string, object>
            {
                { "name", "TestCube" },
                { "type", "cube" }
            };
            var request = JsonRpcRequest.Create("gameobject.create", parameters);
            string json = JsonRpcSerializer.Serialize(request);

            Assert.That(json, Does.Contain("\"params\":{"));
            Assert.That(json, Does.Contain("\"name\":\"TestCube\""));
            Assert.That(json, Does.Contain("\"type\":\"cube\""));
        }

        [Test]
        public void Serialize_Request_WithoutParams_OmitsParams()
        {
            var request = JsonRpcRequest.Create("editor.getPlayState");
            string json = JsonRpcSerializer.Serialize(request);

            Assert.That(json, Does.Not.Contain("\"params\""));
        }

        [Test]
        public void Serialize_Request_IncrementingIds()
        {
            var r1 = JsonRpcRequest.Create("method1");
            var r2 = JsonRpcRequest.Create("method2");
            var r3 = JsonRpcRequest.Create("method3");

            Assert.AreEqual("1", r1.id);
            Assert.AreEqual("2", r2.id);
            Assert.AreEqual("3", r3.id);
        }

        // --- Response Serialization ---

        [Test]
        public void Serialize_SuccessResponse()
        {
            var response = JsonRpcResponse.Success("1", new Dictionary<string, object>
            {
                { "instanceId", 42 },
                { "name", "TestObject" }
            });
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"jsonrpc\":\"2.0\""));
            Assert.That(json, Does.Contain("\"id\":\"1\""));
            Assert.That(json, Does.Contain("\"result\":{"));
            Assert.That(json, Does.Contain("\"instanceId\":42"));
            Assert.That(json, Does.Contain("\"name\":\"TestObject\""));
            Assert.That(json, Does.Not.Contain("\"error\""));
        }

        [Test]
        public void Serialize_ErrorResponse()
        {
            var response = JsonRpcResponse.Error("1", ErrorCode.MethodNotFound, "Method not found: foo");
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"error\":{"));
            Assert.That(json, Does.Contain("\"code\":-32601"));
            Assert.That(json, Does.Contain("\"message\":\"Method not found: foo\""));
            Assert.That(json, Does.Not.Contain("\"result\""));
        }

        [Test]
        public void Serialize_ErrorResponse_WithData()
        {
            var response = JsonRpcResponse.Error("1", ErrorCode.InvalidParams, "bad param",
                new Dictionary<string, object> { { "field", "name" } });
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"data\":{"));
            Assert.That(json, Does.Contain("\"field\":\"name\""));
        }

        [Test]
        public void Serialize_ErrorResponse_NullId()
        {
            var response = JsonRpcResponse.Error(null, ErrorCode.ParseError, "parse failed");
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"id\":null"));
        }

        // --- Notification Serialization ---

        [Test]
        public void Serialize_Notification()
        {
            var notification = JsonRpcNotification.Create("unity.sceneChanged",
                new Dictionary<string, object> { { "scene", "Main" } });
            string json = JsonRpcSerializer.Serialize(notification);

            Assert.That(json, Does.Contain("\"jsonrpc\":\"2.0\""));
            Assert.That(json, Does.Contain("\"method\":\"unity.sceneChanged\""));
            Assert.That(json, Does.Contain("\"scene\":\"Main\""));
            Assert.That(json, Does.Not.Contain("\"id\""));
        }

        [Test]
        public void Serialize_Notification_WithoutParams_OmitsParams()
        {
            var notification = JsonRpcNotification.Create("unity.compileStarted");
            string json = JsonRpcSerializer.Serialize(notification);

            Assert.That(json, Does.Not.Contain("\"params\""));
        }

        // --- Deserialization ---

        [Test]
        public void Deserialize_Request()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"id\":\"42\",\"method\":\"gameobject.find\",\"params\":{\"name\":\"Main Camera\"}}";

            string type = JsonRpcSerializer.Deserialize(json, out var request, out _, out _);

            Assert.AreEqual("request", type);
            Assert.IsNotNull(request);
            Assert.AreEqual("42", request.id);
            Assert.AreEqual("gameobject.find", request.method);
            Assert.IsNotNull(request.@params);
            Assert.AreEqual("Main Camera", request.@params["name"]);
        }

        [Test]
        public void Deserialize_Request_NoParams()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"editor.getPlayState\"}";

            string type = JsonRpcSerializer.Deserialize(json, out var request, out _, out _);

            Assert.AreEqual("request", type);
            Assert.IsNotNull(request);
            Assert.AreEqual("editor.getPlayState", request.method);
            Assert.IsNull(request.@params);
        }

        [Test]
        public void Deserialize_Request_NumericId_NormalizesToString()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"id\":42,\"method\":\"editor.getPlayState\"}";

            string type = JsonRpcSerializer.Deserialize(json, out var request, out _, out _);

            Assert.AreEqual("request", type);
            Assert.IsNotNull(request);
            Assert.AreEqual("42", request.id);
        }

        [Test]
        public void Deserialize_Response_Success()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"result\":{\"isPlaying\":false}}";

            string type = JsonRpcSerializer.Deserialize(json, out _, out var response, out _);

            Assert.AreEqual("response", type);
            Assert.IsNotNull(response);
            Assert.AreEqual("1", response.id);
            Assert.IsNull(response.error);
            Assert.IsNotNull(response.result);
        }

        [Test]
        public void Deserialize_Response_Error()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}";

            string type = JsonRpcSerializer.Deserialize(json, out _, out var response, out _);

            Assert.AreEqual("response", type);
            Assert.IsNotNull(response);
            Assert.IsNotNull(response.error);
            Assert.AreEqual(-32601, response.error.code);
            Assert.AreEqual("Method not found", response.error.message);
        }

        [Test]
        public void Deserialize_Notification()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"method\":\"unity.sceneChanged\",\"params\":{\"scene\":\"Main\"}}";

            string type = JsonRpcSerializer.Deserialize(json, out _, out _, out var notification);

            Assert.AreEqual("notification", type);
            Assert.IsNotNull(notification);
            Assert.AreEqual("unity.sceneChanged", notification.method);
            Assert.AreEqual("Main", notification.@params["scene"]);
        }

        [Test]
        public void Deserialize_EmptyMessage_Throws()
        {
            Assert.Throws<System.FormatException>(() =>
                JsonRpcSerializer.Deserialize("", out _, out _, out _));
        }

        [Test]
        public void Deserialize_InvalidJson_Throws()
        {
            Assert.Throws<System.FormatException>(() =>
                JsonRpcSerializer.Deserialize("{invalid}", out _, out _, out _));
        }

        [Test]
        public void Deserialize_WrongVersion_Throws()
        {
            string json = "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"test\"}";

            Assert.Throws<System.FormatException>(() =>
                JsonRpcSerializer.Deserialize(json, out _, out _, out _));
        }

        [Test]
        public void DeserializeRequest_Convenience()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"id\":\"5\",\"method\":\"transform.get\",\"params\":{\"target\":\"Cube\"}}";

            var request = JsonRpcSerializer.DeserializeRequest(json);

            Assert.AreEqual("5", request.id);
            Assert.AreEqual("transform.get", request.method);
            Assert.AreEqual("Cube", request.@params["target"]);
        }

        [Test]
        public void DeserializeRequest_NotARequest_Throws()
        {
            string json = "{\"jsonrpc\":\"2.0\",\"method\":\"unity.sceneChanged\"}";

            Assert.Throws<System.FormatException>(() =>
                JsonRpcSerializer.DeserializeRequest(json));
        }

        // --- Value Serialization Edge Cases ---

        [Test]
        public void Serialize_NullValue()
        {
            var response = JsonRpcResponse.Success("1", null);
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"result\":null"));
        }

        [Test]
        public void Serialize_BooleanValues()
        {
            var response = JsonRpcResponse.Success("1", new Dictionary<string, object>
            {
                { "active", true },
                { "paused", false }
            });
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"active\":true"));
            Assert.That(json, Does.Contain("\"paused\":false"));
        }

        [Test]
        public void Serialize_NumericValues()
        {
            var response = JsonRpcResponse.Success("1", new Dictionary<string, object>
            {
                { "int", 42 },
                { "long", 9999999999L },
                { "float", 3.14f },
                { "double", 2.718281828 }
            });
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"int\":42"));
            Assert.That(json, Does.Contain("\"long\":9999999999"));
        }

        [Test]
        public void Serialize_ArrayValues()
        {
            var response = JsonRpcResponse.Success("1", new Dictionary<string, object>
            {
                { "position", new List<object> { 1.0, 2.0, 3.0 } }
            });
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\"position\":[1,2,3]"));
        }

        [Test]
        public void Serialize_StringEscaping()
        {
            var response = JsonRpcResponse.Success("1", new Dictionary<string, object>
            {
                { "message", "line1\nline2\ttab\"quote" }
            });
            string json = JsonRpcSerializer.Serialize(response);

            Assert.That(json, Does.Contain("\\n"));
            Assert.That(json, Does.Contain("\\t"));
            Assert.That(json, Does.Contain("\\\"quote"));
        }

        // --- MiniJson ---

        [Test]
        public void MiniJson_Deserialize_Null()
        {
            Assert.IsNull(MiniJson.Deserialize(null));
            Assert.IsNull(MiniJson.Deserialize(""));
        }

        [Test]
        public void MiniJson_Deserialize_Object()
        {
            var result = MiniJson.Deserialize("{\"key\":\"value\",\"num\":42}") as Dictionary<string, object>;

            Assert.IsNotNull(result);
            Assert.AreEqual("value", result["key"]);
            Assert.AreEqual(42, result["num"]);
        }

        [Test]
        public void MiniJson_Deserialize_Array()
        {
            var result = MiniJson.Deserialize("[1,2,3]") as List<object>;

            Assert.IsNotNull(result);
            Assert.AreEqual(3, result.Count);
            Assert.AreEqual(1, result[0]);
            Assert.AreEqual(2, result[1]);
            Assert.AreEqual(3, result[2]);
        }

        [Test]
        public void MiniJson_Deserialize_NestedObject()
        {
            var result = MiniJson.Deserialize("{\"data\":{\"nested\":true}}") as Dictionary<string, object>;

            Assert.IsNotNull(result);
            var nested = result["data"] as Dictionary<string, object>;
            Assert.IsNotNull(nested);
            Assert.AreEqual(true, nested["nested"]);
        }

        [Test]
        public void MiniJson_RoundTrip()
        {
            var original = new Dictionary<string, object>
            {
                { "name", "Test" },
                { "count", 42 },
                { "active", true },
                { "data", new Dictionary<string, object> { { "x", 1.5 } } }
            };

            string json = MiniJson.Serialize(original);
            var restored = MiniJson.Deserialize(json) as Dictionary<string, object>;

            Assert.IsNotNull(restored);
            Assert.AreEqual("Test", restored["name"]);
            Assert.AreEqual(42, restored["count"]);
            Assert.AreEqual(true, restored["active"]);
        }

        // --- ErrorCode Constants ---

        [Test]
        public void ErrorCodes_StandardValues()
        {
            Assert.AreEqual(-32700, ErrorCode.ParseError);
            Assert.AreEqual(-32600, ErrorCode.InvalidRequest);
            Assert.AreEqual(-32601, ErrorCode.MethodNotFound);
            Assert.AreEqual(-32602, ErrorCode.InvalidParams);
            Assert.AreEqual(-32603, ErrorCode.InternalError);
        }

        [Test]
        public void ErrorCodes_UnitySpecific()
        {
            Assert.AreEqual(-32000, ErrorCode.UnityNotReady);
            Assert.AreEqual(-32001, ErrorCode.GameObjectNotFound);
            Assert.AreEqual(-32002, ErrorCode.ComponentNotFound);
            Assert.AreEqual(-32003, ErrorCode.SceneNotLoaded);
            Assert.AreEqual(-32004, ErrorCode.CompileError);
            Assert.AreEqual(-32005, ErrorCode.PlayModeRequired);
            Assert.AreEqual(-32006, ErrorCode.EditModeRequired);
            Assert.AreEqual(-32007, ErrorCode.AssetNotFound);
            Assert.AreEqual(-32008, ErrorCode.PermissionDenied);
            Assert.AreEqual(-32009, ErrorCode.Timeout);
        }
    }
}
