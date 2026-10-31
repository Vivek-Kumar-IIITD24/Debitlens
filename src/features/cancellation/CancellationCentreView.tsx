import React, { useState } from 'react';
import {
  CancellationPlaybookRecord,
  CancellationSessionRecord,
  CommitmentRecord,
  LanguageCode,
  ServiceLifecycleStatus,
  MandateLifecycleStatus,
} from '../../types/debitlens';
import { formatINR } from '../../utils/currency';
import { CancellationExplanation } from '../language/CancellationExplanation';
import {
  ShieldAlert,
  CheckSquare,
  Square,
  ExternalLink,
  FileCheck2,
  AlertOctagon,
} from 'lucide-react';

interface CancellationCentreViewProps {
  commitments: CommitmentRecord[];
  playbooks: CancellationPlaybookRecord[];
  sessions: CancellationSessionRecord[];
  selectedCommitmentId: string;
  onSelectCommitmentId: (id: string) => void;
  language: LanguageCode;
  onToggleStep: (sessionId: string, stepId: string, completed: boolean) => Promise<void>;
  onAddEvidence: (
    sessionId: string,
    payload: {
      evidenceType: 'SERVICE_CONFIRMATION' | 'MANDATE_REVOCATION' | 'SUPPORT_TICKET' | 'MERCHANT_UNRESPONSIVE';
      description: string;
      referenceNumber: string;
      evidenceDate: string;
    }
  ) => Promise<void>;
  onSimulatePostCancelDebit: (commitmentId: string) => Promise<void>;
  onUpdateServiceStatus?: (
    commitmentId: string,
    status: ServiceLifecycleStatus
  ) => Promise<void>;
  onUpdateMandateStatus?: (
    commitmentId: string,
    status: MandateLifecycleStatus
  ) => Promise<void>;
}

export const CancellationCentreView: React.FC<CancellationCentreViewProps> = ({
  commitments,
  playbooks,
  sessions,
  selectedCommitmentId,
  onSelectCommitmentId,
  language,
  onToggleStep,
  onAddEvidence,
  onSimulatePostCancelDebit,
  onUpdateServiceStatus,
  onUpdateMandateStatus,
}) => {
  const [evidenceType, setEvidenceType] = useState<
    'SERVICE_CONFIRMATION' | 'MANDATE_REVOCATION' | 'SUPPORT_TICKET' | 'MERCHANT_UNRESPONSIVE'
  >('SERVICE_CONFIRMATION');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceDate, setEvidenceDate] = useState('2026-10-30');
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeCommitment =
    commitments.find((c) => c.id === selectedCommitmentId) || commitments[0];
  const activePlaybook = playbooks.find((p) => p.commitmentId === activeCommitment?.id);
  const activeSession = sessions.find((s) => s.commitmentId === activeCommitment?.id);

  if (!activeCommitment || !activePlaybook || !activeSession) {
    return null;
  }

  const layerASteps = activeSession.steps.filter((s) => s.layer === 'LAYER_A_SERVICE');
  const layerBSteps = activeSession.steps.filter((s) => s.layer === 'LAYER_B_MANDATE');

  const handleSaveEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceNumber.trim() || !description.trim()) {
      setFormError('Please enter both a confirmation reference number and evidence description.');
      return;
    }
    setFormError(null);
    await onAddEvidence(activeSession.id, {
      evidenceType,
      referenceNumber: referenceNumber.trim(),
      description: description.trim(),
      evidenceDate,
    });
    setReferenceNumber('');
    setDescription('');
    setStatusMessage('Cancellation evidence logged and linked to Neo4j CancellationSession node.');
  };

  return (
    <div className="space-y-6">
      {/* Top Selector & State Machine Summary */}
      <div className="border border-slate-200 bg-white rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Two-Layer Cancellation Assistant & Post-Cancellation Verification
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Separates Layer A (Merchant Service Cancellation) from Layer B (Payment Mandate Revocation) and tracks user-reported confirmation references against subsequent bank debits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Select Commitment for Cancellation"
            value={activeCommitment.id}
            onChange={(e) => {
              onSelectCommitmentId(e.target.value);
              setStatusMessage(null);
              setFormError(null);
            }}
            className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.merchantName} — {c.serviceName} ({formatINR(c.latestAmount)} · {c.cancellationState.replace(/_/g, ' ')})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={async () => {
              await onSimulatePostCancelDebit(activeCommitment.id);
              setStatusMessage(
                `Simulated subsequent post-cancellation debit for ${activeCommitment.serviceName} on 2026-10-29! Check the Post-Cancellation Alert below.`
              );
            }}
            className="px-3.5 py-2 text-xs font-medium text-rose-900 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors whitespace-nowrap"
          >
            Simulate Post-Cancellation Debit
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs font-medium text-teal-900">
          {statusMessage}
        </div>
      )}

      {/* Contractual Obligation Warning (Loan EMI / Insurance / Utility) */}
      {activePlaybook.contractualWarning && (
        <div className="p-5 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
            <span>Contractual Obligation Safety Warning (Loan EMI / Insurance / Essential Utility)</span>
          </div>
          <p className="text-xs text-amber-950 leading-relaxed">
            {activePlaybook.contractualWarning}
          </p>
        </div>
      )}

      {/* Post-Cancellation Alert Banner if detected */}
      {activeSession.postCancellationTransactionIds.length > 0 && (
        <div className="p-5 rounded-xl bg-rose-50 border border-rose-300 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-950">
            <AlertOctagon className="w-5 h-5 text-rose-700 shrink-0" />
            <span>
              Post-Cancellation Subsequent Debit Detected ({activeSession.postCancellationTransactionIds.join(', ')})
            </span>
          </div>
          <p className="text-xs text-rose-900 leading-relaxed">
            A debit occurred AFTER your recorded cancellation date ({activeSession.serviceCancelledAt}). DebitLens flags this as a "Possible post-cancellation charge — review" rather than automatically declaring fraud, because trailing billing cycles can occur. Use your saved confirmation reference ({activeSession.evidence[0]?.referenceNumber || 'logged below'}) to dispute the debit with your bank or payment provider.
          </p>
        </div>
      )}

      {/* Workflow State Machine Status Strip with Independent Layer A & Layer B Lifecycle Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="text-xs text-slate-500">Current State Machine Status</div>
          <div className="text-sm font-mono font-bold text-slate-900 mt-1">
            {activeSession.status}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Honest Status: User-Reported vs Evidence Attached
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
          <div className="text-xs text-slate-500">Layer A (Service Lifecycle)</div>
          <select
            aria-label="Update Layer A Service Lifecycle Status"
            value={activeCommitment.serviceLifecycleStatus}
            onChange={async (e) => {
              if (onUpdateServiceStatus) {
                await onUpdateServiceStatus(
                  activeCommitment.id,
                  e.target.value as ServiceLifecycleStatus
                );
                setStatusMessage(
                  `Updated Layer A Service Lifecycle Status to ${e.target.value}.`
                );
              }
            }}
            className="w-full px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="CANCELLATION_REQUESTED">CANCELLATION_REQUESTED</option>
            <option value="CANCELLATION_REPORTED_BY_USER">CANCELLATION_REPORTED_BY_USER</option>
            <option value="CANCELLATION_EVIDENCE_ATTACHED">CANCELLATION_EVIDENCE_ATTACHED</option>
            <option value="MERCHANT_UNRESPONSIVE">MERCHANT_UNRESPONSIVE</option>
          </select>
          <div className="text-[11px] text-slate-500">
            Merchant: {activeCommitment.merchantName}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
          <div className="text-xs text-slate-500">Layer B (Mandate Lifecycle)</div>
          <select
            aria-label="Update Layer B Mandate Lifecycle Status"
            value={activeCommitment.mandateLifecycleStatus}
            onChange={async (e) => {
              if (onUpdateMandateStatus) {
                await onUpdateMandateStatus(
                  activeCommitment.id,
                  e.target.value as MandateLifecycleStatus
                );
                setStatusMessage(
                  `Updated Layer B Mandate Lifecycle Status to ${e.target.value}.`
                );
              }
            }}
            className="w-full px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="PAUSED_REPORTED_BY_USER">PAUSED_REPORTED_BY_USER</option>
            <option value="REVOCATION_REPORTED_BY_USER">REVOCATION_REPORTED_BY_USER</option>
            <option value="REVOCATION_EVIDENCE_ATTACHED">REVOCATION_EVIDENCE_ATTACHED</option>
            <option value="MANDATE_NOT_VISIBLE_IN_IMPORTED_DATA">
              MANDATE_NOT_VISIBLE_IN_IMPORTED_DATA
            </option>
          </select>
          <div className="text-[11px] text-slate-500">
            Rail: {activeCommitment.paymentRail.replace(/_/g, ' ')}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="text-xs text-slate-500">Annual Savings Impact</div>
          <div className="text-sm font-mono font-bold text-teal-800 mt-1 tabular-nums">
            {activeCommitment.isFinancialObligation
              ? 'Contractual Obligation'
              : `${formatINR(activeCommitment.annualisedAmount)}/yr`}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Last verified: {activePlaybook.lastVerifiedDate}
          </div>
        </div>
      </div>

      {/* Interactive Two-Layer Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Layer A Checklist */}
        <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-mono text-teal-800 font-semibold">
              LAYER A — END THE UNDERLYING SERVICE RELATIONSHIP
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              1. Cancel Service with {activePlaybook.merchantName}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {activePlaybook.serviceCancellationSummary}
            </p>
          </div>

          <div className="space-y-3">
            {layerASteps.map((step) => (
              <div
                key={step.id}
                className={`p-3.5 rounded-lg border transition-colors ${
                  step.completed
                    ? 'bg-teal-50/40 border-teal-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={`Mark Step ${step.stepNumber} Complete`}
                    onClick={() => onToggleStep(activeSession.id, step.id, !step.completed)}
                    className="mt-0.5 text-teal-700 hover:text-teal-900 shrink-0"
                  >
                    {step.completed ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Step {step.stepNumber}: {step.title}
                      </span>
                      {step.completedAt && (
                        <span className="text-[11px] font-mono text-teal-800 tabular-nums whitespace-nowrap shrink-0">
                          Completed {step.completedAt}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.instruction}</p>
                    {step.officialUrl && (
                      <a
                        href={step.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-teal-700 hover:underline pt-1"
                      >
                        <span>Official Merchant Route: {step.officialUrl}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Layer B Checklist */}
        <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-mono text-sky-800 font-semibold">
              LAYER B — STOP THE PAYMENT AUTHORISATION
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              2. Revoke {activePlaybook.paymentRail.replace(/_/g, ' ')} Mandate
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {activePlaybook.mandateRevocationSummary}
            </p>
          </div>

          <div className="space-y-3">
            {layerBSteps.map((step) => (
              <div
                key={step.id}
                className={`p-3.5 rounded-lg border transition-colors ${
                  step.completed
                    ? 'bg-teal-50/40 border-teal-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={`Mark Step ${step.stepNumber} Complete`}
                    onClick={() => onToggleStep(activeSession.id, step.id, !step.completed)}
                    className="mt-0.5 text-teal-700 hover:text-teal-900 shrink-0"
                  >
                    {step.completed ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Step {step.stepNumber}: {step.title}
                      </span>
                      {step.completedAt && (
                        <span className="text-[11px] font-mono text-teal-800 tabular-nums">
                          Completed {step.completedAt}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.instruction}</p>
                    {step.officialUrl && (
                      <a
                        href={step.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-teal-700 hover:underline pt-1"
                      >
                        <span>Official Provider Guide: {step.officialUrl}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Evidence Logger & Saved Evidence Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveEvidence}
          className="border border-slate-200 bg-white rounded-xl p-5 space-y-4"
        >
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-base font-semibold text-slate-900">
              Record Cancellation Confirmation & Evidence
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Log your merchant cancellation ticket or UPI/SIHub revocation reference for post-cancellation monitoring.
            </p>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="evid-type" className="block text-xs font-medium text-slate-700 mb-1">
                Evidence Type
              </label>
              <select
                id="evid-type"
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as typeof evidenceType)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="SERVICE_CONFIRMATION">Layer A — Service Confirmation</option>
                <option value="MANDATE_REVOCATION">Layer B — Mandate Revocation</option>
                <option value="SUPPORT_TICKET">Support Grievance Ticket</option>
                <option value="MERCHANT_UNRESPONSIVE">Merchant Unresponsive — Escalated</option>
              </select>
            </div>

            <div>
              <label htmlFor="evid-date" className="block text-xs font-medium text-slate-700 mb-1">
                Completion Date
              </label>
              <input
                id="evid-date"
                type="date"
                value={evidenceDate}
                onChange={(e) => setEvidenceDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="evid-ref" className="block text-xs font-medium text-slate-700 mb-1">
              Confirmation / Reference Number
            </label>
            <input
              id="evid-ref"
              type="text"
              placeholder="e.g. UMN-REV-884120 or TKT-2026-991"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="evid-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Verification Note
            </label>
            <input
              id="evid-desc"
              type="text"
              placeholder="e.g. Cancelled subscription in account portal and revoked Google Pay AutoPay"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Save Cancellation Evidence
          </button>
        </form>

        <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h4 className="text-base font-semibold text-slate-900">
                Audit Trail & Escalation Playbook
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Saved evidence nodes (`:CancellationEvidence`) for {activeCommitment.serviceName}
              </p>
            </div>
            <FileCheck2 className="w-4 h-4 text-teal-700" />
          </div>

          {activeSession.evidence.length === 0 ? (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-500">
              No confirmation references recorded yet for {activeCommitment.serviceName}. Complete the checklist or log a reference number on the left.
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeSession.evidence.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between font-mono text-slate-700">
                    <span className="font-semibold text-slate-900">{ev.referenceNumber}</span>
                    <span>
                      {ev.evidenceType.replace(/_/g, ' ')} · {ev.evidenceDate}
                    </span>
                  </div>
                  <p className="text-slate-600">{ev.description}</p>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 space-y-1.5">
            <div className="text-xs font-semibold text-slate-900">
              Escalation When Cancellation Is Not Acknowledged
            </div>
            <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
              {activePlaybook.escalationGuidance.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Sarvam Bhasha Multilingual Playbook Translator */}
      <CancellationExplanation
        commitments={commitments}
        selectedCommitmentId={activeCommitment.id}
        onSelectCommitmentId={onSelectCommitmentId}
        language={language}
      />
    </div>
  );
};
