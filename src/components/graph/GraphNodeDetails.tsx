import React from 'react';
import { GraphNodeData } from '../../types/debitlens';
import { Database, ArrowUpRight } from 'lucide-react';

interface GraphNodeDetailsProps {
  node: GraphNodeData | null;
  onInspectTransaction?: (transactionId: string) => void;
}

export const GraphNodeDetails: React.FC<GraphNodeDetailsProps> = ({
  node,
  onInspectTransaction,
}) => {
  if (!node) {
    return (
      <div className="border border-slate-200 bg-white rounded-xl p-5 text-sm text-slate-500">
        Select any node on the interactive Commitment Map to inspect its Neo4j properties, confidence score, and connected records.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Database className="w-3.5 h-3.5 text-teal-700" />
            <span>(:{node.label})</span>
            <span aria-hidden="true">·</span>
            <span>{node.status}</span>
            {node.confidence !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{node.confidence}% confidence</span>
              </>
            )}
          </div>
          <h4 className="text-base font-semibold text-slate-900 mt-1">{node.title}</h4>
          <p className="text-xs text-slate-600 mt-0.5">{node.subtitle}</p>
        </div>

        {node.label === 'Transaction' && onInspectTransaction && (
          <button
            type="button"
            onClick={() => onInspectTransaction(node.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>Explain in Bhasha</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-700">
          Stored Node Properties
        </div>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/60">
          {Object.entries(node.properties).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
              <span className="font-mono text-slate-500">{key}</span>
              <span className="font-mono font-medium text-slate-900 tabular-nums text-right break-all">
                {val === null || val === undefined ? 'null' : String(val)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
