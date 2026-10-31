import React from 'react';
import { GraphEdgeData } from '../../types/debitlens';
import { GitCommitHorizontal } from 'lucide-react';

interface RelationshipDetailsProps {
  edge: GraphEdgeData | null;
}

export const RelationshipDetails: React.FC<RelationshipDetailsProps> = ({ edge }) => {
  if (!edge) {
    return (
      <div className="border border-slate-200 bg-white rounded-xl p-5 text-sm text-slate-500">
        Click any relationship connector on the graph or in the table below to view its matching method, confidence weight, and provenance evidence.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-xs font-mono text-teal-800 font-semibold">
          <GitCommitHorizontal className="w-4 h-4" />
          <span>[:{edge.type}]</span>
        </div>
        <div className="text-xs font-mono text-slate-600 tabular-nums">
          {edge.status} · {edge.confidence}% confidence
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
          <div className="text-slate-500">Source Node</div>
          <div className="font-mono font-semibold text-slate-900 mt-0.5">{edge.source}</div>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
          <div className="text-slate-500">Target Node</div>
          <div className="font-mono font-semibold text-slate-900 mt-0.5">{edge.target}</div>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
          <div className="text-slate-500">Matching Method</div>
          <div className="font-mono font-semibold text-slate-900 mt-0.5">{edge.matchingMethod}</div>
        </div>
      </div>

      <div className="pt-1">
        <div className="text-xs font-semibold text-slate-700">Evidence Rationale</div>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{edge.evidenceSummary}</p>
      </div>
    </div>
  );
};
