@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0GoldWatch.ps1" -Action Start -Mode Standard
if errorlevel 1 pause
