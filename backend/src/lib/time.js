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
// Ghana is UTC+0 all year round (no daylight saving), so today's date
// there is the same as the UTC date. Computed from UTC directly so the
// server does not depend on ICU timezone data (which can be missing in
// minimal Node.js builds).
export function todayStartUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  // Construct the Accra "00:00:00" wall time as a UTC timestamp for range
  // comparisons, since SQLite stores UTC timestamps.
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

export function todayEndUtc() {
  const start = todayStartUtc();
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}