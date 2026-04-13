@echo off
cd /d "%~dp0"
call npm install --silent 2>nul
call npx tsc 2>nul
node dist/mcp-server.js
