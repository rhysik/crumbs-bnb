@echo off
setlocal
chcp 65001 >nul
title Crumbs BNB mainnet deployment
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo STOPPED: Node.js is missing. Install Node.js LTS first.
  pause
  exit /b 1
)
if /I "%~1"=="--check" set "CRUMBS_CHECK_ONLY=1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\launch.ps1"
if errorlevel 1 (echo STOPPED. Read the error above. No automatic retry.) else (echo DONE. Read the confirmed contract and site status above.)
pause
