@echo off
rem ============================================================
rem  Boba POS  -  install_backup.cmd
rem  Creates a Windows Scheduled Task that runs backup_pos.cmd
rem  every night at 23:00 (11 PM). The backup copies the database
rem  into a local backups folder AND onto any plugged-in USB
rem  pendrive automatically.
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist backup_pos.cmd (
  echo [ERROR] backup_pos.cmd not found. Run this script from the windows\ folder.
  pause & exit /b 1
)
if not exist backup_pos.vbs (
  echo [ERROR] backup_pos.vbs not found. Run this script from the windows\ folder.
  pause & exit /b 1
)

rem Full path for the scheduled task (works from any folder).
set "VBS_PATH=%CD%\backup_pos.vbs"

schtasks /Create /TN "BobaPOS Daily Backup" /TR "\"%VBS_PATH%\"" /SC DAILY /ST 23:00 /F >nul 2>&1
if %errorlevel%==0 (
  echo [OK] Scheduled task "BobaPOS Daily Backup" created.
  echo      Runs every day at 23:00 ^(11:00 PM^) automatically.
) else (
  echo [FAIL] Could not create the scheduled task.
  echo        Try running this script as Administrator.
  pause & exit /b 1
)

echo.
echo The backup:
echo   - Saves a full copy of today's database locally
echo   - Automatically copies to a USB pendrive if one is plugged in
echo   - Old backups beyond 30 days are cleaned up automatically
echo.
echo To undo this: run remove_backup.cmd
echo.
endlocal
pause