import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Sends plain text to the Windows print spooler, which hands it to the
// machine's default printer (the XPrinter XP-E200L receipt printer).
// This bypasses the browser entirely, so there is no pagination, no
// scaling to A4 and no duplicate copies: one spool job, one receipt.

export function canPrintLocally() {
  return process.platform === 'win32';
}

export function printText(text) {
  if (!canPrintLocally()) {
    const err = new Error('Direct printing is only available on the on-site POS machine.');
    err.code = 'PRINT_LOCAL_ONLY';
    throw err;
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `pos-receipt-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}.txt`,
  );
  fs.writeFileSync(tmpPath, text, 'utf-8');

  try {
    // PowerShell 2.0 compatible (Windows 7): avoid Get-Content -Raw.
    // Read the file with .NET and pipe it to Out-Printer (default printer).
    const script = `[System.IO.File]::ReadAllText('${tmpPath.replace(/'/g, "''")}') | Out-Printer`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 15000,
      windowsHide: true,
      stdio: 'pipe',
    });
  } catch (err) {
    err.code = err.code || 'PRINT_FAILED';
    err.message = `spool_job_failed: ${err.message}`;
    throw err;
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}