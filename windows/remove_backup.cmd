@echo off
rem ============================================================
rem  Boba POS  -  remove_backup.cmd
rem  Removes the "BobaPOS Daily Backup" scheduled task.
rem ============================================================
setlocal

schtasks /Delete /TN "BobaPOS Daily Backup" /F >nul 2>&1
if %errorlevel%==0 (
  echo [OK] Scheduled task "BobaPOS Daily Backup" removed.
) else (
  echo [..] No scheduled task found - nothing to remove.
)

endlocal
pause