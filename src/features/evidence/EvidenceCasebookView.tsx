import React, { useEffect, useState } from 'react';
import {
  FolderKanban,
  ShieldAlert,
  CheckCircle2,
  Clock,
  FilePlus2,
  Eye,
  Sliders,
  Check,
  X,
} from 'lucide-react';
import {
  CommitmentRecord,
  EvidenceCasebookEntry,
  AuditEventRecord,
  DataCoverageSummary,
  FinancialGuardrailConfig,
  ConfidenceScoreBreakdown,
} from '../../types/debitlens';
import { apiClient } from '../../services/apiClient';
import { formatMinorINR, toMinorUnits, fromMinorUnits } from '../../utils/currency';

interface EvidenceCasebookViewProps {
  commitments: CommitmentRecord[];
  selectedCommitmentId: string;
  onSelectCommitment: (id: string) => void;
  onConfirmCandidate: (id: string) => Promise<void>;
  onRejectCandidate: (id: string) => Promise<void>;
}

export const EvidenceCasebookView: React.FC<EvidenceCasebookViewProps> = ({
  commitments,
  selectedCommitmentId,
  onSelectCommitment,
  onConfirmCandidate,
  onRejectCandidate,
}) => {
  const [entries, setEntries] = useState<EvidenceCasebookEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [confidenceBreakdown, setConfidenceBreakdown] =
    useState<ConfidenceScoreBreakdown | null>(null);
  const [coverage, setCoverage] = useState<DataCoverageSummary | null>(null);
  const [guardrails, setGuardrails] = useState<FinancialGuardrailConfig[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] =
    useState<EvidenceCasebookEntry['category']>('SERVICE_CANCELLATION_EVENT');
  const [maxCapInr, setMaxCapInr] = useState<string>('499');
  const [reminderDays, setReminderDays] = useState<string>('3');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeCommitment =
    commitments.find((c) => c.id === selectedCommitmentId) || commitments[0] || null;

  const loadCasebookAndCoverage = async (cmtId: string) => {
    const [cb, cov, gr] = await Promise.all([
      apiClient.getCommitmentEvidenceCasebook(cmtId),
      apiClient.getDataCoverage(),
      apiClient.getGuardrails(),
    ]);
    setEntries(cb.entries);
    setAuditEvents(cb.auditEvents);
    setConfidenceBreakdown(cb.confidenceBreakdown);
    setCoverage(cov);
    setGuardrails(gr);
    const activeGr = gr.find((g) => g.commitmentId === cmtId);
    if (activeGr) {
      setMaxCapInr(String(fromMinorUnits(activeGr.maxExpectedAmountMinor)));
      setReminderDays(String(activeGr.preDebitReminderDays));
    }
  };

  useEffect(() => {
    if (activeCommitment) {
      loadCasebookAndCoverage(activeCommitment.id).catch(() => {});
    }
  }, [activeCommitment?.id, commitments]);

  const handleAttachEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommitment || !newTitle.trim() || !newRef.trim()) return;
    const res = await apiClient.attachCommitmentEvidence(activeCommitment.id, {
      category: newCategory,
      title: newTitle.trim(),
      description: newDesc.trim() || newTitle.trim(),
      sourceReference: newRef.trim(),
    });
    setEntries(res.entries);
    setAuditEvents(res.auditEvents);
    setNewTitle('');
    setNewRef('');
    setNewDesc('');
    setStatusMessage(`Attached evidence "${newTitle}" to ${activeCommitment.serviceName} Casebook.`);
  };

  const handleSaveGuardrail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommitment) return;
    const updated = await apiClient.updateGuardrail(activeCommitment.id, {
      maxExpectedAmountMinor: toMinorUnits(Number(maxCapInr || 499)),
      preDebitReminderDays: Number(reminderDays || 3),
      alertOnAnyIncrease: true,
    });
    setGuardrails((prev) =>
      prev.map((g) => (g.commitmentId === updated.commitmentId ? updated : g))
    );
    setStatusMessage(
      `Saved financial guardrail for ${activeCommitment.serviceName}: Max expected debit ₹${maxCapInr}, pre-debit alert ${reminderDays} days prior.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400">
            <FolderKanban className="w-4 h-4" />
            DebitLens Evidence Casebook, Data Coverage & Financial Guardrails
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Dispute-Ready Evidence Chain & Audit Timeline
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Every recurring candidate, confirmed commitment, service invoice, mandate reference,
            cancellation receipt, and reconciliation outcome is linked into a chronological,
            export-ready audit trail.
          </p>
        </div>

        {/* Commitment Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Commitment:</label>
          <select
            value={activeCommitment?.id || ''}
            onChange={(e) => onSelectCommitment(e.target.value)}
            aria-label="Select commitment for Evidence Casebook"
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-medium"
          >
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.serviceName} ({c.entityClass === 'RECURRING_CANDIDATE' ? 'CANDIDATE' : 'CONFIRMED'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-emerald-400 hover:text-white font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Candidate vs Confirmed Lifecycle Banner */}
      {activeCommitment && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white">{activeCommitment.serviceName}</span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                  activeCommitment.entityClass === 'RECURRING_CANDIDATE'
                    ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                }`}
              >
                {activeCommitment.entityClass} · {activeCommitment.verificationStatus}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
                Layer A Service: {activeCommitment.serviceLifecycleStatus}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
                Layer B Mandate: {activeCommitment.mandateLifecycleStatus}
              </span>
            </div>
            {confidenceBreakdown && (
              <p className="text-xs text-slate-400 font-mono">{confidenceBreakdown.explanation}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeCommitment.verificationStatus !== 'USER_CONFIRMED' && (
              <button
                onClick={() => onConfirmCandidate(activeCommitment.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm as FinancialCommitment
              </button>
            )}
            {activeCommitment.verificationStatus !== 'REJECTED' && (
              <button
                onClick={() => onRejectCandidate(activeCommitment.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Reject Candidate
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Chronological Casebook + Right Sidebar (Attach Evidence, Guardrails, Coverage) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Chronological Evidence Chain & Audit Log */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Chronological Evidence Chain ({entries.length} Verified Records)
            </h3>
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{entry.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-amber-300">
                        {entry.category}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {entry.timestamp.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{entry.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/70 text-[11px] font-mono text-slate-400">
                    <span>Ref: {entry.sourceReference}</span>
                    <span>
                      {entry.amountMinor !== null ? `${formatMinorINR(entry.amountMinor)} · ` : ''}
                      Status: {entry.verificationStatus} · Actor: {entry.actor}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-sky-400" />
              Commitment Audit Event Log ({auditEvents.length} Events)
            </h3>
            {auditEvents.length === 0 ? (
              <p className="text-xs text-slate-400">
                No manual state transitions recorded yet for this commitment. Confirm a candidate,
                attach an invoice, or update cancellation lifecycle status to log audit events.
              </p>
            ) : (
              <div className="space-y-2">
                {auditEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs flex items-start justify-between gap-3"
                  >
                    <div>
                      <span className="font-mono text-[10px] text-sky-400 mr-2">
                        [{evt.actionType}]
                      </span>
                      <span className="text-slate-200">{evt.summary}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {evt.timestamp.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Attach Evidence + Financial Guardrails + Data Coverage */}
        <div className="lg:col-span-5 space-y-5">
          {/* Attach New Evidence Record */}
          <form
            onSubmit={handleAttachEvidence}
            className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <FilePlus2 className="w-4 h-4 text-emerald-400" />
              Attach New Casebook Evidence
            </h3>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Evidence Category</label>
              <select
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as EvidenceCasebookEntry['category'])
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="SERVICE_CANCELLATION_EVENT">SERVICE_CANCELLATION_EVENT</option>
                <option value="MANDATE_REVOCATION_EVENT">MANDATE_REVOCATION_EVENT</option>
                <option value="SERVICE_TERMS_DOCUMENT">SERVICE_TERMS_DOCUMENT</option>
                <option value="MANDATE_RECORD">MANDATE_RECORD</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Merchant Email Receipt"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Reference ID</label>
                <input
                  type="text"
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  placeholder="e.g. TKT-2026-9912"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Evidence Notes</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Timestamped confirmation details..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              Add to Dispute Casebook
            </button>
          </form>

          {/* Financial Guardrails */}
          <form
            onSubmit={handleSaveGuardrail}
            className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-amber-400" />
              Financial Guardrails ({activeCommitment?.serviceName})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Max Expected Debit Threshold (INR)
                </label>
                <input
                  type="number"
                  value={maxCapInr}
                  onChange={(e) => setMaxCapInr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Pre-Debit Reminder Window (Days)
                </label>
                <input
                  type="number"
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              Save Guardrail Threshold
            </button>
          </form>

          {/* Data Coverage & Visibility Blind Spots */}
          {coverage && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-sky-400" />
                Data Coverage & Epistemic Visibility Scope
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Statement Window</span>
                  <span className="text-white">
                    {coverage.earliestTransactionDate} → {coverage.latestTransactionDate}
                  </span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">3-Way Full Coverage</span>
                  <span className="text-emerald-300">
                    {coverage.commitmentsWithFullThreeWayCoverage} / {commitments.length} commitments
                  </span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Imported Mandates</span>
                  <span className="text-white">{coverage.importedMandatesCount} records</span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Service Documents</span>
                  <span className="text-white">{coverage.importedServiceDocumentsCount} docs</span>
                </div>
              </div>
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Declared Visibility Blind Spots:
                </div>
                {coverage.blindSpots.map((spot, i) => (
                  <p key={i} className="text-[11px] text-slate-400 leading-relaxed">
                    • {spot}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
