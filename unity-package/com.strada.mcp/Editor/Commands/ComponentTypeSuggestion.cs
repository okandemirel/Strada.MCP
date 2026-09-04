#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;

namespace Strada.Mcp.Editor.Commands
{
    /// <summary>
    /// Turns "Component type not found" into a sentence the caller can act on.
    ///
    /// Measured live 2026-09-04: a sprint asked scene_build for
    /// Game.Modules.PixelFlowSim.Views.TapInputService. The type exists as
    /// Game.Modules.PixelFlowSim.TapInputService — one invented namespace
    /// segment away — and the tool answered "Scene NOT assembled. type not
    /// found: &lt;name&gt;", which does not say whether the type is missing or
    /// merely misspelled. The sprint had no way to tell those apart and the
    /// scene was never assembled.
    ///
    /// Pure and dependency-free on purpose: the caller collects candidates from
    /// the loaded assemblies, this decides what to say, and the decision is
    /// testable without a Unity domain.
    /// </summary>
    public static class ComponentTypeSuggestion
    {
        /// <summary>How many near matches the message names before counting.</summary>
        public const int MaxNamed = 5;

        /// <summary>
        /// The failure message for <paramref name="requested"/>, given every
        /// component type full name that exists.
        /// </summary>
        public static string Describe(string requested, IEnumerable<string> componentFullNames)
        {
            string head = "Component type not found: " + (requested ?? string.Empty);
            if (string.IsNullOrEmpty(requested)) return head;

            string shortName = ShortNameOf(requested);
            List<string> matches = (componentFullNames ?? Enumerable.Empty<string>())
                .Where(n => !string.IsNullOrEmpty(n))
                .Where(n => string.Equals(ShortNameOf(n), shortName, StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.Ordinal)
                .OrderBy(n => n, StringComparer.Ordinal)
                .ToList();

            if (matches.Count == 0)
            {
                // Saying "no type of that NAME exists anywhere" is a different
                // instruction from "you used the wrong namespace", and the
                // caller cannot pick a fix without knowing which it is.
                return head + ". No component type named '" + shortName +
                       "' exists in any loaded assembly — the script may be missing or may not compile.";
            }

            if (matches.Count == 1)
            {
                return head + ". Use '" + matches[0] + "' — that is the only component named '" +
                       shortName + "', and the namespace you gave does not exist.";
            }

            List<string> shown = matches.Take(MaxNamed).ToList();
            // No silent cap: a trimmed list says it was trimmed.
            string tail = matches.Count > shown.Count
                ? " (+" + (matches.Count - shown.Count) + " more)"
                : string.Empty;
            return head + ". " + matches.Count + " components are named '" + shortName +
                   "': " + string.Join(", ", shown) + tail + " — use one of these full names.";
        }

        private static string ShortNameOf(string fullName)
        {
            if (string.IsNullOrEmpty(fullName)) return string.Empty;
            int dot = fullName.LastIndexOf('.');
            return dot >= 0 && dot + 1 < fullName.Length ? fullName.Substring(dot + 1) : fullName;
        }
    }
}
#endif
