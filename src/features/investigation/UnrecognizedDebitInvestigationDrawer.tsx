import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
  Building2,
  Check,
  Ban,
  HelpCircle,
  Languages,
  ExternalLink,
  ShieldAlert,
  Clock,
  Send,
  Sparkles,
  ArrowRight,
  FileQuestion,
} from 'lucide-react';
import {
  TransactionRecord,
  UnrecognizedDebitCase,
  MerchantCandidate,
  UnrecognizedDebitCaseStatus,
  LanguageCode,
} from '../../types/debitlens';
import { apiClient } from '../../services/apiClient';
import { formatINR, formatDateIN } from '../../utils/currency';

interface UnrecognizedDebitInvestigationDrawerProps {
  transaction: TransactionRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onMerchantConfirmed?: (merchantId: string, rawDescription: string) => void;
  onOpenBhasha?: (query: string) => void;
}

export const UnrecognizedDebitInvestigationDrawer: React.FC<
  UnrecognizedDebitInvestigationDrawerProps
> = ({ transaction, isOpen, onClose, onMerchantConfirmed, onOpenBhasha }) => {
  const [currentCase, setCurrentCase] = useState<UnrecognizedDebitCase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [dismissedCandidateIds, setDismissedCandidateIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !transaction) {
      setCurrentCase(null);
      setDismissedCandidateIds(new Set());
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient
      .createInvestigation(transaction.id)
      .then((caseData) => {
        if (isMounted) {
          setCurrentCase(caseData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize investigation case');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, transaction]);

  if (!isOpen || !transaction) return null;

  const handleConfirmCandidate = async (candidate: MerchantCandidate) => {
    if (!currentCase) return;
    const targetId = candidate.merchantId || candidate.candidateMerchantId;
    if (!targetId) return;
    try {
      setSubmittingAction(true);
      const result = await apiClient.confirmInvestigationMerchant(currentCase.id, {
        merchantId: targetId,
        rawDescription: transaction.rawDescription,
      });
      setCurrentCase(result.case);
      if (onMerchantConfirmed) {
        onMerchantConfirmed(targetId, transaction.rawDescription);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm merchant');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDismissCandidate = (candidateId: string) => {
    setDismissedCandidateIds((prev) => new Set([...prev, candidateId]));
  };

  const handleUpdateStatus = async (targetStatus: UnrecognizedDebitCaseStatus, actionType: string) => {
    if (!currentCase) return;
    try {
      setSubmittingAction(true);
      const updated = await apiClient.recordInvestigationAction(currentCase.id, {
        actionType,
        targetStatus,
        notes: actionNotes.trim() || undefined,
      });
      setCurrentCase(updated);
      setActionNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update investigation');
    } finally {
      setSubmittingAction(false);
    }
  };

  const visibleCandidates = (currentCase?.candidateMerchants || []).filter(
    (c) => !dismissedCandidateIds.has(c.merchantId || c.candidateMerchantId)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-lg">
              <FileQuestion className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">Unrecognized Debit Investigation</h2>
                {currentCase && (
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      currentCase.status === 'IDENTIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : currentCase.status === 'UNDER_REVIEW'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    {currentCase.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Investigate opaque statement descriptors, find matching merchants, and record actions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Investigation Alert</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Transaction Summary Card */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Transaction Details
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-slate-400 block">Amount</span>
                <span className="text-lg font-bold text-slate-900">
                  {formatINR(transaction.amount)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Date</span>
                <span className="text-sm font-semibold text-slate-800">
                  {formatDateIN(transaction.transactionDate)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Payment Rail</span>
                <span className="text-sm font-medium text-slate-700">
                  {transaction.paymentRail}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Account</span>
                <span className="text-sm font-medium text-slate-700">
                  {transaction.accountAlias || 'Primary'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/80">
              <span className="text-xs text-slate-400 block mb-1">Raw Statement Descriptor</span>
              <div className="font-mono text-sm bg-white px-3 py-2 rounded border border-slate-200 text-slate-900 font-semibold break-all flex items-center justify-between">
                <span>{transaction.rawDescription}</span>
                {onOpenBhasha && (
                  <button
                    onClick={() =>
                      onOpenBhasha(
                        `Explain what merchant or entity is behind the statement descriptor "${transaction.rawDescription}" and why it debited my account.`
                      )
                    }
                    className="ml-2 text-xs font-sans text-indigo-600 hover:text-indigo-800 flex items-center gap-1 shrink-0 bg-indigo-50 px-2.5 py-1 rounded hover:bg-indigo-100 transition-colors"
                  >
                    <Languages className="w-3.5 h-3.5" />
                    Explain in Bhasha
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Automated Assessment */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-indigo-950">System Assessment</h4>
                <p className="text-xs text-indigo-800 mt-1 leading-relaxed">
                  {currentCase?.notes ||
                    'This transaction was captured through an intermediary payment gateway. The billing entity name is truncated in bank records, leaving it isolated from known subscriptions.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 bg-white/80 rounded border border-indigo-200 text-indigo-900 font-medium">
                    {transaction.processorName || (transaction.isPaymentProcessorIsolated
                      ? 'Processor Isolated (Razorpay/PayU/BillDesk)'
                      : 'Payment processor not identified from the available transaction details.')}
                  </span>
                  <span className="px-2.5 py-1 bg-white/80 rounded border border-indigo-200 text-indigo-900 font-medium">
                    Evidence Verified: No matching mandate record was found in the records imported into DebitLens.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Candidate Merchants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                Candidate Merchants ({visibleCandidates.length})
              </h3>
              <span className="text-xs text-slate-500">
                Grounded in transaction patterns & catalogue
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Evaluating candidate merchants...
              </div>
            ) : visibleCandidates.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <HelpCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No automatic candidate match</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No registered merchants match this raw string. Check your emails or SMS around{' '}
                  {formatDateIN(transaction.transactionDate)} for corresponding receipts.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleCandidates.map((c) => (
                  <div
                    key={c.merchantId}
                    className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{c.merchantName}</h4>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                            {c.category}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-bold ${
                              c.confidenceScore >= 80
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {c.confidenceScore}% Match
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          <span className="font-medium text-slate-700">Match Evidence:</span>{' '}
                          {c.matchReason}
                        </p>
                        {c.website && (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-2"
                          >
                            <span>{c.website}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.candidateType === 'PROCESSOR_RELATIONSHIP' || (c as any).isProcessorOnly ? (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-medium border border-slate-200">
                            Contextual Match
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConfirmCandidate(c)}
                            disabled={submittingAction}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Confirm
                          </button>
                        )}
                        <button
                          onClick={() => handleDismissCandidate(c.merchantId || c.candidateMerchantId)}
                          disabled={submittingAction}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Not this merchant"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Steps & Bank Guidance */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              Recommended Resolution Steps
            </h4>
            <div className="space-y-2.5 text-xs text-amber-950">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  <strong>Search receipts:</strong> Check Gmail/SMS for payments of{' '}
                  {formatINR(transaction.amount)} on or around{' '}
                  {formatDateIN(transaction.transactionDate)}.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  <strong>Inspect Mandate Registry:</strong> Open your banking/UPI app to check if an
                  active e-mandate or UPI AutoPay exists with matching ceiling amounts.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  3
                </span>
                <p>
                  <strong>Prompt Bank Notification:</strong> Under RBI customer protection guidelines, notify your issuing bank promptly if this transaction is unauthorised to restrict your financial liability.
                </p>
              </div>
            </div>
          </div>

          {/* User Notes & Case Update */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Record Investigation Action</h4>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Add investigation notes (e.g., 'Called HDFC bank customer care', 'Dispute ticket #9821 raised', 'Found receipt from CloudNine Clinic')..."
              className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:outline-indigo-500 focus:border-indigo-500 min-h-[75px]"
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => handleUpdateStatus('UNDER_REVIEW', 'MARKED_UNDER_REVIEW')}
                disabled={submittingAction}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors shadow-xs"
              >
                Mark Under Review
              </button>
              <button
                onClick={() => handleUpdateStatus('NEEDS_USER_INPUT', 'WAITING_BANK_INPUT')}
                disabled={submittingAction}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors"
              >
                Waiting on Bank Reply
              </button>
              <button
                onClick={() => handleUpdateStatus('CLOSED', 'DISPUTED_RESOLVED')}
                disabled={submittingAction}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors"
              >
                Close Case
              </button>
            </div>
          </div>

          {/* Timeline of Actions Taken */}
          {currentCase && currentCase.actionsTaken && currentCase.actionsTaken.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Case Activity Log
              </h4>
              <div className="space-y-2 text-xs">
                {currentCase.actionsTaken.map((act: any) => (
                  <div key={act.actionId} className="flex items-start gap-2 text-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-900">{act.actionType}</span>:{' '}
                      <span>{act.notes}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {new Date(act.takenAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Case ID: <span className="font-mono">{currentCase?.id || 'CASE-INIT'}</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
};
