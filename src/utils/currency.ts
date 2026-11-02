/**
 * Currency & Date formatting utilities for DebitLens.
 * Supports ISO 4217 currency validation and currency-specific integer minor units
 * (e.g., INR/USD/EUR/GBP = 2 decimals [100 minor units], JPY = 0 decimals [1 minor unit], KWD = 3 decimals [1000 minor units])
 * to prevent floating-point arithmetic errors and cross-currency contamination.
 */

export const SUPPORTED_CURRENCY_DECIMALS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
  CAD: 2,
  SGD: 2,
  AED: 2,
  CHF: 2,
  CNY: 2,
  HKD: 2,
  NZD: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  ZAR: 2,
  MYR: 2,
  THB: 2,
  IDR: 2,
  PHP: 2,
  BRL: 2,
  MXN: 2,
  JPY: 0,
  KRW: 0,
  VND: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
};

export function isValidCurrencyCode(currency: string | null | undefined): boolean {
  if (!currency || typeof currency !== 'string') return false;
  const code = currency.trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCY_DECIMALS, code);
}

export function normalizeCurrencyCode(
  currency: string | null | undefined,
  fallback: string = ''
): string {
  if (currency !== null && currency !== undefined) {
    if (typeof currency !== 'string') return '';
    const trimmed = currency.trim().toUpperCase();
    if (!trimmed) {
      return fallback && isValidCurrencyCode(fallback) ? fallback.trim().toUpperCase() : '';
    }
    return isValidCurrencyCode(trimmed) ? trimmed : '';
  }
  return fallback && isValidCurrencyCode(fallback) ? fallback.trim().toUpperCase() : '';
}

export function getCurrencyDecimals(currency: string = 'INR'): number {
  const code = normalizeCurrencyCode(currency, 'INR');
  return SUPPORTED_CURRENCY_DECIMALS[code] ?? 2;
}

export function getMinorUnitMultiplier(currency: string = 'INR'): number {
  return Math.pow(10, getCurrencyDecimals(currency));
}

export function getMinorUnitLabel(currency: string = 'INR'): string {
  if (!isValidCurrencyCode(currency)) return 'minor units (unsupported currency)';
  const code = normalizeCurrencyCode(currency, 'INR');
  if (code === 'INR') return 'paise';
  if (code === 'USD' || code === 'EUR' || code === 'AUD' || code === 'CAD' || code === 'SGD') return 'cents';
  if (code === 'GBP') return 'pence';
  if (getCurrencyDecimals(code) === 0) return 'whole units';
  return 'minor units';
}

export function toMinorUnits(
  amountMajor: number | null | undefined,
  currency: string = 'INR'
): number {
  if (amountMajor === null || amountMajor === undefined || Number.isNaN(amountMajor)) {
    return 0;
  }
  const factor = getMinorUnitMultiplier(currency);
  return Math.round(amountMajor * factor);
}

export function fromMinorUnits(
  amountMinor: number | null | undefined,
  currency: string = 'INR'
): number {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(amountMinor)) {
    return 0;
  }
  const factor = getMinorUnitMultiplier(currency);
  return Math.round(amountMinor) / factor;
}

export function formatMinorCurrency(
  amountMinor: number | null | undefined,
  currency: string | null | undefined = 'INR'
): string {
  if (
    amountMinor === null ||
    amountMinor === undefined ||
    typeof amountMinor !== 'number' ||
    Number.isNaN(amountMinor) ||
    !Number.isFinite(amountMinor)
  ) {
    return 'Amount unavailable';
  }
  if (currency === null) {
    return `${(amountMinor / 100).toFixed(2)} (Currency unavailable)`;
  }
  if (typeof currency === 'string') {
    const trimmed = currency.trim().toUpperCase();
    if (!trimmed) {
      return `${(amountMinor / 100).toFixed(2)} (Currency unavailable)`;
    }
    if (!isValidCurrencyCode(trimmed)) {
      return `${(amountMinor / 100).toFixed(2)} ${trimmed} (Unsupported currency)`;
    }
  }
  const code = normalizeCurrencyCode(currency, 'INR');
  const decimals = getCurrencyDecimals(code);
  const factor = Math.pow(10, decimals);
  const major = fromMinorUnits(amountMinor, code);
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: decimals === 0 ? 0 : amountMinor % factor === 0 ? 0 : decimals,
    maximumFractionDigits: decimals,
  }).format(major);
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined = 'INR'
): string {
  if (
    amount === null ||
    amount === undefined ||
    typeof amount !== 'number' ||
    Number.isNaN(amount) ||
    !Number.isFinite(amount)
  ) {
    return 'Amount unavailable';
  }
  if (currency === null) {
    return `${amount.toFixed(2)} (Currency unavailable)`;
  }
  if (typeof currency === 'string') {
    const trimmed = currency.trim().toUpperCase();
    if (!trimmed) {
      return `${amount.toFixed(2)} (Currency unavailable)`;
    }
    if (!isValidCurrencyCode(trimmed)) {
      return `${amount.toFixed(2)} ${trimmed} (Unsupported currency)`;
    }
  }
  const code = normalizeCurrencyCode(currency, 'INR');
  const decimals = getCurrencyDecimals(code);
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatMinorINR(
  amountMinor: number | null | undefined,
  currency: string | null | undefined = 'INR'
): string {
  return formatMinorCurrency(amountMinor, currency);
}

export function formatINR(
  amount: number | null | undefined,
  currency: string | null | undefined = 'INR'
): string {
  return formatCurrency(amount, currency);
}

export { formatDateIN, formatDateTimeIN, normalizeDateString } from './dateUtils';
