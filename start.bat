@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 18 或更高版本: https://nodejs.org/
  pause
  exit /b 1
)
node server.js
if errorlevel 1 pause