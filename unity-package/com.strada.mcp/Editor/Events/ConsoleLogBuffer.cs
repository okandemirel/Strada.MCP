#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Strada.Mcp.Editor.Events
{
    internal static class ConsoleLogBuffer
    {
        private const int MaxEntries = 500;
        private static readonly List<Dictionary<string, object>> Entries = new List<Dictionary<string, object>>();
        private static readonly object Gate = new object();
        private static readonly Regex FileLineRegex = new Regex(@"\(at (.+):(\d+)\)", RegexOptions.Compiled);

        public static void Record(string condition, string stackTrace, LogType type)
        {
            var entry = new Dictionary<string, object>
            {
                { "message", condition ?? string.Empty },
                { "stackTrace", stackTrace ?? string.Empty },
                { "type", NormalizeType(type) },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
                { "category", InferCategory(condition, stackTrace) }
            };

            var match = FileLineRegex.Match(stackTrace ?? string.Empty);
            if (match.Success)
            {
                entry["file"] = match.Groups[1].Value;
                if (int.TryParse(match.Groups[2].Value, out int line))
                {
                    entry["line"] = line;
                }
            }

            lock (Gate)
            {
                Entries.Add(entry);
                while (Entries.Count > MaxEntries)
                {
                    Entries.RemoveAt(0);
                }
            }
        }

        public static Dictionary<string, object> Snapshot(
            int limit = 100,
            IEnumerable<string> types = null,
            bool includeStackTrace = true)
        {
            List<Dictionary<string, object>> copy;
            lock (Gate)
            {
                copy = Entries.Select(CloneEntry).ToList();
            }

            var typeSet = types != null
                ? new HashSet<string>(types.Where(t => !string.IsNullOrEmpty(t)).Select(t => t.ToLowerInvariant()))
                : null;

            if (typeSet != null && typeSet.Count > 0)
            {
                copy = copy.Where(entry =>
                {
                    if (!entry.TryGetValue("type", out object rawType) || rawType == null)
                    {
                        return false;
                    }
                    return typeSet.Contains(rawType.ToString().ToLowerInvariant());
                }).ToList();
            }

            if (!includeStackTrace)
            {
                foreach (var entry in copy)
                {
                    entry.Remove("stackTrace");
                }
            }

            var filtered = copy
                .OrderByDescending(entry => GetTimestamp(entry))
                .Take(Math.Max(1, limit))
                .ToList();

            return new Dictionary<string, object>
            {
                { "entries", filtered },
                { "totalCount", copy.Count }
            };
        }

        private static long GetTimestamp(Dictionary<string, object> entry)
        {
            if (entry.TryGetValue("timestamp", out object value))
            {
                if (value is long l) return l;
                if (value is int i) return i;
                if (value is double d) return (long)d;
                if (long.TryParse(value?.ToString(), out long parsed)) return parsed;
            }
            return 0;
        }

        private static Dictionary<string, object> CloneEntry(Dictionary<string, object> entry)
        {
            return entry.ToDictionary(pair => pair.Key, pair => pair.Value);
        }

        private static string NormalizeType(LogType type)
        {
            switch (type)
            {
                case LogType.Warning:
                    return "warning";
                case LogType.Error:
                    return "error";
                case LogType.Exception:
                    return "exception";
                case LogType.Assert:
                    return "assert";
                default:
                    return "log";
            }
        }

        private static string InferCategory(string condition, string stackTrace)
        {
            string message = condition ?? string.Empty;
            string trace = stackTrace ?? string.Empty;
            if (message.Contains("error CS", StringComparison.OrdinalIgnoreCase)
                || message.Contains("Compiler error", StringComparison.OrdinalIgnoreCase)
                || trace.Contains("Compiler", StringComparison.OrdinalIgnoreCase))
            {
                return "compile";
            }
            return "runtime";
        }
    }
}
#endif
