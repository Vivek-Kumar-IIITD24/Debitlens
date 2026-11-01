import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Eye,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  FileText,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ReviewQueueItem,
  ReviewQueuePriority,
  ReviewQueueStatus,
  ReviewQueueCategory,
} from '../../types/debitlens';
import { apiClient } from '../../services/apiClient';

interface ReviewAndResolveViewProps {
  onSelectCommitment?: (commitmentId: string) => void;
  onSelectTransaction?: (transactionId: string) => void;
  onNavigateSection?: (section: string) => void;
}

export const ReviewAndResolveView: React.FC<ReviewAndResolveViewProps> = ({
  onSelectCommitment,
  onSelectTransaction,
  onNavigateSection,
}) => {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE_ONLY');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  const loadQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getReviewQueue();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch review queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleUpdateStatus = async (itemId: string, status: ReviewQueueStatus) => {
    try {
      const updated = await apiClient.updateReviewQueueStatus(itemId, status);
      setItems(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item status');
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Status filter
      if (statusFilter === 'ACTIVE_ONLY') {
        if (item.status === 'RESOLVED' || item.status === 'DISMISSED') return false;
      } else if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [items, statusFilter, priorityFilter, categoryFilter]);

  const stats = useMemo(() => {
    const p0 = items.filter((i) => i.priority === 'P0' && i.status === 'OPEN').length;
    const p1 = items.filter((i) => i.priority === 'P1' && i.status === 'OPEN').length;
    const totalOpen = items.filter(
      (i) => i.status === 'OPEN' || i.status === 'IN_REVIEW' || i.status === 'WAITING_FOR_USER'
    ).length;
    return { p0, p1, totalOpen, totalAll: items.length };
  }, [items]);

  const getPriorityBadge = (priority: ReviewQueuePriority) => {
    switch (priority) {
      case 'P0':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            P0 • Critical Attention
          </span>
        );
      case 'P1':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            P1 • Action Required
          </span>
        );
      case 'P2':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
            P2 • Scheduled Review
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
            P3 • Notice
          </span>
        );
    }
  };

  const getStatusBadge = (status: ReviewQueueStatus) => {
    switch (status) {
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
            Resolved
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800">
            In Review
          </span>
        );
      case 'WAITING_FOR_USER':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">
            Awaiting Input
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-600">
            Dismissed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
            Open
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Review & Resolve Queue</h2>
              <p className="text-sm text-slate-500">
                Single unified inbox for unrecognized charges, reconciliation alerts, and mandate discrepancies.
              </p>
            </div>
          </div>
        </div>

        {/* Priority Quick Stats */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl text-center flex-1 md:flex-initial">
            <span className="text-xs text-rose-600 font-semibold block">Critical (P0)</span>
            <span className="text-xl font-bold text-rose-900">{stats.p0}</span>
          </div>
          <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center flex-1 md:flex-initial">
            <span className="text-xs text-amber-600 font-semibold block">Action Req (P1)</span>
            <span className="text-xl font-bold text-amber-900">{stats.p1}</span>
          </div>
          <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-center flex-1 md:flex-initial">
            <span className="text-xs text-slate-600 font-semibold block">Open Queue</span>
            <span className="text-xl font-bold text-slate-900">{stats.totalOpen}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={loadQueue}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </span>

          {/* Status Segmented */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter('ACTIVE_ONLY')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'ACTIVE_ONLY'
                  ? 'bg-white text-indigo-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({stats.totalOpen})
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'RESOLVED'
                  ? 'bg-white text-emerald-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({items.length})
            </button>
          </div>

          {/* Priority Dropdown */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-indigo-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="P0">P0 - Critical</option>
            <option value="P1">P1 - Action Required</option>
            <option value="P2">P2 - Scheduled</option>
            <option value="P3">P3 - Info</option>
          </select>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-indigo-500"
          >
            <option value="ALL">All Categories</option>
            <option value="POST_CANCELLATION_DEBIT">Post-Cancellation Debits</option>
            <option value="RECONCILIATION_DISCREPANCY">Reconciliation Discrepancies</option>
            <option value="UNRECOGNIZED_DEBIT">Unrecognized Debits</option>
            <option value="UNANNOUNCED_PRICE_INCREASE">Price Increases</option>
            <option value="UPCOMING_RENEWAL">Upcoming Renewals</option>
          </select>
        </div>

        <button
          onClick={loadQueue}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
        >
          Refresh Queue
        </button>
      </div>

      {/* Queue List */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          Loading review queue items...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">All clear!</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
            No items in the review queue match your current filter settings. All recurring debits,
            mandates, and statements are reconciled.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`p-5 bg-white rounded-xl border transition-all shadow-xs ${
                item.priority === 'P0'
                  ? 'border-rose-200 hover:border-rose-300 bg-rose-50/20'
                  : item.priority === 'P1'
                  ? 'border-amber-200 hover:border-amber-300'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getPriorityBadge(item.priority)}
                    {getStatusBadge(item.status)}
                    {(() => {
                      const raw = (item as any).detectedAt || item.eventDate || item.createdAt;
                      if (!raw) return null;
                      const d = new Date(raw);
                      const formatted = isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                      return (
                        <span className="text-xs text-slate-400 font-mono">
                          {formatted}
                        </span>
                      );
                    })()}
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {item.category.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  {(item as any).description && (
                    <p className="text-sm text-slate-600 leading-relaxed">{(item as any).description}</p>
                  )}

                  <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      Why it appeared:{' '}
                      <span className="font-normal text-slate-600">{item.whyItAppeared}</span>
                    </span>
                    {item.recommendedAction && (
                      <span className="font-semibold text-slate-700 block w-full sm:w-auto mt-0.5 sm:mt-0">
                        Action:{' '}
                        <span className="font-normal text-indigo-700">{item.recommendedAction}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap lg:flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {(item.commitmentId || (item as any).relatedCommitmentId) && onSelectCommitment && (
                      <button
                        onClick={() => onSelectCommitment(item.commitmentId || (item as any).relatedCommitmentId!)}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        View Commitment
                      </button>
                    )}

                    {(item.transactionId || (item as any).relatedTransactionId) && onSelectTransaction && (
                      <button
                        onClick={() => onSelectTransaction(item.transactionId || (item as any).relatedTransactionId!)}
                        className="px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Investigate Debit
                      </button>
                    )}

                    {item.status !== 'RESOLVED' ? (
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'RESOLVED')}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 transition-colors shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Resolved
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'OPEN')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
                      >
                        Reopen
                      </button>
                    )}

                    {item.status !== 'DISMISSED' && item.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'DISMISSED')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        title="Dismiss alert"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
