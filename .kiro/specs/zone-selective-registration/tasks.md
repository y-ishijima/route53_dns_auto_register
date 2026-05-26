# Implementation Plan: Zone Selective Registration

## Overview

`create-records` コマンドに `--zone` オプションを追加し、yamaokaya.net / internal.menkata.me のいずれか一方のゾーンのみにレコードを登録できるようにする。既存の型定義・CLI・ハンドラ・マネージャを段階的に拡張し、プロパティベーステストで正確性を検証する。

## Tasks

- [x] 1. 型定義とゾーンフィルタリング関数の追加
  - [x] 1.1 types.ts に ZoneSelection 型を追加し、CreateRecordsParams / EncodeNameParams / AddDeviceParams に zone? プロパティを追加する
    - `export type ZoneSelection = 'yamaokaya' | 'menkata';` を追加
    - 各 Params インターフェースに `zone?: ZoneSelection` を追加
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 handlers.ts に filterRecordsByZone 関数を追加する
    - zone 未指定時は元の GeneratedRecords をそのまま返す
    - zone='yamaokaya' 時は menkataCnameRecords を空配列にする
    - zone='menkata' 時は yamaokayaARecords と yamaokayaCnameAliases を空配列にする
    - _Requirements: 1.2, 1.3, 3.2, 3.3_

  - [ ]* 1.3 filterRecordsByZone のプロパティテスト（zone-filter.test.ts）を作成する
    - **Property 1: ゾーンフィルタリングの正確性**
    - **Property 2: デフォルト動作の保全**
    - **Validates: Requirements 1.1, 1.2, 1.3, 3.2, 3.3, 4.5**

- [x] 2. CLI層のゾーンオプション追加
  - [x] 2.1 cli.ts に validateZoneOption 関数を追加し、各コマンドハンドラで --zone オプションをパース・バリデーションする
    - 不正値の場合は `--zone の値が正しくありません: "{value}"。有効な値: yamaokaya, menkata` を stderr に出力し exit(1)
    - cliCreateRecords / cliEncodeName / cliAddDevice で zone を取得しハンドラに渡す
    - _Requirements: 1.4, 1.5, 2.5, 7.4_

  - [ ]* 2.2 validateZoneOption のプロパティテスト（zone-validation.test.ts）を作成する
    - **Property 3: 不正ゾーン値の拒否**
    - **Validates: Requirements 1.4, 2.5, 7.4**

- [x] 3. Checkpoint - 型定義とCLI層の確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. manager.ts のゾーン対応
  - [x] 4.1 manager.ts に checkDuplicateMenkataCname メソッドを追加する
    - menkata_zone 内の同一店舗コードの CNAME レコード存在を確認する
    - ListResourceRecordSetsCommand で `ip192-168-` を含む店舗コード配下のレコードを検索
    - _Requirements: 2.1_

  - [x] 4.2 manager.ts の registerRecords メソッドに zone パラメータを追加し、ゾーン選択に応じた登録処理を実装する
    - zone='yamaokaya' 時: yamaokaya_zone のみに登録、menkata 登録をスキップ
    - zone='menkata' 時: menkata_zone のみに登録、yamaokaya 登録をスキップ
    - zone 未指定時: 従来どおり両ゾーン登録（ロールバック動作維持）
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.3 manager.ts の deleteRecords メソッドを修正し、空配列のゾーンに対して DELETE リクエストを送信しないようにする
    - yamaokayaARecords + yamaokayaCnameAliases が空の場合は yamaokaya_zone への DELETE をスキップ
    - menkataCnameRecords が空の場合は menkata_zone への DELETE をスキップ
    - _Requirements: 4.3_

- [x] 5. handlers.ts のゾーン対応
  - [x] 5.1 handleCreateRecords を修正し、zone パラメータに応じた重複チェック・フィルタリング・登録・undo保存を実装する
    - zone='menkata' 時: checkDuplicateMenkataCname で重複チェック
    - zone='yamaokaya' または未指定時: checkDuplicateShopCode で重複チェック（従来動作）
    - filterRecordsByZone でレコードをフィルタリング後に registerRecords を呼び出す
    - undo情報保存時はフィルタリング後の GeneratedRecords を使用
    - テストモード時のテストレコード情報保存もフィルタリング後のレコードのみ
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 3.3, 4.1, 4.2, 4.5, 6.1, 6.2_

  - [x] 5.2 handleEncodeName を修正し、zone='menkata' 指定時にエラーを返すようにする
    - encode-name は yamaokaya.net の TXT レコードのみを扱うため、menkata 指定は不正
    - エラーメッセージ: `encode-name コマンドは yamaokaya ゾーンのみに対応しています。`
    - _Requirements: 1.5_

  - [x] 5.3 handleAddDevice を修正し、zone='menkata' 指定時にエラーを返すようにする
    - add-device は yamaokaya.net の CNAME レコードのみを扱うため、menkata 指定は不正
    - エラーメッセージ: `add-device コマンドは yamaokaya ゾーンのみに対応しています。`
    - _Requirements: 1.5_

- [x] 6. Checkpoint - ハンドラとマネージャの確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. プロパティベーステスト（CNAME参照先・undo・重複チェック・テストモード）
  - [ ]* 7.1 zone-cname-reference.test.ts を作成する
    - **Property 4: menkata CNAMEレコードの参照先正確性**
    - **Validates: Requirements 3.1**

  - [ ]* 7.2 zone-undo.test.ts を作成する
    - **Property 5: undo情報のゾーン選択反映**
    - **Property 6: undo削除の空配列スキップ**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5**

  - [ ]* 7.3 zone-duplicate-check.test.ts を作成する
    - **Property 7: 重複検出時の登録中止**
    - **Validates: Requirements 2.3**

  - [ ]* 7.4 zone-test-mode.test.ts を作成する
    - **Property 8: テストモードとゾーン選択の組み合わせ**
    - **Validates: Requirements 6.1, 6.2**

- [ ] 8. ユニットテスト（統合テスト）
  - [ ]* 8.1 zone-integration.test.ts を作成する
    - ロールバック動作の維持テスト（zone未指定時のmenkata失敗→yamaokayaロールバック）
    - zone='yamaokaya' 時のロールバック不要確認
    - zone='menkata' 時のロールバック不要確認
    - 出力メッセージフォーマットの検証
    - テストモードとの互換性テスト
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.3, 6.4, 7.1, 7.2, 7.3, 7.5_

- [x] 9. CLI出力メッセージの調整
  - [x] 9.1 cli.ts の cliCreateRecords を修正し、ゾーン選択時の出力メッセージを適切に表示する
    - zone='yamaokaya' 時: yamaokaya.net の Change ID とレコード数のみ表示
    - zone='menkata' 時: internal.menkata.me の Change ID とレコード数のみ表示
    - zone 未指定時: 両ゾーンの Change ID と合計レコード数を表示（従来動作）
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 10. Final checkpoint - 全テスト通過確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- 既存の UndoEntry 型は変更せず、空配列で未使用ゾーンを表現する設計方針に従う
- generator.ts は変更不要（常に全レコードを生成し、handlers.ts でフィルタリングする）

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "9.1"] },
    { "id": 6, "tasks": ["8.1"] }
  ]
}
```
