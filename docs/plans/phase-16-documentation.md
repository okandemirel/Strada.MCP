# Phase 16: Documentation (8 Languages)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create comprehensive documentation for Strada.MCP in 8 languages: English (primary), Turkish, Japanese, Korean, Chinese, German, Spanish, French. Plus supporting files: CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE.

**Architecture:** English README is the canonical source (~500 lines). Translated READMEs preserve all technical content but use natural, native phrasing (not machine translation artifacts). All READMEs link to each other via a language switcher header.

**Tech Stack:** Markdown

**Depends On:** Phase 15 (Unity Package — needed for complete feature documentation)

---

### Task 1: English README.md (comprehensive, ~500 lines)

**Files:**
- Create: `README.md`

**Step 1: Write the full English README**

```markdown
<!-- README.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>The most comprehensive framework-aware Unity MCP server</strong></p>
  <p>83 tools, 10 resources, 6 prompts — with Strada.Core intelligence, RAG-powered search, and Unity Editor bridge</p>

  <p>
    <a href="https://github.com/nicookanu/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
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
- **Complete toolset**: 83 tools covering files, git, .NET, Unity runtime, scenes, assets, subsystems, and advanced operations
- **RAG-powered search**: Tree-sitter C# parsing + Gemini embeddings + HNSW vector search
- **Real-time bridge**: TCP bridge to Unity Editor for live scene manipulation, component editing, and event streaming
- **Security-first**: Path traversal prevention, credential scrubbing, read-only mode, script execution opt-in

## Quick Start

### 1. Install

```bash
npm install -g strada-mcp
```

Or clone and build:

```bash
git clone https://github.com/nicookanu/Strada.MCP.git
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

### 3. Install Unity Package (optional — for full 83-tool access)

Open Unity Package Manager > "+" > Add package from git URL:

```
https://github.com/nicookanu/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Start using

Ask your AI assistant to work with your Unity project:
- "Create an ECS Health component with Current and Max fields"
- "Find all GameObjects with the Rigidbody component"
- "Analyze the project architecture for anti-patterns"
- "Search the codebase for damage calculation logic"

## Features

### Tool Categories (83 total)

| Category | Count | Requires Unity Bridge |
|----------|-------|-----------------------|
| Strada Framework | 10 | No |
| Unity Runtime | 18 | Yes |
| Unity Scene & Prefab | 8 | Yes |
| Unity Asset & Material | 8 | Yes |
| Unity Subsystems | 10 | Yes |
| Unity Project Config | 4 | Yes |
| File & Search | 9 | No |
| Git & .NET | 8 | No |
| Advanced | 8 | Partial |

- **Unity closed**: 47 tools available (file, git, search, analysis, Strada scaffolding, .NET)
- **Unity open**: All 83 tools active via bridge

### Strada Framework Tools (unique — no competitor has these)

| Tool | Description |
|------|-------------|
| `strada_create_component` | ECS component struct (IComponent, unmanaged, StructLayout) |
| `strada_create_system` | SystemBase / JobSystemBase / BurstSystemBase |
| `strada_create_module` | ModuleConfig + asmdef + folder + SystemEntry/ServiceEntry |
| `strada_create_mediator` | EntityMediator — ECS to View binding |
| `strada_create_service` | Service / TickableService / OrderedService |
| `strada_create_controller` | Controller + Model + View (MVCS pattern) |
| `strada_create_model` | Model / ReactiveModel / Model<TData> |
| `strada_analyze_project` | Full project analysis — modules, systems, DI, anti-patterns |
| `strada_validate_architecture` | Best practice validation (naming, lifetime, dependency rules) |
| `strada_scaffold_feature` | Complete feature module skeleton |

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
- Add/remove/read/modify components
- Scene management (create, open, save, hierarchy)
- Prefab operations (create, instantiate)
- Asset management (find, dependencies, unused)
- Play mode control (play, pause, stop)
- Console log streaming
- Editor state queries

### Event Streaming

The bridge broadcasts Unity Editor events in real-time:
- `scene.changed` — Scene opened, closed, saved
- `console.line` — New console log entries
- `compile.started` / `compile.finished` — Script compilation
- `playmode.changed` — Play/pause/stop transitions
- `selection.changed` — Selected object changes

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
git clone https://github.com/nicookanu/Strada.MCP.git
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
3. Enter: `https://github.com/nicookanu/Strada.MCP.git?path=unity-package/com.strada.mcp`
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
| `READ_ONLY` | Global read-only mode | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Enable Roslyn script execution | `false` |
| `MAX_FILE_SIZE` | Maximum file size (bytes) | `10485760` |
| `LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Log file path (stderr if empty) | — |

## Tool Reference

### Strada Framework (10)
<!-- Full tool list with descriptions — all 10 Strada tools -->

### Unity Runtime (18)
<!-- All 18 runtime tools -->

### Unity Scene & Prefab (8)
<!-- All 8 scene/prefab tools -->

### Unity Asset & Material (8)
<!-- All 8 asset/material tools -->

### Unity Subsystems (10)
<!-- All 10 subsystem tools -->

### Unity Project Config (4)
<!-- All 4 config tools -->

### File & Search (9)
<!-- All 9 file/search tools -->

### Git & .NET (8)
<!-- All 8 git/.NET tools -->

### Advanced (8)
<!-- All 8 advanced tools -->

(Each tool documented with: name, description, parameters, example usage)

## Resources (10)

| URI | Description |
|-----|-------------|
| `strada://api-reference` | Strada.Core API documentation |
| `strada://namespaces` | Namespace hierarchy |
| `strada://examples/{pattern}` | Code examples (ECS, MVCS, DI) |
| `unity://project-info` | Project metadata |
| `unity://scene-hierarchy` | Active scene hierarchy |
| `unity://console-logs` | Recent console output |
| `unity://packages` | Installed packages |
| `unity://assets/{type}` | Asset list by type |
| `unity://tags-layers` | Tags and layers |
| `unity://build-settings` | Build configuration |

## Prompts (6)

| Prompt | Description |
|--------|-------------|
| `create_ecs_feature` | Complete ECS feature module wizard |
| `create_mvcs_feature` | Complete MVCS pattern wizard |
| `refactor_to_strada` | Convert vanilla Unity code to Strada patterns |
| `optimize_performance` | Performance analysis + suggestions |
| `create_ui_screen` | UI Toolkit screen scaffold |
| `setup_module` | Interactive module creation |

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
| Input Validation | Zod schema + type checking on all 83 tools |
| Path Guard | Directory traversal prevention, null byte rejection |
| Read-Only Mode | Global + per-tool write permission enforcement |
| Credential Scrub | API key/token pattern scrubbing in all output |
| Tool Allowlist | Unity bridge accepts only registered commands |
| Rate Limiting | Embedding API rate limit protection |
| Localhost Only | Unity bridge binds to 127.0.0.1 only |
| Script Execution | Roslyn execution disabled by default, explicit opt-in |

## Development

### Building from source

```bash
git clone https://github.com/nicookanu/Strada.MCP.git
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

### Project structure

```
src/
  config/          — Zod-validated configuration
  security/        — Path guard, sanitizer, validator
  tools/
    strada/        — 10 Strada framework tools
    unity/         — Bridge-dependent Unity tools (TypeScript side)
    file/          — 6 file tools
    search/        — glob, grep, RAG search
    git/           — 6 git tools
    dotnet/        — build, test
    advanced/      — batch, script, reflection
  intelligence/
    parser/        — Tree-sitter C# parser
    rag/           — Embedding, chunker, HNSW index
  bridge/          — Unity TCP bridge client
  brain/           — Brain HTTP client
  resources/       — 10 MCP resources
  prompts/         — 6 MCP prompts
  utils/           — Logger, process runner

unity-package/
  com.strada.mcp/  — C# Unity Editor package
```

## Competitive Comparison

| Feature | Strada.MCP | CoplayDev (7K stars) | IvanMurzak (1.3K stars) | Unity MCP Pro ($8) |
|---------|-----------|----------------------|-------------------------|--------------------|
| Tools | 83 | 37 | 54 | 147 |
| Framework-Aware | Yes (Strada.Core) | No | No | No |
| RAG Search | Yes (Tree-sitter + HNSW) | No | No | No |
| C# AST Parsing | Yes (Tree-sitter) | No | No | No |
| Event Streaming | Yes (6 events) | Limited | Yes | Yes |
| Brain Integration | Yes | No | No | No |
| Architecture Validation | Yes | No | No | No |
| Security Layer | Comprehensive | Basic | Basic | Basic |
| Open Source | Yes (MIT) | Yes | Yes | No ($8) |
| Price | Free | Free | Free | $8 |

## License

MIT License. See [LICENSE](LICENSE) for details.
```

Note: The actual README will expand the Tool Reference section with full parameter schemas and examples for all 83 tools. The template above shows the structure — during implementation, each tool gets a 3-5 line entry with parameters and example.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive English README with full feature documentation"
```

---

### Task 2: CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE

**Files:**
- Create: `CHANGELOG.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `LICENSE`

**Step 1: Write CHANGELOG.md**

```markdown
<!-- CHANGELOG.md -->
# Changelog

All notable changes to Strada.MCP will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-13

### Added

#### Tools (83)
- **Strada Framework** (10): create_component, create_system, create_module, create_mediator, create_service, create_controller, create_model, analyze_project, validate_architecture, scaffold_feature
- **Unity Runtime** (18): create/find/modify/delete/duplicate gameobject, set_transform, reparent_gameobject, add/remove/get/modify_component, play_mode, console_logs, screenshot, execute_menu_item, undo_redo, editor_state, refresh
- **Unity Scene & Prefab** (8): create/open/save_scene, get_scene_info, scene_analyze, create/instantiate_prefab, prefab_analyze
- **Unity Asset & Material** (8): find_assets, asset_dependencies, asset_unused, create/modify_material, create_scriptableobject, shader_analyze, texture_manage
- **Unity Subsystems** (10): animator_analyze, animation_manage, particle_system, physics_settings, navmesh_manage, lighting_manage, audio_manage, ui_toolkit_create, terrain_manage, build_pipeline
- **Unity Project Config** (4): package_manage, asmdef_manage, project_settings, editor_script_create
- **File & Search** (9): file_read, file_write, file_edit, file_delete, file_rename, list_directory, glob_search, grep_search, code_search
- **Git & .NET** (8): git_status, git_diff, git_log, git_commit, git_branch, git_stash, dotnet_build, dotnet_test
- **Advanced** (8): batch_execute, script_execute, script_validate, csharp_reflection, unity_2d_sprite, unity_2d_tilemap, unity_cinemachine, unity_profiler

#### Resources (10)
- strada://api-reference, strada://namespaces, strada://examples/{pattern}
- unity://project-info, unity://scene-hierarchy, unity://console-logs, unity://packages, unity://assets/{type}, unity://tags-layers, unity://build-settings

#### Prompts (6)
- create_ecs_feature, create_mvcs_feature, refactor_to_strada, optimize_performance, create_ui_screen, setup_module

#### Infrastructure
- Dual transport: stdio + Streamable HTTP
- Unity Editor bridge via TCP (port 7691, localhost only)
- RAG pipeline: Tree-sitter C# parser + Gemini Embedding 2.0 + HNSW vector index
- Strada.Brain integration (optional HTTP bridge)
- Security: path guard, credential scrubber, read-only mode, script execution opt-in
- Unity package: com.strada.mcp (UPM, Unity 2021.3+)
- Documentation in 8 languages
```

**Step 2: Write CONTRIBUTING.md**

```markdown
<!-- CONTRIBUTING.md -->
# Contributing to Strada.MCP

Thank you for your interest in contributing to Strada.MCP! This document provides guidelines for contributing.

## Development Setup

### Prerequisites

- Node.js >= 20
- npm >= 10
- Unity 2021.3+ (for bridge testing)
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Strada.MCP.git
   cd Strada.MCP
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run tests:
   ```bash
   npm test
   ```

## Code Standards

### TypeScript

- Strict mode enabled (no `any` types)
- ESM modules (import/export)
- Zod validation on all tool inputs
- Every tool implements `ITool` interface
- All file operations go through path guard

### Testing

- **TDD approach**: Write tests before implementation
- **Vitest** for all TypeScript tests
- **NUnit** for Unity C# tests
- Every tool must have unit tests
- Security functions need dedicated test suites
- Target: >80% code coverage

### Commit Messages

Follow conventional commits:

```
feat: add new tool
fix: correct path guard edge case
docs: update README
test: add integration tests
refactor: simplify tool registry
```

### Pull Requests

1. Create a feature branch from `main`
2. Write tests for your changes
3. Ensure all tests pass: `npm test && npm run typecheck`
4. Keep PRs focused — one feature per PR
5. Update documentation if adding tools or changing API

## Adding a New Tool

1. Create tool file in appropriate category: `src/tools/{category}/{tool-name}.ts`
2. Implement `ITool` interface
3. Add Zod input schema
4. Add security checks (path guard, read-only check)
5. Write unit tests: `src/tools/{category}/{tool-name}.test.ts`
6. Register in the tool registration module
7. If bridge-dependent, add corresponding C# handler
8. Update README tool reference

## Security

- **Never** commit API keys, tokens, or credentials
- All file paths must go through `validatePath()`
- All output must go through `sanitizeOutput()`
- Write operations must check `readOnly` flag
- Shell commands must use `sanitizeArg()`

## Reporting Issues

- Use GitHub Issues
- Include Node.js version, Unity version, OS
- Provide reproduction steps
- Attach relevant log output (with secrets redacted)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
```

**Step 3: Write SECURITY.md**

```markdown
<!-- SECURITY.md -->
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Model

Strada.MCP implements defense-in-depth:

### Input Validation
- All 83 tools validate input via Zod schemas
- C# identifiers validated against keyword list
- Numeric ranges enforced (ports, dimensions, sizes)

### Path Security
- Directory traversal prevention on every file operation
- Null byte injection rejection
- Paths resolved and validated against allowed root directories
- Symlink traversal prevention

### Credential Protection
- API keys, tokens, and secrets scrubbed from all tool output
- Patterns: `sk-*`, `AIza*`, `Bearer *`, `ghp_*`, `gho_*`, `xox*-*`
- Git credential URLs redacted
- Environment variables with secrets never logged

### Read-Only Mode
- Global `READ_ONLY=true` blocks all write operations
- Per-tool `readOnly` metadata enforced at registry level
- Bridge commands respect read-only flag

### Script Execution
- Roslyn script execution disabled by default
- Requires explicit `SCRIPT_EXECUTE_ENABLED=true`
- Sandboxed execution with timeout

### Network Security
- Unity bridge binds to `127.0.0.1` only (no remote access)
- Bridge accepts only registered JSON-RPC commands (allowlist)
- No outbound network calls except configured embedding API and Brain URL

### Shell Injection Prevention
- All process arguments sanitized against shell metacharacters
- Characters rejected: `; & | \` $ ( ) { } [ ] < > ! \\`
- File paths prefixed with `--` to prevent flag injection

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: security@stradacore.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Impact assessment
   - Suggested fix (optional)

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Threat Model

### In Scope
- Path traversal / directory escape
- Credential leakage in tool output
- Shell injection via tool parameters
- Unauthorized Unity Editor manipulation
- Denial of service via large inputs

### Out of Scope
- Physical access attacks
- Compromised Node.js runtime
- Malicious MCP client (trusted client model)
- Unity Editor API vulnerabilities
```

**Step 4: Write LICENSE**

```
MIT License

Copyright (c) 2026 Nico Okanu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 5: Commit**

```bash
git add CHANGELOG.md CONTRIBUTING.md SECURITY.md LICENSE
git commit -m "docs: add CHANGELOG, CONTRIBUTING, SECURITY, and LICENSE"
```

---

### Task 3: Turkish README

**Files:**
- Create: `docs/README.tr.md`

**Step 1: Write Turkish README**

The Turkish README follows the same structure as the English README but with fully native Turkish text. Not a word-for-word translation — uses natural Turkish phrasing.

Key sections translated:
- Header with language switcher (same links)
- Genel Bakis (Overview)
- Hizli Baslangic (Quick Start)
- Ozellikler (Features) — full tool table
- Kurulum (Installation) — all IDE configs
- Unity Paket Kurulumu (Unity Package Setup)
- Yapilandirma (Configuration) — env var table
- Arac Referansi (Tool Reference) — all 83 tools
- Kaynaklar (Resources) — 10 resources
- Istemler (Prompts) — 6 prompts
- Brain Entegrasyonu (Brain Integration)
- Guvenlik (Security)
- Gelistirme (Development)
- Rekabet Karsilastirmasi (Competitive Comparison)
- Lisans (License)

```markdown
<!-- docs/README.tr.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Framework-bilinçli en kapsamli Unity MCP sunucusu</strong></p>
  <p>83 araç, 10 kaynak, 6 istem — Strada.Core zekasi, RAG destekli arama ve Unity Editor köprüsü ile</p>
  <!-- ... badges and language switcher ... -->
</div>

## Genel Bakis

Strada.MCP, Unity ve Strada.Core gelistirme icin ozel olarak tasarlanmis bir Model Context Protocol (MCP) sunucusudur...

<!-- Full Turkish translation of all sections -->
```

The complete file will be approximately 400 lines, preserving all technical terms (tool names, parameter names, file paths) in English while translating all descriptive text to Turkish.

**Step 2: Commit**

```bash
git add docs/README.tr.md
git commit -m "docs: add Turkish README (docs/README.tr.md)"
```

---

### Task 4: Japanese + Korean READMEs

**Files:**
- Create: `docs/README.ja.md`
- Create: `docs/README.ko.md`

**Step 1: Write Japanese README**

```markdown
<!-- docs/README.ja.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>最も包括的なフレームワーク対応Unity MCPサーバー</strong></p>
  <p>83ツール、10リソース、6プロンプト — Strada.Coreインテリジェンス、RAG検索、Unity Editorブリッジ搭載</p>
  <!-- ... badges and language switcher ... -->
</div>

## 概要

Strada.MCPは、UnityおよびStrada.Core開発に特化したModel Context Protocol (MCP) サーバーです...

<!-- Full Japanese translation of all sections -->
```

Key Japanese terminology:
- ツール (Tools)
- 設定 (Configuration)
- セキュリティ (Security)
- インストール (Installation)
- 開発 (Development)

**Step 2: Write Korean README**

```markdown
<!-- docs/README.ko.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>가장 포괄적인 프레임워크 인식 Unity MCP 서버</strong></p>
  <p>83개 도구, 10개 리소스, 6개 프롬프트 — Strada.Core 인텔리전스, RAG 검색, Unity 에디터 브릿지</p>
  <!-- ... badges and language switcher ... -->
</div>

## 개요

Strada.MCP는 Unity 및 Strada.Core 개발을 위해 특별히 설계된 Model Context Protocol (MCP) 서버입니다...

<!-- Full Korean translation of all sections -->
```

**Step 3: Commit**

```bash
git add docs/README.ja.md docs/README.ko.md
git commit -m "docs: add Japanese and Korean READMEs"
```

---

### Task 5: Chinese + German READMEs

**Files:**
- Create: `docs/README.zh.md`
- Create: `docs/README.de.md`

**Step 1: Write Chinese (Simplified) README**

```markdown
<!-- docs/README.zh.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>最全面的框架感知Unity MCP服务器</strong></p>
  <p>83个工具、10个资源、6个提示 — 集成Strada.Core智能、RAG搜索和Unity编辑器桥接</p>
  <!-- ... badges and language switcher ... -->
</div>

## 概述

Strada.MCP是一个专为Unity和Strada.Core开发而构建的模型上下文协议(MCP)服务器...

<!-- Full Chinese translation of all sections -->
```

**Step 2: Write German README**

```markdown
<!-- docs/README.de.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Der umfassendste framework-bewusste Unity MCP-Server</strong></p>
  <p>83 Werkzeuge, 10 Ressourcen, 6 Prompts — mit Strada.Core-Intelligenz, RAG-Suche und Unity Editor-Bridge</p>
  <!-- ... badges and language switcher ... -->
</div>

## Uberblick

Strada.MCP ist ein Model Context Protocol (MCP) Server, der speziell fur Unity- und Strada.Core-Entwicklung konzipiert wurde...

<!-- Full German translation of all sections -->
```

**Step 3: Commit**

```bash
git add docs/README.zh.md docs/README.de.md
git commit -m "docs: add Chinese and German READMEs"
```

---

### Task 6: Spanish + French READMEs

**Files:**
- Create: `docs/README.es.md`
- Create: `docs/README.fr.md`

**Step 1: Write Spanish README**

```markdown
<!-- docs/README.es.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>El servidor MCP para Unity mas completo con reconocimiento de framework</strong></p>
  <p>83 herramientas, 10 recursos, 6 prompts — con inteligencia Strada.Core, busqueda RAG y puente al Editor de Unity</p>
  <!-- ... badges and language switcher ... -->
</div>

## Descripcion general

Strada.MCP es un servidor de Model Context Protocol (MCP) disenado especificamente para el desarrollo con Unity y Strada.Core...

<!-- Full Spanish translation of all sections -->
```

**Step 2: Write French README**

```markdown
<!-- docs/README.fr.md -->
<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Le serveur MCP Unity le plus complet avec prise en charge du framework</strong></p>
  <p>83 outils, 10 ressources, 6 prompts — avec l'intelligence Strada.Core, la recherche RAG et le pont vers l'editeur Unity</p>
  <!-- ... badges and language switcher ... -->
</div>

## Vue d'ensemble

Strada.MCP est un serveur Model Context Protocol (MCP) concu specifiquement pour le developpement Unity et Strada.Core...

<!-- Full French translation of all sections -->
```

**Step 3: Commit**

```bash
git add docs/README.es.md docs/README.fr.md
git commit -m "docs: add Spanish and French READMEs"
```

---

### Task 7: Push Phase 16

```bash
git push origin main
```

**Phase 16 complete.** Deliverables:
- Comprehensive English README (~500 lines with full tool reference)
- CHANGELOG.md (complete v1.0.0 release notes)
- CONTRIBUTING.md (development setup, code standards, PR guidelines)
- SECURITY.md (security model, threat model, reporting)
- LICENSE (MIT)
- 7 translated READMEs: Turkish, Japanese, Korean, Chinese, German, Spanish, French
- All READMEs linked via language switcher header
- 12 documentation files total
