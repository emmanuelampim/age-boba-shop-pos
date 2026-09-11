import { config } from '../config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level, msg, meta) {
  const threshold = LEVELS[config.logLevel] ?? LEVELS.info;
  if (LEVELS[level] < threshold) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta && { ...meta }),
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};