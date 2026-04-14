# 店舗ネットワーク設定 登録ツール

## このツールについて

新しい店舗のネットワーク設定を登録するためのツールです。
画面の案内に従って情報を入力するだけで、登録が完了します。

---

## はじめかた

### 必要なもの

- Git（https://git-scm.com からインストール）
- Claude Desktop（https://claude.ai からダウンロード）

### セットアップ手順

1. デスクトップの何もないところを右クリックし、「ターミナルで開く」を選択してください
   - 黒い画面（ターミナル）が開きます
2. 以下のコマンドをコピーして、ターミナルに貼り付けてください（右クリック → 貼り付け）:

```
git clone https://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@github.com/y-ishijima/route53_dns_auto_register.git
```

3. Enter キーを押してください。ダウンロードが始まります
4. 「done」と表示されたら完了です。デスクトップに `route53_dns_auto_register` フォルダが作成されます
5. IT部門から受け取った `.env` ファイルを `route53_dns_auto_register` フォルダ内に配置してください
6. Claude Desktop を開き、Cowork で `route53_dns_auto_register` フォルダをワークスペースとして開いてください
7. 「登録して」と伝えるだけで操作が開始されます

> セットアップは初回のみ必要です。以降は Cowork を起動するだけで使えます。

### AWS認証情報の設定

`.env` ファイルに AWS 認証情報を設定してください。IT部門から受け取った認証情報を以下の形式で記入します:

```
AWS_ACCESS_KEY_ID=（IT部門から受け取ったキーID）
AWS_SECRET_ACCESS_KEY=（IT部門から受け取ったシークレットキー）
AWS_SESSION_TOKEN=（IT部門から受け取ったセッショントークン）
```

認証情報が切れた場合は、IT部門から新しい認証情報を受け取り、`.env` ファイルを更新してください。

> ゾーン ID とリージョンはアプリケーション内にハードコードされているため、`.env` への設定は不要です。

### スキルファイルについて

スキルファイルは `.claude/skills/dns-register/SKILL.md` に配置されています。CLAUDE.mdのルールにより、Coworkが起動時に `git pull` 完了後に自動で読み込みます。手動でのアップロードは不要です。

1. Claude Desktop をインストールしてください（https://claude.ai からダウンロード）
2. Cowork でプロジェクトフォルダをワークスペースとして開いてください
3. Cowork の仮想環境内で CLIコマンド（`npx dns-register <command> --env-file .env`）を直接実行して操作します
4. スキルファイルは `.claude/skills/dns-register/SKILL.md` に配置されており、Cowork が自動で読み込みます

| ファイル | 用途 |
|---------|------|
| .claude/skills/dns-register/SKILL.md | 全操作（登録・テスト・取り消し・削除） |

---

## 使いかた

### スキルファイルについて

スキルファイルは `.claude/skills/dns-register/SKILL.md` に配置されています。CLAUDE.mdのルールにより、Coworkがセッション開始時に自動で読み込みます。手動でのアップロードは不要です。

### レコード登録

1. Claude Desktop の Cowork を開きます
2. 「レコード登録して」と伝えてください

AIが以下の流れで進めます。各ステップで必要な情報を聞かれ、すぐにコマンドが実行されます。

**ステップ1: 店舗名の登録**
- 店舗名と店舗コードを聞かれます
- 入力後、店舗名が登録されます → 結果が表示されます

**ステップ2: IPアドレスレコードの登録**
- 先頭IPアドレスを聞かれます
- 入力後、A レコードと menkata CNAME が一括登録されます → 結果が表示されます

**ステップ3: 機器の登録（繰り返し）**
- 機器タイプの略称とIPアドレスを聞かれます
- 入力後、その機器が登録されます → 結果が表示されます
- 「他に登録する機器はありますか？」と聞かれるので、あれば繰り返します

### 登録の取り消し

登録を間違えた場合は、登録した同日中に以下の手順で取り消してください:

1. 「登録を取り消したい」と伝えてください

### テストデータの削除

テスト登録で作成したデータを削除する場合:

1. 「テストデータを削除して」と伝えてください

登録日と異なる日付になると取り消しができなくなります。その場合はIT部門に連絡してください。

---

## 困ったときは

| こんなとき | 対処法 |
|-----------|--------|
| 「ツールの設定に問題があります」と表示される | AWS認証情報が正しく設定されていない可能性があります。「はじめかた」のAWS認証情報の設定をやり直してください。解決しない場合はIT部門に連絡してください |
| 「インターネットに接続できません」と表示される | ネットワーク接続を確認してから、もう一度お試しください |
| 「登録処理中にエラーが発生しました」と表示される | IT部門に連絡してください |
| IPアドレスの入力でエラーになる | ネットワーク設計書を確認し、正しいIPアドレスを入力してください。形式は `192.168.xx.xx` です |
| 店舗コードが分からない | 店舗一覧表で確認してください。分からない場合はIT部門に連絡してください |
| 取り消しができない | 登録日と異なる日付のため取り消しできません。IT部門に連絡してください |
| セットアップがうまくいかない | IT部門に連絡してください |

---

## IT部門向け情報

以下はIT部門の担当者向けの技術情報です。

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npx dns-register encode-name` | 店舗名を Base64 エンコードし TXT レコード登録 |
| `npx dns-register create-records` | A レコード 62件 + menkata CNAME 62件を一括登録 |
| `npx dns-register add-device` | 機器ごとの CNAME エイリアス登録 |
| `npx dns-register undo` | 直前の登録を取り消し（同日以内） |
| `npx dns-register list-tests` | テストレコードの一覧表示 |
| `npx dns-register delete-tests` | テストレコードの一括削除 |

`register` コマンドは廃止されました。実行すると廃止メッセージが表示されます。

### encode-name コマンド

店舗名を UTF-8 Base64 エンコードし、TXT レコードとして登録します。

```bash
npx dns-register encode-name --shop-name "山岡家 札幌店" --shop-code s1105 --env-file .env
```

| 引数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| `--shop-name` | ○ | 店舗名（平文、内部でBase64エンコード） | `"山岡家 札幌店"` |
| `--shop-code` | ○ | 店舗コード | `s1105` |
| `--test` | - | テストモード | - |
| `--env-file` | - | 環境変数ファイルのパス | `.env` |

> `--shop-name-base64` パラメータは廃止されました。店舗名は平文で `--shop-name` に渡してください。内部でBase64エンコードされます。

### create-records コマンド

A レコード 62件と menkata CNAME 62件を一括登録します。

```bash
npx dns-register create-records --shop-code s1105 --start-ip 192.168.94.65 --env-file .env
```

| 引数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| `--shop-code` | ○ | 店舗コード | `s1105` |
| `--start-ip` | ○ | 先頭IPアドレス | `192.168.94.65` |
| `--test` | - | テストモード | - |
| `--env-file` | - | 環境変数ファイルのパス | `.env` |

### add-device コマンド

機器ごとの CNAME エイリアスを登録します。機器タイプは任意の文字列を受け付けます。

```bash
npx dns-register add-device --shop-code s1105 --device rt --ip 192.168.94.66 --env-file .env
```

| 引数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| `--shop-code` | ○ | 店舗コード | `s1105` |
| `--device` | ○ | 機器タイプ | `rt` |
| `--ip` | ○ | 機器IPアドレス | `192.168.94.66` |
| `--test` | - | テストモード | - |
| `--env-file` | - | 環境変数ファイルのパス | `.env` |

### undo / delete-tests コマンド

`undo` と `delete-tests` は非対話型です。確認プロンプトなしで即実行されます（`--yes` フラグは廃止）。

```bash
# 直前の登録を取り消し
npx dns-register undo --env-file .env

# テストレコードの一括削除
npx dns-register delete-tests --env-file .env
```

### テストモード

テストモードでは `auto_dns_test_` プレフィックス付きのレコードが登録されます。本番レコードには影響しません。テストモードでは `UPSERT` で登録されるため、同じコマンドを繰り返し実行できます。

テスト登録時、レコード情報は `test-records.json` に自動保存されます。Cowork（CLIコマンド）経由の削除はこのファイルを使って高速に実行されます。CLI の `delete-tests` コマンドは Route53 を全スキャンして削除するため、`test-records.json` が失われた場合のフォールバックとして使用できます。

```bash
# テストレコードの登録（3コマンドすべてに --test を付ける）
npx dns-register encode-name --test --shop-name "テスト店" --shop-code s9999 --env-file .env
npx dns-register create-records --test --shop-code s9999 --start-ip 192.168.94.65 --env-file .env
npx dns-register add-device --test --shop-code s9999 --device rt --ip 192.168.94.66 --env-file .env

# テストレコードの一覧表示
npx dns-register list-tests --env-file .env

# テストレコードの一括削除
npx dns-register delete-tests --env-file .env
```

### .env ファイルの設定

全コマンドは `.env` ファイルから AWS 認証情報を読み込みます。`config.json` は不要です。

| 環境変数 | 説明 |
|---------|------|
| `AWS_ACCESS_KEY_ID` | AWSアクセスキーID |
| `AWS_SECRET_ACCESS_KEY` | AWSシークレットアクセスキー |
| `AWS_SESSION_TOKEN` | AWSセッショントークン（必要な場合） |

> ゾーン ID（`YAMAOKAYA_ZONE_ID`、`MENKATA_ZONE_ID`）とリージョン（`AWS_REGION`）はアプリケーション内にハードコードされているため、`.env` への設定は不要です。

### Cowork スキルファイル（AIエージェント連携）

スキルファイルは `.claude/skills/dns-register/SKILL.md` に配置されています。CLAUDE.mdのルールにより、Coworkがセッション開始時に自動で読み込みます。

| ファイル | 用途 |
|---------|------|
| `.claude/skills/dns-register/SKILL.md` | 全操作（登録・テスト・取り消し・削除） |

Cowork 経由の場合、全操作はCLIコマンド経由で実行されます。CLIコマンドは `--env-file .env` で AWS 認証情報を読み込みます。各操作の実行前にユーザに許可を求めます。

### IAMポリシー

必要なIAM権限は `iam-policy.json` に定義しています。以下の権限が必要です:

- `route53:ChangeResourceRecordSets` — レコードの登録・削除
- `route53:ListResourceRecordSets` — レコード一覧の取得
- `route53:GetHostedZone` — ホストゾーン情報の取得
- `route53:GetChange` — 変更リクエストのステータス確認

対象リソースは `yamaokaya.net`（ZPS49ZOFSRKVC）と `internal.menkata.me`（Z06858143PXEUA7VN6S4G）の2つのホストゾーンです。

### レコード命名規則

| レコード種別 | ゾーン | 命名パターン | 例 |
|---|---|---|---|
| TXTレコード | yamaokaya.net | `{shopCode}.yamaokaya.net` | `s1105.yamaokaya.net` |
| Aレコード | yamaokaya.net | `ip192-168-{oct3}-{oct4}.{shopCode}.yamaokaya.net` | `ip192-168-094-065.s1105.yamaokaya.net` |
| CNAMEエイリアス | yamaokaya.net | `{deviceType}.{shopCode}.yamaokaya.net` | `rt.s1105.yamaokaya.net` |
| CNAME | internal.menkata.me | `ip192-168-{oct3}-{oct4}.internal.menkata.me` | `ip192-168-094-065.internal.menkata.me` |

1店舗あたり: TXTレコード1件 + Aレコード62件 + CNAMEエイリアス（機器数分） + menkata CNAME 62件

### トラブルシューティング（技術詳細）

#### AWS認証エラー

| 症状 | 対処法 |
|------|--------|
| 「AWS認証情報が設定されていません」 | `aws configure` で認証情報を設定 |
| 「AWS認証情報が無効です」 | アクセスキーの有効期限を確認し、`aws configure` で再設定 |
| `AccessDeniedException` | IAMポリシーの権限を確認（`iam-policy.json` 参照） |

認証状態の確認: `aws sts get-caller-identity`

#### ネットワークエラー

| 症状 | 対処法 |
|------|--------|
| タイムアウト | プロキシ環境では `HTTP_PROXY` / `HTTPS_PROXY` 環境変数を設定 |

#### レコード登録エラー

| 症状 | 対処法 |
|------|--------|
| 「この店舗コードのレコードは既に登録されています」 | Route53コンソールで既存レコードを削除してから再実行 |
| 「登録処理の途中でエラーが発生したため...」 | 自動ロールバック実行済み。再度登録コマンドを実行 |
| 「登録処理の確認に時間がかかっています」 | Route53コンソールでレコードの状態を確認 |

#### その他

| 症状 | 対処法 |
|------|--------|
| 「取り消し可能な登録がありません」 | `undo` は直前の登録のみ対象。翌日以降はRoute53コンソールから手動削除 |
| ビルドエラー | `npm run build` でTypeScriptのコンパイルエラーを確認 |

### 動作環境要件

| 項目 | 要件 |
|------|------|
| OS | Windows 10以降、macOS 13以降、Linux（Ubuntu 22.04以降） |
| Git | インストール済み |
| Node.js | Cowork仮想環境に標準搭載（ローカルインストール不要） |
| Claude Desktop | Cowork機能対応版 |
| ネットワーク | インターネット接続必須 |
