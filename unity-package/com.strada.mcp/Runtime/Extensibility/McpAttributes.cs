using System;

namespace Strada.Mcp.Runtime.Extensibility
{
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
    public sealed class McpToolAttribute : Attribute
    {
        public string Name { get; }
        public string Description { get; }
        public bool ReadOnly { get; set; }
        public bool Dangerous { get; set; }
        public string Category { get; set; } = "project";

        public McpToolAttribute(string name, string description)
        {
            Name = name;
            Description = description;
        }
    }

    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
    public sealed class McpPromptAttribute : Attribute
    {
        public string Name { get; }
        public string Description { get; }

        public McpPromptAttribute(string name, string description)
        {
            Name = name;
            Description = description;
        }
    }

    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
    public sealed class McpResourceAttribute : Attribute
    {
        public string Uri { get; }
        public string Description { get; }
        public string MimeType { get; set; } = "application/json";

        public McpResourceAttribute(string uri, string description)
        {
            Uri = uri;
            Description = description;
        }
    }
}
