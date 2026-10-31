import React, { useState } from 'react';
import { Upload, Download, RotateCcw, CheckCircle2, FileJson, FileSpreadsheet } from 'lucide-react';

interface ImportHistoryItem {
  id: string;
  filename: string;
  sourceType: string;
  totalRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  importedAt: string;
}

interface ImportStudioViewProps {
  importHistory: ImportHistoryItem[];
  onImportCsv: (csvContent: string, filename: string) => Promise<void>;
  onImportNotifications?: (jsonContent: string, filename: string) => Promise<void>;
  onResetDemo: () => Promise<void>;
}

const SAMPLE_APPEND_CSV = `transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference
TXN-1006,2026-11-05,"RZP*STREAMBOX, MUMBAI IN",499.00,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UPI-431000112206
TXN-9504,2026-10-28,RAZORPAY*UNKNOWN-882,799.00,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UPI-UNRES-04`;

const SAMPLE_APPEND_NOTIFICATIONS_JSON = `[
  {
    "id": "NOTIF-209",
    "eventDate": "2026-10-27",
    "eventType": "MANDATE_CREATED",
    "merchantHint": "StreamBox",
    "serviceHint": "StreamBox OTT Premium",
    "trialStartDate": null,
    "trialEndDate": null,
    "expectedAmount": 499,
    "currency": "INR",
    "paymentRail": "UPI_AUTOPAY",
    "mandateRef": "UMN-STREAMBOX-209",
    "rawSummary": "UPI AutoPay mandate UMN-STREAMBOX-209 registered for StreamBox up to INR 499.00/month."
  }
]`;

export const ImportStudioView: React.FC<ImportStudioViewProps> = ({
  importHistory,
  onImportCsv,
  onImportNotifications,
  onResetDemo,
}) => {
  const [activeImportTab, setActiveImportTab] = useState<'CSV' | 'JSON_NOTIFICATIONS'>('CSV');
  const [csvText, setCsvText] = useState(SAMPLE_APPEND_CSV);
  const [filename, setFilename] = useState('november-incremental-batch.csv');
  const [notifJsonText, setNotifJsonText] = useState(SAMPLE_APPEND_NOTIFICATIONS_JSON);
  const [notifFilename, setNotifFilename] = useState('incremental-notifications.json');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setCsvText(evt.target.result);
      }
    };
    reader.readAsText(file);
  };

  const handleNotifFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotifFilename(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setNotifJsonText(evt.target.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) {
      setError('CSV content cannot be empty. Provide valid header and transaction rows.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      await onImportCsv(csvText, filename);
      setSuccessMsg(
        `Successfully processed CSV batch "${filename}" (RFC-4180 parser) into the Commitment Graph and re-evaluated temporal rules.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleNotificationImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifJsonText.trim()) {
      setError('Notification JSON content cannot be empty.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      if (onImportNotifications) {
        await onImportNotifications(notifJsonText, notifFilename);
        setSuccessMsg(
          `Successfully imported notification events from "${notifFilename}" and linked supporting mandate/trial nodes.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Synthetic Statement & Notification Import Studio
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Upload or paste RFC-4180 CSV bank statements (supporting quoted commas & escaped quotes) or JSON mandate/trial notification records. All imports persist across restarts and sync with the Neo4j graph.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/samples/debitlens-transactions.csv"
            download="debitlens-transactions.csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Sample CSV</span>
          </a>
          <a
            href="/samples/debitlens-notifications.json"
            download="debitlens-notifications.json"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Notifications JSON</span>
          </a>
          <button
            type="button"
            onClick={async () => {
              await onResetDemo();
              setSuccessMsg('Reset synthetic dataset to baseline 45 transactions and 10 commitments.');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs font-medium text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-slate-200 bg-white rounded-xl p-5 space-y-4">
          {/* Import Mode Switcher */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => setActiveImportTab('CSV')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeImportTab === 'CSV'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>1. CSV Statement Import (RFC-4180)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab('JSON_NOTIFICATIONS')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeImportTab === 'JSON_NOTIFICATIONS'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>2. JSON Notification & Trial Import</span>
            </button>
          </div>

          {activeImportTab === 'CSV' ? (
            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Import Synthetic CSV Batch (Supports Quoted Commas & Escaped Quotes)
                </h3>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Local CSV File</span>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div>
                <label htmlFor="csv-batch-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Batch Filename
                </label>
                <input
                  id="csv-batch-name"
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="csv-content-area" className="block text-xs font-medium text-slate-700 mb-1">
                  CSV Rows (`transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference`)
                </label>
                <textarea
                  id="csv-content-area"
                  rows={7}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Validate & Import CSV into Neo4j Graph
              </button>
            </form>
          ) : (
            <form onSubmit={handleNotificationImportSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Import Mandate & Free-Trial Notification JSON Batch
                </h3>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Local JSON File</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleNotifFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label htmlFor="notif-batch-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Notification Batch Filename
                </label>
                <input
                  id="notif-batch-name"
                  type="text"
                  value={notifFilename}
                  onChange={(e) => setNotifFilename(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="notif-content-area" className="block text-xs font-medium text-slate-700 mb-1">
                  JSON Notification Array (`id, eventDate, eventType, merchantHint, serviceHint, expectedAmount, paymentRail, mandateRef`)
                </label>
                <textarea
                  id="notif-content-area"
                  rows={8}
                  value={notifJsonText}
                  onChange={(e) => setNotifJsonText(e.target.value)}
                  className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Validate & Import Notification JSON
              </button>
            </form>
          )}
        </div>

        {/* Import Batch History */}
        <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">Import Batch Audit Log</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Idempotent import batches (`:ImportBatch` nodes)
            </p>
          </div>

          <div className="space-y-3">
            {importHistory.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between font-mono text-slate-900 font-semibold">
                  <span>{b.filename}</span>
                  <span>{b.id}</span>
                </div>
                <div className="text-[11px] font-mono text-teal-800">
                  Source: {b.sourceType}
                </div>
                <div className="text-slate-600 font-mono tabular-nums">
                  Total: {b.totalRecords} · Accepted: {b.acceptedRecords} · Duplicates: {b.duplicateRecords} · Invalid: {b.rejectedRecords}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{b.importedAt}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
