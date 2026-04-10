# ソフトウェア構造図

## 全体構成

```mermaid
graph TD
    User[ユーザー] -->|Cowork チャット| Cowork[Claude Cowork]
    Cowork -->|Desktop Commander| CLI[cli.ts]

    CLI --> EN[encode-name]
    CLI --> CR[create-records]
    CLI --> AD[add-device]
    CLI --> UNDO[undo]
    CLI --> LT[list-tests]
    CLI --> DT[delete-tests]

    EN --> VAL[validator.ts]
    EN --> R53[Route53 API]

    CR --> VAL
    CR --> GEN[generator.ts]
    CR --> MGR[manager.ts]
    MGR --> R53

    AD --> VAL
    AD --> R53

    UNDO --> MGR
    LT --> TM[test-manager.ts]
    DT --> TM
    TM --> R53

    CLI --> ENV[.env]
    ENV -->|認証情報| R53
    ENV -->|ゾーンID| CLI

    Cowork -->|参照| CLAUDE[CLAUDE.md]
    Cowork -->|参照| SKILL[skills/*.md]
```

## ファイル構成

```
dns-register/
├── src/
│   ├── cli.ts           # CLI エントリポイント（全コマンドのハンドラ）
│   ├── validator.ts     # 入力バリデーション（店舗名・コード・IP）
│   ├── generator.ts     # DNS レコード生成（A レコード・CNAME）
│   ├── manager.ts       # Route53 API 操作（登録・削除・同期確認）
│   ├── test-manager.ts  # テストレコード管理（一覧・一括削除）
│   ├── undo.ts          # undo 情報の保存・読み込み・期限チェック
│   ├── config.ts        # 設定読み込み（レガシー、.env に移行済み）
│   └── types.ts         # 型定義
├── skills/
│   ├── register-skill.md       # 本番登録スキル
│   ├── register-test-skill.md  # テスト登録スキル
│   ├── undo-skill.md           # 取り消しスキル
│   └── delete-tests-skill.md   # テスト削除スキル
├── CLAUDE.md            # Cowork 用ガイド・ルール
├── README.md            # ユーザー向け + IT部門向けドキュメント
├── .env                 # AWS認証情報・ゾーンID・リージョン
├── setup.bat            # Windows セットアップ
├── setup.sh             # macOS/Linux セットアップ
├── package.json
└── tsconfig.json
```

## コマンドフロー

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant C as Cowork
    participant DC as Desktop Commander
    participant CLI as cli.ts
    participant R53 as Route53

    U->>C: レコード登録して
    C->>U: 店舗名を教えてください
    U->>C: 山岡家 札幌店
    C->>U: 店舗コードを教えてください
    U->>C: s1105
    C->>C: Base64 エンコード
    C->>U: encode-name を実行してよいですか？
    U->>C: はい
    C->>DC: encode-name --shop-name-base64 ... --shop-code s1105
    DC->>CLI: コマンド実行
    CLI->>R53: TXT レコード登録
    R53-->>CLI: 成功
    CLI-->>DC: 結果出力
    DC-->>C: 結果
    C->>U: 店舗名の登録が完了しました

    C->>U: 先頭IPアドレスを教えてください
    U->>C: 192.168.94.65
    C->>U: create-records を実行してよいですか？
    U->>C: はい
    C->>DC: create-records --shop-code s1105 --start-ip 192.168.94.65
    DC->>CLI: コマンド実行
    CLI->>R53: A レコード 62件 + menkata CNAME 62件
    R53-->>CLI: 成功
    CLI-->>DC: 結果出力
    DC-->>C: 結果
    C->>U: レコードの登録が完了しました

    C->>U: 登録する機器を教えてください
    U->>C: rt 192.168.94.66
    C->>U: add-device を実行してよいですか？
    U->>C: はい
    C->>DC: add-device --shop-code s1105 --device rt --ip 192.168.94.66
    DC->>CLI: コマンド実行
    CLI->>R53: CNAME 登録
    R53-->>CLI: 成功
    CLI-->>DC: 結果出力
    DC-->>C: 結果
    C->>U: 機器の登録が完了しました。他にありますか？
```
