export const CURRENCY = {
  code: 'GHS',
  symbol: 'GH₵',
  scale: 100, // 1 GH₵ = 100 pesewas
  name: 'Ghanaian Cedi',
};

export function toCents(ghsAmount) {
  return Math.round(ghsAmount * CURRENCY.scale);
}

export function centsToUnits(cents) {
  return cents / CURRENCY.scale;
}

export function formatCents(cents) {
  const n = Number(cents);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / CURRENCY.scale);
  const frac = abs % CURRENCY.scale;
  return `${sign}${CURRENCY.symbol}${whole.toLocaleString('en-GH')}.${String(frac).padStart(2, '0')}`;
}

export function isValidCentAmount(value) {
  return Number.isInteger(value) && value >= 0;
}