@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   店舗ネットワーク設定 登録ツール - セットアップ
echo ============================================
echo.

REM --- 1. Node.js チェック・自動インストール ---
echo [1/2] Node.js を確認中...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js がインストールされていません。自動インストールします...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo [エラー] Node.js のインストールに失敗しました。IT部門に連絡してください。
        pause
        exit /b 1
    )
    echo Node.js のインストールが完了しました。
    echo このウィンドウを閉じて、setup.bat をもう一度実行してください。
    pause
    exit /b 0
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
