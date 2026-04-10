@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   店舗ネットワーク設定 登録ツール - セットアップ
echo ============================================
echo.

REM --- 1. Node.js チェック ---
echo [1/2] Node.js を確認中...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [エラー] Node.js がインストールされていません。
    echo          インストールページを開きます...
    start https://nodejs.org/
    echo          ブラウザが開きます。Node.js v22.x LTS をインストールしてください。
    echo          インストール後、このスクリプトをもう一度実行してください。
    pause
    exit /b 1
)
echo   OK

REM --- 2. npm install ---
echo [2/2] 依存関係をインストール中...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo セットアップ中にエラーが発生しました。IT部門に連絡してください。
    pause
    exit /b 1
)

echo.
echo ============================================
echo   セットアップが完了しました
echo ============================================
echo.
echo .env ファイルに AWS 認証情報を設定してください。
echo.
pause
