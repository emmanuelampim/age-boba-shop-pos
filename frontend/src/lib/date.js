const ACCRA = "Africa/Accra";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateTime(isoString) {
  return `${formatDate(isoString)}, ${formatTime(isoString)}`;
}

export function formatDate(isoString) {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCRA,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${String(get("day")).padStart(2, "0")} ${MONTHS[Number(get("month")) - 1]} ${get("year")}`;
}

export function formatTime(isoString) {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACCRA,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${String(get("hour")).padStart(2, "0")}:${get("minute")} ${get("dayPeriod")}`;
}