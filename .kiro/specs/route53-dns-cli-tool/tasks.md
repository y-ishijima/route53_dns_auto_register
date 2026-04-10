# Implementation Plan: Route53 DNS登録CLIツール リファクタリング

## Overview

既存ツール（route53-dns-auto-register）をClaude Code依存から脱却し、`@inquirer/prompts` による対話型CLIツールに変換する。既存ビジネスロジック6モジュール（config.ts, validator.ts, generator.ts, manager.ts, test-manager.ts, undo.ts, types.ts）は変更なしで維持し、新規・変更対象ファイルのみを実装する。

## Tasks

- [x] 1. package.json の変更とプロジェクト設定
  - [x] 1.1 package.json を更新する
    - `name` を `route53-dns-auto-register` から `dns-register` に変更
    - `version` を `1.0.0` から `2.0.0` に変更
    - `description` を更新
    - `bin` フィールド `{ "dns-register": "dist/cli.js" }` を追加
    - `dependencies` に `@inquirer/prompts` を追加
    - `devDependencies` に `fast-check` を追加
    - _Requirements: 7.12, 10.4, 10.6_
  - [x] 1.2 .gitignore を更新する
    - 現在の内容を維持しつつ、不足があれば追加
    - _Requirements: 8.2, 9.3_
  - [x] 1.3 CLAUDE.md を削除する
    - Claude Code依存の完全除去
    - _Requirements: 設計書「CLAUDE.md — 削除」_

- [x] 2. src/interactive.ts の新規作成（対話型プロンプトモジュール）
  - [x] 2.1 InteractiveInput インターフェースと promptRegisterInput 関数を実装する
    - `@inquirer/prompts` の `input`, `checkbox`, `confirm` をインポート
    - 店舗名入力（input型、validateShopName によるバリデーション）
    - 店舗コード入力（input型、validateShopCode によるバリデーション）
    - 先頭IPアドレス入力（input型、validateStartIp によるバリデーション）
    - 機器選択（checkbox型、config.aliases から日本語名称付き選択肢を生成、最低1つ選択必須）
    - 選択した各機器のIPアドレス入力（input型、順番に表示、空入力不可）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 7.1, 7.3, 7.4_
  - [x] 2.2 確認・再試行・undo・テスト削除の各プロンプト関数を実装する
    - `promptConfirmRegistration()`: 登録実行の確認（confirm型）
    - `promptRetryOnError()`: エラー発生時の再試行確認（confirm型）
    - `promptConfirmUndo()`: undo実行の確認（confirm型）
    - `promptConfirmDeleteTests()`: テストレコード一括削除の確認（confirm型）
    - _Requirements: 5.2, 5.9, 7.9, 6.7_

- [x] 3. src/cli.ts の変更（対話型/non-interactiveモード分岐）
  - [x] 3.1 shebang追加と対話型モードの分岐ロジックを実装する
    - ファイル先頭に `#!/usr/bin/env node` を追加
    - `register` コマンドで `--non-interactive` フラグの有無による分岐
    - `--non-interactive` なし → `interactive.ts` の対話型フローを呼び出し
    - `--non-interactive` あり → 既存の引数パース処理で実行
    - _Requirements: 7.2, 7.5, 7.12_
  - [x] 3.2 handleRegisterInteractive 関数を実装する
    - `interactive.ts` の `promptRegisterInput()` で入力収集
    - レコード生成、確認サマリー表示、`promptConfirmRegistration()` で確認
    - 重複チェック、レコード登録、同期確認、undo情報保存
    - エラー発生時は `promptRetryOnError()` で再試行/中断を選択
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_
  - [x] 3.3 undo・delete-tests コマンドに対話型確認を追加する
    - `handleUndo()` に `promptConfirmUndo()` を追加
    - `handleDeleteTests()` に `promptConfirmDeleteTests()` を追加
    - _Requirements: 7.8, 7.9, 7.10, 7.11, 6.7_
  - [x] 3.4 Ctrl+C ハンドリングを実装する
    - メインエントリポイントで `ExitPromptError` をキャッチ
    - 「処理を中断しました。レコードは登録されていません。」を表示して安全に終了
    - _Requirements: 3.8_

- [x] 4. Checkpoint - ビルド確認
  - Ensure all tests pass, ask the user if questions arise.
  - `tsc` でコンパイルエラーがないことを確認

- [x] 5. README.md の書き換え（IT部門向け）
  - [x] 5.1 README.md をIT部門向けに全面書き換えする
    - Claude Code関連の記述をすべて削除
    - 動作環境要件（Node.js v22.x, Git, AWS CLI v2）を冒頭に記載
    - セットアップ手順: `git clone` → `npm install` → `aws configure`
    - 使用方法: `npx dns-register register` 等の各コマンド実行例
    - エイリアス定義の追加・変更方法
    - テストモードの使用方法（`register --test`, `list-tests`, `delete-tests`）
    - non-interactiveモードの使用方法（スクリプト連携用）
    - トラブルシューティング（AWS認証エラー、ネットワークエラー等）
    - _Requirements: 9.1, 9.5, 9.7, 11.1, 11.2, 11.3, 11.4_

- [ ] 6. プロパティベーステスト（fast-check）の作成
  - [ ]* 6.1 Property 1: 店舗名バリデーションの正当性テストを作成する
    - `src/__tests__/validator.test.ts` に作成
    - 許可文字種のみで構成された1-30文字の文字列 → `valid: true`
    - 制御文字、HTMLタグ、31文字以上 → `valid: false` + 日本語エラーメッセージ
    - **Property 1: 店舗名バリデーションの正当性**
    - **Validates: Requirements 2.1, 2.7**
  - [ ]* 6.2 Property 2: 店舗コードバリデーションの正当性テストを作成する
    - `src/__tests__/validator.test.ts` に追加
    - `^s\d{1,6}$` にマッチ → `valid: true`、それ以外 → `valid: false`
    - **Property 2: 店舗コードバリデーションの正当性**
    - **Validates: Requirements 2.2**
  - [ ]* 6.3 Property 3: 先頭IPフォーマットバリデーションの正当性テストを作成する
    - `src/__tests__/validator.test.ts` に追加
    - `192.168.X.Y` 形式（X: 0-255, Y: 0-255）→ フォーマットエラーなし
    - **Property 3: 先頭IPアドレスフォーマットバリデーションの正当性**
    - **Validates: Requirements 2.3**
  - [ ]* 6.4 Property 4: サブネット境界バリデーションの正当性テストを作成する
    - `src/__tests__/validator.test.ts` に追加
    - `Y + 61 > 254` の場合のみサブネット境界エラー
    - **Property 4: サブネット境界バリデーションの正当性**
    - **Validates: Requirements 2.4**
  - [ ]* 6.5 Property 5: 機器IPアドレスバリデーションの正当性テストを作成する
    - `src/__tests__/validator.test.ts` に追加
    - 全機器IPが範囲内かつ重複なし → `valid: true`
    - **Property 5: 機器IPアドレスバリデーションの正当性**
    - **Validates: Requirements 2.5, 2.6**
  - [ ]* 6.6 Property 6: レコード生成の正当性テストを作成する
    - `src/__tests__/generator.test.ts` に作成
    - Aレコード62件、CNAMEエイリアス=機器数、menkata CNAME 62件、命名規則・参照整合性
    - **Property 6: レコード生成の正当性**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
  - [ ]* 6.7 Property 7: テストプレフィックスの適用テストを作成する
    - `src/__tests__/generator.test.ts` に追加
    - テストプレフィックス指定時、全レコード名が `__dns_auto_test-` で始まる
    - プレフィックスなしのレコード名と一切重複しない
    - **Property 7: テストプレフィックスの適用**
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 6.8 Property 8: 取り消し期限判定の正当性テストを作成する
    - `src/__tests__/undo.test.ts` に作成
    - 経過時間が30分以内 → `true`、30分超過 → `false`
    - **Property 8: 取り消し期限判定の正当性**
    - **Validates: Requirements 7.8**

- [ ] 7. ユニットテストの作成
  - [ ]* 7.1 interactive.ts のユニットテストを作成する
    - `src/__tests__/interactive.test.ts` に作成
    - `@inquirer/prompts` をモックして各プロンプト関数のフローを検証
    - プロンプト順序の検証（店舗名→店舗コード→先頭IP→機器選択→機器IP）
    - バリデーションエラー時の再入力フロー
    - _Requirements: 7.3, 7.4_
  - [ ]* 7.2 cli.ts のユニットテストを作成する
    - `src/__tests__/cli.test.ts` に作成
    - コマンドルーティング（register, undo, list-tests, delete-tests）
    - `--non-interactive` フラグによるモード分岐
    - `--test` フラグの処理
    - Ctrl+C（ExitPromptError）ハンドリング
    - AWS認証エラー判定
    - _Requirements: 7.2, 7.5, 3.8, 8.3_

- [x] 8. Final checkpoint - 全テスト実行と最終確認
  - Ensure all tests pass, ask the user if questions arise.
  - `npx vitest --run` で全テストがパスすることを確認
  - `tsc` でコンパイルエラーがないことを確認

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 既存ビジネスロジック（config.ts, validator.ts, generator.ts, manager.ts, test-manager.ts, undo.ts, types.ts）は変更なし
- 各タスクは設計書の対応セクションを参照して実装すること
- プロパティベーステストは `fast-check` を使用し、最低100回のイテレーションで実行
- テストファイルのタグ形式: `Feature: route53-dns-cli-tool, Property {number}: {property_text}`
