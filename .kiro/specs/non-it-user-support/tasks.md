# Implementation Plan: 非IT部門ユーザ向け対応

## Overview

既存のRoute53 DNS登録CLIツール（dns-register）の対話型モードを非IT部門の一般ユーザにも使いやすくする。改善対象は4領域: (1) 対話型プロンプトのUX改善（ウェルカムメッセージ、ステップ番号、入力例、エラー平易化、進捗表示、確認画面）、(2) Claude Code / Cowork Skills による対話型フロー、(3) READMEの再構成、(4) セットアップスクリプトの改善。既存のビジネスロジック（validator.ts、generator.ts、manager.ts、test-manager.ts、undo.ts、config.ts）は一切変更しない。

## Tasks

- [x] 1. src/interactive.ts のUX改善（新規関数の追加）
  - [x] 1.1 displayWelcome 関数を実装する
    - ツールの目的（「店舗ネットワーク設定 登録ツール」）と入力ステップの概要（全5ステップ）を表示
    - `testMode` 引数が `true` の場合、「テストモードで実行中です。本番環境には影響しません。」を追加表示
    - エクスポートする
    - _Requirements: 1.1, 1.3_
  - [x] 1.2 promptRegisterInput のプロンプトメッセージを改善する
    - 各プロンプトにステップ番号を付与（`[ステップ 1/5]`〜`[ステップ 5/5]`）
    - 店舗名: 入力例「山岡家 札幌店」を表示
    - 店舗コード: 入力例「s1105」と補足説明「店舗コードは店舗一覧表で確認できます」を表示
    - 先頭IPアドレス: 入力例「192.168.94.65」と補足説明「IPアドレスはネットワーク設計書で確認できます」を表示
    - 機器選択: 操作方法「スペースキーで選択/解除、Enterキーで確定」を表示
    - 各機器IP: 入力例「192.168.94.66」を表示
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.3 simplifyErrorMessage 関数を実装する
    - バリデータの技術的エラーメッセージを一般ユーザ向けに変換する
    - サブネット境界エラー → 「このIPアドレスでは登録に必要な数のレコードを作成できません。ネットワーク設計書を確認し、別のIPアドレスを入力してください。」
    - 範囲外エラー → 「このIPアドレスは、この店舗に割り当てられた範囲の外です。ネットワーク設計書を確認してください。」
    - IPフォーマットエラー → 「IPアドレスが正しくありません。例: 192.168.94.65 の形式で入力してください。」
    - エクスポートする（テスト可能にするため）
    - 各プロンプトの `validate` コールバック内で `simplifyErrorMessage` を使用する
    - _Requirements: 2.6, 3.1, 3.2, 3.3_
  - [x] 1.4 displayUserFriendlyConfirmation 関数を実装する
    - 店舗名、店舗コード、先頭IPアドレス、選択した機器一覧（日本語名称とIPアドレス）を平易な形式で表示
    - Aレコード件数・CNAME件数等の技術的詳細は表示しない
    - 「上記の内容で登録します。よろしいですか？」の確認メッセージを表示
    - エクスポートする
    - _Requirements: 5.1, 5.2_
  - [x] 1.5 displayRegistrationProgress 関数を実装する
    - ステップ番号付きの進捗メッセージを表示（例: 「[1/3] yamaokaya.net にレコードを登録中...」）
    - エクスポートする
    - _Requirements: 4.1_
  - [x] 1.6 displayRegistrationComplete 関数を実装する
    - 「登録が完了しました。{店舗名}（{店舗コード}）のネットワーク設定が反映されました。」を表示
    - Change IDやレコード件数等の技術的詳細は表示しない
    - 「登録を間違えた場合は、30分以内に `npx dns-register undo` を実行してください。」の取り消し案内を表示
    - エクスポートする
    - _Requirements: 4.2, 4.3_

- [x] 2. src/cli.ts のUX改善（モード分岐とメッセージ平易化）
  - [x] 2.1 TTY自動検出ロジックを追加する
    - `register` コマンドで `--non-interactive` なし + `process.stdin.isTTY` チェック
    - TTY接続あり → 対話型モード（既存の `handleRegisterInteractive`）
    - TTY未接続 → ガイドメッセージ「対話型モードが使用できない環境です。以下の方法で実行してください:\n  - 一括指定: register --non-interactive --shop-name ...」を表示して終了
    - _Requirements: 13.1, 13.2_
  - [x] 2.2 handleRegisterInteractive にUX改善を反映する
    - 冒頭で `displayWelcome(testMode)` を呼び出す
    - `displayConfirmation` の代わりに `displayUserFriendlyConfirmation` を使用する
    - 登録処理中に `displayRegistrationProgress` で進捗を表示する（yamaokaya.net登録、menkata登録、反映確認の3ステップ）
    - 登録完了時に `displayRegistrationComplete` で結果を表示する（既存の技術的な結果表示を置き換え）
    - 確認拒否時に「登録を中止しました。最初からやり直す場合は、もう一度コマンドを実行してください。」を表示
    - _Requirements: 1.1, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_
  - [x] 2.3 対話型モードのエラーメッセージを平易化する
    - AWS認証エラー: 「ツールの設定に問題があります。IT部門に連絡してください。」（技術的詳細は非表示）
    - Route53 APIエラー: 「登録処理中にエラーが発生しました。IT部門に連絡してください。」
    - ネットワーク接続エラー: 「インターネットに接続できません。ネットワーク接続を確認してから、もう一度お試しください。」
    - non-interactiveモードのエラーメッセージは既存のまま維持
    - _Requirements: 3.4, 3.5, 3.6, 10.3_
  - [x] 2.4 undo/delete-tests のメッセージを一般ユーザ向けに平易化する
    - handleUndo: 取り消し対象を「{店舗名}（{店舗コード}）の登録を取り消します。」と平易に表示（レコード件数・Change ID非表示）
    - handleUndo: 期限超過時「登録から30分以上経過しているため、取り消しできません。IT部門に連絡してください。」
    - handleDeleteTests: 「テスト用のデータを削除します。本番環境には影響しません。」の確認メッセージ
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 2.5 Ctrl+Cメッセージを平易化する
    - 「操作を中止しました。登録は行われていません。」に変更
    - _Requirements: 9.4_

- [x] 3. Checkpoint - ビルド確認
  - `tsc` でコンパイルエラーがないことを確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Claude Code / Cowork Skills ファイルの作成
  - [x] 4.1 .claude/skills/register/SKILL.md を作成する
    - レコード登録フローの Skills 定義（YAML frontmatter + Markdown）
    - ユーザへの質問手順（店舗名→店舗コード→先頭IP→機器選択→各機器IP）
    - 各質問に入力例と補足説明を含める
    - バリデーションルール（店舗名、店舗コード、IP形式、範囲チェック）
    - 確認サマリー表示と `--non-interactive` コマンドの組み立て・実行手順
    - 結果の伝え方（成功時・失敗時・取り消し案内）
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [x] 4.2 .claude/skills/undo/SKILL.md を作成する
    - 登録取り消しフローの Skills 定義（YAML frontmatter + Markdown）
    - `npx dns-register undo` の実行と結果の平易な伝達
    - _Requirements: 11.7_
  - [x] 4.3 .claude/skills/register-test/SKILL.md を作成する
    - テストモード登録フローの Skills 定義（YAML frontmatter + Markdown）
    - `--test` フラグ付きコマンドの組み立て・実行
    - テストレコードの確認・削除コマンドの案内
    - _Requirements: 11.8_

- [x] 5. CLAUDE.md の作成
  - [x] 5.1 CLAUDE.md をプロジェクトルートに作成する
    - ツール概要、コマンド一覧（register, undo, list-tests, delete-tests）
    - non-interactiveモードの引数と使用例
    - バリデーションルール（店舗名、店舗コード、IP形式）
    - ユーザ対応ガイドライン（自然な依頼への対応方法）
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 6. README.md の再構成
  - [x] 6.1 README.md を一般ユーザ向け + IT部門向けに書き換える
    - 冒頭に「このツールについて」（ツールの目的を平易に説明）
    - 「はじめかた」セクション（OS別セットアップ手順、AWS認証設定の案内）
    - 「使いかた」セクション（対話型モードのステップバイステップ手順、入力例付き）
    - 「登録の取り消し」セクション（undoコマンドの案内）
    - 「困ったときは」セクション（一般ユーザ向けFAQ、技術用語なし）
    - 専門用語（DNS、Route53、CNAME、Aレコード等）を使用しない。やむを得ない場合は括弧書きで説明
    - 末尾に「IT部門向け情報」セクション（non-interactiveモード、config.json編集、エイリアス定義、IAMポリシー、レコード命名規則、トラブルシューティング技術詳細）
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.3, 10.5_

- [x] 7. セットアップスクリプトの改善
  - [x] 7.1 setup.bat を改善する
    - Node.js未インストール時: `start https://nodejs.org/` でブラウザを自動起動
    - Git未インストール時: `start https://git-scm.com/` でブラウザを自動起動
    - AWS CLI未インストール時: 「AWS CLIがインストールされていません。IT部門に連絡してください。」メッセージ表示
    - セットアップ完了後: AWS認証設定の案内を追加（IT部門から受け取った認証情報の入力手順）
    - エラー発生時: 「セットアップ中にエラーが発生しました。IT部門に連絡してください。」メッセージ
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2_
  - [x] 7.2 setup.sh を改善する
    - Node.js未インストール時: `open`（macOS）/ `xdg-open`（Linux）でブラウザを自動起動
    - Git未インストール時: 同様にブラウザを自動起動
    - AWS CLI未インストール時: 「IT部門に連絡してください」メッセージ表示
    - セットアップ完了後: AWS認証設定の案内を追加
    - setup.bat と同等の機能を提供
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2_

- [x] 8. Checkpoint - ビルド確認
  - `tsc` でコンパイルエラーがないことを確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. プロパティベーステスト（fast-check）の作成
  - [ ]* 9.1 Property 1: エラーメッセージ平易化の技術用語排除テストを作成する
    - `src/__tests__/interactive.test.ts` に作成
    - ランダムなバリデーションエラーメッセージ文字列を生成し、`simplifyErrorMessage` の出力に禁止用語（「サブネット」「オクテット」「CNAME」「Aレコード」「TTL」「ゾーン」「ChangeBatch」）が含まれないことを検証
    - ジェネレータは既存バリデータが返しうるエラーメッセージのパターンと任意の文字列を組み合わせる
    - **Property 1: エラーメッセージ平易化の技術用語排除**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [ ]* 9.2 Property 2: 確認画面の情報完全性と技術詳細排除テストを作成する
    - `src/__tests__/interactive.test.ts` に追加
    - ランダムな有効入力値（店舗名、店舗コード、IP、機器マップ）を生成し、`displayUserFriendlyConfirmation` の出力をキャプチャ
    - 必要情報（店舗名、店舗コード、先頭IP、全機器の日本語名称とIP）が含まれることを検証
    - 技術的詳細（「Aレコード」「CNAME」「件数」「Change ID」）が含まれないことを検証
    - **Property 2: 確認画面の情報完全性と技術詳細排除**
    - **Validates: Requirements 5.1, 5.2, 4.2**

- [ ] 10. ユニットテストの作成
  - [ ]* 10.1 interactive.ts のユニットテストを作成する
    - `src/__tests__/interactive.test.ts` に作成
    - `displayWelcome(false)` の出力にツール目的とステップ概要が含まれること
    - `displayWelcome(true)` の出力にテストモード注記が含まれること
    - 各プロンプトメッセージにステップ番号（`[ステップ X/5]`）が含まれること
    - 各プロンプトメッセージに入力例が含まれること
    - `displayRegistrationComplete` の出力にundo案内が含まれること
    - `displayRegistrationProgress` の出力にステップ番号が含まれること
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3_
  - [ ]* 10.2 cli.ts のユニットテストを作成する
    - `src/__tests__/cli.test.ts` に作成
    - `process.stdin.isTTY = true` 時の対話型モード選択
    - `process.stdin.isTTY = false` 時のガイドメッセージ表示
    - `--non-interactive` フラグでのnon-interactiveモード選択（既存動作維持の回帰テスト）
    - 対話型モードでのAWS認証エラー平易化
    - 対話型モードでのCtrl+Cメッセージ平易化
    - _Requirements: 13.1, 13.2, 10.1, 10.3, 3.4, 9.4_
  - [ ]* 10.3 Claude Code / Cowork Skills ファイルの存在・内容検証テストを作成する
    - `src/__tests__/skills.test.ts` に作成
    - `.claude/skills/register/SKILL.md` が存在すること
    - `.claude/skills/undo/SKILL.md` が存在すること
    - `.claude/skills/register-test/SKILL.md` が存在すること
    - `CLAUDE.md` が存在すること
    - `register/SKILL.md` に必須セクション（手順、バリデーションルール、確認と実行）が含まれること
    - `CLAUDE.md` にコマンド一覧とバリデーションルールが含まれること
    - _Requirements: 11.1, 11.7, 11.8, 12.1, 12.2, 12.4_

- [x] 11. Final checkpoint - 全テスト実行と最終確認
  - `npx vitest --run` で全テストがパスすることを確認
  - `tsc` でコンパイルエラーがないことを確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 既存ビジネスロジック（config.ts、validator.ts、generator.ts、manager.ts、test-manager.ts、undo.ts、types.ts）は変更なし
- non-interactiveモードの動作は変更しない（IT部門・CI/CD向けのまま維持）
- 各タスクは設計書の対応セクションを参照して実装すること
- プロパティベーステストは `fast-check` を使用し、最低100回のイテレーションで実行
- テストファイルのタグ形式: `Feature: non-it-user-support, Property {number}: {property_text}`
- Claude Code / Cowork Skills は SKILL.md ファイル（YAML frontmatter + Markdown）であり、TypeScriptコードの追加は不要
