export function formatCents(cents, symbol = "GH₵") {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const formatted = `${symbol}${(abs / 100).toFixed(2)}`;
  return negative ? `-${formatted}` : formatted;
}
