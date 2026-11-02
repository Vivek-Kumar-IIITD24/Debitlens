/**
 * Safe, deterministic date formatting and normalisation utilities for DebitLens.
 * Strictly guarantees that 'Invalid Date' or 'NaN' is NEVER presented to the consumer.
 */

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

export function getRuntimeDateISO(overrideDate?: string): string {
  if (overrideDate && isStrictValidIsoDate(overrideDate)) {
    return overrideDate.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDateString(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (!str) return null;

  // Check for ISO YYYY-MM-DD (or ISO timestamp prefix)
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

export function formatDateTimeIN(input: unknown, fallback: string = 'Time Unavailable'): string {
  if (input === null || input === undefined) return fallback;
  const str = String(input).trim();
  if (!str) return fallback;

  const ms = Date.parse(str);
  if (isNaN(ms)) return fallback;

  const date = new Date(ms);
  if (isNaN(date.getTime())) return fallback;

  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} IST`;
}
