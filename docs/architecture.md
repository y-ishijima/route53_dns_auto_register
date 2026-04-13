# ソフトウェア構造図

## 全体構成

```mermaid
graph TD
    User[ユーザー] -->|Cowork チャット| Cowork[Claude Cowork]
    Cowork -->|MCP Protocol stdio| MCP[mcp-server.ts]
    MCP --> HANDLERS[handlers.ts 共通業務ロジック層]

    IT[IT部門] -->|ターミナル| CLI[cli.ts]
    CLI --> HANDLERS

    HANDLERS --> EN[encode-name]
    HANDLERS --> CR[create-records]
    HANDLERS --> AD[add-device]
    HANDLERS --> UNDO[undo]
    HANDLERS --> LT[list-tests]
    HANDLERS --> DT[delete-tests]

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

    MCP --> ENV[.env]
    CLI --> ENV
    ENV -->|認証情報| R53
    ENV -->|ゾーンID| HANDLERS

    Cowork -->|参照| CLAUDE[CLAUDE.md]
    Cowork -->|参照| SKILL[skills/*.md]
```

## レイヤー構成

```
┌─────────────────────────────────────────────┐
│  エントリポイント層                            │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ mcp-server.ts│  │ cli.ts               │  │
│  │ (MCP Protocol)│  │ (コマンドライン)       │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                     │              │
│         ▼                     ▼              │
│  ┌──────────────────────────────────────┐    │
│  │ handlers.ts  共通業務ロジック層        │    │
│  │ - handleEncodeName()                 │    │
│  │ - handleCreateRecords()              │    │
│  │ - handleAddDevice()                  │    │
│  │ - handleUndo()                       │    │
│  │ - handleListTests()                  │    │
│  │ - handleDeleteTests()                │    │
│  └──────────────┬───────────────────────┘    │
│                 │                            │
│  ┌──────────────▼───────────────────────┐    │
│  │ 既存モジュール層（変更なし）            │    │
│  │ validator.ts | generator.ts          │    │
│  │ manager.ts   | test-manager.ts       │    │
│  │ undo.ts      | types.ts             │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## ファイル構成

```
dns-register/
├── src/
│   ├── mcp-server.ts    # MCPサーバー エントリポイント（stdioトランスポート）
│   ├── cli.ts           # CLI エントリポイント（IT部門向けローカル実行）
│   ├── handlers.ts      # 共通業務ロジック層（全ハンドラ関数）
│   ├── validator.ts     # 入力バリデーション（店舗名・コード・IP）
│   ├── generator.ts     # DNS レコード生成（A レコード・CNAME）
│   ├── manager.ts       # Route53 API 操作（登録・削除・同期確認）
│   ├── test-manager.ts  # テストレコード管理（一覧・一括削除）
│   ├── undo.ts          # undo 情報の保存・読み込み・期限チェック
│   └── types.ts         # 型定義（ハンドラ入出力型を含む）
├── skills/
│   └── dns-register-skill.md  # MCPツール呼び出し手順スキル
├── CLAUDE.md            # Cowork 用ガイド・ルール
├── README.md            # ユーザー向け + IT部門向けドキュメント
├── .env                 # AWS認証情報・ゾーンID・リージョン
├── setup.bat            # Windows セットアップ
├── setup.sh             # macOS/Linux セットアップ
├── package.json
└── tsconfig.json
```

## コマンドフロー（MCPツール経由）

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant C as Cowork
    participant MCP as mcp-server.ts
    participant H as handlers.ts
    participant R53 as Route53

    U->>C: レコード登録して
    C->>U: 店舗名を教えてください
    U->>C: 山岡家 札幌店
    C->>U: 店舗コードを教えてください
    U->>C: s1105
    C->>U: encode-name を実行してよいですか？
    U->>C: はい
    C->>MCP: encode-name(shop_name="山岡家 札幌店", shop_code="s1105")
    MCP->>H: handleEncodeName(params, route53Client, config)
    H->>H: Base64エンコード（内部処理）
    H->>R53: TXT レコード登録
    R53-->>H: 成功
    H-->>MCP: EncodeNameResult
    MCP-->>C: MCPレスポンス（JSON）
    C->>U: 店舗名の登録が完了しました

    C->>U: 先頭IPアドレスを教えてください
    U->>C: 192.168.94.65
    C->>U: create-records を実行してよいですか？
    U->>C: はい
    C->>MCP: create-records(shop_code="s1105", start_ip="192.168.94.65")
    MCP->>H: handleCreateRecords(params, route53Client, config)
    H->>R53: A レコード 62件 + menkata CNAME 62件
    R53-->>H: 成功
    H-->>MCP: CreateRecordsResult
    MCP-->>C: MCPレスポンス（JSON）
    C->>U: レコードの登録が完了しました

    C->>U: 登録する機器を教えてください
    U->>C: rt 192.168.94.66
    C->>U: add-device を実行してよいですか？
    U->>C: はい
    C->>MCP: add-device(shop_code="s1105", device="rt", ip="192.168.94.66")
    MCP->>H: handleAddDevice(params, route53Client, config)
    H->>R53: CNAME 登録
    R53-->>H: 成功
    H-->>MCP: AddDeviceResult
    MCP-->>C: MCPレスポンス（JSON）
    C->>U: 機器の登録が完了しました。他にありますか？
```

## コマンドフロー（CLIローカル実行）

```mermaid
sequenceDiagram
    participant IT as IT部門
    participant CLI as cli.ts
    participant H as handlers.ts
    participant R53 as Route53

    IT->>CLI: npx dns-register encode-name --shop-name "山岡家 札幌店" --shop-code s1105
    CLI->>H: handleEncodeName(params, route53Client, config)
    H->>R53: TXT レコード登録
    R53-->>H: 成功
    H-->>CLI: EncodeNameResult
    CLI->>IT: コンソール出力（結果表示）
```
