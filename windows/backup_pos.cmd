@echo off
rem ============================================================
rem  Boba POS  -  backup_pos.cmd
rem  Safety-net daily backup. Copies the database into
rem  backend\data\backups\ AND onto a USB pendrive if one is
rem  plugged in. Runs automatically every day via Task Scheduler
rem  (install with install_backup.cmd). Safe to run anytime.
rem ============================================================
setlocal
cd /d "%~dp0.."

rem --- date stamp (locale-independent) ------------------------
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "D=%%i"

if not exist "%CD%\backend\data\backups" mkdir "%CD%\backend\data\backups"

rem --- local copy ----------------------------------------------
copy /Y "%CD%\backend\data\pos.db" "%CD%\backend\data\backups\pos-%D%.db" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] local database backup
) else (
  echo [OK] local backup: backend\data\backups\pos-%D%.db
)

rem --- USB copy (try several drive letters) --------------------
set "USB_COPIED="
for %%D in (D E F G H) do (
  if exist %%D:\ (
    if not exist "%%D:\BobaPOS Backups" mkdir "%%D:\BobaPOS Backups" >nul 2>&1
    if exist "%%D:\BobaPOS Backups" (
      copy /Y "%CD%\backend\data\pos.db" "%%D:\BobaPOS Backups\pos-%D%.db" >nul 2>&1
      if not errorlevel 1 (
        echo [OK] USB backup: %%D:\BobaPOS Backups\pos-%D%.db
        set "USB_COPIED=1"
      )
    )
  )
)
if not defined USB_COPIED echo [..] No USB pendrive detected - skipped USB copy.

endlocal
exit /b 0