# 実装計画: コマンド細分化リファクタリング

## 概要

既存の `register` コマンド（対話型 + non-interactive）を廃止し、`encode-name`、`create-records`、`add-device` の3つの non-interactive コマンドに分解する。既存ビジネスロジック（validator.ts, generator.ts, manager.ts, config.ts, types.ts）は変更せず再利用し、interactive.ts を削除する。undo / delete-tests も非対話型に変更する。

## タスク

- [x] 1. interactive.ts の削除と cli.ts の import 整理
  - [x] 1.1 src/interactive.ts を削除する
    - interactive.ts の全関数（promptRegisterInput, displayWelcome, simplifyErrorMessage, displayUserFriendlyConfirmation, displayRegistrationProgress, displayRegistrationComplete, promptConfirmRegistration, promptRetryOnError, promptConfirmUndo, promptConfirmDeleteTests）と InteractiveInput インターフェースを削除
    - _要件: 1.2, 1.4_
  - [x] 1.2 cli.ts から interactive.ts の import 文と関連コードを削除する
    - `import { promptRegisterInput, ... } from './interactive'` を削除
    - `handleRegisterInteractive` 関数を削除
    - `handleRegisterNonInteractive` 関数を削除
    - `displayConfirmation` 関数を削除
    - `parseDevices` 関数を削除（新コマンドでは不要）
    - `isInteractiveMode` 変数と対話型モード分岐を削除
    - _要件: 1.1, 1.2, 1.3_

- [x] 2. register コマンドの廃止メッセージ実装
  - [x] 2.1 cli.ts に `handleRegisterDeprecated` 関数を追加する
    - 廃止メッセージと新コマンド体系の案内（encode-name, create-records, add-device）を表示して終了
    - main() の switch 文で `case 'register'` を `handleRegisterDeprecated()` に変更
    - _要件: 1.1_
  - [ ]* 2.2 register 廃止メッセージのユニットテストを作成する
    - src/__tests__/deprecated.test.ts を作成
    - handleRegisterDeprecated が廃止メッセージを出力することを検証
    - _要件: 1.1_

- [x] 3. encode-name コマンドの実装
  - [x] 3.1 cli.ts に `handleEncodeName` 関数を実装する
    - 必須引数チェック（--shop-name, --shop-code）
    - validateShopName() で店舗名検証
    - validateShopCode() で店舗コード検証
    - `Buffer.from(shopName, 'utf-8').toString('base64')` で Base64 エンコード
    - TXT レコード名: `{testPrefix}shopname.{shopCode}.yamaokaya.net`
    - Route53 API で TXT レコード登録（テストモード: UPSERT、本番: CREATE）
    - TXT レコードの値は RFC 準拠のダブルクォート囲み `"値"` 形式
    - 登録した TXT レコード名と Base64 値を標準出力に表示
    - main() の switch 文に `case 'encode-name'` を追加
    - _要件: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 5.1, 5.2, 6.1, 6.4, 8.1, 8.2, 8.3, 8.4_
  - [ ]* 3.2 encode-name コマンドのユニットテストを作成する
    - src/__tests__/encode-name.test.ts を作成
    - 成功時の TXT レコード名と Base64 値の出力検証
    - 必須引数不足時のエラーメッセージ検証
    - --test 指定時のプレフィックス付きレコード名検証
    - _要件: 2.1, 2.4, 2.6, 2.8_
  - [ ]* 3.3 Base64 ラウンドトリップのプロパティテストを作成する
    - **Property 1: Base64 エンコードのラウンドトリップ**
    - **検証対象: 要件 2.1**
    - src/__tests__/properties.test.ts に追加
    - fast-check で有効な店舗名（許可文字種、1-30文字）を生成し、Base64 エンコード→デコードの一致を検証

- [x] 4. チェックポイント - ビルド確認
  - ビルドが通ること（`npm run build`）を確認し、ユーザーに質問があれば確認する。

- [x] 5. create-records コマンドの実装
  - [x] 5.1 cli.ts に `handleCreateRecords` 関数を実装する
    - 必須引数チェック（--shop-code, --start-ip）
    - validateShopCode() で店舗コード検証
    - validateStartIp() で先頭IP検証
    - `generateRecords(shopCode, startIp, {}, config, testPrefix)` で A レコード 62件 + menkata CNAME 62件を生成（devices は空オブジェクト）
    - 重複チェック（テストモード以外）: `manager.checkDuplicateShopCode()`
    - `manager.registerRecords()` で登録（yamaokaya.net → menkata の順、ロールバック付き）
    - `manager.waitForSync()` で同期確認
    - 登録レコード数と Change ID を標準出力に表示
    - main() の switch 文に `case 'create-records'` を追加
    - _要件: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4_
  - [ ]* 5.2 create-records コマンドのユニットテストを作成する
    - src/__tests__/create-records.test.ts を作成
    - 成功時のレコード数と Change ID の出力検証
    - 必須引数不足時のエラーメッセージ検証
    - --test 指定時のプレフィックス付きレコード名検証
    - 重複チェックのエラー検証
    - _要件: 3.1, 3.2, 3.9, 3.11, 3.12_

- [x] 6. add-device コマンドの実装
  - [x] 6.1 cli.ts に `handleAddDevice` 関数を実装する
    - 必須引数チェック（--shop-code, --device, --ip）
    - validateShopCode() で店舗コード検証
    - 機器タイプ検証: `config.aliases.some(a => a.type === device)`
    - IP アドレス検証: `192.168.x.x` 形式チェック（正規表現）
    - A レコード名算出: IP の第3・第4オクテットを3桁ゼロパディングし `{testPrefix}ip192-168-{oct3}-{oct4}.{shopCode}.yamaokaya.net`
    - CNAME レコード名: `{testPrefix}{device}.{shopCode}.yamaokaya.net`
    - Route53 API で CNAME 登録（常に UPSERT）
    - 登録した CNAME レコード名とエイリアス先を標準出力に表示
    - main() の switch 文に `case 'add-device'` を追加
    - _要件: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 5.1, 5.2, 6.1, 6.4, 8.1, 8.2, 8.3, 8.4_
  - [ ]* 6.2 add-device コマンドのユニットテストを作成する
    - src/__tests__/add-device.test.ts を作成
    - 成功時の CNAME レコード名とエイリアス先の出力検証
    - 必須引数不足時のエラーメッセージ検証
    - 未定義の機器タイプでのエラー検証
    - --test 指定時のプレフィックス付きレコード名検証
    - _要件: 4.1, 4.3, 4.7, 4.9_

- [x] 7. undo / delete-tests の非対話型化
  - [x] 7.1 handleUndo を非対話型に変更する
    - `promptConfirmUndo()` の呼び出しを削除
    - `--yes` フラグの処理を削除（常に即実行）
    - `skipConfirm` 変数を削除
    - _要件: 5.3_
  - [x] 7.2 handleDeleteTests を非対話型に変更する
    - `promptConfirmDeleteTests()` の呼び出しを削除
    - `--yes` フラグの処理を削除（常に即実行）
    - `skipConfirm` 変数を削除
    - _要件: 5.3_

- [x] 8. main() 関数のコマンドルーティング更新とエラーハンドリング統一
  - [x] 8.1 main() の switch 文を新コマンド体系に書き換える
    - encode-name, create-records, add-device, register（廃止）, undo, list-tests, delete-tests
    - default ケースのエラーメッセージに新コマンド一覧を表示
    - 対話型モード分岐（isInteractiveMode）を削除
    - catch ブロックを non-interactive 方式に統一（技術的メッセージをそのまま表示）
    - _要件: 5.4, 8.1, 8.2, 8.3, 8.4_

- [x] 9. チェックポイント - ビルドとテスト確認
  - ビルドが通ること（`npm run build`）を確認し、ユーザーに質問があれば確認する。

- [ ] 10. プロパティベーステストの作成
  - [ ]* 10.1 店舗名バリデーションのプロパティテストを作成する
    - **Property 2: 店舗名バリデーションの正確性**
    - **検証対象: 要件 2.2, 3.4, 4.2**
    - src/__tests__/properties.test.ts に追加
    - fast-check で有効/無効な文字列を生成し、validateShopName の判定を検証
  - [ ]* 10.2 店舗コードバリデーションのプロパティテストを作成する
    - **Property 3: 店舗コードバリデーションの正確性**
    - **検証対象: 要件 2.3, 3.4, 4.2**
    - src/__tests__/properties.test.ts に追加
    - fast-check で有効/無効な文字列を生成し、validateShopCode の判定を検証
  - [ ]* 10.3 レコード生成の不変量プロパティテストを作成する
    - **Property 4: レコード生成の不変量**
    - **検証対象: 要件 3.1, 3.2**
    - src/__tests__/properties.test.ts に追加
    - fast-check で有効な店舗コード + 有効な先頭IPを生成し、generateRecords が常に A レコード 62件 + menkata CNAME 62件を返すことを検証
  - [ ]* 10.4 A レコード名算出の一貫性プロパティテストを作成する
    - **Property 5: IP アドレスから A レコード名算出の一貫性**
    - **検証対象: 要件 4.1, 4.10**
    - src/__tests__/properties.test.ts に追加
    - fast-check で有効な店舗コード + 有効な IPを生成し、add-device の算出ロジックと generateRecords の A レコード名が一致することを検証
  - [ ]* 10.5 IP アドレスフォーマット検証のプロパティテストを作成する
    - **Property 6: IP アドレスフォーマット検証の正確性**
    - **検証対象: 要件 4.4**
    - src/__tests__/properties.test.ts に追加
    - fast-check で任意の文字列を生成し、192.168.{0-255}.{0-255} 形式の判定を検証

- [x] 11. ドキュメント更新 - CLAUDE.md
  - [x] 11.1 CLAUDE.md を新コマンド体系に更新する
    - 新コマンド一覧（encode-name, create-records, add-device）を記載
    - register コマンドの廃止を明記
    - undo / delete-tests の `--yes` フラグ廃止を反映
    - 「レコードの登録・削除・取り消しコマンドを実行する前に、必ずユーザに許可を求めること」ルールを追加
    - 一時 JS ファイルの作成禁止ルールを追加（Base64 エンコードにより不要）
    - 実行環境が Claude Cowork + Desktop Commander であることを明記
    - _要件: 7.2, 7.7, 7.8, 7.9_

- [x] 12. ドキュメント更新 - スキルファイル
  - [x] 12.1 skills/register-skill.md を新コマンド体系に更新する
    - YAML frontmatter を維持
    - 手順を encode-name → create-records → add-device の順序に変更
    - 各コマンドは Desktop Commander でローカル実行する指示を含める
    - 一時 JS ファイルの作成手順を削除
    - 「コマンド実行前にユーザに許可を求めること」ルールを追加
    - _要件: 7.3, 7.5, 7.6, 7.8, 7.9_
  - [x] 12.2 skills/register-test-skill.md を新コマンド体系に更新する
    - YAML frontmatter を維持
    - 手順を encode-name --test → create-records --test → add-device --test の順序に変更
    - 各コマンドは Desktop Commander でローカル実行する指示を含める
    - 一時 JS ファイルの作成手順を削除
    - 「コマンド実行前にユーザに許可を求めること」ルールを追加
    - _要件: 7.3, 7.5, 7.6, 7.8, 7.9_
  - [x] 12.3 skills/undo-skill.md を新コマンド体系に更新する
    - YAML frontmatter を維持
    - `--yes` フラグを削除（非対話型化済み）
    - 「コマンド実行前にユーザに許可を求めること」ルールを追加
    - _要件: 7.3, 7.6, 7.8_
  - [x] 12.4 skills/delete-tests-skill.md を新コマンド体系に更新する
    - YAML frontmatter を維持
    - `--yes` フラグを削除（非対話型化済み）
    - 「コマンド実行前にユーザに許可を求めること」ルールを追加
    - _要件: 7.3, 7.6, 7.8_

- [x] 13. ドキュメント更新 - README.md
  - [x] 13.1 README.md を新コマンド体系に更新する
    - コマンド一覧を新体系に変更（encode-name, create-records, add-device）
    - register コマンドの廃止を明記
    - 各新コマンドの引数一覧と使用例を記載
    - 使いかたセクションを新コマンド体系に合わせて更新
    - IT部門向け情報の non-interactive モードセクションを更新
    - undo / delete-tests の `--yes` フラグ廃止を反映
    - _要件: 7.1, 7.4_

- [x] 14. 一時ファイルの削除
  - [x] 14.1 temp-register.js を削除する
    - プロジェクトルートの temp-register.js を削除（Base64 エンコードにより不要）
    - _要件: 7.9_

- [x] 15. 最終チェックポイント - ビルド・テスト・動作確認
  - ビルドが通ること（`npm run build`）、テストが通ること（`npx vitest --run`）を確認し、ユーザーに質問があれば確認する。

## 備考

- `*` 付きのタスクはオプションであり、スキップ可能
- 各タスクは要件番号で追跡可能
- チェックポイントで段階的に動作を検証
- プロパティテストは設計書の正当性プロパティに基づく
- ユニットテストは具体的なシナリオ・エッジケースを補完
