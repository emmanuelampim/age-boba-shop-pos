import { config } from '../config.js';
import { createDailyBackup, dayStamp } from '../services/backupService.js';
import { logger } from './logger.js';

function parseTime(value) {
  const [h = '23', m = '55'] = String(value || '23:55').split(':');
  return { hour: Number(h) || 23, minute: Number(m) || 55 };
}

function msUntilNext(hour, minute, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

let timer = null;

export function scheduleDailyBackup() {
  if (config.testing) return () => {};
  if (timer) clearTimeout(timer);

  const { hour, minute } = parseTime(config.backupSchedule);
  const waitMs = msUntilNext(hour, minute);

  timer = setTimeout(runBackupOnce, waitMs);
  logger.info('backup_scheduled', {
    at: config.backupSchedule,
    inMs: waitMs,
    dir: config.backupDir,
  });

  return function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

function runBackupOnce() {
  try {
    const { hour, minute } = parseTime(config.backupSchedule);
    const result = createDailyBackup({ dateStr: dayStamp() });
    logger.info('backup_auto_done', { files: result.local });
    // Reschedule for the next day (not a repeating interval, so a long
    // backup at the exact minute cannot drift the schedule).
    timer = setTimeout(runBackupOnce, msUntilNext(hour, minute));
  } catch (err) {
    logger.error('backup_auto_failed', { message: err.message });
    timer = setTimeout(runBackupOnce, 60 * 60 * 1000);
  }
}

export { dayStamp };