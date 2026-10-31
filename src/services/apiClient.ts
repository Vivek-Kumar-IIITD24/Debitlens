import {
  CommitmentRecord,
  TransactionRecord,
  DetectionAlertRecord,
  CancellationPlaybookRecord,
  CancellationSessionRecord,
  CommitmentGraphResponse,
  IntegrationStatusResponse,
  MerchantRecord,
  PaymentProcessorRecord,
  GraphExecutionMode,
} from '../types/debitlens';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface DashboardSummaryData {
  monthlyRecurringSpend: number;
  annualCommitmentTotal: number;
  discretionaryAnnual: number;
  obligationAnnual: number;
  activeCommitmentsCount: number;
  totalCommitmentsCount: number;
  upcomingPaymentsCount: number;
  priceChangeAlertsCount: number;
  reviewRequiredCount: number;
  totalAlertsCount: number;
  unresolvedTransactionsCount: number;
}

export interface MonthlyTrendPoint {
  month: string;
  subscriptions: number;
  obligations: number;
  unresolved: number;
  total: number;
}

export interface DetectionMetricsData {
  datasetVersion: string;
  totalTransactionsEvaluated: number;
  labelledRecurringCommitments: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precisionPercent: number;
  recallPercent: number;
  f1ScorePercent: number;
  merchantResolutionAccuracyPercent: number;
  merchantResolutionCoveragePercent: number;
  unresolvedProcessorIsolatedCount: number;
  falseMergesCount: number;
  falseMerchantMergeRatePercent?: number;
  unknownMerchantHandlingAccuracyPercent?: number;
  categoryBreakdown: {
    category: string;
    expected: number;
    detected: number;
    accuracy: string;
  }[];
}

export const apiClient = {
  getIntegrationsStatus: () => fetchJson<IntegrationStatusResponse>('/api/integrations/status'),
  getDashboardSummary: () => fetchJson<DashboardSummaryData>('/api/dashboard/summary'),
  getMonthlyTrend: () => fetchJson<MonthlyTrendPoint[]>('/api/dashboard/monthly-trend'),
  getTransactions: () => fetchJson<TransactionRecord[]>('/api/transactions'),
  getCommitments: () => fetchJson<CommitmentRecord[]>('/api/commitments'),
  getAlerts: () => fetchJson<DetectionAlertRecord[]>('/api/alerts'),
  updateAlertStatus: (id: string, status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED') =>
    fetchJson<DetectionAlertRecord>(`/api/alerts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  getMerchantsCatalogue: () =>
    fetchJson<{ merchants: MerchantRecord[]; processors: PaymentProcessorRecord[] }>('/api/merchants'),
  confirmMerchantDescriptor: (merchantId: string, rawDescription: string) =>
    fetchJson<{ message: string; transactions: TransactionRecord[]; commitments: CommitmentRecord[] }>(
      `/api/merchants/${merchantId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ rawDescription }),
      }
    ),
  updateCommitmentUsage: (commitmentId: string, lastUsedDate: string | null) =>
    fetchJson<CommitmentRecord>(`/api/commitments/${commitmentId}/usage`, {
      method: 'PATCH',
      body: JSON.stringify({ lastUsedDate }),
    }),
  getCommitmentGraph: (commitmentId: string) =>
    fetchJson<CommitmentGraphResponse>(`/api/graph/commitments/${commitmentId}`),
  rebuildDemoGraph: () =>
    fetchJson<{
      rebuilt: boolean;
      nodesWritten: number;
      edgesWritten: number;
      mode: GraphExecutionMode;
      message: string;
      commitmentsCount: number;
      transactionsCount: number;
    }>('/api/graph/rebuild-demo', { method: 'POST' }),
  getUnresolvedGraphTransactions: () =>
    fetchJson<{ count: number; cypherExecuted: string; transactions: TransactionRecord[] }>(
      '/api/graph/unresolved-transactions'
    ),
  getCancellationData: () =>
    fetchJson<{ playbooks: CancellationPlaybookRecord[]; sessions: CancellationSessionRecord[] }>(
      '/api/cancellation/sessions'
    ),
  toggleCancellationStep: (sessionId: string, stepId: string, completed: boolean) =>
    fetchJson<{ session: CancellationSessionRecord; commitment: CommitmentRecord }>(
      `/api/cancellation/sessions/${sessionId}/steps/${stepId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      }
    ),
  addCancellationEvidence: (
    sessionId: string,
    payload: {
      evidenceType: 'SERVICE_CONFIRMATION' | 'MANDATE_REVOCATION' | 'SUPPORT_TICKET' | 'MERCHANT_UNRESPONSIVE';
      description: string;
      referenceNumber: string;
      evidenceDate: string;
    }
  ) =>
    fetchJson<{ session: CancellationSessionRecord; commitment: CommitmentRecord }>(
      `/api/cancellation/sessions/${sessionId}/evidence`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  getImportHistory: () =>
    fetchJson<
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
    >('/api/import/history'),
  importTransactionsCsv: (csvContent: string, filename: string) =>
    fetchJson<{
      batch: {
        id: string;
        filename: string;
        totalRecords: number;
        acceptedRecords: number;
        rejectedRecords: number;
        duplicateRecords: number;
      };
      totalTransactions: number;
      totalCommitments: number;
      totalAlerts: number;
    }>('/api/import/transactions', {
      method: 'POST',
      body: JSON.stringify({ csvContent, filename }),
    }),
  importNotificationsJson: (jsonContent: string, filename: string) =>
    fetchJson<{
      batch: {
        id: string;
        filename: string;
        totalRecords: number;
        acceptedRecords: number;
        rejectedRecords: number;
        duplicateRecords: number;
      };
      totalNotifications: number;
      totalCommitments: number;
      totalAlerts: number;
    }>('/api/import/notifications', {
      method: 'POST',
      body: JSON.stringify({ jsonContent, filename }),
    }),
  getDetectionMetrics: () => fetchJson<DetectionMetricsData>('/api/detection/metrics'),
  evaluateDetectionMetrics: () =>
    fetchJson<DetectionMetricsData>('/api/detection/evaluate', { method: 'POST' }),
  simulatePostCancelDebit: (commitmentId: string) =>
    fetchJson<{ message: string; commitment: CommitmentRecord; alerts: DetectionAlertRecord[] }>(
      '/api/demo/simulate-post-cancel-debit',
      {
        method: 'POST',
        body: JSON.stringify({ commitmentId }),
      }
    ),
  resetDemoData: () =>
    fetchJson<{ message: string; commitmentsCount: number; transactionsCount: number }>(
      '/api/demo/reset',
      { method: 'POST' }
    ),
};
