# Requirements Document

## Introduction

DNS自動登録ツールのテストモード安全性を強化する。現状、`add-device` コマンドと `encode-name` コマンドは本番モードでも常に UPSERT を使用しており、既存レコードを意図せず上書きするリスクがある。本機能では、本番時の重複チェックを統一適用し、運用安全性を向上させる。

## Glossary

- **CLI**: コマンドラインインターフェース。本ツールのエントリポイント（src/cli.ts）
- **Record_Manager**: Route53 APIを使用したDNSレコードの登録・削除・ロールバック・同期確認を担当するモジュール（src/manager.ts）
- **Test_Record_Manager**: テストレコードの一覧取得・一括削除を担当するモジュール（src/test-manager.ts）
- **Route53_Client**: AWS SDK v3 の Route53Client インスタンス
- **Test_Mode**: `--test` フラグで有効化されるモード。レコード名に `__dns_auto_test-` プレフィックスを付与し、UPSERT アクションを使用する
- **Production_Mode**: `--test` フラグなしで実行されるモード。既存レコードの保護が求められる
- **UPSERT**: Route53 API のアクション。レコードが存在しなければ作成し、存在すれば上書きする
- **CREATE**: Route53 API のアクション。レコードが存在しなければ作成し、存在すればエラーを返す
- **Test_Prefix**: テストモード時にレコード名に付与されるプレフィックス `__dns_auto_test-`
## Requirements

### Requirement 1: add-device コマンドの本番時重複チェック

**User Story:** As a オペレーター, I want add-device コマンドが本番モードで既存CNAMEレコードの重複を検出すること, so that 既存レコードの意図しない上書きを防止できる

#### Acceptance Criteria

1. WHEN add-device コマンドが Production_Mode で実行される, THE CLI SHALL Route53_Client を使用して対象CNAMEレコードの存在を確認する
2. WHEN 対象CNAMEレコードが既に存在する, THE CLI SHALL エラーメッセージ「このCNAMEレコードは既に登録されています。」を表示し、終了コード1で終了する
3. WHEN 対象CNAMEレコードが存在しない, THE CLI SHALL CREATE アクションでCNAMEレコードを登録する
4. WHILE Test_Mode が有効である, THE CLI SHALL 重複チェックをスキップし、UPSERT アクションでCNAMEレコードを登録する

### Requirement 2: encode-name コマンドの本番時重複チェック

**User Story:** As a オペレーター, I want encode-name コマンドが本番モードで既存TXTレコードの重複を検出すること, so that 既存の店舗名TXTレコードの意図しない上書きを防止できる

#### Acceptance Criteria

1. WHEN encode-name コマンドが Production_Mode で実行される, THE CLI SHALL Route53_Client を使用して対象TXTレコードの存在を確認する
2. WHEN 対象TXTレコードが既に存在する, THE CLI SHALL エラーメッセージ「このTXTレコードは既に登録されています。」を表示し、終了コード1で終了する
3. WHEN 対象TXTレコードが存在しない, THE CLI SHALL CREATE アクションでTXTレコードを登録する
4. WHILE Test_Mode が有効である, THE CLI SHALL 重複チェックをスキップし、UPSERT アクションでTXTレコードを登録する


