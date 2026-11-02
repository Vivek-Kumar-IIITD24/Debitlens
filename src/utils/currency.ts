/**
 * Currency & Minor-Unit utilities for DebitLens.
 * Enforces strict ISO 4217 currency validation, explicit currency precision rules
 * (INR/USD/EUR/GBP = 2 decimals, JPY = 0 decimals, KWD/BHD/OMR = 3 decimals),
 * and explicit distinction between UNKNOWN currency (source did not specify currency)
 * and UNSUPPORTED currency (source specified an unsupported currency code).
 *
 * Never silently defaults missing currency to INR or missing amount to zero.
 */

export const UNKNOWN_CURRENCY = 'UNKNOWN' as const;

export type CurrencyProvenance =
  | 'EXPLICIT_TRANSACTION'
  | 'CONFIRMED_ACCOUNT_DEFAULT'
  | 'USER_SELECTED_MAPPING'
  | 'UNKNOWN_SOURCE';

export type CurrencyStatus = 'SUPPORTED' | 'UNKNOWN' | 'UNSUPPORTED';

export interface ResolvedCurrencyInfo {
  currency: string;
  currencyProvenance: CurrencyProvenance;
  currencyStatus: CurrencyStatus;
  decimals: number | null;
  isMalformedCode: boolean;
}

export type StrictMoneyConversionError =
  | 'MISSING_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'UNSAFE_INTEGER'
  | 'MISSING_CURRENCY'
  | 'UNKNOWN_CURRENCY'
  | 'UNSUPPORTED_CURRENCY';

export type StrictMoneyConversionResult =
  | {
      ok: true;
      value: number;
      currency: string;
      decimals: number;
    }
  | {
      ok: false;
      value: null;
      error: StrictMoneyConversionError;
      currency: string | null;
    };

export const SUPPORTED_CURRENCY_DECIMALS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
  CAD: 2,
  SGD: 2,
  AED: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export function isUnknownCurrency(currency: string | null | undefined): boolean {
  if (currency === null || currency === undefined || typeof currency !== 'string') return true;
  const trimmed = currency.trim().toUpperCase();
  return trimmed === '' || trimmed === UNKNOWN_CURRENCY;
}

export function isValidCurrencyCode(currency: string | null | undefined): boolean {
  if (!currency || typeof currency !== 'string') return false;
  const code = currency.trim().toUpperCase();
  if (!code || code === UNKNOWN_CURRENCY) return false;
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCY_DECIMALS, code);
}

export const isSupportedCurrency = isValidCurrencyCode;

export function isUnsupportedCurrency(currency: string | null | undefined): boolean {
  if (isUnknownCurrency(currency)) return false;
  return !isValidCurrencyCode(currency);
}

export function getCurrencyStatus(currency: string | null | undefined): CurrencyStatus {
  if (isUnknownCurrency(currency)) return 'UNKNOWN';
  if (isValidCurrencyCode(currency)) return 'SUPPORTED';
  return 'UNSUPPORTED';
}

export function normalizeCurrencyCode(
  currency: string | null | undefined,
  fallback: string = ''
): string {
  if (currency !== null && currency !== undefined) {
    if (typeof currency !== 'string') return '';
    const trimmed = currency.trim().toUpperCase();
    if (!trimmed || trimmed === UNKNOWN_CURRENCY) {
      return fallback && isValidCurrencyCode(fallback) ? fallback.trim().toUpperCase() : '';
    }
    return isValidCurrencyCode(trimmed) ? trimmed : '';
  }
  return fallback && isValidCurrencyCode(fallback) ? fallback.trim().toUpperCase() : '';
}

/**
 * Resolves a transaction or import row's currency without ever silently assuming INR.
 * Permitted currency sources:
 * 1. Explicit currency code present in the transaction.
 * 2. Confirmed account-level currency default for the account alias.
 * 3. Explicit user-selected currency mapping during import.
 * 4. Otherwise, UNKNOWN currency with UNKNOWN_SOURCE provenance.
 */
export function resolveTransactionCurrency(params: {
  rawTransactionCurrency?: string | null;
  explicitCurrency?: string | null;
  accountAlias?: string | null;
  confirmedAccountCurrencies?: Record<string, string> | null;
  confirmedAccountCurrency?: string | null;
  userSelectedMappingCurrency?: string | null;
  existingProvenance?: CurrencyProvenance | null;
}): ResolvedCurrencyInfo {
  const effectiveRawCurr =
    params.rawTransactionCurrency !== undefined && params.rawTransactionCurrency !== null
      ? params.rawTransactionCurrency
      : params.explicitCurrency;
  const raw =
    effectiveRawCurr !== undefined && effectiveRawCurr !== null
      ? String(effectiveRawCurr).trim().toUpperCase()
      : '';

  if (raw && raw !== UNKNOWN_CURRENCY) {
    const provenance: CurrencyProvenance = params.existingProvenance || 'EXPLICIT_TRANSACTION';
    const decimals = getCurrencyDecimalsOrNull(raw);
    if (decimals !== null) {
      return {
        currency: raw,
        currencyProvenance: provenance,
        currencyStatus: 'SUPPORTED',
        decimals,
        isMalformedCode: false,
      };
    }
    const isPlausibleIso = /^[A-Z]{3}$/.test(raw);
    return {
      currency: raw,
      currencyProvenance: provenance,
      currencyStatus: 'UNSUPPORTED',
      decimals: null,
      isMalformedCode: !isPlausibleIso,
    };
  }

  // Source 2: Confirmed account-level default
  if (params.confirmedAccountCurrency) {
    const cleanAcctCurr = params.confirmedAccountCurrency.trim().toUpperCase();
    const decimals = getCurrencyDecimalsOrNull(cleanAcctCurr);
    if (decimals !== null) {
      return {
        currency: cleanAcctCurr,
        currencyProvenance: 'CONFIRMED_ACCOUNT_DEFAULT',
        currencyStatus: 'SUPPORTED',
        decimals,
        isMalformedCode: false,
      };
    }
  }
  if (params.accountAlias && params.confirmedAccountCurrencies) {
    const cleanAlias = params.accountAlias.trim().toUpperCase();
    for (const [acctKey, acctCurr] of Object.entries(params.confirmedAccountCurrencies)) {
      if (acctKey.trim().toUpperCase() === cleanAlias && acctCurr) {
        const cleanAcctCurr = acctCurr.trim().toUpperCase();
        const decimals = getCurrencyDecimalsOrNull(cleanAcctCurr);
        if (decimals !== null) {
          return {
            currency: cleanAcctCurr,
            currencyProvenance: 'CONFIRMED_ACCOUNT_DEFAULT',
            currencyStatus: 'SUPPORTED',
            decimals,
            isMalformedCode: false,
          };
        }
      }
    }
  }

  // Source 3: Explicit user-selected currency mapping during import
  if (params.userSelectedMappingCurrency) {
    const cleanMapCurr = params.userSelectedMappingCurrency.trim().toUpperCase();
    if (cleanMapCurr && cleanMapCurr !== UNKNOWN_CURRENCY) {
      const decimals = getCurrencyDecimalsOrNull(cleanMapCurr);
      if (decimals !== null) {
        return {
          currency: cleanMapCurr,
          currencyProvenance: 'USER_SELECTED_MAPPING',
          currencyStatus: 'SUPPORTED',
          decimals,
          isMalformedCode: false,
        };
      }
      return {
        currency: cleanMapCurr,
        currencyProvenance: 'USER_SELECTED_MAPPING',
        currencyStatus: 'UNSUPPORTED',
        decimals: null,
        isMalformedCode: !/^[A-Z]{3}$/.test(cleanMapCurr),
      };
    }
  }

  // Source 4: Unknown currency
  return {
    currency: UNKNOWN_CURRENCY,
    currencyProvenance: 'UNKNOWN_SOURCE',
    currencyStatus: 'UNKNOWN',
    decimals: null,
    isMalformedCode: false,
  };
}

export function getCurrencyDecimalsOrNull(currency?: string | null): number | null {
  if (currency === null || currency === undefined || typeof currency !== 'string') {
    return null;
  }
  const trimmed = currency.trim().toUpperCase();
  if (!trimmed || trimmed === UNKNOWN_CURRENCY || !Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCY_DECIMALS, trimmed)) {
    return null;
  }
  return SUPPORTED_CURRENCY_DECIMALS[trimmed];
}

export function getCurrencyDecimals(currency: string | null | undefined): number | null {
  return getCurrencyDecimalsOrNull(currency);
}

export function getMinorUnitMultiplier(currency: string | null | undefined): number | null {
  const decimals = getCurrencyDecimalsOrNull(currency);
  if (decimals === null) return null;
  return Math.pow(10, decimals);
}

export function getMinorUnitLabel(currency: string | null | undefined): string {
  if (isUnknownCurrency(currency)) return 'minor units (currency unknown)';
  if (!isValidCurrencyCode(currency)) return 'minor units (unsupported currency)';
  const code = currency!.trim().toUpperCase();
  if (code === 'INR') return 'paise';
  if (code === 'USD' || code === 'EUR' || code === 'AUD' || code === 'CAD' || code === 'SGD') return 'cents';
  if (code === 'GBP') return 'pence';
  if (code === 'KWD' || code === 'BHD') return 'fils';
  if (code === 'OMR') return 'baisa';
  if (SUPPORTED_CURRENCY_DECIMALS[code] === 0) return 'whole units';
  return 'minor units';
}

export function toMinorUnitsStrictResult(
  amountMajor: number | null | undefined,
  currency: string | null | undefined
): StrictMoneyConversionResult {
  if (amountMajor === null || amountMajor === undefined) {
    return {
      ok: false,
      value: null,
      error: 'MISSING_AMOUNT',
      currency: typeof currency === 'string' ? currency.trim().toUpperCase() || null : null,
    };
  }
  if (typeof amountMajor !== 'number' || Number.isNaN(amountMajor) || !Number.isFinite(amountMajor)) {
    return {
      ok: false,
      value: null,
      error: 'INVALID_AMOUNT',
      currency: typeof currency === 'string' ? currency.trim().toUpperCase() || null : null,
    };
  }
  if (currency === null || currency === undefined || typeof currency !== 'string' || currency.trim() === '') {
    return {
      ok: false,
      value: null,
      error: 'MISSING_CURRENCY',
      currency: null,
    };
  }
  const cleanCurrency = currency.trim().toUpperCase();
  if (cleanCurrency === UNKNOWN_CURRENCY) {
    return {
      ok: false,
      value: null,
      error: 'UNKNOWN_CURRENCY',
      currency: UNKNOWN_CURRENCY,
    };
  }
  const decimals = getCurrencyDecimalsOrNull(cleanCurrency);
  if (decimals === null) {
    return {
      ok: false,
      value: null,
      error: 'UNSUPPORTED_CURRENCY',
      currency: cleanCurrency,
    };
  }
  const factor = Math.pow(10, decimals);
  const exactScaled = Number((amountMajor * factor).toPrecision(12));
  const scaled = Math.round(exactScaled);
  if (Math.abs(exactScaled - scaled) > 1e-6) {
    return {
      ok: false,
      value: null,
      error: 'EXCESS_DECIMAL_PLACES',
      currency: cleanCurrency,
      decimals,
    };
  }
  if (!Number.isSafeInteger(scaled)) {
    return {
      ok: false,
      value: null,
      error: 'UNSAFE_INTEGER',
      currency: cleanCurrency,
    };
  }
  return {
    ok: true,
    value: scaled === 0 ? 0 : scaled,
    currency: cleanCurrency,
    decimals,
  };
}

/**
 * Strict nullable minor-unit converter (Production standard):
 * - Requires an explicit, supported ISO-4217 currency code.
 * - Never defaults omitted/missing currency to INR.
 * - Never converts null/undefined/NaN amount to 0.
 * - Preserves genuine zero and valid negative amounts.
 * - Enforces Number.isSafeInteger bounds and avoids IEEE-754 drift.
 */
export function toMinorUnitsStrict(
  amountMajor: number | null | undefined,
  currency: string | null | undefined
): number | null {
  const res = toMinorUnitsStrictResult(amountMajor, currency);
  return res.ok ? res.value : null;
}

export const toMinorUnitsOrNull = toMinorUnitsStrict;
export const toMinorUnits = toMinorUnitsStrict;

export function fromMinorUnitsStrictResult(
  amountMinor: number | null | undefined,
  currency: string | null | undefined
): StrictMoneyConversionResult {
  if (amountMinor === null || amountMinor === undefined) {
    return {
      ok: false,
      value: null,
      error: 'MISSING_AMOUNT',
      currency: typeof currency === 'string' ? currency.trim().toUpperCase() || null : null,
    };
  }
  if (typeof amountMinor !== 'number' || Number.isNaN(amountMinor) || !Number.isFinite(amountMinor)) {
    return {
      ok: false,
      value: null,
      error: 'INVALID_AMOUNT',
      currency: typeof currency === 'string' ? currency.trim().toUpperCase() || null : null,
    };
  }
  const roundedMinor = Math.round(amountMinor);
  if (!Number.isSafeInteger(roundedMinor) || Math.abs(amountMinor - roundedMinor) > 1e-6) {
    return {
      ok: false,
      value: null,
      error: 'UNSAFE_INTEGER',
      currency: typeof currency === 'string' ? currency.trim().toUpperCase() || null : null,
    };
  }
  if (currency === null || currency === undefined || typeof currency !== 'string' || currency.trim() === '') {
    return {
      ok: false,
      value: null,
      error: 'MISSING_CURRENCY',
      currency: null,
    };
  }
  const cleanCurrency = currency.trim().toUpperCase();
  if (cleanCurrency === UNKNOWN_CURRENCY) {
    return {
      ok: false,
      value: null,
      error: 'UNKNOWN_CURRENCY',
      currency: UNKNOWN_CURRENCY,
    };
  }
  const decimals = getCurrencyDecimalsOrNull(cleanCurrency);
  if (decimals === null) {
    return {
      ok: false,
      value: null,
      error: 'UNSUPPORTED_CURRENCY',
      currency: cleanCurrency,
    };
  }
  const factor = Math.pow(10, decimals);
  const major = Number((roundedMinor / factor).toFixed(decimals));
  return {
    ok: true,
    value: major === 0 ? 0 : major,
    currency: cleanCurrency,
    decimals,
  };
}

export function fromMinorUnitsStrict(
  amountMinor: number | null | undefined,
  currency: string | null | undefined
): number | null {
  const res = fromMinorUnitsStrictResult(amountMinor, currency);
  return res.ok ? res.value : null;
}

export const fromMinorUnitsOrNull = fromMinorUnitsStrict;
export const fromMinorUnits = fromMinorUnitsStrict;

/**
 * Formats an integer minor-unit amount without inventing precision when currency is missing or unsupported.
 */
export function formatMinorCurrency(
  amountMinor: number | null | undefined,
  currency?: string | null
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
  const roundedMinor = Math.round(amountMinor);
  if (currency === null || currency === undefined || typeof currency !== 'string') {
    return `${roundedMinor} minor units (Currency unavailable)`;
  }
  const trimmed = currency.trim().toUpperCase();
  if (!trimmed || trimmed === UNKNOWN_CURRENCY) {
    return `${roundedMinor} minor units (Currency unavailable)`;
  }
  const decimals = getCurrencyDecimalsOrNull(trimmed);
  if (decimals === null) {
    return `${roundedMinor} minor units in ${trimmed} (Unsupported currency)`;
  }
  const major = fromMinorUnitsStrict(roundedMinor, trimmed);
  if (major === null) {
    return 'Amount unavailable';
  }
  const factor = Math.pow(10, decimals);
  const locale = trimmed === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: trimmed,
    minimumFractionDigits: decimals === 0 ? 0 : Math.abs(roundedMinor) % factor === 0 ? 0 : decimals,
    maximumFractionDigits: decimals,
  }).format(major);
}

/**
 * Formats a major-unit monetary amount without ever assuming INR when currency is missing or unsupported.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency?: string | null
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
  if (currency === null || currency === undefined || typeof currency !== 'string') {
    return `${amount} (Currency unavailable)`;
  }
  const trimmed = currency.trim().toUpperCase();
  if (!trimmed || trimmed === UNKNOWN_CURRENCY) {
    return `${amount} (Currency unavailable)`;
  }
  const decimals = getCurrencyDecimalsOrNull(trimmed);
  if (decimals === null) {
    return `${amount} ${trimmed} (Unsupported currency)`;
  }
  const locale = trimmed === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: trimmed,
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Currency-aware display helpers (never default to INR when currency argument is null/undefined/UNKNOWN).
 */
export function formatMinorINR(
  amountMinor: number | null | undefined,
  currency: string | null | undefined
): string {
  return formatMinorCurrency(amountMinor, currency);
}

export function formatINR(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  return formatCurrency(amount, currency);
}

export {
  formatDateIN,
  formatDateTimeIN,
  normalizeDateString,
  getRuntimeDateISO,
  extractAsiaKolkataDateISO,
  getDynamicMonthWindow,
} from './dateUtils';
