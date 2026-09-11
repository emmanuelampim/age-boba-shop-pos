const TIMEZONE = 'Africa/Accra';

export function timezone() {
  return TIMEZONE;
}

export function nowUtc() {
  return new Date().toISOString();
}

export function zonedTimeFormatter() {
  try {
    return new Intl.DateTimeFormat('en-GH', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

export function formatZoned(isoUtc) {
  const d = isoUtc ? new Date(isoUtc) : new Date();
  const fmt =
    zonedTimeFormatter() ||
    new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  return fmt.format(d);
}

// Day start ("today") in Africa/Accra, returned as a UTC ISO string.
export function todayStartUtc() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  // Construct the local "00:00:00" wall time and treat it as UTC for range comparisons,
  // since SQLite stores UTC timestamps.
  return `${map.year}-${map.month}-${map.day}T00:00:00.000Z`;
}

export function todayEndUtc() {
  const start = todayStartUtc();
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}