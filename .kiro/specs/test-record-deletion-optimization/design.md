# テストレコード削除最適化 バグ修正設計

## 概要

`delete-tests` コマンドにおけるテストレコード削除のパフォーマンス問題を修正する。現在、約126件のテストレコード削除に約5分かかっている。根本原因は `listTestRecords` の冗長呼び出し（4回）、`StartRecordName` 未指定によるゾーン全体スキャン、および早期終了の欠如にある。修正により、API呼び出し回数を最小化し、スキャン範囲を限定することで、削除処理を数秒以内に短縮する。

## 用語集

- **Bug_Condition (C)**: `delete-tests` コマンド実行時に、冗長なAPI呼び出しと非効率なスキャンが発生する条件
- **Property (P)**: 最適化後の期待動作 - 最小限のAPI呼び出しでテストレコードのみを効率的に取得・削除する
- **Preservation**: 最適化前後で変更されない動作 - レコード取得結果の正確性、エラーハンドリング、結果オブジェクトの形式
- **TestRecordManager**: `src/test-manager.ts` 内のクラス。テストレコードの一覧取得と一括削除を担当する
- **listTestRecords**: 指定ゾーンからテストプレフィックス付きレコードを取得するメソッド
- **deleteAllTestRecords**: 両ゾーンのテストレコードを一括削除するメソッド
- **handleDeleteTests**: `src/cli.ts` 内の関数。`delete-tests` コマンドのエントリポイント
- **TEST_PREFIX**: テストレコード識別用プレフィックス `__dns_auto_test-`

## バグ詳細

### バグ条件

`delete-tests` コマンドを実行すると、`handleDeleteTests` が `listTestRecords` を2回呼び出してレコード一覧を表示した後、`deleteAllTestRecords` 内で同じ `listTestRecords` が再度2回呼び出される。さらに各 `listTestRecords` 呼び出しでは `StartRecordName` が未指定のためゾーン先頭からフルスキャンが行われ、テストプレフィックス範囲を超えても不要なページ取得が継続される。

**形式仕様:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { command: string, zoneRecordCount: number, testRecordCount: number }
  OUTPUT: boolean

  // delete-testsコマンド実行時、テストレコードが存在する場合にバグが発現する
  RETURN input.command == 'delete-tests'
         AND input.testRecordCount > 0
         AND (listTestRecordsCallCount(input) > 2
              OR startRecordNameNotSpecified(input)
              OR noEarlyTermination(input))
END FUNCTION
```

### 具体例

- `delete-tests` 実行時、yamaokayaゾーン（3000件中63件がテスト）とmenkataゾーン（2000件中63件がテスト）に対して `listTestRecords` が計4回呼ばれ、各呼び出しでゾーン全体をスキャンする → 期待: 計2回の呼び出しで、テストプレフィックス位置から直接スキャン開始
- `listTestRecords` が `StartRecordName` なしで `ListResourceRecordSetsCommand` を発行し、ゾーン先頭の `@` レコードからスキャンを開始する → 期待: `StartRecordName: '__dns_auto_test-'` を指定し、テストレコード付近から開始
- テストレコードが `__dns_auto_test-a001` ～ `__dns_auto_test-z999` の範囲にあり、`_other-record` に到達してもページネーションが継続する → 期待: テストプレフィックスに一致しないレコードが出現した時点でループ終了
- Route53のレート制限（5リクエスト/秒）に達し、スロットリングと指数バックオフが発生する → 期待: API呼び出し回数削減によりレート制限に到達しない

## 期待される動作

### 保全要件

**変更されない動作:**
- `listTestRecords` が返すレコードの内容（名前、タイプ、値、TTL）は最適化前後で同一であること
- テストレコードが存在しない場合の「削除対象のテストレコードが見つかりません。」メッセージ表示
- 本番レコード（`__dns_auto_test-` プレフィックスを持たないレコード）は一切影響を受けないこと
- API エラー発生時の `failures` 配列への記録と結果報告
- `deleteAllTestRecords` の戻り値の形式（`deletedCount`, `failedCount`, `failures`）

**スコープ:**
テストプレフィックス `__dns_auto_test-` を持たないレコードに対する動作は、本修正の影響を一切受けない。以下を含む:
- 本番Aレコード、CNAMEレコードの取得・表示
- `list-tests` コマンドによるテストレコード一覧表示の正確性
- `register` / `undo` コマンドの動作

## 仮説的根本原因

バグ分析に基づき、最も可能性の高い原因は以下の通り:

1. **冗長なAPI呼び出し**: `handleDeleteTests` で `listTestRecords` を2回呼び出してレコード一覧を取得・表示した後、`deleteAllTestRecords` 内で同じ2回の呼び出しが再度行われる。`deleteAllTestRecords` のシグネチャが `config` のみを受け取るため、事前取得済みレコードを渡す手段がない。

2. **StartRecordName未指定**: `listTestRecords` の `ListResourceRecordSetsCommand` に `StartRecordName` パラメータが指定されていないため、ゾーン内の全レコードを先頭からスキャンする。テストレコードは `__dns_auto_test-` プレフィックスでアルファベット順の先頭付近に位置するが、それでも不要なレコードの取得が発生する。

3. **早期終了の欠如**: ページネーションループ内で、取得したレコードがテストプレフィックスに一致しなくなった場合でも、`IsTruncated` が `true` である限りループが継続する。Route53のレコードはアルファベット順にソートされているため、テストプレフィックス範囲を超えた時点で残りのページにテストレコードは存在しない。

4. **レート制限との相乗効果**: 上記の非効率なAPI呼び出しパターンが Route53 のレート制限（ホストゾーンあたり5リクエスト/秒）に達し、スロットリングと指数バックオフによるリトライが発生。これが約5分という大幅な遅延の直接的原因となっている。

## 正確性プロパティ

Property 1: バグ条件 - listTestRecordsのAPI呼び出し最適化

_任意の_ テストレコードを含むゾーン構成に対して、最適化後の `listTestRecords` は `StartRecordName` にテストプレフィックスを指定し、テストプレフィックスに一致しないレコードが出現した時点でページネーションを終了すること。かつ、取得されるテストレコードの集合は最適化前と同一であること。

**検証対象: 要件 2.2, 2.3**

Property 2: バグ条件 - deleteAllTestRecordsの冗長呼び出し排除

_任意の_ レコード構成に対して、最適化後の `deleteAllTestRecords` は引数として渡されたレコードを使用し、内部で `listTestRecords` を呼び出さないこと。

**検証対象: 要件 2.1**

Property 3: 保全 - レコード取得結果の同一性

_任意の_ ゾーン内レコード構成に対して、最適化後の `listTestRecords` が返すレコード集合は、最適化前の `listTestRecords` が返すレコード集合と完全に一致すること。テストプレフィックスを持つレコードは全て取得され、持たないレコードは一切含まれないこと。

**検証対象: 要件 3.2, 3.3**

Property 4: 保全 - 削除結果オブジェクトの形式と正確性

_任意の_ レコード構成とAPI応答パターンに対して、最適化後の `deleteAllTestRecords` が返す結果オブジェクトは、`deletedCount`（削除成功件数）、`failedCount`（失敗件数）、`failures`（失敗詳細配列）を含み、渡されたレコードの処理結果を正確に反映すること。

**検証対象: 要件 3.4, 3.5**

## 修正実装

### 必要な変更

仮説的根本原因の分析に基づき、以下の変更を実施する:

**ファイル**: `src/test-manager.ts`

**メソッド**: `listTestRecords`

**具体的な変更**:
1. **StartRecordName の指定**: `ListResourceRecordSetsCommand` の初回呼び出し時に `StartRecordName: TestRecordManager.TEST_PREFIX` を指定し、テストレコード付近からスキャンを開始する
2. **早期終了の実装**: ページネーションループ内で、取得したレコードセットの名前がテストプレフィックスに一致しない場合（アルファベット順でプレフィックス範囲を超えた場合）、ループを即座に終了する
3. **早期終了の判定ロジック**: `cleanName.startsWith(TEST_PREFIX)` が `false` かつ `cleanName > TEST_PREFIX` の場合、テストプレフィックス範囲を超えたと判定してブレークする

**メソッド**: `deleteAllTestRecords`

**具体的な変更**:
4. **シグネチャ変更**: `config: Config` のみの引数から、事前取得済みレコードを受け取るシグネチャに変更する。具体的には `records: { yamaokayaRecords: DnsRecord[]; menkataRecords: DnsRecord[] }` と `config: Config`（ゾーンID取得用）を受け取る形式にする
5. **内部listTestRecords呼び出しの削除**: メソッド内部での `this.listTestRecords()` 呼び出し2箇所を削除し、引数で渡されたレコードを直接使用する

**ファイル**: `src/cli.ts`

**関数**: `handleDeleteTests`

**具体的な変更**:
6. **事前取得済みレコードの受け渡し**: `handleDeleteTests` で既に取得済みの `yamaokayaRecords` と `menkataRecords` を `deleteAllTestRecords` に引数として渡す

## テスト戦略

### 検証アプローチ

テスト戦略は2段階のアプローチに従う: まず未修正コードでバグを実証するカウンター例を表面化させ、次に修正が正しく機能し既存動作が保全されることを検証する。

### 探索的バグ条件チェック

**目的**: 修正実装前に、未修正コードでバグを実証するカウンター例を表面化させる。根本原因分析を確認または反証する。反証された場合は再仮説が必要。

**テスト計画**: Route53クライアントをモック化し、`listTestRecords` と `deleteAllTestRecords` の呼び出しパターンを記録するテストを作成する。未修正コードで実行し、冗長な呼び出しと非効率なスキャンを観察する。

**テストケース**:
1. **冗長呼び出しテスト**: `deleteAllTestRecords` 実行時に `listTestRecords` が内部で呼び出されることを確認（未修正コードで失敗）
2. **StartRecordName未指定テスト**: `listTestRecords` が `ListResourceRecordSetsCommand` に `StartRecordName` を指定していないことを確認（未修正コードで失敗）
3. **早期終了欠如テスト**: テストプレフィックス範囲外のレコードが存在する場合、不要なページ取得が継続することを確認（未修正コードで失敗）
4. **大量レコードテスト**: 3000件のレコード中63件がテストレコードの場合、全ページをスキャンすることを確認（未修正コードで失敗）

**期待されるカウンター例**:
- `deleteAllTestRecords` 内で `listTestRecords` が2回呼び出される
- `ListResourceRecordSetsCommand` に `StartRecordName` が含まれない
- テストプレフィックス範囲外のレコードページが取得される

### 修正チェック

**目的**: バグ条件が成立する全ての入力に対して、修正後の関数が期待される動作を生成することを検証する。

**擬似コード:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := listTestRecords_fixed(input.zoneId)
  ASSERT startRecordNameSpecified(capturedCommand)
  ASSERT earlyTerminationApplied(capturedPages)
  ASSERT result == listTestRecords_original(input.zoneId)
END FOR

FOR ALL records WHERE records.length > 0 DO
  result := deleteAllTestRecords_fixed(records, config)
  ASSERT listTestRecordsCallCount == 0
  ASSERT result.deletedCount + result.failedCount == totalRecordCount(records)
END FOR
```

### 保全チェック

**目的**: バグ条件が成立しない全ての入力に対して、修正後の関数が元の関数と同じ結果を生成することを検証する。

**擬似コード:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT listTestRecords_original(input) == listTestRecords_fixed(input)
  ASSERT deleteAllTestRecords_original(input) == deleteAllTestRecords_fixed(input)
END FOR
```

**テストアプローチ**: プロパティベーステストは保全チェックに推奨される。理由:
- 入力ドメイン全体にわたって多数のテストケースを自動生成する
- 手動ユニットテストでは見逃す可能性のあるエッジケースを検出する
- 非バグ入力に対する動作の不変性を強力に保証する

**テスト計画**: まず未修正コードでマウスクリックやその他のインタラクションの動作を観察し、その動作をキャプチャするプロパティベーステストを作成する。

**テストケース**:
1. **レコード取得結果の同一性**: 任意のゾーン構成に対して、最適化前後で `listTestRecords` の戻り値が同一であることを検証
2. **空レコード時の動作保全**: テストレコードが存在しない場合の動作が最適化前後で同一であることを検証
3. **エラーハンドリング保全**: API エラー発生時の `failures` 記録が最適化前後で同一であることを検証
4. **結果オブジェクト形式保全**: `deleteAllTestRecords` の戻り値形式が最適化前後で同一であることを検証

### ユニットテスト

- `listTestRecords` が `StartRecordName` にテストプレフィックスを指定してAPIを呼び出すことを検証
- テストプレフィックス範囲外のレコード出現時にページネーションが停止することを検証
- `deleteAllTestRecords` が引数で渡されたレコードを使用し、内部で `listTestRecords` を呼び出さないことを検証
- 空レコード配列を渡した場合の正常終了を検証
- APIエラー発生時のエラーハンドリングを検証

### プロパティベーステスト

- ランダムなレコード構成を生成し、`listTestRecords` がテストプレフィックス付きレコードのみを正確に返すことを検証
- ランダムなレコード配列を生成し、`deleteAllTestRecords` の結果オブジェクトが入力レコード数と整合することを検証
- ランダムなゾーン構成（テストレコードと本番レコードの混在）を生成し、本番レコードが削除対象に含まれないことを検証

### 統合テスト

- `handleDeleteTests` の完全なフローで、`listTestRecords` が計2回のみ呼び出されることを検証
- 両ゾーンにテストレコードが存在する場合の一括削除フローを検証
- 一方のゾーンのみにテストレコードが存在する場合の削除フローを検証
