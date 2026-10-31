import React, { useEffect, useState } from 'react';
import {
  BhashaAlertExplanationResponse,
  DetectionAlertRecord,
  LanguageCode,
} from '../../types/debitlens';
import { sarvamService } from '../../services/sarvamService';
import { formatINR } from '../../utils/currency';

interface MultilingualAlertProps {
  alert: DetectionAlertRecord;
  language: LanguageCode;
  onInspectCommitment?: (commitmentId: string) => void;
  onAcknowledgeAlert?: (alertId: string) => void;
}

export const MultilingualAlert: React.FC<MultilingualAlertProps> = ({
  alert,
  language,
  onInspectCommitment,
  onAcknowledgeAlert,
}) => {
  const [localized, setLocalized] = useState<BhashaAlertExplanationResponse | null>(null);

  useEffect(() => {
    let active = true;
    sarvamService
      .explainFinancialAlert(alert.id, language)
      .then((res) => {
        if (active) setLocalized(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [alert.id, language]);

  const title = localized ? localized.localizedTitle : alert.title;
  const explanation = localized ? localized.localizedExplanation : alert.description;
  const action = localized ? localized.localizedAction : alert.suggestedAction;

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
          <span
            className={
              alert.severity === 'HIGH'
                ? 'font-bold text-rose-700'
                : alert.severity === 'MEDIUM'
                ? 'font-semibold text-amber-700'
                : 'font-semibold text-teal-700'
            }
          >
            [{alert.severity}]
          </span>
          <span aria-hidden="true">·</span>
          <span>{alert.alertType.replace(/_/g, ' ')}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{alert.createdAt}</span>
          <span aria-hidden="true">·</span>
          <span>{alert.status}</span>
        </div>

        <div className="text-xs font-mono text-slate-700 tabular-nums">
          Detected: <strong>{alert.detectedValue}</strong>
          {alert.previousValue ? ` (Prior: ${alert.previousValue})` : ''}
          {alert.annualImpact ? ` · Annual Impact: ${formatINR(alert.annualImpact)}` : ''}
        </div>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="text-xs text-slate-700 leading-relaxed">{explanation}</p>
        {language !== 'en-IN' && (
          <p className="text-[11px] text-slate-500 pt-1">EN: {alert.description}</p>
        )}
      </div>

      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="font-semibold text-slate-900">Guidance: </span>
          <span>{action}</span>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            Evidence: {alert.evidenceReference}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {alert.commitmentId && onInspectCommitment && (
            <button
              type="button"
              onClick={() => onInspectCommitment(alert.commitmentId!)}
              className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
            >
              Inspect in Graph
            </button>
          )}
          {alert.status === 'OPEN' && onAcknowledgeAlert && (
            <button
              type="button"
              onClick={() => onAcknowledgeAlert(alert.id)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              Mark Reviewed
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
