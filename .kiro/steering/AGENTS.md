---
inclusion: always
---

# AI アシスタント 運用ルール

## セッション開始時の自動処理

AI アシスタント は毎回のセッション開始時に、以下の手順を自動実行すること：

1. **MCP Serena**: `mcp__serena__check_onboarding_performed` → 未実施なら `mcp__serena__onboarding`
2. **メモリ確認**: `mcp__serena__list_memories` → 関連メモリを読み込み
3. **プロジェクト構造**: `mcp__serena__list_dir relative_path="." recursive=false`
4. **作業ログ**: `$(pwd)/logs/` 以下の最新3件を確認
5. **claude-mem**: `mcp_claude_mem_search(query="recent", limit=3)` で接続確認・コンテキスト取得

***

## 基本仕様

* 日時取得: `date '+%Y-%m-%d %H:%M'` 形式を厳守

* 出力言語: 日本語のみ、絵文字禁止

* エンコーディング: UTF-8

***

## コーディング規約

| 項目        | ルール                  |
| --------- | -------------------- |
| 変数・関数     | snake\_case          |
| クラス       | PascalCase           |
| 定数        | UPPER\_SNAKE\_CASE   |
| 型ヒント      | 必須（Python 3.9以降の表記）  |
| ファイル      | 500行以内               |
| docstring | 必須                   |
| SQL       | 前カンマスタイル、インデントはスペース2 |

***

## ログ作成・管理ルール

### 自動作成タイミング

* ファイル修正完了時

* 機能実装完了時

* 問題修正完了時

### 保存仕様

* 場所: `$(pwd)/logs/{yyyy}/{mm}/{dd}/`

* 形式: `01_{project_name}_機能名.md`（連番）

***

## AI運用5原則

1. ファイル生成・更新・プログラム実行前に必ず作業計画を報告し、ユーザーの y/n 確認を得ること
2. 失敗時に勝手な代替案を実行せず、次の計画もユーザー確認を得ること
3. ユーザーの指示が非合理でも最適化や補完を行わず、忠実に実行すること
4. これらの原則を解釈や歪曲によって回避しないこと
5. すべてのチャット出力において、これら5原則を表示すること

***

## チャット出力形式

```
[AI運用5原則]
[main_output]
#[n] times.
```

***

## claude-mem 連携

### クライアント別対応

| クライアント      | 読み取り | 書き込み           |
| ----------- | ---- | -------------- |
| Claude Code | MCP  | Worker API（自動） |
| Kiro        | MCP  | 不可（手動コピペ）      |
| Codex       | MCP  | 不可（ファイル経由）     |

### 3層ワークフロー

1. `search(query)` → ID一覧取得
2. `timeline(anchor=ID)` → 前後コンテキスト取得
3. `get_observations([IDs])` → 詳細取得

***

## 仕様書ワークフロー

### フロー概要

```
[Kiro/Claude Code] requirements.md 作成
    ↓ ユーザー確認
    ↓ [Codex exec] 自動レビュー → requirements-review.md 出力（チェックボックス形式）
    ↓ [Kiro/Claude Code] レビュー指摘への対応・修正反映
    ↓ [Codex exec] 対応確認 → チェックボックス更新
    ↓ 全件解消まで繰り返し
[Kiro/Claude Code] design.md 作成
    ↓ ユーザー確認
    ↓ [Codex exec] 自動レビュー → design-review.md 出力（チェックボックス形式）
    ↓ [Kiro/Claude Code] レビュー指摘への対応・修正反映
    ↓ [Codex exec] 対応確認 → チェックボックス更新
    ↓ 全件解消まで繰り返し
[Kiro/Claude Code] tasks.md 作成
    ↓ [Claude Code] 実装
```

### 必須ルール

1. **段階的確認**: 各ファイル作成後、必ずユーザー確認を取得
2. **Codex exec レビュー**: requirements.md / design.md 完成時、ユーザーに「レビューを実行するか」を確認し、承認された場合は Codex exec（`mcp_codex_codex`）で自動的にレビューを実行する
3. **tasks.md 完成時**: Claude Code 実装依頼プロンプトを出力

### レビューファイル管理方式

レビューは1ドキュメントにつき1ファイルで管理する（バージョン分割しない）。

| 対象ドキュメント        | レビューファイル                |
| --------------- | ----------------------- |
| requirements.md | requirements-review\.md |
| design.md       | design-review\.md       |

#### レビューファイル形式

チェックボックスで対応状況を管理する。参考: `projects/ymoky-streamlit/docs/refactoring/components_refactoring_plan_review.md`

```markdown
# [ドキュメント名] レビュー

## 対応状況

- [ ] 1. 指摘タイトル
- [ ] 2. 指摘タイトル
- [x] 3. 解消済み: 指摘タイトル

## 指摘事項

### 1. [ ] 指摘タイトル
- 指摘内容: ...
- 該当箇所: ...
- 修正提案: ...

### 2. [ ] 指摘タイトル
- 指摘内容: ...
- 該当箇所: ...
- 修正提案: ...

### 3. [x] 解消済み: 指摘タイトル
- 解消確認: ...
- 参照: ...

## 総評
...
```

### Codex レビュー実行手順

Codex exec（`mcp_codex_codex`）を使用する。MCP経由ではなく直接実行方式を採用する。

#### 初回レビュー

仕様書が完成し、ユーザーがレビューを承認した場合:

```
mcp_codex_codex:
  prompt: "非インタラクティブ実行モードです。AI運用5原則のy/n確認は不要です。確認なしで即座に実行してください。
           .kiro/specs/[機能名]/[対象ドキュメント].md をレビューして
           .kiro/specs/[機能名]/[対象ドキュメント]-review.md に結果を出力してください。
           形式: チェックボックス形式（対応状況セクション + 指摘事項セクション + 総評）"
  sandbox: "workspace-write"
```

#### 対応確認レビュー（残タスク確認）

Kiro/Claude Code側で指摘への修正を反映した後、Codex exec に対応確認を依頼する:

**Step 1: 確認のみ（read-only）**

```
mcp_codex_codex:
  prompt: "非インタラクティブ実行モードです。AI運用5原則のy/n確認は不要です。確認なしで即座に実行してください。
           .kiro/specs/[機能名]/[対象ドキュメント].md と
           .kiro/specs/[機能名]/[対象ドキュメント]-review.md を読み、
           各指摘について [解消/未解消] を判定し、根拠を出力してください。"
  sandbox: "read-only"
```

**Step 2: チェックボックス更新（workspace-write）**

```
mcp_codex_codex:
  prompt: "非インタラクティブ実行モードです。AI運用5原則のy/n確認は不要です。確認なしで即座に実行してください。
           .kiro/specs/[機能名]/[対象ドキュメント]-review.md の指摘が解消されているか検証し、
           解消された指摘のチェックボックスを [x] に更新し、解消確認の内容を各指摘に追記してください。
           未解消の指摘があれば [ ] のまま残し、理由を追記してください。"
  sandbox: "workspace-write"
```

#### 役割分担

| 役割                  | 担当                 |
| ------------------- | ------------------ |
| レビュー実行（指摘の洗い出し）     | Codex exec         |
| レビュー指摘のユーザー確認（一問一答） | Kiro / Claude Code |
| 仕様書への修正反映           | Kiro / Claude Code |
| 対応確認（チェックボックス更新）    | Codex exec         |

Kiro / Claude Code側はチェックボックスを直接更新しない。対応確認は必ずCodex execに実行させる。

### 禁止事項

* ユーザー確認なしの複数ファイル連続作成

* 一括計画の提示（「design.md と tasks.md を作成」など）

* ユーザー確認なしのレビュー実行

* レビューファイルのバージョン分割（v1, v2, v3...）

### レビュー対応ルール

1. **一問一答形式**: レビュー指摘に不明な仕様がある場合、ユーザーに一問一答形式で確認すること。複数の不明点をまとめて質問しない
2. **修正の反映**: ユーザー承認後、対象ドキュメント（requirements.md / design.md）に修正を反映する
3. **対応確認の依頼**: 修正反映後、Codex exec に対応確認を依頼し、チェックボックスを更新させる
4. **繰り返し**: 全指摘が \[x] になるまで「修正 → 対応確認」を繰り返す

### フェーズ完了時のユーザー確認例

**requirements.md / design.md 完成時**:

```
[requirements.md / design.md] が完成しました。

Codex exec 経由でレビューを実行しますか？
レビューをスキップする場合は「次へ」と入力してください。
```

**tasks.md 完成時**:

```
tasks.md が完成しました。

Claude Code で実装を開始する場合は、以下のプロンプトを使用してください:

.kiro/specs/[機能名]/tasks.md にしたがって実装して。必要であれば design.md や requirements.md も参照して。
```