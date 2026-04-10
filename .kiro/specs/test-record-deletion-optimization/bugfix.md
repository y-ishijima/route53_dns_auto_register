# バグ修正要件ドキュメント

## はじめに

`delete-tests` コマンドにおいて、約126件のテストレコード削除に約5分かかるパフォーマンス問題を修正する。根本原因は、`listTestRecords` の冗長な呼び出し（`handleDeleteTests` で2回 + `deleteAllTestRecords` 内で再度2回 = 計4回）、`StartRecordName` パラメータ未使用によるゾーン全体のフルスキャン、およびテストレコード範囲を超えた後もページネーションを継続する早期終了の欠如にある。これらが Route53 のレート制限（ホストゾーンあたり5リクエスト/秒）と組み合わさり、スロットリングと指数バックオフによる大幅な遅延を引き起こしている。

## バグ分析

### 現在の動作（不具合）

1.1 WHEN `delete-tests` コマンドを実行する THEN `handleDeleteTests` が `listTestRecords` を2回呼び出し、さらに `deleteAllTestRecords` 内で同じ2回の呼び出しが行われ、合計4回の冗長な `listTestRecords` 呼び出しが発生する

1.2 WHEN `listTestRecords` がゾーンのレコードを取得する THEN `ListResourceRecordSetsCommand` に `StartRecordName` が指定されていないため、ゾーン内の全レコード（本番レコード含む数千件）を先頭からスキャンする

1.3 WHEN `listTestRecords` のページネーションループがテストプレフィックス `__dns_auto_test-` の範囲を超えたレコードに到達する THEN ループは終了せず、ゾーン末尾まで不要なページの取得を継続する

1.4 WHEN 上記の冗長な呼び出しと非効率なスキャンが Route53 のレート制限（ホストゾーンあたり5リクエスト/秒）に達する THEN スロットリングが発生し、指数バックオフによるリトライが繰り返され、約126件のテストレコード削除に約5分を要する

### 期待される動作（正常）

2.1 WHEN `delete-tests` コマンドを実行する THEN `deleteAllTestRecords` は事前に取得済みのレコードをパラメータとして受け取り、内部で `listTestRecords` を再呼び出ししないものとする（合計2回の呼び出しのみ）

2.2 WHEN `listTestRecords` がゾーンのレコードを取得する THEN `ListResourceRecordSetsCommand` に `StartRecordName: '__dns_auto_test-'` を指定し、テストレコードの位置から直接スキャンを開始するものとする

2.3 WHEN `listTestRecords` のページネーションループで取得したレコードがテストプレフィックス `__dns_auto_test-` に一致しなくなった THEN ループを即座に終了し、不要なページ取得を行わないものとする

2.4 WHEN 上記の最適化が適用された状態で `delete-tests` コマンドを実行する THEN 約126件のテストレコードの削除が数秒以内に完了するものとする

### 変更されない動作（リグレッション防止）

3.1 WHEN テストレコードが存在しない状態で `delete-tests` コマンドを実行する THEN 「削除対象のテストレコードが見つかりません。」というメッセージが表示され、正常に終了し続けるものとする

3.2 WHEN `list-tests` コマンドを実行する THEN テストレコードの一覧が正しく表示され続けるものとする

3.3 WHEN テストレコードの削除が実行される THEN 本番レコード（`__dns_auto_test-` プレフィックスを持たないレコード）は一切影響を受けず、変更・削除されないものとする

3.4 WHEN テストレコードの削除中にAPI エラーが発生する THEN エラー情報が `failures` 配列に記録され、削除結果として正しく報告され続けるものとする

3.5 WHEN `deleteAllTestRecords` が実行される THEN 削除件数と失敗件数を含む結果オブジェクトが返却され続けるものとする
