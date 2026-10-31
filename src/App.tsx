import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  LayoutDashboard,
  Network,
  Languages,
  Layers,
  ReceiptText,
  ShieldX,
  BellRing,
  FileSpreadsheet,
  ArrowUpRight,
  Database,
  ShieldAlert,
  CheckCircle2,
  Scale,
  FolderKanban,
} from 'lucide-react';
import {
  apiClient,
  DashboardSummaryData,
  MonthlyTrendPoint,
  DetectionMetricsData,
} from './services/apiClient';
import { sarvamService } from './services/sarvamService';
import {
  CommitmentRecord,
  TransactionRecord,
  DetectionAlertRecord,
  CancellationPlaybookRecord,
  CancellationSessionRecord,
  CommitmentGraphResponse,
  IntegrationStatusResponse,
  LanguageCode,
  SupportedLanguage,
  MerchantRecord,
  MandateRecord,
  ServiceTermsRecord,
  ReconciliationFindingRecord,
} from './types/debitlens';
import { formatINR, formatDateIN } from './utils/currency';
import {
  SearchHistoryEntry,
  DEFAULT_DESCRIPTOR_SEARCH_HISTORY,
  SEARCH_HISTORY_STORAGE_KEY,
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
  clearSearchHistory,
  filterTransactionsByQuery,
  countDescriptorMatches,
} from './utils/searchHistory';
import { CommitmentGraph } from './components/graph/CommitmentGraph';
import { TransactionSearchHistory } from './components/transactions/TransactionSearchHistory';
import { LanguageSelector } from './features/language/LanguageSelector';
import { MerchantExplanationPanel } from './features/language/MerchantExplanationPanel';
import { CancellationExplanation } from './features/language/CancellationExplanation';
import { MultilingualAlert } from './features/language/MultilingualAlert';
import { CancellationCentreView } from './features/cancellation/CancellationCentreView';
import { ImportStudioView } from './features/imports/ImportStudioView';
import { MethodologyMetricsView } from './features/methodology/MethodologyMetricsView';
import { ReconciliationCentreView } from './features/reconciliation/ReconciliationCentreView';
import { EvidenceCasebookView } from './features/evidence/EvidenceCasebookView';
import { ContextualBhashaAskPanel } from './features/language/ContextualBhashaAskPanel';

type ActiveSection =
  | 'overview'
  | 'reconciliation'
  | 'casebook'
  | 'graph'
  | 'bhasha'
  | 'commitments'
  | 'transactions'
  | 'cancellation'
  | 'alerts'
  | 'import_methodology';

type CommitmentFilter =
  | 'ALL'
  | 'HIGH_CONFIDENCE'
  | 'NEEDS_REVIEW'
  | 'MONTHLY'
  | 'ANNUAL_QUARTERLY'
  | 'IRREGULAR_RESUMED'
  | 'PRICE_INCREASED'
  | 'POTENTIALLY_UNUSED'
  | 'OBLIGATIONS';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [language, setLanguage] = useState<LanguageCode>('hi-IN');
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([
    {
      code: 'en-IN',
      name: 'English (India)',
      nativeName: 'English',
      script: 'Latin',
      testedInDemo: true,
      supportedModels: ['sarvam-105b', 'sarvam-translate:v1', 'mayura:v1'],
    },
    {
      code: 'hi-IN',
      name: 'Hindi',
      nativeName: 'हिन्दी',
      script: 'Devanagari',
      testedInDemo: true,
      supportedModels: ['sarvam-105b', 'sarvam-translate:v1', 'mayura:v1'],
    },
    {
      code: 'ta-IN',
      name: 'Tamil',
      nativeName: 'தமிழ்',
      script: 'Tamil',
      testedInDemo: true,
      supportedModels: ['sarvam-105b', 'sarvam-translate:v1', 'mayura:v1'],
    },
    {
      code: 'bn-IN',
      name: 'Bengali',
      nativeName: 'বাংলা',
      script: 'Bengali',
      testedInDemo: true,
      supportedModels: ['sarvam-105b', 'sarvam-translate:v1', 'mayura:v1'],
    },
  ]);

  const [integrations, setIntegrations] = useState<IntegrationStatusResponse | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrendPoint[]>([]);
  const [commitments, setCommitments] = useState<CommitmentRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [alerts, setAlerts] = useState<DetectionAlertRecord[]>([]);
  const [playbooks, setPlaybooks] = useState<CancellationPlaybookRecord[]>([]);
  const [sessions, setSessions] = useState<CancellationSessionRecord[]>([]);
  const [merchantsCatalogue, setMerchantsCatalogue] = useState<MerchantRecord[]>([]);
  const [importHistory, setImportHistory] = useState<
    {
      id: string;
      filename: string;
      sourceType: string;
      totalRecords: number;
      acceptedRecords: number;
      rejectedRecords: number;
      duplicateRecords: number;
      importedAt: string;
    }[]
  >([]);
  const [metrics, setMetrics] = useState<DetectionMetricsData | null>(null);
  const [mandates, setMandates] = useState<MandateRecord[]>([]);
  const [serviceTerms, setServiceTerms] = useState<ServiceTermsRecord[]>([]);
  const [reconciliationFindings, setReconciliationFindings] = useState<
    ReconciliationFindingRecord[]
  >([]);

  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string>('CMT-STREAMBOX');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>('TXN-1003');
  const [graphData, setGraphData] = useState<CommitmentGraphResponse | null>(null);

  // Filters
  const [commitmentFilter, setCommitmentFilter] = useState<CommitmentFilter>('ALL');
  const [txnSearch, setTxnSearch] = useState<string>('');
  const [txnStatusFilter, setTxnStatusFilter] = useState<'ALL' | 'CONFIRMED' | 'UNRESOLVED'>('ALL');
  const [txnSearchHistory, setTxnSearchHistory] = useState<SearchHistoryEntry[]>(() => {
    try {
      const saved = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_DESCRIPTOR_SEARCH_HISTORY;
  });
  const [assignMerchantSelect, setAssignMerchantSelect] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(txnSearchHistory));
    } catch {
      // Ignore storage errors
    }
  }, [txnSearchHistory]);

  const loadAllData = useCallback(async () => {
    const [
      intStatus,
      dashSummary,
      trend,
      cmts,
      txns,
      alts,
      cancData,
      merchData,
      impHist,
      detMetrics,
      langData,
      mnds,
      terms,
      recFindings,
    ] = await Promise.all([
      apiClient.getIntegrationsStatus(),
      apiClient.getDashboardSummary(),
      apiClient.getMonthlyTrend(),
      apiClient.getCommitments(),
      apiClient.getTransactions(),
      apiClient.getAlerts(),
      apiClient.getCancellationData(),
      apiClient.getMerchantsCatalogue(),
      apiClient.getImportHistory(),
      apiClient.getDetectionMetrics(),
      sarvamService.getSupportedLanguages(),
      apiClient.getMandates(),
      apiClient.getServiceTerms(),
      apiClient.getReconciliationFindings(),
    ]);

    setIntegrations(intStatus);
    setSummary(dashSummary);
    setMonthlyTrend(trend);
    setCommitments(cmts);
    setTransactions(txns);
    setAlerts(alts);
    setPlaybooks(cancData.playbooks);
    setSessions(cancData.sessions);
    setMerchantsCatalogue(merchData.merchants);
    setImportHistory(impHist);
    setMetrics(detMetrics);
    setMandates(mnds);
    setServiceTerms(terms);
    setReconciliationFindings(recFindings);
    if (langData.languages.length > 0) {
      setSupportedLanguages(langData.languages);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (!selectedCommitmentId) return;
    apiClient
      .getCommitmentGraph(selectedCommitmentId)
      .then((res) => setGraphData(res))
      .catch(() => {});
  }, [selectedCommitmentId, commitments]);

  const filteredCommitments = useMemo(() => {
    return commitments.filter((c) => {
      if (commitmentFilter === 'HIGH_CONFIDENCE') return c.confidenceLabel === 'HIGH';
      if (commitmentFilter === 'NEEDS_REVIEW') {
        return (
          c.status === 'NEEDS_REVIEW' ||
          c.status === 'RESUMED_REVIEW' ||
          c.status === 'POST_CANCEL_ALERT'
        );
      }
      if (commitmentFilter === 'MONTHLY') return c.recurrenceType === 'MONTHLY';
      if (commitmentFilter === 'ANNUAL_QUARTERLY') {
        return c.recurrenceType === 'YEARLY' || c.recurrenceType === 'QUARTERLY';
      }
      if (commitmentFilter === 'IRREGULAR_RESUMED') {
        return c.recurrenceType === 'IRREGULAR' || c.recurrenceType === 'RESUMED';
      }
      if (commitmentFilter === 'PRICE_INCREASED') return c.priceChangeDetected;
      if (commitmentFilter === 'POTENTIALLY_UNUSED') return c.usageStatus === 'POTENTIALLY_UNUSED';
      if (commitmentFilter === 'OBLIGATIONS') return c.isFinancialObligation;
      return true;
    });
  }, [commitments, commitmentFilter]);

  const filteredTransactions = useMemo(() => {
    return filterTransactionsByQuery(transactions, txnSearch, txnStatusFilter);
  }, [transactions, txnStatusFilter, txnSearch]);

  const handleCommitSearchQuery = useCallback(
    (query: string) => {
      setTxnSearch(query);
      const matches = countDescriptorMatches(transactions, query);
      setTxnSearchHistory((prev) => addSearchHistoryEntry(prev, query, matches));
    },
    [transactions]
  );

  const handleSelectHistoryQuery = useCallback(
    (query: string) => {
      setTxnSearch(query);
      const matches = countDescriptorMatches(transactions, query);
      setTxnSearchHistory((prev) => addSearchHistoryEntry(prev, query, matches));
    },
    [transactions]
  );

  const handleRemoveHistoryQuery = useCallback((query: string) => {
    setTxnSearchHistory((prev) => removeSearchHistoryEntry(prev, query));
  }, []);

  const handleClearSearchHistory = useCallback(() => {
    setTxnSearchHistory(clearSearchHistory());
  }, []);

  const handleRestoreDefaultSearchHistory = useCallback(() => {
    setTxnSearchHistory(DEFAULT_DESCRIPTOR_SEARCH_HISTORY);
  }, []);

  const handleInspectTransactionInBhasha = (txnId: string) => {
    setSelectedTransactionId(txnId);
    setActiveSection('bhasha');
  };

  const handleOpenCancellationPlaybook = (cmtId: string) => {
    setSelectedCommitmentId(cmtId);
    setActiveSection('cancellation');
  };

  const handleOpenCommitmentGraph = (cmtId: string) => {
    setSelectedCommitmentId(cmtId);
    setActiveSection('graph');
  };

  const sidebarItems: { id: ActiveSection; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'reconciliation',
      label: '3-Way Reconciliation',
      icon: <Scale className="w-4 h-4" />,
      count: reconciliationFindings.length,
    },
    {
      id: 'casebook',
      label: 'Evidence Casebook',
      icon: <FolderKanban className="w-4 h-4" />,
      count: commitments.length,
    },
    {
      id: 'graph',
      label: 'Commitment Map (Neo4j)',
      icon: <Network className="w-4 h-4" />,
      count: commitments.length,
    },
    {
      id: 'bhasha',
      label: 'DebitLens Bhasha (Sarvam)',
      icon: <Languages className="w-4 h-4" />,
    },
    {
      id: 'commitments',
      label: 'Discover Commitments',
      icon: <Layers className="w-4 h-4" />,
      count: commitments.length,
    },
    {
      id: 'transactions',
      label: 'Transactions & Resolver',
      icon: <ReceiptText className="w-4 h-4" />,
      count: transactions.length,
    },
    {
      id: 'cancellation',
      label: 'Cancellation Centre',
      icon: <ShieldX className="w-4 h-4" />,
    },
    {
      id: 'alerts',
      label: 'Smart Alerts',
      icon: <BellRing className="w-4 h-4" />,
      count: alerts.filter((a) => a.status === 'OPEN').length,
    },
    {
      id: 'import_methodology',
      label: 'Import & Methodology',
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Exactly 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          DebitLens
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary Top Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => setActiveSection('overview')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'overview' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('graph')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'graph' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            Commitment Map
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('bhasha')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'bhasha' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            DebitLens Bhasha
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('commitments')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'commitments' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            Commitments
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('cancellation')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'cancellation' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            Cancellation Centre
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSection('import_methodology')}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Import Synthetic Data
          </button>
        </div>
      </header>

      {/* Main Workspace Container: Left Sidebar + Main Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Navigation Sidebar */}
        <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-5">
            <div className="px-2">
              <div className="text-xs font-semibold text-teal-800">
                Find it. Understand it. Reconcile it. Verify it.
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Financial Commitment Intelligence & Reconciliation Platform · HackFront Fintech T4.1 + Neo4j + Sarvam AI
              </p>
            </div>

            <nav aria-label="Workspace Sidebar Navigation" className="space-y-1">
              {sidebarItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count !== undefined && (
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          isActive ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="hidden lg:block pt-6 border-t border-slate-100 space-y-2 px-2 text-[11px] text-slate-500">
            <div className="font-semibold text-slate-800">Synthetic Safety Boundary</div>
            <p className="leading-relaxed">
              100% synthetic dataset. DebitLens never asks for UPI PINs, OTPs, or banking passwords and never executes unauthorised mandate revocations.
            </p>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 max-w-[1440px] mx-auto w-full space-y-6">
          {/* Workspace Context Toolbar with Persistent Sarvam Language Selector & Partner Track Switchers */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Partner Tracks:</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCommitmentId('CMT-STREAMBOX');
                  setActiveSection('graph');
                }}
                className="px-2.5 py-1 font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors whitespace-nowrap"
              >
                Demo A: Neo4j Commitment Graph
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTransactionId('TXN-1003');
                  setLanguage('hi-IN');
                  setActiveSection('bhasha');
                }}
                className="px-2.5 py-1 font-medium text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors whitespace-nowrap"
              >
                Demo B: Sarvam Bhasha (Hindi / Tamil)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCommitmentId('CMT-STREAMBOX');
                  setActiveSection('reconciliation');
                }}
                className="px-2.5 py-1 font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors whitespace-nowrap"
              >
                3-Way Reconciliation & Judge Demo
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCommitmentId('CMT-DESIGNVAULT');
                  setActiveSection('cancellation');
                }}
                className="px-2.5 py-1 font-medium text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors whitespace-nowrap"
              >
                Post-Cancellation Case (DesignVault)
              </button>
            </div>

            <LanguageSelector
              selectedLanguage={language}
              languages={supportedLanguages}
              onChangeLanguage={setLanguage}
            />
          </div>

          {/* SECTION 1: OVERVIEW DASHBOARD */}
          {activeSection === 'overview' && summary && (
            <div className="space-y-6">
              {/* Partner Track Integration Status Strip */}
              {integrations && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                        <Database className="w-4 h-4 text-teal-700" />
                        <span>Neo4j Partner Track — Relationship Intelligence Layer</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {integrations.neo4j.message}
                      </p>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums pt-0.5">
                        Mode: {integrations.neo4j.mode} · Active Graph View: {integrations.neo4j.nodeCount} Nodes · {integrations.neo4j.relationshipCount} Edges
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('graph')}
                      className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Open Graph
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                        <Languages className="w-4 h-4 text-indigo-700" />
                        <span>Sarvam AI Partner Track — DebitLens Bhasha ({language})</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {integrations.sarvam.message}
                      </p>
                      <div className="text-[11px] font-mono text-slate-500 pt-0.5">
                        Status: {integrations.sarvam.status} · Models: {integrations.sarvam.chatModel} + {integrations.sarvam.translationModel}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('bhasha')}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Open Bhasha
                    </button>
                  </div>
                </div>
              )}

              {/* Primary KPI Summary Strip (6 Cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Monthly Equivalent</div>
                  <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
                    {formatINR(summary.monthlyRecurringSpend)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Across {summary.activeCommitmentsCount} active commitments
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Projected Annual Total</div>
                  <div className="text-xl font-mono font-bold text-teal-800 mt-1 tabular-nums">
                    {formatINR(summary.annualCommitmentTotal)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Includes annual & quarterly
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Discretionary Subscriptions</div>
                  <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
                    {formatINR(summary.discretionaryAnnual)}/yr
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    OTT, music, cloud, fitness
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Contractual Obligations</div>
                  <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
                    {formatINR(summary.obligationAnnual)}/yr
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Loan EMI, insurance, utility
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Price-Change Alerts</div>
                  <div className="text-xl font-mono font-bold text-rose-700 mt-1 tabular-nums">
                    {summary.priceChangeAlertsCount} flagged
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    MusicFlow (+25.1%) & MaxLife
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Requires Review</div>
                  <div className="text-xl font-mono font-bold text-amber-700 mt-1 tabular-nums">
                    {summary.reviewRequiredCount} items
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {summary.unresolvedTransactionsCount} processor-only unmerged
                  </div>
                </div>
              </div>

              {/* Charts & Upcoming Renewals Split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 border border-slate-200 bg-white rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        Monthly Recurring Cashflow Breakdown (Jun – Oct 2026)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Separates optional subscriptions from essential obligations (Loan EMI, Insurance, Utility) and isolated processor-only rows
                      </p>
                    </div>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: unknown) => [formatINR(Number(value || 0)), 'Spend']}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="subscriptions"
                          name="Optional Subscriptions"
                          stackId="a"
                          fill="#0f766e"
                          radius={[0, 0, 0, 0]}
                        />
                        <Bar
                          dataKey="obligations"
                          name="Loan / Insurance / Utility Obligations"
                          stackId="a"
                          fill="#334155"
                        />
                        <Bar
                          dataKey="unresolved"
                          name="Unresolved Processor-Only"
                          stackId="a"
                          fill="#d97706"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* High-Priority Smart Alerts Preview */}
                <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        Priority Commitment Alerts
                      </h3>
                      <p className="text-xs text-slate-500">
                        Evidence-backed detections
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('alerts')}
                      className="text-xs font-medium text-teal-700 hover:underline"
                    >
                      View All ({alerts.length})
                    </button>
                  </div>

                  <div className="space-y-3">
                    {alerts.slice(0, 4).map((alt) => (
                      <div
                        key={alt.id}
                        className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span
                            className={
                              alt.severity === 'HIGH'
                                ? 'font-bold text-rose-700'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {alt.alertType.replace(/_/g, ' ')}
                          </span>
                          <span className="tabular-nums">{alt.detectedValue}</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-900">{alt.title}</div>
                        <div className="pt-1 flex items-center justify-between">
                          <span className="text-[11px] font-mono text-slate-500 truncate max-w-[180px]">
                            {alt.evidenceReference}
                          </span>
                          {alt.commitmentId && (
                            <button
                              type="button"
                              onClick={() => handleOpenCommitmentGraph(alt.commitmentId!)}
                              className="text-[11px] font-medium text-teal-700 hover:underline shrink-0"
                            >
                              Inspect Graph →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Commitment Register Table on Overview */}
              <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Detected Financial Commitments Register ({commitments.length} Total)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Click any commitment to inspect its Neo4j relationship path, explain in Bhasha ({language}), or launch Two-Layer Cancellation
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection('commitments')}
                    className="text-xs font-medium text-teal-700 hover:underline self-start sm:self-auto"
                  >
                    Open Full Discovery Filters →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                        <th className="py-2.5 px-3 font-semibold">Merchant & Service</th>
                        <th className="py-2.5 px-3 font-semibold">Connected Descriptors</th>
                        <th className="py-2.5 px-3 font-semibold">Recurrence & Rail</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Latest Debit</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Annualised Cost</th>
                        <th className="py-2.5 px-3 font-semibold">Confidence & Status</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commitments.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/90">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{c.serviceName}</div>
                            <div className="text-[11px] text-slate-500">
                              {c.merchantName}
                              {c.isFinancialObligation ? ' · Contractual Obligation' : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                            {c.connectedDescriptors.join(' · ')}
                          </td>
                          <td className="py-3 px-3 text-slate-700">
                            <span className="font-medium">{c.recurrenceType}</span>
                            <span aria-hidden="true" className="mx-1 text-slate-400">·</span>
                            <span className="font-mono text-[11px]">
                              {c.paymentRail.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-right font-semibold text-slate-900">
                            {formatINR(c.latestAmount)}
                            {c.priceChangeDetected && (
                              <div className="text-[10px] text-rose-700">
                                +{c.priceChangePercent}% vs {formatINR(c.typicalAmount)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-right font-semibold text-teal-800">
                            {formatINR(c.annualisedAmount)}/yr
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-700 tabular-nums">
                            {c.confidenceScore}/100 ({c.confidenceLabel}) · {c.status.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenCommitmentGraph(c.id)}
                              className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                            >
                              Graph Map
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCancellationPlaybook(c.id)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                            >
                              Stop / Playbook
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

          {/* SECTION 1B: THREE-WAY FINANCIAL RECONCILIATION CENTRE */}
          {activeSection === 'reconciliation' && (
            <ReconciliationCentreView
              commitments={commitments}
              mandates={mandates}
              serviceTerms={serviceTerms}
              findings={reconciliationFindings}
              selectedCommitmentId={selectedCommitmentId}
              onSelectCommitment={setSelectedCommitmentId}
              onUpsertServiceDocument={async (payload) => {
                await apiClient.upsertServiceDocument(payload);
                sarvamService.clearCache();
                await loadAllData();
              }}
              onImportMandate={async (payload) => {
                await apiClient.importMandates({ mandate: payload });
                sarvamService.clearCache();
                await loadAllData();
              }}
              onLoadStreamBoxJudgeScenario={async () => {
                await apiClient.loadStreamBoxJudgeScenario();
                sarvamService.clearCache();
                await loadAllData();
              }}
              onNavigateToGraph={(id) => {
                setSelectedCommitmentId(id);
                setActiveSection('graph');
              }}
              onNavigateToCasebook={(id) => {
                setSelectedCommitmentId(id);
                setActiveSection('casebook');
              }}
              onNavigateToCancellation={(id) => {
                setSelectedCommitmentId(id);
                setActiveSection('cancellation');
              }}
              onNavigateToBhasha={(id) => {
                setSelectedCommitmentId(id);
                setActiveSection('bhasha');
              }}
            />
          )}

          {/* SECTION 1C: EVIDENCE CASEBOOK, DATA COVERAGE & GUARDRAILS */}
          {activeSection === 'casebook' && (
            <EvidenceCasebookView
              commitments={commitments}
              selectedCommitmentId={selectedCommitmentId}
              onSelectCommitment={setSelectedCommitmentId}
              onConfirmCandidate={async (id) => {
                await apiClient.confirmCommitmentCandidate(id);
                await loadAllData();
              }}
              onRejectCandidate={async (id) => {
                await apiClient.rejectCommitmentCandidate(id);
                await loadAllData();
              }}
            />
          )}

          {/* SECTION 2: NEO4J COMMITMENT GRAPH */}
          {activeSection === 'graph' && (
            <CommitmentGraph
              commitments={commitments}
              selectedCommitmentId={selectedCommitmentId}
              onSelectCommitmentId={setSelectedCommitmentId}
              graphData={graphData}
              onInspectTransactionInBhasha={handleInspectTransactionInBhasha}
              onOpenCancellationPlaybook={handleOpenCancellationPlaybook}
              onRefreshGraph={loadAllData}
            />
          )}

          {/* SECTION 3: SARVAM AI ("DEBITLENS BHASHA") */}
          {activeSection === 'bhasha' && (
            <div className="space-y-6">
              <div className="border border-slate-200 bg-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    DebitLens Bhasha — Financial Intelligence in Your Language (Sarvam AI)
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Communicates verified graph evidence, cryptic merchant descriptors, three-way reconciliation findings, financial alerts, and two-layer cancellation playbooks in Indian languages without hallucinating unverified merchants or removing contractual safety warnings.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedTransactionId('TXN-1003')}
                    className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                      selectedTransactionId === 'TXN-1003'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Case 1: RAZORPAY*STREAMBOX (Verified)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTransactionId('TXN-9501')}
                    className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                      selectedTransactionId === 'TXN-9501'
                        ? 'bg-rose-900 text-white border-rose-900'
                        : 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    Case 2: UPI/DR/42571190/RAZORPAY (Unknown Merchant)
                  </button>
                </div>
              </div>

              <ContextualBhashaAskPanel
                commitments={commitments}
                selectedCommitmentId={selectedCommitmentId}
                onSelectCommitmentId={setSelectedCommitmentId}
                language={language}
              />

              <MerchantExplanationPanel
                transactions={transactions}
                selectedTransactionId={selectedTransactionId}
                onSelectTransactionId={setSelectedTransactionId}
                language={language}
              />

              <CancellationExplanation
                commitments={commitments}
                selectedCommitmentId={selectedCommitmentId}
                onSelectCommitmentId={setSelectedCommitmentId}
                language={language}
              />
            </div>
          )}

          {/* SECTION 4: DISCOVER COMMITMENTS */}
          {activeSection === 'commitments' && (
            <div className="space-y-6">
              <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Discover Recurring Financial Commitments ({filteredCommitments.length} shown)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Includes monthly, quarterly, annual, variable-amount, irregular, resumed after pause, trial-converted, and post-cancellation cases.
                    </p>
                  </div>
                </div>

                {/* Interactive Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'ALL', label: 'All Commitments' },
                      { id: 'HIGH_CONFIDENCE', label: 'High Confidence' },
                      { id: 'NEEDS_REVIEW', label: 'Needs Review / Post-Cancel' },
                      { id: 'MONTHLY', label: 'Monthly' },
                      { id: 'ANNUAL_QUARTERLY', label: 'Annual & Quarterly' },
                      { id: 'IRREGULAR_RESUMED', label: 'Irregular & Resumed' },
                      { id: 'PRICE_INCREASED', label: 'Price Increased' },
                      { id: 'POTENTIALLY_UNUSED', label: 'Potentially Unused' },
                      { id: 'OBLIGATIONS', label: 'Loan / Insurance / Utility' },
                    ] as { id: CommitmentFilter; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCommitmentFilter(tab.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        commitmentFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredCommitments.map((cmt) => (
                  <div
                    key={cmt.id}
                    className="border border-slate-200 bg-white rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 border-b border-slate-100 pb-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
                          <span>{cmt.id}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              cmt.entityClass === 'RECURRING_CANDIDATE'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-teal-100 text-teal-900'
                            }`}
                          >
                            {cmt.entityClass} ({cmt.verificationStatus})
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{cmt.category.replace(/_/g, ' ')}</span>
                          <span aria-hidden="true">·</span>
                          <span>{cmt.recurrenceType}</span>
                          <span aria-hidden="true">·</span>
                          <span>{cmt.paymentRail.replace(/_/g, ' ')}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-teal-800 tabular-nums">
                            Confidence: {cmt.confidenceScore}/100 ({cmt.confidenceLabel})
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {cmt.serviceName} — {cmt.merchantName}
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {cmt.detectionExplanation}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 shrink-0">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-base font-bold text-slate-900">
                            {formatINR(cmt.latestAmount)}
                          </div>
                          <div className="text-xs text-teal-800 font-semibold">
                            {formatINR(cmt.annualisedAmount)}/yr ({formatINR(cmt.monthlyEquivalent)}/mo eq)
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Next expected: {formatDateIN(cmt.nextExpectedDate)}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {cmt.entityClass === 'RECURRING_CANDIDATE' &&
                            cmt.verificationStatus !== 'USER_CONFIRMED' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiClient.confirmCommitmentCandidate(cmt.id);
                                  await loadAllData();
                                }}
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                              >
                                <span>Confirm Candidate</span>
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCommitmentId(cmt.id);
                              setActiveSection('reconciliation');
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <span>3-Way Reconciliation</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCommitmentGraph(cmt.id)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <span>View Commitment Map</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCancellationPlaybook(cmt.id)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <span>How to Stop This Payment</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {cmt.obligationWarning && (
                      <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <span>{cmt.obligationWarning}</span>
                      </div>
                    )}

                    {/* Bottom Metadata & Self-Reported Usage Signal Editor */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600 pt-1">
                      <div className="font-mono text-[11px]">
                        Descriptors ({cmt.connectedDescriptors.length}): {cmt.connectedDescriptors.join(' , ')} · Supporting Txns: {cmt.supportingTransactionIds.join(', ')}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label
                          htmlFor={`last-used-${cmt.id}`}
                          className="text-[11px] text-slate-500 whitespace-nowrap"
                        >
                          Self-Reported Last Used Date:
                        </label>
                        <input
                          id={`last-used-${cmt.id}`}
                          type="date"
                          value={cmt.lastUsedDate || ''}
                          onChange={async (e) => {
                            await apiClient.updateCommitmentUsage(
                              cmt.id,
                              e.target.value || null
                            );
                            await loadAllData();
                          }}
                          className="px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                        />
                        {cmt.usageStatus === 'POTENTIALLY_UNUSED' && (
                          <span className="text-[11px] font-semibold text-amber-800">
                            · Potentially Unused ({cmt.daysSinceLastUsed}d ago)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 5: TRANSACTIONS & DESCRIPTOR RESOLVER */}
          {activeSection === 'transactions' && (
            <div className="space-y-6">
              <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Transactions Explorer & Merchant Identity Resolver ({filteredTransactions.length} rows)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Inspect how raw statement strings are normalised, separated into Payment Processor vs Canonical Merchant, or kept isolated when processor-only (`RAZORPAY*99812-MUM`). Click any recent descriptor query or statement string to filter immediately.
                    </p>
                  </div>
                </div>

                <TransactionSearchHistory
                  searchQuery={txnSearch}
                  onSearchQueryChange={setTxnSearch}
                  onCommitSearchQuery={handleCommitSearchQuery}
                  searchHistory={txnSearchHistory}
                  onSelectHistoryQuery={handleSelectHistoryQuery}
                  onRemoveHistoryQuery={handleRemoveHistoryQuery}
                  onClearHistory={handleClearSearchHistory}
                  onRestoreDefaultHistory={handleRestoreDefaultSearchHistory}
                  transactions={transactions}
                  statusFilter={txnStatusFilter}
                  onStatusFilterChange={setTxnStatusFilter}
                />

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-3 font-semibold">ID & Date</th>
                        <th className="py-2.5 px-3 font-semibold">Raw Statement Descriptor</th>
                        <th className="py-2.5 px-3 font-semibold">Payment Processor</th>
                        <th className="py-2.5 px-3 font-semibold">Resolved Merchant & Service</th>
                        <th className="py-2.5 px-3 font-semibold">Method & Confidence</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 px-4 text-center space-y-2">
                            <div className="text-sm font-semibold text-slate-800">
                              No transactions match &ldquo;{txnSearch}&rdquo;
                            </div>
                            <p className="text-xs text-slate-500">
                              Try selecting one of the recent raw statement descriptor queries above or clearing the active filter.
                            </p>
                            <div>
                              <button
                                type="button"
                                onClick={() => {
                                  setTxnSearch('');
                                  setTxnStatusFilter('ALL');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                              >
                                Reset Search Filter
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((t) => (
                          <tr
                            key={t.id}
                            className={
                              t.resolutionStatus === 'UNRESOLVED'
                                ? 'bg-amber-50/30 hover:bg-amber-50/60'
                                : 'hover:bg-slate-50'
                            }
                          >
                            <td className="py-2.5 px-3 font-mono tabular-nums">
                              <div className="font-semibold text-slate-900">{t.id}</div>
                              <div className="text-[11px] text-slate-500">{t.transactionDate}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              <button
                                type="button"
                                aria-label={`Filter by descriptor ${t.rawDescription}`}
                                onClick={() => handleCommitSearchQuery(t.rawDescription)}
                                className="font-semibold text-slate-900 hover:text-teal-800 hover:underline text-left transition-colors"
                              >
                                {t.rawDescription}
                              </button>
                              <div className="text-[11px] text-slate-500">
                                Acct: {t.accountAlias} · {t.paymentRail}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <div className="font-medium text-slate-900">{t.processorName || '—'}</div>
                              <div className="text-[11px] font-mono text-slate-500">
                                Mechanism: {t.paymentMechanism || t.paymentRail}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {t.merchantName ? (
                                <div>
                                  <div className="font-semibold text-slate-900">{t.merchantName}</div>
                                  <div className="text-[11px] text-slate-500">{t.serviceName}</div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="font-mono text-[11px] font-semibold text-amber-800">
                                    UNRESOLVED — Not Merged
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      aria-label={`Assign Merchant for ${t.rawDescription}`}
                                      value={assignMerchantSelect[t.id] || ''}
                                      onChange={(e) =>
                                        setAssignMerchantSelect((prev) => ({
                                          ...prev,
                                          [t.id]: e.target.value,
                                        }))
                                      }
                                      className="px-2 py-1 text-[11px] bg-white border border-slate-300 rounded text-slate-800"
                                    >
                                      <option value="">Assign Merchant...</option>
                                      {merchantsCatalogue.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.canonicalName}
                                        </option>
                                      ))}
                                    </select>
                                    {assignMerchantSelect[t.id] && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await apiClient.confirmMerchantDescriptor(
                                            assignMerchantSelect[t.id],
                                            t.rawDescription
                                          );
                                          sarvamService.clearCache();
                                          await loadAllData();
                                        }}
                                        className="px-2 py-1 text-[11px] font-medium text-white bg-teal-700 hover:bg-teal-800 rounded"
                                      >
                                        Confirm
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 tabular-nums">
                              <div>{t.matchingMethod}</div>
                              <div>
                                {t.resolutionStatus} · {t.confidenceScore}%
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right font-semibold">
                              <span
                                className={
                                  t.direction === 'CREDIT' ? 'text-teal-700' : 'text-slate-900'
                                }
                              >
                                {t.direction === 'CREDIT' ? '+' : ''}
                                {formatINR(t.amount)}
                              </span>
                              <div className="text-[10px] text-slate-500">{t.direction}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleInspectTransactionInBhasha(t.id)}
                                className="px-2.5 py-1 text-xs font-medium text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                              >
                                Explain in Bhasha
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: CANCELLATION CENTRE */}
          {activeSection === 'cancellation' && (
            <CancellationCentreView
              commitments={commitments}
              playbooks={playbooks}
              sessions={sessions}
              selectedCommitmentId={selectedCommitmentId}
              onSelectCommitmentId={setSelectedCommitmentId}
              language={language}
              onToggleStep={async (sessionId, stepId, completed) => {
                await apiClient.toggleCancellationStep(sessionId, stepId, completed);
                await loadAllData();
              }}
              onAddEvidence={async (sessionId, payload) => {
                await apiClient.addCancellationEvidence(sessionId, payload);
                await loadAllData();
              }}
              onSimulatePostCancelDebit={async (commitmentId) => {
                await apiClient.simulatePostCancelDebit(commitmentId);
                await loadAllData();
              }}
              onUpdateServiceStatus={async (commitmentId, serviceLifecycleStatus) => {
                await apiClient.updateServiceLifecycleStatus(commitmentId, {
                  serviceLifecycleStatus,
                });
                await loadAllData();
              }}
              onUpdateMandateStatus={async (commitmentId, mandateLifecycleStatus) => {
                await apiClient.updateMandateLifecycleStatus(commitmentId, {
                  mandateLifecycleStatus,
                });
                await loadAllData();
              }}
            />
          )}

          {/* SECTION 7: SMART ALERTS (MULTILINGUAL) */}
          {activeSection === 'alerts' && (
            <div className="space-y-4">
              <div className="border border-slate-200 bg-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Multilingual Financial Commitment Alerts ({alerts.length})
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Price increases, trial conversions, resumed charges, annual renewals, potentially unused commitments, post-cancellation debits, and unresolved processor-only alerts explained in {language}.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {alerts.map((alt) => (
                  <MultilingualAlert
                    key={alt.id}
                    alert={alt}
                    language={language}
                    onInspectCommitment={handleOpenCommitmentGraph}
                    onAcknowledgeAlert={async (alertId) => {
                      await apiClient.updateAlertStatus(alertId, 'ACKNOWLEDGED');
                      await loadAllData();
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SECTION 8: IMPORT STUDIO & METHODOLOGY METRICS */}
          {activeSection === 'import_methodology' && (
            <div className="space-y-8">
              <ImportStudioView
                importHistory={importHistory}
                onImportCsv={async (csvContent, filename) => {
                  await apiClient.importTransactionsCsv(csvContent, filename);
                  await loadAllData();
                }}
                onImportNotifications={async (jsonContent, filename) => {
                  await apiClient.importNotificationsJson(jsonContent, filename);
                  await loadAllData();
                }}
                onResetDemo={async () => {
                  await apiClient.resetDemoData();
                  sarvamService.clearCache();
                  await loadAllData();
                }}
              />
              <MethodologyMetricsView metrics={metrics} />
            </div>
          )}
        </main>
      </div>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
          <span>
            DebitLens — Evidence-Backed Financial Commitment Intelligence · HackFront India Fintech PS T4.1 + Neo4j + Sarvam AI Partner Tracks
          </span>
        </div>
        <div className="font-mono text-[11px]">
          Synthetic Prototype · Zero Credentials Collected
        </div>
      </footer>
    </div>
  );
}
