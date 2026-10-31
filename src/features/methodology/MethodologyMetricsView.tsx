import React from 'react';
import { DetectionMetricsData } from '../../services/apiClient';
import { CheckCircle2, Scale, ShieldCheck } from 'lucide-react';

interface MethodologyMetricsViewProps {
  metrics: DetectionMetricsData | null;
}

export const MethodologyMetricsView: React.FC<MethodologyMetricsViewProps> = ({ metrics }) => {
  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white rounded-xl p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          Detection Methodology, Confidence Scoring & Ground-Truth Benchmark
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Evaluated live against `data/ground-truth.json` (45 synthetic transactions, 10 recurring commitments, 3 unresolved processor-only debits, 2 one-time retail debits, and 1 credit refund).
        </p>
      </div>

      {metrics && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Recurring Recall</div>
              <div className="text-xl font-mono font-bold text-teal-800 mt-1 tabular-nums">
                {metrics.recallPercent}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                TP: {metrics.truePositives} / {metrics.labelledRecurringCommitments}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Detection Precision</div>
              <div className="text-xl font-mono font-bold text-teal-800 mt-1 tabular-nums">
                {metrics.precisionPercent}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                FP: {metrics.falsePositives} · FN: {metrics.falseNegatives}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">F1 Score</div>
              <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
                {metrics.f1ScorePercent}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Harmonic mean</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Merchant Match Accuracy</div>
              <div className="text-xl font-mono font-bold text-teal-800 mt-1 tabular-nums">
                {metrics.merchantResolutionAccuracyPercent}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">On verified aliases</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Resolver Coverage</div>
              <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
                {metrics.merchantResolutionCoveragePercent}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Excludes unknown debits</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Unmerged Processor Rows</div>
              <div className="text-xl font-mono font-bold text-amber-700 mt-1 tabular-nums">
                {metrics.unresolvedProcessorIsolatedCount} isolated
              </div>
              <div className="text-[11px] text-slate-500 mt-1">0 false merges</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CheckCircle2 className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Measured Performance by Test Scenario Category
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 font-semibold">Scenario Category</th>
                      <th className="py-2 font-semibold text-right">Expected</th>
                      <th className="py-2 font-semibold text-right">Detected</th>
                      <th className="py-2 font-semibold text-right">Measured Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {metrics.categoryBreakdown.map((row) => (
                      <tr key={row.category}>
                        <td className="py-2.5 font-sans text-slate-900 font-medium">
                          {row.category}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">{row.expected}</td>
                        <td className="py-2.5 text-right text-slate-900 font-semibold">
                          {row.detected}
                        </td>
                        <td className="py-2.5 text-right text-teal-800 font-semibold">
                          {row.accuracy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Scale className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Deterministic 100-Point Confidence Scoring Rubric
                </h3>
              </div>
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span>1. Recurrence Interval Consistency (Monthly / Quarterly / Annual tolerance)</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">30 pts</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span>2. Merchant Identity & Alias Resolution Confidence</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">25 pts</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span>3. Number of Supporting Debit Occurrences</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">20 pts</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span>4. Amount-Pattern Stability / Verified Price Change</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">15 pts</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span>5. Supporting Mandate Reference or Trial Notification Event</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">10 pts</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-200/80 text-xs text-slate-700 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Separation of Responsibilities:</strong> Neo4j connects multi-descriptor relationships; Java evaluates temporal intervals and confidence scores deterministically; Sarvam AI communicates verified findings in the user's preferred Indian language.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
