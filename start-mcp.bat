@echo off
cd /d "%~dp0"
call npm install --silent >nul 2>nul
call npx tsc >nul 2>nul
node dist/mcp-server.js
