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
  MandateRecord,
  ServiceTermsRecord,
  ReconciliationFindingRecord,
  EvidenceCasebookEntry,
  AuditEventRecord,
  DataCoverageSummary,
  FinancialGuardrailConfig,
  ServiceLifecycleStatus,
  MandateLifecycleStatus,
  RecurrenceFrequency,
  ConfidenceScoreBreakdown,
  CommitmentPassport,
  EvidencePackData,
  UnrecognizedDebitCase,
  ReviewQueueItem,
  ReviewQueueStatus,
  CsvMappingConfig,
  CsvMappingPreviewResult,
  UnrecognizedDebitCaseStatus,
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
  confirmCommitmentCandidate: (commitmentId: string) =>
    fetchJson<CommitmentRecord>(`/api/commitments/${commitmentId}/confirm`, {
      method: 'POST',
    }),
  rejectCommitmentCandidate: (commitmentId: string) =>
    fetchJson<CommitmentRecord>(`/api/commitments/${commitmentId}/reject`, {
      method: 'POST',
    }),
  updateCommitmentFields: (
    commitmentId: string,
    payload: {
      typicalAmount?: number;
      expectedAmountMinor?: number;
      recurrenceType?: RecurrenceFrequency;
      nextExpectedDate?: string | null;
      lastUsedDate?: string | null;
    }
  ) =>
    fetchJson<CommitmentRecord>(`/api/commitments/${commitmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
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
    fetchJson<{
      executionMode?: GraphExecutionMode;
      count: number;
      cypherExecuted: string;
      transactions: TransactionRecord[];
    }>('/api/graph/unresolved-transactions'),
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
  updateServiceLifecycleStatus: (
    sessionOrCommitmentId: string,
    payload: {
      serviceLifecycleStatus: ServiceLifecycleStatus;
      referenceNumber?: string;
      notes?: string;
    }
  ) =>
    fetchJson<{ commitment: CommitmentRecord; session: CancellationSessionRecord }>(
      `/api/cancellations/${sessionOrCommitmentId}/service-status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),
  updateMandateLifecycleStatus: (
    sessionOrCommitmentId: string,
    payload: {
      mandateLifecycleStatus: MandateLifecycleStatus;
      referenceNumber?: string;
      notes?: string;
    }
  ) =>
    fetchJson<{ commitment: CommitmentRecord; session: CancellationSessionRecord }>(
      `/api/cancellations/${sessionOrCommitmentId}/mandate-status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),
  getCancellationMonitoring: (sessionOrCommitmentId: string) =>
    fetchJson<{
      sessionId: string;
      commitmentId: string;
      serviceLifecycleStatus: ServiceLifecycleStatus;
      mandateLifecycleStatus: MandateLifecycleStatus;
      serviceCancelledAt: string | null;
      paymentAuthorisationRevokedAt: string | null;
      postCancellationDebitDetected: boolean;
      postCancellationTransactions: TransactionRecord[];
      monitoringStatus: string;
    }>(`/api/cancellations/${sessionOrCommitmentId}/monitoring`),
  getMandates: () => fetchJson<MandateRecord[]>('/api/mandates'),
  importMandates: (payload: { mandates?: Partial<MandateRecord>[]; mandate?: Partial<MandateRecord> }) =>
    fetchJson<{
      importedCount: number;
      mandates: MandateRecord[];
      reconciliationFindings: ReconciliationFindingRecord[];
    }>('/api/mandates/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getServiceTerms: () => fetchJson<ServiceTermsRecord[]>('/api/service-terms'),
  getCommitmentServiceTerms: (commitmentId: string) =>
    fetchJson<ServiceTermsRecord | null>(`/api/commitments/${commitmentId}/service-terms`),
  upsertServiceDocument: (payload: {
    commitmentId: string;
    merchantName?: string;
    serviceName?: string;
    rawText?: string;
    expectedAmount?: number;
    expectedAmountMinor?: number;
    billingFrequency?: RecurrenceFrequency;
    trialEndDate?: string | null;
    renewalDate?: string | null;
    cancellationNoticeDays?: number | null;
    userVerified?: boolean;
  }) =>
    fetchJson<{
      serviceTerms: ServiceTermsRecord;
      reconciliation: ReconciliationFindingRecord;
      allFindings: ReconciliationFindingRecord[];
    }>('/api/service-documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getReconciliationFindings: () =>
    fetchJson<ReconciliationFindingRecord[]>('/api/reconciliation/findings'),
  reconcileCommitment: (commitmentId: string) =>
    fetchJson<ReconciliationFindingRecord>(`/api/commitments/${commitmentId}/reconcile`, {
      method: 'POST',
    }),
  getCommitmentEvidenceCasebook: (commitmentId: string) =>
    fetchJson<{
      commitmentId: string;
      confidenceBreakdown: ConfidenceScoreBreakdown;
      supportingTransactions: TransactionRecord[];
      connectedDescriptors: string[];
      entries: EvidenceCasebookEntry[];
      auditEvents: AuditEventRecord[];
    }>(`/api/commitments/${commitmentId}/evidence`),
  attachCommitmentEvidence: (
    commitmentId: string,
    payload: {
      category?: EvidenceCasebookEntry['category'];
      title: string;
      description: string;
      sourceReference: string;
      amountMinor?: number | null;
    }
  ) =>
    fetchJson<{
      commitmentId: string;
      entries: EvidenceCasebookEntry[];
      auditEvents: AuditEventRecord[];
    }>(`/api/commitments/${commitmentId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDataCoverage: () => fetchJson<DataCoverageSummary>('/api/import/coverage'),
  getGuardrails: () => fetchJson<FinancialGuardrailConfig[]>('/api/guardrails'),
  updateGuardrail: (commitmentId: string, payload: Partial<FinancialGuardrailConfig>) =>
    fetchJson<FinancialGuardrailConfig>(`/api/guardrails/${commitmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  loadStreamBoxJudgeScenario: () =>
    fetchJson<{
      message: string;
      commitment: CommitmentRecord;
      finding: ReconciliationFindingRecord;
      allFindings: ReconciliationFindingRecord[];
    }>('/api/demo/streambox-judge-scenario', {
      method: 'POST',
    }),
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
  getCommitmentPassport: (commitmentId: string) =>
    fetchJson<CommitmentPassport>(`/api/commitments/${commitmentId}/passport`),
  getEvidencePack: (commitmentId: string) =>
    fetchJson<EvidencePackData>(`/api/commitments/${commitmentId}/evidence-pack`),
  getEvidencePackPrintUrl: (commitmentId: string) =>
    `/api/commitments/${commitmentId}/evidence-pack/print`,
  getInvestigations: () =>
    fetchJson<UnrecognizedDebitCase[]>('/api/investigations'),
  createInvestigation: (transactionId: string) =>
    fetchJson<UnrecognizedDebitCase>('/api/investigations', {
      method: 'POST',
      body: JSON.stringify({ transactionId }),
    }),
  recordInvestigationAction: (
    caseId: string,
    payload: { actionType: string; notes?: string; targetStatus?: UnrecognizedDebitCaseStatus }
  ) =>
    fetchJson<UnrecognizedDebitCase>(`/api/investigations/${caseId}/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  confirmInvestigationMerchant: (
    caseId: string,
    payload: { merchantId: string; rawDescription: string }
  ) =>
    fetchJson<{
      case: UnrecognizedDebitCase;
      transactions: TransactionRecord[];
      commitments: CommitmentRecord[];
    }>(`/api/investigations/${caseId}/confirm-merchant`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getReviewQueue: () =>
    fetchJson<ReviewQueueItem[]>('/api/review-queue'),
  updateReviewQueueStatus: (itemId: string, status: ReviewQueueStatus) =>
    fetchJson<ReviewQueueItem[]>(`/api/review-queue/${itemId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  previewCsvMapping: (csvContent: string, config?: Partial<CsvMappingConfig>) =>
    fetchJson<CsvMappingPreviewResult>('/api/import/transactions/preview-mapping', {
      method: 'POST',
      body: JSON.stringify({ csvContent, config }),
    }),
  applyMappedCsv: (csvContent: string, config: CsvMappingConfig) =>
    fetchJson<{
      message: string;
      batch: any;
      totalTransactions: number;
      totalCommitments: number;
      totalAlerts: number;
    }>('/api/import/transactions/apply-mapped', {
      method: 'POST',
      body: JSON.stringify({ csvContent, config }),
    }),
};
