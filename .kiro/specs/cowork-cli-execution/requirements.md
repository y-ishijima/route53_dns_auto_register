# 要件定義書

## はじめに

MCPサーバー（mcp-server.ts）を廃止し、CoworkがワークスペースのCLIコマンド（`npx dns-register ...`）を直接実行するアーキテクチャに変更する。Desktop CommanderもMCPサーバーも使用しない。既存のCLI（cli.ts）が全コマンドを備えており、handlers.tsの業務ロジック層は変更不要である。

## 用語集

- **Cowork**: Claude Desktopのワークスペース機能。仮想環境内でCLIコマンドをネイティブに実行できる
- **CLI**: cli.tsが提供するコマンドラインインターフェース（`npx dns-register <command>`）
- **MCPサーバー**: mcp-server.tsが提供するMCP Protocol経由のツールサーバー（廃止対象）
- **スキルファイル**: skills/dns-register-skill.md。Coworkの操作手順を定義するMarkdownファイル
- **ハンドラ層**: handlers.tsの共通業務ロジック層。CLIとMCPサーバーの両方から呼び出される
- **セットアップスクリプト**: setup.bat / setup.sh。依存関係インストールとビルドを実行するスクリプト
- **CLAUDE_MD**: CLAUDE.md。Cowork用のガイド・ルールファイル
- **アーキテクチャ文書**: docs/architecture.md。ソフトウェア構造図

## 要件

### 要件1: MCPサーバー関連ファイルの削除

**ユーザーストーリー:** IT部門として、不要になったMCPサーバー関連ファイルを削除したい。コードベースを簡潔に保ち、保守対象を減らすためである。

#### 受け入れ基準

1. WHEN MCPサーバーの廃止が完了した場合、THE リポジトリ SHALL src/mcp-server.ts ファイルを含まない状態である
2. WHEN MCPサーバーの廃止が完了した場合、THE リポジトリ SHALL start-mcp.bat ファイルを含まない状態である
3. WHEN MCPサーバーの廃止が完了した場合、THE package.json SHALL MCPサーバー専用の依存関係（@modelcontextprotocol/sdk）をdevDependenciesまたはdependenciesに含まない状態である

### 要件2: スキルファイルのCLIコマンド実行方式への変更と配置修正

**ユーザーストーリー:** Coworkユーザーとして、スキルファイルがCLIコマンド実行方式に更新され、Coworkが自動で読み込める正しいディレクトリに配置されていることを期待する。

#### 受け入れ基準

1. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL `.claude/skills/dns-register/SKILL.md` に配置される（Coworkの自動読み込み対応）
2. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL 全操作をCLIコマンド（`npx dns-register <command> --env-file .env`）形式で記述する
3. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL MCPツール呼び出しの記述を含まない
4. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL テストモード時に `--test` フラグをCLIコマンドに付与する手順を記述する
5. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL undo コマンドで `--operation-id` オプションを使用した個別取り消し手順を記述する
6. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL 開始時の準備手順として `git pull && npm install && npx tsc` のCLIコマンド実行を記述する
7. WHEN スキルファイルが更新された場合、THE スキルファイル SHALL Desktop Commanderへの参照を含まない
8. WHEN スキルファイルが配置された場合、THE 旧スキルファイル（skills/dns-register-skill.md）SHALL 削除される

### 要件3: CLAUDE.mdのCLIコマンド参照への変更

**ユーザーストーリー:** Coworkとして、CLAUDE_MDがCLIコマンド実行方式のガイドに更新されていることを期待する。正しい操作方法を参照するためである。

#### 受け入れ基準

1. WHEN CLAUDE_MDが更新された場合、THE CLAUDE_MD SHALL ツール概要をCLIコマンド直接実行方式として記述する
2. WHEN CLAUDE_MDが更新された場合、THE CLAUDE_MD SHALL MCPツール一覧の代わりにCLIコマンド一覧（`npx dns-register <command>` 形式）を記述する
3. WHEN CLAUDE_MDが更新された場合、THE CLAUDE_MD SHALL 「全操作はMCPツール経由で実行すること」のルールを「全操作はCLIコマンド経由で実行すること」に変更する
4. WHEN CLAUDE_MDが更新された場合、THE CLAUDE_MD SHALL 絶対ルールに「Cowork開始時には `git pull && npm install && npx tsc` を実行して最新の状態にすること」を記述する
5. WHEN CLAUDE_MDが更新された場合、THE CLAUDE_MD SHALL 設定セクションで「CLIコマンドは `--env-file .env` で認証情報を読み込む」と記述する
6. WHEN CLAUDE_MDが更新された場合、THE CLAUDE_MD SHALL スキルファイル更新通知のルール（「skills/フォルダ内のファイルが更新された場合、ユーザに通知して再アップロードを促す」）を削除する（.claude/skills/配置により自動読み込みされるため不要）

### 要件4: setup.batからMCP設定セクションの削除

**ユーザーストーリー:** ユーザーとして、setup.batがMCPサーバー設定を含まないことを期待する。不要な設定処理を排除し、セットアップを簡潔にするためである。

#### 受け入れ基準

1. WHEN setup.batが更新された場合、THE setup.bat SHALL Claude Desktop MCP設定セクション（claude_desktop_config.jsonへの書き込み処理）を含まない
2. WHEN setup.batが更新された場合、THE setup.bat SHALL Node.jsチェック、npm install、npx tscの処理を維持する
3. WHEN setup.batが更新された場合、THE setup.bat SHALL 完了メッセージからMCPサーバーへの言及を含まない

### 要件5: README.mdの更新

**ユーザーストーリー:** ユーザーとして、README.mdがCoworkのCLI直接実行方式に基づいた手順を記載していることを期待する。正しいセットアップ手順と使い方を把握するためである。

#### 受け入れ基準

1. WHEN README.mdが更新された場合、THE README.md SHALL 「Claude Desktopの準備」セクションからMCPサーバー設定手順（claude_desktop_config.jsonの編集）を削除する
2. WHEN README.mdが更新された場合、THE README.md SHALL Coworkセクションで「CLIコマンドを仮想環境内で直接実行する」方式を記述する
3. WHEN README.mdが更新された場合、THE README.md SHALL Coworkスキルファイルセクションから「MCPサーバー（dns-register）の設定が必要です」の記述を削除する
4. WHEN README.mdが更新された場合、THE README.md SHALL Cowork経由の操作説明を「CLIコマンド経由で実行」に変更する
5. WHEN README.mdが更新された場合、THE README.md SHALL テストモードセクションで「Cowork（MCPサーバー）経由の削除」の記述を「Cowork（CLIコマンド）経由の削除」に変更する

### 要件6: アーキテクチャ文書の更新

**ユーザーストーリー:** IT部門として、アーキテクチャ文書が新しいアーキテクチャ（Cowork → CLI → handlers.ts → Route53）を反映していることを期待する。正確なシステム構成を把握するためである。

#### 受け入れ基準

1. WHEN アーキテクチャ文書が更新された場合、THE 全体構成図 SHALL Coworkからmcp-server.tsへの経路を含まず、CoworkからCLI（cli.ts）への直接経路を記述する
2. WHEN アーキテクチャ文書が更新された場合、THE レイヤー構成図 SHALL エントリポイント層からmcp-server.tsを削除し、cli.tsのみをエントリポイントとして記述する
3. WHEN アーキテクチャ文書が更新された場合、THE ファイル構成 SHALL src/mcp-server.ts と start-mcp.bat を含まない
4. WHEN アーキテクチャ文書が更新された場合、THE コマンドフロー図 SHALL Cowork経由のフローをCLIコマンド実行方式（`npx dns-register <command> --env-file .env`）で記述する
5. WHEN アーキテクチャ文書が更新された場合、THE スキルファイル説明 SHALL 「MCPツール呼び出し手順スキル」を「CLIコマンド実行手順スキル」に変更する

### 要件7: Cowork仮想環境でのCLI動作保証

**ユーザーストーリー:** Coworkユーザーとして、CLIコマンドがCoworkの仮想環境内で正常に動作することを期待する。MCPサーバーなしで全操作を完了するためである。

#### 受け入れ基準

1. THE CLI SHALL `--env-file .env` オプションでワークスペース内の.envファイルからAWS認証情報を読み込む
2. THE CLI SHALL `--test` オプションでテストモードを有効にする
3. THE CLI SHALL `--operation-id` オプションで個別のundo操作を実行する
4. WHEN Coworkがセットアップコマンド（`git pull && npm install && npx tsc`）を実行した場合、THE CLI SHALL 最新のビルド済み状態で利用可能になる
5. IF CLIコマンドの実行中にAWS認証エラーが発生した場合、THEN THE CLI SHALL 日本語のエラーメッセージを標準エラー出力に出力する
6. IF CLIコマンドの実行中にネットワークエラーが発生した場合、THEN THE CLI SHALL 日本語のエラーメッセージを標準エラー出力に出力する
