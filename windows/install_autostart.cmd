@echo off
rem ============================================================
rem  Boba POS  -  install_autostart.cmd
rem  Writes a VBS launcher into the Startup folder using the
rem  ABSOLUTE path to this folder, so the POS starts on every
rem  boot. Also starts the POS right now.  Run as the Windows
rem  user that will be logged in when the shop opens.
rem ============================================================
setlocal
rem --- resolve the folder this script lives in -----------------
for %%I in ("%~dp0.") do set "POS_DIR=%%~fI"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

rem --- generate a VBS with the correct absolute path -----------
>"%STARTUP%\BobaPOS.vbs" (
    echo Set ws = CreateObject("Wscript.Shell"^)
    echo ws.Run """%POS_DIR%\start_pos.cmd""", 0, False
)
echo Installed auto-start (boot): BobaPOS.vbs
echo Source path: %POS_DIR%\start_pos.cmd
echo Starting Boba POS now...
cscript //nologo "%STARTUP%\BobaPOS.vbs"
echo Done.
endlocal