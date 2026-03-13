<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>最も包括的なフレームワーク対応Unity MCPサーバー</strong></p>
  <p>49ツール、10リソース、6プロンプト — Strada.Coreインテリジェンス、RAG検索、Unity Editorブリッジ搭載</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="ライセンス: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-対応-purple.svg" alt="MCP対応"></a>
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

Strada.MCPは、UnityおよびStrada.Core開発に特化したModel Context Protocol（MCP）サーバーです。AIアシスタント（Claude、GPTなど）をUnityワークフローに直接統合します。

**デュアルユーザーアーキテクチャ:**
- **スタンドアロンモード** — Claude Desktop、Cursor、Windsurf、VS Code + Continueですぐに動作
- **Brainモード** — Strada.Brainと統合し、拡張メモリ、学習、目標実行を実現

**Strada.MCPを選ぶ理由:**
- **フレームワーク対応**: Strada.Coreパターン（ECS、MVCS、DI、モジュール）を理解する唯一のUnity MCPサーバー
- **包括的なツールセット**: ファイル、git、.NET、コード分析、Stradaスキャフォールディング、Unityランタイム操作を網羅する49ツール
- **RAG検索**: Tree-sitter C#パーシング + Geminiエンベディング + HNSWベクトル検索
- **リアルタイムブリッジ**: シーン操作、コンポーネント編集、再生モード制御のためのUnity EditorへのTCPブリッジ
- **セキュリティ優先**: パストラバーサル防止、資格情報スクラブ、読み取り専用モード、スクリプト実行オプトイン

## クイックスタート

### 1. インストール

```bash
npm install -g strada-mcp
```

またはソースからビルド:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDE設定

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`に追加:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/プロジェクトのパス"
      }
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`に追加:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/プロジェクトのパス"
      }
    }
  }
}
```

### 3. Unityパッケージのインストール（オプション — 全ツールアクセス用）

Unity Package Manager > "+" > Git URLからパッケージを追加:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. 使い始める

AIアシスタントにUnityプロジェクトでの作業を依頼:
- 「CurrentとMaxフィールドを持つECS Healthコンポーネントを作成して」
- 「Rigidbodyコンポーネントを持つすべてのGameObjectを検索して」
- 「プロジェクトアーキテクチャのアンチパターンを分析して」
- 「コードベースでダメージ計算ロジックを検索して」

## 機能

### ツールカテゴリ（合計49）

| カテゴリ | 数量 | Unityブリッジ必要 |
|---------|------|-------------------|
| Stradaフレームワーク | 10 | いいえ |
| Unityランタイム | 18 | はい |
| ファイル操作 | 6 | いいえ |
| 検索 | 3 | いいえ |
| Git | 6 | いいえ |
| .NETビルド | 2 | いいえ |
| 分析 | 4 | いいえ |

- **Unity未起動**: 31ツールが利用可能（ファイル、git、検索、分析、Stradaスキャフォールディング、.NET）
- **Unity起動時**: ブリッジ経由で全49ツールがアクティブ

### Stradaフレームワークツール

これらのツールはStrada.MCP独自のもの — 競合製品にはフレームワーク対応スキャフォールディングがありません。

| ツール | 説明 |
|--------|------|
| `strada_create_component` | StructLayoutを持つIComponent実装のECSコンポーネント構造体を生成 |
| `strada_create_system` | Strada ECSシステムを生成（SystemBase、JobSystemBase、またはBurstSystemBase） |
| `strada_create_module` | ModuleConfig、アセンブリ定義、フォルダ構造を持つStradaモジュールを生成 |
| `strada_create_mediator` | ECSコンポーネントをUnity Viewにバインドする EntityMediatorを生成 |
| `strada_create_service` | Stradaサービスを生成（Service、TickableService、FixedTickableService、OrderedService） |
| `strada_create_controller` | 型付きモデル参照とビューインジェクションを持つStrada Controllerを生成 |
| `strada_create_model` | 型付きプロパティを持つStrada ModelまたはReactiveModelを生成 |
| `strada_analyze_project` | .csファイルをスキャンしてモジュール、システム、コンポーネント、サービス、DI使用状況をマッピング |
| `strada_validate_architecture` | Strada.Core命名規則、ライフタイムルール、依存関係ルールを検証 |
| `strada_scaffold_feature` | 完全な機能スケルトンを生成: モジュール + コンポーネント + システム + オプションのMVCSビュー |

### Unityランタイムツール（18）

| ツール | 説明 |
|--------|------|
| `unity_create_gameobject` | 新しいGameObjectを作成（空、プリミティブ、またはプレハブから） |
| `unity_find_gameobjects` | 名前、タグ、レイヤー、またはコンポーネントタイプでGameObjectを検索 |
| `unity_modify_gameobject` | GameObjectプロパティを変更（名前、アクティブ、タグ、レイヤー、静的） |
| `unity_delete_gameobject` | インスタンスIDでシーンからGameObjectを削除 |
| `unity_duplicate_gameobject` | オプションの新しい名前、親、またはオフセットでGameObjectを複製 |
| `unity_add_component` | タイプ名でGameObjectにコンポーネントを追加 |
| `unity_remove_component` | タイプ名でGameObjectからコンポーネントを削除 |
| `unity_get_components` | GameObjectにアタッチされたすべてのコンポーネントをリスト |
| `unity_set_transform` | GameObjectトランスフォームの位置、回転、スケールを設定 |
| `unity_get_transform` | GameObjectの現在のトランスフォームを取得（位置、回転、スケール） |
| `unity_set_parent` | GameObjectを新しい親トランスフォームの下に移動 |
| `unity_play` | Unity再生モードを制御（再生、一時停止、停止、1フレーム進行） |
| `unity_get_play_state` | Unity Editorの現在の再生状態を取得 |
| `unity_execute_menu` | パスでUnity Editorメニューコマンドを実行 |
| `unity_console_log` | Unityコンソールにメッセージを出力（ログ、警告、エラー） |
| `unity_console_clear` | Unity Editorコンソールをクリア |
| `unity_selection_get` | Unity Editorで現在選択されているオブジェクトを取得 |
| `unity_selection_set` | 指定されたインスタンスIDにエディタ選択を設定 |

### ファイル・検索ツール（9）

| ツール | 説明 |
|--------|------|
| `file_read` | 行番号付きでファイル内容を読み取り、オプションのオフセット/リミット |
| `file_write` | ファイルに内容を書き込み、必要に応じてディレクトリを作成 |
| `file_edit` | 完全一致文字列マッチングでファイル内のテキストを置換 |
| `file_delete` | ファイルを削除 |
| `file_rename` | ファイルの名前変更または移動 |
| `list_directory` | ファイル/ディレクトリ表示付きでディレクトリ内容をリスト |
| `glob_search` | globパターンに一致するファイルを検索 |
| `grep_search` | 正規表現でファイル内容を検索、オプションのコンテキスト行 |
| `code_search` | RAGによるセマンティックコード検索（インデクシング要） |

### Gitツール（6）

| ツール | 説明 |
|--------|------|
| `git_status` | 作業ツリーの状態を表示（porcelainフォーマット） |
| `git_diff` | 作業ツリーとインデックス間の差分を表示 |
| `git_log` | コミット履歴を表示 |
| `git_commit` | ファイルをステージングしてコミットを作成 |
| `git_branch` | ブランチのリスト、作成、削除、切り替え |
| `git_stash` | コミットされていない変更の退避または復元 |

### .NETビルドツール（2）

| ツール | 説明 |
|--------|------|
| `dotnet_build` | .NETプロジェクトをビルドしてエラー/警告を解析 |
| `dotnet_test` | .NETテストを実行して結果サマリーを解析 |

### 分析ツール（4）

| ツール | 説明 |
|--------|------|
| `code_quality` | Strada.Coreアンチパターンとベストプラクティス違反のC#コード分析 |
| `csharp_parse` | C#ソースコードをクラス、構造体、メソッド、フィールド、名前空間の構造化ASTに解析 |
| `dependency_graph` | Unityプロジェクトのアセンブリ参照と名前空間依存関係を分析、循環依存を検出 |
| `project_health` | コード品質、依存関係分析、ファイル統計を統合した包括的プロジェクトヘルスチェック |

### RAG検索

```
C#ソース -> Tree-sitter AST -> 構造チャンク -> Geminiエンベディング -> HNSWベクトルインデックス
```

- プロジェクト全体のセマンティックコード検索
- クラス/メソッド/フィールド境界を理解
- インクリメンタルインデクシング（変更されたファイルのみ再インデックス）
- ハイブリッドリランキング: ベクトル類似度 + キーワード + 構造コンテキスト

### Unity Editorブリッジ

Unity Editorへのリアルタイム TCP接続（ポート7691）:
- GameObjectの作成、検索、変更、削除
- コンポーネントの追加/削除/読み取り
- トランスフォーム操作（位置、回転、スケール、再親子付け）
- 再生モード制御（再生、一時停止、停止、ステップ）
- コンソール出力（ログ、警告、エラー、クリア）
- エディタ選択管理
- メニューコマンド実行

## リソース（10）

| URI | 説明 | ソース |
|-----|------|--------|
| `strada://api-reference` | Strada.Core APIドキュメント | ファイルベース |
| `strada://namespaces` | Strada.Core名前空間階層 | ファイルベース |
| `strada://examples/{pattern}` | コード例（ECS、MVCS、DI） | ファイルベース |
| `unity://manifest` | Unityパッケージマニフェスト | ファイルベース |
| `unity://project-settings/{category}` | カテゴリ別Unityプロジェクト設定 | ファイルベース |
| `unity://assemblies` | Unityアセンブリ定義 | ファイルベース |
| `unity://file-stats` | Unityプロジェクトファイル統計 | ファイルベース |
| `unity://scene-hierarchy` | アクティブシーン階層 | ブリッジ |
| `unity://console-logs` | 最新コンソール出力 | ブリッジ |
| `unity://play-state` | 現在の再生モード状態 | ブリッジ |

## プロンプト（6）

| プロンプト | 説明 |
|-----------|------|
| `create_ecs_feature` | ECS機能作成ガイド（コンポーネント、システム、モジュール登録） |
| `create_mvcs_feature` | Strada.Core向けMVCSパターンスキャフォールドガイド |
| `analyze_architecture` | Strada.Coreプロジェクト向けアーキテクチャレビュープロンプト |
| `debug_performance` | Unityプロジェクト向けパフォーマンスデバッグガイド |
| `optimize_build` | Unityプロジェクト向けビルド最適化チェックリスト |
| `setup_scene` | Unityプロジェクト向けシーンセットアップワークフローガイド |

## 設定

すべてのオプションは環境変数で設定します:

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `MCP_TRANSPORT` | トランスポートモード: `stdio`または`http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTPポート | `3100` |
| `MCP_HTTP_HOST` | HTTPバインドアドレス | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity EditorブリッジのTCPポート | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | 起動時にUnityへ自動接続 | `true` |
| `UNITY_BRIDGE_TIMEOUT` | ブリッジ接続タイムアウト（ms） | `5000` |
| `UNITY_PROJECT_PATH` | Unityプロジェクトパス（空の場合は自動検出） | — |
| `EMBEDDING_PROVIDER` | エンベディングプロバイダー: `gemini`、`openai`、`ollama` | `gemini` |
| `EMBEDDING_MODEL` | エンベディングモデル名 | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | エンベディング次元数（128-3072） | `768` |
| `EMBEDDING_API_KEY` | エンベディングプロバイダーのAPIキー | — |
| `RAG_AUTO_INDEX` | 起動時に自動インデックス | `true` |
| `RAG_WATCH_FILES` | ファイル変更を監視 | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL（空 = 無効） | — |
| `BRAIN_API_KEY` | Brain APIキー | — |
| `READ_ONLY` | グローバル読み取り専用モード | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn スクリプト実行を有効化 | `false` |
| `MAX_FILE_SIZE` | 最大ファイルサイズ（バイト） | `10485760` |
| `LOG_LEVEL` | ログレベル: `debug`、`info`、`warn`、`error` | `info` |
| `LOG_FILE` | ログファイルパス（空の場合はstderr） | — |

## Brain統合

Strada.Brainに接続した場合（`BRAIN_URL`設定時）:

- **共有メモリ**: Brainの長期メモリがツール提案に活用される
- **統合RAG**: Brainメモリコンテキスト + MCP tree-sitter ASTの組み合わせ
- **学習**: ツール使用パターンがBrainの学習パイプラインにフィードバック
- **目標実行**: Brainが目標計画の一部としてMCPツールを呼び出し可能

Brain未接続でも、Strada.MCPは完全に独立したMCPサーバーとして動作します。

## セキュリティ

| レイヤー | 保護内容 |
|---------|----------|
| 入力検証 | 全ツールでZodスキーマ + 型チェック |
| パスガード | ディレクトリトラバーサル防止、nullバイト拒否、シンボリックリンクトラバーサル防止 |
| 読み取り専用モード | グローバル + ツール単位の書き込み権限強制 |
| 資格情報スクラブ | 全出力でAPIキー/トークンパターンスクラブ |
| ツール許可リスト | UnityブリッジはregisteredされたJSON-RPCコマンドのみ受け付け |
| レート制限 | エンベディングAPIレート制限保護 |
| Localhostのみ | Unityブリッジは127.0.0.1のみバインド |
| スクリプト実行 | Roslyn実行はデフォルト無効、明示的オプトイン必要 |

詳細は[SECURITY.md](../SECURITY.md)を参照してください。

## 開発

### ソースからビルド

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### テスト実行

```bash
npm test              # 全テスト実行
npm run test:watch    # ウォッチモード
npm run typecheck     # TypeScript型チェック
```

### 開発モード

```bash
npm run dev           # tsx実行（自動リロード）
```

## コントリビューション

開発セットアップ、コード標準、PRガイドラインは[CONTRIBUTING.md](../CONTRIBUTING.md)を参照してください。

## ライセンス

MITライセンス。詳細は[LICENSE](../LICENSE)を参照してください。
