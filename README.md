# 店舗ネットワーク設定 登録ツール

## このツールについて

新しい店舗のネットワーク設定を登録するためのツールです。
画面の案内に従って情報を入力するだけで、登録が完了します。

---

## はじめかた

### Windows の場合

1. プロジェクトフォルダ内の `setup.bat` をダブルクリックしてください
   - Node.js が未インストールの場合は自動でインストールされます
   - インストール後、setup.bat をもう一度実行してください
2. セットアップが完了したら、AWS認証情報を設定します（下記参照）

### macOS / Linux の場合

1. ターミナルを開き、プロジェクトフォルダに移動してください
2. 以下のコマンドを実行してください:

```
bash setup.sh
```

   - Homebrew がインストール済みであれば、Node.js も自動でインストールされます
   - Homebrew が未インストールの場合は、画面の案内に従ってインストールしてください
3. セットアップが完了したら、AWS認証情報を設定します（下記参照）

### AWS認証情報の設定

`.env` ファイルに AWS 認証情報を設定してください。IT部門から受け取った認証情報を以下の形式で記入します:

```
AWS_ACCESS_KEY_ID=（IT部門から受け取ったキーID）
AWS_SECRET_ACCESS_KEY=（IT部門から受け取ったシークレットキー）
AWS_SESSION_TOKEN=（IT部門から受け取ったセッショントークン）
```

認証情報が切れた場合は、IT部門から新しい認証情報を受け取り、`.env` ファイルを更新してください。

> ゾーン ID とリージョンはアプリケーション内にハードコードされているため、`.env` への設定は不要です。

### Claude Desktop の準備（Cowork で使う場合）

Claude Desktop の Cowork 機能を使ってレコード登録を行う場合は、以下の準備が必要です。

> Cowork 開始時には `git pull` と `npm install` を実行して、最新の状態にしてください。

1. Claude Desktop をインストールしてください（https://claude.ai からダウンロード）
2. MCPサーバーを設定してください。Claude Desktop の設定ファイル（`claude_desktop_config.json`）に以下を追加します:

```json
{
  "mcpServers": {
    "dns-register": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "cwd": "/path/to/route53_dns_auto_register"
    }
  }
}
```

   - `cwd` はプロジェクトフォルダの絶対パスに置き換えてください
   - MCPサーバーが起動時に `.env` ファイルからAWS認証情報を自動で読み込みます
3. プロジェクトフォルダ内の `skills/` フォルダに、操作ごとのスキルファイルが入っています

| ファイル | 用途 |
|---------|------|
| skills/dns-register-skill.md | 全操作（登録・テスト・取り消し・削除） |

---

## 使いかた

### スキルファイルの登録方法

Cowork でレコード登録などの操作を行うには、まずスキルファイルを登録する必要があります。

1. Claude Desktop の画面左下にある「設定を開く」をクリックします
2. 「機能」の「スキル」の項目から「カスタマイズに移動」を選択します
3. 「+」ボタンをクリックし、「スキルを作成」を選択します
4. 「スキルをアップロード」を選択します
5. プロジェクトフォルダ内の `skills/` フォルダを開き、登録したいスキルファイルをドラッグ&ドロップで追加します

| やりたいこと | 登録するファイル |
|------------|----------------|
| 全操作（登録・テスト・取り消し・削除） | `skills/dns-register-skill.md` |

スキルファイルは一度登録すれば、以降は毎回アップロードする必要はありません。

### レコード登録

1. Claude Desktop の Cowork を開きます
2. スキルファイル `dns-register-skill.md` が登録済みであることを確認します（未登録の場合は「スキルファイルの登録方法」を参照）
3. 「レコード登録して」と伝えてください

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

1. スキルファイル `dns-register-skill.md` が登録済みであることを確認します（「スキルファイルの登録方法」参照）
2. 「登録を取り消したい」と伝えてください

### テストデータの削除

テスト登録で作成したデータを削除する場合:

1. スキルファイル `dns-register-skill.md` が登録済みであることを確認します
2. 「テストデータを削除して」と伝えてください

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

テストモードでは `__dns_auto_test-` プレフィックス付きのレコードが登録されます。本番レコードには影響しません。テストモードでは `UPSERT` で登録されるため、同じコマンドを繰り返し実行できます。

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

`skills/` フォルダにスキルファイルを配置しています。ユーザーが Cowork のチャットにアップロードして使用します。MCPサーバー（`dns-register`）の設定が必要です。

| ファイル | 用途 |
|---------|------|
| `skills/dns-register-skill.md` | 全操作（登録・テスト・取り消し・削除） |

Cowork 経由の場合、全操作はMCPツール経由で実行されます。MCPサーバーが起動時に `.env` から AWS 認証情報を自動で読み込むため、`--env-file` の指定は不要です。各操作の実行前にユーザに許可を求めます。

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
| Node.js | v22.x (LTS) |
| メモリ | 2GB以上 |
| ディスク空き容量 | 500MB以上 |
| ネットワーク | インターネット接続必須 |
