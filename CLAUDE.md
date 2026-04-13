# DNS Register ガイド

## ツール概要

店舗のネットワーク設定を登録するツール。MCPサーバー経由で直接実行する。

## 絶対ルール

- Cowork 開始時には MCPツール `setup` を実行して、最新の状態にすること。
- skills/ フォルダ内のファイルが更新された場合、ユーザに通知して skills ファイルの再アップロードを促すこと。
- レコードの登録・削除・取り消しツールを実行する前に、必ずユーザに許可を求めること。
- 登録または削除が完了したら、必ず結果一覧を表示すること（テスト・本番問わず）。
- 全操作はMCPツール経由で実行すること。Desktop Commanderは使用しない。
- 一時 JS ファイルを作成しないこと。店舗名は encode-name ツールが内部で Base64 エンコードするため、日本語のエンコーディング問題は発生しない。

## MCPツール一覧

| ツール | パラメータ | 説明 |
|-------|----------|------|
| `setup` | (なし) | git pull・npm install・ビルドを実行 |
| `encode-name` | `shop_name`, `shop_code`, `test_mode?` | 店舗名TXTレコード登録 |
| `create-records` | `shop_code`, `start_ip`, `test_mode?` | Aレコード62件+CNAME62件一括登録 |
| `add-device` | `shop_code`, `device`, `ip`, `test_mode?` | 機器CNAMEエイリアス登録 |
| `undo` | (なし) | 直前の登録取り消し |
| `list-tests` | (なし) | テストレコード一覧取得 |
| `delete-tests` | (なし) | テストレコード一括削除 |

- `register` コマンドは廃止済み。`encode-name` → `create-records` → `add-device` の順で実行すること。
- `undo` / `delete-tests` は非対話型（即実行される）。
- テストモードは `test_mode: true` を指定する。

## 設定

- ゾーン ID とリージョンはアプリケーション内にハードコードされている（変更不要）。
- `.env` ファイルには AWS 認証情報のみ設定する（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）。MCPサーバーが起動時に自動で読み込む。
- `config.json` は不要。
- 機器タイプ（`device`）は任意の文字列を受け付ける（バリデーションなし）。

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
