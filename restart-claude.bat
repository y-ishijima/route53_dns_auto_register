@echo off
echo Claude Desktop を再起動中...
taskkill /IM claude.exe /F >nul 2>nul
timeout /t 5 /nobreak >nul
start "" "shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude"
echo Claude Desktop を再起動しました。
