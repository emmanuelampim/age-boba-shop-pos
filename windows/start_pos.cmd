@echo off
rem ============================================================
rem  Boba POS  -  start_pos.cmd
rem  Starts the POS backend server (and opens the POS in the
rem  default browser). Safe to run repeatedly.
rem ============================================================
setlocal
cd /d "%~dp0.."

if not exist "%CD%\backend\data" mkdir "%CD%\backend\data"

rem --- already running? -------------------------------------------------
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %errorlevel%==0 (
  echo Boba POS server is already running.
) else (
  echo Starting Boba POS server...
  rem logs go to backend\data\server.log so nothing is lost when window closes
  start "Boba POS Server" /min cmd /c "cd /d %CD%\backend\dist && node server.cjs >> \"%CD%\backend\data\server.log\" 2>&1"
)

rem --- give the server a moment, then open the POS ----------------------
timeout /t 4 /nobreak >nul
start "" "http://localhost:4000"
echo Boba POS is ready at http://localhost:4000
endlocal