# 要件定義書

## はじめに

現在、undoツールは `create-records` ハンドラで登録されたレコード群（Aレコード62件 + CNAMEエイリアス + menkata CNAME 62件）のみ取り消しに対応している。本機能拡張では、`encode-name` ハンドラ（TXTレコード1件）および `add-device` ハンドラ（CNAMEレコード1件）の本番モード登録時にもundo情報を保存し、undoツールで取り消し可能にする。

## 用語集

- **Undo_Manager**: 直前の登録情報の保存・読み込み・取り消し期限判定を行うモジュール（src/undo.ts）
- **LastRegistration**: undo用に保存される直前の登録情報の型定義
- **Handler**: 各ツール（encode-name, create-records, add-device）の業務ロジック関数（src/handlers.ts）
- **Record_Manager**: Route53 APIを通じてDNSレコードの登録・削除を行うモジュール（src/manager.ts）
- **Undo_File**: undo情報の保存先ファイル（.last-registration.json）
- **Undo_Window**: 取り消し可能な期間（登録日と同日以内）
- **TXT_Record**: 店舗名をBase64エンコードした値を保持するDNSレコード
- **CNAME_Record**: 機器エイリアスとして登録されるDNSレコード
- **GeneratedRecords**: create-recordsで生成されるレコード群（yamaokayaARecords, yamaokayaCnameAliases, menkataCnameRecords）

## 要件

### 要件1: LastRegistration型の拡張

**ユーザーストーリー:** 開発者として、LastRegistration型がTXTレコード単体およびCNAMEレコード単体の登録情報も表現できるようにしたい。これにより、encode-nameとadd-deviceのundo情報を統一的に保存できる。

#### 受け入れ基準

1. THE LastRegistration SHALL `records` フィールドで GeneratedRecords 型に加え、単体TXTレコード情報および単体CNAMEレコード情報を表現できる構造を持つ
2. THE LastRegistration SHALL 登録元のツール種別（create-records, encode-name, add-device）を識別するフィールドを持つ
3. THE LastRegistration SHALL 既存の create-records 由来のundo情報との後方互換性を維持する

### 要件2: encode-name本番モードでのundo情報保存

**ユーザーストーリー:** オペレーターとして、encode-nameで店舗名TXTレコードを本番登録した際にundo情報が保存されるようにしたい。これにより、誤登録時にundoツールで取り消しできる。

#### 受け入れ基準

1. WHEN encode-name Handler が本番モードでTXTレコードの登録に成功した場合、THE Undo_Manager SHALL 登録したTXTレコードの情報（レコード名、値、TTL、ゾーンID）をUndo_Fileに保存する
2. WHEN encode-name Handler が本番モードでTXTレコードの登録に成功した場合、THE Undo_Manager SHALL 店舗コード、店舗名、登録日時、およびツール種別「encode-name」をUndo_Fileに保存する
3. WHEN encode-name Handler がテストモードで実行された場合、THE Handler SHALL undo情報を保存しない
4. WHEN encode-name Handler が本番モードでundo情報を保存する場合、THE Handler SHALL Route53への登録成功後にundo情報を保存する

### 要件3: add-device本番モードでのundo情報保存

**ユーザーストーリー:** オペレーターとして、add-deviceで機器CNAMEレコードを本番登録した際にundo情報が保存されるようにしたい。これにより、誤登録時にundoツールで取り消しできる。

#### 受け入れ基準

1. WHEN add-device Handler が本番モードでCNAMEレコードの登録に成功した場合、THE Undo_Manager SHALL 登録したCNAMEレコードの情報（レコード名、エイリアス先、TTL、ゾーンID）をUndo_Fileに保存する
2. WHEN add-device Handler が本番モードでCNAMEレコードの登録に成功した場合、THE Undo_Manager SHALL 店舗コード、登録日時、およびツール種別「add-device」をUndo_Fileに保存する
3. WHEN add-device Handler がテストモードで実行された場合、THE Handler SHALL undo情報を保存しない
4. WHEN add-device Handler が本番モードでundo情報を保存する場合、THE Handler SHALL Route53への登録成功後にundo情報を保存する

### 要件4: undoハンドラの拡張

**ユーザーストーリー:** オペレーターとして、同日中に実行した登録操作の一覧を確認し、取り消したい操作を選択して個別に取り消しできるようにしたい。これにより、誤登録のみを安全に取り消しでき、正しい登録を誤って削除するリスクを回避できる。

#### 受け入れ基準

1. WHEN undoツールがパラメータなしで呼び出された場合、THE Handler SHALL 同日中の取り消し可能な登録操作の一覧（登録時刻、ツール種別、店舗コード、店舗名、レコード数）を返す
2. WHEN undoツールが操作IDを指定して呼び出された場合、THE Handler SHALL 指定された操作に対応するレコードのみをRoute53から削除する
3. THE Handler SHALL encode-name由来のTXTレコード、add-device由来のCNAMEレコード、create-records由来のGeneratedRecordsを区別して適切に削除する
4. THE Handler SHALL ツール種別に関わらず、Undo_Windowの制約（登録日と同日以内）を適用する
5. WHEN undoが成功した場合、THE Handler SHALL 取り消した操作の詳細（ツール種別、店舗コード、レコード数）を結果に含める
6. WHEN undoが成功した場合、THE Undo_Manager SHALL Undo_Fileから取り消し済みの操作情報を削除する

### 要件5: undo情報の蓄積と管理

**ユーザーストーリー:** オペレーターとして、同日中に実行した全ての登録操作とその取り消し状態を確認できるようにしたい。これにより、何を登録し、何を取り消したかを把握できる。

#### 受け入れ基準

1. WHEN 新しい本番モード登録（encode-name, create-records, add-device のいずれか）が成功した場合、THE Undo_Manager SHALL 既存のundo情報に新しい登録情報を追記する（上書きではなく蓄積）
2. THE Undo_Manager SHALL 各登録操作に一意の操作IDを付与する
3. THE Undo_Manager SHALL 各登録操作にundo実施フラグ（undone: boolean）を持たせ、初期値はfalseとする
4. WHEN undoが実行された場合、THE Undo_Manager SHALL 対象操作のundo実施フラグをtrueに更新する（レコードはUndo_Fileから削除しない）
5. WHEN undoツールがパラメータなしで呼び出された場合、THE Handler SHALL undo実施フラグがfalseの操作のみを取り消し可能な一覧として返す
6. THE Undo_Manager SHALL 同日中の全登録情報（undo済み・未undo含む）をUndo_Fileに保持する
7. WHEN Undo_Fileの読み込み時に前日以前の情報が含まれている場合、THE Undo_Manager SHALL 当該情報をUndo_Fileから削除する（日付変更時のクリーンアップ）

### 要件6: preflight書き込みチェックの維持

**ユーザーストーリー:** 開発者として、encode-nameおよびadd-deviceの本番モードでもRoute53操作前にUndo_Fileへの書き込み可否チェックが行われることを確認したい。これにより、Route53登録後にundo情報の保存に失敗する事態を防止できる。

#### 受け入れ基準

1. WHEN encode-name Handler が本番モードで実行された場合、THE Handler SHALL Route53操作前にUndo_Fileへの書き込み可否をチェックする
2. WHEN add-device Handler が本番モードで実行された場合、THE Handler SHALL Route53操作前にUndo_Fileへの書き込み可否をチェックする
3. IF Undo_Fileへの書き込みが不可能な場合、THEN THE Handler SHALL Route53操作を実行せずにエラーを返す

### 要件7: Undo_File喪失時の対応

**ユーザーストーリー:** オペレーターとして、Undo_Fileが喪失した場合に適切なエラーメッセージが表示され、IT部門に連絡すべきことが分かるようにしたい。

#### 受け入れ基準

1. WHEN undoツールが呼び出され、Undo_Fileが存在しないまたは読み込みに失敗した場合、THE Handler SHALL 「取り消し可能な登録がありません。登録履歴が見つからない場合はIT部門に連絡してください。」というメッセージを返す
2. THE Handler SHALL Undo_File喪失時にRoute53への操作を一切行わない
