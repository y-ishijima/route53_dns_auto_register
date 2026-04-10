# Implementation Plan: test-mode-safety

## Overview

`add-device` と `encode-name` コマンドに `create-records` と同じ「本番時 CREATE + 重複チェック / テスト時 UPSERT」パターンを適用する。RecordManager に重複チェックメソッドを追加し、CLI ハンドラを修正する。

## Tasks

- [x] 1. RecordManager に重複チェックメソッドを追加
  - [x] 1.1 `checkDuplicateCname` メソッドを実装
    - `src/manager.ts` の `RecordManager` クラスに `checkDuplicateCname(recordName: string, zoneId: string): Promise<boolean>` を追加
    - `ListResourceRecordSetsCommand` で `StartRecordName` を指定し、対象レコード名に絞り込む
    - レスポンスの `ResourceRecordSets` から正規化済み名前の完全一致 + Type === 'CNAME' で判定
    - Route53 が返す末尾ドット付き FQDN を正規化して比較する
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 `checkDuplicateTxt` メソッドを実装
    - `src/manager.ts` の `RecordManager` クラスに `checkDuplicateTxt(recordName: string, zoneId: string): Promise<boolean>` を追加
    - `checkDuplicateCname` と同様のアプローチで Type === 'TXT' で判定
    - _Requirements: 2.1_

  - [ ]* 1.3 Property 1: 重複チェックの正検出テスト
    - **Property 1: 重複チェックの正検出（Duplicate detection correctness）**
    - fast-check でランダムなレコード名と ResourceRecordSets 配列を生成
    - `checkDuplicateCname` / `checkDuplicateTxt` が、セット内に正規化名一致 + タイプ一致のレコードが存在する場合のみ `true` を返すことを検証
    - 末尾ドットの有無による正規化を含む
    - Route53Client はモックを使用
    - 最低100イテレーション
    - **Validates: Requirements 1.2, 2.2**

  - [ ]* 1.4 `checkDuplicateCname` / `checkDuplicateTxt` のユニットテスト
    - レコード存在時に `true` を返すケース
    - レコード非存在時に `false` を返すケース
    - 末尾ドット付き/なしの正規化テスト
    - Route53Client はモックを使用
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. `handleAddDevice` に本番時重複チェックと CREATE/UPSERT 切り替えを適用
  - [x] 2.1 `handleAddDevice` を修正
    - `src/cli.ts` の `handleAddDevice` 関数を修正
    - 本番モード時: `RecordManager` をインスタンス化し、`checkDuplicateCname` で重複チェック
    - 重複検出時: `console.error('このCNAMEレコードは既に登録されています。')` を表示し `process.exit(1)`
    - 本番モード時の Action を `'CREATE'` に変更
    - テストモード時: 重複チェックをスキップし、`'UPSERT'` を使用（既存動作を維持）
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.2 `handleAddDevice` のユニットテスト
    - 本番モード + 重複あり: エラーメッセージ表示、exit 1
    - 本番モード + 重複なし: CREATE アクションで登録
    - テストモード: UPSERT、重複チェックスキップ
    - Route53Client と process.exit はモック化
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. `handleEncodeName` に本番時重複チェックと CREATE/UPSERT 切り替えを適用
  - [x] 4.1 `handleEncodeName` を修正
    - `src/cli.ts` の `handleEncodeName` 関数を修正
    - 本番モード時: `RecordManager` をインスタンス化し、`checkDuplicateTxt` で重複チェック
    - 重複検出時: `console.error('このTXTレコードは既に登録されています。')` を表示し `process.exit(1)`
    - 本番モード時の Action を `'CREATE'` に変更
    - テストモード時: 重複チェックをスキップし、`'UPSERT'` を使用（既存動作を維持）
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 4.2 `handleEncodeName` のユニットテスト
    - 本番モード + 重複あり: エラーメッセージ表示、exit 1
    - 本番モード + 重複なし: CREATE アクションで登録
    - テストモード: UPSERT、重複チェックスキップ
    - Route53Client と process.exit はモック化
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5. モード別アクション排他性の Property テスト
  - [ ]* 5.1 Property 2: モード別アクション選択の排他性テスト
    - **Property 2: モード別アクション選択の排他性（Mode-action exclusivity）**
    - fast-check で testMode (boolean)、ランダムな店舗コード・デバイス名・IP を生成
    - `testMode === true` → Action === 'UPSERT' かつ重複チェック未実行を検証
    - `testMode === false` → Action === 'CREATE' かつ重複チェック実行を検証
    - add-device と encode-name の両コマンドで検証
    - Route53Client はモックを使用し、送信された Action を検査
    - 最低100イテレーション
    - **Validates: Requirements 1.3, 1.4, 2.3, 2.4**

- [x] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- タスク `*` 付きはオプション（テスト関連）でスキップ可能
- 各タスクは requirements.md の具体的な要件番号を参照
- Property テストは design.md の Correctness Properties セクションに基づく
- テストフレームワーク: vitest + fast-check（既に devDependencies に設定済み）
- Route53Client のモック化により、AWS API への実際の呼び出しなしでテスト可能
