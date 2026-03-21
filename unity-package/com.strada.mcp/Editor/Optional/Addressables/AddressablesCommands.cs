#if UNITY_EDITOR && UNITY_ADDRESSABLES_PRESENT
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Strada.Mcp.Editor.Server;
using Strada.Mcp.Runtime;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Build;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;

namespace Strada.Mcp.Editor.Integration.Addressables
{
    public static class AddressablesCommands
    {
        public static object Manage(Dictionary<string, object> parameters)
        {
            string action = GetString(parameters, "action", "status");
            bool createIfMissing = GetBool(parameters, "createIfMissing", false)
                || action == "createGroup"
                || action == "addEntry";

            var settings = AddressableAssetSettingsDefaultObject.GetSettings(createIfMissing);
            if (settings == null)
            {
                if (action == "status")
                {
                    return new Dictionary<string, object>
                    {
                        { "available", true },
                        { "settingsExists", false },
                        { "settingsAssetPath", null },
                        { "groupCount", 0 },
                        { "activeProfileId", null },
                        { "activeProfileName", null }
                    };
                }

                return new Dictionary<string, object>
                {
                    { "available", false },
                    { "status", "unavailable" },
                    { "reason", "Addressables settings do not exist in this project." }
                };
            }

            switch (action)
            {
                case "status":
                    return BuildStatus(settings);
                case "listGroups":
                    return new Dictionary<string, object>
                    {
                        { "available", true },
                        { "groups", settings.groups.Where(group => group != null).Select(SerializeGroup).Cast<object>().ToList() }
                    };
                case "listEntries":
                    return ListEntries(settings, GetString(parameters, "groupName"));
                case "listProfiles":
                    return new Dictionary<string, object>
                    {
                        { "available", true },
                        { "activeProfileId", settings.activeProfileId },
                        { "activeProfileName", settings.profileSettings.GetProfileName(settings.activeProfileId) },
                        { "profiles", settings.profileSettings.GetAllProfileNames().Cast<object>().ToList() }
                    };
                case "setActiveProfile":
                    return SetActiveProfile(settings, GetString(parameters, "profileName"));
                case "createGroup":
                    return CreateGroup(settings, GetString(parameters, "groupName"), GetBool(parameters, "readOnly", false));
                case "addEntry":
                    return AddEntry(settings, parameters);
                case "moveEntry":
                    return MoveEntry(settings, parameters);
                case "build":
                    return Build(settings);
                case "diagnostics":
                    return Diagnostics(settings);
                default:
                    throw new JsonRpcException(ErrorCode.InvalidParams, $"Unsupported addressables action: {action}");
            }
        }

        private static object BuildStatus(AddressableAssetSettings settings)
        {
            return new Dictionary<string, object>
            {
                { "available", true },
                { "settingsExists", AddressableAssetSettingsDefaultObject.SettingsExists },
                { "settingsAssetPath", AssetDatabase.GetAssetPath(settings) },
                { "groupCount", settings.groups.Count(group => group != null) },
                { "activeProfileId", settings.activeProfileId },
                { "activeProfileName", settings.profileSettings.GetProfileName(settings.activeProfileId) }
            };
        }

        private static object SetActiveProfile(AddressableAssetSettings settings, string profileName)
        {
            if (string.IsNullOrEmpty(profileName))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "profileName is required");
            }

            string profileId = settings.profileSettings.GetProfileId(profileName);
            if (string.IsNullOrEmpty(profileId))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, $"Addressables profile not found: {profileName}");
            }

            settings.activeProfileId = profileId;
            EditorUtility.SetDirty(settings);
            AssetDatabase.SaveAssets();

            return new Dictionary<string, object>
            {
                { "available", true },
                { "activeProfileId", profileId },
                { "activeProfileName", settings.profileSettings.GetProfileName(settings.activeProfileId) }
            };
        }

        private static object CreateGroup(AddressableAssetSettings settings, string groupName, bool readOnly)
        {
            if (string.IsNullOrEmpty(groupName))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "groupName is required");
            }

            var existing = settings.groups.FirstOrDefault(group => group != null && string.Equals(group.Name, groupName, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                return SerializeGroup(existing);
            }

            string uniqueName = MakeUniqueGroupName(settings, groupName);
            var group = settings.CreateGroup(uniqueName, false, readOnly, true, null,
                typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
            AssetDatabase.SaveAssets();
            return SerializeGroup(group);
        }

        private static object AddEntry(AddressableAssetSettings settings, Dictionary<string, object> parameters)
        {
            string assetPath = GetString(parameters, "assetPath");
            string groupName = GetString(parameters, "groupName");
            string address = GetString(parameters, "address");
            bool readOnly = GetBool(parameters, "readOnly", false);

            if (string.IsNullOrEmpty(assetPath))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "assetPath is required");
            }

            string guid = AssetDatabase.AssetPathToGUID(assetPath);
            if (string.IsNullOrEmpty(guid))
            {
                throw new JsonRpcException(ErrorCode.AssetNotFound, $"Asset not found: {assetPath}");
            }

            var group = ResolveGroup(settings, groupName, createIfMissing: true);
            var entry = settings.CreateOrMoveEntry(guid, group, readOnly, true);
            if (!string.IsNullOrEmpty(address))
            {
                entry.SetAddress(address);
            }

            foreach (var label in GetStringList(parameters, "labels"))
            {
                entry.SetLabel(label, true, true, false);
            }

            AssetDatabase.SaveAssets();
            return SerializeEntry(entry);
        }

        private static object MoveEntry(AddressableAssetSettings settings, Dictionary<string, object> parameters)
        {
            string assetPath = GetString(parameters, "assetPath");
            string groupName = GetString(parameters, "groupName");
            if (string.IsNullOrEmpty(assetPath) || string.IsNullOrEmpty(groupName))
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, "assetPath and groupName are required");
            }

            string guid = AssetDatabase.AssetPathToGUID(assetPath);
            if (string.IsNullOrEmpty(guid))
            {
                throw new JsonRpcException(ErrorCode.AssetNotFound, $"Asset not found: {assetPath}");
            }

            var group = ResolveGroup(settings, groupName, createIfMissing: false);
            var entry = settings.CreateOrMoveEntry(guid, group, GetBool(parameters, "readOnly", false), true);
            AssetDatabase.SaveAssets();
            return SerializeEntry(entry);
        }

        private static object ListEntries(AddressableAssetSettings settings, string groupName)
        {
            var groups = string.IsNullOrEmpty(groupName)
                ? settings.groups.Where(group => group != null)
                : settings.groups.Where(group => group != null && string.Equals(group.Name, groupName, StringComparison.OrdinalIgnoreCase));

            var entries = groups
                .SelectMany(group => group.entries ?? Array.Empty<AddressableAssetEntry>())
                .Distinct()
                .Select(SerializeEntry)
                .Cast<object>()
                .ToList();

            return new Dictionary<string, object>
            {
                { "available", true },
                { "count", entries.Count },
                { "entries", entries }
            };
        }

        private static object Build(AddressableAssetSettings settings)
        {
            AddressableAssetSettings.BuildPlayerContent(out AddressablesPlayerBuildResult result);
            return new Dictionary<string, object>
            {
                { "available", true },
                { "success", string.IsNullOrEmpty(result.Error) },
                { "error", result.Error },
                { "duration", result.Duration },
                { "outputPath", result.OutputPath },
                { "locationCount", result.LocationCount }
            };
        }

        private static object Diagnostics(AddressableAssetSettings settings)
        {
            var groups = settings.groups.Where(group => group != null).ToList();
            var entries = groups.SelectMany(group => group.entries ?? Array.Empty<AddressableAssetEntry>()).Distinct().ToList();
            return new Dictionary<string, object>
            {
                { "available", true },
                { "groupCount", groups.Count },
                { "entryCount", entries.Count },
                { "groupsWithoutEntries", groups.Where(group => !group.entries.Any()).Select(group => (object)group.Name).ToList() },
                { "groupsWithBundledSchema", groups.Where(group => group.HasSchema<BundledAssetGroupSchema>()).Select(group => (object)group.Name).ToList() },
                {
                    "duplicateAddresses",
                    entries.GroupBy(entry => entry.address)
                        .Where(group => !string.IsNullOrEmpty(group.Key) && group.Count() > 1)
                        .Select(group => (object)new Dictionary<string, object>
                        {
                            { "address", group.Key },
                            { "count", group.Count() },
                            { "entries", group.Select(entry => (object)SerializeEntry(entry)).ToList() }
                        })
                        .ToList()
                }
            };
        }

        private static object SerializeGroup(AddressableAssetGroup group)
        {
            return new Dictionary<string, object>
            {
                { "name", group.Name },
                { "guid", group.Guid },
                { "entryCount", group.entries.Count },
                { "schemaTypes", group.Schemas.Select(schema => (object)schema.GetType().Name).ToList() }
            };
        }

        private static object SerializeEntry(AddressableAssetEntry entry)
        {
            return new Dictionary<string, object>
            {
                { "guid", entry.guid },
                { "address", entry.address },
                { "assetPath", entry.AssetPath },
                { "groupName", entry.parentGroup != null ? entry.parentGroup.Name : null },
                { "labels", entry.labels.Cast<object>().ToList() },
                { "readOnly", entry.ReadOnly },
                { "isFolder", entry.IsFolder },
                { "isScene", entry.IsScene }
            };
        }

        private static AddressableAssetGroup ResolveGroup(AddressableAssetSettings settings, string groupName, bool createIfMissing)
        {
            if (string.IsNullOrEmpty(groupName))
            {
                return settings.DefaultGroup;
            }

            var group = settings.groups.FirstOrDefault(candidate => candidate != null && string.Equals(candidate.Name, groupName, StringComparison.OrdinalIgnoreCase));
            if (group != null)
            {
                return group;
            }

            if (!createIfMissing)
            {
                throw new JsonRpcException(ErrorCode.InvalidParams, $"Addressables group not found: {groupName}");
            }

            var created = settings.CreateGroup(MakeUniqueGroupName(settings, groupName), false, false, true, null,
                typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
            AssetDatabase.SaveAssets();
            return created;
        }

        private static string MakeUniqueGroupName(AddressableAssetSettings settings, string groupName)
        {
            string baseName = string.IsNullOrWhiteSpace(groupName) ? "New Group" : groupName.Trim();
            string candidate = baseName;
            int suffix = 1;
            while (settings.groups.Any(group => group != null && string.Equals(group.Name, candidate, StringComparison.OrdinalIgnoreCase)))
            {
                candidate = $"{baseName} {suffix++}";
            }

            return candidate;
        }

        private static string GetString(Dictionary<string, object> dict, string key, string defaultValue = null)
        {
            if (dict == null || !dict.TryGetValue(key, out object raw) || raw == null)
            {
                return defaultValue;
            }

            return raw.ToString();
        }

        private static bool GetBool(Dictionary<string, object> dict, string key, bool defaultValue = false)
        {
            if (dict == null || !dict.TryGetValue(key, out object raw) || raw == null)
            {
                return defaultValue;
            }

            return raw is bool boolValue ? boolValue : string.Equals(raw.ToString(), "true", StringComparison.OrdinalIgnoreCase);
        }

        private static List<string> GetStringList(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.TryGetValue(key, out object raw) || raw == null)
            {
                return new List<string>();
            }

            if (raw is IEnumerable enumerable && !(raw is string))
            {
                var list = new List<string>();
                foreach (var item in enumerable)
                {
                    if (item != null)
                    {
                        list.Add(item.ToString());
                    }
                }
                return list;
            }

            return new List<string> { raw.ToString() };
        }
    }
}
#endif
