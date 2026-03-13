<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>最全面的框架感知Unity MCP服务器</strong></p>
  <p>49个工具、10个资源、6个提示 — 集成Strada.Core智能、RAG搜索和Unity编辑器桥接</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="许可证: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-兼容-purple.svg" alt="MCP兼容"></a>
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

Strada.MCP是一个专为Unity和Strada.Core开发而构建的模型上下文协议(MCP)服务器。它将AI助手(Claude、GPT等)直接桥接到您的Unity工作流程中。

**双用户架构:**
- **独立模式** — 开箱即用，支持Claude Desktop、Cursor、Windsurf、VS Code + Continue
- **Brain模式** — 与Strada.Brain集成，提供增强的记忆、学习和目标执行能力

**为什么选择Strada.MCP?**
- **框架感知**: 唯一理解Strada.Core模式（ECS、MVCS、DI、模块）的Unity MCP服务器
- **完整工具集**: 涵盖文件、git、.NET、代码分析、Strada脚手架和Unity运行时操作的49个工具
- **RAG搜索**: Tree-sitter C#解析 + Gemini嵌入 + HNSW向量搜索
- **实时桥接**: 通过TCP桥接Unity编辑器，实现场景操作、组件编辑和播放模式控制
- **安全优先**: 路径遍历防护、凭据清理、只读模式、脚本执行选择加入

## 快速开始

### 1. 安装

```bash
npm install -g strada-mcp
```

或从源码构建:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. 配置IDE

**Claude Desktop** — 添加到 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/项目/路径"
      }
    }
  }
}
```

**Cursor** — 添加到 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/项目/路径"
      }
    }
  }
}
```

### 3. 安装Unity包（可选 — 用于完整工具访问）

Unity Package Manager > "+" > 从Git URL添加包:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. 开始使用

让AI助手处理您的Unity项目:
- "创建一个包含Current和Max字段的ECS Health组件"
- "查找所有带有Rigidbody组件的GameObject"
- "分析项目架构中的反模式"
- "在代码库中搜索伤害计算逻辑"

## 功能

### 工具分类（共49个）

| 分类 | 数量 | 需要Unity桥接 |
|------|------|---------------|
| Strada框架 | 10 | 否 |
| Unity运行时 | 18 | 是 |
| 文件操作 | 6 | 否 |
| 搜索 | 3 | 否 |
| Git | 6 | 否 |
| .NET构建 | 2 | 否 |
| 分析 | 4 | 否 |

- **Unity未运行**: 31个工具可用（文件、git、搜索、分析、Strada脚手架、.NET）
- **Unity运行时**: 通过桥接激活全部49个工具

### Strada框架工具

这些工具是Strada.MCP独有的 — 竞品没有框架感知脚手架功能。

| 工具 | 说明 |
|------|------|
| `strada_create_component` | 生成实现IComponent的ECS组件结构体，带StructLayout |
| `strada_create_system` | 生成Strada ECS系统（SystemBase、JobSystemBase或BurstSystemBase） |
| `strada_create_module` | 生成Strada模块，包含ModuleConfig、程序集定义和文件夹结构 |
| `strada_create_mediator` | 生成EntityMediator，将ECS组件绑定到Unity View |
| `strada_create_service` | 生成Strada服务（Service、TickableService、FixedTickableService、OrderedService） |
| `strada_create_controller` | 生成带类型模型引用和视图注入的Strada Controller |
| `strada_create_model` | 生成带类型属性的Strada Model或ReactiveModel |
| `strada_analyze_project` | 扫描.cs文件，映射模块、系统、组件、服务和DI使用情况 |
| `strada_validate_architecture` | 验证Strada.Core命名规范、生命周期规则和依赖规则 |
| `strada_scaffold_feature` | 生成完整的功能骨架：模块 + 组件 + 系统 + 可选MVCS视图 |

### Unity运行时工具（18个）

| 工具 | 说明 |
|------|------|
| `unity_create_gameobject` | 创建新的GameObject（空物体、基本体或从预制体） |
| `unity_find_gameobjects` | 按名称、标签、层或组件类型查找GameObject |
| `unity_modify_gameobject` | 修改GameObject属性（名称、激活、标签、层、静态） |
| `unity_delete_gameobject` | 按实例ID从场景中删除GameObject |
| `unity_duplicate_gameobject` | 复制GameObject，可选新名称、父级或偏移 |
| `unity_add_component` | 按类型名称向GameObject添加组件 |
| `unity_remove_component` | 按类型名称从GameObject移除组件 |
| `unity_get_components` | 列出GameObject上附加的所有组件 |
| `unity_set_transform` | 设置GameObject变换的位置、旋转和/或缩放 |
| `unity_get_transform` | 获取GameObject的当前变换（位置、旋转、缩放） |
| `unity_set_parent` | 将GameObject移动到新的父变换下 |
| `unity_play` | 控制Unity播放模式（播放、暂停、停止或单帧步进） |
| `unity_get_play_state` | 获取Unity编辑器的当前播放状态 |
| `unity_execute_menu` | 通过路径执行Unity编辑器菜单命令 |
| `unity_console_log` | 向Unity控制台写入消息（日志、警告或错误） |
| `unity_console_clear` | 清除Unity编辑器控制台 |
| `unity_selection_get` | 获取Unity编辑器中当前选中的对象 |
| `unity_selection_set` | 将编辑器选择设置为指定的实例ID |

### 文件和搜索工具（9个）

| 工具 | 说明 |
|------|------|
| `file_read` | 读取文件内容，带行号，可选偏移/限制 |
| `file_write` | 写入文件内容，按需创建目录 |
| `file_edit` | 使用精确字符串匹配替换文件中的文本 |
| `file_delete` | 删除文件 |
| `file_rename` | 重命名或移动文件 |
| `list_directory` | 列出目录内容，显示文件/目录指示符 |
| `glob_search` | 搜索匹配glob模式的文件 |
| `grep_search` | 使用正则表达式搜索文件内容，可选上下文行 |
| `code_search` | RAG语义代码搜索（需要索引） |

### Git工具（6个）

| 工具 | 说明 |
|------|------|
| `git_status` | 显示工作树状态（porcelain格式） |
| `git_diff` | 显示工作树和索引之间的差异 |
| `git_log` | 显示提交历史 |
| `git_commit` | 暂存文件并创建提交 |
| `git_branch` | 列出、创建、删除或切换分支 |
| `git_stash` | 储藏或恢复未提交的更改 |

### .NET构建工具（2个）

| 工具 | 说明 |
|------|------|
| `dotnet_build` | 构建.NET项目并解析错误/警告 |
| `dotnet_test` | 运行.NET测试并解析结果摘要 |

### 分析工具（4个）

| 工具 | 说明 |
|------|------|
| `code_quality` | 分析C#代码中的Strada.Core反模式和最佳实践违规 |
| `csharp_parse` | 将C#源代码解析为结构化AST，包含类、结构体、方法、字段、命名空间 |
| `dependency_graph` | 分析Unity项目程序集引用和命名空间依赖，检测循环依赖 |
| `project_health` | 综合项目健康检查，结合代码质量、依赖分析和文件统计 |

### RAG代码搜索

```
C#源码 -> Tree-sitter AST -> 结构化块 -> Gemini嵌入 -> HNSW向量索引
```

- 跨整个项目的语义代码搜索
- 理解类/方法/字段边界
- 增量索引（仅重新索引更改的文件）
- 混合重排序：向量相似度 + 关键词 + 结构上下文

### Unity编辑器桥接

与Unity编辑器的实时TCP连接（端口7691）:
- 创建、查找、修改、删除GameObject
- 添加/移除/读取组件
- 变换操作（位置、旋转、缩放、重新父级化）
- 播放模式控制（播放、暂停、停止、步进）
- 控制台输出（日志、警告、错误、清除）
- 编辑器选择管理
- 菜单命令执行

## 资源（10个）

| URI | 说明 | 来源 |
|-----|------|------|
| `strada://api-reference` | Strada.Core API文档 | 基于文件 |
| `strada://namespaces` | Strada.Core命名空间层次结构 | 基于文件 |
| `strada://examples/{pattern}` | 代码示例（ECS、MVCS、DI） | 基于文件 |
| `unity://manifest` | Unity包清单 | 基于文件 |
| `unity://project-settings/{category}` | 按类别的Unity项目设置 | 基于文件 |
| `unity://assemblies` | Unity程序集定义 | 基于文件 |
| `unity://file-stats` | Unity项目文件统计 | 基于文件 |
| `unity://scene-hierarchy` | 活动场景层次结构 | 桥接 |
| `unity://console-logs` | 最近控制台输出 | 桥接 |
| `unity://play-state` | 当前播放模式状态 | 桥接 |

## 提示（6个）

| 提示 | 说明 |
|------|------|
| `create_ecs_feature` | ECS功能创建指南（组件、系统、模块注册） |
| `create_mvcs_feature` | Strada.Core的MVCS模式脚手架指南 |
| `analyze_architecture` | Strada.Core项目架构审查提示 |
| `debug_performance` | Unity项目性能调试指南 |
| `optimize_build` | Unity项目构建优化清单 |
| `setup_scene` | Unity项目场景设置工作流指南 |

## 配置

所有选项通过环境变量配置:

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MCP_TRANSPORT` | 传输模式: `stdio`或`http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP端口 | `3100` |
| `MCP_HTTP_HOST` | HTTP绑定地址 | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity编辑器桥接TCP端口 | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | 启动时自动连接Unity | `true` |
| `UNITY_BRIDGE_TIMEOUT` | 桥接连接超时（毫秒） | `5000` |
| `UNITY_PROJECT_PATH` | Unity项目路径（为空时自动检测） | — |
| `EMBEDDING_PROVIDER` | 嵌入提供者: `gemini`、`openai`、`ollama` | `gemini` |
| `EMBEDDING_MODEL` | 嵌入模型名称 | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | 嵌入维度（128-3072） | `768` |
| `EMBEDDING_API_KEY` | 嵌入提供者API密钥 | — |
| `RAG_AUTO_INDEX` | 启动时自动索引 | `true` |
| `RAG_WATCH_FILES` | 监视文件变更 | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL（为空=禁用） | — |
| `BRAIN_API_KEY` | Brain API密钥 | — |
| `READ_ONLY` | 全局只读模式 | `false` |
| `SCRIPT_EXECUTE_ENABLED` | 启用Roslyn脚本执行 | `false` |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | `10485760` |
| `LOG_LEVEL` | 日志级别: `debug`、`info`、`warn`、`error` | `info` |
| `LOG_FILE` | 日志文件路径（为空时使用stderr） | — |

## Brain集成

连接Strada.Brain时（配置`BRAIN_URL`）:

- **共享记忆**: Brain的长期记忆为工具建议提供信息
- **融合RAG**: Brain记忆上下文 + MCP tree-sitter AST组合
- **学习**: 工具使用模式反馈到Brain的学习管道
- **目标执行**: Brain可以作为目标计划的一部分调用MCP工具

不连接Brain时，Strada.MCP作为完全独立的MCP服务器运行。

## 安全

| 层级 | 保护措施 |
|------|----------|
| 输入验证 | 所有工具的Zod模式 + 类型检查 |
| 路径防护 | 目录遍历防护、null字节拒绝、符号链接遍历防护 |
| 只读模式 | 全局 + 工具级写入权限强制 |
| 凭据清理 | 所有输出中的API密钥/令牌模式清理 |
| 工具白名单 | Unity桥接仅接受注册的JSON-RPC命令 |
| 速率限制 | 嵌入API速率限制保护 |
| 仅本地 | Unity桥接仅绑定127.0.0.1 |
| 脚本执行 | Roslyn执行默认禁用，需要显式选择加入 |

详细信息请参阅[SECURITY.md](../SECURITY.md)。

## 开发

### 从源码构建

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
npm run typecheck     # TypeScript类型检查
```

### 开发模式

```bash
npm run dev           # 使用tsx运行（自动重新加载）
```

## 贡献

开发设置、代码标准和PR指南请参阅[CONTRIBUTING.md](../CONTRIBUTING.md)。

## 许可证

MIT许可证。详情请参阅[LICENSE](../LICENSE)。
