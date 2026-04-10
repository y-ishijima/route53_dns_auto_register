# 要件定義書: 非IT部門ユーザ向け対応

## はじめに

既存のRoute53 DNS登録CLIツール（dns-register）は、IT部門のユーザを対象として設計・実装されている。non-interactiveモード（`register --non-interactive`）は動作確認済みであり、対話型モード（`register`）も機能としては完成している。

本要件定義書では、対話型モードを非IT部門の一般ユーザにも使いやすくするための改善を定義する。改善対象は以下の3領域である:

1. 対話型プロンプトのUX改善（入力例の表示、ヘルプメッセージの充実、進捗表示）
2. Claude Code / Cowork Skills による対話型フロー（AIエージェント環境でも対話的にやり取り可能にする）
3. README/ドキュメントの平易化（専門用語を避ける、手順書形式）
4. セットアップの簡素化（ダブルクリックで完結するインストーラー）

前提:
- 既存のビジネスロジック（validator.ts, generator.ts, manager.ts, test-manager.ts, undo.ts, config.ts）は変更しない
- non-interactiveモードは変更しない（IT部門・CI/CD向けのまま維持）
- 対話型モードのプロンプトUI（`src/interactive.ts`）とCLIエントリポイント（`src/cli.ts`）を改善する
- Claude Code / Cowork Skills（`.claude/skills/<skill-name>/SKILL.md`）を作成し、AIエージェント環境（Claude Code および Cowork）ではSkillsがユーザに順番に質問して `--non-interactive` コマンドを組み立てて実行する。ツール側に新しいモードを追加する必要はない
- READMEを非IT部門ユーザ向けに書き換える（IT部門向け情報は別セクションまたは別ファイルに分離）
- セットアップスクリプト（setup.bat / setup.sh）を改善し、前提ソフトウェアの自動インストールを含める

## 用語集

- **DNS_CLI_Tool**: 本ツール全体のシステム名称。Route53へのDNSレコード登録を行う対話型CLIツール
- **Interactive_CLI**: `@inquirer/prompts` を使用した対話型コマンドラインインターフェース。ユーザにプロンプトで入力を求め、選択肢の提示やバリデーションを行う
- **一般ユーザ**: 非IT部門のユーザ。ターミナル操作やネットワーク用語に不慣れな前提。店舗のDNSレコード登録作業を担当する
- **IT部門ユーザ**: ITリテラシーがある前提のユーザ。non-interactiveモードやconfig.jsonの編集等の高度な操作を行う
- **Setup_Installer**: セットアップスクリプト（setup.bat / setup.sh）の改善版。前提ソフトウェアの存在チェックと自動インストール案内、リポジトリ取得、依存関係インストールを一括で行う
- **User_Guide**: 非IT部門ユーザ向けのドキュメント。専門用語を避け、スクリーンショット付きの手順書として構成する
- **Input_Validator**: ユーザ入力の妥当性を検証するモジュール（既存、変更なし）
- **ウェルカムメッセージ**: ツール起動時に表示される案内メッセージ。ツールの目的と操作の流れを簡潔に説明する
- **プログレスインジケーター**: 登録処理中にユーザに進捗状況を視覚的に伝える表示要素（スピナー、ステップ番号等）
- **Claude_Code_Skills**: Claude Code / Cowork の Skills 機能。`.claude/skills/<skill-name>/SKILL.md` にMarkdownファイルを配置することで、Claude Code および Cowork 上でスラッシュコマンド（`/register` 等）として機能し、ユーザに対話的に質問して入力を収集し、`--non-interactive` コマンドを組み立てて実行する仕組み。Agent Skills オープンスタンダードに準拠しており、Claude Code（ターミナル）と Cowork（デスクトップ）の両方で動作する

## 要件

### 要件 1: 対話型プロンプトのUX改善 — ウェルカムメッセージとステップ表示

**ユーザストーリー:** 一般ユーザとして、ツールを起動したときに何をするツールなのか、どのような手順で進むのかを把握したい。操作の全体像が分かることで安心して入力を進められるため。

#### 受け入れ基準

1. WHEN `register` コマンドが対話型モードで起動されたとき、THE Interactive_CLI SHALL ウェルカムメッセージを表示する。ウェルカムメッセージには、ツールの目的（「店舗のネットワーク設定を登録するツールです」等の平易な表現）と、入力ステップの概要（全5ステップ: 店舗名 → 店舗コード → IPアドレス → 機器選択 → 機器IPアドレス）を含める
2. WHEN 各入力プロンプトが表示されるとき、THE Interactive_CLI SHALL 現在のステップ番号と全ステップ数を表示する（例: 「[ステップ 1/5]」）。一般ユーザが進捗を把握できるようにする
3. WHEN テストモード（`--test`）で起動されたとき、THE Interactive_CLI SHALL ウェルカムメッセージに「テストモードで実行中です。本番環境には影響しません。」という注記を追加表示する

### 要件 2: 対話型プロンプトのUX改善 — 入力例とヘルプメッセージ

**ユーザストーリー:** 一般ユーザとして、各入力項目に何を入力すればよいか具体的な例を見たい。専門用語が分からなくても、例を見れば正しく入力できるため。

#### 受け入れ基準

1. WHEN 店舗名の入力プロンプトが表示されるとき、THE Interactive_CLI SHALL 入力例（例: 「山岡家 札幌店」）をプロンプトメッセージ内に表示する
2. WHEN 店舗コードの入力プロンプトが表示されるとき、THE Interactive_CLI SHALL 入力例（例: 「s1105」）と補足説明（「店舗コードは店舗一覧表で確認できます」等）をプロンプトメッセージ内に表示する
3. WHEN 先頭IPアドレスの入力プロンプトが表示されるとき、THE Interactive_CLI SHALL 入力例（例: 「192.168.94.65」）と補足説明（「IPアドレスはネットワーク設計書で確認できます」等）をプロンプトメッセージ内に表示する
4. WHEN 機器選択のcheckboxプロンプトが表示されるとき、THE Interactive_CLI SHALL 操作方法の説明（「スペースキーで選択/解除、Enterキーで確定」）をプロンプトメッセージ内に表示する
5. WHEN 各機器のIPアドレス入力プロンプトが表示されるとき、THE Interactive_CLI SHALL 入力例（例: 「192.168.94.66」）をプロンプトメッセージ内に表示する
6. WHEN 入力バリデーションが失敗したとき、THE Interactive_CLI SHALL エラーメッセージに加えて、正しい入力形式の例を表示する（例: 「IPアドレスが正しくありません。例: 192.168.94.65 の形式で入力してください。」）

### 要件 3: 対話型プロンプトのUX改善 — エラーメッセージの平易化

**ユーザストーリー:** 一般ユーザとして、入力を間違えたときに何が問題で、どう修正すればよいか分かりやすく教えてほしい。技術的な用語ではなく、具体的な対処法を知りたいため。

#### 受け入れ基準

1. WHEN 入力バリデーションが失敗したとき、THE Interactive_CLI SHALL 技術用語を避けた平易な日本語でエラーメッセージを表示する。「サブネット境界」「オクテット」等のネットワーク用語は使用しない
2. WHEN 先頭IPアドレスのサブネット境界チェックが失敗したとき、THE Interactive_CLI SHALL 「このIPアドレスでは登録に必要な数のレコードを作成できません。ネットワーク設計書を確認し、別のIPアドレスを入力してください。」という平易なメッセージを表示する
3. WHEN 機器IPアドレスが範囲外であるとき、THE Interactive_CLI SHALL 「{機器名}のIPアドレスが、この店舗に割り当てられた範囲の外です。ネットワーク設計書を確認してください。」という平易なメッセージを表示する
4. WHEN AWS認証エラーが発生したとき、THE DNS_CLI_Tool SHALL 一般ユーザ向けに「ツールの設定に問題があります。IT部門に連絡してください。」という平易なメッセージを表示する。技術的な詳細（エラーコード等）は表示しない
5. WHEN Route53 APIエラーが発生したとき、THE DNS_CLI_Tool SHALL 一般ユーザ向けに「登録処理中にエラーが発生しました。IT部門に連絡してください。」という平易なメッセージを表示する
6. IF ネットワーク接続エラーが発生した場合、THEN THE DNS_CLI_Tool SHALL 「インターネットに接続できません。ネットワーク接続を確認してから、もう一度お試しください。」という平易なメッセージを表示する

### 要件 4: 対話型プロンプトのUX改善 — 登録処理の進捗表示

**ユーザストーリー:** 一般ユーザとして、登録ボタンを押した後に処理が進んでいることを視覚的に確認したい。画面が止まっていると不安になるため。

#### 受け入れ基準

1. WHILE レコード登録処理が実行中のとき、THE DNS_CLI_Tool SHALL 処理の進捗をステップごとに表示する（例: 「[1/3] yamaokaya.net にレコードを登録中...」「[2/3] internal.menkata.me にレコードを登録中...」「[3/3] 登録結果を確認中...」）
2. WHEN 登録処理が完了したとき、THE DNS_CLI_Tool SHALL 登録結果を一般ユーザ向けの平易な表現で表示する（例: 「登録が完了しました。{店舗名}（{店舗コード}）のネットワーク設定が反映されました。」）。Change IDやレコード件数等の技術的な詳細は表示しない
3. WHEN 登録処理が完了したとき、THE DNS_CLI_Tool SHALL 「登録を間違えた場合は、30分以内に `npx dns-register undo` を実行してください。」という取り消し方法の案内を表示する

### 要件 5: 対話型プロンプトのUX改善 — 確認画面の改善

**ユーザストーリー:** 一般ユーザとして、登録実行前に入力内容を分かりやすい形式で確認したい。間違いがあれば登録前に気づけるようにしたいため。

#### 受け入れ基準

1. WHEN 登録内容の確認画面が表示されるとき、THE DNS_CLI_Tool SHALL 一般ユーザ向けに以下の情報を平易な表現で表示する: 店舗名、店舗コード、先頭IPアドレス、選択した機器一覧（日本語名称とIPアドレス）。Aレコード件数やCNAME件数等の技術的な詳細は表示しない
2. WHEN 確認画面が表示されるとき、THE Interactive_CLI SHALL 「上記の内容で登録します。よろしいですか？」という平易な確認メッセージを表示する
3. IF ユーザが確認を拒否した場合、THEN THE DNS_CLI_Tool SHALL 「登録を中止しました。最初からやり直す場合は、もう一度コマンドを実行してください。」という案内を表示する

### 要件 6: READMEの平易化 — 一般ユーザ向けセクション

**ユーザストーリー:** 一般ユーザとして、専門用語を使わない分かりやすい手順書を読みたい。ターミナルの操作に慣れていなくても、手順通りに進めれば登録作業ができるようにしたいため。

#### 受け入れ基準

1. THE User_Guide SHALL READMEの冒頭に一般ユーザ向けセクションを配置する。「このツールについて」として、ツールの目的を1〜2文の平易な日本語で説明する（例: 「新しい店舗のネットワーク設定を登録するためのツールです。」）
2. THE User_Guide SHALL 「はじめかた」セクションに、セットアップスクリプトの実行方法をOS別に記載する。Windowsの場合は「setup.batをダブルクリック」、macOS/Linuxの場合は「ターミナルで `bash setup.sh` を実行」と記載する
3. THE User_Guide SHALL 「使いかた」セクションに、対話型モードの実行手順をステップバイステップで記載する。各ステップに入力例を含める
4. THE User_Guide SHALL 専門用語（DNS、Route53、CNAME、Aレコード、サブネット等）を使用しない。やむを得ず使用する場合は括弧書きで平易な説明を付記する
5. THE User_Guide SHALL 「困ったときは」セクションに、よくあるエラーと対処法を一般ユーザ向けの平易な表現で記載する。技術的な対処が必要な場合は「IT部門に連絡してください」と案内する
6. THE User_Guide SHALL IT部門向けの技術情報（non-interactiveモード、config.json編集、IAMポリシー、レコード命名規則等）を「IT部門向け情報」セクションとしてREADME末尾に分離する

### 要件 7: セットアップの簡素化 — 前提ソフトウェアの自動チェックと案内

**ユーザストーリー:** 一般ユーザとして、セットアップスクリプトをダブルクリックするだけで、必要なソフトウェアが揃っているか確認し、不足があれば何をすればよいか教えてほしい。コマンドを手動で入力したくないため。

#### 受け入れ基準

1. WHEN setup.bat（Windows）が実行されたとき、THE Setup_Installer SHALL Node.js、Git、AWS CLIの存在を自動チェックする。チェック結果を「OK」または「未インストール」で日本語表示する
2. IF Node.jsがインストールされていない場合、THEN THE Setup_Installer SHALL 「Node.jsがインストールされていません。」というメッセージと、インストール手順のURL（https://nodejs.org/）を表示する。可能であればインストーラーのダウンロードページをブラウザで自動的に開く
3. IF Gitがインストールされていない場合、THEN THE Setup_Installer SHALL 「Gitがインストールされていません。」というメッセージと、インストール手順のURL（https://git-scm.com/）を表示する。可能であればインストーラーのダウンロードページをブラウザで自動的に開く
4. IF AWS CLIがインストールされていない場合、THEN THE Setup_Installer SHALL 「AWS CLIがインストールされていません。IT部門に連絡してください。」というメッセージを表示する。AWS CLIのインストールはIT部門が支援する前提とする
5. WHEN すべての前提ソフトウェアが確認されたとき、THE Setup_Installer SHALL リポジトリの取得（git clone または git pull）と依存関係のインストール（npm install）を自動実行する
6. WHEN セットアップが完了したとき、THE Setup_Installer SHALL 「セットアップが完了しました。」というメッセージと、次のステップ（「npx dns-register register を実行してレコード登録を開始できます」）を平易な日本語で表示する
7. IF セットアップ中にエラーが発生した場合、THEN THE Setup_Installer SHALL 「セットアップ中にエラーが発生しました。IT部門に連絡してください。」という平易なメッセージを表示する。技術的なエラー詳細はログファイルに出力する
8. THE Setup_Installer SHALL setup.sh（macOS/Linux用）にも同等の機能を提供する

### 要件 8: セットアップの簡素化 — AWS認証設定の支援

**ユーザストーリー:** 一般ユーザとして、AWS認証の設定を簡単に行いたい。`aws configure` コマンドの意味が分からなくても、案内に従って設定を完了できるようにしたいため。

#### 受け入れ基準

1. WHEN セットアップスクリプトの実行後にAWS認証が未設定であるとき、THE Setup_Installer SHALL 「AWS認証の設定が必要です。IT部門から受け取った認証情報を用意してください。」という案内を表示する
2. THE Setup_Installer SHALL AWS認証設定の手順を平易な日本語で案内する。「以下のコマンドを実行してください」として `aws configure` コマンドを表示し、各入力項目（アクセスキーID、シークレットアクセスキー、リージョン、出力形式）の説明を付記する
3. THE User_Guide SHALL AWS認証設定の手順をREADMEの「はじめかた」セクションに含める。「IT部門から受け取った認証情報」という表現を使い、認証情報の取得方法はIT部門に委ねる

### 要件 9: 対話型モードの安全性向上

**ユーザストーリー:** 一般ユーザとして、操作を間違えても安全に元に戻せることを知りたい。誤操作による影響を最小限にしたいため。

#### 受け入れ基準

1. WHEN undo コマンドが対話型モードで実行されたとき、THE DNS_CLI_Tool SHALL 取り消し対象の情報を一般ユーザ向けの平易な表現で表示する（例: 「{店舗名}（{店舗コード}）の登録を取り消します。」）。レコード件数やChange ID等の技術的な詳細は表示しない
2. WHEN undo の取り消し期限が超過しているとき、THE DNS_CLI_Tool SHALL 「登録から30分以上経過しているため、取り消しできません。IT部門に連絡してください。」という平易なメッセージを表示する
3. WHEN delete-tests コマンドが実行されたとき、THE DNS_CLI_Tool SHALL 「テスト用のデータを削除します。本番環境には影響しません。」という平易な確認メッセージを表示する
4. WHEN 対話型プロンプトでCtrl+Cが押されたとき、THE DNS_CLI_Tool SHALL 「操作を中止しました。登録は行われていません。」という平易なメッセージを表示する

### 要件 10: IT部門向け機能の維持

**ユーザストーリー:** IT部門のユーザとして、既存のnon-interactiveモードやテスト機能、技術的なエラー情報が引き続き利用できることを確認したい。一般ユーザ向けの改善によって既存機能が損なわれないようにしたいため。

#### 受け入れ基準

1. THE DNS_CLI_Tool SHALL non-interactiveモード（`register --non-interactive`）の動作を変更しない。コマンドライン引数、バリデーション、エラーメッセージ、終了コードは既存のまま維持する
2. THE DNS_CLI_Tool SHALL テスト関連コマンド（`register --test`、`list-tests`、`delete-tests`）の動作を変更しない
3. WHEN non-interactiveモードでエラーが発生したとき、THE DNS_CLI_Tool SHALL 既存の技術的なエラーメッセージ（APIエラーコード等）をそのまま表示する。一般ユーザ向けの平易化は対話型モードのみに適用する
4. THE DNS_CLI_Tool SHALL 既存のビジネスロジック（validator.ts、generator.ts、manager.ts、test-manager.ts、undo.ts、config.ts）を変更しない
5. THE User_Guide SHALL IT部門向けの技術情報（non-interactiveモードの使用方法、config.jsonの編集方法、エイリアス定義の追加手順、IAMポリシー、レコード命名規則、トラブルシューティング）をREADME内の「IT部門向け情報」セクションに記載する

### 要件 11: Claude Code / Cowork Skills — 対話型レコード登録フロー

**ユーザストーリー:** Claude Code または Cowork を使うユーザとして、AIエージェントに「レコード登録して」と伝えるだけで、対話的に必要な情報を聞かれ、最終的にレコード登録が完了してほしい。ターミナルの対話型プロンプトが使えない環境でも、自然な対話で登録作業を進めたいため。

#### 受け入れ基準

1. THE DNS_CLI_Tool SHALL `.claude/skills/register/SKILL.md` に Skills 定義ファイルを配置する。このファイルは Claude Code および Cowork のスラッシュコマンド `/register` として機能する
2. WHEN `/register` コマンドが Claude Code または Cowork 上で実行されたとき、THE Claude_Code_Skills SHALL ユーザに以下の情報を順番に質問する: (1) 店舗名、(2) 店舗コード、(3) 先頭IPアドレス、(4) 使用する機器の選択、(5) 選択した各機器のIPアドレス
3. THE Claude_Code_Skills SHALL 各質問に入力例と補足説明を含める。一般ユーザが専門用語を知らなくても回答できるよう、平易な日本語で質問する
4. WHEN すべての入力が収集されたとき、THE Claude_Code_Skills SHALL 入力内容の確認サマリーをユーザに表示し、登録を実行してよいか確認する
5. WHEN ユーザが登録を承認したとき、THE Claude_Code_Skills SHALL 収集した入力値から `npx dns-register register --non-interactive --shop-name "{店舗名}" --shop-code {店舗コード} --start-ip {先頭IP} --devices {機器=IP,...}` コマンドを組み立てて実行する
6. WHEN 登録コマンドの実行結果が返されたとき、THE Claude_Code_Skills SHALL 結果を一般ユーザ向けの平易な表現でユーザに伝える。エラーが発生した場合は対処法を案内する
7. THE DNS_CLI_Tool SHALL `.claude/skills/undo/SKILL.md` に undo 用の Skills 定義ファイルも配置する。`/undo` コマンドで `npx dns-register undo` を実行し、結果を平易に伝える
8. THE DNS_CLI_Tool SHALL `.claude/skills/register-test/SKILL.md` にテストモード用の Skills 定義ファイルも配置する。`/register-test` コマンドでテストモードの登録フローを提供する

### 要件 12: Claude Code / Cowork Skills — CLAUDE.md による対話ガイド

**ユーザストーリー:** Claude Code または Cowork を使うユーザとして、Skills コマンドを使わなくても、自然な会話でレコード登録を依頼できるようにしたい。Claude Code / Cowork がツールの使い方を理解していて、適切にコマンドを実行してくれることを期待するため。

#### 受け入れ基準

1. THE DNS_CLI_Tool SHALL `CLAUDE.md` ファイルをプロジェクトルートに配置する。このファイルは Claude Code および Cowork がプロジェクトのコンテキストを理解するためのガイドとして機能する
2. THE `CLAUDE.md` SHALL ツールの概要、利用可能なコマンド一覧（register, undo, list-tests, delete-tests）、各コマンドの引数と使用例を記載する
3. THE `CLAUDE.md` SHALL 一般ユーザからの自然な依頼（「新しい店舗を登録したい」「登録を取り消したい」等）に対して、Claude Code / Cowork がどのように対応すべきかのガイドラインを記載する
4. THE `CLAUDE.md` SHALL 入力値のバリデーションルール（店舗名の文字種制限、店舗コードの形式、IPアドレスの形式等）を記載し、Claude Code / Cowork がユーザの入力を事前にチェックできるようにする

### 要件 13: TTY自動検出とガイドメッセージ

**ユーザストーリー:** ユーザとして、実行環境に応じて適切なモードが自動的に選択されてほしい。モードの指定を間違えてもエラーにならず、適切に案内されるようにしたいため。

#### 受け入れ基準

1. WHEN `register` コマンドが引数なし（`--non-interactive` なし）で実行されたとき、THE DNS_CLI_Tool SHALL `process.stdin.isTTY` を確認する。TTYが接続されている場合は対話型モード（`@inquirer/prompts`）で実行する
2. WHEN `register` コマンドが引数なしで実行され、TTYが接続されていない場合、THE DNS_CLI_Tool SHALL 「対話型モードが使用できない環境です。以下の方法で実行してください:\n  - 一括指定: register --non-interactive --shop-name ... 」というガイドメッセージを表示して終了する
