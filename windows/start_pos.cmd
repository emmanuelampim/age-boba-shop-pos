@echo off
rem ============================================================
rem  Boba POS  -  start_pos.cmd
rem  Starts the POS backend server (and opens the POS in the
rem  default browser). Safe to run repeatedly - if the server is
rem  already listening it just opens the page.
rem ============================================================
setlocal
cd /d "%~dp0.."

if not exist "%CD%\backend\data" mkdir "%CD%\backend\data"

if "%APP_PORT%"=="" set "APP_PORT=4000"

rem --- is the server already up? ---------------------------------
netstat -ano | findstr /R /C:":%APP_PORT% .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo Boba POS server is already running on port %APP_PORT%.
) else (
  echo Starting Boba POS server...
  rem logs go to backend\data\server.log so nothing is lost when window closes
  start "Boba POS Server" /min cmd /c "cd /d %CD%\backend\dist && node server.cjs >> \"%CD%\backend\data\server.log\" 2>&1"
)

rem --- give the server a moment, then open the POS -----------------
timeout /t 4 /nobreak >nul
start "" "http://localhost:%APP_PORT%"
echo Boba POS is ready at http://localhost:%APP_PORT%
endlocal