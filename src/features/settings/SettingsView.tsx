import React, { useState } from 'react';
import {
  Database,
  Languages,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Shield,
  Layers,
  Settings,
  Cpu,
} from 'lucide-react';
import { IntegrationStatusResponse, LanguageCode } from '../../types/debitlens';

interface SettingsViewProps {
  integrations: IntegrationStatusResponse | null;
  onRefreshIntegrations: () => Promise<void>;
  currentLanguage: LanguageCode;
  onChangeLanguage: (code: LanguageCode) => void;
  onNavigateToGraph?: () => void;
  onNavigateToBhasha?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  integrations,
  onRefreshIntegrations,
  currentLanguage,
  onChangeLanguage,
}) => {
  const [activeTab, setActiveTab] = useState<'integrations' | 'preferences' | 'storage'>('integrations');
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setStatusMessage(null);
    try {
      await onRefreshIntegrations();
      setStatusMessage('Integration health checks completed successfully.');
    } catch {
      setStatusMessage('Integration check failed. Please check network connectivity.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-800">
            <Settings className="w-4 h-4" />
            <span>Settings & System Information</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            System Information & Technical Integrations
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Discreet technical diagnostics area for database connectivity, AI language models, and storage architecture.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-teal-700 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Checking Connections...' : 'Run Integration Check'}</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'integrations'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Technical Integrations
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'preferences'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Application Preferences
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('storage')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'storage'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Data Storage Architecture
        </button>
      </div>

      {/* TAB 1: TECHNICAL INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-start gap-3">
            <Info className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-slate-900">Technical Diagnostics Policy</span>
              <p className="leading-relaxed">
                Status indicators in this diagnostics panel represent actual service execution checks. DebitLens differentiates between genuine live cloud service connectivity and local preview modes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Database Service Diagnostics */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Financial Relationship Graph</h3>
                    <div className="text-[11px] text-slate-500">Neo4j AuraDB Enterprise / Community Edition</div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-full border ${
                    integrations?.neo4j.mode === 'LIVE_NEO4J'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {integrations?.neo4j.mode === 'LIVE_NEO4J' ? 'LIVE CONNECTED' : 'LOCAL PREVIEW'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Connection URI:</span>
                  <span className="font-mono text-slate-800 truncate max-w-[200px]">
                    {integrations?.neo4j.uriMasked || 'neo4j+s://*****.databases.neo4j.io'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Active Database:</span>
                  <span className="font-mono text-slate-800">{integrations?.neo4j.database || 'default'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Driver & Pool Status:</span>
                  <span className="font-medium text-slate-800">
                    {integrations?.neo4j.driverStatus === 'LIVE_NEO4J'
                      ? 'Neo4j Driver v6 (Connection Pooling Active)'
                      : 'In-Memory Graph Engine'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Synchronised Graph Nodes:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {integrations?.neo4j.nodeCount ?? 0} Nodes
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Synchronised Graph Edges:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {integrations?.neo4j.relationshipCount ?? 0} Relationships
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Schema Constraints Verified:</span>
                  <span className="font-medium text-slate-800">
                    {integrations?.neo4j.constraintsVerified ? (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified ({integrations?.neo4j.constraintCount ?? 5} Constraints)</span>
                      </span>
                    ) : (
                      'Standard Schema Constraints'
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Last Sync Check:</span>
                  <span className="font-mono text-[11px] text-slate-600">
                    {integrations?.neo4j.lastSuccessfulCheck
                      ? new Date(integrations.neo4j.lastSuccessfulCheck).toLocaleTimeString()
                      : 'Initialised'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-600 border border-slate-100">
                <span className="font-medium text-slate-800">Status Details:</span>{' '}
                {integrations?.neo4j.message}
              </div>
            </div>

            {/* AI Language Service Diagnostics */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-800 rounded-lg">
                    <Languages className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Multilingual Financial Intelligence</h3>
                    <div className="text-[11px] text-slate-500">Sarvam AI Sovereign Indian Language Platform</div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-full border ${
                    integrations?.sarvam.status === 'LIVE_SARVAM'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : integrations?.sarvam.status === 'PARTIAL_SARVAM'
                      ? 'bg-sky-50 text-sky-800 border-sky-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {integrations?.sarvam.status === 'LIVE_SARVAM'
                    ? 'LIVE ACTIVE'
                    : integrations?.sarvam.status === 'PARTIAL_SARVAM'
                    ? 'PARTIAL LIVE'
                    : 'LOCAL FALLBACK'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">API Endpoint Base:</span>
                  <span className="font-mono text-slate-800 truncate max-w-[200px]">
                    {integrations?.sarvam.baseUrl || 'https://api.sarvam.ai'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Contextual Explainer Model:</span>
                  <span className="font-mono font-semibold text-indigo-900">
                    {integrations?.sarvam.chatModel || 'sarvam-105b'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Translation Model:</span>
                  <span className="font-mono font-semibold text-indigo-900">
                    {integrations?.sarvam.translationModel || 'sarvam-translate:v1'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Q&A Attribution Route:</span>
                  <span className="text-slate-800 text-[11px]">
                    Deterministic Grounded Engine + sarvam-translate:v1
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Concurrency & Timeout:</span>
                  <span className="font-medium text-slate-800">Max 3 concurrent · 10s AbortSignal timeout</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Supported Languages:</span>
                  <span className="font-medium text-slate-800">12 Official Indian Languages</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Last Live Request:</span>
                  <span className="font-mono text-[11px] text-slate-600">
                    {integrations?.sarvam.lastSuccessfulRequest
                      ? new Date(integrations.sarvam.lastSuccessfulRequest).toLocaleTimeString()
                      : 'Ready for queries'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-600 border border-slate-100">
                <span className="font-medium text-slate-800">Status Details:</span>{' '}
                {integrations?.sarvam.message}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: APPLICATION PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-6 max-w-2xl">
          <div>
            <h3 className="text-sm font-bold text-slate-900">General Preferences</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure how DebitLens displays amounts, languages, and financial commitment summaries.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Default Bhasha Language
              </label>
              <select
                value={currentLanguage}
                onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
                className="w-full sm:w-80 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-hidden focus:border-teal-600"
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="ta-IN">Tamil (தமிழ்)</option>
                <option value="te-IN">Telugu (తెలుగు)</option>
                <option value="bn-IN">Bengali (বাংলা)</option>
                <option value="mr-IN">Marathi (मराठी)</option>
                <option value="gu-IN">Gujarati (ગુજરાતી)</option>
                <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
                <option value="ml-IN">Malayalam (മലയാളം)</option>
                <option value="pa-IN">Punjabi (ਪੰਜਾਬੀ)</option>
                <option value="or-IN">Odia (ଓଡ଼ିଆ)</option>
                <option value="ur-IN">Urdu (اردو)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Used across merchant identity explanations, cancellation playbooks, and contextual Q&A.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block font-semibold text-slate-800 mb-1">Currency Standard</label>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <span className="font-mono font-semibold">Indian Rupee (INR / ₹)</span>
                <p className="text-[11px] text-slate-500 mt-1">
                  All monetary calculations are performed in integer minor units (paise: 1 INR = 100 paise) to prevent floating-point drift.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block font-semibold text-slate-800 mb-1">Demonstration Dataset Mode</label>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <span className="font-semibold text-slate-900">Synthetic Curated Dataset (45 Transactions)</span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Covers UPI AutoPay, Card Standing Instructions, eNACH/NACH mandates, and Google Play recurring debits without requiring real bank account credentials.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATA STORAGE ARCHITECTURE */}
      {activeTab === 'storage' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 max-w-3xl">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Data Storage & Persistence Architecture</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Overview of how state changes, evidence records, and audit events are persisted in DebitLens.
            </p>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-slate-600">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <HardDrive className="w-4 h-4 text-slate-700" />
                <span>Append-Only Application Audit Timeline</span>
              </div>
              <p>
                DebitLens stores user-verified commitment confirmations, service document attachments, cancellation steps, and evidence records in an append-only application audit timeline.
              </p>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                Storage: Safe atomic write pattern via temporary file (<code className="text-slate-700">persistent-store.json.tmp</code>) followed by atomic rename (<code className="text-slate-700">fs.renameSync</code>) with visible error reporting to the caller.
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Layers className="w-4 h-4 text-slate-700" />
                <span>Relationship Graph Synchronization</span>
              </div>
              <p>
                When commitments, service terms, or mandates are updated, the backend synchronizes the full relationship graph to Neo4j AuraDB using parameterized Cypher queries (<code className="text-slate-700">MERGE</code> patterns) ensuring zero duplicate nodes.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Shield className="w-4 h-4 text-slate-700" />
                <span>Privacy & Epistemic Boundaries</span>
              </div>
              <p>
                DebitLens never stores full debit card numbers, CVVs, netbanking passwords, or UPI PINs. External AI requests are strictly sanitized through <code className="text-slate-700">redactTransactionForSarvam</code> prior to transmission.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
