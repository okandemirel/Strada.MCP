#if UNITY_EDITOR
using Strada.Mcp.Editor.Commands;
using Strada.Mcp.Editor.Events;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Editor.UI;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor
{
    /// <summary>
    /// Entry point for the Strada MCP bridge in Unity Editor.
    /// Initializes on domain load, creates the TCP server, command dispatcher,
    /// and event broadcaster. Handles domain reload and editor shutdown.
    /// </summary>
    [InitializeOnLoad]
    public static class McpBridge
    {
        /// <summary>
        /// The active TCP bridge server instance, or null if not running.
        /// </summary>
        public static TcpBridgeServer Server { get; private set; }

        /// <summary>
        /// The command dispatcher for routing JSON-RPC requests to handlers.
        /// </summary>
        public static CommandDispatcher Dispatcher { get; private set; }

        /// <summary>
        /// The event broadcaster for sending Unity events as notifications.
        /// </summary>
        public static EventBroadcaster Broadcaster { get; private set; }

        /// <summary>
        /// Whether the MCP bridge server is currently running.
        /// </summary>
        public static bool IsRunning => Server != null && Server.IsRunning;

        static McpBridge()
        {
            // Defer initialization to first editor update to avoid issues during domain reload
            EditorApplication.delayCall += OnDelayedInit;
            EditorApplication.quitting += Shutdown;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
        }

        private static void OnDelayedInit()
        {
            if (McpSettingsWindow.IsAutoStartEnabled())
            {
                int port = McpSettingsWindow.GetConfiguredPort();
                Initialize(port);
            }
        }

        /// <summary>
        /// Initializes the MCP bridge with the specified port.
        /// Creates the server, dispatcher, and broadcaster, and registers all command handlers.
        /// </summary>
        /// <param name="port">The TCP port to listen on. Defaults to 7691.</param>
        public static void Initialize(int port = TcpBridgeServer.DefaultPort)
        {
            if (IsRunning)
            {
                Debug.Log("[Strada.MCP] Bridge already running, skipping initialization");
                return;
            }

            try
            {
                // Create server
                Server = new TcpBridgeServer(port);

                // Create dispatcher and wire to server
                Dispatcher = new CommandDispatcher();
                Server.OnMessageReceived += OnMessageReceived;
                Server.OnClientConnected += OnClientConnected;
                Server.OnClientDisconnected += OnClientDisconnected;
                Server.OnError += OnServerError;

                // Register all command handlers
                GameObjectCommands.Register(Dispatcher);
                ComponentCommands.Register(Dispatcher);
                TransformCommands.Register(Dispatcher);
                EditorCommands.Register(Dispatcher);

                // Create event broadcaster
                Broadcaster = new EventBroadcaster(Server);

                // Start listening
                Server.Start();

                Debug.Log($"[Strada.MCP] Bridge initialized with {Dispatcher.HandlerCount} handlers on port {port}");
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[Strada.MCP] Failed to initialize bridge: {ex.Message}");
                Shutdown();
            }
        }

        /// <summary>
        /// Shuts down the MCP bridge, cleaning up all resources.
        /// </summary>
        public static void Shutdown()
        {
            if (Broadcaster != null)
            {
                Broadcaster.Unsubscribe();
                Broadcaster = null;
            }

            if (Server != null)
            {
                Server.OnMessageReceived -= OnMessageReceived;
                Server.OnClientConnected -= OnClientConnected;
                Server.OnClientDisconnected -= OnClientDisconnected;
                Server.OnError -= OnServerError;
                Server.Dispose();
                Server = null;
            }

            Dispatcher = null;

            Debug.Log("[Strada.MCP] Bridge shut down");
        }

        // --- Event Handlers ---

        private static void OnMessageReceived(string rawMessage)
        {
            if (Dispatcher == null) return;

            string response = Dispatcher.ProcessMessage(rawMessage);
            if (response != null && Server != null)
            {
                Server.Send(response);
            }
        }

        private static void OnClientConnected()
        {
            Debug.Log($"[Strada.MCP] Client connected: {Server?.ClientEndpoint}");
        }

        private static void OnClientDisconnected()
        {
            Debug.Log("[Strada.MCP] Client disconnected");
        }

        private static void OnServerError(string error)
        {
            Debug.LogWarning($"[Strada.MCP] Server error: {error}");
        }

        private static void OnBeforeAssemblyReload()
        {
            // Clean up before domain reload to prevent socket leaks
            Shutdown();
        }
    }
}
#endif
