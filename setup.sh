#!/bin/bash
echo ""
echo "============================================"
echo "  店舗ネットワーク設定 登録ツール - セットアップ"
echo "============================================"
echo ""

# ブラウザを開くヘルパー関数（macOS: open / Linux: xdg-open）
open_browser() {
    local url="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        open "$url"
    else
        xdg-open "$url" 2>/dev/null || echo "         ブラウザを自動で開けませんでした。上記URLを手動で開いてください。"
    fi
}

# --- 1. Node.js チェック ---
echo "[1/2] Node.js を確認中..."
if ! command -v node &> /dev/null; then
    echo "[エラー] Node.js がインストールされていません。"
    echo "         インストールページを開きます..."
    open_browser "https://nodejs.org/"
    echo "         ブラウザが開きます。Node.js v22.x LTS をインストールしてください。"
    echo "         インストール後、このスクリプトをもう一度実行してください。"
    exit 1
fi
echo "  OK"

# --- 2. npm install ---
echo "[2/2] 依存関係をインストール中..."
npm install
if [ $? -ne 0 ]; then
    echo "セットアップ中にエラーが発生しました。IT部門に連絡してください。"
    exit 1
fi

echo ""
echo "============================================"
echo "  セットアップが完了しました"
echo "============================================"
echo ""
echo ".env ファイルに AWS 認証情報を設定してください。"
echo ""
