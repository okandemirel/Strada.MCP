#if UNITY_EDITOR && UNITY_TEST_FRAMEWORK_PRESENT
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.TestTools.TestRunner.Api;
using UnityEngine;

namespace Strada.Mcp.Editor.Integration.TestFramework
{
    public static class TestFrameworkCommands
    {
        private sealed class CallbackHandler : ScriptableObject, ICallbacks
        {
            public void RunStarted(ITestAdaptor testsToRun)
            {
                if (string.IsNullOrEmpty(_activeRunId) || !_runs.TryGetValue(_activeRunId, out var record))
                {
                    return;
                }

                record.Status = "running";
                record.StartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                record.TotalTests = CountTests(testsToRun);
            }

            public void RunFinished(ITestResultAdaptor result)
            {
                if (string.IsNullOrEmpty(_activeRunId) || !_runs.TryGetValue(_activeRunId, out var record))
                {
                    return;
                }

                record.Status = "completed";
                record.FinishedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                record.Summary = BuildSummary(result);
                record.Tests = FlattenResults(result).Cast<object>().ToList();
                record.FailedTests = record.Tests
                    .OfType<Dictionary<string, object>>()
                    .Where(test => !string.Equals(test["status"]?.ToString(), "Passed", StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(test["status"]?.ToString(), "Skipped", StringComparison.OrdinalIgnoreCase))
                    .Cast<object>()
                    .ToList();
            }

            public void TestStarted(ITestAdaptor test)
            {
            }

            public void TestFinished(ITestResultAdaptor result)
            {
            }
        }

        private sealed class TestRunRecord
        {
            public string RunId;
            public string Mode;
            public string Status = "queued";
            public long CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            public long? StartedAt;
            public long? FinishedAt;
            public int TotalTests;
            public Dictionary<string, object> Summary = new Dictionary<string, object>();
            public List<object> Tests = new List<object>();
            public List<object> FailedTests = new List<object>();
        }

        private static readonly Dictionary<string, TestRunRecord> _runs = new Dictionary<string, TestRunRecord>(StringComparer.Ordinal);
        private static TestRunnerApi _api;
        private static CallbackHandler _callbacks;
        private static string _activeRunId;
        private static string _latestRunId;

        public static object ListTests(Dictionary<string, object> parameters)
        {
            EnsureInitialized();

            var mode = GetString(parameters, "mode", "edit");
            ITestAdaptor root = null;
            _api.RetrieveTestList(ParseMode(mode), adaptor => root = adaptor);

            return new Dictionary<string, object>
            {
                { "available", true },
                { "mode", mode },
                { "tests", root != null ? FlattenTests(root).Cast<object>().ToList() : new List<object>() }
            };
        }

        public static object RunTests(Dictionary<string, object> parameters)
        {
            EnsureInitialized();

            var mode = GetString(parameters, "mode", "edit");
            var runId = Guid.NewGuid().ToString("N");
            var record = new TestRunRecord
            {
                RunId = runId,
                Mode = mode
            };

            _runs[runId] = record;
            _activeRunId = runId;
            _latestRunId = runId;

            var filter = new Filter
            {
                testMode = ParseMode(mode),
                testNames = GetStringArray(GetNestedDictionary(parameters, "filter"), "testNames"),
                groupNames = GetStringArray(GetNestedDictionary(parameters, "filter"), "groupNames"),
                assemblyNames = GetStringArray(GetNestedDictionary(parameters, "filter"), "assemblyNames"),
                categoryNames = GetStringArray(GetNestedDictionary(parameters, "filter"), "categoryNames")
            };

            var executionSettings = new ExecutionSettings(filter)
            {
                runSynchronously = GetBool(parameters, "runSynchronously", true)
            };

            _api.Execute(executionSettings);

            return SerializeRecord(record);
        }

        public static object GetResults(Dictionary<string, object> parameters)
        {
            var runId = GetString(parameters, "runId", _latestRunId);
            if (string.IsNullOrEmpty(runId) || !_runs.TryGetValue(runId, out var record))
            {
                return new Dictionary<string, object>
                {
                    { "status", "idle" },
                    { "runId", runId }
                };
            }

            bool includePassed = GetBool(parameters, "includePassed", true);
            return SerializeRecord(record, includePassed);
        }

        private static void EnsureInitialized()
        {
            if (_api != null)
            {
                return;
            }

            _api = ScriptableObject.CreateInstance<TestRunnerApi>();
            _callbacks = ScriptableObject.CreateInstance<CallbackHandler>();
            _api.RegisterCallbacks(_callbacks);
        }

        private static TestMode ParseMode(string mode)
        {
            switch ((mode ?? "edit").ToLowerInvariant())
            {
                case "play":
                    return TestMode.PlayMode;
                default:
                    return TestMode.EditMode;
            }
        }

        private static List<Dictionary<string, object>> FlattenTests(ITestAdaptor root)
        {
            var tests = new List<Dictionary<string, object>>();
            if (root == null)
            {
                return tests;
            }

            foreach (var child in root.Children ?? Enumerable.Empty<ITestAdaptor>())
            {
                tests.Add(new Dictionary<string, object>
                {
                    { "name", child.Name },
                    { "fullName", child.FullName },
                    { "hasChildren", child.HasChildren }
                });

                if (child.HasChildren)
                {
                    tests.AddRange(FlattenTests(child));
                }
            }

            return tests;
        }

        private static List<Dictionary<string, object>> FlattenResults(ITestResultAdaptor root)
        {
            var results = new List<Dictionary<string, object>>();
            if (root == null)
            {
                return results;
            }

            foreach (var child in root.Children ?? Enumerable.Empty<ITestResultAdaptor>())
            {
                var test = child.Test;
                var payload = new Dictionary<string, object>
                {
                    { "name", test?.Name ?? "Unknown" },
                    { "fullName", test?.FullName ?? test?.Name ?? "Unknown" },
                    { "status", child.TestStatus.ToString() },
                    { "resultState", child.ResultState }
                };

                if (!string.IsNullOrEmpty(child.Message))
                {
                    payload["message"] = child.Message;
                }

                if (!string.IsNullOrEmpty(child.StackTrace))
                {
                    payload["stackTrace"] = child.StackTrace;
                }

                results.Add(payload);

                if (child.HasChildren)
                {
                    results.AddRange(FlattenResults(child));
                }
            }

            return results;
        }

        private static Dictionary<string, object> BuildSummary(ITestResultAdaptor result)
        {
            return new Dictionary<string, object>
            {
                { "passed", result?.PassCount ?? 0 },
                { "failed", result?.FailCount ?? 0 },
                { "skipped", result?.SkipCount ?? 0 },
                { "inconclusive", result?.InconclusiveCount ?? 0 },
                { "status", result?.TestStatus.ToString() ?? "Unknown" }
            };
        }

        private static int CountTests(ITestAdaptor adaptor)
        {
            if (adaptor == null)
            {
                return 0;
            }

            if (!adaptor.HasChildren)
            {
                return 1;
            }

            return adaptor.Children.Sum(CountTests);
        }

        private static Dictionary<string, object> SerializeRecord(TestRunRecord record, bool includePassed = true)
        {
            var tests = includePassed
                ? record.Tests
                : record.Tests
                    .OfType<Dictionary<string, object>>()
                    .Where(test => !string.Equals(test["status"]?.ToString(), "Passed", StringComparison.OrdinalIgnoreCase))
                    .Cast<object>()
                    .ToList();

            return new Dictionary<string, object>
            {
                { "available", true },
                { "runId", record.RunId },
                { "mode", record.Mode },
                { "status", record.Status },
                { "createdAt", record.CreatedAt },
                { "startedAt", record.StartedAt },
                { "finishedAt", record.FinishedAt },
                { "summary", record.Summary },
                { "tests", tests },
                { "failedTests", record.FailedTests }
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

        private static bool GetBool(Dictionary<string, object> dict, string key, bool fallback)
        {
            if (dict != null && dict.TryGetValue(key, out var raw) && raw != null)
            {
                return Convert.ToBoolean(raw);
            }

            return fallback;
        }

        private static Dictionary<string, object> GetNestedDictionary(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out var raw) || raw == null)
            {
                return null;
            }

            return raw as Dictionary<string, object>;
        }

        private static string[] GetStringArray(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out var raw) || raw == null)
            {
                return null;
            }

            if (raw is IList list)
            {
                return list.Cast<object>().Where(item => item != null).Select(item => item.ToString()).ToArray();
            }

            return new[] { raw.ToString() };
        }
    }
}
#endif
