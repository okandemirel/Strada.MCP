<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>最も包括的なフレームワーク対応Unity MCPサーバー</strong></p>
  <p>76ツール、10リソース、6プロンプト — Strada.Coreインテリジェンス、RAG搭載検索、Unity Editorブリッジ付き</p>

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

## 概要

Strada.MCPは、UnityおよびStrada.Core開発専用に構築されたModel Context Protocol（MCP）サーバーです。AIアシスタント（Claude、GPTなど）をUnityワークフローに直接接続します。

**デュアルユーザーアーキテクチャ：**
- **スタンドアロンモード** — Claude Desktop、Cursor、Windsurf、VS Code + Continueですぐに使用可能
- **Brainモード** — Strada.Brainと統合し、強化されたメモリ、学習、目標実行を実現

**なぜStrada.MCPなのか？**
- **フレームワーク対応**: Strada.Coreパターン（ECS、MVCS、DI、モジュール）を理解する唯一のUnity MCPサーバー
- **完全なツールセット**: ファイル、git、.NET、コード分析、Stradaスキャフォールディング、Unityランタイム、シーン/プレハブ、アセット、サブシステム、プロジェクト設定をカバーする76のツール
- **RAG搭載検索**: Tree-sitter C#パーシング + Geminiエンベディング + HNSWベクトル検索
- **リアルタイムブリッジ**: ライブシーン操作、コンポーネント編集、再生モード制御のためのUnity EditorへのTCPブリッジ
- **セキュリティファースト**: パストラバーサル防止、認証情報スクラビング、読み取り専用モード、スクリプト実行オプトイン

## クイックスタート

### 1. インストール

```bash
npm install -g strada-mcp
```

またはクローンしてビルド：

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDEの設定

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`に追加：

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

**Cursor** — `.cursor/mcp.json`に追加：

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

### 3. Unityパッケージのインストール（オプション — フルツールアクセス用）

Unity Package Manager > 「+」 > Git URLからパッケージを追加：

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. 使い始める

AIアシスタントにUnityプロジェクトの作業を依頼してください：
- 「CurrentとMaxフィールドを持つECS Healthコンポーネントを作成して」
- 「Rigidbodyコンポーネントを持つすべてのGameObjectを検索して」
- 「プロジェクトアーキテクチャをアンチパターンの観点から分析して」
- 「コードベースでダメージ計算ロジックを検索して」

## 機能

### ツールカテゴリ（合計76）

| カテゴリ | 数 | Unity Bridgeが必要 |
|----------|----|--------------------|
| Strada Framework | 10 | いいえ |
| Unityランタイム | 18 | はい |
| Unityシーン/プレハブ | 8 | 混合 |
| Unityアセット | 8 | 混合 |
| Unityサブシステム | 6 | はい |
| Unity設定 | 4 | はい |
| 高度 | 5 | 混合 |
| ファイル操作 | 6 | いいえ |
| 検索 | 3 | いいえ |
| Git | 6 | いいえ |
| .NETビルド | 2 | いいえ |
| 分析 | 4 | いいえ |

- **Unity未起動**: 35以上のツールが利用可能（ファイル、git、検索、分析、Stradaスキャフォールディング、.NET、シーン/プレハブ分析）
- **Unity起動中**: ブリッジ経由で全76ツールがアクティブ

### Strada Frameworkツール

これらのツールはStrada.MCP独自のものです。フレームワーク対応のスキャフォールディングを持つ競合製品はありません。

| ツール | 説明 |
|--------|------|
| `strada_create_component` | StructLayoutを持つIComponentを実装するECSコンポーネント構造体を生成 |
| `strada_create_system` | Strada ECSシステムを生成（SystemBase、JobSystemBase、またはBurstSystemBase） |
| `strada_create_module` | ModuleConfig、アセンブリ定義、フォルダ構造を持つStradaモジュールを生成 |
| `strada_create_mediator` | ECSコンポーネントをUnity ViewにバインドするEntityMediatorを生成 |
| `strada_create_service` | Stradaサービスを生成（Service、TickableService、FixedTickableService、またはOrderedService） |
| `strada_create_controller` | 型付きモデル参照とビューインジェクションを持つStrada Controllerを生成 |
| `strada_create_model` | 型付きプロパティを持つStrada ModelまたはReactiveModelを生成 |
| `strada_analyze_project` | .csファイルをスキャンしてモジュール、システム、コンポーネント、サービス、DI使用状況をマッピング |
| `strada_validate_architecture` | Strada.Coreの命名規則、ライフタイムルール、依存関係ルールを検証 |
| `strada_scaffold_feature` | 完全な機能スケルトンを生成：モジュール + コンポーネント + システム + オプションのMVCSビュー |

### Unityランタイムツール（18）

| ツール | 説明 |
|--------|------|
| `unity_create_gameobject` | 新しいGameObjectを作成（空、プリミティブ、またはプレハブから） |
| `unity_find_gameobjects` | 名前、タグ、レイヤー、またはコンポーネントタイプでGameObjectを検索 |
| `unity_modify_gameobject` | GameObjectプロパティを変更（名前、アクティブ、タグ、レイヤー、スタティック） |
| `unity_delete_gameobject` | インスタンスIDでシーンからGameObjectを削除 |
| `unity_duplicate_gameobject` | オプションの新しい名前、親、またはオフセットでGameObjectを複製 |
| `unity_add_component` | タイプ名でGameObjectにコンポーネントを追加 |
| `unity_remove_component` | タイプ名でGameObjectからコンポーネントを削除 |
| `unity_get_components` | GameObjectにアタッチされたすべてのコンポーネントを一覧表示 |
| `unity_set_transform` | GameObjectのトランスフォームの位置、回転、スケールを設定 |
| `unity_get_transform` | GameObjectの現在のトランスフォーム（位置、回転、スケール）を取得 |
| `unity_set_parent` | GameObjectを新しい親トランスフォームの下に再配置 |
| `unity_play` | Unity再生モードを制御（再生、一時停止、停止、または1フレーム進める） |
| `unity_get_play_state` | 現在のUnityエディター再生状態を取得 |
| `unity_execute_menu` | パスでUnityエディターメニューコマンドを実行 |
| `unity_console_log` | Unityコンソールにメッセージを書き込む（ログ、警告、またはエラー） |
| `unity_console_clear` | Unityエディターコンソールをクリア |
| `unity_selection_get` | Unityエディターで現在選択されているオブジェクトを取得 |
| `unity_selection_set` | 指定されたインスタンスIDにエディター選択を設定 |

### ファイル＆検索ツール（9）

| ツール | 説明 |
|--------|------|
| `file_read` | 行番号付きでファイル内容を読み取り、オプションのオフセット/リミット |
| `file_write` | 必要に応じてディレクトリを作成しながらファイルに内容を書き込み |
| `file_edit` | 完全一致文字列マッチングを使用してファイル内のテキストを置換 |
| `file_delete` | ファイルを削除 |
| `file_rename` | ファイルの名前変更または移動 |
| `list_directory` | ファイル/ディレクトリインジケーター付きでディレクトリ内容を一覧表示 |
| `glob_search` | globパターンに一致するファイルを検索 |
| `grep_search` | オプションのコンテキスト行付きで正規表現を使用してファイル内容を検索 |
| `code_search` | RAG搭載セマンティックコード検索（インデックス作成が必要） |

### Gitツール（6）

| ツール | 説明 |
|--------|------|
| `git_status` | ワーキングツリーの状態を表示（porcelainフォーマット） |
| `git_diff` | ワーキングツリーとインデックス間の変更を表示（staged/unstaged） |
| `git_log` | コミット履歴を表示 |
| `git_commit` | ファイルをステージングしてコミットを作成 |
| `git_branch` | ブランチの一覧表示、作成、削除、または切り替え |
| `git_stash` | コミットされていない変更のスタッシュまたは復元 |

### .NETビルドツール（2）

| ツール | 説明 |
|--------|------|
| `dotnet_build` | .NETプロジェクトをビルドし、エラー/警告を解析 |
| `dotnet_test` | .NETテストを実行し、結果サマリーを解析 |

### 分析ツール（4）

| ツール | 説明 |
|--------|------|
| `code_quality` | Strada.Coreのアンチパターンとベストプラクティス違反についてC#コードを分析 |
| `csharp_parse` | C#ソースコードをクラス、構造体、メソッド、フィールド、名前空間を持つ構造化ASTに解析 |
| `dependency_graph` | Unityプロジェクトのアセンブリ参照と名前空間の依存関係を分析し、循環依存を検出 |
| `project_health` | コード品質、依存関係分析、ファイル統計を組み合わせた包括的なプロジェクトヘルスチェック |

### Unityシーン＆プレハブツール（8）

| ツール | 説明 |
|--------|------|
| `unity_scene_create` | 新しいUnityシーンを作成 |
| `unity_scene_open` | エディターで既存のシーンを開く |
| `unity_scene_save` | 現在のシーンを保存 |
| `unity_scene_info` | シーンのメタデータと統計を取得 |
| `unity_scene_analyze` | YAMLからシーンヒエラルキーを分析（ブリッジ不要） |
| `unity_prefab_create` | GameObjectから新しいプレハブを作成 |
| `unity_prefab_instantiate` | 現在のシーンにプレハブをインスタンス化 |
| `unity_prefab_analyze` | YAMLからプレハブ構造を分析（ブリッジ不要） |

### Unityアセットツール（8）

| ツール | 説明 |
|--------|------|
| `unity_asset_find` | 名前、タイプ、またはラベルでアセットを検索 |
| `unity_asset_dependencies` | アセットの依存関係チェーンを分析 |
| `unity_asset_unused` | プロジェクト内の未使用の可能性があるアセットを検索 |
| `unity_material_get` | マテリアルプロパティとシェーダー割り当てを読み取り |
| `unity_material_set` | マテリアルプロパティを変更 |
| `unity_shader_list` | キーワードとプロパティ付きで利用可能なシェーダーを一覧表示 |
| `unity_scriptableobject_create` | 新しいScriptableObjectアセットを作成 |
| `unity_texture_info` | テクスチャのインポート設定とメタデータを取得 |

### Unityサブシステムツール（6）

| ツール | 説明 |
|--------|------|
| `unity_animation_play` | アニメーター再生を制御 |
| `unity_animation_list` | アニメーションクリップとパラメーターを一覧表示 |
| `unity_physics_raycast` | シーンで物理レイキャストを実行 |
| `unity_navmesh_bake` | NavMesh設定のベイクまたは構成 |
| `unity_particles_control` | パーティクルシステムの再生を制御 |
| `unity_lighting_bake` | ライティングのベイクとライト設定の構成 |

### Unity設定ツール（4）

| ツール | 説明 |
|--------|------|
| `unity_player_settings` | プレイヤー設定の取得/設定（会社、製品、プラットフォーム） |
| `unity_quality_settings` | 品質レベルとグラフィックス設定の取得/設定 |
| `unity_build_settings` | ビルドターゲット、シーン、オプションの取得/設定 |
| `unity_project_settings` | タグ、レイヤー、物理、入力設定の取得/設定 |

### 高度なツール（5）

| ツール | 説明 |
|--------|------|
| `batch_execute` | 単一のリクエストで複数のツールを実行 |
| `script_execute` | Roslyn経由でC#スクリプトを実行（オプトイン、デフォルトで無効） |
| `script_validate` | 実行せずにC#スクリプトの構文を検証 |
| `csharp_reflection` | リフレクション経由で型、メソッド、アセンブリを検査 |
| `unity_profiler` | Unityプロファイラーデータとパフォーマンスメトリクスにアクセス |

### RAG搭載コード検索

```
C# ソース -> Tree-sitter AST -> 構造的チャンク -> Gemini Embeddings -> HNSW ベクトルインデックス
```

- プロジェクト全体のセマンティックコード検索
- クラス/メソッド/フィールドの境界を理解
- インクリメンタルインデックス作成（変更されたファイルのみ再インデックス）
- ハイブリッドリランキング：ベクトル類似性 + キーワード + 構造的コンテキスト

### Unity Editorブリッジ

Unity Editorへのリアルタイム TCP接続（ポート7691）：
- GameObjectの作成、検索、変更、削除
- コンポーネントの追加/削除/読み取り
- トランスフォーム操作（位置、回転、スケール、再ペアレント）
- 再生モード制御（再生、一時停止、停止、ステップ）
- コンソール出力（ログ、警告、エラー、クリア）
- エディター選択管理
- メニューコマンド実行

### イベントストリーミング

ブリッジはUnity Editorイベントをリアルタイムで配信します：
- `scene.changed` — シーンのオープン、クローズ、保存
- `console.line` — 新しいコンソールログエントリ
- `compile.started` / `compile.finished` — スクリプトコンパイル
- `playmode.changed` — 再生/一時停止/停止の遷移
- `selection.changed` — 選択オブジェクトの変更

## リソース（10）

| URI | 説明 | ソース |
|-----|------|--------|
| `strada://api-reference` | Strada.Core APIドキュメント | ファイルベース |
| `strada://namespaces` | Strada.Core名前空間ヒエラルキー | ファイルベース |
| `strada://examples/{pattern}` | コード例（ECS、MVCS、DI） | ファイルベース |
| `unity://manifest` | Unityパッケージマニフェスト（Packages/manifest.json） | ファイルベース |
| `unity://project-settings/{category}` | カテゴリ別Unityプロジェクト設定 | ファイルベース |
| `unity://assemblies` | Unityアセンブリ定義（.asmdefファイル） | ファイルベース |
| `unity://file-stats` | Unityプロジェクトファイル統計 | ファイルベース |
| `unity://scene-hierarchy` | アクティブシーンヒエラルキー | Bridge |
| `unity://console-logs` | 最近のコンソール出力 | Bridge |
| `unity://play-state` | 現在の再生モード状態 | Bridge |

## プロンプト（6）

| プロンプト | 説明 |
|------------|------|
| `create_ecs_feature` | ECS機能作成をガイドするマルチメッセージシーケンス（コンポーネント、システム、モジュール登録） |
| `create_mvcs_feature` | Strada.Core向けMVCSパターンスキャフォールドガイダンス |
| `analyze_architecture` | Strada.Coreプロジェクトのアーキテクチャレビュープロンプト |
| `debug_performance` | Unityプロジェクトのパフォーマンスデバッグガイダンス |
| `optimize_build` | Unityプロジェクトのビルド最適化チェックリスト |
| `setup_scene` | Unityプロジェクトのシーンセットアップワークフローガイダンス |

## インストール

### 前提条件

- Node.js >= 20
- Unity 2021.3+（ブリッジ機能用）
- Strada.Coreプロジェクト（フレームワークツール用 — オプション）

### npm（推奨）

```bash
npm install -g strada-mcp
```

### ソースから

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### IDE設定

#### Claude Desktop

ファイル: `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）または `%APPDATA%\Claude\claude_desktop_config.json`（Windows）

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

ファイル: ワークスペースルートの `.cursor/mcp.json`：

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

ファイル: `~/.windsurf/mcp.json`：

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

ファイル: `~/.claude/settings.json` またはプロジェクトの `.mcp.json`：

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

ファイル: `.continue/config.json`：

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

## Unityパッケージのセットアップ

### com.strada.mcp のインストール

1. Unity > Window > Package Managerを開く
2. 「+」 > 「Add package from git URL...」をクリック
3. 入力: `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Addをクリック

### 設定

インストール後：
1. **Strada > MCP > Settings** に移動
2. ポートを設定（デフォルト: 7691）
3. 自動起動を有効/無効化
4. MCPサーバー接続時に接続状態インジケーターが緑色になることを確認

### 手動制御

- **Strada > MCP > Start Server** — ブリッジを開始
- **Strada > MCP > Stop Server** — ブリッジを停止
- **Strada > MCP > Status** — 現在の状態をログ出力

## 設定

すべてのオプションは環境変数で設定します：

| 変数 | 説明 | デフォルト |
|------|------|------------|
| `MCP_TRANSPORT` | トランスポートモード: `stdio` または `http` | `stdio` |
| `MCP_HTTP_PORT` | ストリーマブルHTTPポート | `3100` |
| `MCP_HTTP_HOST` | HTTPバインドアドレス | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity EditorブリッジのTCPポート | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | 起動時にUnityへ自動接続 | `true` |
| `UNITY_BRIDGE_TIMEOUT` | ブリッジ接続タイムアウト（ms） | `5000` |
| `UNITY_PROJECT_PATH` | Unityプロジェクトへのパス（空の場合は自動検出） | — |
| `EMBEDDING_PROVIDER` | エンベディングプロバイダー: `gemini`、`openai`、`ollama` | `gemini` |
| `EMBEDDING_MODEL` | エンベディングモデル名 | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | エンベディング次元数（128-3072） | `768` |
| `EMBEDDING_API_KEY` | エンベディングプロバイダーのAPIキー | — |
| `RAG_AUTO_INDEX` | 起動時の自動インデックス作成 | `true` |
| `RAG_WATCH_FILES` | ファイル変更の監視 | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL（空 = 無効） | — |
| `BRAIN_API_KEY` | Brain APIキー | — |
| `ALLOWED_PATHS` | カンマ区切りの許可ルートディレクトリリスト | — |
| `READ_ONLY` | グローバル読み取り専用モード | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslynスクリプト実行の有効化 | `false` |
| `REFLECTION_INVOKE_ENABLED` | C#リフレクションメソッド呼び出しの有効化 | `false` |
| `MAX_FILE_SIZE` | 最大ファイルサイズ（バイト） | `10485760` |
| `LOG_LEVEL` | ログレベル: `debug`、`info`、`warn`、`error` | `info` |
| `LOG_FILE` | ログファイルパス（空の場合はstderr） | — |

## Brain統合

Strada.Brainに接続している場合（`BRAIN_URL`設定済み）：

- **共有メモリ**: Brainの長期メモリがツール提案に活用される
- **統合RAG**: Brainメモリコンテキスト + MCP Tree-sitter ASTの統合
- **学習**: ツール使用パターンがBrainの学習パイプラインにフィードバック
- **目標実行**: Brainが目標計画の一部としてMCPツールを呼び出し可能

Brain無しでも、Strada.MCPは完全に独立したMCPサーバーとして動作します。

## セキュリティ

| レイヤー | 保護 |
|----------|------|
| 入力バリデーション | すべてのツールにZodスキーマ + 型チェック |
| パスガード | ディレクトリトラバーサル防止、nullバイト拒否、シンボリックリンクトラバーサル防止 |
| 読み取り専用モード | グローバル + ツール単位の書き込み権限の強制 |
| 認証情報スクラビング | すべての出力でAPIキー/トークンパターンのスクラビング |
| ツールホワイトリスト | Unityブリッジは登録済みJSON-RPCコマンドのみ受け付け |
| レート制限 | Embedding APIレート制限保護 |
| ローカルホストのみ | Unityブリッジは127.0.0.1のみにバインド |
| スクリプト実行 | Roslyn実行はデフォルトで無効、明示的なオプトインが必要 |

詳細は[SECURITY.md](../SECURITY.md)を参照してください。

## 開発

### ソースからのビルド

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### テストの実行

```bash
npm test              # すべてのテストを実行
npm run test:watch    # ウォッチモード
npm run typecheck     # TypeScript型チェック
```

### 開発モード

```bash
npm run dev           # tsxで実行（自動リロード）
```

### プロジェクト構造

```
src/
  config/          - Zodバリデーション付き設定
  security/        - パスガード、サニタイザー、バリデーター
  tools/
    strada/        - 10 Strada frameworkツール
    unity/         - 18 ブリッジ依存Unityツール
    file/          - 6 ファイル操作ツール
    search/        - 3 検索ツール（glob、grep、RAG）
    git/           - 6 gitツール
    dotnet/        - 2 .NETビルドツール
    analysis/      - 4 コード分析ツール
  intelligence/
    parser/        - Tree-sitter C#パーサー
    rag/           - エンベディング、チャンカー、HNSWインデックス
  bridge/          - Unity TCPブリッジクライアント
  context/         - Brain HTTPクライアント
  resources/       - 10 MCPリソース
  prompts/         - 6 MCPプロンプト
  utils/           - ロガー、プロセスランナー

unity-package/
  com.strada.mcp/  - C# Unity Editorパッケージ（UPM）
```

## コントリビューション

開発環境のセットアップ、コード標準、PRガイドラインについては[CONTRIBUTING.md](../CONTRIBUTING.md)を参照してください。

## ライセンス

MITライセンス。詳細は[LICENSE](../LICENSE)を参照してください。
