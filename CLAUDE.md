# DNS Register ガイド

## ツール概要

店舗のネットワーク設定を登録するツール。CLIコマンドを直接実行する。

## 絶対ルール

- Cowork 開始時には `git pull && npm install && npx tsc` を実行して、最新の状態にすること。
- レコードの登録・削除・取り消しツールを実行する前に、必ずユーザに許可を求めること。
- 登録または削除が完了したら、必ず結果一覧を表示すること（テスト・本番問わず）。
- 全操作はCLIコマンド経由で実行すること。Desktop Commanderは使用しない。
- 一時 JS ファイルを作成しないこと。店舗名は encode-name コマンドが内部で Base64 エンコードするため、日本語のエンコーディング問題は発生しない。

## CLIコマンド一覧

| コマンド | 実行例 | 説明 |
|-------|------|------|
| `encode-name` | `npx dns-register encode-name --shop-name "{SHOP_NAME}" --shop-code {SHOP_CODE} --env-file .env` | 店舗名TXTレコード登録 |
| `create-records` | `npx dns-register create-records --shop-code {SHOP_CODE} --start-ip {START_IP} --env-file .env` | Aレコード62件+CNAME62件一括登録 |
| `add-device` | `npx dns-register add-device --shop-code {SHOP_CODE} --device {DEVICE_TYPE} --ip {DEVICE_IP} --env-file .env` | 機器CNAMEエイリアス登録 |
| `undo` | `npx dns-register undo --env-file .env` | 直前の登録取り消し |
| `list-tests` | `npx dns-register list-tests --env-file .env` | テストレコード一覧取得 |
| `delete-tests` | `npx dns-register delete-tests --env-file .env` | テストレコード一括削除 |

- `register` コマンドは廃止済み。`encode-name` → `create-records` → `add-device` の順で実行すること。
- `undo` は `--operation-id {OPERATION_ID}` オプションで個別取り消しが可能。
- `undo` / `delete-tests` は非対話型（即実行される）。
- テストモードは `--test` フラグを追加する。

## 設定

- ゾーン ID とリージョンはアプリケーション内にハードコードされている（変更不要）。
- `.env` ファイルには AWS 認証情報のみ設定する（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）。CLIコマンドは `--env-file .env` で認証情報を読み込む。
- `config.json` は不要。
- 機器タイプ（`device`）は任意の文字列を受け付ける（バリデーションなし）。

## 使い方

Cowork 開始時に `.claude/skills/dns-register/SKILL.md` を読み込み、その手順に従って操作を実行すること。

## バリデーションルール

- 店舗名: 1-30文字、漢字・ひらがな・カタカナ・英数字・スペース・長音記号・中黒のみ
- 店舗コード: s + 数字1-6桁（^s\d{1,6}$）
- IP: 192.168.x.x 形式、第4オクテット+61<=254
- 機器IP: 先頭から62件範囲内、重複不可
