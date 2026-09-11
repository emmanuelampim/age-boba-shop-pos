@echo off
rem ============================================================
rem  Boba POS  -  remove_autostart.cmd
rem  Removes all auto-start mechanisms installed by
rem  install_autostart.cmd. Does NOT stop a running POS.
rem ============================================================
setlocal

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

del /Q "%STARTUP%\BobaPOS.vbs" 2>nul
echo [ok] Removed startup-folder shortcut.

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "BobaPOS" /f >nul 2>&1
echo [ok] Removed Registry Run key.

schtasks /Delete /TN "BobaPOS" /F >nul 2>&1
echo [ok] Removed scheduled task.

echo Done. Auto-start has been disabled.
endlocal