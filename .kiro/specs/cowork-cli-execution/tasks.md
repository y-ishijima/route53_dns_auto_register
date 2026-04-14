# Implementation Plan: cowork-cli-execution

## 概要

MCPサーバー（mcp-server.ts）を廃止し、CoworkがCLIコマンドを直接実行するアーキテクチャに変更する。本実装はファイル削除、スキルファイル移行、ドキュメント更新、依存関係整理で構成される。ソースコード（cli.ts、handlers.ts等）の変更は不要。

## Tasks

- [x] 1. MCPサーバー関連ファイルの削除と依存関係整理
  - [x] 1.1 src/mcp-server.ts を削除する
    - MCPサーバー本体ファイルを削除
    - _Requirements: 1.1_
  - [x] 1.2 start-mcp.bat を削除する
    - MCPサーバー起動スクリプトを削除
    - _Requirements: 1.2_
  - [x] 1.3 package.json から MCP関連の依存関係とbinエントリを削除する
    - `dependencies` から `@modelcontextprotocol/sdk` を削除
    - `dependencies` から `zod` を削除（mcp-server.tsのみが使用）
    - `bin` フィールドから `dns-register-mcp` エントリを削除
    - _Requirements: 1.3_
  - [x] 1.4 ビルド検証: `npx tsc` がエラーなく完了することを確認する
    - mcp-server.ts削除後にTypeScriptビルドが通ることを検証
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. チェックポイント - ビルド確認
  - npx tsc がエラーなく完了すること、削除対象ファイルが存在しないことを確認。問題があればユーザーに質問する。

- [x] 3. スキルファイルの移行
  - [x] 3.1 .claude/skills/dns-register/SKILL.md を新規作成する
    - skills/dns-register-skill.md の内容をベースに、全MCPツール呼び出しをCLIコマンド（`npx dns-register <command> --env-file .env`）形式に書き換える
    - テストモード: `--test` フラグの手順を記述
    - undo: `--operation-id` オプションの手順を記述
    - 開始時準備: `git pull && npm install && npx tsc` を記述
    - 「Desktop Commander」への参照を含めない
    - 「MCPツール」の記述を含めない
    - skillsUpdated通知ロジックを削除（.claude/skills/配置により自動読み込み）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 3.2 skills/dns-register-skill.md を削除する
    - 旧スキルファイルを削除
    - _Requirements: 2.8_

- [x] 4. CLAUDE.md を更新する
  - ツール概要: CLIコマンド直接実行方式として記述
  - MCPツール一覧 → CLIコマンド一覧（`npx dns-register <command> --env-file .env` 形式）に変更
  - 「全操作はMCPツール経由で実行すること」→「全操作はCLIコマンド経由で実行すること」に変更
  - 絶対ルール: 「MCPツール `setup` を実行」→「`git pull && npm install && npx tsc` を実行」に変更
  - 設定セクション: 「CLIコマンドは `--env-file .env` で認証情報を読み込む」と記述
  - スキルファイル更新通知ルール（「skills/フォルダ内のファイルが更新された場合〜再アップロードを促す」）を削除
  - 使い方セクション: .claude/skills/自動読み込みの説明に変更
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. setup.bat を更新する
  - Claude Desktop MCP設定セクション（ステップ4: claude_desktop_config.jsonへの書き込み処理）を完全削除
  - ステップ番号を調整（[1/2]、[2/2]に変更）
  - 完了メッセージからMCPサーバーへの言及を削除
  - Node.jsチェック、npm install、npx tscの処理は維持
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. README.md を更新する
  - 「Claude Desktopの準備」セクション: MCP設定手順（claude_desktop_config.json編集）を削除し、Cowork仮想環境でのCLI直接実行方式を記述
  - スキルファイルセクション: 「MCPサーバー（dns-register）の設定が必要です」を削除
  - Cowork経由の操作説明: 「CLIコマンド経由で実行」に変更
  - テストモードセクション: 「Cowork（MCPサーバー）経由の削除」→「Cowork（CLIコマンド）経由の削除」に変更
  - スキルファイルの登録方法セクション: 手動アップロード手順を削除し、.claude/skills/自動読み込みの説明に変更
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. docs/architecture.md を更新する
  - 全体構成図: Cowork → mcp-server.ts経路を削除し、Cowork → cli.ts直接経路に変更
  - レイヤー構成図: エントリポイント層からmcp-server.tsを削除
  - ファイル構成: src/mcp-server.ts、start-mcp.bat、skills/dns-register-skill.mdを削除し、.claude/skills/dns-register/SKILL.mdを追加
  - コマンドフロー図: CLIコマンド実行方式（`npx dns-register <command> --env-file .env`）に書き換え
  - スキルファイル説明: 「MCPツール呼び出し手順スキル」→「CLIコマンド実行手順スキル」に変更
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 8. 最終チェックポイント - 全体検証
  - `npx tsc` がエラーなく完了すること
  - 削除対象ファイル（src/mcp-server.ts、start-mcp.bat、skills/dns-register-skill.md）が存在しないこと
  - .claude/skills/dns-register/SKILL.md が存在すること
  - package.json に @modelcontextprotocol/sdk、zod、dns-register-mcp が含まれないこと
  - 全ドキュメントにMCPサーバーへの不要な参照が残っていないこと
  - 問題があればユーザーに質問する。

## Notes

- ソースコード（cli.ts、handlers.ts、validator.ts、generator.ts、manager.ts、test-manager.ts、undo.ts、types.ts）は一切変更しない
- 既存テストファイル（test-manager.bug-condition.test.ts、test-manager.preservation.test.ts）も変更不要
- 要件7（Cowork仮想環境でのCLI動作保証）は既存CLIが既に満たしており、新規実装は不要
