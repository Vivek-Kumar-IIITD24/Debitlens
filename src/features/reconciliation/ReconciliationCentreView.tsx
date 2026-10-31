import React, { useState } from 'react';
import {
  Scale,
  FileText,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  PlusCircle,
  ArrowRight,
  Network,
  FolderKanban,
  Languages,
  RefreshCw,
} from 'lucide-react';
import {
  CommitmentRecord,
  MandateRecord,
  ServiceTermsRecord,
  ReconciliationFindingRecord,
  ReconciliationOutcomeStatus,
  RecurrenceFrequency,
  PaymentRailType,
} from '../../types/debitlens';
import { formatINR, formatMinorINR } from '../../utils/currency';

interface ReconciliationCentreViewProps {
  commitments: CommitmentRecord[];
  mandates: MandateRecord[];
  serviceTerms: ServiceTermsRecord[];
  findings: ReconciliationFindingRecord[];
  selectedCommitmentId: string;
  onSelectCommitment: (id: string) => void;
  onUpsertServiceDocument: (payload: {
    commitmentId: string;
    rawText?: string;
    expectedAmount?: number;
    billingFrequency?: RecurrenceFrequency;
    userVerified?: boolean;
  }) => Promise<void>;
  onImportMandate: (payload: Partial<MandateRecord>) => Promise<void>;
  onLoadStreamBoxJudgeScenario: () => Promise<void>;
  onNavigateToGraph: (commitmentId: string) => void;
  onNavigateToCasebook: (commitmentId: string) => void;
  onNavigateToCancellation: (commitmentId: string) => void;
  onNavigateToBhasha: (commitmentId: string) => void;
}

const STATUS_BADGE_STYLES: Record<
  ReconciliationOutcomeStatus,
  { bg: string; label: string }
> = {
  MATCHED: {
    bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    label: 'MATCHED (3-Way Aligned)',
  },
  AMOUNT_DISCREPANCY: {
    bg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
    label: 'AMOUNT DISCREPANCY',
  },
  FREQUENCY_DISCREPANCY: {
    bg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
    label: 'FREQUENCY DISCREPANCY',
  },
  TRANSACTION_WITHOUT_VISIBLE_MANDATE: {
    bg: 'bg-sky-950/80 text-sky-300 border-sky-700/60',
    label: 'NO VISIBLE MANDATE IN IMPORTED DATA',
  },
  MANDATE_WITHOUT_RECENT_TRANSACTION: {
    bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
    label: 'ACTIVE MANDATE · NO RECENT DEBIT',
  },
  SERVICE_TERMS_UNAVAILABLE: {
    bg: 'bg-slate-800 text-slate-300 border-slate-700',
    label: 'SERVICE TERMS UNAVAILABLE',
  },
  POSSIBLE_DUPLICATE: {
    bg: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
    label: 'POSSIBLE DUPLICATE DEBIT',
  },
  CONFLICTING_EVIDENCE: {
    bg: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
    label: 'CONFLICTING EVIDENCE (POST-CANCEL)',
  },
  UNRESOLVED: {
    bg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
    label: 'UNRESOLVED PROCESSOR / MECHANISM',
  },
};

export const ReconciliationCentreView: React.FC<ReconciliationCentreViewProps> = ({
  commitments,
  mandates,
  serviceTerms,
  findings,
  selectedCommitmentId,
  onSelectCommitment,
  onUpsertServiceDocument,
  onImportMandate,
  onLoadStreamBoxJudgeScenario,
  onNavigateToGraph,
  onNavigateToCasebook,
  onNavigateToCancellation,
  onNavigateToBhasha,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [invoiceText, setInvoiceText] = useState<string>(
    'INVOICE #SB-2026-0891 | StreamBox Media Pvt Ltd | Plan: StreamBox Ultra HD Monthly | Expected Cycle Charge: INR 499.00 (incl. GST) | Billing Cycle: Monthly on the 10th | Cancel at least 2 days before next billing date.'
  );
  const [manualExpectedAmount, setManualExpectedAmount] = useState<string>('');
  const [manualFrequency, setManualFrequency] = useState<RecurrenceFrequency>('MONTHLY');
  const [mandateRefInput, setMandateRefInput] = useState<string>('SI-HDFC-FITCLUB-7741');
  const [mandateMaxInput, setMandateMaxInput] = useState<string>('2499');
  const [mandateRailInput, setMandateRailInput] = useState<PaymentRailType>('CARD_EMANDATE');
  const [busy, setBusy] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const filteredFindings = findings.filter((f) =>
    statusFilter === 'ALL' ? true : f.status === statusFilter
  );

  const activeFinding =
    findings.find((f) => f.commitmentId === selectedCommitmentId) ||
    filteredFindings[0] ||
    findings[0] ||
    null;

  const activeCommitment =
    commitments.find((c) => c.id === activeFinding?.commitmentId) || null;
  const activeMandate =
    mandates.find(
      (m) =>
        m.commitmentId === activeFinding?.commitmentId ||
        m.id === activeFinding?.commitmentId ||
        (activeFinding?.mandateReference &&
          m.mandateReference === activeFinding.mandateReference)
    ) || null;
  const activeDoc =
    serviceTerms.find((s) => s.commitmentId === activeFinding?.commitmentId) || null;

  const matchedCount = findings.filter((f) => f.status === 'MATCHED').length;
  const discrepancyCount = findings.filter(
    (f) =>
      f.status === 'AMOUNT_DISCREPANCY' ||
      f.status === 'FREQUENCY_DISCREPANCY' ||
      f.status === 'CONFLICTING_EVIDENCE' ||
      f.status === 'POSSIBLE_DUPLICATE'
  ).length;
  const missingVisibilityCount = findings.filter(
    (f) =>
      f.status === 'TRANSACTION_WITHOUT_VISIBLE_MANDATE' ||
      f.status === 'MANDATE_WITHOUT_RECENT_TRANSACTION' ||
      f.status === 'SERVICE_TERMS_UNAVAILABLE'
  ).length;

  const handleRunJudgeDemo = async () => {
    setBusy(true);
    try {
      await onLoadStreamBoxJudgeScenario();
      onSelectCommitment('CMT-STREAMBOX');
      setBannerMsg(
        'Loaded Section 22 Judge Demo Scenario: StreamBox expected invoice ₹499.00 vs actual October debit ₹799.00 (+₹300.00 / +60.12% discrepancy) within active ₹999.00 UPI AutoPay mandate ceiling.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommitment) return;
    setBusy(true);
    try {
      await onUpsertServiceDocument({
        commitmentId: activeCommitment.id,
        rawText: invoiceText.trim() || undefined,
        expectedAmount: manualExpectedAmount ? Number(manualExpectedAmount) : undefined,
        billingFrequency: manualFrequency,
        userVerified: true,
      });
      setBannerMsg(
        `Extracted & attached service terms for ${activeCommitment.serviceName} and re-evaluated three-way reconciliation.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMandate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommitment) return;
    setBusy(true);
    try {
      await onImportMandate({
        commitmentId: activeCommitment.id,
        merchantId: activeCommitment.merchantId,
        merchantName: activeCommitment.merchantName,
        mandateReference: mandateRefInput.trim(),
        maxAmount: Number(mandateMaxInput || 999),
        paymentRail: mandateRailInput,
        frequency: activeCommitment.recurrenceType,
        mandateStatus: 'ACTIVE',
      });
      setBannerMsg(
        `Imported mandate ${mandateRefInput} (max ₹${mandateMaxInput}) for ${activeCommitment.serviceName} and updated reconciliation.`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Judge Demo Trigger */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400">
            <Scale className="w-4 h-4" />
            Three-Way Financial Reconciliation Engine (Statement × Mandate × Service Terms)
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Reconciliation & Document Intelligence Centre
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Compares actual bank/card debits against imported payment authorisations (UPI AutoPay /
            eNACH / Card SI ceilings) and documented service terms (invoices, trial notices, and
            cancellation receipts) in integer minor units (paise). Never declares an amount
            discrepancy as fraud.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRunJudgeDemo}
            disabled={busy}
            data-testid="load-streambox-judge-demo-btn"
            className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Load Judge Demo: StreamBox ₹499 vs ₹799 vs ₹999 Mandate
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-center justify-between">
          <span>{bannerMsg}</span>
          <button
            onClick={() => setBannerMsg(null)}
            className="text-emerald-400 hover:text-white ml-4 font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Total Reconciled Entities</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{findings.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Commitments, dormant mandates & isolated pools
          </div>
        </div>
        <div className="bg-slate-900/80 border border-emerald-900/50 rounded-xl p-4">
          <div className="text-xs text-emerald-400">Three-Way Matched</div>
          <div className="text-2xl font-bold font-mono text-emerald-300 mt-1">{matchedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Statement = Service Terms ≤ Mandate Limit
          </div>
        </div>
        <div className="bg-slate-900/80 border border-amber-900/50 rounded-xl p-4">
          <div className="text-xs text-amber-400">Amount / Cadence / Evidence Discrepancies</div>
          <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
            {discrepancyCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Price increases, cadence shifts & post-cancel debits
          </div>
        </div>
        <div className="bg-slate-900/80 border border-sky-900/50 rounded-xl p-4">
          <div className="text-xs text-sky-400">Visibility & Coverage Gaps</div>
          <div className="text-2xl font-bold font-mono text-sky-300 mt-1">
            {missingVisibilityCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Unimported mandates, dormant mandates, or missing docs
          </div>
        </div>
      </div>

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Findings Table */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-white">Reconciliation Findings</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter reconciliation findings by status"
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Statuses ({findings.length})</option>
              <option value="MATCHED">MATCHED</option>
              <option value="AMOUNT_DISCREPANCY">AMOUNT_DISCREPANCY</option>
              <option value="FREQUENCY_DISCREPANCY">FREQUENCY_DISCREPANCY</option>
              <option value="TRANSACTION_WITHOUT_VISIBLE_MANDATE">
                TRANSACTION_WITHOUT_VISIBLE_MANDATE
              </option>
              <option value="MANDATE_WITHOUT_RECENT_TRANSACTION">
                MANDATE_WITHOUT_RECENT_TRANSACTION
              </option>
              <option value="SERVICE_TERMS_UNAVAILABLE">SERVICE_TERMS_UNAVAILABLE</option>
              <option value="CONFLICTING_EVIDENCE">CONFLICTING_EVIDENCE</option>
              <option value="UNRESOLVED">UNRESOLVED</option>
            </select>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[640px] pr-1">
            {filteredFindings.map((f) => {
              const badge = STATUS_BADGE_STYLES[f.status] || STATUS_BADGE_STYLES.UNRESOLVED;
              const isSelected = activeFinding?.id === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => onSelectCommitment(f.commitmentId)}
                  className={`w-full text-left p-3.5 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-amber-500/70 shadow-sm'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-white">{f.serviceName}</div>
                      <div className="text-[11px] text-slate-400">{f.merchantName}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono rounded border ${badge.bg}`}
                    >
                      {f.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Expected Doc</span>
                      <span className="text-slate-200">
                        {f.expectedServiceAmountMinor !== null
                          ? formatMinorINR(f.expectedServiceAmountMinor)
                          : 'No Doc'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Actual Debit</span>
                      <span className="text-white font-semibold">
                        {f.actualTransactionAmountMinor > 0
                          ? formatMinorINR(f.actualTransactionAmountMinor)
                          : '₹0.00'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Mandate Cap</span>
                      <span className="text-slate-200">
                        {f.mandateMaxAmountMinor !== null
                          ? formatMinorINR(f.mandateMaxAmountMinor)
                          : 'Not Imported'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Three-Way Comparison Inspector + Document & Mandate Intake */}
        <div className="lg:col-span-7 space-y-5">
          {activeFinding && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-slate-400">
                    Finding ID: {activeFinding.id} · Commitment: {activeFinding.commitmentId}
                  </div>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    {activeFinding.serviceName} — {activeFinding.merchantName}
                  </h3>
                </div>
                <span
                  data-testid="active-reconciliation-status"
                  className={`px-2.5 py-1 text-xs font-mono rounded border ${
                    (STATUS_BADGE_STYLES[activeFinding.status] || STATUS_BADGE_STYLES.UNRESOLVED).bg
                  }`}
                >
                  {
                    (STATUS_BADGE_STYLES[activeFinding.status] || STATUS_BADGE_STYLES.UNRESOLVED)
                      .label
                  }
                </span>
              </div>

              {/* Three-Column Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Layer 1: Documented Service Terms */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                    <FileText className="w-3.5 h-3.5" />
                    1. Service Terms / Invoice
                  </div>
                  <div
                    data-testid="rec-expected-amount"
                    className="text-lg font-bold font-mono text-white mt-2"
                  >
                    {activeFinding.expectedServiceAmountMinor !== null
                      ? formatMinorINR(activeFinding.expectedServiceAmountMinor)
                      : 'Unavailable'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {activeFinding.expectedServiceAmountMinor !== null
                      ? `${activeFinding.expectedServiceAmountMinor} paise · ${
                          activeDoc?.billingFrequency || 'MONTHLY'
                        }`
                      : 'No invoice attached yet'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
                    Doc ID: <span className="font-mono text-slate-300">{activeFinding.serviceDocumentId || 'None'}</span>
                  </div>
                </div>

                {/* Layer 2: Actual Statement Debit */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <CreditCard className="w-3.5 h-3.5" />
                    2. Actual Statement Debit
                  </div>
                  <div
                    data-testid="rec-actual-amount"
                    className="text-lg font-bold font-mono text-white mt-2"
                  >
                    {activeFinding.actualTransactionAmountMinor > 0
                      ? formatMinorINR(activeFinding.actualTransactionAmountMinor)
                      : 'No Recent Debit'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {activeFinding.actualTransactionAmountMinor} paise
                    {activeFinding.discrepancyAmountMinor !== null &&
                      activeFinding.discrepancyAmountMinor !== 0 && (
                        <span className="text-amber-400 ml-1">
                          ({activeFinding.discrepancyAmountMinor > 0 ? '+' : ''}
                          {formatMinorINR(activeFinding.discrepancyAmountMinor)})
                        </span>
                      )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
                    Latest Txn:{' '}
                    <span className="font-mono text-slate-300">
                      {activeFinding.latestTransactionId || 'None'}
                    </span>
                  </div>
                </div>

                {/* Layer 3: Payment Authorisation Mandate */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    3. Mandate Ceiling
                  </div>
                  <div
                    data-testid="rec-mandate-max"
                    className="text-lg font-bold font-mono text-white mt-2"
                  >
                    {activeFinding.mandateMaxAmountMinor !== null
                      ? formatMinorINR(activeFinding.mandateMaxAmountMinor)
                      : 'Not Visible'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {activeFinding.mandateMaxAmountMinor !== null
                      ? `${activeFinding.mandateMaxAmountMinor} paise · Within limit: ${
                          activeFinding.withinMandateLimit ? 'YES' : 'NO'
                        }`
                      : 'No matching mandate imported'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80 truncate">
                    Ref:{' '}
                    <span className="font-mono text-slate-300">
                      {activeFinding.mandateReference || 'Not in imported records'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Explanation & Epistemic Caveat */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Evidence-Backed Reconciliation Explanation
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {activeFinding.explanation}
                </p>
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-amber-300/90 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Epistemic Honesty Guardrail:</strong> {activeFinding.epistemicCaveat}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 pt-1">
                  <strong>Recommended Action:</strong> {activeFinding.recommendedAction}
                </div>
                <div className="text-[11px] font-mono text-slate-400 pt-1">
                  Supporting Evidence IDs: {activeFinding.evidenceRecordIds.join(', ')}
                </div>
              </div>

              {/* Cross-Module Action Buttons */}
              {activeCommitment && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => onNavigateToGraph(activeCommitment.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Network className="w-3.5 h-3.5 text-emerald-400" />
                    Inspect in Neo4j Commitment Graph
                  </button>
                  <button
                    onClick={() => onNavigateToCasebook(activeCommitment.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderKanban className="w-3.5 h-3.5 text-amber-400" />
                    Open Evidence Casebook
                  </button>
                  <button
                    onClick={() => onNavigateToCancellation(activeCommitment.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-rose-400" />
                    Two-Layer Cancellation Playbook
                  </button>
                  <button
                    onClick={() => onNavigateToBhasha(activeCommitment.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Languages className="w-3.5 h-3.5 text-sky-400" />
                    Explain in Bhasha (Sarvam AI)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Service Terms / Invoice Extraction & Mandate Intake Forms */}
          {activeCommitment && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Service Terms / Document Intake */}
              <form
                onSubmit={handleSaveDoc}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Attach / Extract Service Invoice ({activeCommitment.serviceName})
                </div>
                <p className="text-[11px] text-slate-400">
                  Paste an invoice, trial confirmation, or billing receipt to extract{' '}
                  <code className="text-slate-300">expectedAmountMinor</code> and re-run three-way
                  reconciliation.
                </p>
                <textarea
                  value={invoiceText}
                  onChange={(e) => setInvoiceText(e.target.value)}
                  rows={3}
                  placeholder="Paste invoice or subscription receipt text..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Override Expected Amount (INR)
                    </label>
                    <input
                      type="number"
                      value={manualExpectedAmount}
                      onChange={(e) => setManualExpectedAmount(e.target.value)}
                      placeholder="Auto-extract from text"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Billing Frequency
                    </label>
                    <select
                      value={manualFrequency}
                      onChange={(e) => setManualFrequency(e.target.value as RecurrenceFrequency)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="QUARTERLY">QUARTERLY</option>
                      <option value="YEARLY">YEARLY</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Extract Service Terms & Re-Reconcile
                </button>
              </form>

              {/* Mandate Registry Intake */}
              <form
                onSubmit={handleSaveMandate}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  Import / Update Mandate ({activeCommitment.serviceName})
                </div>
                <p className="text-[11px] text-slate-400">
                  Import a UPI AutoPay UMN, Card SIHub reference, or eNACH mandate ceiling for{' '}
                  {activeCommitment.merchantName}.
                </p>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Mandate Reference (UMN / SIHub / NACH ID)
                  </label>
                  <input
                    type="text"
                    value={mandateRefInput}
                    onChange={(e) => setMandateRefInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Mandate Ceiling (INR)
                    </label>
                    <input
                      type="number"
                      value={mandateMaxInput}
                      onChange={(e) => setMandateMaxInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Payment Rail</label>
                    <select
                      value={mandateRailInput}
                      onChange={(e) => setMandateRailInput(e.target.value as PaymentRailType)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="UPI_AUTOPAY">UPI_AUTOPAY</option>
                      <option value="CARD_EMANDATE">CARD_EMANDATE</option>
                      <option value="ENACH_NACH">ENACH_NACH</option>
                      <option value="GOOGLE_PLAY">GOOGLE_PLAY</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Save Mandate & Re-Run Reconciliation
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
