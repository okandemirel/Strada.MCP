# Changelog

## [1.0.0] - 2026-03-13

### Added
- TCP bridge server binding to 127.0.0.1:7691
- JSON-RPC 2.0 protocol types with newline-delimited framing
- Command dispatcher with registry pattern
- GameObject commands (create, find, modify, delete, duplicate)
- Component commands (add, remove, list)
- Transform commands (set, get, setParent)
- Editor commands (playMode, selection, console, menu)
- Event broadcaster for Unity editor events
- Settings window (Strada > MCP > Settings)
- Auto-start on domain reload via InitializeOnLoad
