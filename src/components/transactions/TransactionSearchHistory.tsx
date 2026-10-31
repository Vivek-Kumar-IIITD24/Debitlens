import React from 'react';
import { History, RotateCcw, Search, X } from 'lucide-react';
import { TransactionRecord } from '../../types/debitlens';
import {
  SearchHistoryEntry,
  countDescriptorMatches,
  normalizeSearchQuery,
} from '../../utils/searchHistory';

interface TransactionSearchHistoryProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCommitSearchQuery: (query: string) => void;
  searchHistory: SearchHistoryEntry[];
  onSelectHistoryQuery: (query: string) => void;
  onRemoveHistoryQuery: (query: string) => void;
  onClearHistory: () => void;
  onRestoreDefaultHistory: () => void;
  transactions: TransactionRecord[];
  statusFilter: 'ALL' | 'CONFIRMED' | 'UNRESOLVED';
  onStatusFilterChange: (status: 'ALL' | 'CONFIRMED' | 'UNRESOLVED') => void;
}

export const TransactionSearchHistory: React.FC<TransactionSearchHistoryProps> = ({
  searchQuery,
  onSearchQueryChange,
  onCommitSearchQuery,
  searchHistory,
  onSelectHistoryQuery,
  onRemoveHistoryQuery,
  onClearHistory,
  onRestoreDefaultHistory,
  transactions,
  statusFilter,
  onStatusFilterChange,
}) => {
  const normalizedCurrent = normalizeSearchQuery(searchQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (normalizedCurrent) {
      onCommitSearchQuery(normalizedCurrent);
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t border-slate-100">
      {/* Search Bar + Status Filter Row */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 max-w-2xl"
          role="search"
          aria-label="Raw Statement Descriptor Search"
        >
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search Transactions"
              placeholder="Search raw descriptor (e.g. RZP*STREAMBOX, RAZORPAY*99812-MUM), merchant, ID..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear active search query"
                onClick={() => onSearchQueryChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!normalizedCurrent}
            className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Save to Recent
          </button>
        </form>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto shrink-0">
          {(
            [
              { id: 'ALL', label: 'All Rows' },
              { id: 'CONFIRMED', label: 'Resolved Merchants' },
              { id: 'UNRESOLVED', label: 'Unresolved / Review Queue' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onStatusFilterChange(f.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Descriptor Search History Bar */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-slate-50/80 border border-slate-200/80 rounded-lg px-3.5 py-2.5"
        aria-label="Recent Raw Statement Descriptor Searches"
      >
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 mr-1 whitespace-nowrap shrink-0">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span>Recent Descriptor Queries:</span>
          </span>

          {searchHistory.length === 0 ? (
            <span className="text-xs text-slate-500">
              No recent descriptor queries saved. Search above or click any statement descriptor below.
            </span>
          ) : (
            searchHistory.map((entry) => {
              const isSelected =
                normalizedCurrent.toLowerCase() ===
                normalizeSearchQuery(entry.query).toLowerCase();
              const matchCount = countDescriptorMatches(transactions, entry.query);

              return (
                <div
                  key={entry.query}
                  className={`inline-flex items-center rounded-md border text-xs font-mono transition-colors ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Re-run search query ${entry.query}`}
                    onClick={() => onSelectHistoryQuery(entry.query)}
                    className="px-2.5 py-1 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>{entry.query}</span>
                    <span
                      aria-hidden="true"
                      className={isSelected ? 'text-slate-400' : 'text-slate-300'}
                    >
                      ·
                    </span>
                    <span
                      className={`tabular-nums text-[11px] ${
                        isSelected ? 'text-teal-300' : 'text-slate-500'
                      }`}
                    >
                      {matchCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.query} from search history`}
                    onClick={() => onRemoveHistoryQuery(entry.query)}
                    className={`pr-2 pl-1 py-1 rounded-r-md transition-colors ${
                      isSelected
                        ? 'text-slate-300 hover:text-white'
                        : 'text-slate-400 hover:text-rose-700'
                    }`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          {searchHistory.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs font-medium text-slate-500 hover:text-rose-700 transition-colors whitespace-nowrap"
            >
              Clear History
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestoreDefaultHistory}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-800 hover:text-teal-950 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore Demo Queries</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
