#if UNITY_EDITOR
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Server
{
    /// <summary>
    /// Single-client TCP server for JSON-RPC 2.0 communication with the MCP server.
    /// Binds to 127.0.0.1 only (security). Uses newline-delimited framing.
    /// Receives on background thread, dispatches to main thread via ConcurrentQueue.
    /// </summary>
    public sealed class TcpBridgeServer : IDisposable
    {
        public const int DefaultPort = 7691;
        public const string BindAddress = "127.0.0.1";

        public event Action OnClientConnected;
        public event Action OnClientDisconnected;
        public event Action<string> OnMessageReceived;
        public event Action<string> OnError;

        public bool IsRunning => _isRunning;
        public bool IsClientConnected => _client != null && _client.Connected;
        public string ClientEndpoint => _clientEndpoint;
        public int Port => _port;

        private readonly int _port;
        private TcpListener _listener;
        private TcpClient _client;
        private NetworkStream _stream;
        private Thread _listenThread;
        private Thread _readThread;
        private volatile bool _isRunning;
        private string _clientEndpoint;

        private readonly ConcurrentQueue<Action> _mainThreadQueue = new ConcurrentQueue<Action>();

        public TcpBridgeServer(int port = DefaultPort)
        {
            _port = port;
        }

        /// <summary>
        /// Starts the TCP server and begins listening for a single client connection.
        /// </summary>
        public void Start()
        {
            if (_isRunning) return;

            try
            {
                _listener = new TcpListener(IPAddress.Parse(BindAddress), _port);
                _listener.Start();
                _isRunning = true;

                _listenThread = new Thread(ListenLoop)
                {
                    Name = "StradaMcp-Listen",
                    IsBackground = true
                };
                _listenThread.Start();

                EditorApplication.update += ProcessMainThreadQueue;

                Debug.Log($"[Strada.MCP] TCP server started on {BindAddress}:{_port}");
            }
            catch (Exception ex)
            {
                _isRunning = false;
                Debug.LogError($"[Strada.MCP] Failed to start TCP server: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Stops the server and disconnects any connected client.
        /// </summary>
        public void Stop()
        {
            if (!_isRunning) return;
            _isRunning = false;

            EditorApplication.update -= ProcessMainThreadQueue;

            DisconnectClient();

            try
            {
                _listener?.Stop();
            }
            catch (Exception)
            {
                // Listener may already be disposed
            }

            _listener = null;

            // Wait for threads to exit
            if (_listenThread != null && _listenThread.IsAlive)
            {
                _listenThread.Join(1000);
            }
            _listenThread = null;

            Debug.Log("[Strada.MCP] TCP server stopped");
        }

        /// <summary>
        /// Sends a message to the connected client with newline-delimited framing.
        /// Thread-safe.
        /// </summary>
        public void Send(string message)
        {
            if (_stream == null || !IsClientConnected) return;

            try
            {
                // Ensure message ends with newline (framing delimiter)
                if (!message.EndsWith("\n"))
                    message += "\n";

                byte[] data = Encoding.UTF8.GetBytes(message);
                lock (_stream)
                {
                    _stream.Write(data, 0, data.Length);
                    _stream.Flush();
                }
            }
            catch (Exception ex)
            {
                EnqueueMainThread(() => OnError?.Invoke($"Send error: {ex.Message}"));
                DisconnectClient();
            }
        }

        public void Dispose()
        {
            Stop();
        }

        // --- Background Threads ---

        private void ListenLoop()
        {
            while (_isRunning)
            {
                try
                {
                    // Accept with a timeout so we can check _isRunning
                    if (!_listener.Server.IsBound) break;

                    if (_listener.Pending())
                    {
                        var newClient = _listener.AcceptTcpClient();

                        // Disconnect existing client if any (single-client server)
                        if (_client != null)
                        {
                            DisconnectClient();
                        }

                        _client = newClient;
                        _stream = _client.GetStream();
                        _clientEndpoint = _client.Client.RemoteEndPoint?.ToString() ?? "unknown";

                        EnqueueMainThread(() => OnClientConnected?.Invoke());

                        _readThread = new Thread(ReadLoop)
                        {
                            Name = "StradaMcp-Read",
                            IsBackground = true
                        };
                        _readThread.Start();
                    }
                    else
                    {
                        Thread.Sleep(50);
                    }
                }
                catch (SocketException)
                {
                    // Listener was stopped
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        EnqueueMainThread(() => OnError?.Invoke($"Listen error: {ex.Message}"));
                    }
                    Thread.Sleep(100);
                }
            }
        }

        private void ReadLoop()
        {
            var buffer = new StringBuilder();
            var readBuffer = new byte[4096];

            try
            {
                while (_isRunning && _client != null && _client.Connected)
                {
                    if (_stream == null || !_stream.CanRead) break;

                    int bytesRead;
                    try
                    {
                        bytesRead = _stream.Read(readBuffer, 0, readBuffer.Length);
                    }
                    catch (IOException)
                    {
                        break;
                    }
                    catch (ObjectDisposedException)
                    {
                        break;
                    }

                    if (bytesRead == 0)
                    {
                        // Client disconnected
                        break;
                    }

                    string chunk = Encoding.UTF8.GetString(readBuffer, 0, bytesRead);
                    buffer.Append(chunk);

                    // Process newline-delimited messages
                    string content = buffer.ToString();
                    int newlineIndex;
                    while ((newlineIndex = content.IndexOf('\n')) >= 0)
                    {
                        string message = content.Substring(0, newlineIndex).Trim();
                        content = content.Substring(newlineIndex + 1);

                        if (!string.IsNullOrEmpty(message))
                        {
                            string msg = message; // Capture for closure
                            EnqueueMainThread(() => OnMessageReceived?.Invoke(msg));
                        }
                    }
                    buffer.Clear();
                    if (content.Length > 0)
                    {
                        buffer.Append(content);
                    }
                }
            }
            catch (Exception ex)
            {
                if (_isRunning)
                {
                    EnqueueMainThread(() => OnError?.Invoke($"Read error: {ex.Message}"));
                }
            }

            // Client disconnected
            EnqueueMainThread(() =>
            {
                _clientEndpoint = null;
                OnClientDisconnected?.Invoke();
            });
        }

        // --- Main Thread Dispatch ---

        private void EnqueueMainThread(Action action)
        {
            _mainThreadQueue.Enqueue(action);
        }

        private void ProcessMainThreadQueue()
        {
            // Process up to 100 messages per frame to avoid blocking
            int processed = 0;
            while (processed < 100 && _mainThreadQueue.TryDequeue(out Action action))
            {
                try
                {
                    action?.Invoke();
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[Strada.MCP] Main thread dispatch error: {ex}");
                }
                processed++;
            }
        }

        private void DisconnectClient()
        {
            try { _stream?.Close(); } catch { }
            try { _client?.Close(); } catch { }
            _stream = null;
            _client = null;
            _clientEndpoint = null;

            if (_readThread != null && _readThread.IsAlive)
            {
                _readThread.Join(500);
            }
            _readThread = null;
        }
    }
}
#endif
