@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   店舗ネットワーク設定 登録ツール - セットアップ
echo ============================================
echo.

REM --- 1. Node.js チェック・自動インストール ---
echo [1/4] Node.js を確認中...
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

REM --- 2. git pull ---
echo [2/4] 最新のソースコードを取得中...
git remote set-url origin https://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@github.com/y-ishijima/route53_dns_auto_register.git
git pull
if %ERRORLEVEL% NEQ 0 (
    echo git pull に失敗しました。ネットワーク接続を確認してください。
    pause
    exit /b 1
)

REM --- 3. npm install ---
echo [3/4] 依存関係をインストール中...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo セットアップ中にエラーが発生しました。IT部門に連絡してください。
    pause
    exit /b 1
)

REM --- 4. ビルド ---
echo [4/4] ビルド中...
call npx tsc
if %ERRORLEVEL% NEQ 0 (
    echo ビルド中にエラーが発生しました。IT部門に連絡してください。
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
