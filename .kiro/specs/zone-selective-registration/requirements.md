# Requirements Document

## Introduction

Route53 DNS自動登録ツールの `create-records` コマンドにおいて、登録先ゾーンを選択できる機能を追加する。現在は yamaokaya.net と internal.menkata.me の両ゾーンに同時登録する仕組みのみであり、片方のゾーンのみに登録するオプションが存在しない。そのため、先に yamaokaya.net にレコードを登録した場合、重複チェック（`checkDuplicateShopCode`）により同一店舗コードの internal.menkata.me ゾーンへの追加登録ができなくなる問題がある。本機能により、ゾーンを個別に指定して登録できるようにし、段階的な登録ワークフローを可能にする。

## Glossary

- **CLI**: コマンドラインインターフェース。本ツールの実行形態
- **Zone_Selector**: 登録先ゾーンを指定するためのCLIオプション機能
- **Record_Generator**: 店舗コードと先頭IPアドレスからDNSレコード定義を生成するモジュール
- **Record_Manager**: Route53 APIを使用したDNSレコードの登録・削除・重複チェックを担当するモジュール
- **Duplicate_Checker**: 既存レコードとの重複を検証する機能（Record_Manager内の checkDuplicateShopCode メソッド）
- **yamaokaya_zone**: yamaokaya.net ホストゾーン（Aレコード、CNAMEエイリアスを格納）
- **menkata_zone**: internal.menkata.me ホストゾーン（CNAMEレコードを格納）
- **Undo_Manager**: 登録操作の取り消し情報を管理するモジュール

## Requirements

### Requirement 1: ゾーン選択オプションの提供

**User Story:** As a CLI利用者, I want to 登録先ゾーンを個別に指定できるオプションを使いたい, so that 片方のゾーンのみにレコードを登録できる。

#### Acceptance Criteria

1. IF `--zone` オプションが指定されない場合, THEN THE CLI SHALL yamaokaya_zone と menkata_zone の両方にレコードを登録する
2. IF `--zone yamaokaya` が指定された場合, THEN THE CLI SHALL yamaokaya_zone のみにレコードを登録し、menkata_zone への登録を行わない
3. IF `--zone menkata` が指定された場合, THEN THE CLI SHALL menkata_zone のみにレコードを登録し、yamaokaya_zone への登録を行わない
4. IF `--zone` に `yamaokaya` または `menkata` 以外の値が指定された場合, THEN THE CLI SHALL エラーメッセージを標準エラー出力に表示し、終了コード1で終了する。レコード登録は一切行わない
5. THE CLI SHALL `--zone` オプションを encode-name、create-records、add-device の全登録コマンドで使用可能とする

### Requirement 2: ゾーン選択時の重複チェック制御

**User Story:** As a CLI利用者, I want to 片方のゾーンのみに登録する際に、もう片方のゾーンの既存レコードが重複チェックに影響しないようにしたい, so that yamaokaya.net に先に登録した後でも internal.menkata.me に同一店舗のレコードを追加登録できる。

#### Acceptance Criteria

1. WHEN `create-records` コマンドで `--zone menkata` が指定された場合, THE Duplicate_Checker SHALL yamaokaya_zone に対する重複チェックを実行せず、menkata_zone 内の同一店舗コードのCNAMEレコードの存在のみを確認する
2. WHEN `create-records` コマンドで `--zone yamaokaya` が指定された場合, THE Duplicate_Checker SHALL menkata_zone に対する重複チェックを実行せず、yamaokaya_zone 内の同一店舗コードのAレコードの存在のみを確認する
3. IF 指定されたゾーン内で同一店舗コードのレコードが既に存在する場合, THEN THE Duplicate_Checker SHALL 登録を中止し、該当店舗コードが既に登録済みであることを示すエラーメッセージを返す
4. WHEN `--zone` オプションが指定されない場合, THE Duplicate_Checker SHALL yamaokaya_zone 内の同一店舗コードのAレコードの存在を確認し、存在すればエラーとする（従来動作）
5. IF `--zone` オプションに `menkata` または `yamaokaya` 以外の値が指定された場合, THEN THE System SHALL 有効な値（menkata, yamaokaya）を示すエラーメッセージを表示し、処理を中止する

### Requirement 3: menkata ゾーン単独登録時のレコード生成

**User Story:** As a CLI利用者, I want to menkata ゾーンのみに登録する際に、対応する yamaokaya.net のAレコード名を正しく参照したCNAMEレコードが生成されたい, so that menkata CNAMEレコードが正しいAレコードを指す。

#### Acceptance Criteria

1. WHEN `--zone menkata` が指定された場合, THE Record_Generator SHALL 店舗コードと先頭IPアドレスから yamaokaya_zone のAレコード名（`ip192-168-{oct3:3桁}-{oct4:3桁}.{shopCode}.yamaokaya.net` 形式）を算出し、menkata_zone の62件のCNAMEレコードそれぞれの参照先（CNAME value）として使用する
2. WHEN `--zone menkata` が指定された場合, THE Record_Generator SHALL yamaokaya_zone のAレコードおよびCNAMEエイリアスを生成結果に含めず、menkata_zone のCNAMEレコード62件のみを返す
3. WHEN `--zone yamaokaya` が指定された場合, THE Record_Generator SHALL menkata_zone のCNAMEレコードを生成結果に含めず、yamaokaya_zone のAレコードおよびCNAMEエイリアスのみを返す
4. IF `--zone menkata` が指定され、かつ店舗コードまたは先頭IPアドレスが未指定の場合, THEN THE Record_Generator SHALL Aレコード名の算出に必要な引数が不足している旨のエラーメッセージを表示し、レコード生成を実行しない

### Requirement 4: ゾーン選択時のundo情報保存

**User Story:** As a CLI利用者, I want to ゾーンを指定して登録した場合でも、登録を取り消せるようにしたい, so that 誤登録時に正しくundoできる。

#### Acceptance Criteria

1. WHEN `--zone yamaokaya` が指定されて登録が成功した場合, THE Undo_Manager SHALL generatedRecords内のyamaokayaARecordsとyamaokayaCnameAliasesのみを含み、menkataCnameRecordsを空配列としたUndoEntryを.last-registration.jsonに追記する
2. WHEN `--zone menkata` が指定されて登録が成功した場合, THE Undo_Manager SHALL generatedRecords内のmenkataCnameRecordsのみを含み、yamaokayaARecordsとyamaokayaCnameAliasesを空配列としたUndoEntryを.last-registration.jsonに追記する
3. WHEN undo操作が実行された場合, THE Undo_Manager SHALL 保存されたgeneratedRecords内の空でない配列に対応するゾーンのレコードのみをRoute53から削除し、空配列のゾーンに対してはDELETEリクエストを送信しない
4. IF undo操作中にRoute53 APIからエラーが返された場合, THEN THE Undo_Manager SHALL undoneフラグをfalseのまま維持し、エラーメッセージを返す
5. WHEN `--zone` オプションが指定されずに登録が成功した場合, THE Undo_Manager SHALL 従来どおりyamaokayaARecords、yamaokayaCnameAliases、menkataCnameRecordsの全てを含むUndoEntryを保存する

### Requirement 5: ゾーン選択時のロールバック動作

**User Story:** As a CLI利用者, I want to 両ゾーン同時登録時にmenkata登録が失敗した場合のロールバック動作が維持されてほしい, so that 部分的な登録状態が残らない。

#### Acceptance Criteria

1. IF `--zone` オプションが指定されず、menkata_zone への登録が失敗した場合, THEN THE Record_Manager SHALL yamaokaya_zone に登録済みのレコード（Aレコードおよび CNAMEエイリアス）を DELETE アクションで自動削除し、登録レコード数 0 件・失敗を示す結果を返す
2. IF `--zone` オプションが指定されず、ロールバック（yamaokaya_zone レコードの自動削除）自体が失敗した場合, THEN THE Record_Manager SHALL IT部門への連絡を促すエラーメッセージを返し、例外をスローする
3. IF `--zone yamaokaya` が指定された場合, THEN THE Record_Manager SHALL menkata_zone への登録処理を実行せず、yamaokaya_zone への登録成功をもって処理完了とする
4. IF `--zone menkata` が指定され、menkata_zone への登録が失敗した場合, THEN THE Record_Manager SHALL 失敗原因を含むエラーメッセージを返す（yamaokaya_zone のレコードに対する削除・変更は実行しない）

### Requirement 6: テストモードとの互換性

**User Story:** As a CLI利用者, I want to テストモードでもゾーン選択オプションを使用できるようにしたい, so that 本番登録前にゾーン選択の動作を確認できる。

#### Acceptance Criteria

1. WHEN `--zone` オプションと `--test` オプションが同時に指定された場合, THE CLI SHALL 指定されたゾーンのみにテストプレフィックス（`auto_dns_test_`）付きレコードをUPSERTアクションで登録する
2. WHEN `--zone` オプションと `--test` オプションが同時に指定された場合, THE CLI SHALL テストレコード情報ファイル（test-records.json）に登録したゾーンのレコードのみを記録し、未指定ゾーンのレコードを含めない
3. WHEN `--zone` オプションが指定されず `--test` オプションのみが指定された場合, THE CLI SHALL 従来どおり yamaokaya_zone と menkata_zone の両方にテストプレフィックス付きレコードをUPSERTで登録する
4. IF `--zone` オプションと `--test` オプションが同時に指定され、指定ゾーンへの登録が失敗した場合, THEN THE CLI SHALL エラーメッセージを表示して終了コード1で終了する（テストレコード情報ファイルには失敗したレコードを記録しない）

### Requirement 7: 出力メッセージの適切な表示

**User Story:** As a CLI利用者, I want to ゾーン選択時に登録結果が分かりやすく表示されてほしい, so that どのゾーンに何件登録されたか把握できる。

#### Acceptance Criteria

1. WHEN `--zone yamaokaya` が指定されて登録が成功した場合, THE CLI SHALL yamaokaya_zone のChange IDと、yamaokaya_zoneに登録されたレコード数を「登録レコード数: N件」「yamaokaya.net Change ID: <Change ID>」の形式で標準出力に表示する
2. WHEN `--zone menkata` が指定されて登録が成功した場合, THE CLI SHALL menkata_zone のChange IDと、menkata_zoneに登録されたレコード数を「登録レコード数: N件」「internal.menkata.me Change ID: <Change ID>」の形式で標準出力に表示する
3. WHEN `--zone` オプションが指定されず登録が成功した場合, THE CLI SHALL 両ゾーンのChange IDと合計登録レコード数を「登録レコード数: N件」「yamaokaya.net Change ID: <Change ID>」「internal.menkata.me Change ID: <Change ID>」の形式で標準出力に表示する
4. IF `--zone` オプションに `yamaokaya` または `menkata` 以外の値が指定された場合, THEN THE CLI SHALL 有効なゾーン名の一覧を含むエラーメッセージを標準エラー出力に表示し、終了コード1で終了する
5. WHEN 登録が成功した場合, THE CLI SHALL Change IDを1行目、登録レコード数を2行目以降に表示し、menkata_zoneのChange IDが存在する場合はyamaokaya_zoneの後に表示する
