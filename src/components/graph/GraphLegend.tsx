import React from 'react';

export const GraphLegend: React.FC = () => {
  const nodeCategories = [
    { label: 'Transaction', desc: 'Imported debit row', swatch: 'bg-slate-800' },
    { label: 'Descriptor', desc: 'Raw statement text', swatch: 'bg-amber-600' },
    { label: 'PaymentProcessor', desc: 'Gateway / Aggregator', swatch: 'bg-indigo-600' },
    { label: 'Merchant & Service', desc: 'Canonical entity', swatch: 'bg-teal-700' },
    { label: 'Commitment', desc: 'Detected recurring series', swatch: 'bg-emerald-700' },
    { label: 'Mandate & Rail', desc: 'Collection authority', swatch: 'bg-sky-700' },
    { label: 'CancellationPlaybook', desc: 'Two-layer stop workflow', swatch: 'bg-rose-700' },
  ];

  const relationshipStates = [
    { state: 'CONFIRMED', rule: 'Verified reference alias or statement header' },
    { state: 'INFERRED', rule: 'Temporal interval or partial pattern match' },
    { state: 'USER_CONFIRMED', rule: 'Explicit user confirmation or logged cancellation ref' },
    { state: 'UNRESOLVED', rule: 'Processor-only descriptor — kept unmerged for review' },
  ];

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Neo4j Property Graph Schema Legend
          </h4>
          <p className="text-xs text-slate-500">
            17 Node Labels · 18 Evidence-Backed Relationship Types · Click any node or edge on the map to inspect
          </p>
        </div>
        <div className="text-xs text-slate-500 font-mono tabular-nums">
          Path: Transaction → Descriptor → Merchant → Service → Commitment → Mandate → Playbook
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {nodeCategories.map((item) => (
          <div key={item.label} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${item.swatch}`} />
              <span className="text-xs font-semibold text-slate-900 truncate">{item.label}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        {relationshipStates.map((rel) => (
          <div key={rel.state} className="text-xs text-slate-600">
            <span className="font-mono font-semibold text-slate-900">{rel.state}</span>
            <span aria-hidden="true" className="mx-1.5 text-slate-400">·</span>
            <span>{rel.rule}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
