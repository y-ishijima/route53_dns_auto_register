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
echo [2/3] 依存関係をインストール中...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo セットアップ中にエラーが発生しました。IT部門に連絡してください。
    pause
    exit /b 1
)

REM --- 3. ビルド ---
echo [3/3] ビルド中...
call npx tsc
if %ERRORLEVEL% NEQ 0 (
    echo ビルド中にエラーが発生しました。IT部門に連絡してください。
    pause
    exit /b 1
)

REM --- 4. Claude Desktop MCP設定 ---
echo.
echo Claude Desktop のMCPサーバーを設定中...

REM Microsoft Store版のパスを検索
set "CLAUDE_CONFIG_DIR="
for /d %%D in ("%LOCALAPPDATA%\Packages\Claude_*") do (
    set "CLAUDE_CONFIG_DIR=%%D\LocalCache\Roaming\Claude"
)

REM 通常版のパス
if not defined CLAUDE_CONFIG_DIR (
    if exist "%APPDATA%\Claude" (
        set "CLAUDE_CONFIG_DIR=%APPDATA%\Claude"
    )
)

if not defined CLAUDE_CONFIG_DIR (
    echo   Claude Desktop が見つかりません。MCPサーバーの設定はスキップします。
    goto :setup_done
)

set "CLAUDE_CONFIG=%CLAUDE_CONFIG_DIR%\claude_desktop_config.json"
set "PROJECT_DIR=%CD:\=\\%"

REM 既にdns-registerが設定済みか確認
if exist "%CLAUDE_CONFIG%" (
    findstr /C:"dns-register" "%CLAUDE_CONFIG%" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   MCPサーバーは既に設定済みです。
        goto :setup_done
    )
)

REM Node.jsスクリプトで安全にJSON編集
node -e "const fs=require('fs');const p='%CLAUDE_CONFIG%'.replace(/\\\\/g,'\\');const d='%PROJECT_DIR%'.replace(/\\\\/g,'\\');let c={};try{c=JSON.parse(fs.readFileSync(p,'utf-8'))}catch{}if(!c.mcpServers)c.mcpServers={};c.mcpServers['dns-register']={command:'cmd',args:['/c','start-mcp.bat'],cwd:d};fs.writeFileSync(p,JSON.stringify(c,null,2),'utf-8');console.log('  MCPサーバーの設定を追加しました。')"
if %ERRORLEVEL% NEQ 0 (
    echo   MCPサーバーの設定に失敗しました。手動で設定してください。
)

:setup_done

echo.
echo ============================================
echo   セットアップが完了しました
echo ============================================
echo.
echo .env ファイルに AWS 認証情報を設定してください。
echo Claude Desktop を再起動すると、MCPサーバーが有効になります。
echo.
pause
