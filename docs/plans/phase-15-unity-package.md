# Phase 15: Unity Package — com.strada.mcp (C#)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the C# Unity Editor package that runs inside Unity and communicates with the MCP server via TCP. This is a complete UPM package with NUnit tests, supporting all 36 bridge-dependent tools via JSON-RPC dispatch, plus event broadcasting for real-time editor state changes.

**Architecture:** The package runs a TCP server inside the Unity Editor, bound to localhost. The MCP server (TypeScript) connects as a client. Commands arrive as JSON-RPC requests, are dispatched to handler classes on Unity's main thread, and results are returned as JSON-RPC responses. Events flow from Unity to the MCP server via the same TCP connection.

**Tech Stack:** C# 9.0, Unity 2021.3+ (LTS), NUnit, UnityEditor API, System.Net.Sockets, EditorApplication.update

**Depends On:** Phase 7 (Unity Bridge Protocol — defines message framing and JSON-RPC conventions)

**Parallel With:** Phase 8 (Unity Runtime Tools — TypeScript side of bridge-dependent tools)

---

### Task 1: Package manifest + folder structure + assembly definitions

**Files:**
- Create: `unity-package/com.strada.mcp/package.json`
- Create: `unity-package/com.strada.mcp/README.md`
- Create: `unity-package/com.strada.mcp/CHANGELOG.md`
- Create: `unity-package/com.strada.mcp/LICENSE`
- Create: `unity-package/com.strada.mcp/Runtime/StradaMcp.Runtime.asmdef`
- Create: `unity-package/com.strada.mcp/Editor/StradaMcp.Editor.asmdef`
- Create: `unity-package/com.strada.mcp/Tests/Editor/StradaMcp.Editor.Tests.asmdef`

**Step 1: Create directory structure**

```bash
mkdir -p unity-package/com.strada.mcp/{Runtime,Editor/{Server,Commands,Events,UI},Tests/Editor}
```

**Step 2: Create package.json (UPM manifest)**

```json
{
  "name": "com.strada.mcp",
  "version": "1.0.0",
  "displayName": "Strada MCP Bridge",
  "description": "Bridge between Strada.MCP server and Unity Editor. Enables AI-powered development tools via the Model Context Protocol.",
  "unity": "2021.3",
  "unityRelease": "0f1",
  "documentationUrl": "https://github.com/nicookanu/Strada.MCP",
  "changelogUrl": "https://github.com/nicookanu/Strada.MCP/blob/main/CHANGELOG.md",
  "licensesUrl": "https://github.com/nicookanu/Strada.MCP/blob/main/LICENSE",
  "keywords": [
    "mcp",
    "ai",
    "strada",
    "bridge",
    "editor-tools"
  ],
  "author": {
    "name": "Nico Okanu",
    "url": "https://github.com/nicookanu"
  },
  "type": "tool"
}
```

**Step 3: Create Runtime assembly definition**

```json
// Runtime/StradaMcp.Runtime.asmdef
{
  "name": "StradaMcp.Runtime",
  "rootNamespace": "Strada.Mcp.Runtime",
  "references": [],
  "includePlatforms": [],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": false,
  "precompiledReferences": [],
  "autoReferenced": true,
  "defineConstraints": [],
  "versionDefines": [],
  "noEngineReferences": false
}
```

**Step 4: Create Editor assembly definition**

```json
// Editor/StradaMcp.Editor.asmdef
{
  "name": "StradaMcp.Editor",
  "rootNamespace": "Strada.Mcp.Editor",
  "references": [
    "StradaMcp.Runtime"
  ],
  "includePlatforms": [
    "Editor"
  ],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": false,
  "precompiledReferences": [],
  "autoReferenced": true,
  "defineConstraints": [],
  "versionDefines": [],
  "noEngineReferences": false
}
```

**Step 5: Create Test assembly definition**

```json
// Tests/Editor/StradaMcp.Editor.Tests.asmdef
{
  "name": "StradaMcp.Editor.Tests",
  "rootNamespace": "Strada.Mcp.Editor.Tests",
  "references": [
    "StradaMcp.Runtime",
    "StradaMcp.Editor",
    "UnityEngine.TestRunner",
    "UnityEditor.TestRunner"
  ],
  "includePlatforms": [
    "Editor"
  ],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": true,
  "precompiledReferences": [
    "nunit.framework.dll"
  ],
  "autoReferenced": false,
  "defineConstraints": [
    "UNITY_INCLUDE_TESTS"
  ],
  "versionDefines": [],
  "noEngineReferences": false
}
```

**Step 6: Create LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 Nico Okanu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 7: Create stub README.md and CHANGELOG.md**

```markdown
// README.md
# Strada MCP Bridge — Unity Package

Unity Editor package for the Strada.MCP server. Provides a TCP bridge between the MCP server and the Unity Editor API.

## Installation

Add via UPM (Unity Package Manager):
- Open Window > Package Manager
- Click "+" > "Add package from git URL..."
- Enter: `https://github.com/nicookanu/Strada.MCP.git?path=unity-package/com.strada.mcp`

## Usage

After installation, go to **Strada > MCP > Settings** to configure the bridge.
```

```markdown
// CHANGELOG.md
# Changelog

## [1.0.0] - 2026-03-13
### Added
- TCP bridge server with configurable port (default 7691)
- JSON-RPC handler for all 36 bridge-dependent tools
- Event broadcaster (scene, console, compile, playmode, selection)
- Settings window with connection status indicator
- Editor menu items under Strada/MCP/
```

**Step 8: Commit**

```bash
git add unity-package/
git commit -m "feat(unity-pkg): initialize com.strada.mcp package structure and manifests"
```

---

### Task 2: Message framer (length-prefix protocol matching Phase 7)

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/Server/MessageFramer.cs`
- Create: `unity-package/com.strada.mcp/Tests/Editor/MessageFramerTests.cs`

**Step 1: Write the failing test**

```csharp
// Tests/Editor/MessageFramerTests.cs
using System.Text;
using NUnit.Framework;
using Strada.Mcp.Editor.Server;

namespace Strada.Mcp.Editor.Tests
{
    [TestFixture]
    public class MessageFramerTests
    {
        [Test]
        public void Frame_ShouldPrependLengthPrefix()
        {
            string message = "{\"jsonrpc\":\"2.0\",\"id\":1}";
            byte[] framed = MessageFramer.Frame(message);

            // First 4 bytes = big-endian length of the JSON payload
            int length = (framed[0] << 24) | (framed[1] << 16) | (framed[2] << 8) | framed[3];
            Assert.AreEqual(Encoding.UTF8.GetByteCount(message), length);

            // Remaining bytes = UTF-8 encoded JSON
            string payload = Encoding.UTF8.GetString(framed, 4, framed.Length - 4);
            Assert.AreEqual(message, payload);
        }

        [Test]
        public void Frame_EmptyMessage_ShouldHaveZeroLength()
        {
            byte[] framed = MessageFramer.Frame("");
            int length = (framed[0] << 24) | (framed[1] << 16) | (framed[2] << 8) | framed[3];
            Assert.AreEqual(0, length);
            Assert.AreEqual(4, framed.Length);
        }

        [Test]
        public void FrameBuffer_ShouldExtractCompleteMessage()
        {
            var buffer = new FrameBuffer();
            string original = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"test\"}";
            byte[] framed = MessageFramer.Frame(original);

            buffer.Append(framed, framed.Length);

            Assert.IsTrue(buffer.TryExtract(out string message));
            Assert.AreEqual(original, message);
        }

        [Test]
        public void FrameBuffer_PartialData_ShouldNotExtract()
        {
            var buffer = new FrameBuffer();
            string original = "{\"jsonrpc\":\"2.0\"}";
            byte[] framed = MessageFramer.Frame(original);

            // Send only first 3 bytes (incomplete length prefix)
            buffer.Append(framed, 3);

            Assert.IsFalse(buffer.TryExtract(out string message));
            Assert.IsNull(message);
        }

        [Test]
        public void FrameBuffer_MultipleMessages_ShouldExtractSequentially()
        {
            var buffer = new FrameBuffer();

            string msg1 = "{\"id\":1}";
            string msg2 = "{\"id\":2}";
            byte[] framed1 = MessageFramer.Frame(msg1);
            byte[] framed2 = MessageFramer.Frame(msg2);

            // Concatenate both frames into one buffer
            byte[] combined = new byte[framed1.Length + framed2.Length];
            System.Array.Copy(framed1, 0, combined, 0, framed1.Length);
            System.Array.Copy(framed2, 0, combined, framed1.Length, framed2.Length);

            buffer.Append(combined, combined.Length);

            Assert.IsTrue(buffer.TryExtract(out string first));
            Assert.AreEqual(msg1, first);
            Assert.IsTrue(buffer.TryExtract(out string second));
            Assert.AreEqual(msg2, second);
            Assert.IsFalse(buffer.TryExtract(out _));
        }

        [Test]
        public void FrameBuffer_SplitAcrossChunks_ShouldReassemble()
        {
            var buffer = new FrameBuffer();
            string original = "{\"method\":\"unity.create_gameobject\",\"params\":{}}";
            byte[] framed = MessageFramer.Frame(original);

            // Split into two chunks mid-payload
            int splitAt = 10;
            byte[] chunk1 = new byte[splitAt];
            byte[] chunk2 = new byte[framed.Length - splitAt];
            System.Array.Copy(framed, 0, chunk1, 0, splitAt);
            System.Array.Copy(framed, splitAt, chunk2, 0, chunk2.Length);

            buffer.Append(chunk1, chunk1.Length);
            Assert.IsFalse(buffer.TryExtract(out _));

            buffer.Append(chunk2, chunk2.Length);
            Assert.IsTrue(buffer.TryExtract(out string message));
            Assert.AreEqual(original, message);
        }

        [Test]
        public void FrameBuffer_UnicodeMessage_ShouldHandleMultiByteChars()
        {
            var buffer = new FrameBuffer();
            string original = "{\"name\":\"Sahne Objesi\"}";
            byte[] framed = MessageFramer.Frame(original);

            buffer.Append(framed, framed.Length);
            Assert.IsTrue(buffer.TryExtract(out string message));
            Assert.AreEqual(original, message);
        }
    }
}
```

**Step 2: Run test to verify it fails**

Open Unity, run tests via Test Runner window.
Expected: FAIL — classes not found.

**Step 3: Write implementation**

```csharp
// Editor/Server/MessageFramer.cs
using System;
using System.Collections.Generic;
using System.Text;

namespace Strada.Mcp.Editor.Server
{
    /// <summary>
    /// Length-prefix message framing for TCP communication.
    /// Protocol: [4-byte big-endian length][UTF-8 JSON payload]
    /// Matches the MCP server's framing protocol (Phase 7).
    /// </summary>
    public static class MessageFramer
    {
        public const int HeaderSize = 4;

        /// <summary>
        /// Wraps a JSON string in a length-prefixed frame.
        /// </summary>
        public static byte[] Frame(string json)
        {
            byte[] payload = Encoding.UTF8.GetBytes(json);
            byte[] frame = new byte[HeaderSize + payload.Length];

            // Big-endian 32-bit length
            frame[0] = (byte)((payload.Length >> 24) & 0xFF);
            frame[1] = (byte)((payload.Length >> 16) & 0xFF);
            frame[2] = (byte)((payload.Length >> 8) & 0xFF);
            frame[3] = (byte)(payload.Length & 0xFF);

            Array.Copy(payload, 0, frame, HeaderSize, payload.Length);
            return frame;
        }
    }

    /// <summary>
    /// Accumulates incoming TCP bytes and extracts complete framed messages.
    /// Thread-safe for single-producer (TCP read) single-consumer (main thread).
    /// </summary>
    public class FrameBuffer
    {
        private readonly List<byte> _buffer = new List<byte>();
        private readonly object _lock = new object();

        /// <summary>
        /// Appends raw bytes received from the TCP socket.
        /// </summary>
        public void Append(byte[] data, int count)
        {
            lock (_lock)
            {
                for (int i = 0; i < count; i++)
                    _buffer.Add(data[i]);
            }
        }

        /// <summary>
        /// Attempts to extract one complete message from the buffer.
        /// Returns true if a message was available, false otherwise.
        /// </summary>
        public bool TryExtract(out string message)
        {
            lock (_lock)
            {
                message = null;

                if (_buffer.Count < MessageFramer.HeaderSize)
                    return false;

                int length = (_buffer[0] << 24) | (_buffer[1] << 16) |
                             (_buffer[2] << 8) | _buffer[3];

                if (_buffer.Count < MessageFramer.HeaderSize + length)
                    return false;

                byte[] payload = new byte[length];
                for (int i = 0; i < length; i++)
                    payload[i] = _buffer[MessageFramer.HeaderSize + i];

                _buffer.RemoveRange(0, MessageFramer.HeaderSize + length);

                message = Encoding.UTF8.GetString(payload);
                return true;
            }
        }

        /// <summary>
        /// Returns the current buffered byte count (for diagnostics).
        /// </summary>
        public int Count
        {
            get { lock (_lock) { return _buffer.Count; } }
        }

        /// <summary>
        /// Clears all buffered data.
        /// </summary>
        public void Clear()
        {
            lock (_lock) { _buffer.Clear(); }
        }
    }
}
```

**Step 4: Run tests**

Open Unity Test Runner, run `MessageFramerTests`.
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/Server/MessageFramer.cs
git add unity-package/com.strada.mcp/Tests/Editor/MessageFramerTests.cs
git commit -m "feat(unity-pkg): add length-prefix message framer with frame buffer"
```

---

### Task 3: TCP server (non-blocking, Unity main thread safe)

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/Server/TcpBridgeServer.cs`

**Step 1: Write implementation**

The TCP server must be compatible with Unity's single-threaded editor model. It uses `EditorApplication.update` to poll for connections and data, and `System.Net.Sockets.TcpListener` in non-blocking mode.

```csharp
// Editor/Server/TcpBridgeServer.cs
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Server
{
    /// <summary>
    /// Non-blocking TCP server that runs inside the Unity Editor.
    /// Binds to localhost only for security.
    /// Uses EditorApplication.update for main-thread polling.
    /// </summary>
    public class TcpBridgeServer
    {
        public event Action<string> OnMessageReceived;
        public event Action OnClientConnected;
        public event Action OnClientDisconnected;

        private TcpListener _listener;
        private TcpClient _client;
        private NetworkStream _stream;
        private readonly FrameBuffer _frameBuffer = new FrameBuffer();
        private readonly byte[] _readBuffer = new byte[65536];
        private bool _isRunning;
        private int _port;

        public bool IsRunning => _isRunning;
        public bool IsClientConnected => _client?.Connected == true;
        public int Port => _port;

        /// <summary>
        /// Starts the TCP server on the specified port (localhost only).
        /// </summary>
        public void Start(int port = 7691)
        {
            if (_isRunning)
            {
                Debug.LogWarning("[StradaMCP] Server already running.");
                return;
            }

            _port = port;

            try
            {
                _listener = new TcpListener(IPAddress.Loopback, port);
                _listener.Server.SetSocketOption(
                    SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _listener.Start();
                _isRunning = true;

                EditorApplication.update += Poll;
                Debug.Log($"[StradaMCP] Server started on 127.0.0.1:{port}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[StradaMCP] Failed to start server: {ex.Message}");
                _isRunning = false;
            }
        }

        /// <summary>
        /// Stops the server and disconnects any active client.
        /// </summary>
        public void Stop()
        {
            if (!_isRunning) return;

            EditorApplication.update -= Poll;
            _isRunning = false;

            DisconnectClient();

            try
            {
                _listener?.Stop();
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[StradaMCP] Error stopping listener: {ex.Message}");
            }

            _listener = null;
            Debug.Log("[StradaMCP] Server stopped.");
        }

        /// <summary>
        /// Sends a framed JSON message to the connected client.
        /// Used by EventBroadcaster to push events.
        /// </summary>
        public void Send(string json)
        {
            if (_client == null || !_client.Connected || _stream == null)
                return;

            try
            {
                byte[] frame = MessageFramer.Frame(json);
                _stream.Write(frame, 0, frame.Length);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[StradaMCP] Send failed: {ex.Message}");
                DisconnectClient();
            }
        }

        /// <summary>
        /// Called every editor frame via EditorApplication.update.
        /// Polls for new connections and incoming data without blocking.
        /// </summary>
        private void Poll()
        {
            if (!_isRunning) return;

            // Accept pending connection
            if (_client == null || !_client.Connected)
            {
                if (_listener.Pending())
                {
                    AcceptClient();
                }
            }

            // Read available data
            if (_client != null && _client.Connected && _stream != null)
            {
                ReadAvailableData();
            }
        }

        private void AcceptClient()
        {
            try
            {
                // Disconnect previous client if any
                DisconnectClient();

                _client = _listener.AcceptTcpClient();
                _client.NoDelay = true;
                _client.ReceiveTimeout = 0; // Non-blocking reads via Available check
                _stream = _client.GetStream();
                _frameBuffer.Clear();

                Debug.Log($"[StradaMCP] Client connected from {_client.Client.RemoteEndPoint}");
                OnClientConnected?.Invoke();
            }
            catch (Exception ex)
            {
                Debug.LogError($"[StradaMCP] Accept failed: {ex.Message}");
            }
        }

        private void ReadAvailableData()
        {
            try
            {
                if (!_stream.DataAvailable) return;

                int bytesRead = _stream.Read(_readBuffer, 0, _readBuffer.Length);

                if (bytesRead == 0)
                {
                    // Client disconnected gracefully
                    DisconnectClient();
                    return;
                }

                _frameBuffer.Append(_readBuffer, bytesRead);

                // Extract all complete messages
                while (_frameBuffer.TryExtract(out string message))
                {
                    OnMessageReceived?.Invoke(message);
                }
            }
            catch (System.IO.IOException)
            {
                // Connection reset
                DisconnectClient();
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[StradaMCP] Read error: {ex.Message}");
                DisconnectClient();
            }
        }

        private void DisconnectClient()
        {
            bool wasConnected = _client?.Connected == true;

            try { _stream?.Close(); } catch { }
            try { _client?.Close(); } catch { }

            _stream = null;
            _client = null;
            _frameBuffer.Clear();

            if (wasConnected)
            {
                Debug.Log("[StradaMCP] Client disconnected.");
                OnClientDisconnected?.Invoke();
            }
        }
    }
}
```

Note: TcpBridgeServer is not easily unit-testable in isolation (requires network). It will be covered by the integration tests in Task 3's manual test and Phase 17's mock bridge tests. The core framing logic is tested in Task 2.

**Step 2: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/Server/TcpBridgeServer.cs
git commit -m "feat(unity-pkg): add non-blocking TCP bridge server with EditorApplication.update polling"
```

---

### Task 4: JSON-RPC handler + command registry

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/Commands/ICommandHandler.cs`
- Create: `unity-package/com.strada.mcp/Editor/Commands/CommandRegistry.cs`
- Create: `unity-package/com.strada.mcp/Editor/Server/JsonRpcHandler.cs`
- Create: `unity-package/com.strada.mcp/Tests/Editor/JsonRpcHandlerTests.cs`
- Create: `unity-package/com.strada.mcp/Tests/Editor/CommandRegistryTests.cs`

**Step 1: Write the failing tests**

```csharp
// Tests/Editor/CommandRegistryTests.cs
using System.Collections.Generic;
using NUnit.Framework;
using Strada.Mcp.Editor.Commands;

namespace Strada.Mcp.Editor.Tests
{
    [TestFixture]
    public class CommandRegistryTests
    {
        [Test]
        public void Register_ShouldStoreHandler()
        {
            var registry = new CommandRegistry();
            registry.Register("unity.test", new MockCommandHandler("ok"));
            Assert.IsTrue(registry.HasCommand("unity.test"));
        }

        [Test]
        public void Register_Duplicate_ShouldThrow()
        {
            var registry = new CommandRegistry();
            registry.Register("unity.test", new MockCommandHandler("ok"));
            Assert.Throws<System.ArgumentException>(() =>
                registry.Register("unity.test", new MockCommandHandler("ok")));
        }

        [Test]
        public void Get_Registered_ShouldReturnHandler()
        {
            var registry = new CommandRegistry();
            var handler = new MockCommandHandler("result");
            registry.Register("unity.test", handler);
            Assert.AreEqual(handler, registry.Get("unity.test"));
        }

        [Test]
        public void Get_Unregistered_ShouldReturnNull()
        {
            var registry = new CommandRegistry();
            Assert.IsNull(registry.Get("unity.nonexistent"));
        }

        [Test]
        public void GetAllMethods_ShouldReturnRegisteredNames()
        {
            var registry = new CommandRegistry();
            registry.Register("unity.a", new MockCommandHandler("a"));
            registry.Register("unity.b", new MockCommandHandler("b"));
            var methods = registry.GetAllMethods();
            Assert.AreEqual(2, methods.Count);
            Assert.Contains("unity.a", methods);
            Assert.Contains("unity.b", methods);
        }

        private class MockCommandHandler : ICommandHandler
        {
            private readonly string _result;
            public MockCommandHandler(string result) { _result = result; }
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                return CommandResult.Success(_result);
            }
        }
    }
}
```

```csharp
// Tests/Editor/JsonRpcHandlerTests.cs
using System.Collections.Generic;
using NUnit.Framework;
using Strada.Mcp.Editor.Commands;
using Strada.Mcp.Editor.Server;

namespace Strada.Mcp.Editor.Tests
{
    [TestFixture]
    public class JsonRpcHandlerTests
    {
        private JsonRpcHandler _handler;
        private CommandRegistry _registry;

        [SetUp]
        public void SetUp()
        {
            _registry = new CommandRegistry();
            _handler = new JsonRpcHandler(_registry);
        }

        [Test]
        public void HandleRequest_ValidMethod_ShouldReturnResult()
        {
            _registry.Register("unity.test", new StaticHandler("hello"));

            string request = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"unity.test\",\"params\":{}}";
            string response = _handler.HandleRequest(request);

            Assert.That(response, Does.Contain("\"id\":1"));
            Assert.That(response, Does.Contain("\"result\""));
            Assert.That(response, Does.Contain("hello"));
            Assert.That(response, Does.Not.Contain("\"error\""));
        }

        [Test]
        public void HandleRequest_UnknownMethod_ShouldReturnMethodNotFound()
        {
            string request = "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"unity.nonexistent\",\"params\":{}}";
            string response = _handler.HandleRequest(request);

            Assert.That(response, Does.Contain("\"id\":2"));
            Assert.That(response, Does.Contain("\"error\""));
            Assert.That(response, Does.Contain("-32601")); // Method not found
        }

        [Test]
        public void HandleRequest_InvalidJson_ShouldReturnParseError()
        {
            string response = _handler.HandleRequest("not json at all {{{");

            Assert.That(response, Does.Contain("\"error\""));
            Assert.That(response, Does.Contain("-32700")); // Parse error
        }

        [Test]
        public void HandleRequest_MissingMethod_ShouldReturnInvalidRequest()
        {
            string request = "{\"jsonrpc\":\"2.0\",\"id\":3}";
            string response = _handler.HandleRequest(request);

            Assert.That(response, Does.Contain("\"error\""));
            Assert.That(response, Does.Contain("-32600")); // Invalid request
        }

        [Test]
        public void HandleRequest_HandlerThrows_ShouldReturnInternalError()
        {
            _registry.Register("unity.throw", new ThrowingHandler());

            string request = "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"unity.throw\",\"params\":{}}";
            string response = _handler.HandleRequest(request);

            Assert.That(response, Does.Contain("\"id\":4"));
            Assert.That(response, Does.Contain("\"error\""));
            Assert.That(response, Does.Contain("-32603")); // Internal error
        }

        [Test]
        public void HandleRequest_WithParams_ShouldPassThroughToHandler()
        {
            var echoHandler = new EchoHandler();
            _registry.Register("unity.echo", echoHandler);

            string request = "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"unity.echo\",\"params\":{\"name\":\"TestObj\"}}";
            string response = _handler.HandleRequest(request);

            Assert.That(response, Does.Contain("\"result\""));
            Assert.That(response, Does.Contain("TestObj"));
        }

        [Test]
        public void HandleRequest_Notification_ShouldReturnNull()
        {
            // JSON-RPC notifications have no "id" field — no response expected
            _registry.Register("unity.notify", new StaticHandler("ok"));

            string request = "{\"jsonrpc\":\"2.0\",\"method\":\"unity.notify\",\"params\":{}}";
            string response = _handler.HandleRequest(request);

            Assert.IsNull(response);
        }

        // --- Test helper handlers ---

        private class StaticHandler : ICommandHandler
        {
            private readonly string _value;
            public StaticHandler(string value) { _value = value; }
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                return CommandResult.Success(_value);
            }
        }

        private class ThrowingHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                throw new System.InvalidOperationException("Intentional test error");
            }
        }

        private class EchoHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                if (parameters.TryGetValue("name", out object name))
                    return CommandResult.Success(name.ToString());
                return CommandResult.Error(-1, "Missing name parameter");
            }
        }
    }
}
```

**Step 2: Run tests to verify they fail**

Expected: FAIL — types not found.

**Step 3: Write implementations**

```csharp
// Editor/Commands/ICommandHandler.cs
using System.Collections.Generic;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Represents a result from executing a bridge command.
    /// </summary>
    public class CommandResult
    {
        public bool IsSuccess { get; private set; }
        public object Data { get; private set; }
        public int ErrorCode { get; private set; }
        public string ErrorMessage { get; private set; }

        public static CommandResult Success(object data)
        {
            return new CommandResult { IsSuccess = true, Data = data };
        }

        public static CommandResult Error(int code, string message)
        {
            return new CommandResult
            {
                IsSuccess = false,
                ErrorCode = code,
                ErrorMessage = message
            };
        }
    }

    /// <summary>
    /// Interface for all bridge command handlers.
    /// Each handler receives parsed JSON-RPC params and returns a CommandResult.
    /// Handlers execute on Unity's main thread.
    /// </summary>
    public interface ICommandHandler
    {
        CommandResult Execute(Dictionary<string, object> parameters);
    }
}
```

```csharp
// Editor/Commands/CommandRegistry.cs
using System;
using System.Collections.Generic;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Maps JSON-RPC method names to ICommandHandler instances.
    /// </summary>
    public class CommandRegistry
    {
        private readonly Dictionary<string, ICommandHandler> _handlers =
            new Dictionary<string, ICommandHandler>();

        /// <summary>
        /// Registers a handler for the given method name.
        /// </summary>
        public void Register(string method, ICommandHandler handler)
        {
            if (_handlers.ContainsKey(method))
                throw new ArgumentException($"Command '{method}' is already registered.");
            _handlers[method] = handler;
        }

        /// <summary>
        /// Returns the handler for the given method, or null if not found.
        /// </summary>
        public ICommandHandler Get(string method)
        {
            _handlers.TryGetValue(method, out var handler);
            return handler;
        }

        /// <summary>
        /// Returns true if a handler is registered for the given method.
        /// </summary>
        public bool HasCommand(string method)
        {
            return _handlers.ContainsKey(method);
        }

        /// <summary>
        /// Returns a list of all registered method names.
        /// </summary>
        public List<string> GetAllMethods()
        {
            return new List<string>(_handlers.Keys);
        }
    }
}
```

```csharp
// Editor/Server/JsonRpcHandler.cs
using System;
using System.Collections.Generic;
using Strada.Mcp.Editor.Commands;
using UnityEngine;

namespace Strada.Mcp.Editor.Server
{
    /// <summary>
    /// Parses incoming JSON-RPC 2.0 requests and dispatches to CommandRegistry.
    /// Returns JSON-RPC 2.0 response strings.
    ///
    /// Error codes follow JSON-RPC 2.0 spec:
    ///   -32700  Parse error
    ///   -32600  Invalid request
    ///   -32601  Method not found
    ///   -32602  Invalid params
    ///   -32603  Internal error
    /// </summary>
    public class JsonRpcHandler
    {
        private readonly CommandRegistry _registry;

        public JsonRpcHandler(CommandRegistry registry)
        {
            _registry = registry;
        }

        /// <summary>
        /// Handles a raw JSON-RPC request string and returns a response string.
        /// Returns null for notifications (requests without an id).
        /// </summary>
        public string HandleRequest(string json)
        {
            Dictionary<string, object> request;

            // Parse JSON
            try
            {
                request = MiniJson.Deserialize(json) as Dictionary<string, object>;
                if (request == null)
                    return ErrorResponse(null, -32700, "Parse error: not a JSON object");
            }
            catch (Exception)
            {
                return ErrorResponse(null, -32700, "Parse error: invalid JSON");
            }

            // Extract id (may be null for notifications)
            object id = null;
            request.TryGetValue("id", out id);

            // Extract method
            if (!request.TryGetValue("method", out object methodObj) || !(methodObj is string method))
            {
                if (id == null) return null; // Malformed notification — silently drop
                return ErrorResponse(id, -32600, "Invalid request: missing 'method' field");
            }

            // Extract params (default to empty dict)
            Dictionary<string, object> parameters = new Dictionary<string, object>();
            if (request.TryGetValue("params", out object paramsObj) &&
                paramsObj is Dictionary<string, object> paramsDict)
            {
                parameters = paramsDict;
            }

            // Look up handler
            ICommandHandler handler = _registry.Get(method);
            if (handler == null)
            {
                if (id == null) return null; // Notification for unknown method
                return ErrorResponse(id, -32601, $"Method not found: {method}");
            }

            // Execute handler
            try
            {
                CommandResult result = handler.Execute(parameters);

                if (id == null) return null; // Notification — no response

                if (result.IsSuccess)
                    return SuccessResponse(id, result.Data);
                else
                    return ErrorResponse(id, result.ErrorCode, result.ErrorMessage);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[StradaMCP] Handler error for '{method}': {ex}");
                if (id == null) return null;
                return ErrorResponse(id, -32603, $"Internal error: {ex.Message}");
            }
        }

        private string SuccessResponse(object id, object result)
        {
            var response = new Dictionary<string, object>
            {
                { "jsonrpc", "2.0" },
                { "id", id },
                { "result", result }
            };
            return MiniJson.Serialize(response);
        }

        private string ErrorResponse(object id, int code, string message)
        {
            var error = new Dictionary<string, object>
            {
                { "code", code },
                { "message", message }
            };
            var response = new Dictionary<string, object>
            {
                { "jsonrpc", "2.0" },
                { "id", id },
                { "error", error }
            };
            return MiniJson.Serialize(response);
        }
    }

    /// <summary>
    /// Minimal JSON serializer/deserializer for Unity compatibility.
    /// Avoids dependency on Newtonsoft.Json (which may not be in all projects).
    /// Uses Unity's built-in JsonUtility as fallback pattern but implements
    /// a simple recursive descent parser for Dictionary<string, object> support.
    /// </summary>
    internal static class MiniJson
    {
        // Unity ships with a MiniJSON implementation, but we include a stub here.
        // In production, use UnityEngine.JsonUtility or Newtonsoft.Json if available.
        // For the reference implementation, we delegate to Unity's JsonUtility
        // with Dictionary wrapper support.

        public static object Deserialize(string json)
        {
            // Use Unity's built-in JSON parsing
            return Json.Deserialize(json);
        }

        public static string Serialize(object obj)
        {
            return Json.Serialize(obj);
        }
    }
}
```

Note: The `MiniJson`/`Json` class references Unity's built-in MiniJSON or a bundled copy. For the actual implementation, include a well-known public-domain MiniJSON.cs (Unity's wiki MiniJSON or equivalent). The implementation details of the JSON parser are outside the scope of this bridge — use any dependency-free C# JSON library.

**Step 4: Run tests**

Expected: PASS (12 tests — 5 CommandRegistry + 7 JsonRpcHandler)

**Step 5: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/Commands/ICommandHandler.cs
git add unity-package/com.strada.mcp/Editor/Commands/CommandRegistry.cs
git add unity-package/com.strada.mcp/Editor/Server/JsonRpcHandler.cs
git add unity-package/com.strada.mcp/Tests/Editor/CommandRegistryTests.cs
git add unity-package/com.strada.mcp/Tests/Editor/JsonRpcHandlerTests.cs
git commit -m "feat(unity-pkg): add JSON-RPC handler and command registry with full error code support"
```

---

### Task 5: Core command handlers (GameObject, Component, Scene)

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/Commands/GameObjectCommands.cs`
- Create: `unity-package/com.strada.mcp/Editor/Commands/ComponentCommands.cs`
- Create: `unity-package/com.strada.mcp/Editor/Commands/SceneCommands.cs`

**Step 1: Write implementations**

These handlers map to the 18 Unity Runtime tools (Phase 8) + 8 Scene/Prefab tools (Phase 9).

```csharp
// Editor/Commands/GameObjectCommands.cs
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handles GameObject-related commands from the MCP server.
    /// Maps to: unity_create_gameobject, unity_find_gameobjects, unity_modify_gameobject,
    ///          unity_delete_gameobject, unity_duplicate_gameobject, unity_set_transform,
    ///          unity_reparent_gameobject
    /// </summary>
    public static class GameObjectCommands
    {
        public static void RegisterAll(CommandRegistry registry)
        {
            registry.Register("unity.create_gameobject", new CreateGameObjectHandler());
            registry.Register("unity.find_gameobjects", new FindGameObjectsHandler());
            registry.Register("unity.modify_gameobject", new ModifyGameObjectHandler());
            registry.Register("unity.delete_gameobject", new DeleteGameObjectHandler());
            registry.Register("unity.duplicate_gameobject", new DuplicateGameObjectHandler());
            registry.Register("unity.set_transform", new SetTransformHandler());
            registry.Register("unity.reparent_gameobject", new ReparentGameObjectHandler());
        }

        private class CreateGameObjectHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string name = parameters.GetString("name", "GameObject");
                string type = parameters.GetString("type", "empty"); // empty, cube, sphere, etc.
                string prefabPath = parameters.GetString("prefab_path", null);

                GameObject go;

                if (!string.IsNullOrEmpty(prefabPath))
                {
                    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
                    if (prefab == null)
                        return CommandResult.Error(-1, $"Prefab not found: {prefabPath}");
                    go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                }
                else if (type != "empty")
                {
                    PrimitiveType primitive;
                    if (!Enum.TryParse(type, true, out primitive))
                        return CommandResult.Error(-1, $"Unknown primitive type: {type}");
                    go = GameObject.CreatePrimitive(primitive);
                }
                else
                {
                    go = new GameObject();
                }

                go.name = name;
                Undo.RegisterCreatedObjectUndo(go, $"Create {name}");

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "instance_id", go.GetInstanceID() },
                    { "name", go.name },
                    { "path", GetHierarchyPath(go) }
                });
            }
        }

        private class FindGameObjectsHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string searchName = parameters.GetString("name", null);
                string tag = parameters.GetString("tag", null);
                string componentType = parameters.GetString("component_type", null);

                var results = new List<Dictionary<string, object>>();
                GameObject[] allObjects = UnityEngine.Object.FindObjectsOfType<GameObject>();

                foreach (var go in allObjects)
                {
                    bool match = true;

                    if (searchName != null && !go.name.Contains(searchName, StringComparison.OrdinalIgnoreCase))
                        match = false;
                    if (tag != null && !go.CompareTag(tag))
                        match = false;
                    if (componentType != null && go.GetComponent(componentType) == null)
                        match = false;

                    if (match)
                    {
                        results.Add(new Dictionary<string, object>
                        {
                            { "instance_id", go.GetInstanceID() },
                            { "name", go.name },
                            { "path", GetHierarchyPath(go) },
                            { "active", go.activeSelf },
                            { "tag", go.tag },
                            { "layer", LayerMask.LayerToName(go.layer) }
                        });
                    }
                }

                return CommandResult.Success(results);
            }
        }

        private class ModifyGameObjectHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                Undo.RecordObject(go, "Modify GameObject");

                if (parameters.ContainsKey("name"))
                    go.name = parameters.GetString("name", go.name);
                if (parameters.ContainsKey("tag"))
                    go.tag = parameters.GetString("tag", go.tag);
                if (parameters.ContainsKey("layer"))
                    go.layer = LayerMask.NameToLayer(parameters.GetString("layer", "Default"));
                if (parameters.ContainsKey("active"))
                    go.SetActive(parameters.GetBool("active", true));

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "instance_id", go.GetInstanceID() },
                    { "name", go.name }
                });
            }
        }

        private class DeleteGameObjectHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                Undo.DestroyObjectImmediate(go);
                return CommandResult.Success("Deleted");
            }
        }

        private class DuplicateGameObjectHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                var clone = UnityEngine.Object.Instantiate(go, go.transform.parent);
                string newName = parameters.GetString("name", go.name + " (Clone)");
                clone.name = newName;
                Undo.RegisterCreatedObjectUndo(clone, $"Duplicate {go.name}");

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "instance_id", clone.GetInstanceID() },
                    { "name", clone.name },
                    { "path", GetHierarchyPath(clone) }
                });
            }
        }

        private class SetTransformHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                bool world = parameters.GetString("space", "local") == "world";
                Undo.RecordObject(go.transform, "Set Transform");

                if (parameters.ContainsKey("position"))
                {
                    var pos = parameters.GetVector3("position");
                    if (world) go.transform.position = pos;
                    else go.transform.localPosition = pos;
                }

                if (parameters.ContainsKey("rotation"))
                {
                    var rot = parameters.GetVector3("rotation");
                    if (world) go.transform.eulerAngles = rot;
                    else go.transform.localEulerAngles = rot;
                }

                if (parameters.ContainsKey("scale"))
                {
                    go.transform.localScale = parameters.GetVector3("scale");
                }

                return CommandResult.Success("Transform updated");
            }
        }

        private class ReparentGameObjectHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int childId = parameters.GetInt("instance_id", 0);
                int parentId = parameters.GetInt("parent_id", 0);
                bool worldPositionStays = parameters.GetBool("world_position_stays", true);

                var child = EditorUtility.InstanceIDToObject(childId) as GameObject;
                if (child == null)
                    return CommandResult.Error(-1, $"Child not found: {childId}");

                Transform parent = null;
                if (parentId != 0)
                {
                    var parentGo = EditorUtility.InstanceIDToObject(parentId) as GameObject;
                    if (parentGo == null)
                        return CommandResult.Error(-1, $"Parent not found: {parentId}");
                    parent = parentGo.transform;
                }

                Undo.SetTransformParent(child.transform, parent, worldPositionStays, "Reparent");
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "instance_id", child.GetInstanceID() },
                    { "parent_path", parent != null ? GetHierarchyPath(parent.gameObject) : "(root)" }
                });
            }
        }

        // --- Utility ---

        private static string GetHierarchyPath(GameObject go)
        {
            string path = go.name;
            Transform current = go.transform.parent;
            while (current != null)
            {
                path = current.name + "/" + path;
                current = current.parent;
            }
            return path;
        }
    }

    /// <summary>
    /// Extension methods for reading typed values from JSON-RPC parameter dictionaries.
    /// </summary>
    internal static class ParameterExtensions
    {
        public static string GetString(this Dictionary<string, object> dict, string key, string defaultValue)
        {
            if (dict.TryGetValue(key, out object val) && val is string s)
                return s;
            return defaultValue;
        }

        public static int GetInt(this Dictionary<string, object> dict, string key, int defaultValue)
        {
            if (dict.TryGetValue(key, out object val))
            {
                if (val is long l) return (int)l;
                if (val is double d) return (int)d;
                if (val is int i) return i;
            }
            return defaultValue;
        }

        public static bool GetBool(this Dictionary<string, object> dict, string key, bool defaultValue)
        {
            if (dict.TryGetValue(key, out object val) && val is bool b)
                return b;
            return defaultValue;
        }

        public static Vector3 GetVector3(this Dictionary<string, object> dict, string key)
        {
            if (dict.TryGetValue(key, out object val) && val is Dictionary<string, object> v)
            {
                float x = (float)v.GetDouble("x", 0);
                float y = (float)v.GetDouble("y", 0);
                float z = (float)v.GetDouble("z", 0);
                return new Vector3(x, y, z);
            }
            return Vector3.zero;
        }

        public static double GetDouble(this Dictionary<string, object> dict, string key, double defaultValue)
        {
            if (dict.TryGetValue(key, out object val))
            {
                if (val is double d) return d;
                if (val is long l) return l;
                if (val is float f) return f;
            }
            return defaultValue;
        }
    }
}
```

```csharp
// Editor/Commands/ComponentCommands.cs
using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handles Component-related commands from the MCP server.
    /// Maps to: unity_add_component, unity_remove_component,
    ///          unity_get_component, unity_modify_component
    /// </summary>
    public static class ComponentCommands
    {
        public static void RegisterAll(CommandRegistry registry)
        {
            registry.Register("unity.add_component", new AddComponentHandler());
            registry.Register("unity.remove_component", new RemoveComponentHandler());
            registry.Register("unity.get_component", new GetComponentHandler());
            registry.Register("unity.modify_component", new ModifyComponentHandler());
        }

        private class AddComponentHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                string typeName = parameters.GetString("type", null);

                if (string.IsNullOrEmpty(typeName))
                    return CommandResult.Error(-1, "Missing 'type' parameter");

                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                Type componentType = FindType(typeName);
                if (componentType == null)
                    return CommandResult.Error(-1, $"Component type not found: {typeName}");

                var component = Undo.AddComponent(go, componentType);
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "instance_id", go.GetInstanceID() },
                    { "component_type", component.GetType().Name }
                });
            }
        }

        private class RemoveComponentHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                string typeName = parameters.GetString("type", null);

                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                Type componentType = FindType(typeName);
                if (componentType == null)
                    return CommandResult.Error(-1, $"Component type not found: {typeName}");

                var component = go.GetComponent(componentType);
                if (component == null)
                    return CommandResult.Error(-1, $"Component '{typeName}' not found on {go.name}");

                Undo.DestroyObjectImmediate(component);
                return CommandResult.Success("Component removed");
            }
        }

        private class GetComponentHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                string typeName = parameters.GetString("type", null);

                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                if (!string.IsNullOrEmpty(typeName))
                {
                    // Get specific component
                    Type componentType = FindType(typeName);
                    if (componentType == null)
                        return CommandResult.Error(-1, $"Component type not found: {typeName}");

                    var component = go.GetComponent(componentType);
                    if (component == null)
                        return CommandResult.Error(-1, $"Component '{typeName}' not found on {go.name}");

                    return CommandResult.Success(SerializeComponent(component));
                }
                else
                {
                    // List all components
                    var components = go.GetComponents<Component>();
                    var list = new List<Dictionary<string, object>>();
                    foreach (var c in components)
                    {
                        if (c == null) continue;
                        list.Add(new Dictionary<string, object>
                        {
                            { "type", c.GetType().Name },
                            { "full_type", c.GetType().FullName },
                            { "enabled", c is Behaviour b ? b.enabled : true }
                        });
                    }
                    return CommandResult.Success(list);
                }
            }

            private Dictionary<string, object> SerializeComponent(Component component)
            {
                var result = new Dictionary<string, object>
                {
                    { "type", component.GetType().Name },
                    { "full_type", component.GetType().FullName }
                };

                // Serialize serialized properties via SerializedObject
                var so = new SerializedObject(component);
                var prop = so.GetIterator();
                var properties = new Dictionary<string, object>();

                if (prop.NextVisible(true))
                {
                    do
                    {
                        properties[prop.name] = GetPropertyValue(prop);
                    } while (prop.NextVisible(false));
                }

                result["properties"] = properties;
                return result;
            }

            private object GetPropertyValue(SerializedProperty prop)
            {
                switch (prop.propertyType)
                {
                    case SerializedPropertyType.Integer: return prop.intValue;
                    case SerializedPropertyType.Float: return prop.floatValue;
                    case SerializedPropertyType.Boolean: return prop.boolValue;
                    case SerializedPropertyType.String: return prop.stringValue;
                    case SerializedPropertyType.Enum: return prop.enumNames[prop.enumValueIndex];
                    case SerializedPropertyType.Vector3:
                        return new Dictionary<string, object>
                        {
                            { "x", prop.vector3Value.x },
                            { "y", prop.vector3Value.y },
                            { "z", prop.vector3Value.z }
                        };
                    case SerializedPropertyType.Color:
                        return new Dictionary<string, object>
                        {
                            { "r", prop.colorValue.r },
                            { "g", prop.colorValue.g },
                            { "b", prop.colorValue.b },
                            { "a", prop.colorValue.a }
                        };
                    default: return prop.propertyType.ToString();
                }
            }
        }

        private class ModifyComponentHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                string typeName = parameters.GetString("type", null);

                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");

                Type componentType = FindType(typeName);
                if (componentType == null)
                    return CommandResult.Error(-1, $"Component type not found: {typeName}");

                var component = go.GetComponent(componentType);
                if (component == null)
                    return CommandResult.Error(-1, $"Component '{typeName}' not found on {go.name}");

                if (!parameters.TryGetValue("values", out object valuesObj) ||
                    !(valuesObj is Dictionary<string, object> values))
                    return CommandResult.Error(-1, "Missing 'values' parameter");

                var so = new SerializedObject(component);

                foreach (var kvp in values)
                {
                    var prop = so.FindProperty(kvp.Key);
                    if (prop == null) continue;

                    SetPropertyValue(prop, kvp.Value);
                }

                so.ApplyModifiedProperties();
                return CommandResult.Success("Component modified");
            }

            private void SetPropertyValue(SerializedProperty prop, object value)
            {
                switch (prop.propertyType)
                {
                    case SerializedPropertyType.Integer:
                        if (value is long l) prop.intValue = (int)l;
                        else if (value is double d) prop.intValue = (int)d;
                        break;
                    case SerializedPropertyType.Float:
                        if (value is double f) prop.floatValue = (float)f;
                        break;
                    case SerializedPropertyType.Boolean:
                        if (value is bool b) prop.boolValue = b;
                        break;
                    case SerializedPropertyType.String:
                        if (value is string s) prop.stringValue = s;
                        break;
                }
            }
        }

        /// <summary>
        /// Resolves a type name to a System.Type, searching all loaded assemblies.
        /// Supports short names (e.g., "Rigidbody") and full names (e.g., "UnityEngine.Rigidbody").
        /// </summary>
        private static Type FindType(string typeName)
        {
            if (string.IsNullOrEmpty(typeName)) return null;

            // Try direct resolution first
            Type type = Type.GetType(typeName);
            if (type != null) return type;

            // Search all assemblies
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                type = assembly.GetType(typeName);
                if (type != null) return type;

                // Try UnityEngine prefix
                type = assembly.GetType("UnityEngine." + typeName);
                if (type != null) return type;
            }

            return null;
        }
    }
}
```

```csharp
// Editor/Commands/SceneCommands.cs
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handles Scene and Prefab commands from the MCP server.
    /// Maps to: unity_create_scene, unity_open_scene, unity_save_scene,
    ///          unity_get_scene_info, unity_create_prefab, unity_instantiate_prefab
    /// </summary>
    public static class SceneCommands
    {
        public static void RegisterAll(CommandRegistry registry)
        {
            registry.Register("unity.create_scene", new CreateSceneHandler());
            registry.Register("unity.open_scene", new OpenSceneHandler());
            registry.Register("unity.save_scene", new SaveSceneHandler());
            registry.Register("unity.get_scene_info", new GetSceneInfoHandler());
            registry.Register("unity.create_prefab", new CreatePrefabHandler());
            registry.Register("unity.instantiate_prefab", new InstantiatePrefabHandler());
        }

        private class CreateSceneHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                if (string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'path' parameter");

                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                if (!string.IsNullOrEmpty(path))
                    EditorSceneManager.SaveScene(scene, path);

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "name", scene.name },
                    { "path", scene.path }
                });
            }
        }

        private class OpenSceneHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                if (string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'path' parameter");

                bool additive = parameters.GetBool("additive", false);
                var mode = additive ? OpenSceneMode.Additive : OpenSceneMode.Single;
                var scene = EditorSceneManager.OpenScene(path, mode);

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "name", scene.name },
                    { "path", scene.path },
                    { "root_count", scene.rootCount }
                });
            }
        }

        private class SaveSceneHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                var scene = SceneManager.GetActiveScene();
                string path = parameters.GetString("path", scene.path);
                bool success = EditorSceneManager.SaveScene(scene, path);
                return success
                    ? CommandResult.Success("Scene saved")
                    : CommandResult.Error(-1, "Failed to save scene");
            }
        }

        private class GetSceneInfoHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                var scene = SceneManager.GetActiveScene();
                var rootObjects = scene.GetRootGameObjects();

                var hierarchy = new List<Dictionary<string, object>>();
                foreach (var root in rootObjects)
                    hierarchy.Add(BuildHierarchy(root, 0, 3));

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "name", scene.name },
                    { "path", scene.path },
                    { "root_count", scene.rootCount },
                    { "is_dirty", scene.isDirty },
                    { "hierarchy", hierarchy }
                });
            }

            private Dictionary<string, object> BuildHierarchy(GameObject go, int depth, int maxDepth)
            {
                var node = new Dictionary<string, object>
                {
                    { "name", go.name },
                    { "instance_id", go.GetInstanceID() },
                    { "active", go.activeSelf },
                    { "components", GetComponentNames(go) }
                };

                if (depth < maxDepth && go.transform.childCount > 0)
                {
                    var children = new List<Dictionary<string, object>>();
                    for (int i = 0; i < go.transform.childCount; i++)
                        children.Add(BuildHierarchy(go.transform.GetChild(i).gameObject, depth + 1, maxDepth));
                    node["children"] = children;
                }

                return node;
            }

            private List<string> GetComponentNames(GameObject go)
            {
                var names = new List<string>();
                foreach (var c in go.GetComponents<Component>())
                    if (c != null) names.Add(c.GetType().Name);
                return names;
            }
        }

        private class CreatePrefabHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int instanceId = parameters.GetInt("instance_id", 0);
                string path = parameters.GetString("path", null);

                var go = EditorUtility.InstanceIDToObject(instanceId) as GameObject;
                if (go == null)
                    return CommandResult.Error(-1, $"GameObject not found: {instanceId}");
                if (string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'path' parameter");

                var prefab = PrefabUtility.SaveAsPrefabAsset(go, path);
                return prefab != null
                    ? CommandResult.Success(new Dictionary<string, object>
                    {
                        { "path", AssetDatabase.GetAssetPath(prefab) },
                        { "name", prefab.name }
                    })
                    : CommandResult.Error(-1, "Failed to create prefab");
            }
        }

        private class InstantiatePrefabHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                if (string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'path' parameter");

                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab == null)
                    return CommandResult.Error(-1, $"Prefab not found: {path}");

                var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                Undo.RegisterCreatedObjectUndo(instance, $"Instantiate {prefab.name}");

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "instance_id", instance.GetInstanceID() },
                    { "name", instance.name }
                });
            }
        }
    }
}
```

**Step 2: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/Commands/GameObjectCommands.cs
git add unity-package/com.strada.mcp/Editor/Commands/ComponentCommands.cs
git add unity-package/com.strada.mcp/Editor/Commands/SceneCommands.cs
git commit -m "feat(unity-pkg): add core command handlers for GameObject, Component, and Scene"
```

---

### Task 6: Extended command handlers (Asset, Editor, Project)

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/Commands/AssetCommands.cs`
- Create: `unity-package/com.strada.mcp/Editor/Commands/EditorCommands.cs`
- Create: `unity-package/com.strada.mcp/Editor/Commands/ProjectCommands.cs`

**Step 1: Write implementations**

```csharp
// Editor/Commands/AssetCommands.cs
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handles Asset and Material commands.
    /// Maps to: unity_find_assets, unity_asset_dependencies, unity_asset_unused,
    ///          unity_create_material, unity_modify_material, unity_create_scriptableobject,
    ///          unity_shader_analyze, unity_texture_manage
    /// </summary>
    public static class AssetCommands
    {
        public static void RegisterAll(CommandRegistry registry)
        {
            registry.Register("unity.find_assets", new FindAssetsHandler());
            registry.Register("unity.asset_dependencies", new AssetDependenciesHandler());
            registry.Register("unity.asset_unused", new AssetUnusedHandler());
            registry.Register("unity.create_material", new CreateMaterialHandler());
            registry.Register("unity.modify_material", new ModifyMaterialHandler());
            registry.Register("unity.create_scriptableobject", new CreateScriptableObjectHandler());
            registry.Register("unity.shader_analyze", new ShaderAnalyzeHandler());
            registry.Register("unity.texture_manage", new TextureManageHandler());
        }

        private class FindAssetsHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string type = parameters.GetString("type", null);
                string name = parameters.GetString("name", null);
                string label = parameters.GetString("label", null);

                string filter = "";
                if (!string.IsNullOrEmpty(type)) filter += $"t:{type} ";
                if (!string.IsNullOrEmpty(name)) filter += name + " ";
                if (!string.IsNullOrEmpty(label)) filter += $"l:{label} ";

                string[] guids = AssetDatabase.FindAssets(filter.Trim());
                var results = new List<Dictionary<string, object>>();

                foreach (var guid in guids.Take(100)) // Limit to 100 results
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    results.Add(new Dictionary<string, object>
                    {
                        { "guid", guid },
                        { "path", path },
                        { "type", AssetDatabase.GetMainAssetTypeAtPath(path)?.Name ?? "Unknown" }
                    });
                }

                return CommandResult.Success(results);
            }
        }

        private class AssetDependenciesHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                if (string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'path' parameter");

                string[] deps = AssetDatabase.GetDependencies(path, true);
                return CommandResult.Success(deps.ToList());
            }
        }

        private class AssetUnusedHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string folder = parameters.GetString("folder", "Assets");
                string[] allAssets = AssetDatabase.FindAssets("", new[] { folder });
                var unused = new List<string>();

                // Get all scene paths in build settings
                var scenePaths = EditorBuildSettings.scenes.Select(s => s.path).ToArray();
                var usedAssets = new HashSet<string>();

                foreach (var scenePath in scenePaths)
                {
                    foreach (var dep in AssetDatabase.GetDependencies(scenePath, true))
                        usedAssets.Add(dep);
                }

                foreach (var guid in allAssets)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    if (!usedAssets.Contains(path) && !AssetDatabase.IsValidFolder(path))
                        unused.Add(path);
                }

                return CommandResult.Success(unused.Take(200).ToList());
            }
        }

        private class CreateMaterialHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                string shader = parameters.GetString("shader", "Standard");

                if (string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'path' parameter");

                var shaderObj = Shader.Find(shader);
                if (shaderObj == null)
                    return CommandResult.Error(-1, $"Shader not found: {shader}");

                var material = new Material(shaderObj);
                AssetDatabase.CreateAsset(material, path);
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "path", path },
                    { "shader", shader }
                });
            }
        }

        private class ModifyMaterialHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (material == null)
                    return CommandResult.Error(-1, $"Material not found: {path}");

                if (parameters.TryGetValue("color", out object colorObj) &&
                    colorObj is Dictionary<string, object> colorDict)
                {
                    string propName = parameters.GetString("color_property", "_Color");
                    material.SetColor(propName, new Color(
                        (float)colorDict.GetDouble("r", 1),
                        (float)colorDict.GetDouble("g", 1),
                        (float)colorDict.GetDouble("b", 1),
                        (float)colorDict.GetDouble("a", 1)
                    ));
                }

                EditorUtility.SetDirty(material);
                return CommandResult.Success("Material modified");
            }
        }

        private class CreateScriptableObjectHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string typeName = parameters.GetString("type", null);
                string path = parameters.GetString("path", null);

                if (string.IsNullOrEmpty(typeName) || string.IsNullOrEmpty(path))
                    return CommandResult.Error(-1, "Missing 'type' or 'path' parameter");

                var so = ScriptableObject.CreateInstance(typeName);
                if (so == null)
                    return CommandResult.Error(-1, $"ScriptableObject type not found: {typeName}");

                AssetDatabase.CreateAsset(so, path);
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "path", path },
                    { "type", typeName }
                });
            }
        }

        private class ShaderAnalyzeHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                var shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
                if (shader == null)
                    return CommandResult.Error(-1, $"Shader not found: {path}");

                var properties = new List<Dictionary<string, object>>();
                int propCount = ShaderUtil.GetPropertyCount(shader);
                for (int i = 0; i < propCount; i++)
                {
                    properties.Add(new Dictionary<string, object>
                    {
                        { "name", ShaderUtil.GetPropertyName(shader, i) },
                        { "type", ShaderUtil.GetPropertyType(shader, i).ToString() },
                        { "description", ShaderUtil.GetPropertyDescription(shader, i) }
                    });
                }

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "name", shader.name },
                    { "property_count", propCount },
                    { "properties", properties },
                    { "is_supported", shader.isSupported }
                });
            }
        }

        private class TextureManageHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                string action = parameters.GetString("action", "info"); // info, set_compression, set_size

                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null)
                    return CommandResult.Error(-1, $"Texture not found: {path}");

                if (action == "info")
                {
                    return CommandResult.Success(new Dictionary<string, object>
                    {
                        { "path", path },
                        { "max_size", importer.maxTextureSize },
                        { "compression", importer.textureCompression.ToString() },
                        { "type", importer.textureType.ToString() },
                        { "read_write", importer.isReadable }
                    });
                }

                if (action == "set_compression")
                {
                    string compression = parameters.GetString("compression", "Compressed");
                    if (System.Enum.TryParse<TextureImporterCompression>(compression, out var comp))
                    {
                        importer.textureCompression = comp;
                        importer.SaveAndReimport();
                        return CommandResult.Success("Compression updated");
                    }
                    return CommandResult.Error(-1, $"Unknown compression: {compression}");
                }

                return CommandResult.Error(-1, $"Unknown action: {action}");
            }
        }
    }
}
```

```csharp
// Editor/Commands/EditorCommands.cs
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handles Editor-level commands.
    /// Maps to: unity_play_mode, unity_console_logs, unity_screenshot,
    ///          unity_execute_menu_item, unity_undo_redo, unity_editor_state, unity_refresh
    /// </summary>
    public static class EditorCommands
    {
        private static readonly List<LogEntry> _logBuffer = new List<LogEntry>();
        private const int MaxLogEntries = 500;
        private static bool _logListenerRegistered;

        public static void RegisterAll(CommandRegistry registry)
        {
            registry.Register("unity.play_mode", new PlayModeHandler());
            registry.Register("unity.console_logs", new ConsoleLogsHandler());
            registry.Register("unity.screenshot", new ScreenshotHandler());
            registry.Register("unity.execute_menu_item", new ExecuteMenuItemHandler());
            registry.Register("unity.undo_redo", new UndoRedoHandler());
            registry.Register("unity.editor_state", new EditorStateHandler());
            registry.Register("unity.refresh", new RefreshHandler());

            EnsureLogListener();
        }

        private static void EnsureLogListener()
        {
            if (_logListenerRegistered) return;
            Application.logMessageReceived += (message, stackTrace, type) =>
            {
                _logBuffer.Add(new LogEntry { message = message, stackTrace = stackTrace, type = type.ToString() });
                if (_logBuffer.Count > MaxLogEntries)
                    _logBuffer.RemoveAt(0);
            };
            _logListenerRegistered = true;
        }

        private struct LogEntry
        {
            public string message;
            public string stackTrace;
            public string type;
        }

        private class PlayModeHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string action = parameters.GetString("action", "status");

                switch (action)
                {
                    case "play":
                        EditorApplication.isPlaying = true;
                        return CommandResult.Success("Play mode started");
                    case "pause":
                        EditorApplication.isPaused = !EditorApplication.isPaused;
                        return CommandResult.Success($"Paused: {EditorApplication.isPaused}");
                    case "stop":
                        EditorApplication.isPlaying = false;
                        return CommandResult.Success("Play mode stopped");
                    case "status":
                        return CommandResult.Success(new Dictionary<string, object>
                        {
                            { "is_playing", EditorApplication.isPlaying },
                            { "is_paused", EditorApplication.isPaused },
                            { "is_compiling", EditorApplication.isCompiling }
                        });
                    default:
                        return CommandResult.Error(-1, $"Unknown action: {action}");
                }
            }
        }

        private class ConsoleLogsHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                int count = parameters.GetInt("count", 50);
                string typeFilter = parameters.GetString("type", null);

                var logs = new List<Dictionary<string, object>>();
                int start = System.Math.Max(0, _logBuffer.Count - count);

                for (int i = start; i < _logBuffer.Count; i++)
                {
                    var entry = _logBuffer[i];
                    if (typeFilter != null && entry.type != typeFilter)
                        continue;

                    logs.Add(new Dictionary<string, object>
                    {
                        { "message", entry.message },
                        { "type", entry.type },
                        { "stack_trace", entry.stackTrace }
                    });
                }

                return CommandResult.Success(logs);
            }
        }

        private class ScreenshotHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", "screenshot.png");
                int superSize = parameters.GetInt("super_size", 1);

                ScreenCapture.CaptureScreenshot(path, superSize);
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "path", path },
                    { "note", "Screenshot saved (may take one frame to complete)" }
                });
            }
        }

        private class ExecuteMenuItemHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string menuItem = parameters.GetString("menu_item", null);
                if (string.IsNullOrEmpty(menuItem))
                    return CommandResult.Error(-1, "Missing 'menu_item' parameter");

                bool success = EditorApplication.ExecuteMenuItem(menuItem);
                return success
                    ? CommandResult.Success($"Executed: {menuItem}")
                    : CommandResult.Error(-1, $"Menu item not found: {menuItem}");
            }
        }

        private class UndoRedoHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string action = parameters.GetString("action", "undo");
                switch (action)
                {
                    case "undo":
                        Undo.PerformUndo();
                        return CommandResult.Success("Undo performed");
                    case "redo":
                        Undo.PerformRedo();
                        return CommandResult.Success("Redo performed");
                    default:
                        return CommandResult.Error(-1, $"Unknown action: {action}");
                }
            }
        }

        private class EditorStateHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                var selected = Selection.activeGameObject;
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "is_playing", EditorApplication.isPlaying },
                    { "is_paused", EditorApplication.isPaused },
                    { "is_compiling", EditorApplication.isCompiling },
                    { "unity_version", Application.unityVersion },
                    { "platform", EditorUserBuildSettings.activeBuildTarget.ToString() },
                    { "selected_object", selected != null ? selected.name : null },
                    { "selected_instance_id", selected != null ? selected.GetInstanceID() : 0 }
                });
            }
        }

        private class RefreshHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                AssetDatabase.Refresh();
                return CommandResult.Success("Asset database refreshed");
            }
        }
    }
}
```

```csharp
// Editor/Commands/ProjectCommands.cs
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Handles Project-level and subsystem commands.
    /// Maps to: unity_package_manage, unity_asmdef_manage, unity_project_settings,
    ///          unity_editor_script_create, unity_build_pipeline,
    ///          and subsystem commands (animator, physics, navmesh, lighting, audio, etc.)
    /// </summary>
    public static class ProjectCommands
    {
        public static void RegisterAll(CommandRegistry registry)
        {
            registry.Register("unity.package_manage", new PackageManageHandler());
            registry.Register("unity.asmdef_manage", new AsmdefManageHandler());
            registry.Register("unity.project_settings", new ProjectSettingsHandler());
            registry.Register("unity.build_pipeline", new BuildPipelineHandler());
            registry.Register("unity.animator_analyze", new AnimatorAnalyzeHandler());
            registry.Register("unity.physics_settings", new PhysicsSettingsHandler());
            registry.Register("unity.lighting_manage", new LightingManageHandler());
            registry.Register("unity.audio_manage", new AudioManageHandler());
        }

        private class PackageManageHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string action = parameters.GetString("action", "list");

                switch (action)
                {
                    case "list":
                        var listRequest = Client.List(true);
                        while (!listRequest.IsCompleted)
                            System.Threading.Thread.Sleep(10);
                        if (listRequest.Status == StatusCode.Success)
                        {
                            var packages = listRequest.Result.Select(p => new Dictionary<string, object>
                            {
                                { "name", p.name },
                                { "version", p.version },
                                { "source", p.source.ToString() }
                            }).ToList();
                            return CommandResult.Success(packages);
                        }
                        return CommandResult.Error(-1, "Failed to list packages");

                    case "add":
                        string packageId = parameters.GetString("package", null);
                        if (string.IsNullOrEmpty(packageId))
                            return CommandResult.Error(-1, "Missing 'package' parameter");
                        Client.Add(packageId);
                        return CommandResult.Success($"Adding package: {packageId}");

                    case "remove":
                        string removeName = parameters.GetString("package", null);
                        if (string.IsNullOrEmpty(removeName))
                            return CommandResult.Error(-1, "Missing 'package' parameter");
                        Client.Remove(removeName);
                        return CommandResult.Success($"Removing package: {removeName}");

                    default:
                        return CommandResult.Error(-1, $"Unknown action: {action}");
                }
            }
        }

        private class AsmdefManageHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string action = parameters.GetString("action", "list");

                if (action == "list")
                {
                    string[] guids = AssetDatabase.FindAssets("t:asmdef");
                    var results = guids.Select(guid =>
                    {
                        string path = AssetDatabase.GUIDToAssetPath(guid);
                        return new Dictionary<string, object>
                        {
                            { "path", path },
                            { "name", System.IO.Path.GetFileNameWithoutExtension(path) }
                        };
                    }).ToList();
                    return CommandResult.Success(results);
                }

                return CommandResult.Error(-1, $"Unknown action: {action}");
            }
        }

        private class ProjectSettingsHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string category = parameters.GetString("category", "overview");

                if (category == "overview")
                {
                    return CommandResult.Success(new Dictionary<string, object>
                    {
                        { "company_name", PlayerSettings.companyName },
                        { "product_name", PlayerSettings.productName },
                        { "version", PlayerSettings.bundleVersion },
                        { "scripting_backend", PlayerSettings.GetScriptingBackend(EditorUserBuildSettings.selectedBuildTargetGroup).ToString() },
                        { "api_compatibility", PlayerSettings.GetApiCompatibilityLevel(EditorUserBuildSettings.selectedBuildTargetGroup).ToString() }
                    });
                }

                if (category == "tags")
                {
                    return CommandResult.Success(InternalEditorUtility.tags.ToList());
                }

                if (category == "layers")
                {
                    var layers = new List<Dictionary<string, object>>();
                    for (int i = 0; i < 32; i++)
                    {
                        string name = LayerMask.LayerToName(i);
                        if (!string.IsNullOrEmpty(name))
                            layers.Add(new Dictionary<string, object> { { "index", i }, { "name", name } });
                    }
                    return CommandResult.Success(layers);
                }

                return CommandResult.Error(-1, $"Unknown category: {category}");
            }
        }

        private class BuildPipelineHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string action = parameters.GetString("action", "info");

                if (action == "info")
                {
                    var scenes = EditorBuildSettings.scenes.Select(s => new Dictionary<string, object>
                    {
                        { "path", s.path },
                        { "enabled", s.enabled }
                    }).ToList();

                    return CommandResult.Success(new Dictionary<string, object>
                    {
                        { "target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                        { "target_group", EditorUserBuildSettings.selectedBuildTargetGroup.ToString() },
                        { "scenes", scenes }
                    });
                }

                return CommandResult.Error(-1, $"Build action '{action}' not supported in bridge");
            }
        }

        private class AnimatorAnalyzeHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string path = parameters.GetString("path", null);
                var controller = AssetDatabase.LoadAssetAtPath<UnityEditor.Animations.AnimatorController>(path);
                if (controller == null)
                    return CommandResult.Error(-1, $"AnimatorController not found: {path}");

                var layers = new List<Dictionary<string, object>>();
                foreach (var layer in controller.layers)
                {
                    var states = layer.stateMachine.states.Select(s => new Dictionary<string, object>
                    {
                        { "name", s.state.name },
                        { "speed", s.state.speed },
                        { "motion", s.state.motion?.name ?? "none" }
                    }).ToList();

                    layers.Add(new Dictionary<string, object>
                    {
                        { "name", layer.name },
                        { "states", states },
                        { "state_count", states.Count }
                    });
                }

                var parameters_ = controller.parameters.Select(p => new Dictionary<string, object>
                {
                    { "name", p.name },
                    { "type", p.type.ToString() }
                }).ToList();

                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "name", controller.name },
                    { "layer_count", controller.layers.Length },
                    { "layers", layers },
                    { "parameters", parameters_ }
                });
            }
        }

        private class PhysicsSettingsHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "gravity", new Dictionary<string, object>
                        {
                            { "x", Physics.gravity.x },
                            { "y", Physics.gravity.y },
                            { "z", Physics.gravity.z }
                        }
                    },
                    { "default_solver_iterations", Physics.defaultSolverIterations },
                    { "default_solver_velocity_iterations", Physics.defaultSolverVelocityIterations },
                    { "bounce_threshold", Physics.bounceThreshold },
                    { "auto_simulation", Physics.simulationMode.ToString() }
                });
            }
        }

        private class LightingManageHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                string action = parameters.GetString("action", "info");

                if (action == "info")
                {
                    return CommandResult.Success(new Dictionary<string, object>
                    {
                        { "ambient_mode", RenderSettings.ambientMode.ToString() },
                        { "ambient_color", new Dictionary<string, object>
                            {
                                { "r", RenderSettings.ambientLight.r },
                                { "g", RenderSettings.ambientLight.g },
                                { "b", RenderSettings.ambientLight.b }
                            }
                        },
                        { "fog_enabled", RenderSettings.fog },
                        { "fog_color", RenderSettings.fogColor.ToString() }
                    });
                }

                return CommandResult.Error(-1, $"Unknown action: {action}");
            }
        }

        private class AudioManageHandler : ICommandHandler
        {
            public CommandResult Execute(Dictionary<string, object> parameters)
            {
                return CommandResult.Success(new Dictionary<string, object>
                {
                    { "global_volume", AudioListener.volume },
                    { "speaker_mode", AudioSettings.speakerMode.ToString() },
                    { "sample_rate", AudioSettings.outputSampleRate }
                });
            }
        }
    }
}
```

**Step 2: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/Commands/AssetCommands.cs
git add unity-package/com.strada.mcp/Editor/Commands/EditorCommands.cs
git add unity-package/com.strada.mcp/Editor/Commands/ProjectCommands.cs
git commit -m "feat(unity-pkg): add extended command handlers for Asset, Editor, and Project operations"
```

---

### Task 7: Event broadcaster

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/Events/EventTypes.cs`
- Create: `unity-package/com.strada.mcp/Editor/Events/EventBroadcaster.cs`

**Step 1: Write implementations**

```csharp
// Editor/Events/EventTypes.cs
namespace Strada.Mcp.Editor.Events
{
    /// <summary>
    /// Event type constants matching the MCP server's expected event names.
    /// </summary>
    public static class EventTypes
    {
        public const string SceneChanged = "scene.changed";
        public const string ConsoleLine = "console.line";
        public const string CompileStarted = "compile.started";
        public const string CompileFinished = "compile.finished";
        public const string PlayModeChanged = "playmode.changed";
        public const string SelectionChanged = "selection.changed";
    }
}
```

```csharp
// Editor/Events/EventBroadcaster.cs
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Strada.Mcp.Editor.Server;

namespace Strada.Mcp.Editor.Events
{
    /// <summary>
    /// Subscribes to Unity Editor callbacks and broadcasts events
    /// to the connected MCP server via the TCP bridge.
    ///
    /// Events:
    ///   scene.changed       — Scene opened, closed, or hierarchy modified
    ///   console.line         — New console log entry
    ///   compile.started      — Script compilation started
    ///   compile.finished     — Script compilation finished (with success/error)
    ///   playmode.changed     — Play/pause/stop mode transitions
    ///   selection.changed    — Selected object changed in Hierarchy/Project
    /// </summary>
    public class EventBroadcaster
    {
        private readonly TcpBridgeServer _server;
        private bool _isSubscribed;

        public EventBroadcaster(TcpBridgeServer server)
        {
            _server = server;
        }

        /// <summary>
        /// Subscribe to all Unity Editor callbacks.
        /// Call once during server startup.
        /// </summary>
        public void Subscribe()
        {
            if (_isSubscribed) return;

            EditorSceneManager.sceneOpened += OnSceneOpened;
            EditorSceneManager.sceneClosed += OnSceneClosed;
            EditorSceneManager.sceneSaved += OnSceneSaved;

            Application.logMessageReceived += OnLogMessage;

            CompilationPipeline.compilationStarted += OnCompileStarted;
            CompilationPipeline.compilationFinished += OnCompileFinished;

            EditorApplication.playModeStateChanged += OnPlayModeChanged;

            Selection.selectionChanged += OnSelectionChanged;

            _isSubscribed = true;
        }

        /// <summary>
        /// Unsubscribe from all callbacks.
        /// Call during server shutdown.
        /// </summary>
        public void Unsubscribe()
        {
            if (!_isSubscribed) return;

            EditorSceneManager.sceneOpened -= OnSceneOpened;
            EditorSceneManager.sceneClosed -= OnSceneClosed;
            EditorSceneManager.sceneSaved -= OnSceneSaved;

            Application.logMessageReceived -= OnLogMessage;

            CompilationPipeline.compilationStarted -= OnCompileStarted;
            CompilationPipeline.compilationFinished -= OnCompileFinished;

            EditorApplication.playModeStateChanged -= OnPlayModeChanged;

            Selection.selectionChanged -= OnSelectionChanged;

            _isSubscribed = false;
        }

        // --- Event handlers ---

        private void OnSceneOpened(Scene scene, OpenSceneMode mode)
        {
            BroadcastEvent(EventTypes.SceneChanged, new Dictionary<string, object>
            {
                { "action", "opened" },
                { "name", scene.name },
                { "path", scene.path },
                { "mode", mode.ToString() }
            });
        }

        private void OnSceneClosed(Scene scene)
        {
            BroadcastEvent(EventTypes.SceneChanged, new Dictionary<string, object>
            {
                { "action", "closed" },
                { "name", scene.name },
                { "path", scene.path }
            });
        }

        private void OnSceneSaved(Scene scene)
        {
            BroadcastEvent(EventTypes.SceneChanged, new Dictionary<string, object>
            {
                { "action", "saved" },
                { "name", scene.name },
                { "path", scene.path }
            });
        }

        private void OnLogMessage(string message, string stackTrace, LogType type)
        {
            BroadcastEvent(EventTypes.ConsoleLine, new Dictionary<string, object>
            {
                { "message", message },
                { "type", type.ToString() },
                { "stack_trace", stackTrace }
            });
        }

        private void OnCompileStarted(object context)
        {
            BroadcastEvent(EventTypes.CompileStarted, new Dictionary<string, object>
            {
                { "timestamp", System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            });
        }

        private void OnCompileFinished(object context)
        {
            bool hasErrors = EditorUtility.scriptCompilationFailed;
            BroadcastEvent(EventTypes.CompileFinished, new Dictionary<string, object>
            {
                { "success", !hasErrors },
                { "timestamp", System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            });
        }

        private void OnPlayModeChanged(PlayModeStateChange state)
        {
            BroadcastEvent(EventTypes.PlayModeChanged, new Dictionary<string, object>
            {
                { "state", state.ToString() },
                { "is_playing", EditorApplication.isPlaying },
                { "is_paused", EditorApplication.isPaused }
            });
        }

        private void OnSelectionChanged()
        {
            var selected = Selection.activeGameObject;
            BroadcastEvent(EventTypes.SelectionChanged, new Dictionary<string, object>
            {
                { "name", selected != null ? selected.name : null },
                { "instance_id", selected != null ? selected.GetInstanceID() : 0 },
                { "count", Selection.gameObjects.Length }
            });
        }

        // --- Broadcast helper ---

        private void BroadcastEvent(string eventType, Dictionary<string, object> data)
        {
            if (!_server.IsClientConnected) return;

            var notification = new Dictionary<string, object>
            {
                { "jsonrpc", "2.0" },
                { "method", eventType },
                { "params", data }
            };

            string json = MiniJson.Serialize(notification);
            _server.Send(json);
        }
    }
}
```

**Step 2: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/Events/
git commit -m "feat(unity-pkg): add event broadcaster for scene, console, compile, playmode, and selection events"
```

---

### Task 8: Settings window + editor menu + main entry point

**Files:**
- Create: `unity-package/com.strada.mcp/Editor/UI/McpSettingsWindow.cs`
- Create: `unity-package/com.strada.mcp/Editor/UI/McpSettingsProvider.cs`
- Create: `unity-package/com.strada.mcp/Editor/StradaMcpBridge.cs`

**Step 1: Write implementations**

```csharp
// Editor/UI/McpSettingsWindow.cs
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.UI
{
    /// <summary>
    /// Editor window showing MCP bridge status and configuration.
    /// Accessible via Strada > MCP > Settings.
    /// </summary>
    public class McpSettingsWindow : EditorWindow
    {
        private const string PortKey = "StradaMcp.Port";
        private const string AutoStartKey = "StradaMcp.AutoStart";
        private const int DefaultPort = 7691;

        [MenuItem("Strada/MCP/Settings")]
        public static void ShowWindow()
        {
            var window = GetWindow<McpSettingsWindow>("Strada MCP Settings");
            window.minSize = new Vector2(350, 250);
        }

        [MenuItem("Strada/MCP/Start Server")]
        public static void StartServer()
        {
            StradaMcpBridge.Instance.StartServer();
        }

        [MenuItem("Strada/MCP/Stop Server")]
        public static void StopServer()
        {
            StradaMcpBridge.Instance.StopServer();
        }

        [MenuItem("Strada/MCP/Status")]
        public static void ShowStatus()
        {
            var bridge = StradaMcpBridge.Instance;
            string status = bridge.IsRunning
                ? bridge.IsClientConnected
                    ? "Running - Client Connected"
                    : "Running - Waiting for connection"
                : "Stopped";
            Debug.Log($"[StradaMCP] Status: {status} (port {bridge.Port})");
        }

        private void OnGUI()
        {
            var bridge = StradaMcpBridge.Instance;

            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("Strada MCP Bridge", EditorStyles.boldLabel);
            EditorGUILayout.Space(5);

            // Connection status
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField("Status:");
            if (bridge.IsRunning)
            {
                if (bridge.IsClientConnected)
                {
                    GUI.color = Color.green;
                    EditorGUILayout.LabelField("Connected");
                }
                else
                {
                    GUI.color = Color.yellow;
                    EditorGUILayout.LabelField("Waiting for connection...");
                }
            }
            else
            {
                GUI.color = Color.red;
                EditorGUILayout.LabelField("Stopped");
            }
            GUI.color = Color.white;
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space(10);

            // Port configuration
            int currentPort = EditorPrefs.GetInt(PortKey, DefaultPort);
            int newPort = EditorGUILayout.IntField("Port", currentPort);
            if (newPort != currentPort && newPort > 0 && newPort < 65536)
                EditorPrefs.SetInt(PortKey, newPort);

            // Auto-start toggle
            bool autoStart = EditorPrefs.GetBool(AutoStartKey, true);
            bool newAutoStart = EditorGUILayout.Toggle("Auto-start on Editor Launch", autoStart);
            if (newAutoStart != autoStart)
                EditorPrefs.SetBool(AutoStartKey, newAutoStart);

            EditorGUILayout.Space(10);

            // Start/Stop buttons
            EditorGUILayout.BeginHorizontal();
            EditorGUI.BeginDisabledGroup(bridge.IsRunning);
            if (GUILayout.Button("Start Server", GUILayout.Height(30)))
                bridge.StartServer();
            EditorGUI.EndDisabledGroup();

            EditorGUI.BeginDisabledGroup(!bridge.IsRunning);
            if (GUILayout.Button("Stop Server", GUILayout.Height(30)))
                bridge.StopServer();
            EditorGUI.EndDisabledGroup();
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space(10);

            // Info
            EditorGUILayout.HelpBox(
                $"The MCP server connects to this bridge on port {EditorPrefs.GetInt(PortKey, DefaultPort)}.\n" +
                "Ensure the MCP server's UNITY_BRIDGE_PORT matches this port.",
                MessageType.Info);

            // Registered commands count
            if (bridge.IsRunning)
            {
                EditorGUILayout.Space(5);
                EditorGUILayout.LabelField($"Registered commands: {bridge.RegisteredCommandCount}");
            }
        }

        private void OnInspectorUpdate()
        {
            Repaint();
        }
    }
}
```

```csharp
// Editor/UI/McpSettingsProvider.cs
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Strada.Mcp.Editor.UI
{
    /// <summary>
    /// Registers Strada MCP settings in Unity's Project Settings window.
    /// Accessible via Edit > Project Settings > Strada MCP.
    /// </summary>
    public class McpSettingsProvider : SettingsProvider
    {
        private const string SettingsPath = "Project/Strada MCP";
        private const string PortKey = "StradaMcp.Port";
        private const string AutoStartKey = "StradaMcp.AutoStart";

        public McpSettingsProvider(string path, SettingsScope scope)
            : base(path, scope) { }

        public override void OnGUI(string searchContext)
        {
            EditorGUILayout.Space(10);

            int port = EditorPrefs.GetInt(PortKey, 7691);
            int newPort = EditorGUILayout.IntField("Bridge Port", port);
            if (newPort != port && newPort > 0 && newPort < 65536)
                EditorPrefs.SetInt(PortKey, newPort);

            bool autoStart = EditorPrefs.GetBool(AutoStartKey, true);
            bool newAutoStart = EditorGUILayout.Toggle("Auto-start on Editor Launch", autoStart);
            if (newAutoStart != autoStart)
                EditorPrefs.SetBool(AutoStartKey, newAutoStart);

            EditorGUILayout.Space(5);
            EditorGUILayout.HelpBox(
                "These settings control the MCP bridge server that enables AI tool integration.",
                MessageType.Info);
        }

        [SettingsProvider]
        public static SettingsProvider CreateProvider()
        {
            return new McpSettingsProvider(SettingsPath, SettingsScope.Project)
            {
                keywords = new[] { "strada", "mcp", "bridge", "ai", "port" }
            };
        }
    }
}
```

```csharp
// Editor/StradaMcpBridge.cs
using Strada.Mcp.Editor.Commands;
using Strada.Mcp.Editor.Events;
using Strada.Mcp.Editor.Server;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor
{
    /// <summary>
    /// Main entry point for the Strada MCP Bridge.
    /// Singleton that manages the TCP server, command registry, and event broadcaster.
    /// Auto-starts on editor load if configured.
    /// </summary>
    [InitializeOnLoad]
    public class StradaMcpBridge
    {
        private const string PortKey = "StradaMcp.Port";
        private const string AutoStartKey = "StradaMcp.AutoStart";
        private const int DefaultPort = 7691;

        private static StradaMcpBridge _instance;

        private TcpBridgeServer _server;
        private JsonRpcHandler _rpcHandler;
        private CommandRegistry _commandRegistry;
        private EventBroadcaster _eventBroadcaster;

        public static StradaMcpBridge Instance
        {
            get
            {
                if (_instance == null)
                    _instance = new StradaMcpBridge();
                return _instance;
            }
        }

        public bool IsRunning => _server?.IsRunning == true;
        public bool IsClientConnected => _server?.IsClientConnected == true;
        public int Port => _server?.Port ?? EditorPrefs.GetInt(PortKey, DefaultPort);
        public int RegisteredCommandCount => _commandRegistry?.GetAllMethods().Count ?? 0;

        /// <summary>
        /// Static constructor — called on editor load via [InitializeOnLoad].
        /// </summary>
        static StradaMcpBridge()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorPrefs.GetBool(AutoStartKey, true))
                {
                    Instance.StartServer();
                }
            };
        }

        /// <summary>
        /// Starts the TCP server and registers all command handlers.
        /// </summary>
        public void StartServer()
        {
            if (_server != null && _server.IsRunning)
            {
                Debug.LogWarning("[StradaMCP] Server already running.");
                return;
            }

            // Initialize components
            _commandRegistry = new CommandRegistry();
            _rpcHandler = new JsonRpcHandler(_commandRegistry);
            _server = new TcpBridgeServer();
            _eventBroadcaster = new EventBroadcaster(_server);

            // Register all command handlers
            RegisterCommands();

            // Wire up message handling
            _server.OnMessageReceived += OnMessage;

            // Start server
            int port = EditorPrefs.GetInt(PortKey, DefaultPort);
            _server.Start(port);

            // Start event broadcasting
            _eventBroadcaster.Subscribe();

            Debug.Log($"[StradaMCP] Bridge started with {_commandRegistry.GetAllMethods().Count} commands on port {port}");
        }

        /// <summary>
        /// Stops the TCP server and cleans up.
        /// </summary>
        public void StopServer()
        {
            _eventBroadcaster?.Unsubscribe();
            _server?.OnMessageReceived -= OnMessage;
            _server?.Stop();

            _server = null;
            _rpcHandler = null;
            _commandRegistry = null;
            _eventBroadcaster = null;
        }

        private void OnMessage(string json)
        {
            string response = _rpcHandler.HandleRequest(json);

            // Send response (null for notifications)
            if (response != null)
                _server.Send(response);
        }

        private void RegisterCommands()
        {
            GameObjectCommands.RegisterAll(_commandRegistry);
            ComponentCommands.RegisterAll(_commandRegistry);
            SceneCommands.RegisterAll(_commandRegistry);
            AssetCommands.RegisterAll(_commandRegistry);
            EditorCommands.RegisterAll(_commandRegistry);
            ProjectCommands.RegisterAll(_commandRegistry);
        }
    }
}
```

**Step 2: Commit**

```bash
git add unity-package/com.strada.mcp/Editor/UI/
git add unity-package/com.strada.mcp/Editor/StradaMcpBridge.cs
git commit -m "feat(unity-pkg): add settings window, editor menu, and main bridge entry point"
```

---

### Task 9: Unit tests (NUnit for Unity)

**Files:**
- Update existing test files with additional coverage
- Verify: `Tests/Editor/MessageFramerTests.cs` (Task 2)
- Verify: `Tests/Editor/CommandRegistryTests.cs` (Task 4)
- Verify: `Tests/Editor/JsonRpcHandlerTests.cs` (Task 4)

All tests were written alongside their implementations in Tasks 2 and 4.

**Step 1: Run full test suite in Unity Test Runner**

Open Unity > Window > General > Test Runner > EditMode tab > Run All

Expected results:
- `MessageFramerTests` — 7 tests PASS
- `CommandRegistryTests` — 5 tests PASS
- `JsonRpcHandlerTests` — 7 tests PASS

Total: 19 NUnit tests passing.

**Step 2: Final verification**

```
Verify folder structure matches:
unity-package/com.strada.mcp/
  package.json
  README.md
  CHANGELOG.md
  LICENSE
  Runtime/
    StradaMcp.Runtime.asmdef
  Editor/
    StradaMcp.Editor.asmdef
    StradaMcpBridge.cs
    Server/
      TcpBridgeServer.cs
      JsonRpcHandler.cs
      MessageFramer.cs
    Commands/
      ICommandHandler.cs
      CommandRegistry.cs
      GameObjectCommands.cs
      ComponentCommands.cs
      SceneCommands.cs
      AssetCommands.cs
      EditorCommands.cs
      ProjectCommands.cs
    Events/
      EventBroadcaster.cs
      EventTypes.cs
    UI/
      McpSettingsWindow.cs
      McpSettingsProvider.cs
  Tests/
    Editor/
      StradaMcp.Editor.Tests.asmdef
      MessageFramerTests.cs
      JsonRpcHandlerTests.cs
      CommandRegistryTests.cs
```

**Step 3: Push Phase 15**

```bash
git push origin main
```

**Phase 15 complete.** Deliverables:
- UPM package `com.strada.mcp` (Unity 2021.3+)
- Length-prefix TCP message framing matching Phase 7 protocol
- Non-blocking TCP server using `EditorApplication.update` polling
- JSON-RPC 2.0 handler with full error code support
- Command handlers for all 36 bridge-dependent tools (7 GO + 4 Component + 6 Scene + 8 Asset + 7 Editor + 8 Project)
- Event broadcaster for 6 editor event types
- Settings window + Project Settings integration
- Editor menu under Strada/MCP/
- Auto-start on editor load (configurable)
- 19 NUnit tests passing
