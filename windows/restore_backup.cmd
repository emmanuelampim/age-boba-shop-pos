@echo off
rem ============================================================
rem  Boba POS  -  restore_backup.cmd
rem  Controlled recovery tool: restores the database from an
rem  automatic daily backup.
rem
rem  STOP THE POS SERVER FIRST (click "Close for the day" and wait
rem  for the server window to close). Restoring while the server is
rem  running can lose data.
rem
rem  Before restoring, this script ALWAYS saves a copy of the
rem  current database, so you can go back if you change your mind.
rem ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "DATA=backend\data"

if not exist "%DATA%\pos.db" (
  echo [ERROR] No database found at %DATA%\pos.db
  echo         Nothing to restore. Run start_pos.cmd once first.
  pause & exit /b 1
)

if not exist "%DATA%\backups" (
  echo [ERROR] No backups folder found. Run the daily backup first
  echo         ^(install_backup.cmd^) or use Close-for-the-day.
  pause & exit /b 1
)

echo ================================================================
echo  AVAILABLE DAILY BACKUPS
echo ================================================================
set "COUNT=0"
for %%F in ("%DATA%\backups\pos-*.db") do (
  set /a COUNT+=1
  echo   %%~nxF
)
echo ----------------------------------------------------------------
if "%COUNT%"=="0" (
  echo [ERROR] No pos-*.db backups found in %DATA%\backups
  pause & exit /b 1
)

set "D=%~1"
if "%D%"=="" (
  set /p "D=Type a backup date (YYYY-MM-DD) from the list above: "
)
set "BACKUP=%DATA%\backups\pos-%D%.db"
if not exist "%BACKUP%" (
  echo [ERROR] No such backup: %BACKUP%
  pause & exit /b 1
)

echo.
echo This will REPLACE %DATA%\pos.db with:
echo    %BACKUP%
set /p "OK=Type RESTORE to continue, anything else to cancel: "
if /i not "%OK%"=="RESTORE" (
  echo Cancelled - nothing was changed.
  pause & exit /b 0
)

rem --- 1. keep a safety copy of the current database ---------------
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmmss"') do set "TS=%%i"
copy /Y "%DATA%\pos.db" "%DATA%\backups\pos-before-restore-%TS%.db" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Could not save the current database. Restore ABORTED.
  pause & exit /b 1
)
echo [OK] Current database saved: backups\pos-before-restore-%TS%.db

rem --- 2. copy the backup into place (via temp file to avoid a
rem        half-written pos.db if power fails mid-copy) -------------
copy /Y "%BACKUP%" "%DATA%\pos.db.tmp" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Could not copy the backup. Current database is untouched.
  pause & exit /b 1
)
move /Y "%DATA%\pos.db.tmp" "%DATA%\pos.db" >nul 2>&1

rem --- 3. note the restore (best effort, human-readable log) -------
echo %TS% restored from pos-%D%.db >> "%DATA%\backups\restore-log.txt"

echo.
echo [DONE] Restored %DATA%\pos.db from the %D% backup.
echo        - Old database kept as backups\pos-before-restore-%TS%.db
echo        - A note was added to backups\restore-log.txt
echo.
echo Now start the POS: windows\start_pos.cmd
echo Log in and check Today's Sales to confirm the data is correct.
pause
endlocal
exit /b 0