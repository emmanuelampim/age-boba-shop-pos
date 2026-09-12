' Boba POS - backup_pos.vbs
' Runs the daily backup quietly (no console window).
' Used by the "BobaPOS Daily Backup" scheduled task.
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Run """" & folder & "\backup_pos.cmd"", 0, True