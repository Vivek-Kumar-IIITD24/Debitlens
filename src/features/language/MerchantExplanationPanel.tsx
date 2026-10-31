import React, { useEffect, useState } from 'react';
import {
  BhashaMerchantExplanationResponse,
  LanguageCode,
  TransactionRecord,
} from '../../types/debitlens';
import { sarvamService } from '../../services/sarvamService';
import { formatINR } from '../../utils/currency';
import { TranslationComparison } from './TranslationComparison';
import { ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

interface MerchantExplanationPanelProps {
  transactions: TransactionRecord[];
  selectedTransactionId: string;
  onSelectTransactionId: (id: string) => void;
  language: LanguageCode;
}

export const MerchantExplanationPanel: React.FC<MerchantExplanationPanelProps> = ({
  transactions,
  selectedTransactionId,
  onSelectTransactionId,
  language,
}) => {
  const [explanation, setExplanation] = useState<BhashaMerchantExplanationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showEnglishSideBySide, setShowEnglishSideBySide] = useState<boolean>(true);

  useEffect(() => {
    if (!selectedTransactionId) return;
    let active = true;
    setLoading(true);
    setError(null);
    sarvamService
      .explainMerchantTransaction(selectedTransactionId, language)
      .then((res) => {
        if (active) setExplanation(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTransactionId, language]);

  return (
    <div className="space-y-5">
      <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              A. Cryptic Merchant Descriptor Explanation (Sarvam-105B + Sarvam Translate)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Select any bank statement debit below — including multi-alias merchants (<code className="font-mono text-slate-800">RAZORPAY*STREAMBOX</code>) or unresolved processor-only descriptors (<code className="font-mono text-slate-800">UPI/DR/42571190/RAZORPAY</code>) — to see grounded explanations without hallucination.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Select Transaction to Explain"
              value={selectedTransactionId}
              onChange={(e) => onSelectTransactionId(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {transactions
                .filter((t) => t.direction === 'DEBIT')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} · {t.rawDescription} · {formatINR(t.amount)} (
                    {t.merchantName || 'UNRESOLVED PROCESSOR-ONLY'})
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={() => setShowEnglishSideBySide((v) => !v)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              {showEnglishSideBySide ? 'Hide English Source' : 'Show English Comparison'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            Generating grounded explanation in {language}...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900">
            Error generating explanation: {error}
          </div>
        )}

        {!loading && explanation && (
          <div className="space-y-5">
            {/* Structured Evidence Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] text-slate-500">Original Descriptor</div>
                <div className="text-xs font-mono font-semibold text-slate-900 mt-1 break-all">
                  {explanation.rawDescriptor}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] text-slate-500">Payment Processor</div>
                <div className="text-xs font-semibold text-slate-900 mt-1">
                  {explanation.paymentProcessor || 'Direct / Unspecified'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] text-slate-500">Resolved Merchant</div>
                <div className="text-xs font-semibold text-slate-900 mt-1">
                  {explanation.resolvedMerchant || 'UNVERIFIED — Not Guessed'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] text-slate-500">Actual Service</div>
                <div className="text-xs font-semibold text-slate-900 mt-1">
                  {explanation.actualService || 'Requires Manual Review'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] text-slate-500">Evidence Status</div>
                <div className="text-xs font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                  {explanation.resolutionStatus} · {explanation.confidenceScore}%
                </div>
              </div>
            </div>

            {showEnglishSideBySide ? (
              <TranslationComparison
                title={`Sarvam Bhasha Primary Summary (${explanation.languageName})`}
                englishText={explanation.englishSource.fullSummary}
                localizedText={explanation.localizedExplanation.fullSummary}
                languageLabel={explanation.languageName}
                mode={
                  explanation.sarvamMeta.mode === 'LIVE_SARVAM' ||
                  explanation.sarvamMeta.mode === 'LIVE_SARVAM_API'
                    ? 'LIVE_SARVAM'
                    : 'LOCAL_FALLBACK'
                }
                modelUsed={`${explanation.sarvamMeta.chatModel} / ${explanation.sarvamMeta.translationModel}`}
              />
            ) : (
              <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200 space-y-1.5">
                <div className="text-xs font-semibold text-teal-900">
                  {explanation.languageName} Explanation
                </div>
                <p className="text-sm font-medium text-slate-900 leading-relaxed">
                  {explanation.localizedExplanation.fullSummary}
                </p>
              </div>
            )}

            {/* 4 Grounded Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="text-xs font-semibold text-slate-900">
                  1. Why the transaction description is confusing
                </div>
                <p className="text-xs text-slate-800 leading-relaxed">
                  {explanation.localizedExplanation.whyConfusing}
                </p>
                {showEnglishSideBySide && language !== 'en-IN' && (
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/70">
                    EN: {explanation.englishSource.whyConfusing}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <span>2. What DebitLens has verified from graph evidence</span>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed">
                  {explanation.localizedExplanation.whatIsIdentified}
                </p>
                {showEnglishSideBySide && language !== 'en-IN' && (
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/70">
                    EN: {explanation.englishSource.whatIsIdentified}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-lg bg-amber-50/40 border border-amber-200/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>3. What remains uncertain (Anti-Hallucination Guardrail)</span>
                </div>
                <p className="text-xs text-amber-950 leading-relaxed">
                  {explanation.localizedExplanation.whatRemainsUncertain}
                </p>
                {showEnglishSideBySide && language !== 'en-IN' && (
                  <p className="text-[11px] text-amber-900/75 pt-1 border-t border-amber-200/60">
                    EN: {explanation.englishSource.whatRemainsUncertain}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="text-xs font-semibold text-slate-900">
                  4. Recommended Consumer Action
                </div>
                <p className="text-xs text-slate-800 leading-relaxed">
                  {explanation.localizedExplanation.recommendedAction}
                </p>
                {showEnglishSideBySide && language !== 'en-IN' && (
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/70">
                    EN: {explanation.englishSource.recommendedAction}
                  </p>
                )}
              </div>
            </div>

            {/* Privacy Redaction Audit Inspector */}
            <div className="p-4 rounded-lg bg-slate-900 text-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-teal-300">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Privacy-by-Design Redacted Payload Sent to Sarvam AI</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  Zero Account Numbers · Zero UPI PINs · Server-Side API Key
                </span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto">
                {JSON.stringify(explanation.privacyAudit, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
