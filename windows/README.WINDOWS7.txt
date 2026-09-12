BOBA POS - WINDOWS 7 SETUP (local POS machine)
================================================

Follow these documents, in order:
  1. WINDOWS-7-SETUP-GUIDE.txt      - install everything (17 steps)
  2. DAILY-USE-GUIDE.txt            - how the cashier runs a normal day
  3. CUSTOMER-DISPLAY-SETUP.txt     - second screen customers watch
  4. PRINTER-SETUP-GUIDE.txt        - Xprinter XP-E200L receipt printer
  5. TROUBLESHOOTING-WINDOWS-7.txt  - what to do when something is wrong

This folder runs the POS entirely on the shop's computer. No internet
required after setup. The server + data live here; a web browser is the
screen facing the cashier.

WHAT YOU NEED ON A WINDOWS 7 MACHINE
------------------------------------
1. Node.js 12.22.12 (the last Node that runs on Windows 7)
   - Download: nodejs.org -> Node 12.22.12 x64 MSI
   - "node-v12.22.12-x64.msi", run it, accept defaults.
   - Troubleshooting: if Node refuses to install, install
     "Internet Explorer 11" + the latest Windows 7 updates first
     (Node's installer needs them).
2. Any modern browser. Chrome 109 is the last Chrome that works on
   Windows 7 (official offline installer from chrome.google.com).
   Firefox ESR also works. The POS opens in whatever your default
   browser is.
3. Copy this whole boba-pos folder to e.g. C:\boba-pos on the machine.

FIRST-TIME SETUP
----------------
1. Right-click  windows\start_pos.cmd  -> Run (tests the POS).
   - A "Boba POS Server" window appears (it can be minimized).
   - Browser opens at http://localhost:4000
   - The first run creates backend\data\pos.db and seeds the shop:
     mavisampim@gmail.com / Owner@123   (CHANGE THIS PASSWORD! Settings -> Users)
2. If the screen that opens can be seen by customers, set a kiosk mode
   later so they can't close the tab.

AUTO-START ON BOOT
------------------
1. Right-click  windows\install_autostart.cmd  -> Run as the Windows
   user who will be logged in when the shop opens.
2. It registers the POS THREE independent ways so it always starts:
     1. Startup-folder shortcut  (Startup\BobaPOS.vbs)
     2. Registry Run key         (HKCU\...\CurrentVersion\Run)
     3. Scheduled task           (at logon)
   If one gets turned off by antivirus or a mistake, the others still
   start the POS. It also starts the POS right now.
3. Every boot: server starts hidden, the POS page opens in the
   browser automatically, no clicks, no internet.
- To REMOVE auto-start later:  windows\remove_autostart.cmd

DAILY USE
---------
- Already running? Just use the browser tab. Don't start it twice
  -- start_pos.cmd checks the port and just opens the page.
- PC was turned OFF? Turn it on, log in, wait ~10 seconds: the POS
  opens by itself.
- CLOSE FOR THE DAY (no command lines, one click):
  In the POS, click the "Close for the day" button (bottom-left).
  It re-saves ALL data, shows a green "All sales are saved" screen,
  then turns the server off. After that you can switch off the
  computer. Simple enough for anyone.

BACKUPS (very important!)
-------------------------
- All data is in ONE file:  backend\data\pos.db
- Every time someone clicks "Close for the day", the POS keeps a
  full copy of the day automatically:
      backend\data\backups\pos-YYYY-MM-DD.db     (full data)
      backend\data\backups\sales-YYYY-MM-DD.csv  (a spreadsheet of
       the day's sales that opens in Excel, one row per item bought)
  It keeps the last 30 days, and cleans up older copies itself.
- USB PENDRIVE (automatic): if a USB stick is plugged in, the same
  two files are also copied automatically into a "BobaPOS Backups"
  folder on the stick (the stick can stay in the machine all day).
  To copy to a fixed drive/folder instead, set USB_BACKUP_DIR:
      set USB_BACKUP_DIR=E:\BobaPOS Backups
  in start_pos.cmd before the server starts. A perpetual safety-net
  (even if nobody closes for the day):
      1. Right-click  windows\install_backup.cmd  -> Run
      2. It schedules a daily backup at 11:00 PM that copies the
         database locally + to any plugged-in USB stick.
      - Undo:  windows\remove_backup.cmd
- The Sales page also has a "Download report (Excel/CSV)" button:
  pick any date range and it downloads the sales as a spreadsheet
  you can open on any office computer (Excel/LibreOffice/Google Sheets).

RECOVERY (if something goes wrong)
----------------------------------
- Every sale is saved the moment it is confirmed, and kept in one
  file. If the main database is ever lost or damaged, restore it
  from an automatic backup:
      1. "Close for the day" and wait for the server window to close
         (the server MUST be stopped before restoring).
      2. Right-click  windows\restore_backup.cmd  -> Run
      3. It shows the list of daily backups, asks which date to
         restore, and ALWAYS keeps a safety copy of the current
         database first (pos-before-restore-<time>.db).
      4. Start the POS again with start_pos.cmd and check Today's Sales.
- Restores are logged in backups\restore-log.txt. Only the owner
  should ever run the restore script.
- Reinstalling/copying the shop to another computer: stop the server,
  copy backend\data\pos.db (and the backups\ folder), start the POS.

FIREWALL
--------
- This is a local-only app (localhost). If Windows shows a firewall
  prompt, it is safe to uncheck "Public networks" and keep it local.

TROUBLESHOOTING
---------------
- "Boba POS Server" window flashes and closes:
  open it manually:  cmd, then:
      cd C:\boba-pos\backend\dist
      node server.cjs
  Paste the error when asking for help.
- Page loads but login fails:
  open windows\start_pos.cmd again - the server may have died.
- Forgot the owner password:
  Delete backend\data\pos.db ONLY as a last resort (fresh shop,
  settings reset to defaults, seeded owner is back).

WHAT IS WHERE
-------------
  backend\dist\server.cjs   the whole server (self-contained)
  backend\dist\sql-wasm.wasm  SQLite engine used by the server
  backend\db\migrations\    database schema versions (ship WITH the
                            package.json inside it)
  frontend\dist\            the POS web app itself (served by the server)
  backend\data\pos.db       ALL shop data (back this up)
  backend\data\backups\     automatic daily copies (db + csv)
  backend\data\server.log   server log file