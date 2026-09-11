BOBA POS - WINDOWS 7 SETUP (local POS machine)
================================================

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
- Copy it to a USB stick / cloud at the end of each day, or better:
  schedule it. If the file is ever lost, the shop's history is lost.
- Stop the server before copying (stop_pos.cmd) or copy while running;
  the file is replace-safe but copying a running file can give a
  slightly stale copy.

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
  backend\db\migrations\    database schema versions
  frontend\dist\            the POS web app itself (served by the server)
  backend\data\pos.db       ALL shop data (back this up)
  backend\data\server.log   server log file