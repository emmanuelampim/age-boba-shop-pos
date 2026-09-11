@echo off
rem ============================================================
rem  Boba POS  -  stop_pos.cmd
rem  Stops the POS server (kills node.exe).
rem  NOTE: on a dedicated POS machine this also stops any other
rem  running Node programs. Only restart via start_pos.cmd.
rem ============================================================
taskkill /F /IM node.exe 2>nul
echo Boba POS server stopped.