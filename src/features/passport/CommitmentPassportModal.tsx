import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck,
  Building2,
  CreditCard,
  FileText,
  History,
  Scale,
  ShieldCheck,
  FolderOpen,
  Download,
  Printer,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { CommitmentPassport, EvidencePackData } from '../../types/debitlens';
import { apiClient } from '../../services/apiClient';
import { formatINR, formatDateIN } from '../../utils/currency';

interface CommitmentPassportModalProps {
  commitmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CommitmentPassportModal: React.FC<CommitmentPassportModalProps> = ({
  commitmentId,
  isOpen,
  onClose,
}) => {
  const [passport, setPassport] = useState<CommitmentPassport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingJson, setDownloadingJson] = useState(false);

  useEffect(() => {
    if (!isOpen || !commitmentId) {
      setPassport(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient
      .getCommitmentPassport(commitmentId)
      .then((data) => {
        if (isMounted) {
          setPassport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch commitment passport');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, commitmentId]);

  if (!isOpen || !commitmentId) return null;

  const handleDownloadJson = async () => {
    if (!commitmentId) return;
    try {
      setDownloadingJson(true);
      const pack = await apiClient.getEvidencePack(commitmentId);
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DebitLens_Evidence_Pack_${commitmentId}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download evidence pack JSON');
    } finally {
      setDownloadingJson(false);
    }
  };

  const handlePrintPdf = () => {
    if (!commitmentId) return;
    const printUrl = apiClient.getEvidencePackPrintUrl(commitmentId);
    window.open(printUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xs">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">
                  Commitment Passport & Evidence Record
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-indigo-100 text-indigo-800">
                  {commitmentId}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Full 7-section verified profile: Identity, Mandate, Commercial Terms, Reconciliations, and Lifecycles.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Header: 3 Distinct Quality Metrics & Export Buttons */}
        {passport && (
          <div className="px-6 py-3 bg-indigo-50/50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {/* Metric 1: Record Coverage */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500 uppercase tracking-wider">
                  Record Coverage:
                </span>
                <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{ width: `${passport.dataCoverage.coveragePercent}%` }}
                  />
                </div>
                <span className="font-bold text-indigo-700">
                  {passport.dataCoverage.coveragePercent}%
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  ({passport.dataCoverage.verifiedElementsCount}/4 elements)
                </span>
              </div>

              {/* Metric 2: Verification Quality */}
              <div className="flex items-center gap-1.5 border-l border-indigo-200 pl-3">
                <span className="font-bold text-slate-500 uppercase tracking-wider">
                  Verification:
                </span>
                <span className="px-2 py-0.5 rounded font-semibold bg-indigo-100 text-indigo-800">
                  {passport.sectionA_Identity.provenance}
                </span>
              </div>

              {/* Metric 3: Financial Reconciliation Status */}
              <div className="flex items-center gap-1.5 border-l border-indigo-200 pl-3">
                <span className="font-bold text-slate-500 uppercase tracking-wider">
                  Reconciliation:
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold ${
                    passport.sectionE_Reconciliation.reconciliationStatus === 'MATCHED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : passport.sectionE_Reconciliation.reconciliationStatus?.includes('DISCREPANCY')
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {passport.sectionE_Reconciliation.reconciliationStatus}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadJson}
                disabled={downloadingJson}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                {downloadingJson ? 'Downloading...' : 'Export JSON'}
              </button>
              <button
                onClick={handlePrintPdf}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Save as PDF
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="p-16 text-center text-slate-400">Loading Commitment Passport...</div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {passport && (
            <>
              {/* Section A: Identity & Legal Profile */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <Building2 className="w-4 h-4" />
                  Section A: Identity & Merchant Profile
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block">Merchant Name</span>
                    <span className="text-sm font-bold text-slate-800">
                      {passport.sectionA_Identity.merchantName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Legal Entity</span>
                    <span className="text-sm font-medium text-slate-700">
                      {passport.sectionA_Identity.legalEntityName || 'Legal entity not available in the records provided.'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Category</span>
                    <span className="text-sm font-medium text-slate-700">
                      {passport.sectionA_Identity.category}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Support Contact</span>
                    <span className="text-sm font-medium text-slate-700">
                      {passport.sectionA_Identity.supportContact || 'Not available in the records provided'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Grievance Officer</span>
                    <span className="text-sm font-medium text-slate-700">
                      {passport.sectionA_Identity.grievanceOfficer || 'Not available in the records provided'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Website</span>
                    {passport.sectionA_Identity.website ? (
                      <a
                        href={passport.sectionA_Identity.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        {passport.sectionA_Identity.website}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500">Not available in the records provided</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-400 block mb-1">Connected Raw Descriptors</span>
                  <div className="flex flex-wrap gap-1.5 font-mono">
                    {passport.sectionA_Identity.connectedDescriptors.map((desc, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 border border-slate-200"
                      >
                        {desc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section B: Mandate Profile */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <CreditCard className="w-4 h-4" />
                  Section B: Banking Rail & Mandate Profile
                </h3>
                {passport.sectionB_Mandate.mandatePresent ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block">Payment Rail</span>
                      <span className="text-sm font-bold text-slate-800">
                        {passport.sectionB_Mandate.rail}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Mandate Reference</span>
                      <span className="text-sm font-mono font-medium text-slate-700">
                        {passport.sectionB_Mandate.mandateReference || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Max Debit Ceiling</span>
                      <span className="text-sm font-bold text-slate-900">
                        {passport.sectionB_Mandate.maxAmount !== null
                          ? formatINR(passport.sectionB_Mandate.maxAmount)
                          : 'Ceiling not set'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Effective Mandate Status</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold mt-0.5 ${
                          passport.sectionB_Mandate.mandateStatus === 'ACTIVE_VALID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : passport.sectionB_Mandate.mandateStatus === 'EXPIRED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {passport.sectionB_Mandate.mandateStatus}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-lg text-amber-900 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>No active mandate registered in bank records for this recurring payment.</span>
                  </div>
                )}
              </div>

              {/* Section C: Commercial Terms */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <FileText className="w-4 h-4" />
                  Section C: Commercial Terms Profile
                </h3>
                {passport.sectionC_Terms.termsPresent ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block">Service Plan</span>
                      <span className="text-sm font-bold text-slate-800">
                        {passport.sectionC_Terms.serviceName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Expected Billing</span>
                      <span className="text-sm font-bold text-emerald-700">
                        {passport.sectionC_Terms.expectedAmount !== null
                          ? formatINR(passport.sectionC_Terms.expectedAmount)
                          : 'Unavailable'}{' '}
                        / {passport.sectionC_Terms.billingFrequency}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Next Renewal Date</span>
                      <span className="text-sm font-medium text-slate-700">
                        {passport.sectionC_Terms.renewalDate
                          ? formatDateIN(passport.sectionC_Terms.renewalDate)
                          : 'Not specified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Verification Status</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold mt-0.5 ${
                          passport.sectionC_Terms.userVerified
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {passport.sectionC_Terms.userVerified
                          ? 'User Confirmed'
                          : 'Pending Confirmation'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-lg text-slate-600 text-xs">
                    No commercial terms or invoice extracted for this service yet.
                  </div>
                )}
              </div>

              {/* Section D: Transaction History & Cadence */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <History className="w-4 h-4" />
                  Section D: Transaction History & Frequency
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block">Total Debits</span>
                    <span className="text-lg font-bold text-slate-900">
                      {passport.sectionD_History.totalDebitsCount} payments
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Spent to Date</span>
                    <span className="text-lg font-bold text-slate-900">
                      {formatINR(passport.sectionD_History.totalSpent)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">First Seen Debit</span>
                    <span className="text-sm font-medium text-slate-700">
                      {passport.sectionD_History.firstDebitDate
                        ? formatDateIN(passport.sectionD_History.firstDebitDate)
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Latest Debit</span>
                    <span className="text-sm font-medium text-slate-700">
                      {passport.sectionD_History.latestDebitDate
                        ? formatDateIN(passport.sectionD_History.latestDebitDate)
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section E: Three-Way Reconciliation */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <Scale className="w-4 h-4" />
                  Section E: Three-Way Reconciliation Finding
                </h3>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      passport.sectionE_Reconciliation.reconciliationStatus === 'MATCHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : passport.sectionE_Reconciliation.reconciliationStatus ===
                          'AMOUNT_DISCREPANCY'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Status: {passport.sectionE_Reconciliation.reconciliationStatus}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 block">Amount Comparison</span>
                    <span className="font-medium text-slate-800">
                      {passport.sectionE_Reconciliation.amountComparison}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Cadence Comparison</span>
                    <span className="font-medium text-slate-800">
                      {passport.sectionE_Reconciliation.cadenceComparison}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Lifecycle Alignment</span>
                    <span className="font-medium text-slate-800">
                      {passport.sectionE_Reconciliation.lifecycleComparison}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section F: Cancellation & Revocation Lifecycles */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <ShieldCheck className="w-4 h-4" />
                  Section F: Independent Cancellation Lifecycles
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">
                      Layer A: Service Subscription
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-bold ${
                        passport.sectionF_Cancellation.serviceLifecycleStatus ===
                        'CANCELLATION_CONFIRMED_BY_MERCHANT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : passport.sectionF_Cancellation.serviceLifecycleStatus ===
                            'CANCELLATION_EVIDENCE_ATTACHED'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {passport.sectionF_Cancellation.serviceLifecycleStatus}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">
                      Layer B: Banking Mandate
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-bold ${
                        passport.sectionF_Cancellation.mandateLifecycleStatus ===
                        'REVOCATION_CONFIRMED_BY_BANK'
                          ? 'bg-emerald-100 text-emerald-800'
                          : passport.sectionF_Cancellation.mandateLifecycleStatus ===
                            'REVOCATION_EVIDENCE_ATTACHED'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {passport.sectionF_Cancellation.mandateLifecycleStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section G: Evidence Inventory */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 text-indigo-700">
                  <FolderOpen className="w-4 h-4" />
                  Section G: Evidence and Source Records ({passport.sectionG_Evidence.evidenceRecordsCount})
                </h3>
                {passport.sectionG_Evidence.evidenceRecords.length === 0 ? (
                  <p className="text-xs text-slate-400">No attached evidence records found.</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {passport.sectionG_Evidence.evidenceRecords.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{rec.title}</span>
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[10px] font-bold">
                              {rec.verificationStatus}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {formatDateIN(rec.date)}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-1">{rec.description}</p>
                          {rec.sourceReference && (
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              Reference: {rec.sourceReference}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            Generated by DebitLens Financial Evidence Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Close Passport
          </button>
        </div>
      </div>
    </div>
  );
};
