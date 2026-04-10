# 要件定義書: コマンド細分化リファクタリング

## はじめに

既存の `register` コマンド（対話型 + non-interactive の一括登録）を廃止し、責務ごとに分離した3つの小さなコマンドに分解する。全コマンドは non-interactive で動作し、`--env-file` および `--test` オプションを維持する。既存のビジネスロジック（validator.ts, generator.ts, manager.ts）は可能な限り再利用する。

## 用語集

- **CLI**: コマンドラインインターフェース。ユーザがターミナルから実行するプログラム
- **encode-name コマンド**: 店舗名を Base64 エンコードして TXT レコードとして登録するコマンド
- **create-records コマンド**: 店舗コードと先頭IPから A レコード 62件 + menkata CNAME 62件を一括生成・登録するコマンド
- **add-device コマンド**: 1機器ずつ CNAME エイリアスを登録するコマンド
- **Record_Manager**: Route53 API を使用した DNS レコードの登録・削除・同期確認を担当するモジュール（src/manager.ts）
- **Record_Generator**: 店舗コードと先頭IPアドレスから DNS レコード定義を生成するモジュール（src/generator.ts）
- **Input_Validator**: ユーザ入力（店舗名、店舗コード、先頭IPアドレス、機器IPアドレス）の妥当性を検証するモジュール（src/validator.ts）
- **Config_Loader**: 設定ファイル（config.json）の読み込みと検証を行うモジュール（src/config.ts）
- **Test_Record_Manager**: テストレコード（`__dns_auto_test-` プレフィックス付き）の一覧取得・一括削除を担当するモジュール（src/test-manager.ts）
- **Base64エンコード**: バイナリデータをASCII文字列に変換するエンコード方式。店舗名の登録に使用
- **TXTレコード**: DNS のテキストレコード。店舗名の Base64 エンコード値を格納する
- **Aレコード**: DNS のアドレスレコード。ホスト名とIPアドレスの対応を定義する
- **CNAMEレコード**: DNS の正規名レコード。ホスト名のエイリアスを定義する
- **スキルファイル**: Cowork（Claude Desktop）で AI エージェントが使用する操作手順書（skills/ フォルダ内の .md ファイル）

## 要件

### 要件 1: register コマンドの廃止

**ユーザストーリー:** 開発者として、旧来の一括登録コマンドを廃止したい。責務が混在した大きなコマンドを排除し、保守性を向上させるため。

#### 受入基準

1. WHEN ユーザが `register` コマンドを実行した場合、THE CLI SHALL 廃止メッセージと新しいコマンド体系の案内を表示して終了する
2. THE CLI SHALL `register` コマンドの対話型モード（Interactive_CLI）を削除する
3. THE CLI SHALL `register` コマンドの non-interactive モード（`--non-interactive` フラグ）を削除する
4. THE CLI SHALL 対話型プロンプトモジュール（src/interactive.ts）の `promptRegisterInput` 関数および `displayWelcome` 関数を削除する

### 要件 2: encode-name コマンドの実装

**ユーザストーリー:** 運用担当者として、店舗名（日本語）を Base64 エンコードして DNS に TXT レコードとして登録したい。日本語の店舗名をエンコーディング問題なく DNS に記録するため。

#### 受入基準

1. WHEN `encode-name --shop-name "山岡家 札幌店" --shop-code s1105` が実行された場合、THE CLI SHALL 店舗名（日本語）を UTF-8 バイト列として Base64 エンコードし、`shopname.{shopCode}.yamaokaya.net` に TXT レコードとして登録する。TXT レコードの値は Base64 エンコードされた文字列とする
2. THE Input_Validator SHALL 店舗名を既存のバリデーションルール（1〜30文字、許可文字種のみ）で検証する
3. THE Input_Validator SHALL 店舗コードを既存のバリデーションルール（s + 数字1〜6桁）で検証する
4. WHEN `--test` フラグが指定された場合、THE CLI SHALL テストプレフィックス（`__dns_auto_test-`）を TXT レコード名に付与し、UPSERT で登録する
5. WHEN `--env-file` オプションが指定された場合、THE CLI SHALL 指定されたファイルから環境変数を読み込む
6. IF バリデーションエラーが発生した場合、THEN THE CLI SHALL エラーメッセージを表示して終了コード 1 で終了する
7. THE CLI SHALL encode-name コマンドを対話型にせず、全ての入力をコマンドライン引数で受け取る。引数で日本語の店舗名を直接受け取り、内部で Base64 に変換する
8. WHEN 登録が成功した場合、THE CLI SHALL 登録した TXT レコード名と Base64 エンコード値を標準出力に表示する

### 要件 3: create-records コマンドの実装

**ユーザストーリー:** 運用担当者として、店舗コードと先頭IPアドレスを指定して A レコード 62件と menkata CNAME 62件を一括登録したい。店舗のネットワーク基盤レコードを効率的に作成するため。

#### 受入基準

1. WHEN `create-records --shop-code s1105 --start-ip 192.168.94.65` が実行された場合、THE CLI SHALL yamaokaya.net ゾーンに A レコード 62件を登録する
2. WHEN `create-records --shop-code s1105 --start-ip 192.168.94.65` が実行された場合、THE CLI SHALL internal.menkata.me ゾーンに CNAME レコード 62件を登録する
3. THE Record_Generator SHALL 既存の `generateRecords` 関数のロジック（A レコード生成部分と menkata CNAME 生成部分）を再利用してレコード定義を生成する
4. THE Input_Validator SHALL 店舗コードと先頭IPアドレスを既存のバリデーションルールで検証する
5. THE Record_Manager SHALL yamaokaya.net ゾーンへの登録が失敗した場合にロールバックを実行する
6. THE Record_Manager SHALL menkata ゾーンへの登録が失敗した場合に yamaokaya.net ゾーンのレコードをロールバックする
7. WHEN `--test` フラグが指定された場合、THE CLI SHALL テストプレフィックス付きのレコードを UPSERT で登録する
8. WHEN `--env-file` オプションが指定された場合、THE CLI SHALL 指定されたファイルから環境変数を読み込む
9. IF バリデーションエラーが発生した場合、THEN THE CLI SHALL エラーメッセージを表示して終了コード 1 で終了する
10. THE CLI SHALL create-records コマンドを対話型にせず、全ての入力をコマンドライン引数で受け取る
11. WHEN 登録が成功した場合、THE CLI SHALL 登録レコード数と Change ID を標準出力に表示する
12. WHILE テストモードでない場合、THE Record_Manager SHALL 同一店舗コードの重複レコードが存在しないことを確認する

### 要件 4: add-device コマンドの実装

**ユーザストーリー:** 運用担当者として、1機器ずつ CNAME エイリアスを登録したい。機器の追加・変更を個別に柔軟に行えるようにするため。

#### 受入基準

1. WHEN `add-device --shop-code s1105 --device rt --ip 192.168.94.66` が実行された場合、THE CLI SHALL `rt.s1105.yamaokaya.net` の CNAME エイリアスを対応する A レコード名に向けて登録する
2. THE Input_Validator SHALL 店舗コードを既存のバリデーションルールで検証する
3. THE Input_Validator SHALL 機器タイプが config.json の aliases に定義されていることを検証する
4. THE Input_Validator SHALL 機器IPアドレスが 192.168.x.x 形式であることを検証する
5. WHEN `--test` フラグが指定された場合、THE CLI SHALL テストプレフィックス付きの CNAME レコードを UPSERT で登録する
6. WHEN `--env-file` オプションが指定された場合、THE CLI SHALL 指定されたファイルから環境変数を読み込む
7. IF バリデーションエラーが発生した場合、THEN THE CLI SHALL エラーメッセージを表示して終了コード 1 で終了する
8. THE CLI SHALL add-device コマンドを対話型にせず、全ての入力をコマンドライン引数で受け取る
9. WHEN 登録が成功した場合、THE CLI SHALL 登録した CNAME レコード名とエイリアス先を標準出力に表示する
10. THE CLI SHALL CNAME エイリアスの参照先として、指定された IP に対応する既存の A レコード名（`ip192-168-{oct3}-{oct4}.{shopCode}.yamaokaya.net`）を算出する

### 要件 5: 共通オプションの維持

**ユーザストーリー:** 運用担当者として、全コマンドで `--env-file` と `--test` オプションを使用したい。AWS認証とテストモードの運用フローを維持するため。

#### 受入基準

1. THE CLI SHALL `encode-name`、`create-records`、`add-device` の全コマンドで `--env-file` オプションを受け付ける
2. THE CLI SHALL `encode-name`、`create-records`、`add-device` の全コマンドで `--test` オプションを受け付ける
3. THE CLI SHALL 既存の `undo`、`list-tests`、`delete-tests` コマンドを非対話型に変更する。確認プロンプトを削除し、`--yes` フラグも廃止する。実行確認は Cowork の CLAUDE.md / skill.md のルールでユーザに許可を求める方式とする
4. THE CLI SHALL 既存の `parseArgs` 関数と `loadEnvFile` 関数を全コマンドで共通利用する

### 要件 6: 既存ビジネスロジックの再利用

**ユーザストーリー:** 開発者として、既存のバリデーション・レコード生成・レコード管理ロジックを再利用したい。コードの重複を避け、動作の一貫性を保つため。

#### 受入基準

1. THE CLI SHALL validator.ts の `validateShopName`、`validateShopCode`、`validateStartIp` 関数を新コマンドから呼び出す
2. THE CLI SHALL generator.ts の A レコード生成ロジックと menkata CNAME 生成ロジックを create-records コマンドから利用する
3. THE CLI SHALL manager.ts の `RecordManager` クラスを新コマンドから利用する
4. THE CLI SHALL config.ts の `loadConfig` 関数を新コマンドから利用する
5. THE CLI SHALL types.ts の既存型定義（DnsRecord、Config、ValidationResult 等）を新コマンドで利用する

### 要件 7: ドキュメントの更新

**ユーザストーリー:** 運用担当者として、新しいコマンド体系に合わせたドキュメントを参照したい。正しい使い方を把握するため。

#### 受入基準

1. WHEN コマンド体系が変更された場合、THE 開発者 SHALL README.md のコマンド一覧・使い方セクションを新コマンド体系に合わせて更新する
2. WHEN コマンド体系が変更された場合、THE 開発者 SHALL CLAUDE.md を新コマンド体系に合わせて更新する。CLAUDE.md には以下を含める:
   - 全コマンドは Desktop Commander を用いてローカル環境で実行すること
   - cmd.exe を使用すること（PowerShell は使わない）
   - コマンド実行前にプロジェクトディレクトリに移動すること
   - 日本語の店舗名を含むコマンドは一時 JS ファイル経由で実行すること（エンコーディング問題回避）
   - undo/delete-tests は `--yes` フラグを付けること
3. WHEN コマンド体系が変更された場合、THE 開発者 SHALL skills/ フォルダ内のスキルファイルを新コマンド体系に合わせて更新する。スキルファイルは Cowork にユーザがアップロードして使用する形式とする
4. THE README.md SHALL 各新コマンド（encode-name、create-records、add-device）の引数一覧と使用例を記載する
5. THE スキルファイル SHALL 新コマンド体系に対応した手順（encode-name → create-records → add-device の順序）を記載する。各コマンドは Desktop Commander でローカル実行する指示を含める
6. THE スキルファイル SHALL YAML frontmatter（name, description）を含むこと（Cowork のスキル登録に必要）
7. THE CLAUDE.md SHALL 実行環境が Claude Cowork + Desktop Commander であることを明記し、サンドボックス内での実行を禁止するルールを含める
8. THE CLAUDE.md / スキルファイル SHALL 「レコードの登録・削除・取り消しコマンドを実行する前に、必ずユーザに許可を求めること」というルールを含める（CLI 側の確認プロンプトを廃止したため）
9. THE CLAUDE.md / スキルファイル SHALL 一時 JS ファイルの作成を行わないこと。店舗名は Base64 エンコードされるため、日本語のエンコーディング問題は発生しない

### 要件 8: エラーハンドリングの統一

**ユーザストーリー:** 運用担当者として、全コマンドで一貫したエラーメッセージを受け取りたい。問題発生時に適切な対処を行えるようにするため。

#### 受入基準

1. IF AWS認証エラーが発生した場合、THEN THE CLI SHALL 既存の `getAwsAuthErrorMessage` 関数を使用してエラーメッセージを表示する
2. IF ネットワークエラーが発生した場合、THEN THE CLI SHALL 既存の `isNetworkError` 関数を使用してエラーを判定し、適切なメッセージを表示する
3. IF 必須引数が不足している場合、THEN THE CLI SHALL 不足している引数名を含むエラーメッセージを表示して終了コード 1 で終了する
4. THE CLI SHALL 全コマンドで non-interactive モードのエラーハンドリング方式（技術的メッセージをそのまま表示）を採用する
