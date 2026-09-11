@echo off
rem ============================================================
rem  Boba POS  -  install_autostart.cmd
rem  Makes the POS start automatically every time the computer
rem  boots or a user logs on. Registers THREE independent
rem  mechanisms so it starts even if one is disabled:
rem    1. Startup-folder shortcut (VBS)
rem    2. Windows Registry "Run" key (registry)
rem    3. Task Scheduler "at logon" task
rem  All of them point at the SAME hidden launcher with the
rem  absolute path baked in. Also starts the POS right now.
rem ============================================================
setlocal enabledelayedexpansion

rem --- resolve the folder this script lives in -----------------
for %%I in ("%~dp0.") do set "POS_DIR=%%~fI"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

rem --- 1) Startup-folder VBS with the correct absolute path ----
>"%STARTUP%\BobaPOS.vbs" (
    echo Set ws = CreateObject("Wscript.Shell"^)
    echo ws.Run """%POS_DIR%\start_pos.cmd""", 0, False
)
if exist "%STARTUP%\BobaPOS.vbs" (
    echo [ok] Startup folder: BobaPOS.vbs
) else (
    echo [!!] Could not write to the Startup folder.
)

rem --- 2) Registry Run key (logs on with the current user) -----
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "BobaPOS" /t REG_SZ /d "\"wscript.exe\" \"%STARTUP%\BobaPOS.vbs\"" /f >nul 2>&1
if %errorlevel%==0 (
    echo [ok] Registry: HKCU\...\Run\BobaPOS
) else (
    echo [!!] Could not write the Registry Run key.
)

rem --- 3) Task Scheduler "at logon" task ------------------------
schtasks /Create /TN "BobaPOS" /TR "\"%STARTUP%\BobaPOS.vbs\"" /SC ONLOGON /RL LIMITED /F >nul 2>&1
if %errorlevel%==0 (
    echo [ok] Task Scheduler: BobaPOS at logon
) else (
    echo [!!] Could not create the scheduled task ^(needs permission^). The other two methods still work.
)

echo --------------------------------------------
echo All methods point at: %POS_DIR%\start_pos.cmd
echo Starting Boba POS now...
cscript //nologo "%STARTUP%\BobaPOS.vbs"
echo Done. The POS will now start on every boot.
echo (To remove auto-start later, run: windows\remove_autostart.cmd)
endlocal