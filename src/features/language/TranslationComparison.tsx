import React from 'react';

interface TranslationComparisonProps {
  title: string;
  englishText: string;
  localizedText: string;
  languageLabel: string;
  mode: 'LIVE_SARVAM' | 'LOCAL_FALLBACK';
  modelUsed: string;
}

export const TranslationComparison: React.FC<TranslationComparisonProps> = ({
  title,
  englishText,
  localizedText,
  languageLabel,
  mode,
  modelUsed,
}) => {
  return (
    <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="text-xs font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] font-mono text-slate-500">
          Model: {modelUsed} ·{' '}
          {mode === 'LIVE_SARVAM'
            ? 'LIVE_SARVAM (Live Sarvam API Output)'
            : 'LOCAL_FALLBACK (Verified Deterministic Bhasha Fallback)'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3.5 rounded-lg bg-teal-50/50 border border-teal-200/80 space-y-1.5">
          <div className="text-[11px] font-semibold text-teal-900">
            Selected Indian Language — {languageLabel}
          </div>
          <p className="text-sm text-slate-900 leading-relaxed font-medium">
            {localizedText}
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-600">
            Verified Source Reference — English (en-IN)
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{englishText}</p>
        </div>
      </div>
    </div>
  );
};
