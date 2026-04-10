# DNS Register ガイド

## ツール概要

店舗のネットワーク設定を登録するツール。Claude Cowork + Desktop Commander でローカル実行する。

## 絶対ルール

- Cowork 開始時に `git pull` と `npm install` を Desktop Commander で実行すること。
- skills/ フォルダ内のファイルが更新された場合、ユーザに通知して skills ファイルの再アップロードを促すこと。
- レコードの登録・削除・取り消しコマンドを実行する前に、必ずユーザに許可を求めること。
- 登録または削除が完了したら、必ず結果一覧を表示すること（テスト・本番問わず）。
- 全コマンドは Desktop Commander を用いてローカル環境で実行すること。サンドボックス内での実行は禁止。
- Desktop Commander では cmd.exe を使用すること。PowerShell は使わない（プロファイル干渉の問題があるため）。
- コマンド実行前に、必ず route53_dns_auto_register フォルダに移動すること。`.env` ファイルはプロジェクトディレクトリにある。
- 一時 JS ファイルを作成しないこと。店舗名は Base64 エンコードで登録されるため、日本語のエンコーディング問題は発生しない。
- 全コマンドに `--env-file .env` を付けること。

## コマンド一覧

| コマンド | 説明 | 例 |
|---------|------|-----|
| `encode-name` | 店舗名を Base64 エンコードし TXT レコード登録 | `npx dns-register encode-name --shop-name-base64 {Base64値} --shop-code s1105 --env-file .env` |
| `create-records` | A レコード 62件 + menkata CNAME 62件を一括登録 | `npx dns-register create-records --shop-code s1105 --start-ip 192.168.94.65 --env-file .env` |
| `add-device` | 機器ごとの CNAME エイリアス登録 | `npx dns-register add-device --shop-code s1105 --device rt --ip 192.168.94.66 --env-file .env` |
| `undo` | 直前の登録を取り消し（同日以内） | `npx dns-register undo --env-file .env` |
| `list-tests` | テストレコードの一覧表示 | `npx dns-register list-tests --env-file .env` |
| `delete-tests` | テストレコードの一括削除 | `npx dns-register delete-tests --env-file .env` |

- `register` コマンドは廃止済み。`encode-name` → `create-records` → `add-device` の順で実行すること。
- `undo` / `delete-tests` は非対話型（`--yes` フラグは不要、即実行される）。
- テストモードは各コマンドに `--test` を付ける。

## 実行方法（Desktop Commander）

```
cd /d {route53_dns_auto_registerフォルダのパス} && npx dns-register {コマンド} {引数} --env-file .env
```

## 設定

- ゾーン ID とリージョンはアプリケーション内にハードコードされている（変更不要）。
- `.env` ファイルには AWS 認証情報のみ設定する（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）。
- `config.json` は不要。
- 機器タイプ（`--device`）は任意の文字列を受け付ける（バリデーションなし）。

## 使い方

skills/ フォルダ内のファイルをアップロードして使用してください:

| ファイル | 用途 |
|---------|------|
| skills/dns-register-skill.md | 全操作（登録・テスト・取り消し・削除） |

## バリデーションルール

- 店舗名: 1-30文字、漢字・ひらがな・カタカナ・英数字・スペース・長音記号・中黒のみ
- 店舗コード: s + 数字1-6桁（^s\d{1,6}$）
- IP: 192.168.x.x 形式、第4オクテット+61<=254
- 機器IP: 先頭から62件範囲内、重複不可
