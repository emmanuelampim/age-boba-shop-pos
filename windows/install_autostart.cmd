@echo off
rem ============================================================
rem  Boba POS  -  install_autostart.cmd
rem  Registers launch_pos.vbs in the Startup folder so the POS
rem  starts automatically every time the computer boots.
rem  Also starts the POS right now. Run as the Windows user that
rem  will be logged in when the shop opens.
rem ============================================================
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%~dp0launch_pos.vbs" "%STARTUP%\BobaPOS.vbs" >nul
echo Installed auto-start (boot): BobaPOS.vbs
echo Starting Boba POS now...
cscript //nologo "%STARTUP%\BobaPOS.vbs"
echo Done.
endlocal