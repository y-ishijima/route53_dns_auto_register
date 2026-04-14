@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   店舗ネットワーク設定 登録ツール - セットアップ
echo ============================================
echo.

REM --- 1. Git チェック ---
echo [1/3] Git を確認中...
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [エラー] Git がインストールされていません。IT部門に連絡してください。
    pause
    exit /b 1
)
echo   OK

REM --- 2. Node.js チェック・自動インストール ---
echo [2/3] Node.js を確認中...
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

REM --- 3. git clone ---
echo [3/3] プロジェクトをダウンロード中...
if exist "route53_dns_auto_register" (
    echo   プロジェクトは既にダウンロード済みです。
) else (
    git clone https://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@github.com/y-ishijima/route53_dns_auto_register.git
    if %ERRORLEVEL% NEQ 0 (
        echo [エラー] プロジェクトのダウンロードに失敗しました。ネットワーク接続を確認してください。
        pause
        exit /b 1
    )
)

echo.
echo ============================================
echo   セットアップが完了しました
echo ============================================
echo.
echo 次の手順:
echo   1. route53_dns_auto_register フォルダ内の .env ファイルに AWS 認証情報を設定してください
echo   2. Claude Desktop の Cowork でプロジェクトフォルダを開いてください
echo   3. 「登録して」と伝えるだけで操作が開始されます
echo.
pause
