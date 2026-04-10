#!/bin/bash
echo ""
echo "============================================"
echo "  店舗ネットワーク設定 登録ツール - セットアップ"
echo "============================================"
echo ""

# ブラウザを開くヘルパー関数
open_browser() {
    local url="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        open "$url"
    else
        xdg-open "$url" 2>/dev/null || echo "         ブラウザを自動で開けませんでした。上記URLを手動で開いてください。"
    fi
}

# --- 1. Node.js チェック・自動インストール ---
echo "[1/2] Node.js を確認中..."
if ! command -v node &> /dev/null; then
    echo "Node.js がインストールされていません。自動インストールを試みます..."
    if command -v brew &> /dev/null; then
        brew install node@22
        if [ $? -ne 0 ]; then
            echo "[エラー] Node.js のインストールに失敗しました。IT部門に連絡してください。"
            exit 1
        fi
        echo "Node.js のインストールが完了しました。"
    else
        echo "[エラー] Homebrew がインストールされていません。"
        echo "         以下のコマンドで Homebrew をインストールしてから、再度 setup.sh を実行してください:"
        echo '         /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
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
