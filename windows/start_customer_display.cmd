@echo off
rem ============================================================
rem  Boba POS  -  start_customer_display.cmd
rem  Opens the customer display on a second monitor in kiosk mode
rem  (full screen, no browser chrome). The display is read-only and
rem  is fed by the cashier window over a BroadcastChannel, so it
rem  only needs this page - it never calls the server API.
rem
rem  Uses:  \windows\start_pos.cmd   (POS server + cashier screen)
rem         \windows\start_customer_display.cmd  (customer screen)
rem
rem  Tip: put a shortcut to this file in your Startup folder
rem  (Win+R -> shell:startup) so it re-opens after reboot.
rem ============================================================
setlocal
cd /d "%~dp0.."

if "%APP_PORT%"=="" set "APP_PORT=4000"

rem --- wait for the POS server to come up (max ~60s) ---------------
set /a tries=0
:waitloop
netstat -ano | findstr /R /C:":%APP_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 goto up
set /a tries+=1
if %tries% geq 60 (
  echo The POS server is not running yet. Start start_pos.cmd first.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto waitloop

:up
rem --- open the display full-screen (kiosk) ------------------------
echo Opening the customer display...
start "" "chrome.exe" --app="http://localhost:%APP_PORT%/customer" --window-size=1280,800 --kiosk
echo The customer display should now appear on the second monitor.
echo Tip: if it appears on the wrong monitor, drag it to Screen 2,
echo then close it and run this file again - it will reopen there.
endlocal