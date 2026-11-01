/**
 * Safe, deterministic date formatting and normalisation utilities for DebitLens.
 * Strictly guarantees that 'Invalid Date' or 'NaN' is NEVER presented to the consumer.
 */

export function normalizeDateString(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (!str) return null;

  // Check for ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Check for DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2Str = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    const p2 = parseInt(p2Str, 10);

    // If p2 is year (4 digits)
    if (p2 >= 1970 && p2 <= 2100) {
      // If p0 > 12 -> DD/MM/YYYY
      if (p0 > 12 && p0 <= 31 && p1 >= 1 && p1 <= 12) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
      // If p1 > 12 -> MM/DD/YYYY
      if (p1 > 12 && p1 <= 31 && p0 >= 1 && p0 <= 12) {
        return `${p2}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
      // Default Indian banking convention: DD/MM/YYYY
      if (p0 >= 1 && p0 <= 31 && p1 >= 1 && p1 <= 12) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
    }
  }

  const ms = Date.parse(str);
  if (!isNaN(ms)) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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
