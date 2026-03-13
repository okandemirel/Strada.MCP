# Strada.MCP Design Document

**Date**: 2026-03-13
**Status**: Approved
**Author**: okanunico + Claude

## Overview

Strada.MCP is a Model Context Protocol server for Unity & Strada.Core development. It provides 83 tools, 10 resources, and 6 prompts — making it the most comprehensive framework-aware Unity MCP on the market.

**Dual-user architecture**: Works standalone for Claude Desktop / Cursor / Windsurf users, AND integrates with Strada.Brain for enhanced intelligence.

## Architecture

### Layered Design

```
+---------------------------------------------+
|  Transport Layer (stdio + Streamable HTTP)   |
+---------------------------------------------+
|  Tool Layer (registry + 10 categories)       |
+---------------------------------------------+
|  Intelligence Layer (RAG + Tree-sitter)      |
+---------------------------------------------+
|  Integration Layer (Unity Bridge + Brain)    |
+---------------------------------------------+
```

### Two-Component System

```
Strada.MCP Server (TypeScript)         Unity Editor (C#)
        |                                      |
        |---- TCP connect (port 7691) -------->|
        |                                      |
        |---- JSON-RPC request --------------->|
        |     { method, params, id }           |
        |                                      |
        |<--- JSON-RPC response ---------------|
        |     { result, id }                   |
        |                                      |
        |<--- Event stream --------------------|
        |     (scene change, console log,      |
        |      compile status, play mode)      |
```

- **Unity closed**: 47 tools work (file, git, search, analysis, Strada scaffolding, .NET)
- **Unity open**: All 83 tools active via bridge
- **Auto-reconnect**: Exponential backoff on disconnect
- **Graceful degradation**: Runtime tools return `unavailable`, file-level tools continue

## Tool Inventory (83 tools)

### Strada Framework (10) — UNIQUE, no competitor has these

| # | Tool | Description |
|---|------|-------------|
| 1 | `strada_create_component` | ECS component struct (IComponent, unmanaged, StructLayout) |
| 2 | `strada_create_system` | SystemBase / JobSystemBase / BurstSystemBase |
| 3 | `strada_create_module` | ModuleConfig + asmdef + folder + SystemEntry/ServiceEntry |
| 4 | `strada_create_mediator` | EntityMediator — ECS to View binding |
| 5 | `strada_create_service` | Service / TickableService / OrderedService |
| 6 | `strada_create_controller` | Controller + Model + View (MVCS pattern) |
| 7 | `strada_create_model` | Model / ReactiveModel / Model\<TData\> |
| 8 | `strada_analyze_project` | Full project analysis — modules, systems, DI, anti-patterns |
| 9 | `strada_validate_architecture` | Best practice validation (naming, lifetime, dependency rules) |
| 10 | `strada_scaffold_feature` | Complete feature module skeleton (module + systems + components + views) |

### Unity Runtime (18) — Requires editor bridge

| # | Tool | Description |
|---|------|-------------|
| 11 | `unity_create_gameobject` | Create GameObject (primitive, empty, from prefab) |
| 12 | `unity_find_gameobjects` | Find by name, tag, component type |
| 13 | `unity_modify_gameobject` | Update name, tag, layer, active state |
| 14 | `unity_delete_gameobject` | Delete (with undo support) |
| 15 | `unity_duplicate_gameobject` | Clone with optional rename |
| 16 | `unity_set_transform` | Position, rotation, scale (local/world) |
| 17 | `unity_reparent_gameobject` | Change hierarchy parent |
| 18 | `unity_add_component` | Add component to GameObject |
| 19 | `unity_remove_component` | Remove component |
| 20 | `unity_get_component` | Read component properties |
| 21 | `unity_modify_component` | Modify component values |
| 22 | `unity_play_mode` | Play / Pause / Stop |
| 23 | `unity_console_logs` | Read console output (filtered) |
| 24 | `unity_screenshot` | Game View / Scene View / Camera capture |
| 25 | `unity_execute_menu_item` | Trigger editor menu actions |
| 26 | `unity_undo_redo` | Undo/redo + group support |
| 27 | `unity_editor_state` | Editor state (play mode, compile status, selection) |
| 28 | `unity_refresh` | Asset refresh / script recompile |

### Unity Scene & Prefab (8)

| # | Tool | Description |
|---|------|-------------|
| 29 | `unity_create_scene` | Create new scene |
| 30 | `unity_open_scene` | Open scene (additive support) |
| 31 | `unity_save_scene` | Save active scene |
| 32 | `unity_get_scene_info` | Scene metadata + hierarchy |
| 33 | `unity_scene_analyze` | YAML parse — stats, component distribution |
| 34 | `unity_create_prefab` | Create prefab |
| 35 | `unity_instantiate_prefab` | Instantiate in scene |
| 36 | `unity_prefab_analyze` | Prefab hierarchy + nested ref analysis |

### Unity Asset & Material (8)

| # | Tool | Description |
|---|------|-------------|
| 37 | `unity_find_assets` | Search by type, name, label |
| 38 | `unity_asset_dependencies` | Dependency graph |
| 39 | `unity_asset_unused` | Find unused assets |
| 40 | `unity_create_material` | Material + shader creation |
| 41 | `unity_modify_material` | Update material properties |
| 42 | `unity_create_scriptableobject` | SO class + asset creation |
| 43 | `unity_shader_analyze` | Shader property, variant, usage analysis |
| 44 | `unity_texture_manage` | Texture import settings, compression |

### Unity Subsystems (10)

| # | Tool | Description |
|---|------|-------------|
| 45 | `unity_animator_analyze` | States, transitions, parameters, layers |
| 46 | `unity_animation_manage` | Clip creation/editing, playback control |
| 47 | `unity_particle_system` | Particle system configuration |
| 48 | `unity_physics_settings` | Physics/Physics2D settings |
| 49 | `unity_navmesh_manage` | NavMesh bake, agent, obstacle |
| 50 | `unity_lighting_manage` | Light baking, volume, post-processing |
| 51 | `unity_audio_manage` | AudioSource, AudioMixer settings |
| 52 | `unity_ui_toolkit_create` | UXML + USS scaffolding |
| 53 | `unity_terrain_manage` | Terrain creation, heightmap, detail painting |
| 54 | `unity_build_pipeline` | Platform, scenes, execute build |

### Unity Project Config (4)

| # | Tool | Description |
|---|------|-------------|
| 55 | `unity_package_manage` | UPM add/remove/search/list |
| 56 | `unity_asmdef_manage` | Assembly definition CRUD + references |
| 57 | `unity_project_settings` | Tags, layers, input, quality, player settings |
| 58 | `unity_editor_script_create` | CustomEditor, PropertyDrawer, EditorWindow scaffolding |

### File & Search (9)

| # | Tool | Description |
|---|------|-------------|
| 59 | `file_read` | Read file (line-numbered, offset/limit) |
| 60 | `file_write` | Write file |
| 61 | `file_edit` | Line/string-based editing |
| 62 | `file_delete` | Delete file |
| 63 | `file_rename` | Rename/move file/directory |
| 64 | `list_directory` | List directory contents |
| 65 | `glob_search` | Pattern-based file search |
| 66 | `grep_search` | Regex content search |
| 67 | `code_search` | RAG-powered semantic code search |

### Git & .NET (8)

| # | Tool | Description |
|---|------|-------------|
| 68 | `git_status` | Working tree status |
| 69 | `git_diff` | Staged/unstaged diff |
| 70 | `git_log` | Commit history |
| 71 | `git_commit` | Create commit |
| 72 | `git_branch` | Branch management |
| 73 | `git_stash` | Stash operations |
| 74 | `dotnet_build` | MSBuild + error parsing |
| 75 | `dotnet_test` | Test execution + result parsing |

### Advanced (8)

| # | Tool | Description |
|---|------|-------------|
| 76 | `batch_execute` | Multiple operations in one call with rollback |
| 77 | `script_execute` | Roslyn dynamic C# compilation and execution |
| 78 | `script_validate` | Roslyn syntax validation (basic + strict) |
| 79 | `csharp_reflection` | Runtime reflection — find and call any C# method |
| 80 | `unity_2d_sprite` | Sprite create/set/info |
| 81 | `unity_2d_tilemap` | Tilemap create/set/fill/clear |
| 82 | `unity_cinemachine` | Virtual camera, blend, dolly |
| 83 | `unity_profiler` | Unity Profiler integration, performance analysis |

### Analysis (reuses intelligence layer, exposed as tools)

| Tool | Description |
|------|-------------|
| `csharp_parse` | Tree-sitter AST — class, method, field, namespace extraction |
| `code_quality` | Anti-pattern detection (Strada-specific rules) |
| `dependency_graph` | Assembly reference mapping |
| `rag_index` | Manual indexing trigger |
| `rag_status` | Index status |
| `project_health` | Overall project health |

Note: These 6 analysis tools are part of the intelligence layer and counted within the search/analysis categories above.

## MCP Resources (10)

| Resource URI | Description |
|-------------|-------------|
| `strada://api-reference` | Strada.Core API documentation |
| `strada://namespaces` | Namespace hierarchy |
| `strada://examples/{pattern}` | Code examples (ECS, MVCS, DI) |
| `unity://project-info` | Project metadata |
| `unity://scene-hierarchy` | Active scene hierarchy |
| `unity://console-logs` | Recent console output |
| `unity://packages` | Installed packages |
| `unity://assets/{type}` | Asset list (type filter) |
| `unity://tags-layers` | Tags and layers |
| `unity://build-settings` | Build configuration |

## MCP Prompts (6)

| Prompt | Description |
|--------|-------------|
| `create_ecs_feature` | Complete ECS feature module wizard |
| `create_mvcs_feature` | Complete MVCS pattern wizard |
| `refactor_to_strada` | Convert vanilla Unity code to Strada patterns |
| `optimize_performance` | Performance analysis + suggestions |
| `create_ui_screen` | UI Toolkit screen scaffold |
| `setup_module` | Interactive module creation |

## RAG Pipeline

### Architecture

```
C# Source Files (.cs)
    -> Tree-sitter Parser (AST extraction)
    -> Structural Chunker (class/method boundaries)
    -> Gemini Embedding 2.0 (Matryoshka 768 default)
    -> HNSW Vector Store (SQLite metadata + hnswlib index)
    -> Hybrid Reranker (vector + keyword + structural)
```

### Brain Synergy

- **Brain connected**: Two RAG results merged — Brain memory context + MCP tree-sitter AST
- **Brain disconnected**: Fully independent with own Gemini embedding pipeline

### Indexing Strategy

- First run: Full .cs file scan, chunk, embed
- Subsequent: Content-hash incremental updates only
- Optional file watcher via Unity bridge compile events
- Manual trigger via `rag_index` tool

## Configuration

Environment-driven with Zod validation:

```
MCP_TRANSPORT          stdio | http (default: stdio)
MCP_HTTP_PORT          Streamable HTTP port (default: 3100)
UNITY_BRIDGE_PORT      TCP port for Unity Editor (default: 7691)
UNITY_PROJECT_PATH     Auto-detect if empty
EMBEDDING_PROVIDER     gemini | openai | ollama (default: gemini)
EMBEDDING_DIMENSIONS   128-3072 (default: 768)
BRAIN_URL              Brain HTTP URL (empty = disabled)
READ_ONLY              Global read-only mode (default: false)
SCRIPT_EXECUTE_ENABLED Roslyn execution (default: false)
LOG_LEVEL              debug | info | warn | error (default: info)
```

## Security

| Layer | Protection |
|-------|-----------|
| Input Validation | Zod schema, type checking |
| Path Guard | Directory traversal prevention, null byte rejection |
| Read-Only Check | Global + per-tool write permission |
| Credential Scrub | API key, token pattern scrubbing in output |
| Tool Allowlist | Unity bridge accepts only defined commands |
| Rate Limiting | Embedding API rate limit |
| Localhost Only | Unity bridge binds to 127.0.0.1 only |
| Script Exec | Disabled by default, explicit flag required |

## Dependencies

```
Runtime (7):
  @modelcontextprotocol/sdk  — MCP protocol
  better-sqlite3              — SQLite for vector metadata
  hnswlib-node                — HNSW vector index
  zod                         — Schema validation
  glob                        — File pattern matching
  tree-sitter                 — C# AST parsing
  tree-sitter-c-sharp         — C# grammar

Dev (4):
  typescript                  — Type system
  vitest                      — Testing
  @types/better-sqlite3       — Type definitions
  tsx                         — Development runner
```

## Development Phases

| Phase | Content | Tools |
|-------|---------|-------|
| 1 | Project skeleton + Transport + Config | 0 |
| 2 | Security layer + File tools | 6 |
| 3 | Search + Git + .NET tools | 11 |
| 4 | Strada framework tools + API reference | 10 |
| 5 | Tree-sitter C# parser + Analysis tools | 4 |
| 6 | RAG pipeline (embeddings, chunker, HNSW, indexer, searcher) | 3 |
| 7 | Unity bridge protocol + connection manager | 0 |
| 8 | Unity runtime tools (GameObject, Component, Editor) | 18 |
| 9 | Unity scene, prefab, asset, material tools | 8 |
| 10 | Unity subsystem tools (animator, physics, nav, audio, terrain, lighting, UI, 2D) | 14 |
| 11 | Unity project config tools (package, asmdef, settings, editor scripts) | 4 |
| 12 | Advanced tools (batch, script exec/validate, reflection, profiler, cinemachine) | 5 |
| 13 | MCP Resources + Prompts | 10R + 6P |
| 14 | Brain bridge (HTTP client, RAG sync) | 0 |
| 15 | com.strada.mcp Unity Package (C#) | 0 |
| 16 | Documentation (8 languages) | 0 |
| 17 | Integration tests + final polish | 0 |

### Phase Dependencies

```
F1 -> F2 -> F3 (parallel with F4)
             F4 -> F5 -> F6
       F2 -> F7 -> F8 -> F9 -> F10 -> F11
                    F8 -> F12
             F7 -> F15 (parallel with F8)
       F4 -> F13
       F6 -> F14
       F15 -> F16
       ALL -> F17
```

## Test Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest | Every tool, parser, security function |
| Integration | Vitest | Tool -> Unity bridge -> mock Unity response |
| E2E | Vitest + MCP client | Real MCP protocol tool calls |
| Security | Dedicated suite | Path traversal, injection, credential leak |

## Competitive Position

| MCP Server | Stars | Tools | Framework-Aware |
|------------|-------|-------|-----------------|
| CoplayDev/unity-mcp | 7K | 37 | No |
| IvanMurzak/Unity-MCP | 1.3K | 54 | No |
| mitchchristow/unity-mcp | 6 | 80 | No |
| Unity MCP Pro ($8) | — | 147 | No |
| **Strada.MCP** | — | **83** | **Yes** |

**Unique advantages**: Framework-aware scaffolding, RAG-powered semantic search, tree-sitter AST, Brain integration, architectural validation.

## Documentation

8 language README files: EN, TR, JA, KO, ZH, DE, ES, FR
Plus: CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE (MIT)
