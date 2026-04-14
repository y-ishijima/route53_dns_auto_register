# 機能仕様書: 店舗ネットワーク設定 登録ツール

## 1. ツール概要

店舗のネットワーク設定（DNSレコード）をAWS Route53に登録するためのCLIツール。Claude Desktop の Cowork 機能と連携し、非IT部門のユーザーが対話形式で操作できる。

### 対象ユーザー

| ユーザー | 操作方法 | 用途 |
|---------|---------|------|
| 非IT部門 | Cowork（対話形式） | 店舗の新規登録・テスト・取り消し |
| IT部門 | ローカルCLI（コマンドライン） | デバッグ・非常用操作・保守 |

### 対象ゾーン

| ゾーン | ゾーンID | 用途 |
|-------|---------|------|
| yamaokaya.net | ZPS49ZOFSRKVC | Aレコード、TXTレコード、CNAMEエイリアス |
| internal.menkata.me | Z06858143PXEUA7VN6S4G | menkata CNAMEレコード |

---

## 2. セットアップ手順

### 前提条件

- Git がインストール済み
- インターネット接続

### 手順

1. IT部門から受け取った `setup.bat` をダブルクリック
   - Git の存在確認
   - Node.js の存在確認（未インストール時は自動インストール）
   - `git clone`（PAT付きURL）でプロジェクトをダウンロード
2. `route53_dns_auto_register/.env` に AWS 認証情報を設定
3. Claude Desktop の Cowork でプロジェクトフォルダを開く
4. Cowork が自動で `git pull && npm install && npx tsc` を実行し、スキルファイルを読み込む

> セットアップは初回のみ。以降は Cowork 起動時に自動で最新化される。

---

## 3. コマンド一覧

| コマンド | 説明 | 本番/テスト |
|---------|------|-----------|
| `encode-name` | 店舗名TXTレコード登録 | 両方 |
| `create-records` | Aレコード62件 + menkata CNAME 62件一括登録 | 両方 |
| `add-device` | 機器CNAMEエイリアス登録 | 両方 |
| `undo` | 登録の取り消し（同日以内） | 本番のみ |
| `list-tests` | テストレコード一覧取得 | テストのみ |
| `delete-tests` | テストレコード一括削除 | テストのみ |

### 共通オプション

| オプション | 説明 |
|-----------|------|
| `--env-file .env` | AWS認証情報ファイルのパス |
| `--test` | テストモード（プレフィックス付与、UPSERT使用） |

---

## 4. 各コマンドの仕様

### 4.1 encode-name

店舗名（平文）をUTF-8 Base64エンコードし、TXTレコードとして登録する。

**入力:**

| 引数 | 必須 | 説明 |
|------|------|------|
| `--shop-name` | ○ | 店舗名（日本語の平文） |
| `--shop-code` | ○ | 店舗コード |
| `--test` | - | テストモード |
| `--env-file` | - | 環境変数ファイル |

**動作:**
1. 店舗コードバリデーション
2. 店舗名バリデーション
3. 書き込みチェック（テスト: test-records.json、本番: .last-registration.json）
4. Base64エンコード（内部処理）
5. 本番モード時: 重複チェック（checkDuplicateTxt）
6. Route53にTXTレコード登録（本番: CREATE、テスト: UPSERT）
7. テストモード時: test-records.json に追記
8. 本番モード時: .last-registration.json にundo情報を追記

**出力:** TXTレコード名、Base64値

### 4.2 create-records

Aレコード62件 + menkata CNAME 62件を一括登録する。

**入力:**

| 引数 | 必須 | 説明 |
|------|------|------|
| `--shop-code` | ○ | 店舗コード |
| `--start-ip` | ○ | 先頭IPアドレス（192.168.x.x） |
| `--test` | - | テストモード |
| `--env-file` | - | 環境変数ファイル |

**動作:**
1. 店舗コードバリデーション
2. 先頭IPアドレスバリデーション
3. 書き込みチェック
4. レコード生成（generator.ts）
5. 本番モード時: 重複チェック（checkDuplicateShopCode）
6. yamaokaya.net ゾーンに登録（Aレコード + CNAMEエイリアス）
7. internal.menkata.me ゾーンに登録（CNAME 62件）
8. menkata登録失敗時: yamaokaya.netのレコードを自動ロールバック
9. テストモード時: test-records.json に追記
10. 本番モード時: .last-registration.json にundo情報を追記

**出力:** 登録レコード数、各ゾーンのChange ID

### 4.3 add-device

機器のCNAMEエイリアスを1件登録する。

**入力:**

| 引数 | 必須 | 説明 |
|------|------|------|
| `--shop-code` | ○ | 店舗コード |
| `--device` | ○ | 機器タイプ（任意の文字列） |
| `--ip` | ○ | 機器IPアドレス（192.168.x.x） |
| `--test` | - | テストモード |
| `--env-file` | - | 環境変数ファイル |

**動作:**
1. 店舗コードバリデーション
2. IPアドレス形式検証（192.168.x.x、各オクテット0-255）
3. 書き込みチェック
4. Aレコード名算出（第3・第4オクテットを3桁ゼロパディング）
5. 本番モード時: 重複チェック（checkDuplicateCname）
6. Route53にCNAMEレコード登録
7. テストモード時: test-records.json に追記
8. 本番モード時: .last-registration.json にundo情報を追記

**出力:** CNAMEレコード名、エイリアス先

### 4.4 undo

登録の取り消し。同日中の登録操作を個別に選択して取り消しできる。

**入力:**

| 引数 | 必須 | 説明 |
|------|------|------|
| `--operation-id` | - | 取り消す操作のID（省略時は一覧表示） |
| `--env-file` | - | 環境変数ファイル |

**動作（一覧モード: operation-id省略時）:**
1. .last-registration.json を読み込み
2. 前日以前のエントリをクリーンアップ
3. undone=false のエントリを一覧表示

**動作（削除モード: operation-id指定時）:**
1. 指定された操作IDのエントリを検索
2. ツール種別に応じてRoute53からレコードを削除
   - encode-name: TXTレコード1件削除
   - create-records: 両ゾーンの全レコード削除
   - add-device: CNAMEレコード1件削除
3. エントリのundoneフラグをtrueに更新

**制約:** 登録日と同日以内のみ取り消し可能

### 4.5 list-tests

両ゾーンのテストレコード一覧を取得する（Route53全スキャン）。

**動作:** Route53の全レコードをスキャンし、`auto_dns_test_` プレフィックス付きレコードを収集

**注意:** ゾーン内のレコード数が多い場合（15,000件以上）、実行に時間がかかる

### 4.6 delete-tests

テストレコードを一括削除する。

**動作（デフォルト: ファイルベース削除）:**
1. test-records.json からテストレコード情報を読み込み
2. ゾーンごとにグループ化してRoute53 APIで削除
3. 削除成功分をtest-records.jsonから除去

**動作（`--fullscan` オプション: 全スキャン削除）:**
1. Route53を全スキャンしてテストレコードを検出
2. 検出したレコードを削除
3. test-records.jsonをクリア

---

## 5. バリデーションルール

### 店舗名

| ルール | 詳細 |
|-------|------|
| 文字数 | 1〜30文字 |
| 許可文字 | 漢字、ひらがな、カタカナ、英数字（半角・全角）、スペース（半角・全角）、長音記号（ー）、中黒（・） |
| エラー | 「店舗名に使用できない文字が含まれています。」 |

### 店舗コード

| ルール | 詳細 |
|-------|------|
| パターン | `s` + 数字1〜6桁（正規表現: `^s\d{1,6}$`） |
| 例 | s1, s123, s999999 |
| エラー | 「店舗コードが正しくありません。s + 数字1〜6桁で入力してください。」 |

### 先頭IPアドレス

| ルール | 詳細 |
|-------|------|
| 形式 | 192.168.x.x（各オクテット0-255） |
| サブネット境界 | 第4オクテット + 61 <= 254 |
| エラー | 「このIPアドレスでは62件のレコードを作成できません。」 |

### 機器IPアドレス（add-device）

| ルール | 詳細 |
|-------|------|
| 形式 | 192.168.x.x |
| エラー | 「IPアドレスが正しくありません。192.168.x.x の形式で入力してください。」 |

---

## 6. レコード生成・命名規則

### 生成ルール

1店舗あたり:
- yamaokaya.net Aレコード: 62件（先頭IPから連番）
- yamaokaya.net CNAMEエイリアス: 機器数分
- internal.menkata.me CNAME: 62件（yamaokaya.net Aレコードへの参照）

### 命名規則

| レコード種別 | ゾーン | パターン | 例 |
|---|---|---|---|
| TXTレコード | yamaokaya.net | `{shopCode}.yamaokaya.net` | `s1105.yamaokaya.net` |
| Aレコード | yamaokaya.net | `ip192-168-{oct3:3桁}-{oct4:3桁}.{shopCode}.yamaokaya.net` | `ip192-168-094-065.s1105.yamaokaya.net` |
| CNAMEエイリアス | yamaokaya.net | `{device}.{shopCode}.yamaokaya.net` | `rt.s1105.yamaokaya.net` |
| menkata CNAME | internal.menkata.me | `ip192-168-{oct3:3桁}-{oct4:3桁}.internal.menkata.me` | `ip192-168-094-065.internal.menkata.me` |

### TTL設定

| レコード種別 | TTL（秒） |
|------------|----------|
| Aレコード | 300 |
| CNAMEエイリアス | 3600 |
| menkata CNAME | 300 |
| TXTレコード | 300 |

---

## 7. レコード登録の動作

### 登録順序（create-records）

1. yamaokaya.net ゾーンに登録（Aレコード + CNAMEエイリアスを1つのChangeBatchで）
2. internal.menkata.me ゾーンに登録（CNAME 62件）

### ロールバック

menkata.me ゾーンへの登録が失敗した場合、yamaokaya.net ゾーンのレコードを自動削除（ロールバック）する。

### 重複チェック

| チェック対象 | メソッド | エラーメッセージ |
|------------|---------|---------------|
| 店舗コード（create-records） | checkDuplicateShopCode | 「この店舗コードのレコードは既に登録されています。」 |
| TXTレコード（encode-name） | checkDuplicateTxt | 「このTXTレコードは既に登録されています。」 |
| CNAMEレコード（add-device） | checkDuplicateCname | 「このCNAMEレコードは既に登録されています。」 |

> 重複チェックは本番モード時のみ実行。テストモードではUPSERTを使用するため不要。

---

## 8. テストモードの仕様

### プレフィックス

テストモードでは全レコード名に `auto_dns_test_` プレフィックスが付与される。

| 本番 | テスト |
|------|-------|
| `s1105.yamaokaya.net` | `auto_dns_test_s1105.yamaokaya.net` |
| `ip192-168-094-065.s1105.yamaokaya.net` | `auto_dns_test_ip192-168-094-065.s1105.yamaokaya.net` |

### 登録アクション

| モード | アクション | 重複チェック |
|-------|----------|------------|
| 本番 | CREATE | あり |
| テスト | UPSERT | なし |

### テストレコード情報ファイル（test-records.json）

テスト登録時にレコード情報を自動保存。delete-tests のファイルベース削除で使用。

```json
{
  "records": [
    {
      "zoneId": "ZPS49ZOFSRKVC",
      "name": "auto_dns_test_s9999.yamaokaya.net",
      "type": "TXT",
      "value": "\"dGVzdA==\"",
      "ttl": 300,
      "registeredAt": "2026-04-14T10:00:00.000Z"
    }
  ]
}
```

削除成功時にファイルから該当レコードを除去。

---

## 9. undo機能の仕様

### undo情報ファイル（.last-registration.json）

```json
{
  "entries": [
    {
      "operationId": "op_1713088800000_abc123",
      "toolType": "encode-name",
      "shopCode": "s1105",
      "shopName": "山岡家 札幌店",
      "registeredAt": "2026-04-14T10:00:00.000Z",
      "undone": false,
      "singleRecords": [
        {
          "zoneId": "ZPS49ZOFSRKVC",
          "name": "s1105.yamaokaya.net",
          "type": "TXT",
          "value": "\"5bGx5bKh5a62..\"",
          "ttl": 300
        }
      ]
    }
  ]
}
```

### 蓄積動作

- 本番モード登録成功時にエントリを追記（上書きではなく蓄積）
- 各エントリに一意の操作ID（`op_{timestamp}_{random}`）を付与
- undoneフラグ（初期値: false）で取り消し状態を管理

### 取り消し制約

- 登録日と同日以内のみ取り消し可能
- 前日以前のエントリはファイル読み込み時に自動クリーンアップ

### undo実施フラグ

- undo実行時: 対象エントリのundoneをtrueに更新（ファイルから削除しない）
- 同日中はundo済みエントリも保持（履歴として確認可能）
- 日付が変わったタイミングでファイルから自動削除

---

## 10. ファイル管理

| ファイル | 用途 | 永続性 |
|---------|------|-------|
| `.env` | AWS認証情報 | 永続（手動管理） |
| `.last-registration.json` | undo情報 | 同日中保持、翌日クリーンアップ |
| `test-records.json` | テストレコード情報 | 削除成功時に除去 |
| `.claude/skills/dns-register/SKILL.md` | Coworkスキルファイル | 永続（git管理） |
| `CLAUDE.md` | Coworkガイド・ルール | 永続（git管理） |

### .gitignore

以下のファイルはgit管理対象外:
- `.env`
- `.last-registration.json`
- `test-records.json`
- `dist/`
- `node_modules/`

---

## 11. エラーハンドリング

| エラー種別 | エラーメッセージ | 対応 |
|-----------|---------------|------|
| AWS認証未設定 | 「AWSの認証設定がされていません。セットアップ手順を確認してください。」 | .env確認 |
| AWS認証期限切れ | 「AWSの認証情報が無効です。IT部門に連絡してください。」 | .env更新 |
| ネットワーク接続エラー | 「インターネットに接続できません。ネットワーク接続を確認してください。」 | 接続確認 |
| バリデーションエラー | validator.tsが返す日本語メッセージ | 入力修正 |
| 重複レコード | 「このTXTレコードは既に登録されています。」等 | Route53確認 |
| undo対象なし | 「取り消し可能な登録がありません。」 | - |
| undo期限切れ | 「登録日と異なる日付のため、取り消しできません。IT部門に連絡してください。」 | IT部門対応 |
| ファイル書き込み不可 | 「ファイルの書き込みに失敗しました: {path}。IT部門に連絡してください。」 | 権限確認 |

---

## 12. preflight書き込みチェック

全登録コマンド（encode-name, create-records, add-device）の実行前に、ファイルの書き込み可否を事前チェックする。

| モード | チェック対象ファイル |
|-------|------------------|
| テスト | test-records.json |
| 本番 | .last-registration.json |

書き込み不可の場合、Route53への登録を実行せずにエラーを返す。これにより、Route53登録後にファイル保存に失敗する事態を防止する。

---

## 13. Cowork連携

### 起動時の自動処理

CLAUDE.mdのルールにより、Cowork起動時に以下が自動実行される:

1. `git pull && npm install && npx tsc`（最新化）
2. `.claude/skills/dns-register/SKILL.md` の読み込み

### スキルファイル

`.claude/skills/dns-register/SKILL.md` に全操作手順が定義されている。Coworkはこのファイルの手順に従って、ユーザーとの対話形式でCLIコマンドを実行する。

### CLAUDE.md

Cowork用のガイド・ルールファイル。絶対ルール、CLIコマンド一覧、設定情報、バリデーションルールを記載。

---

## 14. IAMポリシーと動作環境

### 必要なIAM権限

| 権限 | 用途 |
|------|------|
| `route53:ChangeResourceRecordSets` | レコードの登録・削除 |
| `route53:ListResourceRecordSets` | レコード一覧の取得 |
| `route53:GetHostedZone` | ホストゾーン情報の取得 |
| `route53:GetChange` | 変更リクエストのステータス確認 |

対象リソース: yamaokaya.net（ZPS49ZOFSRKVC）、internal.menkata.me（Z06858143PXEUA7VN6S4G）

### 動作環境要件

| 項目 | 要件 |
|------|------|
| OS | Windows 10以降 |
| Git | インストール済み |
| Node.js | v22.x (LTS)（setup.batで自動インストール） |
| Claude Desktop | Cowork機能対応版 |
| ネットワーク | インターネット接続必須 |
