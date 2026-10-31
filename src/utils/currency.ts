/**
 * Currency & Date formatting utilities for DebitLens.
 * Supports integer minor units (1 INR = 100 paise; e.g. ₹499 = 49900 paise)
 * to avoid floating-point arithmetic errors in financial reconciliation.
 */

export function toMinorUnits(amountMajor: number | null | undefined): number {
  if (amountMajor === null || amountMajor === undefined || Number.isNaN(amountMajor)) {
    return 0;
  }
  return Math.round(amountMajor * 100);
}

export function fromMinorUnits(amountMinor: number | null | undefined): number {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(amountMinor)) {
    return 0;
  }
  return Math.round(amountMinor) / 100;
}

export function formatMinorINR(
  amountMinor: number | null | undefined,
  currency: string = 'INR'
): string {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(amountMinor)) {
    return '₹0';
  }
  const major = fromMinorUnits(amountMinor);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '₹0.00';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateIN(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate + (isoDate.includes('T') ? '' : 'T00:00:00Z'));
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
