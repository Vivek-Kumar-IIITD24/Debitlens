import { TransactionRecord } from '../types/debitlens';

export interface SearchHistoryEntry {
  query: string;
  timestamp: string;
  matchCount?: number;
}

export const SEARCH_HISTORY_STORAGE_KEY = 'debitlens_txn_descriptor_search_history_v2';
export const MAX_SEARCH_HISTORY_ITEMS = 8;

export const DEFAULT_DESCRIPTOR_SEARCH_HISTORY: SearchHistoryEntry[] = [
  {
    query: 'RZP*STREAMBOX',
    timestamp: '2026-10-31T09:00:00.000Z',
  },
  {
    query: 'RAZORPAY*99812-MUM',
    timestamp: '2026-10-31T08:45:00.000Z',
  },
  {
    query: 'UPI/DR/42571190/RAZORPAY',
    timestamp: '2026-10-31T08:30:00.000Z',
  },
  {
    query: 'NACH-DR-MAXLIFE-POL99',
    timestamp: '2026-10-31T08:15:00.000Z',
  },
  {
    query: 'BBPS*BESCOM-UTIL',
    timestamp: '2026-10-31T08:00:00.000Z',
  },
];

export function normalizeSearchQuery(rawQuery: string): string {
  return rawQuery.trim().replace(/\s+/g, ' ');
}

export function addSearchHistoryEntry(
  history: SearchHistoryEntry[],
  rawQuery: string,
  matchCount?: number,
  maxEntries: number = MAX_SEARCH_HISTORY_ITEMS,
  nowIso: string = new Date().toISOString()
): SearchHistoryEntry[] {
  const normalized = normalizeSearchQuery(rawQuery);
  if (!normalized) {
    return history;
  }

  const lowerTarget = normalized.toLowerCase();
  const filtered = history.filter(
    (entry) => normalizeSearchQuery(entry.query).toLowerCase() !== lowerTarget
  );

  const nextEntry: SearchHistoryEntry = {
    query: normalized,
    timestamp: nowIso,
    ...(matchCount !== undefined ? { matchCount } : {}),
  };

  return [nextEntry, ...filtered].slice(0, Math.max(1, maxEntries));
}

export function removeSearchHistoryEntry(
  history: SearchHistoryEntry[],
  queryToRemove: string
): SearchHistoryEntry[] {
  const lowerTarget = normalizeSearchQuery(queryToRemove).toLowerCase();
  return history.filter(
    (entry) => normalizeSearchQuery(entry.query).toLowerCase() !== lowerTarget
  );
}

export function clearSearchHistory(): SearchHistoryEntry[] {
  return [];
}

export function filterTransactionsByQuery(
  transactions: TransactionRecord[],
  searchQuery: string,
  statusFilter: 'ALL' | 'CONFIRMED' | 'UNRESOLVED' = 'ALL'
): TransactionRecord[] {
  const normalized = normalizeSearchQuery(searchQuery).toLowerCase();

  return transactions.filter((t) => {
    if (statusFilter === 'CONFIRMED' && t.resolutionStatus === 'UNRESOLVED') {
      return false;
    }
    if (statusFilter === 'UNRESOLVED' && t.resolutionStatus !== 'UNRESOLVED') {
      return false;
    }
    if (normalized) {
      return (
        t.rawDescription.toLowerCase().includes(normalized) ||
        (t.merchantName || '').toLowerCase().includes(normalized) ||
        (t.processorName || '').toLowerCase().includes(normalized) ||
        t.id.toLowerCase().includes(normalized)
      );
    }
    return true;
  });
}

export function countDescriptorMatches(
  transactions: TransactionRecord[],
  query: string
): number {
  return filterTransactionsByQuery(transactions, query, 'ALL').length;
}
