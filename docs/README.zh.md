<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>最全面的框架感知型 Unity MCP 服务器</strong></p>
  <p>76 个工具、10 个资源、6 个提示词 — 集成 Strada.Core 智能、RAG 驱动搜索和 Unity 编辑器桥接</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-purple.svg" alt="MCP Compatible"></a>
    <img src="https://img.shields.io/badge/Unity-2021.3%2B-black.svg" alt="Unity 2021.3+">
  </p>

  <p>
    <a href="../README.md">English</a> |
    <a href="README.tr.md">Turkce</a> |
    <a href="README.ja.md">日本語</a> |
    <a href="README.ko.md">한국어</a> |
    <a href="README.zh.md">中文</a> |
    <a href="README.de.md">Deutsch</a> |
    <a href="README.es.md">Espanol</a> |
    <a href="README.fr.md">Francais</a>
  </p>
</div>

---

## 概述

Strada.MCP 是一个专为 Unity 和 Strada.Core 开发构建的 Model Context Protocol (MCP) 服务器。它将 AI 助手（Claude、GPT 等）直接桥接到您的 Unity 工作流中。

**双用户架构：**
- **独立模式** — 开箱即用，支持 Claude Desktop、Cursor、Windsurf、VS Code + Continue
- **Brain 模式** — 与 Strada.Brain 集成，提供增强的记忆、学习和目标执行功能

**为什么选择 Strada.MCP？**
- **框架感知**：唯一理解 Strada.Core 模式（ECS、MVCS、DI、模块）的 Unity MCP 服务器
- **完整工具集**：76 个工具，涵盖文件、git、.NET、代码分析、Strada 脚手架、Unity 运行时、场景/预制体、资产、子系统和项目配置
- **RAG 驱动搜索**：Tree-sitter C# 解析 + Gemini 嵌入 + HNSW 向量搜索
- **实时桥接**：通过 TCP 桥接连接 Unity 编辑器，实现实时场景操作、组件编辑和播放模式控制
- **安全优先**：路径遍历防护、凭证清洗、只读模式、脚本执行需显式启用

## 快速开始

### 1. 安装

```bash
npm install -g strada-mcp
```

或者克隆并构建：

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. 配置您的 IDE

**Claude Desktop** — 添加到 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

**Cursor** — 添加到 `.cursor/mcp.json`：

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

### 3. 安装 Unity 包（可选 — 用于完整工具访问）

打开 Unity Package Manager > "+" > 从 git URL 添加包：

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. 开始使用

让您的 AI 助手处理 Unity 项目：
- "创建一个包含 Current 和 Max 字段的 ECS Health 组件"
- "查找所有带有 Rigidbody 组件的 GameObject"
- "分析项目架构中的反模式"
- "在代码库中搜索伤害计算逻辑"

## 功能特性

### 工具类别（共 76 个）

| 类别 | 数量 | 需要 Unity 桥接 |
|------|------|-----------------|
| Strada 框架 | 10 | 否 |
| Unity 运行时 | 18 | 是 |
| Unity 场景/预制体 | 8 | 混合 |
| Unity 资产 | 8 | 混合 |
| Unity 子系统 | 6 | 是 |
| Unity 配置 | 4 | 是 |
| 高级工具 | 5 | 混合 |
| 文件操作 | 6 | 否 |
| 搜索 | 3 | 否 |
| Git | 6 | 否 |
| .NET 构建 | 2 | 否 |
| 分析 | 4 | 否 |

- **Unity 关闭时**：35+ 个工具可用（文件、git、搜索、分析、Strada 脚手架、.NET、场景/预制体分析）
- **Unity 打开时**：通过桥接激活全部 76 个工具

### Strada 框架工具

这些工具是 Strada.MCP 独有的 — 没有其他竞品拥有框架感知的脚手架功能。

| 工具 | 描述 |
|------|------|
| `strada_create_component` | 生成实现 IComponent 并带有 StructLayout 的 ECS 组件结构体 |
| `strada_create_system` | 生成 Strada ECS 系统（SystemBase、JobSystemBase 或 BurstSystemBase） |
| `strada_create_module` | 生成包含 ModuleConfig、程序集定义和文件夹结构的 Strada 模块 |
| `strada_create_mediator` | 生成将 ECS 组件绑定到 Unity 视图的 EntityMediator |
| `strada_create_service` | 生成 Strada 服务（Service、TickableService、FixedTickableService 或 OrderedService） |
| `strada_create_controller` | 生成带有类型化模型引用和视图注入的 Strada 控制器 |
| `strada_create_model` | 生成带有类型化属性的 Strada Model 或 ReactiveModel |
| `strada_analyze_project` | 扫描 .cs 文件以映射模块、系统、组件、服务和 DI 使用情况 |
| `strada_validate_architecture` | 验证 Strada.Core 命名约定、生命周期规则和依赖规则 |
| `strada_scaffold_feature` | 生成完整的功能骨架：模块 + 组件 + 系统 + 可选 MVCS 视图 |

### Unity 运行时工具（18 个）

| 工具 | 描述 |
|------|------|
| `unity_create_gameobject` | 创建新的 GameObject（空对象、基元或从预制体创建） |
| `unity_find_gameobjects` | 通过名称、标签、层或组件类型查找 GameObject |
| `unity_modify_gameobject` | 修改 GameObject 属性（名称、激活状态、标签、层、静态） |
| `unity_delete_gameobject` | 通过实例 ID 从场景中删除 GameObject |
| `unity_duplicate_gameobject` | 复制 GameObject，可选择新名称、父对象或偏移量 |
| `unity_add_component` | 通过类型名称向 GameObject 添加组件 |
| `unity_remove_component` | 通过类型名称从 GameObject 移除组件 |
| `unity_get_components` | 列出附加到 GameObject 的所有组件 |
| `unity_set_transform` | 设置 GameObject Transform 的位置、旋转和/或缩放 |
| `unity_get_transform` | 获取 GameObject 当前的 Transform（位置、旋转、缩放） |
| `unity_set_parent` | 将 GameObject 重新设置到新的父 Transform 下 |
| `unity_play` | 控制 Unity 播放模式（播放、暂停、停止或单步执行一帧） |
| `unity_get_play_state` | 获取当前 Unity 编辑器的播放状态 |
| `unity_execute_menu` | 通过路径执行 Unity 编辑器菜单命令 |
| `unity_console_log` | 向 Unity 控制台写入消息（日志、警告或错误） |
| `unity_console_clear` | 清除 Unity 编辑器控制台 |
| `unity_selection_get` | 获取 Unity 编辑器中当前选中的对象 |
| `unity_selection_set` | 将编辑器选择设置为指定的实例 ID |

### 文件和搜索工具（9 个）

| 工具 | 描述 |
|------|------|
| `file_read` | 读取文件内容（带行号），支持可选的偏移/限制 |
| `file_write` | 将内容写入文件，根据需要创建目录 |
| `file_edit` | 使用精确字符串匹配替换文件中的文本 |
| `file_delete` | 删除文件 |
| `file_rename` | 重命名或移动文件 |
| `list_directory` | 列出目录内容，带文件/目录标识 |
| `glob_search` | 搜索匹配 glob 模式的文件 |
| `grep_search` | 使用正则表达式搜索文件内容，支持可选的上下文行 |
| `code_search` | RAG 驱动的语义代码搜索（需要索引） |

### Git 工具（6 个）

| 工具 | 描述 |
|------|------|
| `git_status` | 显示工作树状态（porcelain 格式） |
| `git_diff` | 显示工作树与索引之间的差异（已暂存/未暂存） |
| `git_log` | 显示提交历史 |
| `git_commit` | 暂存文件并创建提交 |
| `git_branch` | 列出、创建、删除或切换分支 |
| `git_stash` | 存储或恢复未提交的更改 |

### .NET 构建工具（2 个）

| 工具 | 描述 |
|------|------|
| `dotnet_build` | 构建 .NET 项目并解析错误/警告 |
| `dotnet_test` | 运行 .NET 测试并解析结果摘要 |

### 分析工具（4 个）

| 工具 | 描述 |
|------|------|
| `code_quality` | 分析 C# 代码中的 Strada.Core 反模式和最佳实践违规 |
| `csharp_parse` | 将 C# 源代码解析为结构化 AST，包含类、结构体、方法、字段、命名空间 |
| `dependency_graph` | 分析 Unity 项目程序集引用和命名空间依赖关系，检测循环依赖 |
| `project_health` | 综合项目健康检查，结合代码质量、依赖分析和文件统计 |

### Unity 场景和预制体工具（8 个）

| 工具 | 描述 |
|------|------|
| `unity_scene_create` | 创建新的 Unity 场景 |
| `unity_scene_open` | 在编辑器中打开现有场景 |
| `unity_scene_save` | 保存当前场景 |
| `unity_scene_info` | 获取场景元数据和统计信息 |
| `unity_scene_analyze` | 从 YAML 分析场景层次结构（不需要桥接） |
| `unity_prefab_create` | 从 GameObject 创建新的预制体 |
| `unity_prefab_instantiate` | 在当前场景中实例化预制体 |
| `unity_prefab_analyze` | 从 YAML 分析预制体结构（不需要桥接） |

### Unity 资产工具（8 个）

| 工具 | 描述 |
|------|------|
| `unity_asset_find` | 按名称、类型或标签搜索资产 |
| `unity_asset_dependencies` | 分析资产依赖链 |
| `unity_asset_unused` | 查找项目中可能未使用的资产 |
| `unity_material_get` | 读取材质属性和着色器分配 |
| `unity_material_set` | 修改材质属性 |
| `unity_shader_list` | 列出可用的着色器及其关键字和属性 |
| `unity_scriptableobject_create` | 创建新的 ScriptableObject 资产 |
| `unity_texture_info` | 获取纹理导入设置和元数据 |

### Unity 子系统工具（6 个）

| 工具 | 描述 |
|------|------|
| `unity_animation_play` | 控制动画器播放 |
| `unity_animation_list` | 列出动画剪辑和参数 |
| `unity_physics_raycast` | 在场景中执行物理射线检测 |
| `unity_navmesh_bake` | 烘焙或配置 NavMesh 设置 |
| `unity_particles_control` | 控制粒子系统播放 |
| `unity_lighting_bake` | 烘焙光照并配置灯光设置 |

### Unity 配置工具（4 个）

| 工具 | 描述 |
|------|------|
| `unity_player_settings` | 获取/设置播放器设置（公司、产品、平台） |
| `unity_quality_settings` | 获取/设置质量等级和图形设置 |
| `unity_build_settings` | 获取/设置构建目标、场景和选项 |
| `unity_project_settings` | 获取/设置标签、层、物理和输入设置 |

### 高级工具（5 个）

| 工具 | 描述 |
|------|------|
| `batch_execute` | 在单个请求中执行多个工具 |
| `script_execute` | 通过 Roslyn 执行 C# 脚本（需显式启用，默认禁用） |
| `script_validate` | 验证 C# 脚本语法而不执行 |
| `csharp_reflection` | 通过反射检查类型、方法和程序集 |
| `unity_profiler` | 访问 Unity 性能分析器数据和性能指标 |

### RAG 驱动的代码搜索

```
C# Source -> Tree-sitter AST -> Structural Chunks -> Gemini Embeddings -> HNSW Vector Index
```

- 在整个项目中进行语义代码搜索
- 理解类/方法/字段边界
- 增量索引（仅重新索引更改的文件）
- 混合重排序：向量相似度 + 关键词 + 结构上下文

### Unity 编辑器桥接

与 Unity 编辑器的实时 TCP 连接（端口 7691）：
- 创建、查找、修改、删除 GameObject
- 添加/移除/读取组件
- Transform 操作（位置、旋转、缩放、重新设置父对象）
- 播放模式控制（播放、暂停、停止、单步）
- 控制台输出（日志、警告、错误、清除）
- 编辑器选择管理
- 菜单命令执行

### 事件流

桥接实时广播 Unity 编辑器事件：
- `scene.changed` — 场景打开、关闭、保存
- `console.line` — 新的控制台日志条目
- `compile.started` / `compile.finished` — 脚本编译
- `playmode.changed` — 播放/暂停/停止转换
- `selection.changed` — 选中对象变更

## 资源（10 个）

| URI | 描述 | 来源 |
|-----|------|------|
| `strada://api-reference` | Strada.Core API 文档 | 基于文件 |
| `strada://namespaces` | Strada.Core 命名空间层次结构 | 基于文件 |
| `strada://examples/{pattern}` | 代码示例（ECS、MVCS、DI） | 基于文件 |
| `unity://manifest` | Unity 包清单（Packages/manifest.json） | 基于文件 |
| `unity://project-settings/{category}` | 按类别的 Unity 项目设置 | 基于文件 |
| `unity://assemblies` | Unity 程序集定义（.asmdef 文件） | 基于文件 |
| `unity://file-stats` | Unity 项目文件统计 | 基于文件 |
| `unity://scene-hierarchy` | 活动场景层次结构 | 桥接 |
| `unity://console-logs` | 最近的控制台输出 | 桥接 |
| `unity://play-state` | 当前播放模式状态 | 桥接 |

## 提示词（6 个）

| 提示词 | 描述 |
|--------|------|
| `create_ecs_feature` | 引导 ECS 功能创建（组件、系统、模块注册）的多消息序列 |
| `create_mvcs_feature` | Strada.Core 的 MVCS 模式脚手架引导 |
| `analyze_architecture` | Strada.Core 项目的架构审查提示 |
| `debug_performance` | Unity 项目的性能调试引导 |
| `optimize_build` | Unity 项目的构建优化清单 |
| `setup_scene` | Unity 项目的场景设置工作流引导 |

## 安装

### 前置条件

- Node.js >= 20
- Unity 2021.3+（用于桥接功能）
- Strada.Core 项目（用于框架工具 — 可选）

### npm（推荐）

```bash
npm install -g strada-mcp
```

### 从源代码安装

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### IDE 配置

#### Claude Desktop

文件：`~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）或 `%APPDATA%\Claude\claude_desktop_config.json`（Windows）

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

文件：工作区根目录下的 `.cursor/mcp.json`：

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

文件：`~/.windsurf/mcp.json`：

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

文件：`~/.claude/settings.json` 或项目 `.mcp.json`：

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

文件：`.continue/config.json`：

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

## Unity 包设置

### 安装 com.strada.mcp

1. 打开 Unity > Window > Package Manager
2. 点击 "+" > "Add package from git URL..."
3. 输入：`https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. 点击 Add

### 配置

安装后：
1. 前往 **Strada > MCP > Settings**
2. 设置端口（默认：7691）
3. 启用/禁用自动启动
4. 当 MCP 服务器连接时，确认连接状态指示灯变为绿色

### 手动控制

- **Strada > MCP > Start Server** — 启动桥接
- **Strada > MCP > Stop Server** — 停止桥接
- **Strada > MCP > Status** — 记录当前状态

## 配置

所有选项均通过环境变量配置：

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `MCP_TRANSPORT` | 传输模式：`stdio` 或 `http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP 端口 | `3100` |
| `MCP_HTTP_HOST` | HTTP 绑定地址 | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity 编辑器桥接 TCP 端口 | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | 启动时自动连接 Unity | `true` |
| `UNITY_BRIDGE_TIMEOUT` | 桥接连接超时（毫秒） | `5000` |
| `UNITY_PROJECT_PATH` | Unity 项目路径（留空则自动检测） | — |
| `EMBEDDING_PROVIDER` | 嵌入提供者：`gemini`、`openai`、`ollama` | `gemini` |
| `EMBEDDING_MODEL` | 嵌入模型名称 | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | 嵌入维度（128-3072） | `768` |
| `EMBEDDING_API_KEY` | 嵌入提供者的 API 密钥 | — |
| `RAG_AUTO_INDEX` | 启动时自动索引 | `true` |
| `RAG_WATCH_FILES` | 监视文件更改 | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL（留空 = 禁用） | — |
| `BRAIN_API_KEY` | Brain API 密钥 | — |
| `ALLOWED_PATHS` | 逗号分隔的允许根目录列表 | — |
| `READ_ONLY` | 全局只读模式 | `false` |
| `SCRIPT_EXECUTE_ENABLED` | 启用 Roslyn 脚本执行 | `false` |
| `REFLECTION_INVOKE_ENABLED` | 启用 C# 反射方法调用 | `false` |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | `10485760` |
| `LOG_LEVEL` | 日志级别：`debug`、`info`、`warn`、`error` | `info` |
| `LOG_FILE` | 日志文件路径（留空则输出到 stderr） | — |

## Brain 集成

连接到 Strada.Brain 时（配置了 `BRAIN_URL`）：

- **共享记忆**：Brain 的长期记忆为工具建议提供信息
- **合并 RAG**：Brain 记忆上下文 + MCP Tree-sitter AST 组合
- **学习**：工具使用模式反馈到 Brain 的学习管道
- **目标执行**：Brain 可以作为目标计划的一部分调用 MCP 工具

没有 Brain 时，Strada.MCP 作为完全独立的 MCP 服务器运行。

## 安全性

| 层 | 保护措施 |
|----|----------|
| 输入验证 | 对所有工具进行 Zod 模式 + 类型检查 |
| 路径防护 | 目录遍历防护、空字节拒绝、符号链接遍历防护 |
| 只读模式 | 全局 + 每个工具的写入权限强制执行 |
| 凭证清洗 | 对所有输出中的 API 密钥/令牌模式进行清洗 |
| 工具白名单 | Unity 桥接仅接受已注册的 JSON-RPC 命令 |
| 速率限制 | 嵌入 API 速率限制保护 |
| 仅限本地 | Unity 桥接仅绑定到 127.0.0.1 |
| 脚本执行 | Roslyn 执行默认禁用，需显式启用 |

完整详情请参阅 [SECURITY.md](../SECURITY.md)。

## 开发

### 从源代码构建

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 运行测试

```bash
npm test              # 运行所有测试
npm run test:watch    # 监视模式
npm run typecheck     # TypeScript 类型检查
```

### 开发模式

```bash
npm run dev           # 使用 tsx 运行（自动重载）
```

### 项目结构

```
src/
  config/          - Zod 验证的配置
  security/        - 路径防护、清洗器、验证器
  tools/
    strada/        - 10 个 Strada 框架工具
    unity/         - 18 个依赖桥接的 Unity 工具
    file/          - 6 个文件操作工具
    search/        - 3 个搜索工具（glob、grep、RAG）
    git/           - 6 个 git 工具
    dotnet/        - 2 个 .NET 构建工具
    analysis/      - 4 个代码分析工具
  intelligence/
    parser/        - Tree-sitter C# 解析器
    rag/           - 嵌入、分块器、HNSW 索引
  bridge/          - Unity TCP 桥接客户端
  context/         - Brain HTTP 客户端
  resources/       - 10 个 MCP 资源
  prompts/         - 6 个 MCP 提示词
  utils/           - 日志器、进程运行器

unity-package/
  com.strada.mcp/  - C# Unity 编辑器包（UPM）
```

## 贡献

请参阅 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解开发设置、代码规范和 PR 指南。

## 许可证

MIT 许可证。详情请参阅 [LICENSE](../LICENSE)。
