#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;

namespace Strada.Mcp.Tests.Editor
{
    /// <summary>
    /// Pure C# tests for CommandDispatcher routing and error handling.
    /// No Unity runtime dependencies required beyond the Editor assembly reference.
    /// </summary>
    [TestFixture]
    public class CommandDispatcherTests
    {
        private CommandDispatcher _dispatcher;

        [SetUp]
        public void SetUp()
        {
            _dispatcher = new CommandDispatcher();
            JsonRpcRequest.ResetIdCounter();
        }

        // --- Registration ---

        [Test]
        public void RegisterHandler_IncreasesHandlerCount()
        {
            Assert.AreEqual(0, _dispatcher.HandlerCount);

            _dispatcher.RegisterHandler("test.method", _ => "ok");

            Assert.AreEqual(1, _dispatcher.HandlerCount);
        }

        [Test]
        public void RegisterHandler_MultipleHandlers()
        {
            _dispatcher.RegisterHandler("method1", _ => "1");
            _dispatcher.RegisterHandler("method2", _ => "2");
            _dispatcher.RegisterHandler("method3", _ => "3");

            Assert.AreEqual(3, _dispatcher.HandlerCount);
        }

        [Test]
        public void RegisterHandler_OverwritesSameMethod()
        {
            _dispatcher.RegisterHandler("test", _ => "first");
            _dispatcher.RegisterHandler("test", _ => "second");

            Assert.AreEqual(1, _dispatcher.HandlerCount);
        }

        [Test]
        public void RegisterHandler_NullMethod_Throws()
        {
            Assert.Throws<ArgumentNullException>(() =>
                _dispatcher.RegisterHandler(null, _ => "ok"));
        }

        [Test]
        public void RegisterHandler_EmptyMethod_Throws()
        {
            Assert.Throws<ArgumentNullException>(() =>
                _dispatcher.RegisterHandler("", _ => "ok"));
        }

        [Test]
        public void RegisterHandler_NullHandler_Throws()
        {
            Assert.Throws<ArgumentNullException>(() =>
                _dispatcher.RegisterHandler("test", null));
        }

        // --- Unregistration ---

        [Test]
        public void UnregisterHandler_RemovesHandler()
        {
            _dispatcher.RegisterHandler("test", _ => "ok");
            Assert.IsTrue(_dispatcher.HasHandler("test"));

            bool removed = _dispatcher.UnregisterHandler("test");

            Assert.IsTrue(removed);
            Assert.IsFalse(_dispatcher.HasHandler("test"));
            Assert.AreEqual(0, _dispatcher.HandlerCount);
        }

        [Test]
        public void UnregisterHandler_NotFound_ReturnsFalse()
        {
            bool removed = _dispatcher.UnregisterHandler("nonexistent");

            Assert.IsFalse(removed);
        }

        // --- HasHandler ---

        [Test]
        public void HasHandler_RegisteredMethod_ReturnsTrue()
        {
            _dispatcher.RegisterHandler("test", _ => "ok");

            Assert.IsTrue(_dispatcher.HasHandler("test"));
        }

        [Test]
        public void HasHandler_UnregisteredMethod_ReturnsFalse()
        {
            Assert.IsFalse(_dispatcher.HasHandler("nonexistent"));
        }

        // --- RegisteredMethods ---

        [Test]
        public void RegisteredMethods_ReturnsAllMethodNames()
        {
            _dispatcher.RegisterHandler("a.method", _ => null);
            _dispatcher.RegisterHandler("b.method", _ => null);

            var methods = _dispatcher.RegisteredMethods.ToList();

            Assert.AreEqual(2, methods.Count);
            Assert.Contains("a.method", methods);
            Assert.Contains("b.method", methods);
        }

        // --- Dispatch ---

        [Test]
        public void Dispatch_CallsCorrectHandler()
        {
            bool handlerCalled = false;
            _dispatcher.RegisterHandler("test.method", _ =>
            {
                handlerCalled = true;
                return new Dictionary<string, object> { { "ok", true } };
            });

            var request = new JsonRpcRequest { id = "1", method = "test.method" };
            var response = _dispatcher.Dispatch(request);

            Assert.IsTrue(handlerCalled);
            Assert.IsNotNull(response);
            Assert.AreEqual("1", response.id);
            Assert.IsNull(response.error);
            Assert.IsNotNull(response.result);
        }

        [Test]
        public void Dispatch_PassesParams()
        {
            Dictionary<string, object> receivedParams = null;
            _dispatcher.RegisterHandler("test", p =>
            {
                receivedParams = p;
                return "ok";
            });

            var parameters = new Dictionary<string, object> { { "name", "TestObj" } };
            var request = new JsonRpcRequest
            {
                id = "1",
                method = "test",
                @params = parameters
            };
            _dispatcher.Dispatch(request);

            Assert.IsNotNull(receivedParams);
            Assert.AreEqual("TestObj", receivedParams["name"]);
        }

        [Test]
        public void Dispatch_NullParams_PassesEmptyDict()
        {
            Dictionary<string, object> receivedParams = null;
            _dispatcher.RegisterHandler("test", p =>
            {
                receivedParams = p;
                return "ok";
            });

            var request = new JsonRpcRequest
            {
                id = "1",
                method = "test",
                @params = null
            };
            _dispatcher.Dispatch(request);

            Assert.IsNotNull(receivedParams);
            Assert.AreEqual(0, receivedParams.Count);
        }

        [Test]
        public void Dispatch_NullRequest_ReturnsInvalidRequest()
        {
            var response = _dispatcher.Dispatch(null);

            Assert.IsNotNull(response);
            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.InvalidRequest, response.error.code);
        }

        [Test]
        public void Dispatch_NullMethod_ReturnsInvalidRequest()
        {
            var request = new JsonRpcRequest { id = "1", method = null };
            var response = _dispatcher.Dispatch(request);

            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.InvalidRequest, response.error.code);
        }

        [Test]
        public void Dispatch_EmptyMethod_ReturnsInvalidRequest()
        {
            var request = new JsonRpcRequest { id = "1", method = "" };
            var response = _dispatcher.Dispatch(request);

            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.InvalidRequest, response.error.code);
        }

        [Test]
        public void Dispatch_UnknownMethod_ReturnsMethodNotFound()
        {
            var request = new JsonRpcRequest { id = "1", method = "nonexistent" };
            var response = _dispatcher.Dispatch(request);

            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.MethodNotFound, response.error.code);
            Assert.That(response.error.message, Does.Contain("nonexistent"));
        }

        [Test]
        public void Dispatch_HandlerThrowsJsonRpcException_ReturnsTypedError()
        {
            _dispatcher.RegisterHandler("test", _ =>
            {
                throw new JsonRpcException(ErrorCode.GameObjectNotFound, "Not found: Cube");
            });

            var request = new JsonRpcRequest { id = "1", method = "test" };
            var response = _dispatcher.Dispatch(request);

            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.GameObjectNotFound, response.error.code);
            Assert.AreEqual("Not found: Cube", response.error.message);
        }

        [Test]
        public void Dispatch_HandlerThrowsJsonRpcException_WithData()
        {
            var errorData = new Dictionary<string, object> { { "field", "name" } };
            _dispatcher.RegisterHandler("test", _ =>
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "bad param", errorData);
            });

            var request = new JsonRpcRequest { id = "1", method = "test" };
            var response = _dispatcher.Dispatch(request);

            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.InvalidParams, response.error.code);
            Assert.IsNotNull(response.error.data);
        }

        [Test]
        public void Dispatch_HandlerThrowsGenericException_ReturnsInternalError()
        {
            _dispatcher.RegisterHandler("test", _ =>
            {
                throw new InvalidOperationException("something broke");
            });

            var request = new JsonRpcRequest { id = "1", method = "test" };
            var response = _dispatcher.Dispatch(request);

            Assert.IsNotNull(response.error);
            Assert.AreEqual(ErrorCode.InternalError, response.error.code);
            Assert.That(response.error.message, Does.Contain("something broke"));
        }

        [Test]
        public void Dispatch_PreservesRequestId()
        {
            _dispatcher.RegisterHandler("test", _ => "ok");

            var request = new JsonRpcRequest { id = "custom-id-42", method = "test" };
            var response = _dispatcher.Dispatch(request);

            Assert.AreEqual("custom-id-42", response.id);
        }

        // --- ProcessMessage (end-to-end string processing) ---

        [Test]
        public void ProcessMessage_ValidRequest_ReturnsJsonResponse()
        {
            _dispatcher.RegisterHandler("echo", p =>
                new Dictionary<string, object> { { "echo", p.ContainsKey("msg") ? p["msg"] : null } });

            string rawRequest = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"echo\",\"params\":{\"msg\":\"hello\"}}";
            string rawResponse = _dispatcher.ProcessMessage(rawRequest);

            Assert.IsNotNull(rawResponse);
            Assert.That(rawResponse, Does.Contain("\"result\""));
            Assert.That(rawResponse, Does.Contain("\"echo\":\"hello\""));
        }

        [Test]
        public void ProcessMessage_Notification_ReturnsNull()
        {
            // Notifications (no id) should not produce a response
            string rawNotification = "{\"jsonrpc\":\"2.0\",\"method\":\"unity.sceneChanged\",\"params\":{\"scene\":\"Main\"}}";
            string response = _dispatcher.ProcessMessage(rawNotification);

            Assert.IsNull(response);
        }

        [Test]
        public void ProcessMessage_InvalidJson_ReturnsParseError()
        {
            string rawResponse = _dispatcher.ProcessMessage("{not valid json");

            Assert.IsNotNull(rawResponse);
            Assert.That(rawResponse, Does.Contain($"\"code\":{ErrorCode.ParseError}"));
        }

        [Test]
        public void ProcessMessage_MethodNotFound_ReturnsError()
        {
            string raw = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"unknown.method\"}";
            string response = _dispatcher.ProcessMessage(raw);

            Assert.IsNotNull(response);
            Assert.That(response, Does.Contain($"\"code\":{ErrorCode.MethodNotFound}"));
        }

        [Test]
        public void ProcessMessage_Response_ReturnsNull()
        {
            // A JSON-RPC response received should not produce another response
            string rawResponse = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"result\":{\"ok\":true}}";
            string result = _dispatcher.ProcessMessage(rawResponse);

            Assert.IsNull(result);
        }
    }
}
#endif
