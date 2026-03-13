<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>The most comprehensive framework-aware Unity MCP server</strong></p>
  <p>76 tools, 10 resources, 6 prompts — with Strada.Core intelligence, RAG-powered search, and Unity Editor bridge</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-purple.svg" alt="MCP Compatible"></a>
    <img src="https://img.shields.io/badge/Unity-2021.3%2B-black.svg" alt="Unity 2021.3+">
  </p>

  <p>
    <a href="README.md">English</a> |
    <a href="docs/README.tr.md">Turkce</a> |
    <a href="docs/README.ja.md">日本語</a> |
    <a href="docs/README.ko.md">한국어</a> |
    <a href="docs/README.zh.md">中文</a> |
    <a href="docs/README.de.md">Deutsch</a> |
    <a href="docs/README.es.md">Espanol</a> |
    <a href="docs/README.fr.md">Francais</a>
  </p>
</div>

---

## Overview

Strada.MCP is a Model Context Protocol (MCP) server purpose-built for Unity and Strada.Core development. It bridges AI assistants (Claude, GPT, etc.) directly into your Unity workflow.

**Dual-user architecture:**
- **Standalone mode** — Works with Claude Desktop, Cursor, Windsurf, VS Code + Continue out of the box
- **Brain mode** — Integrates with Strada.Brain for enhanced memory, learning, and goal execution

**Why Strada.MCP?**
- **Framework-aware**: The only Unity MCP server that understands Strada.Core patterns (ECS, MVCS, DI, modules)
- **Complete toolset**: 76 tools covering files, git, .NET, code analysis, Strada scaffolding, Unity runtime, scene/prefab, assets, subsystems, and project config
- **RAG-powered search**: Tree-sitter C# parsing + Gemini embeddings + HNSW vector search
- **Real-time bridge**: TCP bridge to Unity Editor for live scene manipulation, component editing, and play mode control
- **Security-first**: Path traversal prevention, credential scrubbing, read-only mode, script execution opt-in

## Quick Start

### 1. Install

```bash
npm install -g strada-mcp
```

Or clone and build:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. Configure your IDE

**Claude Desktop** — Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/your/unity/project"
      }
    }
  }
}
```

**Cursor** — Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/your/unity/project"
      }
    }
  }
}
```

### 3. Install Unity Package (optional — for full tool access)

Open Unity Package Manager > "+" > Add package from git URL:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Start using

Ask your AI assistant to work with your Unity project:
- "Create an ECS Health component with Current and Max fields"
- "Find all GameObjects with the Rigidbody component"
- "Analyze the project architecture for anti-patterns"
- "Search the codebase for damage calculation logic"

## Features

### Tool Categories (76 total)

| Category | Count | Requires Unity Bridge |
|----------|-------|-----------------------|
| Strada Framework | 10 | No |
| Unity Runtime | 18 | Yes |
| Unity Scene/Prefab | 8 | Mixed |
| Unity Asset | 8 | Mixed |
| Unity Subsystem | 6 | Yes |
| Unity Config | 4 | Yes |
| Advanced | 5 | Mixed |
| File Operations | 6 | No |
| Search | 3 | No |
| Git | 6 | No |
| .NET Build | 2 | No |
| Analysis | 4 | No |

- **Unity closed**: 35+ tools available (file, git, search, analysis, Strada scaffolding, .NET, scene/prefab analyze)
- **Unity open**: All 76 tools active via bridge

### Strada Framework Tools

These tools are unique to Strada.MCP — no competitor has framework-aware scaffolding.

| Tool | Description |
|------|-------------|
| `strada_create_component` | Generate an ECS component struct implementing IComponent with StructLayout |
| `strada_create_system` | Generate a Strada ECS system (SystemBase, JobSystemBase, or BurstSystemBase) |
| `strada_create_module` | Generate a Strada module with ModuleConfig, assembly definition, and folder structure |
| `strada_create_mediator` | Generate an EntityMediator binding ECS components to a Unity View |
| `strada_create_service` | Generate a Strada service (Service, TickableService, FixedTickableService, or OrderedService) |
| `strada_create_controller` | Generate a Strada Controller with typed model reference and view injection |
| `strada_create_model` | Generate a Strada Model or ReactiveModel with typed properties |
| `strada_analyze_project` | Scan .cs files to map modules, systems, components, services, and DI usage |
| `strada_validate_architecture` | Validate Strada.Core naming conventions, lifetime rules, and dependency rules |
| `strada_scaffold_feature` | Generate a complete feature skeleton: module + components + systems + optional MVCS views |

### Unity Runtime Tools (18)

| Tool | Description |
|------|-------------|
| `unity_create_gameobject` | Create a new GameObject (empty, primitive, or from prefab) |
| `unity_find_gameobjects` | Find GameObjects by name, tag, layer, or component type |
| `unity_modify_gameobject` | Modify GameObject properties (name, active, tag, layer, static) |
| `unity_delete_gameobject` | Delete a GameObject from the scene by instance ID |
| `unity_duplicate_gameobject` | Duplicate a GameObject with optional new name, parent, or offset |
| `unity_add_component` | Add a component to a GameObject by type name |
| `unity_remove_component` | Remove a component from a GameObject by type name |
| `unity_get_components` | List all components attached to a GameObject |
| `unity_set_transform` | Set position, rotation, and/or scale of a GameObject transform |
| `unity_get_transform` | Get the current transform (position, rotation, scale) of a GameObject |
| `unity_set_parent` | Reparent a GameObject under a new parent transform |
| `unity_play` | Control Unity play mode (play, pause, stop, or step one frame) |
| `unity_get_play_state` | Get the current Unity editor play state |
| `unity_execute_menu` | Execute a Unity editor menu command by path |
| `unity_console_log` | Write a message to the Unity console (log, warning, or error) |
| `unity_console_clear` | Clear the Unity editor console |
| `unity_selection_get` | Get the currently selected objects in the Unity editor |
| `unity_selection_set` | Set the editor selection to the specified instance IDs |

### File & Search Tools (9)

| Tool | Description |
|------|-------------|
| `file_read` | Read file contents with line numbers, optional offset/limit |
| `file_write` | Write content to a file, creating directories as needed |
| `file_edit` | Replace text in a file using exact string matching |
| `file_delete` | Delete a file |
| `file_rename` | Rename or move a file |
| `list_directory` | List directory contents with file/directory indicators |
| `glob_search` | Search for files matching a glob pattern |
| `grep_search` | Search file contents using regex with optional context lines |
| `code_search` | RAG-powered semantic code search (requires indexing) |

### Git Tools (6)

| Tool | Description |
|------|-------------|
| `git_status` | Show working tree status (porcelain format) |
| `git_diff` | Show changes between working tree and index (staged/unstaged) |
| `git_log` | Show commit history |
| `git_commit` | Stage files and create a commit |
| `git_branch` | List, create, delete, or switch branches |
| `git_stash` | Stash or restore uncommitted changes |

### .NET Build Tools (2)

| Tool | Description |
|------|-------------|
| `dotnet_build` | Build a .NET project and parse errors/warnings |
| `dotnet_test` | Run .NET tests and parse results summary |

### Analysis Tools (4)

| Tool | Description |
|------|-------------|
| `code_quality` | Analyze C# code for Strada.Core anti-patterns and best-practice violations |
| `csharp_parse` | Parse C# source code into a structured AST with classes, structs, methods, fields, namespaces |
| `dependency_graph` | Analyze Unity project assembly references and namespace dependencies, detect circular dependencies |
| `project_health` | Comprehensive project health check combining code quality, dependency analysis, and file statistics |

### Unity Scene & Prefab Tools (8)

| Tool | Description |
|------|-------------|
| `unity_scene_create` | Create a new Unity scene |
| `unity_scene_open` | Open an existing scene in the editor |
| `unity_scene_save` | Save the current scene |
| `unity_scene_info` | Get scene metadata and statistics |
| `unity_scene_analyze` | Analyze scene hierarchy from YAML (no bridge required) |
| `unity_prefab_create` | Create a new prefab from a GameObject |
| `unity_prefab_instantiate` | Instantiate a prefab in the current scene |
| `unity_prefab_analyze` | Analyze prefab structure from YAML (no bridge required) |

### Unity Asset Tools (8)

| Tool | Description |
|------|-------------|
| `unity_asset_find` | Search for assets by name, type, or label |
| `unity_asset_dependencies` | Analyze asset dependency chains |
| `unity_asset_unused` | Find potentially unused assets in the project |
| `unity_material_get` | Read material properties and shader assignments |
| `unity_material_set` | Modify material properties |
| `unity_shader_list` | List available shaders with keywords and properties |
| `unity_scriptableobject_create` | Create a new ScriptableObject asset |
| `unity_texture_info` | Get texture import settings and metadata |

### Unity Subsystem Tools (6)

| Tool | Description |
|------|-------------|
| `unity_animation_play` | Control animator playback |
| `unity_animation_list` | List animation clips and parameters |
| `unity_physics_raycast` | Perform physics raycasts in the scene |
| `unity_navmesh_bake` | Bake or configure NavMesh settings |
| `unity_particles_control` | Control particle system playback |
| `unity_lighting_bake` | Bake lighting and configure light settings |

### Unity Config Tools (4)

| Tool | Description |
|------|-------------|
| `unity_player_settings` | Get/set player settings (company, product, platform) |
| `unity_quality_settings` | Get/set quality levels and graphics settings |
| `unity_build_settings` | Get/set build targets, scenes, and options |
| `unity_project_settings` | Get/set tags, layers, physics, and input settings |

### Advanced Tools (5)

| Tool | Description |
|------|-------------|
| `batch_execute` | Execute multiple tools in a single request |
| `script_execute` | Execute C# scripts via Roslyn (opt-in, disabled by default) |
| `script_validate` | Validate C# script syntax without execution |
| `csharp_reflection` | Inspect types, methods, and assemblies via reflection |
| `unity_profiler` | Access Unity profiler data and performance metrics |

### RAG-Powered Code Search

```
C# Source -> Tree-sitter AST -> Structural Chunks -> Gemini Embeddings -> HNSW Vector Index
```

- Semantic code search across your entire project
- Understands class/method/field boundaries
- Incremental indexing (only changed files re-indexed)
- Hybrid reranking: vector similarity + keyword + structural context

### Unity Editor Bridge

Real-time TCP connection to Unity Editor (port 7691):
- Create, find, modify, delete GameObjects
- Add/remove/read components
- Transform manipulation (position, rotation, scale, reparenting)
- Play mode control (play, pause, stop, step)
- Console output (log, warning, error, clear)
- Editor selection management
- Menu command execution

### Event Streaming

The bridge broadcasts Unity Editor events in real-time:
- `scene.changed` — Scene opened, closed, saved
- `console.line` — New console log entries
- `compile.started` / `compile.finished` — Script compilation
- `playmode.changed` — Play/pause/stop transitions
- `selection.changed` — Selected object changes

## Resources (10)

| URI | Description | Source |
|-----|-------------|--------|
| `strada://api-reference` | Strada.Core API documentation | File-based |
| `strada://namespaces` | Strada.Core namespace hierarchy | File-based |
| `strada://examples/{pattern}` | Code examples (ECS, MVCS, DI) | File-based |
| `unity://manifest` | Unity package manifest (Packages/manifest.json) | File-based |
| `unity://project-settings/{category}` | Unity project settings by category | File-based |
| `unity://assemblies` | Unity assembly definitions (.asmdef files) | File-based |
| `unity://file-stats` | Unity project file statistics | File-based |
| `unity://scene-hierarchy` | Active scene hierarchy | Bridge |
| `unity://console-logs` | Recent console output | Bridge |
| `unity://play-state` | Current play mode state | Bridge |

## Prompts (6)

| Prompt | Description |
|--------|-------------|
| `create_ecs_feature` | Multi-message sequence guiding ECS feature creation (component, system, module registration) |
| `create_mvcs_feature` | MVCS pattern scaffold guidance for Strada.Core |
| `analyze_architecture` | Architecture review prompt for Strada.Core projects |
| `debug_performance` | Performance debugging guidance for Unity projects |
| `optimize_build` | Build optimization checklist for Unity projects |
| `setup_scene` | Scene setup workflow guidance for Unity projects |

## Installation

### Prerequisites

- Node.js >= 20
- Unity 2021.3+ (for bridge features)
- A Strada.Core project (for framework tools — optional)

### npm (recommended)

```bash
npm install -g strada-mcp
```

### From source

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### IDE Configuration

#### Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project",
        "EMBEDDING_API_KEY": "your-gemini-key"
      }
    }
  }
}
```

#### Cursor

File: `.cursor/mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "npx",
      "args": ["strada-mcp"],
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### Windsurf

File: `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### Claude Code

File: `~/.claude/settings.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### VS Code + Continue

File: `.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "strada-mcp",
          "env": {
            "UNITY_PROJECT_PATH": "/path/to/project"
          }
        }
      }
    ]
  }
}
```

## Unity Package Setup

### Install com.strada.mcp

1. Open Unity > Window > Package Manager
2. Click "+" > "Add package from git URL..."
3. Enter: `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Click Add

### Configuration

After installation:
1. Go to **Strada > MCP > Settings**
2. Set the port (default: 7691)
3. Enable/disable auto-start
4. Verify connection status indicator turns green when MCP server connects

### Manual Control

- **Strada > MCP > Start Server** — Start the bridge
- **Strada > MCP > Stop Server** — Stop the bridge
- **Strada > MCP > Status** — Log current status

## Configuration

All options are configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_TRANSPORT` | Transport mode: `stdio` or `http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP port | `3100` |
| `MCP_HTTP_HOST` | HTTP bind address | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | TCP port for Unity Editor bridge | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Auto-connect to Unity on startup | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Bridge connection timeout (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Path to Unity project (auto-detect if empty) | — |
| `EMBEDDING_PROVIDER` | Embedding provider: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Embedding model name | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Embedding dimensions (128-3072) | `768` |
| `EMBEDDING_API_KEY` | API key for embedding provider | — |
| `RAG_AUTO_INDEX` | Auto-index on startup | `true` |
| `RAG_WATCH_FILES` | Watch for file changes | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL (empty = disabled) | — |
| `BRAIN_API_KEY` | Brain API key | — |
| `ALLOWED_PATHS` | Comma-separated list of allowed root directories | — |
| `READ_ONLY` | Global read-only mode | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Enable Roslyn script execution | `false` |
| `REFLECTION_INVOKE_ENABLED` | Enable C# reflection method invocation | `false` |
| `MAX_FILE_SIZE` | Maximum file size (bytes) | `10485760` |
| `LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Log file path (stderr if empty) | — |

## Brain Integration

When connected to Strada.Brain (`BRAIN_URL` configured):

- **Shared memory**: Brain's long-term memory informs tool suggestions
- **Merged RAG**: Brain memory context + MCP tree-sitter AST combined
- **Learning**: Tool usage patterns feed back into Brain's learning pipeline
- **Goal execution**: Brain can invoke MCP tools as part of goal plans

Without Brain, Strada.MCP operates as a fully independent MCP server.

## Security

| Layer | Protection |
|-------|-----------|
| Input Validation | Zod schema + type checking on all tools |
| Path Guard | Directory traversal prevention, null byte rejection, symlink traversal prevention |
| Read-Only Mode | Global + per-tool write permission enforcement |
| Credential Scrub | API key/token pattern scrubbing in all output |
| Tool Allowlist | Unity bridge accepts only registered JSON-RPC commands |
| Rate Limiting | Embedding API rate limit protection |
| Localhost Only | Unity bridge binds to 127.0.0.1 only |
| Script Execution | Roslyn execution disabled by default, explicit opt-in |

For full details, see [SECURITY.md](SECURITY.md).

## Development

### Building from source

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Running tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run typecheck     # TypeScript type checking
```

### Development mode

```bash
npm run dev           # Run with tsx (auto-reload)
```

### Project Structure

```
src/
  config/          - Zod-validated configuration
  security/        - Path guard, sanitizer, validator
  tools/
    strada/        - 10 Strada framework tools
    unity/         - 18 bridge-dependent Unity tools
    file/          - 6 file operation tools
    search/        - 3 search tools (glob, grep, RAG)
    git/           - 6 git tools
    dotnet/        - 2 .NET build tools
    analysis/      - 4 code analysis tools
  intelligence/
    parser/        - Tree-sitter C# parser
    rag/           - Embedding, chunker, HNSW index
  bridge/          - Unity TCP bridge client
  context/         - Brain HTTP client
  resources/       - 10 MCP resources
  prompts/         - 6 MCP prompts
  utils/           - Logger, process runner

unity-package/
  com.strada.mcp/  - C# Unity Editor package (UPM)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code standards, and PR guidelines.

## License

MIT License. See [LICENSE](LICENSE) for details.
