/**
 * Safe, deterministic date formatting and normalisation utilities for DebitLens.
 * Strictly guarantees that 'Invalid Date' or 'NaN' is NEVER presented to the consumer,
 * and enforces explicit Asia/Kolkata (IST) calendar extraction and timestamp formatting.
 */

export const APPLICATION_TIMEZONE = 'Asia/Kolkata' as const;

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function isStrictValidIsoDate(d: string | null | undefined): d is string {
  if (typeof d !== 'string') return false;
  const trimmed = d.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  return isValidCalendarDate(year, month, day);
}

/**
 * Extracts the YYYY-MM-DD calendar date in Asia/Kolkata (IST, UTC+05:30)
 * from a Date or epoch timestamp, avoiding UTC calendar drift around midnight.
 */
export function extractAsiaKolkataDateISO(instant: Date | number = new Date()): string {
  const dt = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(dt.getTime())) {
    return extractAsiaKolkataDateISO(new Date());
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APPLICATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function getRuntimeDateISO(
  overrideDate?: string | null,
  referenceInstant?: Date | number
): string {
  if (overrideDate && isStrictValidIsoDate(overrideDate)) {
    return overrideDate.trim();
  }
  if (referenceInstant !== undefined) {
    return extractAsiaKolkataDateISO(referenceInstant);
  }
  return extractAsiaKolkataDateISO(new Date());
}

/**
 * Computes a dynamic chronological window of YYYY-MM month strings ending at the
 * calendar month of `referenceDateISO` (defaulting to current Asia/Kolkata date).
 * Never includes future months beyond `referenceDateISO`.
 */
export function getDynamicMonthWindow(
  referenceDateISO?: string | null,
  monthCount: number = 6
): string[] {
  const safeCount = Math.max(1, Math.min(24, Math.floor(monthCount || 6)));
  const resolvedDate = getRuntimeDateISO(referenceDateISO);
  const [yStr, mStr] = resolvedDate.split('-');
  const endYear = parseInt(yStr, 10);
  const endMonth = parseInt(mStr, 10); // 1..12

  const months: string[] = [];
  for (let offset = safeCount - 1; offset >= 0; offset--) {
    const totalMonths = endYear * 12 + (endMonth - 1) - offset;
    const yr = Math.floor(totalMonths / 12);
    const mo = (totalMonths % 12) + 1;
    months.push(`${yr}-${String(mo).padStart(2, '0')}`);
  }
  return months;
}

export function normalizeDateString(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (!str) return null;

  // Check for strict ISO YYYY-MM-DD (or ISO timestamp prefix)
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  // Check for DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
  const slashOrDash = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (slashOrDash) {
    const p0 = parseInt(slashOrDash[1], 10);
    const p1 = parseInt(slashOrDash[2], 10);
    const p2Str = slashOrDash[3].length === 2 ? `20${slashOrDash[3]}` : slashOrDash[3];
    const p2 = parseInt(p2Str, 10);

    if (p2 >= 1970 && p2 <= 2100) {
      // If p0 > 12 -> DD/MM/YYYY
      if (p0 > 12 && p0 <= 31 && p1 >= 1 && p1 <= 12) {
        if (isValidCalendarDate(p2, p1, p0)) {
          return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
        }
        return null;
      }
      // If p1 > 12 -> MM/DD/YYYY
      if (p1 > 12 && p1 <= 31 && p0 >= 1 && p0 <= 12) {
        if (isValidCalendarDate(p2, p0, p1)) {
          return `${p2}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
        }
        return null;
      }
      // Default Indian banking convention: DD/MM/YYYY
      if (p0 >= 1 && p0 <= 31 && p1 >= 1 && p1 <= 12) {
        if (isValidCalendarDate(p2, p1, p0)) {
          return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
        }
        return null;
      }
    }
    return null;
  }

  // Named month format e.g. "15 Oct 2026" or "15-Oct-2026"
  const namedMonthMatch = str.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{4})$/);
  if (namedMonthMatch) {
    const d = parseInt(namedMonthMatch[1], 10);
    const monStr = namedMonthMatch[2].toLowerCase().slice(0, 3);
    const y = parseInt(namedMonthMatch[3], 10);
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const m = months[monStr];
    if (m && isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  return null;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatDateIN(input: unknown, fallback: string = 'Date Unavailable'): string {
  if (input === null || input === undefined) return fallback;
  const iso = normalizeDateString(input);
  if (!iso) return fallback;

  const [yStr, mStr, dStr] = iso.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);

  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    return fallback;
  }

  const monthName = MONTH_NAMES[m - 1];
  return `${d} ${monthName} ${y}`;
}

/**
 * Formats an instant or ISO timestamp explicitly in Asia/Kolkata (IST, UTC+05:30).
 * If given a date-only YYYY-MM-DD string, preserves the exact calendar date without shifting.
 */
export function formatDateTimeIN(input: unknown, fallback: string = 'Time Unavailable'): string {
  if (input === null || input === undefined) return fallback;
  const str = String(input).trim();
  if (!str) return fallback;

  if (isStrictValidIsoDate(str)) {
    return `${formatDateIN(str, fallback)}, 00:00 IST`;
  }

  const ms = Date.parse(str);
  if (isNaN(ms)) return fallback;

  const date = new Date(ms);
  if (isNaN(date.getTime())) return fallback;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APPLICATION_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const day = parts.find((p) => p.type === 'day')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';

  if (!day || !month || !year) return fallback;
  return `${parseInt(day, 10)} ${month} ${year}, ${hour}:${minute} IST`;
}
