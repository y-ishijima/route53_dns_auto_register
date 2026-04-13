# Requirements Document

## Introduction

DNS登録ツールのアーキテクチャを変更する。現在はClaude CoworkからDesktop Commanderを経由してローカル環境でCLIコマンド（`npx dns-register ...`）を実行し、Route53 APIを呼び出す設計である。CoworkからAWSへ直接通信できるようになったため、MCPサーバーを新設し、Cowork上でRoute53 APIを直接呼び出す実行パスを追加する。

既存のCLIエントリポイント（cli.ts）はデバッグ・IT部門向けのローカル実行パスとして維持する。MCPサーバーとCLIの両方から共通の業務ロジック層を呼び出す構成とし、実行基盤を二重化する。

既存の業務ロジック（バリデーション、レコード生成、登録、削除、undo、テスト管理）はそのまま維持する。

## Glossary

- **Cowork**: Claude Desktopに搭載されたAIアシスタント機能。ユーザーとの対話およびツール実行を行う
- **Desktop_Commander**: Claude DesktopのMCPコネクター。ローカル環境でシェルコマンドを実行する機能（Cowork経由の実行ではMCPサーバーに置き換え。CLIローカル実行は維持）
- **Route53_API**: AWS Route53のDNSレコード管理API
- **Record_Manager**: Route53 APIを使用したDNSレコードの登録・削除・ロールバック・同期確認を担当するモジュール（src/manager.ts）
- **Record_Generator**: 店舗コードと先頭IPアドレスからDNSレコード定義を生成するモジュール（src/generator.ts）
- **Input_Validator**: ユーザ入力（店舗名、店舗コード、先頭IPアドレス）の妥当性を検証するモジュール（src/validator.ts）
- **Test_Record_Manager**: テストレコードの一覧取得・一括削除を担当するモジュール（src/test-manager.ts）
- **Undo_Manager**: 直前の登録情報の保存・読み込み・取り消し期限判定を行うモジュール（src/undo.ts）
- **MCP_Server**: Model Context Protocolサーバー。Coworkがツールとして呼び出せるエンドポイントを提供する
- **Skill_File**: Coworkの動作手順を定義したMarkdownファイル（skills/*.md）
- **CLAUDE_MD**: Cowork用のガイド・ルールファイル（CLAUDE.md）

## Requirements

### Requirement 1: MCPサーバーとしてのツール公開

**User Story:** IT部門の担当者として、DNS登録ツールの各機能をMCPサーバー経由でCoworkから直接呼び出せるようにしたい。Desktop Commanderを経由せずにレコード操作を実行できるようにするため。

#### Acceptance Criteria

1. THE MCP_Server SHALL 以下のツールをCoworkに公開する: `encode-name`、`create-records`、`add-device`、`undo`、`list-tests`、`delete-tests`
2. WHEN Coworkがツールを呼び出した場合、THE MCP_Server SHALL 既存のInput_Validator、Record_Generator、Record_Manager、Test_Record_Manager、Undo_Managerの業務ロジックをそのまま実行する
3. THE MCP_Server SHALL 各ツールの入力パラメータをJSON Schemaで定義し、Coworkに型情報を提供する
4. WHEN ツールの実行が成功した場合、THE MCP_Server SHALL 実行結果を構造化されたJSON形式で返却する
5. WHEN ツールの実行が失敗した場合、THE MCP_Server SHALL エラーメッセージを日本語で返却する

### Requirement 2: AWS認証情報の管理

**User Story:** IT部門の担当者として、AWS認証情報をMCPサーバーの設定で管理したい。.envファイルの手動管理を継続しつつ、MCPサーバーが認証情報を正しく読み込めるようにするため。

#### Acceptance Criteria

1. THE MCP_Server SHALL 起動時に.envファイルからAWS認証情報（AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY、AWS_SESSION_TOKEN）を読み込む
2. IF .envファイルが存在しない場合、THEN THE MCP_Server SHALL 「.envファイルが見つかりません」というエラーメッセージを返却する
3. IF AWS認証情報が無効または期限切れの場合、THEN THE MCP_Server SHALL 「AWSの認証情報が無効です。IT部門に連絡してください。」というエラーメッセージを返却する
4. THE MCP_Server SHALL ゾーンID（yamaokaya.net: ZPS49ZOFSRKVC、internal.menkata.me: Z06858143PXEUA7VN6S4G）とリージョン（ap-northeast-1）をハードコード値として保持する

### Requirement 3: CLIエントリポイントの維持と業務ロジック層の共通化

**User Story:** IT部門の担当者として、デバッグやローカルテスト時にCLIから直接コマンドを実行できる手段を維持したい。MCPサーバーとCLIの両方から同じ業務ロジックを呼び出せるようにするため。

#### Acceptance Criteria

1. THE System SHALL MCPサーバーとCLIの両方から呼び出せる共通の業務ロジック層を提供する
2. THE CLI SHALL 既存のコマンド体系（encode-name、create-records、add-device、undo、list-tests、delete-tests）を維持する
3. THE CLI SHALL 共通の業務ロジック層を呼び出し、結果をコンソールに出力する
4. THE MCP_Server SHALL 共通の業務ロジック層を呼び出し、結果をMCPレスポンスとして返却する
5. THE CLI SHALL encode-nameコマンドで`--shop-name`（平文）を受け付け、内部でBase64エンコードを実行する（`--shop-name-base64`パラメータは廃止する）

### Requirement 4: encode-nameツールの実装

**User Story:** ユーザーとして、Coworkに店舗名と店舗コードを伝えるだけで、TXTレコードの登録を実行したい。Base64エンコードを意識せずに、平文の店舗名を渡すだけで登録できるようにするため。

#### Acceptance Criteria

1. WHEN shop_nameとshop_codeが指定された場合、THE MCP_Server SHALL 店舗名（平文）をツール内部でUTF-8 Base64エンコードし、TXTレコードを登録する
2. THE MCP_Server SHALL shop_name_base64パラメータを受け付けない（Base64エンコードはツール内部で完結する）
3. WHEN テストモード（test_mode=true）が指定された場合、THE MCP_Server SHALL `__dns_auto_test-`プレフィックスを付与し、UPSERTアクションで登録する
4. WHEN 本番モードで同名のTXTレコードが既に存在する場合、THE MCP_Server SHALL 「このTXTレコードは既に登録されています。」というエラーを返却する
5. WHEN 登録が成功した場合、THE MCP_Server SHALL TXTレコード名とBase64値を含む結果を返却する

### Requirement 5: create-recordsツールの実装

**User Story:** ユーザーとして、Coworkに店舗コードと先頭IPアドレスを伝えるだけで、Aレコード62件とmenkata CNAME 62件の一括登録を実行したい。

#### Acceptance Criteria

1. WHEN shop_codeとstart_ipが指定された場合、THE MCP_Server SHALL Record_Generatorを使用してレコード定義を生成し、Record_Managerで登録する
2. WHEN 本番モードで同一店舗コードのレコードが既に存在する場合、THE MCP_Server SHALL 「この店舗コードのレコードは既に登録されています。」というエラーを返却する
3. WHEN 登録が成功した場合、THE MCP_Server SHALL 登録レコード数とChange IDを含む結果を返却する
4. WHEN 本番モードで登録が成功した場合、THE MCP_Server SHALL Undo_Managerを使用して登録情報を保存する
5. WHEN menkata.meゾーンへの登録が失敗した場合、THE MCP_Server SHALL yamaokaya.netゾーンのレコードを自動ロールバックし、エラーを返却する

### Requirement 6: add-deviceツールの実装

**User Story:** ユーザーとして、Coworkに店舗コード、機器タイプ、IPアドレスを伝えるだけで、機器のCNAMEエイリアスを登録したい。

#### Acceptance Criteria

1. WHEN shop_code、device、ipが指定された場合、THE MCP_Server SHALL 対応するAレコード名を算出し、CNAMEレコードを登録する
2. WHEN 本番モードで同名のCNAMEレコードが既に存在する場合、THE MCP_Server SHALL 「このCNAMEレコードは既に登録されています。」というエラーを返却する
3. WHEN 登録が成功した場合、THE MCP_Server SHALL CNAMEレコード名とエイリアス先を含む結果を返却する

### Requirement 7: undoツールの実装

**User Story:** ユーザーとして、Coworkに「取り消したい」と伝えるだけで、直前の登録を取り消したい。

#### Acceptance Criteria

1. WHEN undoツールが呼び出された場合、THE MCP_Server SHALL Undo_Managerから直前の登録情報を読み込む
2. IF 取り消し可能な登録が存在しない場合、THEN THE MCP_Server SHALL 「取り消し可能な登録がありません。」というメッセージを返却する
3. IF 登録日と異なる日付の場合、THEN THE MCP_Server SHALL 「登録日と異なる日付のため、取り消しできません。IT部門に連絡してください。」というメッセージを返却する
4. WHEN 取り消しが実行可能な場合、THE MCP_Server SHALL Record_Managerを使用して両ゾーンのレコードを削除する

### Requirement 8: テストレコード管理ツールの実装

**User Story:** IT部門の担当者として、テストレコードの一覧表示と一括削除をCoworkから直接実行したい。

#### Acceptance Criteria

1. WHEN list-testsツールが呼び出された場合、THE MCP_Server SHALL Test_Record_Managerを使用して両ゾーンのテストレコード一覧を取得し、構造化データとして返却する
2. WHEN delete-testsツールが呼び出された場合、THE MCP_Server SHALL Test_Record_Managerを使用してテストレコードを一括削除し、削除結果（成功件数・失敗件数）を返却する
3. IF テストレコードが存在しない場合、THEN THE MCP_Server SHALL 「テストレコードが見つかりません。」というメッセージを返却する

### Requirement 9: スキルファイルとCLAUDE.mdの更新

**User Story:** ユーザーとして、新しいアーキテクチャに対応したスキルファイルとCLAUDE.mdを使用したい。Desktop Commander関連の手順を排除し、MCPツール呼び出しの手順に置き換えるため。

#### Acceptance Criteria

1. THE Skill_File SHALL Desktop Commanderのexecute_command呼び出しをMCPツール呼び出しに置き換える
2. THE Skill_File SHALL `npx dns-register`コマンドの記述を排除し、MCPツール名とパラメータの記述に置き換える
3. THE CLAUDE_MD SHALL 「Desktop Commander でローカル実行」の記述を「MCPサーバー経由で直接実行」に置き換える
4. THE CLAUDE_MD SHALL `--env-file .env`の記述を排除する（MCPサーバーが自動的に.envを読み込むため）
5. THE Skill_File SHALL 各操作の実行前にユーザーに許可を求める手順を維持する
6. THE Skill_File SHALL Base64エンコード手順の記述を排除する（encode-nameツールが内部でエンコードを実行するため）
7. THE Skill_File SHALL 「Desktop Commanderは使用しない。全操作はMCPツール経由で実行すること。」という禁止ルールを明記する

### Requirement 10: 入力バリデーションの維持

**User Story:** ユーザーとして、MCPサーバー経由でも既存と同じバリデーションが適用されることを期待する。不正な入力による誤登録を防止するため。

#### Acceptance Criteria

1. THE MCP_Server SHALL 店舗名のバリデーション（1-30文字、許可文字種のみ）をInput_Validatorを使用して実行する
2. THE MCP_Server SHALL 店舗コードのバリデーション（s + 数字1-6桁）をInput_Validatorを使用して実行する
3. THE MCP_Server SHALL 先頭IPアドレスのバリデーション（192.168.x.x形式、サブネット境界チェック）をInput_Validatorを使用して実行する
4. WHEN バリデーションが失敗した場合、THE MCP_Server SHALL Input_Validatorが返す日本語エラーメッセージをそのまま返却する

### Requirement 11: エラーハンドリングの統一

**User Story:** ユーザーとして、MCPサーバー経由でもわかりやすい日本語のエラーメッセージを受け取りたい。

#### Acceptance Criteria

1. IF AWS認証情報が未設定の場合、THEN THE MCP_Server SHALL 「AWSの認証設定がされていません。セットアップ手順を確認してください。」というエラーを返却する
2. IF AWS認証情報が期限切れまたは無効の場合、THEN THE MCP_Server SHALL 「AWSの認証情報が無効です。IT部門に連絡してください。」というエラーを返却する
3. IF ネットワーク接続エラーが発生した場合、THEN THE MCP_Server SHALL 「インターネットに接続できません。ネットワーク接続を確認してください。」というエラーを返却する
4. THE MCP_Server SHALL cli.tsのgetAwsAuthErrorMessage関数とisNetworkError関数のエラー判定ロジックを再利用する
