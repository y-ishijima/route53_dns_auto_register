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
node -e "const fs=require('fs');const path=require('path');const os=require('os');const localAppData=process.env.LOCALAPPDATA||'';const appData=process.env.APPDATA||'';let configDir='';const pkgDir=path.join(localAppData,'Packages');if(fs.existsSync(pkgDir)){const dirs=fs.readdirSync(pkgDir).filter(d=>d.startsWith('Claude_'));if(dirs.length>0)configDir=path.join(pkgDir,dirs[0],'LocalCache','Roaming','Claude')}if(!configDir&&fs.existsSync(path.join(appData,'Claude'))){configDir=path.join(appData,'Claude')}if(!configDir){console.log('  Claude Desktop が見つかりません。MCPサーバーの設定はスキップします。');process.exit(0)}const configPath=path.join(configDir,'claude_desktop_config.json');let c={};try{c=JSON.parse(fs.readFileSync(configPath,'utf-8'))}catch{}if(c.mcpServers&&c.mcpServers['dns-register']){console.log('  MCPサーバーは既に設定済みです。');process.exit(0)}if(!c.mcpServers)c.mcpServers={};c.mcpServers['dns-register']={command:'cmd',args:['/c','start-mcp.bat'],cwd:process.cwd()};fs.writeFileSync(configPath,JSON.stringify(c,null,2),'utf-8');console.log('  MCPサーバーの設定を追加しました。')"

echo.
echo ============================================
echo   セットアップが完了しました
echo ============================================
echo.
echo .env ファイルに AWS 認証情報を設定してください。
echo Claude Desktop を再起動すると、MCPサーバーが有効になります。
echo.
pause
