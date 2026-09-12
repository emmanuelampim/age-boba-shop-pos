@echo off
rem ============================================================
rem  Boba POS - start-here.cmd
rem  TEMPORARY debug launcher. It starts the server in this
rem  window so any error stays visible. Use this ONLY to find
rem  a problem, then keep using windows\start_pos.cmd.
rem ============================================================
echo ==============================================
echo  Boba POS - debug start
echo  Computer: %COMPUTERNAME%
echo  Date:     %DATE% %TIME%
echo ==============================================
echo.
echo [1/3] Checking Node.js...
node -v
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js was NOT found.
  echo Install node-v12.22.12-x86.msi, restart this PC,
  echo then run start-here.cmd again.
  echo.
  pause
  exit /b 1
)
echo.
echo [2/3] Locating the server file...
cd /d "%~dp0..\backend\dist"
if not exist server.cjs (
  echo.
  echo [ERROR] server.cjs was not found here:
  echo        %CD%
  echo The app folder is not extracted correctly.
  echo Extract boba-pos-release.zip to C:\ so the folder
  echo lands at C:\boba-pos, then run start-here.cmd again.
  echo.
  pause
  exit /b 1
)
echo     Found: %CD%\server.cjs
echo.
echo [3/3] Starting the server (port 4000)...
echo     If it works you will see: server_started ... node: v12.22.12
echo     If it fails, you will see a red ERROR line. Write it down.
echo.
node server.cjs
echo.
echo -------------------------------------------------
echo  Server has stopped. Copy this whole window if there
echo  was an error. Then try:  windows\start_pos.cmd
echo -------------------------------------------------
pause