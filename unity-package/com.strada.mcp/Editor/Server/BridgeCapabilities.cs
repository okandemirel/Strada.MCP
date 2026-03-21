#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using Strada.Mcp.Editor.Extensibility;
using UnityEngine;

namespace Strada.Mcp.Editor.Server
{
    public static class BridgeCapabilities
    {
        private const int ManifestVersion = 1;
        private const string BridgeVersion = "1.0.0";
        private const string ProtocolVersion = "2.0";

        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("bridge.getCapabilities", _ => BuildManifest(dispatcher));
        }

        public static Dictionary<string, object> BuildManifest(CommandDispatcher dispatcher)
        {
            var methods = dispatcher.RegisteredMethods
                .Distinct()
                .OrderBy(method => method, StringComparer.Ordinal)
                .Cast<object>()
                .ToList();

            var features = BuildFeatures(dispatcher)
                .Distinct()
                .OrderBy(feature => feature, StringComparer.Ordinal)
                .Cast<object>()
                .ToList();

            return new Dictionary<string, object>
            {
                { "manifestVersion", ManifestVersion },
                { "bridgeVersion", BridgeVersion },
                { "protocolVersion", ProtocolVersion },
                { "supportedMethods", methods },
                { "supportedFeatures", features },
                { "metadata", new Dictionary<string, object>
                    {
                        { "unityVersion", Application.unityVersion },
                        { "generatedAtUtc", DateTime.UtcNow.ToString("O") },
                        { "projectToolCount", ProjectExtensionRegistry.BuildManifest().Count }
                    }
                }
            };
        }

        private static IEnumerable<string> BuildFeatures(CommandDispatcher dispatcher)
        {
            yield return "bridge.capability-manifest";
            yield return "jsonrpc.response-string-ids";

            foreach (var feature in EnumerateFeatureMappings(dispatcher))
            {
                yield return feature;
            }

            if (Type.GetType("Strada.Mcp.Editor.Integration.TestFramework.TestFrameworkCommands, StradaMcp.Editor.TestFramework") != null)
            {
                yield return "unity-test-framework";
            }
        }

        private static IEnumerable<string> EnumerateFeatureMappings(CommandDispatcher dispatcher)
        {
            if (dispatcher.HasHandler("editor.compileStatus"))
            {
                yield return "editor.compile-status";
            }

            if (dispatcher.HasHandler("editor.getConsoleLogs"))
            {
                yield return "editor.console-logs";
            }

            if (dispatcher.HasHandler("editor.assemblyReloadStatus"))
            {
                yield return "editor.assembly-reload-status";
            }

            if (dispatcher.HasHandler("editor.recompile"))
            {
                yield return "editor.recompile";
            }

            if (dispatcher.HasHandler("editor.projectToolManifest"))
            {
                yield return "unity-project-extensions";
            }

            if (dispatcher.HasHandler("editor.screenshotCapture") && dispatcher.HasHandler("editor.visualSnapshot"))
            {
                yield return "editor.visual-diagnostics";
            }

            if (dispatcher.HasHandler("strada.systemProfile"))
            {
                yield return "strada-system-profile";
            }
        }
    }
}
#endif
