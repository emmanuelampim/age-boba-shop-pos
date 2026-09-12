import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Prints receipts to the on-site thermal printer (XPrinter XP-90/XP-E200L).
//
// Primary path: a RAW ESC/POS spool job sent straight to the Windows default
// printer via winspool.drv. ESC/POS is what these printers natively speak —
// it renders the text at the printer's built-in font AND lets us send the
// auto-cutter command (GS V …) at the end, so the paper is cut after every
// receipt instead of needing to be torn.
//
// Fallback: if the raw job fails (e.g. the driver rejects RAW jobs), we fall
// back to sending plain text through PowerShell's Out-Printer, which is the
// previous behaviour. Set PRINTER_RAW=0 to force that path.

export function canPrintLocally() {
  return process.platform === 'win32';
}

const USE_RAW = process.env.PRINTER_RAW !== '0';

// Print density (grayscale) 0–8, where 8 is darkest. Runs on every receipt
// because ESC @ (which resets it) is sent at the start of each job.
const PRINTER_DENSITY = Math.max(0, Math.min(8, Number(process.env.PRINTER_DENSITY ?? 8) || 8));

// Keep only characters a thermal printer's built-in font can render.
// The Ghana cedi sign (U+20B5) is not in ESC/POS fonts — print "GH¢" instead
// (the common Ghana-thermal rendering) — and drop anything else exotic.
function sanitizeForThermal(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      out += ch;
      continue;
    }
    if (code === 0x20b5) {
      out += '¢';
      continue;
    }
    // Keep common Latin-1 punctuation/accents (easily rendered); drop the rest.
    if (code >= 0x00a1 && code <= 0x00ff && code !== 0x00ad) {
      out += ch;
      continue;
    }
    out += ' ';
  }
  return out;
}

export function buildEscPosBytes(text) {
  const body = Buffer.from(sanitizeForThermal(text), 'latin1');
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]), // ESC @ : initialize printer
    Buffer.from([0x1b, 0x74, 0x10]), // ESC t 16 : Windows-1252 (so ¢ renders)
    Buffer.from([0x1b, 0x6d, PRINTER_DENSITY]), // ESC m n : print grayscale 0–8 (8 = darkest)
    body,
    Buffer.from('\n\n\n'), // trailing feed so the blade clears the last line
    Buffer.from([0x1d, 0x56, 0x42, 0x02, 0x01]), // GS V B n=2 m=1 : feed + partial cut
  ]);
}

function sendRawSpool(bytes) {
  const b64 = bytes.toString('base64');
  const ps = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawSpool {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DocInfo { public string Name; public string Output; public string DataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Ansi)]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv")]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr h, int l, DocInfo d);
  [DllImport("winspool.drv")]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv")]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv")]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv")]
  public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Cannot open printer: " + printer);
    try {
      DocInfo di = new DocInfo { Name = "PosReceipt", DataType = "RAW" };
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed");
      try {
        StartPagePrinter(h);
        IntPtr buf = Marshal.AllocHGlobal(bytes.Length);
        Marshal.Copy(bytes, 0, buf, bytes.Length);
        int written = 0;
        WritePrinter(h, buf, bytes.Length, out written);
        Marshal.FreeHGlobal(buf);
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
$printer = (Get-WmiObject Win32_Printer -Filter "Default=True").Name
if (-not $printer) { throw "No default printer configured" }
$bytes = [Convert]::FromBase64String('${b64}')
[RawSpool]::Send($printer, $bytes)
`;
  return execPowerShell(ps);
}

function sendTextFallback(text) {
  const tmpPath = path.join(
    os.tmpdir(),
    `pos-receipt-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}.txt`,
  );
  fs.writeFileSync(tmpPath, text, 'utf-8');
  try {
    const script = `[System.IO.File]::ReadAllText('${tmpPath.replace(/'/g, "''")}') | Out-Printer`;
    execPowerShell(script);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

function execPowerShell(script) {
  const psPath = path.join(
    os.tmpdir(),
    `pos-print-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}.ps1`,
  );
  fs.writeFileSync(psPath, script, 'utf-8');
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psPath],
      { timeout: 20000, windowsHide: true, stdio: 'pipe' },
    );
  } finally {
    try {
      fs.unlinkSync(psPath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

export function printText(text) {
  if (!canPrintLocally()) {
    const err = new Error('Direct printing is only available on the on-site POS machine.');
    err.code = 'PRINT_LOCAL_ONLY';
    throw err;
  }

  if (USE_RAW) {
    try {
      sendRawSpool(buildEscPosBytes(text));
      return;
    } catch (rawErr) {
      // The printer's driver may reject RAW jobs (e.g. GDI-only driver).
      // Degrade to the plain-text spooler path rather than breaking printing.
      const hint = rawErr.stderr ? String(rawErr.stderr) : String(rawErr.message || rawErr);
      console.warn(`[printer] RAW spool failed, using text path: ${hint.slice(0, 500)}`);
    }
  }

  try {
    sendTextFallback(text);
  } catch (err) {
    err.code = err.code || 'PRINT_FAILED';
    err.message = `spool_job_failed: ${err.message}`;
    throw err;
  }
}