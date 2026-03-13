#if UNITY_EDITOR
using Strada.Mcp.Editor.Server;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.UI
{
    /// <summary>
    /// Editor window for configuring and monitoring the Strada MCP bridge.
    /// Accessible via Strada > MCP > Settings menu.
    /// </summary>
    public class McpSettingsWindow : EditorWindow
    {
        private const string PortPrefKey = "StradaMcp_Port";
        private const string AutoStartPrefKey = "StradaMcp_AutoStart";

        private int _port;
        private bool _autoStart;

        [MenuItem("Strada/MCP/Settings")]
        public static void ShowWindow()
        {
            var window = GetWindow<McpSettingsWindow>("MCP Settings");
            window.minSize = new Vector2(320, 220);
        }

        private void OnEnable()
        {
            _port = EditorPrefs.GetInt(PortPrefKey, TcpBridgeServer.DefaultPort);
            _autoStart = EditorPrefs.GetBool(AutoStartPrefKey, true);
        }

        private void OnGUI()
        {
            GUILayout.Space(10);
            GUILayout.Label("Strada MCP Bridge", EditorStyles.boldLabel);
            GUILayout.Space(5);

            DrawConnectionStatus();
            GUILayout.Space(10);

            DrawConfiguration();
            GUILayout.Space(10);

            DrawControls();
        }

        private void DrawConnectionStatus()
        {
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);

            bool isRunning = McpBridge.IsRunning;
            bool isConnected = McpBridge.Server != null && McpBridge.Server.IsClientConnected;

            string statusText;
            Color statusColor;

            if (isConnected)
            {
                statusText = "Connected";
                statusColor = new Color(0.2f, 0.8f, 0.2f);
            }
            else if (isRunning)
            {
                statusText = "Listening (no client)";
                statusColor = new Color(0.9f, 0.7f, 0.1f);
            }
            else
            {
                statusText = "Stopped";
                statusColor = new Color(0.8f, 0.2f, 0.2f);
            }

            EditorGUILayout.BeginHorizontal();
            GUILayout.Label("Status:", GUILayout.Width(60));
            var previousColor = GUI.color;
            GUI.color = statusColor;
            GUILayout.Label(statusText, EditorStyles.boldLabel);
            GUI.color = previousColor;
            EditorGUILayout.EndHorizontal();

            if (isRunning && McpBridge.Server != null)
            {
                EditorGUILayout.BeginHorizontal();
                GUILayout.Label("Endpoint:", GUILayout.Width(60));
                GUILayout.Label($"{TcpBridgeServer.BindAddress}:{McpBridge.Server.Port}");
                EditorGUILayout.EndHorizontal();

                if (isConnected)
                {
                    EditorGUILayout.BeginHorizontal();
                    GUILayout.Label("Client:", GUILayout.Width(60));
                    GUILayout.Label(McpBridge.Server.ClientEndpoint ?? "unknown");
                    EditorGUILayout.EndHorizontal();
                }
            }

            EditorGUILayout.EndVertical();
        }

        private void DrawConfiguration()
        {
            EditorGUILayout.LabelField("Configuration", EditorStyles.boldLabel);

            EditorGUI.BeginChangeCheck();

            _port = EditorGUILayout.IntField("Port", _port);
            _port = Mathf.Clamp(_port, 1024, 65535);

            _autoStart = EditorGUILayout.Toggle("Auto-Start on Load", _autoStart);

            if (EditorGUI.EndChangeCheck())
            {
                EditorPrefs.SetInt(PortPrefKey, _port);
                EditorPrefs.SetBool(AutoStartPrefKey, _autoStart);
            }
        }

        private void DrawControls()
        {
            EditorGUILayout.LabelField("Controls", EditorStyles.boldLabel);

            bool isRunning = McpBridge.IsRunning;

            EditorGUILayout.BeginHorizontal();

            if (isRunning)
            {
                if (GUILayout.Button("Stop Server", GUILayout.Height(30)))
                {
                    McpBridge.Shutdown();
                    Repaint();
                }
            }
            else
            {
                if (GUILayout.Button("Start Server", GUILayout.Height(30)))
                {
                    McpBridge.Initialize(_port);
                    Repaint();
                }
            }

            if (isRunning)
            {
                if (GUILayout.Button("Restart", GUILayout.Height(30), GUILayout.Width(80)))
                {
                    McpBridge.Shutdown();
                    McpBridge.Initialize(_port);
                    Repaint();
                }
            }

            EditorGUILayout.EndHorizontal();
        }

        /// <summary>
        /// Returns whether auto-start is enabled in EditorPrefs.
        /// </summary>
        public static bool IsAutoStartEnabled()
        {
            return EditorPrefs.GetBool(AutoStartPrefKey, true);
        }

        /// <summary>
        /// Returns the configured port from EditorPrefs.
        /// </summary>
        public static int GetConfiguredPort()
        {
            return EditorPrefs.GetInt(PortPrefKey, TcpBridgeServer.DefaultPort);
        }
    }
}
#endif
