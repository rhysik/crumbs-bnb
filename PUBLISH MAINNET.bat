@echo off
setlocal
chcp 65001 >nul
title Crumbs mainnet site publication
cd /d "%~dp0"
node deploy/publish.mjs --mainnet
if errorlevel 1 echo STOPPED: publication failed. This command never deploys a contract.
pause
