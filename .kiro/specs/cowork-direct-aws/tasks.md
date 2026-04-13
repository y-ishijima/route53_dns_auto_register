# Implementation Plan: cowork-direct-aws

## Overview

DNS登録ツールのアーキテクチャ変更を段階的に実装する。まず共通業務ロジック層（handlers.ts）を抽出し、次にMCPサーバーを新設、CLIをリファクタリングし、最後にスキルファイルとCLAUDE.mdを更新する。既存の業務ロジック（validator.ts、generator.ts、manager.ts、test-manager.ts、undo.ts）はそのまま再利用する。

## Tasks

- [x] 1. 型定義の追加とMCP SDK依存関係のインストール
  - [x] 1.1 src/types.tsにハンドラ入出力型を追加する
    - EncodeNameParams, EncodeNameResult, CreateRecordsParams, CreateRecordsResult, AddDeviceParams, AddDeviceResult, UndoResult, ListTestsResult, DeleteTestsResult を追加
    - 既存の型定義（Config, DnsRecord, GeneratedRecords, ValidationResult, RegistrationResult, LastRegistration）は変更しない
    - _Requirements: 1.3, 1.4_
  - [x] 1.2 package.jsonに@modelcontextprotocol/sdkとzodを追加する
    - `npm install @modelcontextprotocol/sdk zod` を実行
    - package.jsonのbinフィールドにmcp-serverエントリポイントを追加: `"dns-register-mcp": "dist/mcp-server.js"`
    - _Requirements: 1.1, 1.3_

- [x] 2. 共通業務ロジック層（handlers.ts）の実装
  - [x] 2.1 src/handlers.tsを新規作成し、handleEncodeNameを実装する
    - cli.tsのhandleEncodeName関数から業務ロジックを抽出
    - 平文の店舗名を受け取り、内部でBase64エンコードを実行する
    - validateShopName, validateShopCodeを呼び出し、エラー時は `{ success: false, error }` を返す
    - 本番モード時はRecordManager.checkDuplicateTxtで重複チェック
    - テストモード時は`__dns_auto_test-`プレフィックスを付与しUPSERTアクションで登録
    - Route53ClientとConfigを引数として受け取る設計（DI対応）
    - console.log、process.exitは使用しない
    - _Requirements: 3.1, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.2_
  - [x] 2.2 handleCreateRecordsを実装する
    - cli.tsのhandleCreateRecords関数から業務ロジックを抽出
    - validateShopCode, validateStartIpを呼び出し、エラー時は `{ success: false, error }` を返す
    - generateRecordsでレコード定義を生成し、RecordManager.registerRecordsで登録
    - 本番モード時はRecordManager.checkDuplicateShopCodeで重複チェック
    - 本番モード時はsaveLastRegistrationでundo情報を保存
    - menkata登録失敗時の自動ロールバックはRecordManager内で処理済み
    - _Requirements: 3.1, 5.1, 5.2, 5.3, 5.4, 5.5, 10.2, 10.3_
  - [x] 2.3 handleAddDeviceを実装する
    - cli.tsのhandleAddDevice関数から業務ロジックを抽出
    - validateShopCodeを呼び出し、IPアドレス形式を検証
    - Aレコード名を算出し（3桁ゼロパディング）、CNAMEレコードを登録
    - 本番モード時はRecordManager.checkDuplicateCnameで重複チェック
    - _Requirements: 3.1, 6.1, 6.2, 6.3, 10.2_
  - [x] 2.4 handleUndo, handleListTests, handleDeleteTestsを実装する
    - cli.tsの各ハンドラ関数から業務ロジックを抽出
    - handleUndo: loadLastRegistration → isWithinUndoWindow → RecordManager.deleteRecords
    - handleListTests: TestRecordManager.listTestRecords（両ゾーン）
    - handleDeleteTests: TestRecordManager.listTestRecords → deleteAllTestRecords
    - _Requirements: 3.1, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_

  - [ ]* 2.5 handlers.tsのプロパティテストを作成する（Property 1: Base64ラウンドトリップ）
    - **Property 1: Base64エンコードのラウンドトリップ**
    - fast-checkで有効な店舗名（1-30文字、許可文字種）と有効な店舗コード（s + 数字1-6桁）を生成
    - handleEncodeNameが返すbase64ValueをBase64デコードした結果が入力店舗名と完全一致すること
    - txtRecordNameが`{shopCode}.yamaokaya.net`形式であること
    - **Validates: Requirements 3.5, 4.1, 4.5**
  - [ ]* 2.6 handlers.tsのプロパティテストを作成する（Property 2: テストモードプレフィックス）
    - **Property 2: テストモードのプレフィックス付与**
    - fast-checkで有効な店舗コードを生成
    - testMode=trueの場合、txtRecordNameが`__dns_auto_test-{shopCode}.yamaokaya.net`形式であること
    - testMode=falseの場合、`__dns_auto_test-`を含まないこと
    - **Validates: Requirements 4.3**
  - [ ]* 2.7 handlers.tsのプロパティテストを作成する（Property 3: create-recordsレコード数整合性）
    - **Property 3: create-recordsのレコード数整合性**
    - fast-checkで有効な店舗コードと有効な先頭IP（第4オクテット+61<=254）を生成
    - handleCreateRecordsが返すrecordCountが124（Aレコード62件 + menkata CNAME 62件）であること
    - **Validates: Requirements 5.1, 5.3**
  - [ ]* 2.8 handlers.tsのプロパティテストを作成する（Property 4: add-deviceのAレコード名算出）
    - **Property 4: add-deviceのAレコード名算出**
    - fast-checkで有効な店舗コード、任意の機器タイプ文字列、有効なIP（192.168.x.x形式）を生成
    - aliasTargetが`ip192-168-{oct3_3桁}-{oct4_3桁}.{shopCode}.yamaokaya.net`形式であること
    - cnameRecordNameが`{device}.{shopCode}.yamaokaya.net`形式であること
    - **Validates: Requirements 6.1, 6.3**
  - [ ]* 2.9 handlers.tsのプロパティテストを作成する（Property 5: バリデーション透過性）
    - **Property 5: バリデーション透過性**
    - fast-checkで任意の文字列を生成
    - handleEncodeNameが返すエラーメッセージがvalidateShopNameのエラーメッセージと完全一致すること
    - handleCreateRecordsが返すエラーメッセージがvalidateShopCode・validateStartIpのエラーメッセージと完全一致すること
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
  - [ ]* 2.10 handlers.tsのユニットテストを作成する
    - 重複チェック時のエラー返却テスト
    - undo対象なし・期限切れのテスト
    - テストレコード0件時のテスト
    - AWS認証エラー・ネットワークエラーのテスト
    - _Requirements: 4.4, 5.2, 7.2, 7.3, 8.3, 11.1, 11.2, 11.3_

- [x] 3. チェックポイント - handlers.tsの動作確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. MCPサーバー（mcp-server.ts）の実装
  - [x] 4.1 src/mcp-server.tsを新規作成する
    - McpServerクラスとStdioServerTransportをインポート
    - 起動時に.envファイルからAWS認証情報を読み込む（cli.tsのloadEnvFile関数をexportして再利用）
    - Route53Clientを初期化し、Configオブジェクトを構築する
    - 6つのツール（encode-name, create-records, add-device, undo, list-tests, delete-tests）をZodスキーマ付きで登録
    - 各ツールハンドラ内でhandlers.tsの関数を呼び出し、結果をMCPレスポンス形式に変換
    - success: falseの場合は`isError: true`で返却
    - AWS認証エラー・ネットワークエラーはcli.tsのgetAwsAuthErrorMessage/isNetworkErrorで判定
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 11.1, 11.2, 11.3, 11.4_
  - [ ]* 4.2 mcp-server.tsのユニットテストを作成する
    - ツール登録の確認（6ツールが登録されていること）
    - MCPレスポンス形式の確認（成功時・エラー時）
    - .envファイル不在時のエラーハンドリング
    - _Requirements: 1.1, 1.4, 1.5, 2.2_

- [x] 5. CLIのリファクタリング
  - [x] 5.1 src/cli.tsをhandlers.ts呼び出しに変更する
    - 各コマンドハンドラの業務ロジックをhandlers.tsの関数呼び出しに置き換え
    - loadEnvFile関数とbuildConfigFromEnv関数をexportする（mcp-server.tsから再利用）
    - getAwsAuthErrorMessage関数とisNetworkError関数はexport済みを維持
    - `--shop-name-base64`パラメータを廃止し、`--shop-name`のみ受け付ける
    - コンソール出力とprocess.exitの制御はcli.tsに残す
    - _Requirements: 3.2, 3.3, 3.5_
  - [ ]* 5.2 CLIの後方互換性テストを作成する
    - 各コマンドがhandlers.tsを正しく呼び出すことの確認
    - --shop-nameパラメータが正しく処理されることの確認
    - _Requirements: 3.2, 3.3, 3.5_

- [x] 6. チェックポイント - MCPサーバーとCLIの動作確認
  - Ensure all tests pass, ask the user if questions arise.
  - `npx tsc` でビルドが成功することを確認

- [x] 7. スキルファイルとドキュメントの更新
  - [x] 7.1 skills/dns-register-skill.mdを更新する
    - Desktop Commanderのexecute_command呼び出しをMCPツール呼び出しに置き換え
    - `npx dns-register`コマンドの記述を排除し、MCPツール名とパラメータに置き換え
    - Base64エンコード手順の記述を排除（encode-nameツールが内部でエンコード）
    - `--env-file .env`の記述を排除
    - 絶対ルールセクションに「Desktop Commanderは使用しない。全操作はMCPツール経由で実行すること。」を明記
    - ユーザー許可確認の手順は維持
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.7_
  - [x] 7.2 CLAUDE.mdを更新する
    - 「Desktop Commander でローカル実行」を「MCPサーバー経由で直接実行」に置き換え
    - コマンド一覧をMCPツール名とパラメータに更新
    - `--env-file .env`の記述を排除
    - Desktop Commander関連のルール（cmd.exe使用、フォルダ移動等）を排除
    - _Requirements: 9.3, 9.4_
  - [x] 7.3 docs/architecture.mdを更新する
    - 全体構成図をMCPサーバー経由の新アーキテクチャに更新
    - ファイル構成にmcp-server.tsとhandlers.tsを追加
    - コマンドフロー図をMCPツール呼び出しに更新
    - _Requirements: 3.1_

- [x] 8. 最終チェックポイント - 全体の動作確認
  - Ensure all tests pass, ask the user if questions arise.
  - `npx tsc` でビルドが成功することを確認
  - 全ファイルの整合性を確認（handlers.tsからの呼び出しチェーン、MCPサーバーのツール登録）

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 既存の業務ロジック（validator.ts、generator.ts、manager.ts、test-manager.ts、undo.ts）は変更しない
- handlers.tsは副作用（console.log、process.exit）を持たない純粋な関数群として実装する
- Route53ClientとConfigを引数として受け取る設計により、テスト時のモック注入が容易
- プロパティテストはfast-checkを使用し、最低100回のイテレーションで実行する
- 既存テスト（test-manager.bug-condition.test.ts、test-manager.preservation.test.ts）は影響を受けない
