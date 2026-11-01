import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  RotateCcw,
  CheckCircle2,
  FileJson,
  FileSpreadsheet,
  Wand2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import {
  CsvMappingConfig,
  CsvMappingPreviewResult,
  DateFormatOption,
} from '../../types/debitlens';
import { formatINR } from '../../utils/currency';

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
  onRefreshAll?: () => Promise<void>;
}

const SAMPLE_APPEND_CSV = `transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference
TXN-1006,2026-11-05,"RZP*STREAMBOX, MUMBAI IN",499.00,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UPI-431000112206
TXN-9504,2026-10-28,RAZORPAY*UNKNOWN-882,799.00,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UPI-UNRES-04`;

const SAMPLE_BANK_STATEMENT_CSV = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
05/10/2026,UPI-NETFLIX-9812-AUTOPAY,REF9812938,649.00,,45210.50
10/10/2026,POS 4821 SPOTIFY INDIA MUMBAI,POS-88127,119.00,,45091.50
12/10/2026,ACH DR-HDFC LIFE-INSURANCE,ACH-77219,3250.00,,41841.50
15/10/2026,SALARY CREDIT ACME CORP,SAL-99120,,85000.00,126841.50
20/10/2026,SWIGGY BANGALORE UPI,SWG-33112,420.00,,126421.50
25/10/2026,UPI-AMAZON PRIME-MTHLY,AMZN-5512,299.00,,126122.50`;

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
  onRefreshAll,
}) => {
  const [activeImportTab, setActiveImportTab] = useState<'CSV' | 'CSV_WIZARD' | 'JSON_NOTIFICATIONS'>(
    'CSV'
  );
  const [csvText, setCsvText] = useState(SAMPLE_APPEND_CSV);
  const [filename, setFilename] = useState('november-incremental-batch.csv');
  const [notifJsonText, setNotifJsonText] = useState(SAMPLE_APPEND_NOTIFICATIONS_JSON);
  const [notifFilename, setNotifFilename] = useState('incremental-notifications.json');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Wizard State
  const [wizardCsvText, setWizardCsvText] = useState(SAMPLE_BANK_STATEMENT_CSV);
  const [wizardFilename, setWizardFilename] = useState('hdfc-bank-statement-october.csv');
  const [mappingConfig, setMappingConfig] = useState<CsvMappingConfig>({
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    amountMode: 'SEPARATE_DEBIT_CREDIT',
    debitAmountColumn: 'Withdrawal Amt',
    creditAmountColumn: 'Deposit Amt',
    singleAmountColumn: '',
    dateFormat: 'DD/MM/YYYY',
    defaultRail: 'UNKNOWN',
    defaultAccountAlias: 'HDFC-PRIMARY',
  });
  const [previewResult, setPreviewResult] = useState<CsvMappingPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyingWizard, setApplyingWizard] = useState(false);

  // Run preview whenever wizard text or mapping config changes
  useEffect(() => {
    if (activeImportTab !== 'CSV_WIZARD' || !wizardCsvText.trim()) return;

    let isMounted = true;
    setPreviewLoading(true);
    apiClient
      .previewCsvMapping(wizardCsvText, mappingConfig)
      .then((res) => {
        if (isMounted) {
          setPreviewResult(res);
          // Auto-align default column selections if first time
          if (!mappingConfig.dateColumn && res.detectedMapping.dateColumn) {
            setMappingConfig((prev) => ({
              ...prev,
              ...res.detectedMapping,
            }));
          }
          setPreviewLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setPreviewLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeImportTab, wizardCsvText, mappingConfig.dateColumn, mappingConfig.descriptionColumn, mappingConfig.amountMode, mappingConfig.debitAmountColumn, mappingConfig.dateFormat]);

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

  const handleWizardFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWizardFilename(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setWizardCsvText(evt.target.result);
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

  const handleApplyMappedWizard = async () => {
    if (!wizardCsvText.trim()) {
      setError('Statement CSV content cannot be empty.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      setApplyingWizard(true);
      const res = await apiClient.applyMappedCsv(wizardCsvText, mappingConfig);
      setSuccessMsg(res.message);
      if (onRefreshAll) {
        await onRefreshAll();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply mapped CSV');
    } finally {
      setApplyingWizard(false);
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

  const detectedHeaders = previewResult?.headers || [];

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Statement & Notification Import Studio
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Import native bank statements with Smart Column Mapping, RFC-4180 CSVs, or JSON mandate notifications. All imports sync directly to the financial graph.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/samples/debitlens-transactions.csv"
            download="debitlens-transactions.csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sample Standard CSV</span>
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
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
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
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => setActiveImportTab('CSV_WIZARD')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeImportTab === 'CSV_WIZARD'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Smart Bank Statement Mapping Wizard</span>
            </button>
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
              <span>Standard Format CSV</span>
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
              <span>Notification JSON</span>
            </button>
          </div>

          {/* TAB 1: SMART BANK STATEMENT MAPPING WIZARD */}
          {activeImportTab === 'CSV_WIZARD' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-indigo-600" />
                    Map Any Bank Statement (HDFC, ICICI, SBI, Axis, Kotak)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automatically inspects columns, detects dates, isolates withdrawal debits, and generates a live 10-row preview.
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Bank CSV</span>
                  <input type="file" accept=".csv" onChange={handleWizardFileUpload} className="hidden" />
                </label>
              </div>

              {/* CSV Input Area */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Bank Statement CSV Text
                </label>
                <textarea
                  rows={4}
                  value={wizardCsvText}
                  onChange={(e) => setWizardCsvText(e.target.value)}
                  className="w-full p-2.5 text-xs font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg leading-relaxed"
                  placeholder="Paste bank CSV text here..."
                />
              </div>

              {/* Column Mapping Controls */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                  <span>Column Alignment & Parsing Rules</span>
                  {previewResult && (
                    <span className="text-indigo-600 font-semibold normal-case">
                      Detected {previewResult.totalRowsFound} rows • {previewResult.validRowsCount} debit rows parsed
                    </span>
                  )}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Transaction Date Column</label>
                    <select
                      value={mappingConfig.dateColumn}
                      onChange={(e) => setMappingConfig({ ...mappingConfig, dateColumn: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                    >
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Date Format in CSV</label>
                    <select
                      value={mappingConfig.dateFormat}
                      onChange={(e) =>
                        setMappingConfig({
                          ...mappingConfig,
                          dateFormat: e.target.value as DateFormatOption,
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (Indian Standard)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                      <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                      <option value="AUTO">AUTO (Auto-Detect)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Narration / Description Column</label>
                    <select
                      value={mappingConfig.descriptionColumn}
                      onChange={(e) =>
                        setMappingConfig({ ...mappingConfig, descriptionColumn: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                    >
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1 border-t border-slate-200/60">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Amount Format</label>
                    <select
                      value={mappingConfig.amountMode}
                      onChange={(e) =>
                        setMappingConfig({
                          ...mappingConfig,
                          amountMode: e.target.value as 'SEPARATE_DEBIT_CREDIT' | 'SINGLE_AMOUNT',
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                    >
                      <option value="SEPARATE_DEBIT_CREDIT">Separate Debit & Credit Columns</option>
                      <option value="SINGLE_AMOUNT">Single Amount Column (Signed/Directional)</option>
                    </select>
                  </div>

                  {mappingConfig.amountMode === 'SEPARATE_DEBIT_CREDIT' ? (
                    <>
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Withdrawal / Debit Column</label>
                        <select
                          value={mappingConfig.debitAmountColumn || ''}
                          onChange={(e) =>
                            setMappingConfig({ ...mappingConfig, debitAmountColumn: e.target.value })
                          }
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                        >
                          {detectedHeaders.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Deposit / Credit Column (Filtered Out)</label>
                        <select
                          value={mappingConfig.creditAmountColumn || ''}
                          onChange={(e) =>
                            setMappingConfig({ ...mappingConfig, creditAmountColumn: e.target.value })
                          }
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                        >
                          <option value="">None (No credit column)</option>
                          {detectedHeaders.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Amount Column</label>
                      <select
                        value={mappingConfig.singleAmountColumn || ''}
                        onChange={(e) =>
                          setMappingConfig({ ...mappingConfig, singleAmountColumn: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium"
                      >
                        {detectedHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Sample 10-Row Preview Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center justify-between">
                  <span>Parsed Row Preview (First 10 Rows)</span>
                  {previewLoading && <span className="text-slate-400">Evaluating mapping...</span>}
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">Row</th>
                        <th className="p-2.5">Parsed Date</th>
                        <th className="p-2.5">Extracted Narration</th>
                        <th className="p-2.5">Amount</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {previewResult && previewResult.previewRows.length > 0 ? (
                        previewResult.previewRows.map((r) => (
                          <tr
                            key={r.rowNumber}
                            className={r.isValid ? 'hover:bg-slate-50' : 'bg-slate-50/50 text-slate-400'}
                          >
                            <td className="p-2.5 font-mono text-slate-500">{r.rowNumber}</td>
                            <td className="p-2.5 font-mono">{r.mappedRow?.transaction_date || '—'}</td>
                            <td className="p-2.5 max-w-xs truncate font-mono text-xs">
                              {r.mappedRow?.raw_description || '—'}
                            </td>
                            <td className="p-2.5 font-bold font-mono">
                              {r.mappedRow ? formatINR(Number(r.mappedRow.amount)) : '—'}
                            </td>
                            <td className="p-2.5">
                              {r.isValid ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Valid Debit
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-600">
                                  {r.validationError || 'Skipped'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400">
                            No rows parsed yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confirm Import Button */}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Ready to commit{' '}
                  <strong className="text-slate-800">
                    {previewResult?.validRowsCount || 0}
                  </strong>{' '}
                  valid debit transactions.
                </span>
                <button
                  type="button"
                  onClick={handleApplyMappedWizard}
                  disabled={applyingWizard || !previewResult || previewResult.validRowsCount === 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {applyingWizard ? 'Importing Batch...' : 'Confirm & Commit Mapped Batch'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: STANDARD CSV IMPORT */}
          {activeImportTab === 'CSV' && (
            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Import Standard CSV Batch (RFC-4180 Format)
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
          )}

          {/* TAB 3: NOTIFICATIONS JSON IMPORT */}
          {activeImportTab === 'JSON_NOTIFICATIONS' && (
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
