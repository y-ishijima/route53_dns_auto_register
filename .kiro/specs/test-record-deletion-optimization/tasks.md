# 実装計画

- [x] 1. バグ条件探索テストを作成する
  - **Property 1: Bug Condition** - listTestRecords の冗長呼び出し・非効率スキャンの実証
  - **重要**: 修正実装前にこのプロパティベーステストを作成すること
  - **目的**: 未修正コードでバグの存在を実証するカウンター例を表面化させる
  - **スコープ付きPBTアプローチ**: Route53クライアントをモック化し、以下の3つのバグ条件を具体的に検証する
  - テスト1: `deleteAllTestRecords(config)` 実行時に内部で `listTestRecords` が呼び出されることを確認（`isBugCondition: listTestRecordsCallCount > 2`）
  - テスト2: `listTestRecords` が `ListResourceRecordSetsCommand` に `StartRecordName` を指定していないことを確認（`isBugCondition: startRecordNameNotSpecified`）
  - テスト3: テストプレフィックス範囲外のレコード（例: `other-record.example.com`）が存在する場合、不要なページ取得が継続することを確認（`isBugCondition: noEarlyTermination`）
  - テストアサーションは期待される動作（Expected Behavior）に基づく: `StartRecordName` が指定されること、早期終了が適用されること、`listTestRecords` の内部呼び出しがないこと
  - 未修正コードで実行 - テスト失敗を期待（バグの存在を証明）
  - **期待される結果**: テスト失敗（これが正しい - バグの存在を証明する）
  - カウンター例を記録して根本原因を理解する（例: `deleteAllTestRecords` 内で `listTestRecords` が2回呼び出される、`StartRecordName` が未指定）
  - テスト作成・実行・失敗の記録が完了した時点でタスク完了とする
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. 保全プロパティテストを作成する（修正実装前）
  - **Property 2: Preservation** - レコード取得結果と削除結果の保全
  - **重要**: 観察優先方法論に従うこと
  - **観察フェーズ**: 未修正コードで以下の動作を観察する
  - 観察1: テストプレフィックス付きレコードのみが `listTestRecords` から返されること
  - 観察2: テストプレフィックスを持たない本番レコードが結果に含まれないこと
  - 観察3: テストレコードが存在しない場合に空配列が返されること
  - 観察4: `deleteAllTestRecords` の戻り値が `{ deletedCount, failedCount, failures }` 形式であること
  - 観察5: APIエラー発生時に `failures` 配列にエラー情報が記録されること
  - **プロパティベーステスト作成**: fast-check を使用してランダムなレコード構成を生成し、以下を検証する
  - プロパティ: 任意のゾーン内レコード構成に対して、`listTestRecords` が `__dns_auto_test-` プレフィックス付きレコードのみを返し、それ以外を含まないこと（保全要件: レコード取得結果の同一性）
  - プロパティ: 任意のレコード配列に対して、`deleteAllTestRecords` の `deletedCount + failedCount` が入力レコード総数と一致すること（保全要件: 結果オブジェクトの正確性）
  - プロパティ: 空レコード配列を渡した場合、`deletedCount: 0, failedCount: 0` が返されること
  - 未修正コードでテスト実行 - テスト成功を期待（ベースライン動作の確認）
  - **期待される結果**: テスト成功（保全すべきベースライン動作を確認）
  - テスト作成・実行・成功の確認が完了した時点でタスク完了とする
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. テストレコード削除最適化の修正を実装する

  - [x] 3.1 `listTestRecords` に StartRecordName 指定と早期終了を実装する
    - `src/test-manager.ts` の `listTestRecords` メソッドを修正
    - `ListResourceRecordSetsCommand` の初回呼び出し時に `StartRecordName: TestRecordManager.TEST_PREFIX` を指定し、テストレコード付近からスキャンを開始する
    - ページネーションループ内で早期終了ロジックを追加: `cleanName.startsWith(TEST_PREFIX)` が `false` かつ `cleanName > TEST_PREFIX` の場合、テストプレフィックス範囲を超えたと判定してループを即座に終了する
    - _Bug_Condition: isBugCondition(input) where startRecordNameNotSpecified(input) OR noEarlyTermination(input)_
    - _Expected_Behavior: StartRecordName にテストプレフィックスを指定し、プレフィックス範囲外のレコード出現時にページネーションを終了する_
    - _Preservation: listTestRecords が返すレコードの内容（名前、タイプ、値、TTL）は最適化前後で同一であること_
    - _Requirements: 2.2, 2.3, 3.2, 3.3_

  - [x] 3.2 `deleteAllTestRecords` のシグネチャを変更し、事前取得済みレコードを受け取る
    - `src/test-manager.ts` の `deleteAllTestRecords` メソッドのシグネチャを変更
    - 引数を `config: Config` のみから `records: { yamaokayaRecords: DnsRecord[]; menkataRecords: DnsRecord[] }, config: Config` に変更
    - メソッド内部の `this.listTestRecords()` 呼び出し2箇所を削除し、引数 `records` から直接レコードを使用する
    - _Bug_Condition: isBugCondition(input) where listTestRecordsCallCount(input) > 2_
    - _Expected_Behavior: deleteAllTestRecords は引数で渡されたレコードを使用し、内部で listTestRecords を呼び出さない_
    - _Preservation: deleteAllTestRecords の戻り値形式（deletedCount, failedCount, failures）は変更しない_
    - _Requirements: 2.1, 3.4, 3.5_

  - [x] 3.3 `handleDeleteTests` から事前取得済みレコードを `deleteAllTestRecords` に渡す
    - `src/cli.ts` の `handleDeleteTests` 関数を修正
    - 既に取得済みの `yamaokayaRecords` と `menkataRecords` を `deleteAllTestRecords` に引数として渡す
    - 変更前: `await testManager.deleteAllTestRecords(config)`
    - 変更後: `await testManager.deleteAllTestRecords({ yamaokayaRecords, menkataRecords }, config)`
    - _Bug_Condition: handleDeleteTests で取得済みレコードが deleteAllTestRecords に渡されず、内部で再取得される_
    - _Expected_Behavior: handleDeleteTests が事前取得済みレコードを deleteAllTestRecords に渡し、listTestRecords の呼び出しが計2回のみとなる_
    - _Requirements: 2.1, 2.4_

  - [x] 3.4 バグ条件探索テストが成功することを確認する
    - **Property 1: Expected Behavior** - listTestRecords の最適化後の動作検証
    - **重要**: タスク1で作成した同じテストを再実行する（新しいテストを作成しない）
    - タスク1のテストは期待される動作をエンコードしている
    - このテストが成功すれば、期待される動作が満たされたことを確認できる
    - バグ条件探索テストを実行する
    - **期待される結果**: テスト成功（バグが修正されたことを確認）
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 保全プロパティテストが引き続き成功することを確認する
    - **Property 2: Preservation** - レコード取得結果と削除結果の保全検証
    - **重要**: タスク2で作成した同じテストを再実行する（新しいテストを作成しない）
    - 保全プロパティテストを実行する
    - **期待される結果**: テスト成功（リグレッションなしを確認）
    - 修正後も全テストが成功することを確認する（リグレッションなし）

- [x] 4. チェックポイント - 全テストの成功を確認する
  - 全てのテスト（バグ条件探索テスト、保全プロパティテスト）が成功することを確認する
  - 疑問点がある場合はユーザーに確認する
