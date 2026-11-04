@echo off
setlocal
cd /d "%~dp0"
title Ahmed Gold Watch - MT5 DEMO only
if not exist ".venv\Scripts\python.exe" (
  echo Run setup_laptop.bat first.
  goto :failed
)
if not exist ".env" (
  echo Missing .env. Run setup_laptop.bat first.
  goto :failed
)
".venv\Scripts\python.exe" check_laptop.py
if errorlevel 1 goto :failed
echo.
echo Starting MT5 bridge in DEMO / DRY-RUN mode.
echo Press Ctrl+C to stop. Keep MT5 running and this window open.
".venv\Scripts\python.exe" bridge.py
echo Bridge stopped. See messages above.
pause
exit /b 0
:failed
echo No live trading has been enabled.
pause
exit /b 1
