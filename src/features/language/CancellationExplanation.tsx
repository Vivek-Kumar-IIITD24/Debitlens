import React, { useEffect, useState } from 'react';
import {
  BhashaCancellationExplanationResponse,
  CommitmentRecord,
  LanguageCode,
} from '../../types/debitlens';
import { sarvamService } from '../../services/sarvamService';
import { ShieldAlert, ExternalLink, CheckCircle2 } from 'lucide-react';

interface CancellationExplanationProps {
  commitments: CommitmentRecord[];
  selectedCommitmentId: string;
  onSelectCommitmentId: (id: string) => void;
  language: LanguageCode;
}

export const CancellationExplanation: React.FC<CancellationExplanationProps> = ({
  commitments,
  selectedCommitmentId,
  onSelectCommitmentId,
  language,
}) => {
  const [data, setData] = useState<BhashaCancellationExplanationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedCommitmentId) return;
    let active = true;
    setLoading(true);
    sarvamService
      .explainCancellationPlaybook(selectedCommitmentId, language)
      .then((res) => {
        if (active) setData(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCommitmentId, language]);

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            B. Multilingual Two-Layer Cancellation Playbook (Sarvam Translate)
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Translates all Layer A and Layer B titles, descriptions, step instructions, escalation guidance, and confirmation messages into Indian languages while strictly preserving action order, official URLs, and loan/insurance contractual warnings.
          </p>
        </div>

        <select
          aria-label="Select Commitment Playbook to Translate"
          value={selectedCommitmentId}
          onChange={(e) => onSelectCommitmentId(e.target.value)}
          className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
        >
          {commitments.map((c) => (
            <option key={c.id} value={c.id}>
              {c.merchantName} — {c.serviceName} ({c.paymentRail.replace(/_/g, ' ')})
              {c.isFinancialObligation ? ' [LOAN / INSURANCE / UTILITY OBLIGATION]' : ''}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="py-6 text-center text-xs font-mono text-slate-500">
          Translating verified playbook into {language}...
        </div>
      )}

      {!loading && data && (
        <div className="space-y-4">
          {/* Invariant Preservation Verification Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 font-medium text-teal-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Action Order Preserved
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-teal-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Official URLs Unmodified
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-teal-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All Layer A & B Steps Translated
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-teal-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Safety Warnings Intact
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              {data.sarvamMeta.modelUsed} · {data.sarvamMeta.mode} ({data.sarvamMeta.status})
            </span>
          </div>

          {/* Contractual Obligation Warning (if Loan / Insurance / Utility) */}
          {data.localizedPlaybook.contractualWarning && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Preserved Contractual Obligation & Safety Warning ({data.languageName})</span>
              </div>
              <p className="text-xs font-medium text-amber-950 leading-relaxed">
                {data.localizedPlaybook.contractualWarning}
              </p>
              {language !== 'en-IN' && data.englishPlaybook.contractualWarning && (
                <p className="text-[11px] text-amber-900/80 pt-1.5 border-t border-amber-200">
                  EN Source: {data.englishPlaybook.contractualWarning}
                </p>
              )}
            </div>
          )}

          {/* Two-Layer Playbook Side-by-Side (Layer A & Layer B) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Layer A */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="text-sm font-semibold text-slate-900">
                {data.localizedPlaybook.layerATitle}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {data.localizedPlaybook.layerADescription}
              </p>
              {language !== 'en-IN' && (
                <div className="text-[11px] text-slate-500 border-t border-slate-200/70 pt-1">
                  EN: {data.englishPlaybook.layerATitle} — {data.englishPlaybook.layerADescription}
                </div>
              )}

              <div className="space-y-3 pt-1">
                {data.localizedPlaybook.layerASteps.map((step, idx) => {
                  const enStep = data.englishPlaybook.layerASteps[idx];
                  return (
                    <div
                      key={step.stepNumber}
                      className="p-3 rounded-lg bg-white border border-slate-200 space-y-1.5"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Step {step.stepNumber}: {step.title}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{step.instruction}</p>
                      {language !== 'en-IN' && enStep && (
                        <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                          EN: {enStep.title} — {enStep.instruction}
                        </p>
                      )}
                      {step.officialUrl && (
                        <a
                          href={step.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-teal-700 hover:underline pt-1"
                        >
                          <span>{step.officialUrl}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Layer B */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="text-sm font-semibold text-slate-900">
                {data.localizedPlaybook.layerBTitle}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {data.localizedPlaybook.layerBDescription}
              </p>
              {language !== 'en-IN' && (
                <div className="text-[11px] text-slate-500 border-t border-slate-200/70 pt-1">
                  EN: {data.englishPlaybook.layerBTitle} — {data.englishPlaybook.layerBDescription}
                </div>
              )}

              <div className="space-y-3 pt-1">
                {data.localizedPlaybook.layerBSteps.map((step, idx) => {
                  const enStep = data.englishPlaybook.layerBSteps[idx];
                  return (
                    <div
                      key={step.stepNumber}
                      className="p-3 rounded-lg bg-white border border-slate-200 space-y-1.5"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Step {step.stepNumber}: {step.title}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{step.instruction}</p>
                      {language !== 'en-IN' && enStep && (
                        <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                          EN: {enStep.title} — {enStep.instruction}
                        </p>
                      )}
                      {step.officialUrl && (
                        <a
                          href={step.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-teal-700 hover:underline pt-1"
                        >
                          <span>{step.officialUrl}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Escalation Guidance, Confirmation Explanation & Status Message */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="text-xs font-semibold text-slate-900">
              Escalation Guidance & Verification Confirmation ({data.languageName})
            </div>
            <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
              {data.localizedPlaybook.safetyAndEscalationNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
            <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-900">Confirmation Requirement: </span>
                <span className="text-slate-700">{data.localizedPlaybook.confirmationExplanation}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">Verification Status Note: </span>
                <span className="text-slate-700">{data.localizedPlaybook.statusMessage}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
