import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  MarkerType,
} from '@xyflow/react';
import {
  CommitmentGraphResponse,
  CommitmentRecord,
  GraphNodeData,
  GraphEdgeData,
  GraphNodeLabel,
} from '../../types/debitlens';
import { GraphLegend } from './GraphLegend';
import { GraphNodeDetails } from './GraphNodeDetails';
import { RelationshipDetails } from './RelationshipDetails';
import { formatINR } from '../../utils/currency';
import { Terminal, ShieldAlert, CheckCircle2, HelpCircle, RefreshCw, Layers, Filter } from 'lucide-react';

interface CommitmentGraphProps {
  commitments: CommitmentRecord[];
  selectedCommitmentId: string;
  onSelectCommitmentId: (id: string) => void;
  graphData: CommitmentGraphResponse | null;
  onInspectTransactionInBhasha: (transactionId: string) => void;
  onOpenCancellationPlaybook: (commitmentId: string) => void;
  onRefreshGraph?: () => void;
}

const COLUMN_X_BY_LABEL: Record<GraphNodeLabel, number> = {
  User: 20,
  ImportBatch: 20,
  Account: 270,
  Transaction: 520,
  NotificationEvent: 520,
  Descriptor: 790,
  PaymentProcessor: 790,
  Merchant: 1060,
  Service: 1320,
  Commitment: 1580,
  FinancialCommitment: 1580,
  RecurringCandidate: 1580,
  DetectionAlert: 1580,
  Mandate: 1840,
  Document: 1840,
  Evidence: 1840,
  ReconciliationFinding: 1840,
  CancellationSession: 1840,
  PaymentRail: 2100,
  CancellationPlaybook: 2100,
  CancellationStep: 2100,
  CancellationEvidence: 2100,
};

const NODE_BORDER_BY_LABEL: Record<GraphNodeLabel, string> = {
  User: '#475569',
  ImportBatch: '#64748b',
  Account: '#334155',
  Transaction: '#0f172a',
  NotificationEvent: '#0284c7',
  Descriptor: '#d97706',
  PaymentProcessor: '#4f46e5',
  Merchant: '#0f766e',
  Service: '#0d9488',
  Commitment: '#047857',
  FinancialCommitment: '#047857',
  RecurringCandidate: '#d97706',
  DetectionAlert: '#dc2626',
  Mandate: '#0369a1',
  Document: '#0ea5e9',
  Evidence: '#10b981',
  ReconciliationFinding: '#8b5cf6',
  PaymentRail: '#0284c7',
  CancellationPlaybook: '#be123c',
  CancellationSession: '#9333ea',
  CancellationStep: '#7e22ce',
  CancellationEvidence: '#15803d',
};

export const CommitmentGraph: React.FC<CommitmentGraphProps> = ({
  commitments,
  selectedCommitmentId,
  onSelectCommitmentId,
  graphData,
  onInspectTransactionInBhasha,
  onOpenCancellationPlaybook,
  onRefreshGraph,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeCypherIndex, setActiveCypherIndex] = useState<number>(0);
  const [expandAllSupportingNodes, setExpandAllSupportingNodes] = useState<boolean>(false);
  const [railFilter, setRailFilter] = useState<string>('ALL');
  const [showUnresolvedNodes, setShowUnresolvedNodes] = useState<boolean>(true);

  const filteredCommitments = useMemo(() => {
    if (railFilter === 'ALL') return commitments;
    return commitments.filter((c) => c.paymentRail === railFilter);
  }, [commitments, railFilter]);

  const visibleGraph = useMemo(() => {
    if (!graphData) return { nodes: [] as GraphNodeData[], edges: [] as GraphEdgeData[] };
    const nodes = graphData.nodes.filter((n) => {
      if (!showUnresolvedNodes && n.status === 'UNRESOLVED') return false;
      if (expandAllSupportingNodes) return true;
      return n.isCoreCommitmentPath !== false;
    });
    const visibleNodeIds = new Set(nodes.map((n) => n.id));
    const edges = graphData.edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
    return { nodes, edges };
  }, [graphData, expandAllSupportingNodes, showUnresolvedNodes]);

  const selectedNode: GraphNodeData | null = useMemo(() => {
    if (!graphData) return null;
    if (selectedNodeId) {
      return graphData.nodes.find((n) => n.id === selectedNodeId) || null;
    }
    return (
      graphData.nodes.find((n) => n.id === graphData.focusCommitmentId) ||
      visibleGraph.nodes[0] ||
      null
    );
  }, [graphData, visibleGraph.nodes, selectedNodeId]);

  const selectedEdge: GraphEdgeData | null = useMemo(() => {
    if (!graphData) return null;
    if (selectedEdgeId) {
      return graphData.edges.find((e) => e.id === selectedEdgeId) || null;
    }
    return (
      visibleGraph.edges.find((e) => e.type === 'DESCRIPTOR_RESOLVES_TO_MERCHANT') ||
      visibleGraph.edges[0] ||
      null
    );
  }, [graphData, visibleGraph.edges, selectedEdgeId]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graphData) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };

    const columnCounts: Record<number, number> = {};
    const flowNodes: Node[] = visibleGraph.nodes.map((n) => {
      const colX = COLUMN_X_BY_LABEL[n.label] ?? 600;
      const rowIdx = columnCounts[colX] || 0;
      columnCounts[colX] = rowIdx + 1;

      const isUnresolved = n.status === 'UNRESOLVED';
      const isSelected = selectedNode?.id === n.id;
      const accentColor = isUnresolved ? '#dc2626' : NODE_BORDER_BY_LABEL[n.label] || '#0f766e';

      return {
        id: n.id,
        position: { x: colX, y: 30 + rowIdx * 112 },
        data: {
          label: (
            <div className="text-left space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                <span>:{n.label}</span>
                <span>{n.status}</span>
              </div>
              <div className="text-xs font-semibold text-slate-900 truncate max-w-[195px]">
                {n.title}
              </div>
              <div className="text-[11px] text-slate-600 truncate max-w-[195px]">
                {n.subtitle}
              </div>
            </div>
          ),
        },
        style: {
          width: 220,
          padding: '8px 10px',
          background: isUnresolved ? '#fef2f2' : isSelected ? '#f0fdfa' : '#ffffff',
          border: `${isSelected ? '2px' : '1.5px'} solid ${accentColor}`,
          borderRadius: '10px',
          boxShadow: isSelected
            ? '0 4px 12px rgba(13, 148, 136, 0.16)'
            : '0 1px 2px rgba(15, 23, 42, 0.06)',
        },
      };
    });

    const flowEdges: Edge[] = visibleGraph.edges.map((e) => {
      const isUnresolved = e.status === 'UNRESOLVED';
      const isSelected = selectedEdge?.id === e.id;
      const strokeColor = isUnresolved ? '#dc2626' : isSelected ? '#0d9488' : '#64748b';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: `${e.type.replace(/^(TRANSACTION_|COMMITMENT_|DESCRIPTOR_|SESSION_)/, '')} (${e.confidence}%)`,
        animated: isUnresolved,
        style: {
          stroke: strokeColor,
          strokeWidth: isSelected ? 2.4 : 1.5,
          strokeDasharray: isUnresolved ? '5 4' : undefined,
        },
        labelStyle: {
          fontSize: 9,
          fontFamily: 'IBM Plex Mono, monospace',
          fill: '#1e293b',
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: '#f8fafc',
          fillOpacity: 0.92,
        },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
      };
    });

    return { flowNodes, flowEdges };
  }, [graphData, visibleGraph, selectedNode, selectedEdge]);

  const activeCypher = graphData?.executedCypherQueries[activeCypherIndex] || null;
  const executionMode = graphData?.executionMode || 'LOCAL_PREVIEW';

  return (
    <div className="space-y-6">
      {/* Top Commitment Selector & Graph Controls Bar */}
      <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-semibold text-slate-900">
                Financial Relationship Map
              </h3>
              <span
                className={`text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full border ${
                  executionMode === 'LIVE_NEO4J'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : executionMode === 'CONNECTION_FAILED'
                    ? 'bg-rose-50 text-rose-900 border-rose-300'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                {executionMode === 'LIVE_NEO4J'
                  ? 'Financial relationship data synchronised'
                  : `Graph Mode: ${executionMode}`}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Select any detected commitment to traverse its raw descriptors, payment processor, canonical merchant, mandate, and cancellation playbook. Processor-only transactions (<code className="font-mono text-slate-800">UPI/DR/42571190/RAZORPAY</code>) remain isolated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="graph-commitment-select" className="text-xs font-medium text-slate-700">
              Focus Commitment:
            </label>
            <select
              id="graph-commitment-select"
              aria-label="Focus Commitment"
              value={selectedCommitmentId}
              onChange={(e) => {
                onSelectCommitmentId(e.target.value);
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {(filteredCommitments.length > 0 ? filteredCommitments : commitments).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.merchantName} — {c.serviceName} ({formatINR(c.latestAmount)} · {c.connectedDescriptors.length} alias{c.connectedDescriptors.length > 1 ? 'es' : ''})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onOpenCancellationPlaybook(selectedCommitmentId)}
              className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Open Two-Layer Cancellation
            </button>
          </div>
        </div>

        {/* Graph View Mode & Filter Controls */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Payment Rail:</span>
            </div>
            {(['ALL', 'UPI_AUTOPAY', 'CARD_EMANDATE', 'ENACH_NACH', 'GOOGLE_PLAY'] as const).map(
              (rail) => (
                <button
                  key={rail}
                  type="button"
                  onClick={() => {
                    setRailFilter(rail);
                    const nextList =
                      rail === 'ALL'
                        ? commitments
                        : commitments.filter((c) => c.paymentRail === rail);
                    if (nextList.length > 0 && !nextList.some((c) => c.id === selectedCommitmentId)) {
                      onSelectCommitmentId(nextList[0].id);
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors ${
                    railFilter === rail
                      ? 'bg-teal-900 text-white border-teal-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {rail === 'ALL' ? 'All Rails' : rail.replace(/_/g, ' ')}
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExpandAllSupportingNodes((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                expandAllSupportingNodes
                  ? 'bg-teal-50 text-teal-900 border-teal-300'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                {expandAllSupportingNodes
                  ? `Showing All Nodes (${visibleGraph.nodes.length})`
                  : `Core Commitment Path (${visibleGraph.nodes.length}/${graphData?.nodes.length || 0} nodes) — Click to Expand`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowUnresolvedNodes((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                showUnresolvedNodes
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {showUnresolvedNodes ? 'Unresolved Cases: Visible' : 'Unresolved Cases: Hidden'}
            </button>

            {onRefreshGraph && (
              <button
                type="button"
                onClick={onRefreshGraph}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Graph</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* React Flow Interactive Canvas */}
      <div
        data-testid="neo4j-commitment-flow"
        className="border border-slate-200 bg-white rounded-xl overflow-hidden h-[500px] relative"
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodeClick={(_evt, node) => setSelectedNodeId(node.id)}
          onEdgeClick={(_evt, edge) => setSelectedEdgeId(edge.id)}
          fitView
          minZoom={0.25}
          maxZoom={1.5}
        >
          <Background color="#cbd5e1" gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>

      {/* Quick Node & Relationship Selector Strip */}
      {graphData && (
        <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-700">
            Quick Node Inspector Bar (Click any graph entity to inspect properties)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleGraph.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
                className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors whitespace-nowrap ${
                  selectedNode?.id === node.id
                    ? 'bg-teal-900 text-white border-teal-900'
                    : node.status === 'UNRESOLVED'
                    ? 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                :{node.label} ({node.title.slice(0, 24)})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Node & Relationship Details Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GraphNodeDetails
          node={selectedNode}
          onInspectTransaction={onInspectTransactionInBhasha}
        />
        <RelationshipDetails edge={selectedEdge} />
      </div>

      {/* Graph Intelligence Explanation Panel (5 Mandatory Questions from Section 3.4) */}
      {graphData && (
        <div className="border border-slate-200 bg-white rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-base font-semibold text-slate-900">
              Graph Intelligence Reasoning & Provenance Panel
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              How Neo4j relationship traversal and temporal rules combined to establish this commitment
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-teal-700" />
                <span>1. Which relationships connected these transactions?</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                {graphData.pathExplanation.whichRelationshipsConnected.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <HelpCircle className="w-4 h-4 text-teal-700" />
                <span>2. Why were these descriptors treated as the same merchant?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {graphData.pathExplanation.whyDescriptorsMerged}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-rose-50/50 border border-rose-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-950">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                <span>3. Which relationships remain uncertain or unmerged?</span>
              </div>
              <ul className="space-y-1.5 text-xs text-rose-900 list-disc pl-4">
                {graphData.pathExplanation.uncertainRelationships.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-teal-700" />
                <span>4. How did the graph help identify the commitment?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {graphData.pathExplanation.howGraphIdentifiedCommitment}
              </p>
            </div>
          </div>

          {/* Question 5: Supporting Transaction Records Table */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-slate-900">
              5. Which transaction records support this conclusion? ({graphData.pathExplanation.supportingTransactionRecords.length} verified records)
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2.5 px-3 font-semibold">Transaction ID</th>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Raw Statement Descriptor</th>
                    <th className="py-2.5 px-3 font-semibold">Account Alias</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Amount (INR)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {graphData.pathExplanation.supportingTransactionRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-medium text-slate-900">{rec.id}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-600">{rec.date}</td>
                      <td className="py-2 px-3 font-mono text-slate-800">{rec.rawDescriptor}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{rec.accountAlias}</td>
                      <td className="py-2 px-3 font-mono tabular-nums font-semibold text-slate-900 text-right">
                        {formatINR(rec.amount)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectTransactionInBhasha(rec.id)}
                          className="text-teal-700 hover:text-teal-900 font-medium underline"
                        >
                          Explain in Bhasha
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Executed Parameterised Cypher Queries Panel */}
      {graphData && (
        <div className="border border-slate-200 bg-white rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-teal-700" />
              <h4 className="text-base font-semibold text-slate-900">
                Executed Parameterised Cypher Queries (Operations 1–7)
              </h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {graphData.executedCypherQueries.map((q, idx) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setActiveCypherIndex(idx)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeCypherIndex === idx
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {q.operationCode}
                </button>
              ))}
            </div>
          </div>

          {activeCypher && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
                <span className="font-semibold text-slate-900">{activeCypher.name}</span>
                <span className="font-mono text-slate-500 tabular-nums">
                  Execution Mode: {activeCypher.executionMode} · {activeCypher.rowCount} row(s) returned
                </span>
              </div>
              <p className="text-xs text-slate-600">{activeCypher.description}</p>

              <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
                {activeCypher.cypher}
              </pre>

              <div className="text-xs font-mono text-slate-600">
                Parameters: {JSON.stringify(activeCypher.parameters)}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      {Object.keys(activeCypher.sampleResults[0] || { result: 'No rows' }).map(
                        (k) => (
                          <th key={k} className="py-2 px-3 font-semibold">
                            {k}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeCypher.sampleResults.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {Object.values(row).map((val, vIdx) => (
                          <td key={vIdx} className="py-2 px-3 text-slate-800 tabular-nums">
                            {Array.isArray(val) ? val.join(', ') : String(val ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <GraphLegend />
    </div>
  );
};
