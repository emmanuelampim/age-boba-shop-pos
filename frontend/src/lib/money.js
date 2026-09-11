export function formatCents(cents, symbol = "GH₵") {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const formatted = `${symbol}${(abs / 100).toFixed(2)}`;
  return negative ? `-${formatted}` : formatted;
}

// Convert an amount typed in Ghana cedis (e.g. "5" or "5.50") to integer pesewas.
export function ghsToCents(ghs) {
  const n = Number(ghs);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Convert integer pesewas back to a numerical GHS string for editing (e.g. 500 -> "5").
export function centsToGhs(cents) {
  if (cents == null || cents === "") return "";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  return String(n / 100);
}
