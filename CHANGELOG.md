# Changelog

All notable changes to Strada.MCP will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-13

### Added

#### Tools (49)

- **Strada Framework** (10): `strada_create_component`, `strada_create_system`, `strada_create_module`, `strada_create_mediator`, `strada_create_service`, `strada_create_controller`, `strada_create_model`, `strada_analyze_project`, `strada_validate_architecture`, `strada_scaffold_feature`
- **Unity Runtime** (18): `unity_create_gameobject`, `unity_find_gameobjects`, `unity_modify_gameobject`, `unity_delete_gameobject`, `unity_duplicate_gameobject`, `unity_add_component`, `unity_remove_component`, `unity_get_components`, `unity_set_transform`, `unity_get_transform`, `unity_set_parent`, `unity_play`, `unity_get_play_state`, `unity_execute_menu`, `unity_console_log`, `unity_console_clear`, `unity_selection_get`, `unity_selection_set`
- **File Operations** (6): `file_read`, `file_write`, `file_edit`, `file_delete`, `file_rename`, `list_directory`
- **Search** (3): `glob_search`, `grep_search`, `code_search`
- **Git** (6): `git_status`, `git_diff`, `git_log`, `git_commit`, `git_branch`, `git_stash`
- **.NET Build** (2): `dotnet_build`, `dotnet_test`
- **Analysis** (4): `code_quality`, `csharp_parse`, `dependency_graph`, `project_health`

#### Resources (10)

- `strada://api-reference` — Strada.Core API documentation
- `strada://namespaces` — Namespace hierarchy
- `strada://examples/{pattern}` — Code examples (ECS, MVCS, DI)
- `unity://manifest` — Unity package manifest
- `unity://project-settings/{category}` — Project settings by category
- `unity://assemblies` — Assembly definitions
- `unity://file-stats` — Project file statistics
- `unity://scene-hierarchy` — Active scene hierarchy (bridge)
- `unity://console-logs` — Console output (bridge)
- `unity://play-state` — Play mode state (bridge)

#### Prompts (6)

- `create_ecs_feature` — ECS feature creation guidance
- `create_mvcs_feature` — MVCS pattern scaffold guidance
- `analyze_architecture` — Architecture review prompt
- `debug_performance` — Performance debugging guidance
- `optimize_build` — Build optimization checklist
- `setup_scene` — Scene setup workflow guidance

#### Infrastructure

- Dual transport: stdio + Streamable HTTP
- Unity Editor bridge via TCP (port 7691, localhost only)
- RAG pipeline: Tree-sitter C# parser + Gemini Embedding 2.0 + HNSW vector index
- Strada.Brain integration (optional HTTP bridge)
- Security: path guard, credential scrubber, input validator, read-only mode, script execution opt-in
- Unity package: com.strada.mcp (UPM, Unity 2021.3+)
- Documentation in 8 languages
