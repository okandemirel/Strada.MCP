#if UNITY_EDITOR && STRADA_CORE_PRESENT
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Strada.Core.Bootstrap;
using Strada.Core.DI;
using Strada.Core.Editor.DataProviders;
using Strada.Core.Editor.DataProviders.Models;
using Strada.Core.Editor.HotReload;
using Strada.Core.Editor.Profiling;
using Strada.Core.Editor.Validation;
using Strada.Core.Logging;
using Strada.Core.Modules;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEngine;

namespace Strada.Mcp.Editor.Integration.StradaCore
{
    public static class StradaCoreCommands
    {
        public static object ModuleGraph(Dictionary<string, object> parameters)
        {
            var config = FindBootstrapperConfig();
            if (config == null)
            {
                return Unavailable("No GameBootstrapperConfig asset was found.");
            }

            var enabledModules = config.GetEnabledModules().Where(module => module != null).ToList();
            var modules = enabledModules
                .Select(module => (object)new Dictionary<string, object>
                {
                    { "name", module.ModuleName },
                    { "type", module.GetType().FullName },
                    { "priority", module.Priority },
                    { "enabled", module.Enabled },
                    { "dependencies", module.Dependencies.Where(dep => dep != null).Select(dep => (object)dep.ModuleName).ToList() },
                    { "systems", module.GetEnabledSystems().Select(entry => (object)new Dictionary<string, object>
                        {
                            { "systemType", entry.SystemType?.Type?.FullName ?? "Unknown" },
                            { "order", entry.Order }
                        }).ToList()
                    }
                })
                .ToList();

            var edges = enabledModules
                .SelectMany(module => module.Dependencies.Where(dep => dep != null).Select(dep => (object)new Dictionary<string, object>
                {
                    { "source", module.ModuleName },
                    { "target", dep.ModuleName }
                }))
                .ToList();

            var validation = ModuleValidationService.ValidateAll(config);
            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "configPath", AssetDatabase.GetAssetPath(config) },
                { "moduleCount", enabledModules.Count },
                { "modules", modules },
                { "edges", edges },
                { "validation", SerializeModuleValidationResults(validation) }
            };
        }

        public static object ContainerGraph(Dictionary<string, object> parameters)
        {
            if (!Application.isPlaying)
            {
                return Unavailable("Container graph is only available while Unity is in Play Mode.");
            }

            var provider = ContainerDataProvider.Instance;
            var snapshot = provider.GetData();
            if (snapshot == null)
            {
                return Unavailable("Strada container data is not available. Ensure GameBootstrapper has initialized.");
            }

            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "summary", new Dictionary<string, object>
                    {
                        { "registrationCount", snapshot.RegistrationCount },
                        { "singletonCount", snapshot.SingletonCount },
                        { "transientCount", snapshot.TransientCount },
                        { "scopedCount", snapshot.ScopedCount },
                        { "timestamp", snapshot.Timestamp.ToString("o") }
                    }
                },
                { "registrations", snapshot.Registrations.Select(reg => (object)SerializeRegistration(reg)).ToList() },
                { "graph", SerializeDependencyGraph(provider.BuildDependencyGraph()) }
            };
        }

        public static object ArchitectureValidate(Dictionary<string, object> parameters)
        {
            var issues = ArchitectureValidator.Instance.ValidateAll().ToList();
            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "summary", new Dictionary<string, object>
                    {
                        { "issueCount", issues.Count },
                        { "errorCount", issues.Count(issue => issue.Severity == Strada.Core.Editor.Validation.ValidationSeverity.Error) },
                        { "warningCount", issues.Count(issue => issue.Severity == Strada.Core.Editor.Validation.ValidationSeverity.Warning) }
                    }
                },
                { "issues", issues.Select(issue => (object)SerializeArchitectureIssue(issue)).ToList() }
            };
        }

        public static object ModuleValidate(Dictionary<string, object> parameters)
        {
            var config = FindBootstrapperConfig();
            if (config == null)
            {
                return Unavailable("No GameBootstrapperConfig asset was found.");
            }

            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "configPath", AssetDatabase.GetAssetPath(config) },
                { "results", SerializeModuleValidationResults(ModuleValidationService.ValidateAll(config)) }
            };
        }

        public static object SystemProfile(Dictionary<string, object> parameters)
        {
            if (!Application.isPlaying)
            {
                return Unavailable("System profiling is only available while Unity is in Play Mode.");
            }

            if (SystemProfilerHook.ActiveProfiler == null)
            {
                SystemProfilerHook.ActiveProfiler = new SystemProfiler();
                SystemProfilerHook.RegisterSystemsFromWorld();
                SystemProfilerHook.ActiveProfiler.StartRecording();
            }

            var profiler = SystemProfilerHook.ActiveProfiler;
            var metrics = profiler.GetAllMetrics();
            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "isRecording", profiler.IsRecording },
                { "registeredSystemCount", profiler.GetRegisteredSystems().Count() },
                { "metrics", metrics.Select(metric => (object)new Dictionary<string, object>
                    {
                        { "systemType", metric.SystemType?.FullName ?? "Unknown" },
                        { "phase", metric.Phase.ToString() },
                        { "averageMs", metric.AverageMs },
                        { "minMs", metric.MinMs },
                        { "maxMs", metric.MaxMs },
                        { "lastExecutionMs", metric.LastExecutionMs },
                        { "sampleCount", metric.SampleCount }
                    }).ToList()
                }
            };
        }

        public static object HotReload(Dictionary<string, object> parameters)
        {
            string action = GetString(parameters, "action", "get");
            if (action == "set")
            {
                if (parameters.TryGetValue("enabled", out var enabled) && enabled != null)
                {
                    HotReloadManager.IsEnabled = Convert.ToBoolean(enabled);
                }

                if (parameters.TryGetValue("notificationsEnabled", out var notificationsEnabled) && notificationsEnabled != null)
                {
                    HotReloadManager.NotificationsEnabled = Convert.ToBoolean(notificationsEnabled);
                }
            }

            var state = HotReloadManager.LastReloadState;
            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "enabled", HotReloadManager.IsEnabled },
                { "notificationsEnabled", HotReloadManager.NotificationsEnabled },
                { "isProcessing", HotReloadManager.IsProcessing },
                { "pendingChangeCount", HotReloadManager.PendingChangeCount },
                { "dependencyMap", HotReloadManager.GetDependencyMap().ToDictionary(kvp => kvp.Key.FullName, kvp => (object)kvp.Value) },
                { "lastReload", new Dictionary<string, object>
                    {
                        { "hasActivity", state.HasActivity },
                        { "lastReloadTime", state.HasActivity ? state.LastReloadTime.ToString("o") : null },
                        { "lastConfigPath", state.LastConfigPath },
                        { "wasSuccessful", state.WasSuccessful },
                        { "errorMessage", state.ErrorMessage }
                    }
                }
            };
        }

        public static object LogSettings(Dictionary<string, object> parameters)
        {
            string action = GetString(parameters, "action", "get");
            var settings = StradaLogSettings.Instance;
            if (action == "set")
            {
                if (parameters.TryGetValue("showLogs", out var showLogs) && showLogs != null)
                {
                    settings.ShowLogs = Convert.ToBoolean(showLogs);
                }

                if (parameters.TryGetValue("deepLogsEnabled", out var deepLogs) && deepLogs != null)
                {
                    settings.DeepLogsEnabled = Convert.ToBoolean(deepLogs);
                }

                if (parameters.TryGetValue("maxLogEntries", out var maxEntries) && maxEntries != null)
                {
                    settings.MaxLogEntries = Convert.ToInt32(maxEntries);
                }

                if (parameters.TryGetValue("moduleVisibility", out var moduleVisibility) && moduleVisibility is Dictionary<string, object> visibilityMap)
                {
                    foreach (var entry in visibilityMap)
                    {
                        if (Enum.TryParse(entry.Key, true, out LogModule module))
                        {
                            settings.SetModuleVisible(module, Convert.ToBoolean(entry.Value));
                        }
                    }
                }

                EditorUtility.SetDirty(settings);
                AssetDatabase.SaveAssets();
            }

            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "showLogs", settings.ShowLogs },
                { "deepLogsEnabled", settings.DeepLogsEnabled },
                { "maxLogEntries", settings.MaxLogEntries },
                { "moduleVisibility", Enum.GetValues(typeof(LogModule))
                    .Cast<LogModule>()
                    .ToDictionary(module => module.ToString(), module => (object)settings.IsModuleVisible(module))
                }
            };
        }

        public static object ValidationReport(Dictionary<string, object> parameters)
        {
            return new Dictionary<string, object>
            {
                { "available", true },
                { "authority", "authoritative" },
                { "architecture", ArchitectureValidate(parameters) },
                { "modules", ModuleValidate(parameters) }
            };
        }

        private static GameBootstrapperConfig FindBootstrapperConfig()
        {
            var guids = AssetDatabase.FindAssets("t:GameBootstrapperConfig");
            if (guids == null || guids.Length == 0)
            {
                return null;
            }

            var path = AssetDatabase.GUIDToAssetPath(guids[0]);
            return AssetDatabase.LoadAssetAtPath<GameBootstrapperConfig>(path);
        }

        private static Dictionary<string, object> SerializeRegistration(ServiceRegistrationInfo registration)
        {
            return new Dictionary<string, object>
            {
                { "serviceType", registration.ServiceType?.FullName ?? "Unknown" },
                { "implementationType", registration.ImplementationType?.FullName ?? "Unknown" },
                { "lifetime", registration.Lifetime.ToString() },
                { "hasInstance", registration.HasInstance },
                { "dependencies", registration.Dependencies.Select(dep => (object)(dep?.FullName ?? "Unknown")).ToList() }
            };
        }

        private static Dictionary<string, object> SerializeDependencyGraph(DependencyGraph graph)
        {
            return new Dictionary<string, object>
            {
                { "hasCycle", graph.HasCycle },
                { "cyclePath", graph.CyclePath?.Select(type => (object)(type?.FullName ?? "Unknown")).ToList() ?? new List<object>() },
                { "nodes", graph.Nodes.Select(node => (object)new Dictionary<string, object>
                    {
                        { "serviceType", node.ServiceType?.FullName ?? "Unknown" },
                        { "implementationType", node.ImplementationType?.FullName ?? "Unknown" },
                        { "lifetime", node.Lifetime.ToString() }
                    }).ToList()
                },
                { "edges", graph.Edges.Select(edge => (object)new Dictionary<string, object>
                    {
                        { "source", edge.Source?.FullName ?? "Unknown" },
                        { "target", edge.Target?.FullName ?? "Unknown" },
                        { "isCircular", edge.IsCircular }
                    }).ToList()
                }
            };
        }

        private static Dictionary<string, object> SerializeArchitectureIssue(Strada.Core.Editor.Validation.ValidationIssue issue)
        {
            return new Dictionary<string, object>
            {
                { "severity", issue.Severity.ToString() },
                { "message", issue.Message },
                { "filePath", issue.FilePath },
                { "lineNumber", issue.LineNumber },
                { "suggestedFix", issue.SuggestedFix },
                { "relatedType", issue.RelatedType?.FullName }
            };
        }

        private static List<object> SerializeModuleValidationResults(IEnumerable<ModuleValidationResult> results)
        {
            return results.Select(result => (object)new Dictionary<string, object>
            {
                { "moduleName", result.ModuleName },
                { "isValid", result.IsValid },
                { "errors", result.Errors.Cast<object>().ToList() },
                { "warnings", result.Warnings.Cast<object>().ToList() }
            }).ToList();
        }

        private static Dictionary<string, object> Unavailable(string reason)
        {
            return new Dictionary<string, object>
            {
                { "available", false },
                { "authority", "authoritative" },
                { "status", "unavailable" },
                { "reason", reason }
            };
        }

        private static string GetString(Dictionary<string, object> dict, string key, string fallback = null)
        {
            if (dict != null && dict.TryGetValue(key, out var raw) && raw != null)
            {
                return raw.ToString();
            }

            return fallback;
        }
    }
}
#endif
