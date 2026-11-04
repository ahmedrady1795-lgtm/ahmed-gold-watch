@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo Ahmed Gold Watch - laptop demo setup
echo ==========================================
if not exist ".venv\Scripts\python.exe" (
  echo Creating a Python 3.11 virtual environment...
  py -3.11 -m venv ".venv"
)
if not exist ".venv\Scripts\python.exe" (
  echo Trying Python 3.12...
  py -3.12 -m venv ".venv"
)
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: Install Python 3.11 or 3.12 x64 from python.org, then retry.
  goto :failed
)
".venv\Scripts\python.exe" -c "import struct,sys; assert struct.calcsize('P') == 8 and (3,11) <= sys.version_info[:2] <= (3,12), 'Python 3.11/3.12 x64 required'"
if errorlevel 1 goto :failed
echo Installing MT5 bridge dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed
if not exist ".env" (
  copy ".env.example" ".env" >nul
  if errorlevel 1 goto :failed
  echo Created .env - edit SITE_URL, MT5_BRIDGE_TOKEN and MT5_SYMBOL.
) else (
  echo Existing .env retained; secrets have NOT been overwritten.
)
echo.
echo SETUP COMPLETE. Sign in to an Exness DEMO account in MT5.
echo Then double-click start_laptop_demo.bat.
pause
exit /b 0
:failed
echo.
echo Setup failed. No trades were enabled.
pause
exit /b 1
