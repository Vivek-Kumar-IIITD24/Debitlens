import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  RawCsvRow,
  NotificationInput,
  parseCsvTextRFC4180,
  parseAndNormaliseTransactions,
  detectCommitmentsAndAlerts,
  buildCommitmentGraphResponse,
  buildGroundedMerchantExplanation,
  buildGroundedCancellationExplanation,
  buildGroundedAlertExplanation,
  evaluateDetectionMetricsAgainstGroundTruth,
  UserCommitmentStateOverride,
  buildInitialSeedMandates,
  buildInitialSeedServiceTerms,
  extractServiceTermsFromText,
  reconcileCommitment,
  runFullReconciliation,
  buildCommitmentEvidenceCasebook,
  buildDataCoverageSummary,
  buildInitialSeedGuardrails,
  buildGroundedContextualQuestionResponse,
  parseStrictAmount,
  normaliseDescriptor,
  generateMerchantCandidates,
  buildUnrecognizedDebitCase,
  buildReviewQueue,
  generateCommitmentPassport,
  generateEvidencePackData,
  generatePrintableEvidencePackHtml,
  previewCsvMapping,
  parseAllMappedCsvRows,
  computeCanonicalCsvRowFingerprint,
} from './src/engine/debitlensEngine';
import { normalizeDateString } from './src/utils/dateUtils';
import {
  MERCHANT_CATALOGUE,
  PAYMENT_PROCESSORS,
  SUPPORTED_LANGUAGES,
} from './src/engine/referenceData';
import {
  LanguageCode,
  IntegrationStatusResponse,
  CancellationEvidenceRecord,
  SarvamRuntimeStatus,
  MandateRecord,
  ServiceTermsRecord,
  EvidenceCasebookEntry,
  AuditEventRecord,
  FinancialGuardrailConfig,
  ServiceLifecycleStatus,
  MandateLifecycleStatus,
  RecurrenceFrequency,
  PaymentRailType,
  UnrecognizedDebitCase,
  UnrecognizedDebitCaseStatus,
  ReviewQueueStatus,
  CsvMappingConfig,
  MerchantConfirmationRecord,
} from './src/types/debitlens';
import {
  toMinorUnits,
  fromMinorUnits,
  normalizeCurrencyCode,
  isValidCurrencyCode,
  getMinorUnitLabel,
  formatCurrency,
} from './src/utils/currency';
import {
  neo4jPersistenceService,
  isPlaceholderEnvValue,
} from './src/services/neo4jPersistenceService';

dotenv.config();

export const app = express();
app.use(express.json({ limit: '5mb' }));

// ============================================================================
// DURABLE STATE & SYNTHETIC SEED LOADER (Survives Server Restarts)
// ============================================================================
function getPersistentStorePath(): string {
  return process.env.DEBITLENS_STORE_PATH
    ? path.resolve(process.cwd(), process.env.DEBITLENS_STORE_PATH)
    : path.resolve(process.cwd(), 'data/persistent-store.json');
}

interface ImportHistoryEntry {
  id: string;
  filename: string;
  sourceType: string;
  totalRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  importedAt: string;
}

export interface PersistentAppStore {
  rawCsvRows: RawCsvRow[];
  notificationEvents: NotificationInput[];
  userMerchantOverrides: Record<string, string>;
  merchantConfirmations?: MerchantConfirmationRecord[];
  userCommitmentOverrides: Record<string, UserCommitmentStateOverride>;
  alertStatusOverrides: Record<string, 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'>;
  importHistory: ImportHistoryEntry[];
  mandates: MandateRecord[];
  serviceTerms: ServiceTermsRecord[];
  customCasebookEntries: EvidenceCasebookEntry[];
  auditEvents: AuditEventRecord[];
  guardrails: FinancialGuardrailConfig[];
  investigationCases?: UnrecognizedDebitCase[];
  reviewQueueStatusOverrides?: Record<string, ReviewQueueStatus>;
}

let rawCsvRows: RawCsvRow[] = [];
let notificationEvents: NotificationInput[] = [];
let userMerchantOverrides: Record<string, string> = {};
let merchantConfirmationsStore: MerchantConfirmationRecord[] = [];
let userCommitmentOverrides: Record<string, UserCommitmentStateOverride> = {};
let alertStatusOverrides: Record<string, 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'> = {};
let importHistory: ImportHistoryEntry[] = [];
let mandatesStore: MandateRecord[] = [];
let serviceTermsStore: ServiceTermsRecord[] = [];
let customCasebookEntries: EvidenceCasebookEntry[] = [];
let auditEventsStore: AuditEventRecord[] = [];
let guardrailsStore: FinancialGuardrailConfig[] = [];
let investigationCasesStore: UnrecognizedDebitCase[] = [];
let reviewQueueStatusOverrides: Record<string, ReviewQueueStatus> = {};

function recordAuditEvent(params: {
  commitmentId: string | null;
  transactionId?: string | null;
  investigationId?: string | null;
  merchantId?: string | null;
  reviewItemId?: string | null;
  eventType: AuditEventRecord['eventType'];
  summary: string;
  previousState?: string | null;
  newState?: string | null;
  actor?: 'SYSTEM_ENGINE' | 'USER_ACTION' | 'DEMO_SEED_SCENARIO';
}) {
  const evt: AuditEventRecord = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    commitmentId: params.commitmentId,
    transactionId: params.transactionId ?? null,
    investigationId: params.investigationId ?? null,
    merchantId: params.merchantId ?? null,
    reviewItemId: params.reviewItemId ?? null,
    timestamp: new Date().toISOString(),
    eventType: params.eventType,
    actionType: params.eventType,
    summary: params.summary,
    previousState: params.previousState ?? null,
    newState: params.newState ?? null,
    actor: params.actor ?? 'USER_ACTION',
  };
  auditEventsStore.push(evt);
  return evt;
}

let lastPersistenceError: string | null = null;
let simulatePersistenceFailureForTesting = false;
let lastCommittedSnapshot: PersistentAppStore | null = null;

export function setSimulatePersistenceFailureForTesting(shouldFail: boolean) {
  simulatePersistenceFailureForTesting = shouldFail;
}

export function snapshotState(): PersistentAppStore {
  return structuredClone({
    rawCsvRows,
    notificationEvents,
    userMerchantOverrides,
    merchantConfirmations: merchantConfirmationsStore,
    userCommitmentOverrides,
    alertStatusOverrides,
    importHistory,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    customCasebookEntries,
    auditEvents: auditEventsStore,
    guardrails: guardrailsStore,
    investigationCases: investigationCasesStore,
    reviewQueueStatusOverrides,
  });
}

export function restoreStateSnapshot(snapshot: PersistentAppStore) {
  const cloned = structuredClone(snapshot);
  rawCsvRows = cloned.rawCsvRows;
  notificationEvents = cloned.notificationEvents;
  userMerchantOverrides = cloned.userMerchantOverrides;
  merchantConfirmationsStore = cloned.merchantConfirmations || [];
  userCommitmentOverrides = cloned.userCommitmentOverrides;
  alertStatusOverrides = cloned.alertStatusOverrides;
  importHistory = cloned.importHistory;
  mandatesStore = cloned.mandates;
  serviceTermsStore = cloned.serviceTerms;
  customCasebookEntries = cloned.customCasebookEntries;
  auditEventsStore = cloned.auditEvents;
  guardrailsStore = cloned.guardrails;
  investigationCasesStore = cloned.investigationCases || [];
  reviewQueueStatusOverrides = cloned.reviewQueueStatusOverrides || {};
}

function savePersistentStore(): { saved: boolean; error?: string } {
  if (simulatePersistenceFailureForTesting) {
    lastPersistenceError = 'Simulated disk write failure for rollback verification';
    return { saved: false, error: lastPersistenceError };
  }
  const storePath = getPersistentStorePath();
  const tmpPath = `${storePath}.tmp.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 10000)}`;
  try {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: PersistentAppStore = {
      rawCsvRows,
      notificationEvents,
      userMerchantOverrides,
      merchantConfirmations: merchantConfirmationsStore,
      userCommitmentOverrides,
      alertStatusOverrides,
      importHistory,
      mandates: mandatesStore,
      serviceTerms: serviceTermsStore,
      customCasebookEntries,
      auditEvents: auditEventsStore,
      guardrails: guardrailsStore,
      investigationCases: investigationCasesStore,
      reviewQueueStatusOverrides,
    };
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmpPath, storePath);
    lastPersistenceError = null;
    lastCommittedSnapshot = snapshotState();
    return { saved: true };
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // ignore cleanup error
    }
    const message = err instanceof Error ? err.message : String(err);
    lastPersistenceError = message;
    console.warn('Warning: could not write persistent-store.json:', message);
    return { saved: false, error: message };
  }
}

export function computeCanonicalTxnFingerprint(row: RawCsvRow): string {
  return computeCanonicalCsvRowFingerprint({
    accountAlias: row.account_alias || 'PRIMARY-ACCOUNT',
    currency: row.currency || 'INR',
    parsedDate: row.transaction_date || '',
    direction: row.direction || 'DEBIT',
    amount: Number(row.amount) || 0,
    rawDescription: row.raw_description || '',
    externalReference: row.external_reference || '',
  });
}

let mutationQueue = Promise.resolve();

export type RouteMutationResult<T = any> =
  | { status?: number; body: T; syncGraph?: boolean }
  | { errorStatus: number; errorBody: { error: string; [key: string]: any } };

/**
 * Serializes route state mutations via mutationQueue, snapshots full state before mutation,
 * rolls back completely on validation error, runtime throw, or disk write failure,
 * and triggers graph projection ONLY after canonical JSON commit succeeds.
 */
export async function executeSerializedMutation<T>(
  res: express.Response,
  mutator: () => Promise<RouteMutationResult<T>> | RouteMutationResult<T>
): Promise<void> {
  return new Promise((resolve) => {
    mutationQueue = mutationQueue.then(async () => {
      const snapshot = snapshotState();
      try {
        const outcome = await mutator();
        if ('errorStatus' in outcome) {
          restoreStateSnapshot(snapshot);
          res.status(outcome.errorStatus).json(outcome.errorBody);
          resolve();
          return;
        }
        const saveRes = savePersistentStore();
        if (!saveRes.saved) {
          restoreStateSnapshot(snapshot);
          res.status(500).json({
            error: `Failed to persist application state: ${saveRes.error || 'Disk write error'}`,
          });
          resolve();
          return;
        }
        if (outcome.syncGraph !== false) {
          await syncStateToGraphAsync();
        }
        res.status(outcome.status ?? 200).json(outcome.body);
        resolve();
      } catch (err) {
        restoreStateSnapshot(snapshot);
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({
          error: `State mutation failed and was rolled back: ${message}`,
        });
        resolve();
      }
    });
  });
}

function sanitizeTransactionScopedOverrides(rawOverrides: Record<string, string> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!rawOverrides || typeof rawOverrides !== 'object') return clean;
  for (const [k, v] of Object.entries(rawOverrides)) {
    // Only preserve transaction-ID keys; strip legacy raw-descriptor keys so they cannot globally override unrelated transactions
    if (k.startsWith('TXN-') && typeof v === 'string' && v.trim()) {
      clean[k] = v.trim();
    }
  }
  return clean;
}

export function loadSeedData(forceReset = false) {
  const storePath = getPersistentStorePath();
  if (!forceReset && fs.existsSync(storePath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as PersistentAppStore;
      if (Array.isArray(saved.rawCsvRows) && saved.rawCsvRows.length > 0) {
        rawCsvRows = saved.rawCsvRows;
        notificationEvents = saved.notificationEvents || [];
        userMerchantOverrides = sanitizeTransactionScopedOverrides(saved.userMerchantOverrides);
        merchantConfirmationsStore = saved.merchantConfirmations || [];
        userCommitmentOverrides = saved.userCommitmentOverrides || {};
        alertStatusOverrides = saved.alertStatusOverrides || {};
        importHistory = saved.importHistory || [];
        mandatesStore =
          Array.isArray(saved.mandates) && saved.mandates.length > 0
            ? saved.mandates
            : buildInitialSeedMandates();
        serviceTermsStore =
          Array.isArray(saved.serviceTerms) && saved.serviceTerms.length > 0
            ? saved.serviceTerms
            : buildInitialSeedServiceTerms();
        customCasebookEntries = saved.customCasebookEntries || [];
        auditEventsStore = saved.auditEvents || [];
        guardrailsStore = saved.guardrails || [];
        investigationCasesStore = saved.investigationCases || [];
        reviewQueueStatusOverrides = saved.reviewQueueStatusOverrides || {};
        lastCommittedSnapshot = snapshotState();
        return;
      }
    } catch {
      // Fall through to clean seed load
    }
  }

  const csvPath = path.resolve(process.cwd(), 'data/synthetic-transactions.csv');
  const notifPath = path.resolve(process.cwd(), 'data/synthetic-notifications.json');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  rawCsvRows = parseCsvTextRFC4180(csvContent);
  notificationEvents = JSON.parse(fs.readFileSync(notifPath, 'utf-8'));
  userMerchantOverrides = {};
  merchantConfirmationsStore = [];
  userCommitmentOverrides = {};
  alertStatusOverrides = {};
  mandatesStore = buildInitialSeedMandates();
  serviceTermsStore = buildInitialSeedServiceTerms();
  customCasebookEntries = [];
  investigationCasesStore = [];
  reviewQueueStatusOverrides = {};
  auditEventsStore = [
    {
      id: 'AUD-SEED-01',
      commitmentId: 'CMT-DESIGNVAULT',
      timestamp: '2026-09-10T14:20:00Z',
      eventType: 'SERVICE_STATUS_UPDATED',
      summary: 'Demonstration seed: DesignVault service cancellation confirmation DV-CANC-20260910-881.',
      previousState: 'ACTIVE',
      newState: 'CANCELLATION_EVIDENCE_ATTACHED',
      actor: 'DEMO_SEED_SCENARIO',
    },
    {
      id: 'AUD-SEED-02',
      commitmentId: 'CMT-DESIGNVAULT',
      timestamp: '2026-09-10T14:35:00Z',
      eventType: 'MANDATE_STATUS_UPDATED',
      summary: 'Demonstration seed: ICICI SIHub mandate revocation SIHUB-REV-994012.',
      previousState: 'ACTIVE',
      newState: 'REVOCATION_EVIDENCE_ATTACHED',
      actor: 'DEMO_SEED_SCENARIO',
    },
  ];
  importHistory = [
    {
      id: 'BATCH-SEED-01',
      filename: 'synthetic-transactions.csv',
      sourceType: 'CSV_STATEMENT',
      totalRecords: rawCsvRows.length,
      acceptedRecords: rawCsvRows.length,
      rejectedRecords: 0,
      duplicateRecords: 0,
      importedAt: '2026-10-30T09:00:00Z',
    },
    {
      id: 'BATCH-NOTIF-01',
      filename: 'synthetic-notifications.json',
      sourceType: 'NOTIFICATION_JSON',
      totalRecords: notificationEvents.length,
      acceptedRecords: notificationEvents.length,
      rejectedRecords: 0,
      duplicateRecords: 0,
      importedAt: '2026-10-30T09:01:00Z',
    },
    {
      id: 'BATCH-MANDATE-01',
      filename: 'seed-mandate-registry.json',
      sourceType: 'MANDATE_JSON',
      totalRecords: mandatesStore.length,
      acceptedRecords: mandatesStore.length,
      rejectedRecords: 0,
      duplicateRecords: 0,
      importedAt: '2026-10-30T09:02:00Z',
    },
    {
      id: 'BATCH-DOCS-01',
      filename: 'seed-service-invoices.json',
      sourceType: 'SERVICE_DOCUMENTS',
      totalRecords: serviceTermsStore.length,
      acceptedRecords: serviceTermsStore.length,
      rejectedRecords: 0,
      duplicateRecords: 0,
      importedAt: '2026-10-30T09:03:00Z',
    },
  ];
  guardrailsStore = [];
  savePersistentStore();
}

loadSeedData(false);

export function computeCurrentState() {
  const { transactions, invalidRows, duplicateRows } = parseAndNormaliseTransactions(
    rawCsvRows,
    'BATCH-SEED-01',
    'DEMO_SEED',
    userMerchantOverrides
  );
  const { commitments, alerts, playbooks, sessions } = detectCommitmentsAndAlerts(
    transactions,
    notificationEvents,
    userCommitmentOverrides
  );

  for (const alt of alerts) {
    if (alertStatusOverrides[alt.id]) {
      alt.status = alertStatusOverrides[alt.id];
    }
  }

  const reconciliationFindings = runFullReconciliation({
    commitments,
    transactions,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    sessions,
  });

  if (guardrailsStore.length === 0) {
    guardrailsStore = buildInitialSeedGuardrails(commitments);
  }

  // Ensure every UNRESOLVED debit transaction has an investigation case in investigationCasesStore
  for (const txn of transactions) {
    if (txn.direction === 'DEBIT' && txn.resolutionStatus === 'UNRESOLVED') {
      const existingCase = investigationCasesStore.find((c) => c.transactionId === txn.id);
      if (!existingCase) {
        investigationCasesStore.push(
          buildUnrecognizedDebitCase({
            transaction: txn,
            allTransactions: transactions,
            userMerchantOverrides,
            existingCases: investigationCasesStore,
          })
        );
      }
    }
  }

  return {
    transactions,
    invalidRows,
    duplicateRows,
    commitments,
    alerts,
    playbooks,
    sessions,
    reconciliationFindings,
    investigations: investigationCasesStore,
    auditEvents: auditEventsStore,
  };
}

// Separate Graph Projection / Sync Status (Never invalidates canonical JSON store)
export type GraphSyncStatus = 'SYNCED' | 'PENDING' | 'FAILED' | 'LOCAL_ONLY';
let lastGraphSyncStatus: GraphSyncStatus = neo4jPersistenceService.isConfigured() ? 'PENDING' : 'LOCAL_ONLY';
let lastGraphSyncAt: string | null = null;
let lastGraphSyncError: string | null = null;
let simulateGraphSyncFailureForTesting = false;

export function setSimulateGraphSyncFailureForTesting(shouldFail: boolean) {
  simulateGraphSyncFailureForTesting = shouldFail;
}

export function getGraphSyncMetadata() {
  return {
    status: lastGraphSyncStatus,
    lastSyncAt: lastGraphSyncAt,
    lastError: lastGraphSyncError,
  };
}

export async function syncStateToGraphAsync(): Promise<{ status: GraphSyncStatus; error?: string }> {
  if (simulateGraphSyncFailureForTesting) {
    lastGraphSyncStatus = 'FAILED';
    lastGraphSyncError = 'Simulated Neo4j graph projection failure for testing';
    return { status: 'FAILED', error: lastGraphSyncError };
  }
  if (!neo4jPersistenceService.isConfigured() || process.env.DEBITLENS_SKIP_LISTEN === '1') {
    lastGraphSyncStatus = 'LOCAL_ONLY';
    return { status: 'LOCAL_ONLY' };
  }
  lastGraphSyncStatus = 'PENDING';
  try {
    const state = computeCurrentState();
    const res = await neo4jPersistenceService.syncFullGraphToNeo4j({
      transactions: state.transactions,
      commitments: state.commitments,
      alerts: state.alerts,
      playbooks: state.playbooks,
      sessions: state.sessions,
      notifications: notificationEvents,
      mandates: mandatesStore,
      serviceTerms: serviceTermsStore,
      reconciliationFindings: state.reconciliationFindings,
    });
    if (res.persisted) {
      lastGraphSyncStatus = 'SYNCED';
      lastGraphSyncAt = new Date().toISOString();
      lastGraphSyncError = null;
      return { status: 'SYNCED' };
    } else {
      lastGraphSyncStatus = 'FAILED';
      lastGraphSyncError = res.error || 'Graph projection failed';
      return { status: 'FAILED', error: lastGraphSyncError };
    }
  } catch (err) {
    lastGraphSyncStatus = 'FAILED';
    lastGraphSyncError = err instanceof Error ? err.message : String(err);
    return { status: 'FAILED', error: lastGraphSyncError };
  }
}

if (process.env.DEBITLENS_SKIP_LISTEN !== '1') {
  syncStateToGraphAsync();
}

// ============================================================================
// SARVAM AI BACKEND CLIENT, CONCURRENCY LIMITER & FIELD-LEVEL STATUS TRACKING
// ============================================================================
const SARVAM_BASE_URL = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai';
const SARVAM_CHAT_MODEL = process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';
const SARVAM_TRANSLATION_MODEL = process.env.SARVAM_TRANSLATION_MODEL || 'sarvam-translate:v1';
const SARVAM_DEFAULT_LANGUAGE = (process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN') as LanguageCode;
const SARVAM_TIMEOUT_MS = 10000;

export function isSarvamConfigured(): boolean {
  const enabled = process.env.SARVAM_ENABLED !== 'false';
  const key = process.env.SARVAM_API_KEY;
  return Boolean(enabled && !isPlaceholderEnvValue(key));
}

let sarvamLastSuccessfulRequest: string | null = null;
let sarvamLastRequestStatus: SarvamRuntimeStatus = isSarvamConfigured()
  ? 'CONFIGURED_NOT_TESTED'
  : 'NOT_CONFIGURED';
let sarvamLastError: string | null = null;

function getEffectiveSarvamStatus(): SarvamRuntimeStatus {
  if (!isSarvamConfigured()) {
    return 'NOT_CONFIGURED';
  }
  if (sarvamLastRequestStatus === 'NOT_CONFIGURED') {
    return 'CONFIGURED_NOT_TESTED';
  }
  return sarvamLastRequestStatus;
}

const translationCache = new Map<string, string>();

/**
 * Concurrency limiter so multi-field playbook translations never flood Sarvam API.
 */
async function runWithConcurrencyLimit<T>(
  taskFactories: Array<() => Promise<T>>,
  concurrency = 3
): Promise<T[]> {
  const results: T[] = new Array(taskFactories.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < taskFactories.length) {
      const idx = nextIndex++;
      results[idx] = await taskFactories[idx]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, taskFactories.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function splitIntoSentenceChunks(text: string, maxChars = 900): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];
  const sentences = trimmed.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length <= maxChars) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length <= maxChars) {
        current = s;
      } else {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars));
        }
        current = '';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function callSarvamTranslateApi(
  inputText: string,
  targetLanguage: LanguageCode,
  model: 'sarvam-translate:v1' | 'mayura:v1' = 'sarvam-translate:v1'
): Promise<{ translatedText: string | null; status: SarvamRuntimeStatus; error?: string }> {
  if (!isSarvamConfigured()) {
    sarvamLastRequestStatus = 'NOT_CONFIGURED';
    return {
      translatedText: null,
      status: 'LOCAL_FALLBACK',
      error: 'SARVAM_API_KEY is not configured in backend environment.',
    };
  }
  if (targetLanguage === 'en-IN') {
    return { translatedText: inputText, status: 'LIVE_SARVAM' };
  }

  const cacheKey = `${model}:${targetLanguage}:${inputText}`;
  if (translationCache.has(cacheKey)) {
    return { translatedText: translationCache.get(cacheKey)!, status: 'LIVE_SARVAM' };
  }

  const maxChars = model === 'mayura:v1' ? 900 : 1800;
  const chunks = splitIntoSentenceChunks(inputText, maxChars);
  const translatedChunks: string[] = [];

  try {
    for (const chunk of chunks) {
      const response = await fetch(`${SARVAM_BASE_URL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': process.env.SARVAM_API_KEY!,
        },
        body: JSON.stringify({
          input: chunk,
          source_language_code: 'en-IN',
          target_language_code: targetLanguage,
          model,
          enable_preprocessing: true,
        }),
        signal: AbortSignal.timeout(SARVAM_TIMEOUT_MS),
      });

      if (response.status === 429) {
        const errText = await response.text();
        sarvamLastRequestStatus = 'RATE_LIMITED';
        sarvamLastError = `Sarvam Translate rate limited (HTTP 429): ${errText}`;
        return { translatedText: null, status: 'RATE_LIMITED', error: sarvamLastError };
      }

      if (!response.ok) {
        const errText = await response.text();
        sarvamLastRequestStatus = 'REQUEST_FAILED';
        sarvamLastError = `Sarvam Translate HTTP ${response.status}: ${errText}`;
        return { translatedText: null, status: 'REQUEST_FAILED', error: sarvamLastError };
      }

      const data = (await response.json()) as { translated_text?: string };
      if (!data.translated_text) {
        sarvamLastRequestStatus = 'REQUEST_FAILED';
        sarvamLastError = 'Empty translated_text from Sarvam API';
        return { translatedText: null, status: 'REQUEST_FAILED', error: sarvamLastError };
      }
      translatedChunks.push(data.translated_text);
    }

    const joined = translatedChunks.join(' ');
    translationCache.set(cacheKey, joined);
    sarvamLastSuccessfulRequest = new Date().toISOString();
    sarvamLastRequestStatus = 'LIVE_SARVAM';
    sarvamLastError = null;
    return { translatedText: joined, status: 'LIVE_SARVAM' };
  } catch (err: unknown) {
    sarvamLastRequestStatus = 'REQUEST_FAILED';
    sarvamLastError = err instanceof Error ? err.message : String(err);
    return { translatedText: null, status: 'REQUEST_FAILED', error: sarvamLastError };
  }
}

async function callSarvamChatExplanationApi(
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string | null; status: SarvamRuntimeStatus; error?: string }> {
  if (!isSarvamConfigured()) {
    sarvamLastRequestStatus = 'NOT_CONFIGURED';
    return {
      content: null,
      status: 'LOCAL_FALLBACK',
      error: 'SARVAM_API_KEY is not configured in backend environment.',
    };
  }

  try {
    const response = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY!,
      },
      body: JSON.stringify({
        model: SARVAM_CHAT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(SARVAM_TIMEOUT_MS),
    });

    if (response.status === 429) {
      const errText = await response.text();
      sarvamLastRequestStatus = 'RATE_LIMITED';
      sarvamLastError = `Sarvam Chat rate limited (HTTP 429): ${errText}`;
      return { content: null, status: 'RATE_LIMITED', error: sarvamLastError };
    }

    if (!response.ok) {
      const errText = await response.text();
      sarvamLastRequestStatus = 'REQUEST_FAILED';
      sarvamLastError = `Sarvam Chat HTTP ${response.status}: ${errText}`;
      return { content: null, status: 'REQUEST_FAILED', error: sarvamLastError };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content || null;
    if (content) {
      sarvamLastSuccessfulRequest = new Date().toISOString();
      sarvamLastRequestStatus = 'LIVE_SARVAM';
      sarvamLastError = null;
      return { content, status: 'LIVE_SARVAM' };
    }
    sarvamLastRequestStatus = 'REQUEST_FAILED';
    sarvamLastError = 'Empty content in Sarvam chat response';
    return { content: null, status: 'REQUEST_FAILED', error: sarvamLastError };
  } catch (err: unknown) {
    sarvamLastRequestStatus = 'REQUEST_FAILED';
    sarvamLastError = err instanceof Error ? err.message : String(err);
    return { content: null, status: 'REQUEST_FAILED', error: sarvamLastError };
  }
}

// ============================================================================
// REST API ENDPOINTS — HEALTH & INTEGRATIONS
// ============================================================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'UP',
    application: 'DebitLens Financial Commitment Intelligence & Reconciliation Platform',
    tagline: 'Find it. Understand it. Reconcile it. Verify it.',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/integrations/status', async (_req, res) => {
  const state = computeCurrentState();
  const neo4jHealth = await neo4jPersistenceService.checkConnectivity(true);
  const fallbackGraph = buildCommitmentGraphResponse({
    focusCommitmentId: state.commitments[0]?.id || null,
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    reconciliationFindings: state.reconciliationFindings,
    executionMode: neo4jHealth.status,
  });

  const sarvamConfigured = isSarvamConfigured();
  const effectiveSarvamStatus = getEffectiveSarvamStatus();
  const isLiveSarvam =
    effectiveSarvamStatus === 'LIVE_SARVAM' || effectiveSarvamStatus === 'LIVE_SUCCESS';

  const payload: IntegrationStatusResponse = {
    neo4j: {
      configured: neo4jHealth.configured,
      connected: neo4jHealth.connected,
      mode: neo4jHealth.status,
      lastSuccessfulCheck: neo4jHealth.lastSuccessfulCheck,
      uriMasked: neo4jHealth.uriMasked,
      database: neo4jHealth.database,
      driverStatus: neo4jHealth.status,
      message: neo4jHealth.message,
      nodeCount: neo4jHealth.nodeCount ?? fallbackGraph.nodes.length,
      relationshipCount: neo4jHealth.relationshipCount ?? fallbackGraph.edges.length,
      constraintsVerified: Boolean(neo4jHealth.constraintsVerified),
    },
    sarvam: {
      configured: sarvamConfigured,
      lastSuccessfulRequest: sarvamLastSuccessfulRequest,
      lastRequestStatus: effectiveSarvamStatus,
      lastError: sarvamLastError,
      baseUrl: SARVAM_BASE_URL,
      chatModel: SARVAM_CHAT_MODEL,
      translationModel: SARVAM_TRANSLATION_MODEL,
      defaultLanguage: SARVAM_DEFAULT_LANGUAGE,
      status: effectiveSarvamStatus,
      message: isLiveSarvam
        ? `Live Sarvam AI verified (${SARVAM_CHAT_MODEL} + ${SARVAM_TRANSLATION_MODEL}). Last successful call at ${sarvamLastSuccessfulRequest}.`
        : effectiveSarvamStatus === 'PARTIAL_SARVAM'
        ? `Sarvam AI partially succeeded (${SARVAM_CHAT_MODEL} + ${SARVAM_TRANSLATION_MODEL}); fallback used for failed fields.`
        : effectiveSarvamStatus === 'CONFIGURED_NOT_TESTED'
        ? `SARVAM_API_KEY configured server-side (${SARVAM_CHAT_MODEL} + ${SARVAM_TRANSLATION_MODEL}). Status: CONFIGURED_NOT_TESTED until first live request completes.`
        : effectiveSarvamStatus === 'RATE_LIMITED' || effectiveSarvamStatus === 'REQUEST_FAILED'
        ? `Sarvam API request status: ${effectiveSarvamStatus} (${sarvamLastError || 'error'}). Using clearly labelled LOCAL_FALLBACK.`
        : 'SARVAM_API_KEY not configured in backend environment. Using clearly labelled deterministic Bhasha LOCAL_FALLBACK translations.',
    },
  };
  res.json(payload);
});

app.get('/api/graph/health', async (_req, res) => {
  const health = await neo4jPersistenceService.checkConnectivity(true);
  res.json({
    ...health,
    timestamp: new Date().toISOString(),
  });
});

const handleSarvamStatus = (_req: express.Request, res: express.Response) => {
  const configured = isSarvamConfigured();
  const status = getEffectiveSarvamStatus();
  res.json({
    configured,
    lastSuccessfulRequest: sarvamLastSuccessfulRequest,
    lastRequestStatus: status,
    lastError: sarvamLastError,
    baseUrl: SARVAM_BASE_URL,
    chatModel: SARVAM_CHAT_MODEL,
    translationModel: SARVAM_TRANSLATION_MODEL,
    status,
    keyExposedToClient: false,
    timestamp: new Date().toISOString(),
  });
};

app.get('/api/sarvam/status', handleSarvamStatus);
app.get('/api/sarvam/health', handleSarvamStatus);
app.get('/api/language/status', handleSarvamStatus);

// ============================================================================
// REST API ENDPOINTS — NEO4J COMMITMENT GRAPH
// ============================================================================
app.get('/api/graph/commitments/:id', async (req, res) => {
  const state = computeCurrentState();
  const graphResponse = await neo4jPersistenceService.getCommitmentGraph({
    focusCommitmentId: req.params.id,
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    reconciliationFindings: state.reconciliationFindings,
  });
  res.json(graphResponse);
});

app.get('/api/graph/merchants/:id/relationships', async (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.merchantId === req.params.id);
  const graphResponse = await neo4jPersistenceService.getCommitmentGraph({
    focusCommitmentId: cmt?.id || null,
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    reconciliationFindings: state.reconciliationFindings,
  });
  res.json(graphResponse);
});

app.get('/api/graph/commitments/:id/evidence', async (req, res) => {
  const state = computeCurrentState();
  const graphResponse = await neo4jPersistenceService.getCommitmentGraph({
    focusCommitmentId: req.params.id,
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    reconciliationFindings: state.reconciliationFindings,
  });
  res.json({
    commitmentId: req.params.id,
    executionMode: graphResponse.executionMode,
    supportingTransactions: graphResponse.pathExplanation.supportingTransactionRecords,
    edges: graphResponse.edges,
  });
});

app.get('/api/graph/commitments/:id/path-explanation', async (req, res) => {
  const state = computeCurrentState();
  const graphResponse = await neo4jPersistenceService.getCommitmentGraph({
    focusCommitmentId: req.params.id,
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    reconciliationFindings: state.reconciliationFindings,
  });
  res.json(graphResponse.pathExplanation);
});

app.get('/api/graph/unresolved-transactions', async (_req, res) => {
  const state = computeCurrentState();
  const unresolvedResult = await neo4jPersistenceService.queryUnresolvedTransactions(
    state.transactions
  );
  res.json(unresolvedResult);
});

app.post('/api/graph/rebuild-demo', async (_req, res) => {
  await executeSerializedMutation(res, async () => {
    loadSeedData(true);
    const state = computeCurrentState();
    const rebuildResult = await neo4jPersistenceService.rebuildDemoGraphInNeo4j({
      transactions: state.transactions,
      commitments: state.commitments,
      alerts: state.alerts,
      playbooks: state.playbooks,
      sessions: state.sessions,
      notifications: notificationEvents,
      mandates: mandatesStore,
      serviceTerms: serviceTermsStore,
      reconciliationFindings: state.reconciliationFindings,
    });
    return {
      syncGraph: false,
      body: {
        ...rebuildResult,
        commitmentsCount: state.commitments.length,
        transactionsCount: state.transactions.length,
      },
    };
  });
});

// ============================================================================
// REST API ENDPOINTS — SARVAM AI ("DEBITLENS BHASHA") WITH FIELD-LEVEL TRACKING
// ============================================================================
const handleSupportedLanguages = (_req: express.Request, res: express.Response) => {
  res.json({
    defaultLanguage: SARVAM_DEFAULT_LANGUAGE,
    languages: SUPPORTED_LANGUAGES,
  });
};
app.get('/api/language/supported', handleSupportedLanguages);
app.get('/api/sarvam/supported', handleSupportedLanguages);

const handleMerchantExplanation = async (req: express.Request, res: express.Response) => {
  const { transactionId, language = 'hi-IN' } = req.body as {
    transactionId: string;
    language?: LanguageCode;
  };
  const state = computeCurrentState();
  const txn =
    state.transactions.find((t) => t.id === transactionId) || state.transactions[0];

  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  const baseExplanation = buildGroundedMerchantExplanation(txn, language);

  if (isSarvamConfigured() && language !== 'en-IN') {
    const systemPrompt =
      'You are DebitLens Bhasha, a strict evidence-grounded financial intelligence explainer. Explain ONLY the verified facts provided. Never invent or guess an unverified merchant. Preserve merchant names, processor names, and INR amounts accurately.';
    const userPrompt = `Explain these verified transaction facts in ${language}: ${JSON.stringify(
      baseExplanation.privacyAudit
    )}. Summary in English: ${baseExplanation.englishSource.fullSummary}`;

    const chatRes = await callSarvamChatExplanationApi(systemPrompt, userPrompt);
    const [whyRes, idRes, uncRes, actRes, sumRes] = await runWithConcurrencyLimit(
      [
        () => callSarvamTranslateApi(baseExplanation.englishSource.whyConfusing, language),
        () => callSarvamTranslateApi(baseExplanation.englishSource.whatIsIdentified, language),
        () => callSarvamTranslateApi(baseExplanation.englishSource.whatRemainsUncertain, language),
        () => callSarvamTranslateApi(baseExplanation.englishSource.recommendedAction, language),
        () => callSarvamTranslateApi(baseExplanation.englishSource.fullSummary, language),
      ],
      3
    );

    const fieldStatuses: Record<string, 'LIVE_SARVAM' | 'LOCAL_FALLBACK'> = {
      whyConfusing: whyRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
      whatIsIdentified: idRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
      whatRemainsUncertain: uncRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
      recommendedAction: actRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
      fullSummary: chatRes.content || sumRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
    };

    const liveCount = Object.values(fieldStatuses).filter((s) => s === 'LIVE_SARVAM').length;
    const totalCount = Object.keys(fieldStatuses).length;

    if (liveCount > 0) {
      const allSucceeded = liveCount === totalCount;
      const overallStatus: SarvamRuntimeStatus = allSucceeded ? 'LIVE_SARVAM' : 'PARTIAL_SARVAM';
      const overallMode = allSucceeded ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK';
      const liveExp = buildGroundedMerchantExplanation(
        txn,
        language,
        {
          whyConfusing: whyRes.translatedText || baseExplanation.localizedExplanation.whyConfusing,
          whatIsIdentified:
            idRes.translatedText || baseExplanation.localizedExplanation.whatIsIdentified,
          whatRemainsUncertain:
            uncRes.translatedText || baseExplanation.localizedExplanation.whatRemainsUncertain,
          recommendedAction:
            actRes.translatedText || baseExplanation.localizedExplanation.recommendedAction,
          fullSummary:
            chatRes.content ||
            sumRes.translatedText ||
            baseExplanation.localizedExplanation.fullSummary,
        },
        overallMode,
        overallStatus
      );
      liveExp.sarvamMeta.fieldStatuses = fieldStatuses;
      if (!allSucceeded) {
        liveExp.sarvamMeta.mode = 'PARTIAL_SARVAM_API';
      }
      res.json(liveExp);
      return;
    } else {
      const fallbackWithReason = buildGroundedMerchantExplanation(
        txn,
        language,
        undefined,
        'LOCAL_FALLBACK',
        chatRes.status,
        chatRes.error || sumRes.error
      );
      fallbackWithReason.sarvamMeta.fieldStatuses = fieldStatuses;
      res.json(fallbackWithReason);
      return;
    }
  }

  res.json(baseExplanation);
};
app.post('/api/language/merchant-explanation', handleMerchantExplanation);
app.post('/api/sarvam/merchant-explanation', handleMerchantExplanation);

const handleCancellationExplanation = async (req: express.Request, res: express.Response) => {
  const { commitmentId, language = 'hi-IN' } = req.body as {
    commitmentId: string;
    language?: LanguageCode;
  };
  const state = computeCurrentState();
  const playbook =
    state.playbooks.find((p) => p.commitmentId === commitmentId) || state.playbooks[0];

  if (!playbook) {
    res.status(404).json({ error: 'Cancellation playbook not found' });
    return;
  }

  const baseCancel = buildGroundedCancellationExplanation(playbook, language);

  if (isSarvamConfigured() && language !== 'en-IN') {
    const enPb = baseCancel.englishPlaybook;
    const translatedMap: Record<string, string> = {};
    const fieldStatuses: Record<string, 'LIVE_SARVAM' | 'LOCAL_FALLBACK'> = {};
    const taskFactories: Array<() => Promise<void>> = [];

    const registerFieldTask = (fieldKey: string, textToTranslate: string) => {
      taskFactories.push(async () => {
        const r = await callSarvamTranslateApi(textToTranslate, language);
        if (r.translatedText) {
          translatedMap[fieldKey] = r.translatedText;
          fieldStatuses[fieldKey] = 'LIVE_SARVAM';
        } else {
          fieldStatuses[fieldKey] = 'LOCAL_FALLBACK';
        }
      });
    };

    if (enPb.contractualWarning) {
      registerFieldTask('contractualWarning', enPb.contractualWarning);
    }

    registerFieldTask('layerATitle', enPb.layerATitle);
    registerFieldTask('layerADescription', enPb.layerADescription);
    registerFieldTask('layerBTitle', enPb.layerBTitle);
    registerFieldTask('layerBDescription', enPb.layerBDescription);
    registerFieldTask('confirmationExplanation', enPb.confirmationExplanation);
    registerFieldTask('statusMessage', enPb.statusMessage);

    enPb.layerASteps.forEach((step, idx) => {
      registerFieldTask(`layerA_title_${idx}`, step.title);
      registerFieldTask(`layerA_inst_${idx}`, step.instruction);
    });

    enPb.layerBSteps.forEach((step, idx) => {
      registerFieldTask(`layerB_title_${idx}`, step.title);
      registerFieldTask(`layerB_inst_${idx}`, step.instruction);
    });

    enPb.safetyAndEscalationNotes.forEach((note, idx) => {
      registerFieldTask(`escalation_${idx}`, note);
    });

    await runWithConcurrencyLimit(taskFactories, 3);

    const liveCount = Object.values(fieldStatuses).filter((s) => s === 'LIVE_SARVAM').length;
    const totalCount = Object.keys(fieldStatuses).length;

    if (liveCount > 0) {
      const allSucceeded = liveCount === totalCount;
      const overallStatus: SarvamRuntimeStatus = allSucceeded ? 'LIVE_SARVAM' : 'PARTIAL_SARVAM';
      const liveCancel = buildGroundedCancellationExplanation(
        playbook,
        language,
        translatedMap,
        allSucceeded ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
        overallStatus
      );
      liveCancel.sarvamMeta.fieldStatuses = fieldStatuses;
      if (!allSucceeded) {
        liveCancel.sarvamMeta.mode = 'PARTIAL_SARVAM_API';
      }
      res.json(liveCancel);
      return;
    } else {
      const fallbackCancel = buildGroundedCancellationExplanation(
        playbook,
        language,
        undefined,
        'LOCAL_FALLBACK',
        sarvamLastRequestStatus,
        sarvamLastError || 'Sarvam translation failed'
      );
      fallbackCancel.sarvamMeta.fieldStatuses = fieldStatuses;
      res.json(fallbackCancel);
      return;
    }
  }

  res.json(baseCancel);
};
app.post('/api/language/cancellation-explanation', handleCancellationExplanation);
app.post('/api/sarvam/cancellation-explanation', handleCancellationExplanation);

const handleFinancialAlertExplanation = async (req: express.Request, res: express.Response) => {
  const { alertId, language = 'hi-IN' } = req.body as {
    alertId: string;
    language?: LanguageCode;
  };
  const state = computeCurrentState();
  const alert = state.alerts.find((a) => a.id === alertId) || state.alerts[0];

  if (!alert) {
    res.status(404).json({ error: 'Alert not found' });
    return;
  }

  const baseAlert = buildGroundedAlertExplanation(alert, language);
  if (isSarvamConfigured() && language !== 'en-IN') {
    const [titleRes, expRes, actRes] = await runWithConcurrencyLimit(
      [
        () => callSarvamTranslateApi(alert.title, language),
        () => callSarvamTranslateApi(alert.description, language),
        () => callSarvamTranslateApi(alert.suggestedAction, language),
      ],
      3
    );

    const fieldStatuses: Record<string, 'LIVE_SARVAM' | 'LOCAL_FALLBACK'> = {
      title: titleRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
      explanation: expRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
      action: actRes.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
    };
    const liveCount = Object.values(fieldStatuses).filter((s) => s === 'LIVE_SARVAM').length;

    if (liveCount > 0) {
      const allSucceeded = liveCount === 3;
      const alertResp = buildGroundedAlertExplanation(
        alert,
        language,
        {
          title: titleRes.translatedText || undefined,
          explanation: expRes.translatedText || undefined,
          action: actRes.translatedText || undefined,
        },
        allSucceeded ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
        allSucceeded ? 'LIVE_SARVAM' : 'PARTIAL_SARVAM'
      );
      alertResp.sarvamMeta.fieldStatuses = fieldStatuses;
      if (!allSucceeded) {
        alertResp.sarvamMeta.mode = 'PARTIAL_SARVAM_API';
      }
      res.json(alertResp);
      return;
    }
  }

  res.json(baseAlert);
};
app.post('/api/language/financial-alert', handleFinancialAlertExplanation);
app.post('/api/sarvam/financial-alert', handleFinancialAlertExplanation);

// Contextual Sarvam Bhasha Financial Q&A (Section 11 & 15)
const handleContextualAsk = async (req: express.Request, res: express.Response) => {
  const {
    commitmentId = 'CMT-STREAMBOX',
    question = 'Why did this recurring charge happen and how does it compare with my mandate and invoice?',
    language = 'hi-IN',
  } = (req.body || {}) as {
    commitmentId?: string;
    question?: string;
    language?: LanguageCode;
  };

  const state = computeCurrentState();
  const cmt =
    state.commitments.find((c) => c.id === commitmentId) || state.commitments[0];
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }

  const mandate =
    mandatesStore.find(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    ) || null;
  const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
  const reconciliation =
    state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
  const session = state.sessions.find((s) => s.commitmentId === cmt.id) || null;

  // Construct deterministic grounded English answer from verified commitment/mandate/invoice facts,
  // then translate into the target Indian language via Sarvam Translate (sarvam-translate:v1).
  const baseResponse = buildGroundedContextualQuestionResponse({
    commitment: cmt,
    question,
    language,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation,
    session,
  });

  if (isSarvamConfigured() && language !== 'en-IN') {
    const transRes = await callSarvamTranslateApi(baseResponse.englishAnswer, language);
    if (transRes.translatedText) {
      res.json(
        buildGroundedContextualQuestionResponse({
          commitment: cmt,
          question,
          language,
          transactions: state.transactions,
          mandate,
          serviceTerms,
          reconciliation,
          session,
          sarvamStatus: 'LIVE_SARVAM',
          sarvamMode: 'LIVE_SARVAM_API',
          liveLocalizedAnswer: transRes.translatedText,
        })
      );
      return;
    }
    res.json(
      buildGroundedContextualQuestionResponse({
        commitment: cmt,
        question,
        language,
        transactions: state.transactions,
        mandate,
        serviceTerms,
        reconciliation,
        session,
        sarvamStatus: transRes.status,
        sarvamMode: 'CURATED_VERIFIED_FALLBACK',
        fallbackReason: transRes.error || 'Sarvam Translate request failed; using curated grounded template.',
      })
    );
    return;
  }

  res.json(baseResponse);
};
app.post('/api/sarvam/ask', handleContextualAsk);
app.post('/api/language/ask', handleContextualAsk);

const handleTranslate = async (req: express.Request, res: express.Response) => {
  const { text, targetLanguage = 'hi-IN', model = 'sarvam-translate:v1' } = req.body as {
    text: string;
    targetLanguage?: LanguageCode;
    model?: 'sarvam-translate:v1' | 'mayura:v1';
  };
  if (!text) {
    res.status(400).json({ error: 'Missing text parameter' });
    return;
  }
  const result = await callSarvamTranslateApi(text, targetLanguage, model);
  res.json({
    sourceText: text,
    targetLanguage,
    model,
    mode: result.translatedText ? 'LIVE_SARVAM' : 'LOCAL_FALLBACK',
    status: result.status,
    translatedText: result.translatedText || text,
    error: result.error,
  });
};
app.post('/api/language/translate', handleTranslate);
app.post('/api/sarvam/translate', handleTranslate);

app.post('/api/sarvam/test', async (req, res) => {
  const { language = 'hi-IN' } = (req.body || {}) as { language?: LanguageCode };
  const probeText =
    'Your bank statement shows RAZORPAY*STREAMBOX because Razorpay processed this ₹499 UPI AutoPay debit on behalf of StreamBox.';
  const result = await callSarvamTranslateApi(probeText, language);
  res.json({
    configured: isSarvamConfigured(),
    status: getEffectiveSarvamStatus(),
    lastSuccessfulRequest: sarvamLastSuccessfulRequest,
    lastError: sarvamLastError,
    probeSource: probeText,
    probeTranslated: result.translatedText,
    chatModel: SARVAM_CHAT_MODEL,
    translationModel: SARVAM_TRANSLATION_MODEL,
  });
});

async function verifySarvamOnStartupAsync() {
  if (!isSarvamConfigured()) return;
  await callSarvamTranslateApi(
    'DebitLens verified recurring payment for StreamBox.',
    'hi-IN'
  );
}
if (process.env.DEBITLENS_SKIP_LISTEN !== '1') {
  verifySarvamOnStartupAsync();
}

// ============================================================================
// REST API ENDPOINTS — CORE DEBITLENS DASHBOARD, COMMITMENTS, TRANSACTIONS
// ============================================================================
app.get('/api/state', (_req, res) => {
  const state = computeCurrentState();
  res.json(state);
});

app.get('/api/dashboard/summary', (_req, res) => {
  const state = computeCurrentState();
  const activeCommitments = state.commitments.filter(
    (c) => c.status !== 'CANCELLED_USER_CONFIRMED' && c.verificationStatus !== 'REJECTED'
  );

  const primaryCurrency = 'INR';
  const totalsByCurrency: Record<
    string,
    {
      currency: string;
      monthlyRecurringSpend: number;
      annualCommitmentTotal: number;
      discretionaryAnnual: number;
      obligationAnnual: number;
      activeCommitmentsCount: number;
    }
  > = {};

  for (const c of activeCommitments) {
    const curr = (c.currency || 'INR').trim().toUpperCase();
    if (!totalsByCurrency[curr]) {
      totalsByCurrency[curr] = {
        currency: curr,
        monthlyRecurringSpend: 0,
        annualCommitmentTotal: 0,
        discretionaryAnnual: 0,
        obligationAnnual: 0,
        activeCommitmentsCount: 0,
      };
    }
    const bucket = totalsByCurrency[curr];
    bucket.monthlyRecurringSpend = Number(
      (bucket.monthlyRecurringSpend + c.monthlyEquivalent).toFixed(2)
    );
    bucket.annualCommitmentTotal = Number(
      (bucket.annualCommitmentTotal + c.annualisedAmount).toFixed(2)
    );
    if (c.isFinancialObligation) {
      bucket.obligationAnnual = Number(
        (bucket.obligationAnnual + c.annualisedAmount).toFixed(2)
      );
    } else {
      bucket.discretionaryAnnual = Number(
        (bucket.discretionaryAnnual + c.annualisedAmount).toFixed(2)
      );
    }
    bucket.activeCommitmentsCount += 1;
  }

  const primaryBucket = totalsByCurrency[primaryCurrency] || {
    currency: primaryCurrency,
    monthlyRecurringSpend: 0,
    annualCommitmentTotal: 0,
    discretionaryAnnual: 0,
    obligationAnnual: 0,
    activeCommitmentsCount: 0,
  };

  const priceChangeAlertsCount = state.alerts.filter(
    (a) => a.alertType === 'PRICE_INCREASE' && a.status === 'OPEN'
  ).length;
  const unresolvedTxnsCount = state.transactions.filter(
    (t) => t.direction === 'DEBIT' && t.resolutionStatus === 'UNRESOLVED'
  ).length;
  const reviewRequiredCount =
    state.commitments.filter(
      (c) =>
        c.status === 'NEEDS_REVIEW' ||
        c.status === 'RESUMED_REVIEW' ||
        c.status === 'POST_CANCEL_ALERT' ||
        c.entityClass === 'RECURRING_CANDIDATE'
    ).length + unresolvedTxnsCount;

  const currencySummaries = Object.values(totalsByCurrency);

  res.json({
    primaryCurrency,
    monthlyRecurringSpend: primaryBucket.monthlyRecurringSpend,
    annualCommitmentTotal: primaryBucket.annualCommitmentTotal,
    discretionaryAnnual: primaryBucket.discretionaryAnnual,
    obligationAnnual: primaryBucket.obligationAnnual,
    totalsByCurrency,
    currencySummaries,
    isMultiCurrency: currencySummaries.length > 1,
    activeCommitmentsCount: activeCommitments.length,
    totalCommitmentsCount: state.commitments.length,
    upcomingPaymentsCount: activeCommitments.filter((c) => Boolean(c.nextExpectedDate)).length,
    priceChangeAlertsCount,
    reviewRequiredCount,
    totalAlertsCount: state.alerts.filter((a) => a.status === 'OPEN').length,
    unresolvedTransactionsCount: unresolvedTxnsCount,
  });
});

app.get('/api/dashboard/monthly-trend', (req, res) => {
  const state = computeCurrentState();
  const targetCurrency = String(req.query.currency || 'INR')
    .trim()
    .toUpperCase();
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const trend = months.map((m) => {
    const monthTxns = state.transactions.filter(
      (t) =>
        t.direction === 'DEBIT' &&
        t.transactionDate.startsWith(m) &&
        (t.currency || 'INR').trim().toUpperCase() === targetCurrency
    );
    const subscriptions = monthTxns
      .filter(
        (t) =>
          t.commitmentId &&
          !['CMT-BAJAJEMI', 'CMT-MAXLIFE', 'CMT-BESCOM'].includes(t.commitmentId)
      )
      .reduce((s, t) => s + t.amount, 0);
    const obligations = monthTxns
      .filter(
        (t) =>
          t.commitmentId &&
          ['CMT-BAJAJEMI', 'CMT-MAXLIFE', 'CMT-BESCOM'].includes(t.commitmentId)
      )
      .reduce((s, t) => s + t.amount, 0);
    const unresolved = monthTxns
      .filter((t) => t.resolutionStatus === 'UNRESOLVED')
      .reduce((s, t) => s + t.amount, 0);
    return {
      month: m,
      currency: targetCurrency,
      subscriptions: Number(subscriptions.toFixed(2)),
      obligations: Number(obligations.toFixed(2)),
      unresolved: Number(unresolved.toFixed(2)),
      total: Number((subscriptions + obligations + unresolved).toFixed(2)),
    };
  });
  res.json(trend);
});

app.get('/api/dashboard/upcoming', (_req, res) => {
  const state = computeCurrentState();
  const upcoming = state.commitments
    .filter((c) => c.nextExpectedDate && c.status !== 'CANCELLED_USER_CONFIRMED')
    .sort((a, b) => Date.parse(a.nextExpectedDate!) - Date.parse(b.nextExpectedDate!));
  res.json(upcoming);
});

app.get('/api/transactions', (_req, res) => {
  const state = computeCurrentState();
  res.json(state.transactions);
});

app.get('/api/transactions/:id', (req, res) => {
  const state = computeCurrentState();
  const txn = state.transactions.find((t) => t.id === req.params.id);
  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  res.json(txn);
});

app.get('/api/merchants', (_req, res) => {
  res.json({
    merchants: MERCHANT_CATALOGUE,
    processors: PAYMENT_PROCESSORS,
  });
});

function executeAuthoritativeMerchantConfirmation(params: {
  investigationId?: string;
  transactionId?: string;
  merchantId?: string;
  rawDescription?: string;
}): RouteMutationResult {
  const { investigationId, transactionId, merchantId } = params;
  if (!merchantId || typeof merchantId !== 'string' || !merchantId.trim()) {
    return {
      errorStatus: 400,
      errorBody: { error: 'merchantId is required for merchant confirmation.' },
    };
  }
  const cleanMerchantId = merchantId.trim();
  const merch = MERCHANT_CATALOGUE.find((m) => m.id === cleanMerchantId);
  if (!merch) {
    return {
      errorStatus: 400,
      errorBody: {
        error: `Invalid merchantId "${cleanMerchantId}": not found in merchant catalogue.`,
      },
    };
  }

  // Reject global descriptor-only confirmation requests lacking a specific transactionId or investigationId
  if (
    (!investigationId || !String(investigationId).trim() || cleanMerchantId === investigationId) &&
    (!transactionId || !String(transactionId).trim())
  ) {
    return {
      errorStatus: 400,
      errorBody: {
        error:
          'Merchant confirmation must be scoped to a specific transactionId or investigationId; global descriptor-only overrides are not permitted.',
      },
    };
  }

  const state = computeCurrentState();
  let caseItem: UnrecognizedDebitCase | undefined;
  let txn = transactionId ? state.transactions.find((t) => t.id === transactionId) : undefined;

  if (investigationId && investigationId !== cleanMerchantId) {
    caseItem = investigationCasesStore.find((c) => c.id === investigationId);
    if (!caseItem) {
      return {
        errorStatus: 404,
        errorBody: { error: `Investigation case "${investigationId}" not found.` },
      };
    }
    if (transactionId && caseItem.transactionId !== transactionId) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `Transaction "${transactionId}" does not belong to investigation case "${caseItem.id}" (expected "${caseItem.transactionId}").`,
        },
      };
    }
    txn = state.transactions.find((t) => t.id === caseItem!.transactionId);
    if (!txn) {
      return {
        errorStatus: 404,
        errorBody: { error: `Associated transaction "${caseItem.transactionId}" not found.` },
      };
    }
  } else if (transactionId) {
    if (!txn) {
      return {
        errorStatus: 404,
        errorBody: { error: `Transaction "${transactionId}" not found.` },
      };
    }
    caseItem = investigationCasesStore.find((c) => c.transactionId === txn!.id);
    if (!caseItem) {
      caseItem = buildUnrecognizedDebitCase({
        transaction: txn,
        allTransactions: state.transactions,
        userMerchantOverrides,
        existingCases: investigationCasesStore,
      });
      investigationCasesStore.push(caseItem);
    }
  }

  if (!caseItem || !txn) {
    return {
      errorStatus: 404,
      errorBody: { error: 'Target investigation case or transaction could not be found.' },
    };
  }

  // Verify investigation state eligibility
  if (caseItem.status === 'CLOSED') {
    return {
      errorStatus: 400,
      errorBody: {
        error: `Cannot confirm merchant on CLOSED investigation case "${caseItem.id}". Reopen the case first.`,
      },
    };
  }
  if (
    caseItem.status === 'IDENTIFIED' &&
    caseItem.resolvedMerchantId === cleanMerchantId &&
    userMerchantOverrides[txn.id] === cleanMerchantId
  ) {
    return {
      errorStatus: 400,
      errorBody: {
        error: `Duplicate confirmation: merchant "${cleanMerchantId}" is already confirmed for transaction "${txn.id}" in investigation "${caseItem.id}".`,
      },
    };
  }
  if (
    caseItem.status === 'IDENTIFIED' &&
    caseItem.resolvedMerchantId &&
    caseItem.resolvedMerchantId !== cleanMerchantId
  ) {
    return {
      errorStatus: 400,
      errorBody: {
        error: `Conflicting confirmation: investigation "${caseItem.id}" is already confirmed for merchant "${caseItem.resolvedMerchantId}". Reopen the case before changing merchant attribution.`,
      },
    };
  }

  // Enforce candidate eligibility: merchantId MUST be an eligible candidate for this investigation and NEVER processor-only
  const matchingCandidate = caseItem.candidateMerchants?.find(
    (c) => (c.merchantId || c.candidateMerchantId) === cleanMerchantId
  );
  if (!matchingCandidate) {
    return {
      errorStatus: 400,
      errorBody: {
        error: `Merchant "${cleanMerchantId}" is not an eligible candidate for investigation case ${caseItem.id} (transaction ${txn.id}). Only evidence-backed candidate merchants for this record can be confirmed.`,
      },
    };
  }
  if (
    matchingCandidate.candidateType === 'PROCESSOR_RELATIONSHIP' ||
    matchingCandidate.isProcessorOnly
  ) {
    return {
      errorStatus: 400,
      errorBody: {
        error:
          'Processor-only contextual relationships cannot be directly confirmed as merchant matches without independent receipt or descriptor evidence.',
      },
    };
  }

  // Strictly scope user confirmation to the exact transaction ID (never global rawDescription)
  const previousResolutionStatus = txn.resolutionStatus;
  const nowIso = new Date().toISOString();
  userMerchantOverrides[txn.id] = cleanMerchantId;

  caseItem.resolvedMerchantId = cleanMerchantId;
  caseItem.resolutionSource = 'USER_CONFIRMED';
  caseItem.confirmedMerchantId = cleanMerchantId;
  caseItem.status = 'IDENTIFIED';
  caseItem.updatedAt = nowIso;
  if (!caseItem.actionsTaken) {
    caseItem.actionsTaken = [];
  }
  caseItem.actionsTaken.push({
    actionId: `ACT-${Date.now()}`,
    actionType: 'CONFIRM_MERCHANT',
    takenAt: nowIso,
    notes: `Confirmed transaction ${txn.id} ("${txn.rawDescription}") matches merchant ${merch.canonicalName} (${cleanMerchantId}).`,
    actor: 'USER',
  });

  const updatedState = computeCurrentState();
  const linkedCommitment = updatedState.commitments.find((c) =>
    c.supportingTransactionIds.includes(txn!.id)
  );

  const confirmationRecord: MerchantConfirmationRecord = {
    eventId: `MCONF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    transactionId: txn.id,
    investigationId: caseItem.id,
    merchantId: cleanMerchantId,
    commitmentId: linkedCommitment?.id || null,
    previousResolutionStatus,
    newResolutionStatus: 'USER_CONFIRMED',
    actor: 'USER_ACTION',
    timestamp: nowIso,
  };
  merchantConfirmationsStore.push(confirmationRecord);

  recordAuditEvent({
    commitmentId: linkedCommitment?.id || null,
    transactionId: txn.id,
    investigationId: caseItem.id,
    merchantId: cleanMerchantId,
    eventType: 'IDENTITY_MATCH_CONFIRMED',
    summary: `Investigation ${caseItem.id}: Confirmed transaction ${txn.id} ("${txn.rawDescription}") maps to ${merch.canonicalName} (${cleanMerchantId}).`,
    previousState: previousResolutionStatus,
    newState: cleanMerchantId,
    actor: 'USER_ACTION',
  });

  return {
    body: {
      message: `Transaction ${txn.id} confirmed for merchant ${merch.canonicalName} (${cleanMerchantId}).`,
      confirmation: confirmationRecord,
      case: caseItem,
      transactions: updatedState.transactions,
      commitments: updatedState.commitments,
    },
  };
}

const handleConfirmIdentityMatch = async (req: express.Request, res: express.Response) => {
  const { rawDescription, merchantId, transactionId, investigationId } = (req.body || {}) as {
    rawDescription?: string;
    merchantId?: string;
    transactionId?: string;
    investigationId?: string;
  };
  const paramId = req.params.id;
  // Support paramId being either an investigationId (INV-...), a transactionId (TXN-...), or a merchantId (MERCH-...)
  const resolvedInvId =
    investigationId || (paramId?.startsWith('INV-') ? paramId : undefined);
  const resolvedTxnId =
    transactionId || (paramId?.startsWith('TXN-') ? paramId : undefined);
  const resolvedMerchantId =
    merchantId || (paramId?.startsWith('MERCH-') ? paramId : paramId);

  await executeSerializedMutation(res, () =>
    executeAuthoritativeMerchantConfirmation({
      investigationId: resolvedInvId,
      transactionId: resolvedTxnId,
      merchantId: resolvedMerchantId,
      rawDescription,
    })
  );
};

app.post('/api/merchants/:id/confirm', handleConfirmIdentityMatch);
app.post('/api/identity-matches/:id/review', handleConfirmIdentityMatch);

app.get('/api/commitments', (_req, res) => {
  const state = computeCurrentState();
  res.json(state.commitments);
});

app.get('/api/commitments/:id', (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === req.params.id);
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }
  const supportingTransactions = state.transactions.filter((t) => t.commitmentId === cmt.id);
  const playbook = state.playbooks.find((p) => p.commitmentId === cmt.id);
  const session = state.sessions.find((s) => s.commitmentId === cmt.id);
  const mandate =
    mandatesStore.find(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    ) || null;
  const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
  const reconciliation =
    state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
  res.json({
    commitment: cmt,
    supportingTransactions,
    playbook,
    session,
    mandate,
    serviceTerms,
    reconciliation,
  });
});

// Section 3 & 15: Confirm RecurringCandidate -> Confirmed FinancialCommitment
app.post('/api/commitments/:id/confirm', async (req, res) => {
  const id = req.params.id;
  await executeSerializedMutation(res, () => {
    const prev = userCommitmentOverrides[id]?.verificationStatus || 'PENDING_REVIEW';
    userCommitmentOverrides[id] = {
      ...(userCommitmentOverrides[id] || {}),
      entityClass: 'FINANCIAL_COMMITMENT',
      verificationStatus: 'USER_CONFIRMED',
    };
    recordAuditEvent({
      commitmentId: id,
      eventType: 'CANDIDATE_CONFIRMED',
      summary: `User confirmed RecurringCandidate ${id} as a verified FinancialCommitment.`,
      previousState: prev,
      newState: 'USER_CONFIRMED',
    });
    const state = computeCurrentState();
    return {
      body: state.commitments.find((c) => c.id === id),
    };
  });
});

// Section 3 & 15: Reject RecurringCandidate
app.post('/api/commitments/:id/reject', async (req, res) => {
  const id = req.params.id;
  await executeSerializedMutation(res, () => {
    const prev = userCommitmentOverrides[id]?.verificationStatus || 'PENDING_REVIEW';
    userCommitmentOverrides[id] = {
      ...(userCommitmentOverrides[id] || {}),
      entityClass: 'RECURRING_CANDIDATE',
      verificationStatus: 'REJECTED',
    };
    recordAuditEvent({
      commitmentId: id,
      eventType: 'CANDIDATE_REJECTED',
      summary: `User rejected RecurringCandidate ${id} from confirmed commitments.`,
      previousState: prev,
      newState: 'REJECTED',
    });
    const state = computeCurrentState();
    return {
      body: state.commitments.find((c) => c.id === id),
    };
  });
});

// Section 15: Edit commitment fields (typicalAmount, expectedAmountMinor, recurrenceType, nextExpectedDate, lastUsedDate)
app.patch('/api/commitments/:id', async (req, res) => {
  const id = req.params.id;
  const {
    typicalAmount,
    expectedAmountMinor,
    recurrenceType,
    nextExpectedDate,
    lastUsedDate,
  } = (req.body || {}) as {
    typicalAmount?: number;
    expectedAmountMinor?: number;
    recurrenceType?: RecurrenceFrequency;
    nextExpectedDate?: string | null;
    lastUsedDate?: string | null;
  };

  await executeSerializedMutation(res, () => {
    const current = userCommitmentOverrides[id] || {};
    userCommitmentOverrides[id] = {
      ...current,
      ...(typicalAmount !== undefined ? { typicalAmountOverride: Number(typicalAmount) } : {}),
      ...(expectedAmountMinor !== undefined
        ? { expectedAmountMinorOverride: Number(expectedAmountMinor) }
        : {}),
      ...(recurrenceType !== undefined ? { recurrenceTypeOverride: recurrenceType } : {}),
      ...(nextExpectedDate !== undefined ? { nextExpectedDateOverride: nextExpectedDate } : {}),
      ...(lastUsedDate !== undefined ? { lastUsedDate } : {}),
    };

    recordAuditEvent({
      commitmentId: id,
      eventType: 'CANDIDATE_CONFIRMED',
      summary: `Updated commitment parameters for ${id}.`,
      previousState: null,
      newState: JSON.stringify(req.body),
    });

    const state = computeCurrentState();
    return {
      body: state.commitments.find((c) => c.id === id),
    };
  });
});

app.patch('/api/commitments/:id/usage', async (req, res) => {
  const { lastUsedDate } = req.body as { lastUsedDate: string | null };
  const id = req.params.id;
  await executeSerializedMutation(res, () => {
    userCommitmentOverrides[id] = {
      ...(userCommitmentOverrides[id] || {}),
      lastUsedDate,
    };
    const state = computeCurrentState();
    return {
      body: state.commitments.find((c) => c.id === id),
    };
  });
});

// ============================================================================
// REST API ENDPOINTS — MANDATES, SERVICE TERMS & THREE-WAY RECONCILIATION
// ============================================================================
app.get('/api/mandates', (_req, res) => {
  res.json(mandatesStore);
});

app.post('/api/mandates/import', async (req, res) => {
  const { mandates, mandate } = (req.body || {}) as {
    mandates?: Partial<MandateRecord>[];
    mandate?: Partial<MandateRecord>;
  };
  const incoming = Array.isArray(mandates) ? mandates : mandate ? [mandate] : [];
  if (incoming.length === 0) {
    res.status(400).json({ error: 'Provide mandate or mandates array to import.' });
    return;
  }

  await executeSerializedMutation(res, () => {
    const totalRows = incoming.length;
    let newRecords = 0;
    let exactDuplicates = 0;
    let conflictingDuplicates = 0;
    let existingPreserved = 0;
    let acceptedRows = 0;
    let rejectedRows = 0;
    let incompleteRecords = 0;
    const fieldsRequiringVerification: string[] = [];

    for (const item of incoming) {
      if (!item.mandateReference) {
        rejectedRows++;
        continue;
      }
      const cleanRef = String(item.mandateReference).trim();
      if (!cleanRef) {
        rejectedRows++;
        continue;
      }

      const rawCurr = item.currency !== undefined && item.currency !== null ? String(item.currency).trim() : 'INR';
      const validCurrency = normalizeCurrencyCode(rawCurr || 'INR');
      if (!validCurrency) {
        rejectedRows++;
        continue;
      }

      // Strictly DO NOT default missing financial details!
      let maxMinor: number | null = null;
      let maxAmount: number | null = null;
      if (item.maxAmountMinor !== undefined && item.maxAmountMinor !== null) {
        const num = Number(item.maxAmountMinor);
        if (Number.isSafeInteger(num) && num > 0) {
          maxMinor = num;
          maxAmount = fromMinorUnits(maxMinor, validCurrency);
        }
      } else if (item.maxAmount !== undefined && item.maxAmount !== null && String(item.maxAmount) !== '') {
        const parsed = parseStrictAmount(item.maxAmount);
        if (parsed !== null && parsed > 0) {
          maxMinor = toMinorUnits(parsed, validCurrency);
          maxAmount = parsed;
        }
      }

      const VALID_RAILS: PaymentRailType[] = [
        'UPI_AUTOPAY',
        'CARD_EMANDATE',
        'ENACH_NACH',
        'GOOGLE_PLAY',
        'APPLE_APP_STORE',
        'DIRECT_MERCHANT',
        'BANK_STANDING_INSTRUCTION',
        'UPI_ONE_TIME',
        'CARD_ONE_TIME',
      ];
      const paymentRail: PaymentRailType | 'UNKNOWN' =
        VALID_RAILS.includes(item.paymentRail as PaymentRailType)
          ? (item.paymentRail as PaymentRailType)
          : 'UNKNOWN';

      const VALID_FREQUENCIES: RecurrenceFrequency[] = [
        'WEEKLY',
        'FORTNIGHTLY',
        'MONTHLY',
        'QUARTERLY',
        'HALF_YEARLY',
        'YEARLY',
        'IRREGULAR',
        'RESUMED',
        'TRIAL_CONVERTED',
        'ONE_TIME',
      ];
      const frequency: RecurrenceFrequency | 'UNKNOWN' =
        VALID_FREQUENCIES.includes(item.frequency as RecurrenceFrequency)
          ? (item.frequency as RecurrenceFrequency)
          : 'UNKNOWN';

      const isValidCalendarDate = (d: string | null): boolean => {
        if (!d) return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
        const [year, month, day] = d.split('-').map(Number);
        if (month < 1 || month > 12 || day < 1 || day > 31) return false;
        const date = new Date(Date.UTC(year, month - 1, day));
        return (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month - 1 &&
          date.getUTCDate() === day
        );
      };

      const rawStartDate = item.startDate ? String(item.startDate).trim() : null;
      const rawEndDate = item.endDate ? String(item.endDate).trim() : null;
      const startDate = isValidCalendarDate(rawStartDate) ? rawStartDate : null;
      const endDate = isValidCalendarDate(rawEndDate) ? rawEndDate : null;

      const VALID_STATUSES = ['ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED'];
      const mandateStatus = VALID_STATUSES.includes(item.mandateStatus as any)
        ? item.mandateStatus!
        : 'UNKNOWN';

      const missingFields: string[] = [];
      if (maxMinor === null) missingFields.push('maxAmount');
      if (paymentRail === 'UNKNOWN') missingFields.push('paymentRail');
      if (frequency === 'UNKNOWN') missingFields.push('frequency');
      if (!startDate) missingFields.push('startDate');
      if (mandateStatus === 'UNKNOWN' || mandateStatus === 'PENDING_VERIFICATION') {
        missingFields.push('mandateStatus');
      }

      const isIncomplete = missingFields.length > 0;
      if (isIncomplete) {
        incompleteRecords++;
        missingFields.forEach((f) => {
          if (!fieldsRequiringVerification.includes(f)) {
            fieldsRequiringVerification.push(f);
          }
        });
      }

      const newMandate: MandateRecord = {
        id: item.id || `MND-${Date.now()}-${acceptedRows}`,
        mandateReference: cleanRef,
        commitmentId: item.commitmentId ?? null,
        merchantId: item.merchantId ?? null,
        merchantName: item.merchantName || 'Unresolved Merchant',
        paymentRail,
        maxAmountMinor: maxMinor,
        maxAmount,
        currency: validCurrency,
        frequency,
        startDate,
        endDate,
        mandateStatus,
        sourceType: 'USER_IMPORTED',
        updatedAt: new Date().toISOString(),
        isIncomplete,
        missingFields,
      };

      const existingIdx = mandatesStore.findIndex(
        (m) =>
          m.id === newMandate.id ||
          m.mandateReference === newMandate.mandateReference ||
          (newMandate.commitmentId && m.commitmentId === newMandate.commitmentId)
      );
      if (existingIdx >= 0) {
        const existing = mandatesStore[existingIdx];
        const isExact =
          existing.mandateReference === newMandate.mandateReference &&
          existing.maxAmountMinor === newMandate.maxAmountMinor &&
          existing.currency === newMandate.currency &&
          existing.frequency === newMandate.frequency &&
          existing.paymentRail === newMandate.paymentRail &&
          existing.startDate === newMandate.startDate &&
          existing.endDate === newMandate.endDate &&
          existing.mandateStatus === newMandate.mandateStatus;

        if (isExact) {
          exactDuplicates++;
        } else {
          conflictingDuplicates++;
        }

        // Do NOT overwrite a complete existing mandate with an incomplete duplicate row!
        const existingIncomplete =
          (existing as any).isIncomplete ||
          (existing.missingFields && existing.missingFields.length > 0);
        const newIncomplete =
          (newMandate as any).isIncomplete ||
          (newMandate.missingFields && newMandate.missingFields.length > 0);
        if (!existingIncomplete && newIncomplete) {
          existingPreserved++;
        } else {
          mandatesStore[existingIdx] = newMandate;
        }
      } else {
        newRecords++;
        mandatesStore.push(newMandate);
      }
      acceptedRows++;
    }

    const state = computeCurrentState();

    return {
      body: {
        newRecords,
        exactDuplicates,
        conflictingDuplicates,
        invalidRecords: rejectedRows,
        incompleteRecords,
        existingPreserved,
        totalRows,
        acceptedRows,
        rejectedRows,
        duplicateRecords: exactDuplicates + conflictingDuplicates,
        fieldsRequiringVerification,
        importedCount: acceptedRows,
        mandates: mandatesStore,
        reconciliationFindings: state.reconciliationFindings,
      },
    };
  });
});

app.get('/api/service-terms', (_req, res) => {
  res.json(serviceTermsStore);
});

app.get('/api/commitments/:id/service-terms', (req, res) => {
  const doc = serviceTermsStore.find((s) => s.commitmentId === req.params.id) || null;
  res.json(doc);
});

const handleUpsertServiceDocument = async (req: express.Request, res: express.Response) => {
  const {
    commitmentId,
    merchantName,
    serviceName,
    rawText,
    expectedAmount,
    expectedAmountMinor,
    currency,
    billingFrequency,
    trialEndDate,
    renewalDate,
    cancellationNoticeDays,
    userVerified,
  } = (req.body || {}) as {
    commitmentId: string;
    merchantName?: string;
    serviceName?: string;
    rawText?: string;
    expectedAmount?: number | null;
    expectedAmountMinor?: number | null;
    currency?: string;
    billingFrequency?: RecurrenceFrequency;
    trialEndDate?: string | null;
    renewalDate?: string | null;
    cancellationNoticeDays?: number | null;
    userVerified?: boolean;
  };

  if (!commitmentId) {
    res.status(400).json({ error: 'commitmentId is required' });
    return;
  }

  await executeSerializedMutation(res, () => {
    const stateBefore = computeCurrentState();
    const targetCmt = stateBefore.commitments.find((c) => c.id === commitmentId);
    const existingDoc = serviceTermsStore.find((s) => s.commitmentId === commitmentId) || null;

    if (currency !== undefined && currency !== null && !isValidCurrencyCode(currency)) {
      return {
        errorStatus: 400,
        errorBody: { error: `Invalid ISO 4217 currency code "${currency}".` },
      };
    }

    let docRecord: ServiceTermsRecord;
    if (rawText && rawText.trim().length > 0) {
      // Pasted invoice text defaults to userVerified = false until explicitly confirmed by the user
      const isVerified = userVerified === true;
      docRecord = extractServiceTermsFromText({
        commitmentId,
        merchantName: merchantName || targetCmt?.merchantName,
        serviceName: serviceName || targetCmt?.serviceName,
        rawText,
        documentSource: 'PASTED_INVOICE_TEXT',
        userVerified: isVerified,
      });
      if (currency) {
        docRecord.currency = normalizeCurrencyCode(currency)!;
      }
      if (expectedAmountMinor !== undefined || expectedAmount !== undefined) {
        if (expectedAmountMinor === null || expectedAmount === null) {
          docRecord.expectedAmountMinor = null;
          docRecord.expectedAmount = null;
        } else {
          const minor =
            expectedAmountMinor !== undefined
              ? Number(expectedAmountMinor)
              : toMinorUnits(Number(expectedAmount), docRecord.currency);
          docRecord.expectedAmountMinor = minor;
          docRecord.expectedAmount = fromMinorUnits(minor, docRecord.currency);
        }
      }
      if (billingFrequency) {
        docRecord.billingFrequency = billingFrequency;
      }
      docRecord.sourceType = 'USER_ENTERED';
      docRecord.userVerified = isVerified;
      docRecord.extractedFields = docRecord.extractedFields.map((f) => ({
        ...f,
        userVerified: isVerified,
      }));
    } else if (
      existingDoc &&
      expectedAmount === undefined &&
      expectedAmountMinor === undefined &&
      userVerified !== undefined
    ) {
      // Explicit user confirmation / verification toggle of an already-extracted document
      const isVerified = Boolean(userVerified);
      docRecord = {
        ...existingDoc,
        currency: currency ? normalizeCurrencyCode(currency)! : existingDoc.currency,
        billingFrequency: billingFrequency || existingDoc.billingFrequency,
        userVerified: isVerified,
        extractedFields: existingDoc.extractedFields.map((f) => ({
          ...f,
          userVerified: isVerified,
        })),
      };
    } else {
      const isVerified = userVerified !== undefined ? Boolean(userVerified) : true;
      const effectiveCurrency = normalizeCurrencyCode(
        currency || existingDoc?.currency || targetCmt?.currency || 'INR'
      )!;
      const minorLabel = getMinorUnitLabel(effectiveCurrency);
      const minor =
        expectedAmountMinor !== undefined && expectedAmountMinor !== null
          ? Number(expectedAmountMinor)
          : expectedAmount !== undefined && expectedAmount !== null
          ? toMinorUnits(Number(expectedAmount), effectiveCurrency)
          : existingDoc?.expectedAmountMinor ?? null;
      const major = minor !== null ? fromMinorUnits(minor, effectiveCurrency) : null;
      docRecord = {
        id: existingDoc?.id || `DOC-${commitmentId}-${Date.now()}`,
        commitmentId,
        merchantName:
          merchantName || targetCmt?.merchantName || existingDoc?.merchantName || 'Merchant',
        serviceName:
          serviceName || targetCmt?.serviceName || existingDoc?.serviceName || 'Service Plan',
        expectedAmountMinor: minor,
        expectedAmount: major,
        currency: effectiveCurrency,
        billingFrequency:
          billingFrequency || existingDoc?.billingFrequency || targetCmt?.recurrenceType || 'MONTHLY',
        trialEndDate: trialEndDate ?? existingDoc?.trialEndDate ?? null,
        renewalDate: renewalDate ?? existingDoc?.renewalDate ?? null,
        cancellationNoticeDays:
          cancellationNoticeDays ?? existingDoc?.cancellationNoticeDays ?? null,
        documentSource: 'MANUAL_ENTRY',
        sourceType: 'USER_ENTERED',
        rawDocumentText: `Manual Service Terms Entry for ${
          serviceName || targetCmt?.serviceName || 'Service Plan'
        }: Expected billing ${
          minor !== null ? `${effectiveCurrency} ${major} (${minor} ${minorLabel})` : 'UNAVAILABLE'
        } per ${billingFrequency || 'MONTHLY'}.`,
        extractionConfidence: minor !== null ? 100 : 0,
        extractedFields: [
          {
            fieldName: 'expectedAmount',
            extractedValue:
              minor !== null
                ? `${effectiveCurrency} ${major} (${minor} ${minorLabel})`
                : 'UNAVAILABLE',
            confidence: minor !== null ? 100 : 0,
            sourceSnippet: 'Manual structured input',
            userVerified: isVerified,
          },
          {
            fieldName: 'billingFrequency',
            extractedValue:
              billingFrequency ||
              existingDoc?.billingFrequency ||
              targetCmt?.recurrenceType ||
              'MONTHLY',
            confidence: 100,
            sourceSnippet: 'Manual structured input',
            userVerified: isVerified,
          },
        ],
        userVerified: isVerified,
        createdAt: new Date().toISOString(),
      };
    }

    const existingIdx = serviceTermsStore.findIndex((s) => s.commitmentId === commitmentId);
    if (existingIdx >= 0) {
      serviceTermsStore[existingIdx] = docRecord;
    } else {
      serviceTermsStore.push(docRecord);
    }

    recordAuditEvent({
      commitmentId,
      eventType: 'SERVICE_TERMS_ATTACHED',
      summary: `${
        docRecord.userVerified ? 'Verified' : 'Extracted (pending user confirmation)'
      } service terms ${docRecord.id} for ${docRecord.serviceName} (Expected ${
        docRecord.expectedAmount !== null
          ? formatCurrency(docRecord.expectedAmount, docRecord.currency)
          : 'UNAVAILABLE'
      }/${docRecord.billingFrequency}).`,
      previousState: existingDoc ? `userVerified=${existingDoc.userVerified}` : null,
      newState: `expectedAmountMinor=${docRecord.expectedAmountMinor}, currency=${docRecord.currency}, userVerified=${docRecord.userVerified}`,
    });

    const stateAfter = computeCurrentState();
    const reconciliation = stateAfter.reconciliationFindings.find(
      (r) => r.commitmentId === commitmentId
    );

    return {
      body: {
        serviceTerms: docRecord,
        reconciliation,
        allFindings: stateAfter.reconciliationFindings,
        persistenceStatus: { saved: true },
      },
    };
  });
};

app.post('/api/service-documents', handleUpsertServiceDocument);
app.post('/api/service-terms', handleUpsertServiceDocument);

app.get('/api/reconciliation/findings', (_req, res) => {
  const state = computeCurrentState();
  res.json(state.reconciliationFindings);
});

app.get('/api/commitments/:id/reconciliation', (req, res) => {
  const state = computeCurrentState();
  const finding = state.reconciliationFindings.find((r) => r.commitmentId === req.params.id);
  if (!finding) {
    res.status(404).json({ error: 'Reconciliation finding not found for commitment' });
    return;
  }
  res.json(finding);
});

app.post('/api/commitments/:id/reconcile', async (req, res) => {
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const finding = state.reconciliationFindings.find((r) => r.commitmentId === req.params.id);
    if (!finding) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Commitment not found for reconciliation' },
      };
    }
    recordAuditEvent({
      commitmentId: req.params.id,
      eventType: 'RECONCILIATION_EVALUATED',
      summary: `Evaluated three-way reconciliation for ${req.params.id}: ${finding.status}`,
      previousState: null,
      newState: finding.status,
      actor: 'SYSTEM_ENGINE',
    });
    return { body: finding };
  });
});

// ============================================================================
// REST API ENDPOINTS — EVIDENCE CASEBOOK & AUDIT TIMELINE (Section 9 & 15)
// ============================================================================
app.get('/api/commitments/:id/evidence', (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === req.params.id);
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }
  const mandate =
    mandatesStore.find(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    ) || null;
  const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
  const reconciliation =
    state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
  const session = state.sessions.find((s) => s.commitmentId === cmt.id) || null;

  const casebook = buildCommitmentEvidenceCasebook({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation,
    alerts: state.alerts,
    session,
    customEntries: customCasebookEntries,
    auditEvents: auditEventsStore,
  });

  res.json({
    commitmentId: cmt.id,
    confidenceBreakdown: cmt.confidenceBreakdown,
    supportingTransactions: state.transactions.filter((t) => t.commitmentId === cmt.id),
    connectedDescriptors: cmt.connectedDescriptors,
    entries: casebook.entries,
    auditEvents: casebook.auditEvents,
  });
});

app.post('/api/commitments/:id/evidence', async (req, res) => {
  const id = req.params.id;
  const {
    category = 'SERVICE_CANCELLATION_EVENT',
    title,
    description,
    sourceReference,
    amountMinor = null,
    evidenceDate = null,
  } = (req.body || {}) as {
    category?: EvidenceCasebookEntry['category'];
    title: string;
    description: string;
    sourceReference: string;
    amountMinor?: number | null;
    evidenceDate?: string | null;
  };

  if (!title || !description || !sourceReference) {
    res.status(400).json({ error: 'title, description, and sourceReference are required.' });
    return;
  }

  let parsedEvidenceDate: string | null = null;
  if (evidenceDate !== null && evidenceDate !== undefined && String(evidenceDate).trim() !== '') {
    parsedEvidenceDate = normalizeDateString(String(evidenceDate));
    if (!parsedEvidenceDate) {
      res.status(400).json({
        error: `Invalid evidenceDate "${evidenceDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
      });
      return;
    }
  }

  await executeSerializedMutation(res, () => {
    const preState = computeCurrentState();
    const targetCmt = preState.commitments.find((c) => c.id === id);
    if (!targetCmt) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Commitment not found' },
      };
    }

    const entry: EvidenceCasebookEntry = {
      id: `CB-USER-${Date.now()}`,
      commitmentId: id,
      timestamp: parsedEvidenceDate
        ? `${parsedEvidenceDate}T10:00:00Z`
        : new Date().toISOString(),
      eventDate: parsedEvidenceDate,
      category,
      title,
      description,
      sourceReference,
      amountMinor,
      currency: targetCmt.currency || 'INR',
      sourceType: 'USER_ENTERED',
      evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
      verificationStatus: 'USER_CONFIRMED',
      actor: 'USER_CASEBOOK_ATTACHMENT',
    };
    customCasebookEntries.push(entry);

    recordAuditEvent({
      commitmentId: id,
      eventType: 'EVIDENCE_ATTACHED',
      summary: `Attached evidence record "${title}" (Ref: ${sourceReference}${
        parsedEvidenceDate ? `, Date: ${parsedEvidenceDate}` : ''
      }).`,
      previousState: null,
      newState: sourceReference,
    });

    const state = computeCurrentState();
    const cmt = state.commitments.find((c) => c.id === id)!;
    const mandate =
      mandatesStore.find(
        (m) =>
          m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
      ) || null;
    const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
    const reconciliation =
      state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
    const session = state.sessions.find((s) => s.commitmentId === cmt.id) || null;

    const casebook = buildCommitmentEvidenceCasebook({
      commitment: cmt,
      transactions: state.transactions,
      mandate,
      serviceTerms,
      reconciliation,
      alerts: state.alerts,
      session,
      customEntries: customCasebookEntries,
      auditEvents: auditEventsStore,
    });

    return { body: casebook };
  });
});

// ============================================================================
// REST API ENDPOINTS — TWO INDEPENDENT CANCELLATION LIFECYCLES (Section 10 & 15)
// ============================================================================
app.get('/api/alerts', (_req, res) => {
  const state = computeCurrentState();
  res.json(state.alerts);
});

app.patch('/api/alerts/:id/status', async (req, res) => {
  const { status } = req.body as { status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' };
  await executeSerializedMutation(res, () => {
    alertStatusOverrides[req.params.id] = status;
    const state = computeCurrentState();
    return {
      body: state.alerts.find((a) => a.id === req.params.id),
    };
  });
});

app.get('/api/cancellation/playbooks/:commitmentId', (req, res) => {
  const state = computeCurrentState();
  const pb = state.playbooks.find((p) => p.commitmentId === req.params.commitmentId);
  const sess = state.sessions.find((s) => s.commitmentId === req.params.commitmentId);
  if (!pb || !sess) {
    res.status(404).json({ error: 'Playbook not found' });
    return;
  }
  res.json({ playbook: pb, session: sess });
});

app.get('/api/cancellation/sessions', (_req, res) => {
  const state = computeCurrentState();
  res.json({
    playbooks: state.playbooks,
    sessions: state.sessions,
  });
});

app.post('/api/commitments/:id/cancellation', async (req, res) => {
  const id = req.params.id;
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const cmt = state.commitments.find((c) => c.id === id);
    if (!cmt) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Commitment not found' },
      };
    }
    userCommitmentOverrides[id] = {
      ...(userCommitmentOverrides[id] || {}),
      serviceLifecycleStatus: 'CANCELLATION_REQUESTED',
    };
    recordAuditEvent({
      commitmentId: id,
      eventType: 'SERVICE_STATUS_UPDATED',
      summary: `Initiated cancellation workflow for ${cmt.serviceName}.`,
      previousState: cmt.serviceLifecycleStatus,
      newState: 'CANCELLATION_REQUESTED',
    });
    const updatedState = computeCurrentState();
    return {
      body: {
        commitment: updatedState.commitments.find((c) => c.id === id),
        session: updatedState.sessions.find((s) => s.commitmentId === id),
        playbook: updatedState.playbooks.find((p) => p.commitmentId === id),
      },
    };
  });
});

app.patch('/api/cancellations/:id/service-status', async (req, res) => {
  const { serviceLifecycleStatus, referenceNumber, notes, effectiveDate, evidenceDate } = (req.body || {}) as {
    serviceLifecycleStatus: ServiceLifecycleStatus;
    referenceNumber?: string;
    notes?: string;
    effectiveDate?: string | null;
    evidenceDate?: string | null;
  };
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const sess =
      state.sessions.find((s) => s.id === req.params.id || s.commitmentId === req.params.id) ||
      null;
    if (!sess) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Cancellation session not found' },
      };
    }

    const rawDateInput = effectiveDate ?? evidenceDate ?? null;
    let parsedEvidDate: string | null = null;
    if (rawDateInput !== null && rawDateInput !== undefined && String(rawDateInput).trim() !== '') {
      parsedEvidDate = normalizeDateString(String(rawDateInput));
      if (!parsedEvidDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid effectiveDate/evidenceDate "${rawDateInput}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    const cmtId = sess.commitmentId;
    const prevCmt = state.commitments.find((c) => c.id === cmtId);

    const currentOverride = userCommitmentOverrides[cmtId] || {};
    const existingEvid = currentOverride.evidenceRecords ?? sess.evidence;
    const updatedEvid = [...existingEvid];

    if (referenceNumber) {
      updatedEvid.push({
        id: `EVID-SRV-${Date.now()}`,
        cancellationSessionId: sess.id,
        evidenceType:
          serviceLifecycleStatus === 'MERCHANT_UNRESPONSIVE'
            ? 'MERCHANT_UNRESPONSIVE'
            : 'SERVICE_CONFIRMATION',
        description: notes || `Service lifecycle updated to ${serviceLifecycleStatus}`,
        referenceNumber,
        evidenceDate: parsedEvidDate,
        evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
        sourceType: 'USER_ENTERED',
        verificationStatus: 'EVIDENCE_ATTACHED',
        createdAt: new Date().toISOString(),
      });
    }

    userCommitmentOverrides[cmtId] = {
      ...currentOverride,
      serviceLifecycleStatus,
      ...(parsedEvidDate !== null ? { serviceCancelledAtOverride: parsedEvidDate } : {}),
      evidenceRecords: updatedEvid,
    };

    recordAuditEvent({
      commitmentId: cmtId,
      eventType: 'SERVICE_STATUS_UPDATED',
      summary: `Updated Layer A Service Lifecycle Status to ${serviceLifecycleStatus}${
        referenceNumber ? ` (Ref: ${referenceNumber})` : ''
      }.`,
      previousState: prevCmt?.serviceLifecycleStatus || 'ACTIVE',
      newState: serviceLifecycleStatus,
    });

    const updatedState = computeCurrentState();
    return {
      body: {
        commitment: updatedState.commitments.find((c) => c.id === cmtId),
        session: updatedState.sessions.find((s) => s.commitmentId === cmtId),
      },
    };
  });
});

app.patch('/api/cancellations/:id/mandate-status', async (req, res) => {
  const { mandateLifecycleStatus, referenceNumber, notes, revocationDate, evidenceDate } = (req.body || {}) as {
    mandateLifecycleStatus: MandateLifecycleStatus;
    referenceNumber?: string;
    notes?: string;
    revocationDate?: string | null;
    evidenceDate?: string | null;
  };
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const sess =
      state.sessions.find((s) => s.id === req.params.id || s.commitmentId === req.params.id) ||
      null;
    if (!sess) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Cancellation session not found' },
      };
    }

    const rawDateInput = revocationDate ?? evidenceDate ?? null;
    let parsedEvidDate: string | null = null;
    if (rawDateInput !== null && rawDateInput !== undefined && String(rawDateInput).trim() !== '') {
      parsedEvidDate = normalizeDateString(String(rawDateInput));
      if (!parsedEvidDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid revocationDate/evidenceDate "${rawDateInput}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    const cmtId = sess.commitmentId;
    const prevCmt = state.commitments.find((c) => c.id === cmtId);

    const currentOverride = userCommitmentOverrides[cmtId] || {};
    const existingEvid = currentOverride.evidenceRecords ?? sess.evidence;
    const updatedEvid = [...existingEvid];

    if (referenceNumber) {
      updatedEvid.push({
        id: `EVID-MND-${Date.now()}`,
        cancellationSessionId: sess.id,
        evidenceType: 'MANDATE_REVOCATION',
        description: notes || `Mandate lifecycle updated to ${mandateLifecycleStatus}`,
        referenceNumber,
        evidenceDate: parsedEvidDate,
        evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
        sourceType: 'USER_ENTERED',
        verificationStatus: 'EVIDENCE_ATTACHED',
        createdAt: new Date().toISOString(),
      });
    }

    userCommitmentOverrides[cmtId] = {
      ...currentOverride,
      mandateLifecycleStatus,
      ...(parsedEvidDate !== null ? { mandateRevokedAtOverride: parsedEvidDate } : {}),
      evidenceRecords: updatedEvid,
    };

    // Also sync status into mandatesStore if matching mandate exists
    const mndIdx = mandatesStore.findIndex((m) => m.commitmentId === cmtId);
    if (mndIdx >= 0) {
      if (
        mandateLifecycleStatus === 'REVOCATION_REPORTED_BY_USER' ||
        mandateLifecycleStatus === 'REVOCATION_EVIDENCE_ATTACHED'
      ) {
        mandatesStore[mndIdx].mandateStatus = 'REVOCATION_REPORTED';
      } else if (mandateLifecycleStatus === 'PAUSED_REPORTED_BY_USER') {
        mandatesStore[mndIdx].mandateStatus = 'PAUSED';
      } else if (mandateLifecycleStatus === 'ACTIVE') {
        mandatesStore[mndIdx].mandateStatus = 'ACTIVE';
      }
    }

    recordAuditEvent({
      commitmentId: cmtId,
      eventType: 'MANDATE_STATUS_UPDATED',
      summary: `Updated Layer B Mandate Lifecycle Status to ${mandateLifecycleStatus}${
        referenceNumber ? ` (Ref: ${referenceNumber})` : ''
      }.`,
      previousState: prevCmt?.mandateLifecycleStatus || 'ACTIVE',
      newState: mandateLifecycleStatus,
    });

    const updatedState = computeCurrentState();
    return {
      body: {
        commitment: updatedState.commitments.find((c) => c.id === cmtId),
        session: updatedState.sessions.find((s) => s.commitmentId === cmtId),
      },
    };
  });
});

app.get('/api/cancellations/:id/monitoring', (req, res) => {
  const state = computeCurrentState();
  const sess =
    state.sessions.find((s) => s.id === req.params.id || s.commitmentId === req.params.id) || null;
  if (!sess) {
    res.status(404).json({ error: 'Cancellation session not found' });
    return;
  }
  const cmt = state.commitments.find((c) => c.id === sess.commitmentId);
  const postCancelTxns = state.transactions.filter((t) =>
    sess.postCancellationTransactionIds.includes(t.id)
  );
  const commitmentTransactions = state.transactions
    .filter((t) => t.commitmentId === sess.commitmentId && t.direction === 'DEBIT')
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const srvStatus = cmt?.serviceLifecycleStatus || 'ACTIVE';
  const mndStatus = cmt?.mandateLifecycleStatus || 'ACTIVE';
  const hasCancelOrRevokeReported =
    srvStatus === 'CANCELLATION_REPORTED_BY_USER' ||
    srvStatus === 'CANCELLATION_EVIDENCE_ATTACHED' ||
    mndStatus === 'REVOCATION_REPORTED_BY_USER' ||
    mndStatus === 'REVOCATION_EVIDENCE_ATTACHED';
  const effectiveCancelDate = sess.serviceCancelledAt || sess.paymentAuthorisationRevokedAt || null;

  let monitoringStatus: string;
  let monitoringExplanation: string;
  if (postCancelTxns.length > 0) {
    monitoringStatus = 'POST_CANCELLATION_DEBIT_DETECTED';
    monitoringExplanation = `${postCancelTxns.length} debit(s) observed after recorded cancellation/revocation date (${effectiveCancelDate}).`;
  } else if (sess.serviceCancelledAt && sess.paymentAuthorisationRevokedAt) {
    monitoringStatus = 'MONITORING_ACTIVE_CLEAN';
    monitoringExplanation = `Zero debits observed after service cancellation (${sess.serviceCancelledAt}) and mandate revocation (${sess.paymentAuthorisationRevokedAt}).`;
  } else if (hasCancelOrRevokeReported && !effectiveCancelDate) {
    monitoringStatus = 'EFFECTIVE_DATE_UNAVAILABLE';
    monitoringExplanation =
      'Cancellation or mandate revocation reported, but effective cancellation/revocation date is unavailable (null); cannot determine whether observed debits occurred before or after cancellation.';
  } else {
    monitoringStatus = 'AWAITING_BOTH_LAYERS';
    monitoringExplanation =
      'Awaiting verified effective dates for both Layer A (Merchant Service Cancellation) and Layer B (Payment Mandate Revocation).';
  }

  res.json({
    sessionId: sess.id,
    commitmentId: sess.commitmentId,
    serviceLifecycleStatus: srvStatus,
    mandateLifecycleStatus: mndStatus,
    serviceCancelledAt: sess.serviceCancelledAt,
    paymentAuthorisationRevokedAt: sess.paymentAuthorisationRevokedAt,
    postCancellationDebitDetected: postCancelTxns.length > 0,
    postCancellationTransactions: postCancelTxns,
    commitmentTransactions,
    monitoringStatus,
    monitoringExplanation,
  });
});

app.patch('/api/cancellation/sessions/:id/steps/:stepId', async (req, res) => {
  const { completed } = req.body as { completed: boolean };
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const sess = state.sessions.find((s) => s.id === req.params.id);
    if (!sess) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Cancellation session not found' },
      };
    }
    const cmtId = sess.commitmentId;
    const currentSteps = new Set(
      userCommitmentOverrides[cmtId]?.completedStepIds ??
        sess.steps.filter((s) => s.completed).map((s) => s.id)
    );
    if (completed) {
      currentSteps.add(req.params.stepId);
    } else {
      currentSteps.delete(req.params.stepId);
    }
    userCommitmentOverrides[cmtId] = {
      ...(userCommitmentOverrides[cmtId] || {}),
      completedStepIds: Array.from(currentSteps),
    };
    const updatedState = computeCurrentState();
    return {
      body: {
        session: updatedState.sessions.find((s) => s.id === req.params.id),
        commitment: updatedState.commitments.find((c) => c.id === cmtId),
      },
    };
  });
});

app.post('/api/cancellation/sessions/:id/evidence', async (req, res) => {
  const { evidenceType, description, referenceNumber, evidenceDate } = req.body as {
    evidenceType: CancellationEvidenceRecord['evidenceType'];
    description: string;
    referenceNumber: string;
    evidenceDate?: string | null;
  };
  if (!referenceNumber || !description) {
    res.status(400).json({ error: 'Reference number and description are required.' });
    return;
  }

  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const sess = state.sessions.find((s) => s.id === req.params.id);
    if (!sess) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Session not found' },
      };
    }

    // Gate D: Never default omitted historical evidenceDate to '2026-10-30' or today's date!
    let parsedEvidenceDate: string | null = null;
    if (evidenceDate !== undefined && evidenceDate !== null && String(evidenceDate).trim() !== '') {
      parsedEvidenceDate = normalizeDateString(String(evidenceDate));
      if (!parsedEvidenceDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid evidenceDate "${evidenceDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    const cmtId = sess.commitmentId;
    const existingEvidence = userCommitmentOverrides[cmtId]?.evidenceRecords ?? sess.evidence;
    const newEvid: CancellationEvidenceRecord = {
      id: `EVID-${Date.now()}`,
      cancellationSessionId: sess.id,
      evidenceType: evidenceType || 'SERVICE_CONFIRMATION',
      description,
      referenceNumber,
      evidenceDate: parsedEvidenceDate,
      evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
      sourceType: 'USER_ENTERED',
      verificationStatus: 'USER_REPORTED',
      createdAt: new Date().toISOString(),
    };
    userCommitmentOverrides[cmtId] = {
      ...(userCommitmentOverrides[cmtId] || {}),
      evidenceRecords: [...existingEvidence, newEvid],
    };
    recordAuditEvent({
      commitmentId: cmtId,
      eventType: 'EVIDENCE_ATTACHED',
      summary: `Attached ${evidenceType || 'SERVICE_CONFIRMATION'} evidence reference (Ref: ${referenceNumber}${
        parsedEvidenceDate ? `, Date: ${parsedEvidenceDate}` : ''
      }).`,
      previousState: null,
      newState: referenceNumber,
    });
    const updatedState = computeCurrentState();
    return {
      body: {
        evidence: newEvid,
        session: updatedState.sessions.find((s) => s.id === req.params.id),
        commitment: updatedState.commitments.find((c) => c.id === cmtId),
      },
    };
  });
});

// ============================================================================
// DATA COVERAGE, GUARDRAILS, IMPORT, METRICS & JUDGE DEMO SCENARIO (Section 12, 13, 22)
// ============================================================================
app.get('/api/import/coverage', (_req, res) => {
  const state = computeCurrentState();
  const coverage = buildDataCoverageSummary({
    transactions: state.transactions,
    commitments: state.commitments,
    mandates: mandatesStore,
    serviceTerms: serviceTermsStore,
    notificationsCount: notificationEvents.length,
  });
  res.json(coverage);
});

app.get('/api/guardrails', (_req, res) => {
  computeCurrentState();
  res.json(guardrailsStore);
});

app.patch('/api/guardrails/:commitmentId', async (req, res) => {
  const cmtId = req.params.commitmentId;
  const {
    maxExpectedAmountMinor,
    alertOnAnyIncrease,
    preDebitReminderDays,
    requireTwoLayerCancellationConfirmation,
  } = (req.body || {}) as Partial<FinancialGuardrailConfig>;

  await executeSerializedMutation(res, () => {
    computeCurrentState();
    const idx = guardrailsStore.findIndex((g) => g.commitmentId === cmtId);
    const existing: FinancialGuardrailConfig =
      idx >= 0
        ? guardrailsStore[idx]
        : {
            commitmentId: cmtId,
            maxExpectedAmountMinor: 49900,
            alertOnAnyIncrease: true,
            preDebitReminderDays: 3,
            requireTwoLayerCancellationConfirmation: true,
            updatedAt: new Date().toISOString(),
          };

    const updated: FinancialGuardrailConfig = {
      ...existing,
      ...(maxExpectedAmountMinor !== undefined
        ? { maxExpectedAmountMinor: Number(maxExpectedAmountMinor) }
        : {}),
      ...(alertOnAnyIncrease !== undefined
        ? { alertOnAnyIncrease: Boolean(alertOnAnyIncrease) }
        : {}),
      ...(preDebitReminderDays !== undefined
        ? { preDebitReminderDays: Number(preDebitReminderDays) }
        : {}),
      ...(requireTwoLayerCancellationConfirmation !== undefined
        ? {
            requireTwoLayerCancellationConfirmation: Boolean(
              requireTwoLayerCancellationConfirmation
            ),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      guardrailsStore[idx] = updated;
    } else {
      guardrailsStore.push(updated);
    }
    return { syncGraph: false, body: updated };
  });
});

app.get('/api/import/history', (_req, res) => {
  res.json(importHistory);
});

app.get('/api/import/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(
    [
      'transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference',
      'TXN-DEMO-101,2026-10-28,"RZP*STREAMBOX, MUMBAI IN",799,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UMN-STREAMBOX-9821@okaxis',
      'TXN-DEMO-102,2026-10-29,"SI-CLOUDVAULT ""PRO"" PLAN",219,INR,DEBIT,CARD_EMANDATE,ICICI-CC-9012,SIHUB-CLOUDVAULT-09',
    ].join('\n')
  );
});

app.post('/api/import/transactions', async (req, res) => {
  const { csvContent, filename = 'uploaded-statement.csv' } = req.body as {
    csvContent: string;
    filename?: string;
  };
  if (!csvContent || !csvContent.trim()) {
    res.status(400).json({ error: 'CSV content cannot be empty.' });
    return;
  }
  const parsedRows = parseCsvTextRFC4180(csvContent);
  if (parsedRows.length === 0) {
    res.status(400).json({ error: 'No valid CSV rows found. Check header and row format.' });
    return;
  }

  await executeSerializedMutation(res, () => {
    const existingIds = new Set(rawCsvRows.map((r) => r.transaction_id));
    const existingFingerprints = new Set(rawCsvRows.map(computeCanonicalTxnFingerprint));
    const combinedRows = [...rawCsvRows];
    let added = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const r of parsedRows) {
      const amt = parseStrictAmount(r.amount);
      const validDate = normalizeDateString(r.transaction_date);
      const validCurrency = normalizeCurrencyCode(
        r.currency !== undefined && r.currency !== null && String(r.currency).trim() !== ''
          ? String(r.currency)
          : 'INR'
      );
      if (
        !r.transaction_id ||
        !validDate ||
        !validCurrency ||
        !r.raw_description ||
        amt === null ||
        amt <= 0
      ) {
        rejected++;
        continue;
      }
      const normalizedRow: RawCsvRow = {
        ...r,
        transaction_date: validDate,
        currency: validCurrency,
      };
      (normalizedRow as any).source_type = 'CSV_STATEMENT';
      const fp = computeCanonicalTxnFingerprint(normalizedRow);
      if (existingIds.has(r.transaction_id) || existingFingerprints.has(fp)) {
        duplicates++;
        continue;
      }
      existingIds.add(r.transaction_id);
      existingFingerprints.add(fp);
      combinedRows.push(normalizedRow);
      added++;
    }

    rawCsvRows = combinedRows;
    const batchRecord: ImportHistoryEntry = {
      id: `BATCH-${Date.now()}`,
      filename,
      sourceType: 'CSV_STATEMENT',
      totalRecords: parsedRows.length,
      acceptedRecords: added,
      rejectedRecords: rejected,
      duplicateRecords: duplicates,
      importedAt: new Date().toISOString(),
    };
    importHistory.unshift(batchRecord);

    const state = computeCurrentState();
    return {
      body: {
        batch: batchRecord,
        totalTransactions: state.transactions.length,
        totalCommitments: state.commitments.length,
        totalAlerts: state.alerts.length,
      },
    };
  });
});

app.post('/api/import/notifications', async (req, res) => {
  const { jsonContent, notifications, filename = 'uploaded-notifications.json' } = req.body as {
    jsonContent?: string;
    notifications?: NotificationInput[];
    filename?: string;
  };

  let incomingList: any[] = [];
  if (Array.isArray(notifications)) {
    incomingList = notifications;
  } else if (typeof jsonContent === 'string' && jsonContent.trim()) {
    try {
      const parsed = JSON.parse(jsonContent);
      incomingList = Array.isArray(parsed) ? parsed : [parsed];
    } catch (err: any) {
      res.status(400).json({ error: `Invalid JSON format: ${err?.message || 'Parse error'}` });
      return;
    }
  } else {
    res.status(400).json({ error: 'Provide jsonContent string or notifications array.' });
    return;
  }

  await executeSerializedMutation(res, () => {
    const existingIds = new Set(notificationEvents.map((n) => n.id));
    let added = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const item of incomingList) {
      if (!item || typeof item !== 'object' || !item.id || !item.eventDate || !item.merchantHint) {
        rejected++;
        continue;
      }
      const validCurrency = normalizeCurrencyCode(
        item.currency !== undefined && item.currency !== null && String(item.currency).trim() !== ''
          ? String(item.currency)
          : 'INR'
      );
      const validDate = normalizeDateString(String(item.eventDate));
      if (!validCurrency || !validDate) {
        rejected++;
        continue;
      }
      if (existingIds.has(String(item.id))) {
        duplicates++;
        continue;
      }
      existingIds.add(String(item.id));

      const parsedNotifAmt =
        item.expectedAmount !== undefined &&
        item.expectedAmount !== null &&
        item.expectedAmount !== ''
          ? parseStrictAmount(item.expectedAmount)
          : null;

      notificationEvents.push({
        id: String(item.id),
        eventDate: validDate,
        eventType: item.eventType || 'MANDATE_CREATED',
        merchantHint: String(item.merchantHint),
        trialStartDate: item.trialStartDate ?? null,
        trialEndDate: item.trialEndDate ?? null,
        expectedAmount: parsedNotifAmt,
        currency: validCurrency,
        relatedCommitmentId: String(item.relatedCommitmentId || ''),
        sourceType: String(item.sourceType || 'UPLOADED_JSON'),
        description: String(
          item.description || item.rawSummary || `${item.eventType} for ${item.merchantHint}`
        ),
      });
      added++;
    }

    const batchRecord: ImportHistoryEntry = {
      id: `BATCH-NOTIF-${Date.now()}`,
      filename,
      sourceType: 'NOTIFICATION_JSON',
      totalRecords: incomingList.length,
      acceptedRecords: added,
      rejectedRecords: rejected,
      duplicateRecords: duplicates,
      importedAt: new Date().toISOString(),
    };
    importHistory.unshift(batchRecord);

    const state = computeCurrentState();
    return {
      body: {
        batch: batchRecord,
        totalNotifications: notificationEvents.length,
        totalCommitments: state.commitments.length,
        totalAlerts: state.alerts.length,
      },
    };
  });
});

// ============================================================================
// REST API ENDPOINTS — COMMITMENT PASSPORT & EVIDENCE PACK (Phase 3)
// ============================================================================
app.get('/api/commitments/:id/passport', (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === req.params.id);
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }
  const mandate =
    mandatesStore.find(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    ) || null;
  const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
  const finding = state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
  const alerts = state.alerts.filter((a) => a.commitmentId === cmt.id);
  const session = state.sessions.find((s) => s.commitmentId === cmt.id) || null;
  const casebook = buildCommitmentEvidenceCasebook({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation: finding,
    alerts: state.alerts,
    session,
    customEntries: customCasebookEntries,
    auditEvents: auditEventsStore,
  });

  const passport = generateCommitmentPassport({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation: finding,
    alerts,
    session,
    casebookEntries: casebook.entries,
    auditEvents: casebook.auditEvents,
  });
  res.json(passport);
});

app.get('/api/commitments/:id/evidence-pack', (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === req.params.id);
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }
  const mandate =
    mandatesStore.find(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    ) || null;
  const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
  const finding = state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
  const alerts = state.alerts.filter((a) => a.commitmentId === cmt.id);
  const session = state.sessions.find((s) => s.commitmentId === cmt.id) || null;
  const casebook = buildCommitmentEvidenceCasebook({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation: finding,
    alerts: state.alerts,
    session,
    customEntries: customCasebookEntries,
    auditEvents: auditEventsStore,
  });

  const pack = generateEvidencePackData({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation: finding,
    alerts,
    cancellationSession: session,
    casebookEntries: casebook.entries,
    auditEvents: casebook.auditEvents,
  });
  res.json(pack);
});

app.get('/api/commitments/:id/evidence-pack/print', (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === req.params.id);
  if (!cmt) {
    res.status(404).send('<h1>Commitment not found</h1>');
    return;
  }
  const mandate =
    mandatesStore.find(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    ) || null;
  const serviceTerms = serviceTermsStore.find((s) => s.commitmentId === cmt.id) || null;
  const finding = state.reconciliationFindings.find((r) => r.commitmentId === cmt.id) || null;
  const alerts = state.alerts.filter((a) => a.commitmentId === cmt.id);
  const session = state.sessions.find((s) => s.commitmentId === cmt.id) || null;
  const casebook = buildCommitmentEvidenceCasebook({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation: finding,
    alerts: state.alerts,
    session,
    customEntries: customCasebookEntries,
    auditEvents: auditEventsStore,
  });

  const pack = generateEvidencePackData({
    commitment: cmt,
    transactions: state.transactions,
    mandate,
    serviceTerms,
    reconciliation: finding,
    alerts,
    cancellationSession: session,
    casebookEntries: casebook.entries,
    auditEvents: casebook.auditEvents,
  });
  const html = generatePrintableEvidencePackHtml(pack);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ============================================================================
// REST API ENDPOINTS — UNRECOGNIZED DEBIT INVESTIGATION WORKFLOW (Phase 2)
// ============================================================================
app.get('/api/investigations', (_req, res) => {
  computeCurrentState();
  res.json(investigationCasesStore);
});

app.post('/api/investigations', async (req, res) => {
  const { transactionId } = req.body as { transactionId: string };
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const txn = state.transactions.find((t) => t.id === transactionId);
    if (!txn) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Transaction not found' },
      };
    }
    let existing = investigationCasesStore.find((c) => c.transactionId === transactionId);
    if (!existing) {
      existing = buildUnrecognizedDebitCase({
        transaction: txn,
        allTransactions: state.transactions,
        userMerchantOverrides,
        existingCases: investigationCasesStore,
      });
      investigationCasesStore.push(existing);
      recordAuditEvent({
        commitmentId: null,
        transactionId: txn.id,
        investigationId: existing.id,
        eventType: 'MERCHANT_CORRECTION',
        summary: `User opened investigation ${existing.id} for unrecognized debit ${txn.id} (${txn.rawDescription}).`,
        previousState: null,
        newState: 'OPEN',
        actor: 'USER_ACTION',
      });
    } else {
      // Refresh candidates against current transaction-scoped overrides
      existing = buildUnrecognizedDebitCase({
        transaction: txn,
        allTransactions: state.transactions,
        userMerchantOverrides,
        existingCases: investigationCasesStore,
      });
      const idx = investigationCasesStore.findIndex((c) => c.transactionId === transactionId);
      if (idx >= 0) investigationCasesStore[idx] = existing;
    }
    return { syncGraph: false, body: existing };
  });
});

app.post('/api/investigations/:id/action', async (req, res) => {
  const id = req.params.id;
  const { actionType, notes, targetStatus } = req.body as {
    actionType: string;
    notes?: string;
    targetStatus?: UnrecognizedDebitCaseStatus;
  };
  if (!actionType || typeof actionType !== 'string' || !actionType.trim()) {
    res.status(400).json({ error: 'actionType is required.' });
    return;
  }
  const ALLOWED_CASE_STATUSES: UnrecognizedDebitCaseStatus[] = [
    'OPEN',
    'UNDER_REVIEW',
    'NEEDS_USER_INPUT',
    'IDENTIFIED',
    'UNRESOLVED',
    'CLOSED',
  ];
  if (targetStatus && !ALLOWED_CASE_STATUSES.includes(targetStatus)) {
    res.status(400).json({ error: `Invalid targetStatus "${targetStatus}".` });
    return;
  }
  const ALLOWED_ACTION_TYPES = [
    'CHECKED_RECEIPTS',
    'CONTACTED_MERCHANT',
    'CHECKED_UPI_MANDATES',
    'CHECKED_BANK_STATEMENT',
    'ADDED_NOTE',
    'MARKED_RECOGNIZED',
    'MARKED_UNRESOLVED',
    'MARKED_UNDER_REVIEW',
    'WAITING_BANK_INPUT',
    'DISPUTED_RESOLVED',
    'ESCALATED_TO_BANK',
    'REJECT_CANDIDATE',
    'REQUEST_MORE_INFO',
    'CLOSE_CASE',
    'REOPEN_CASE',
    'CONFIRM_MERCHANT',
  ];
  const cleanActionType = actionType.trim();
  if (!ALLOWED_ACTION_TYPES.includes(cleanActionType)) {
    res.status(400).json({
      error: `Invalid actionType "${cleanActionType}". Allowed values: ${ALLOWED_ACTION_TYPES.join(', ')}`,
    });
    return;
  }

  await executeSerializedMutation(res, () => {
    const caseItem = investigationCasesStore.find((c) => c.id === id);
    if (!caseItem) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Investigation case not found' },
      };
    }
    const prevState = caseItem.status;

    // Gate E: A CLOSED case cannot accept mutations other than REOPEN_CASE
    if (prevState === 'CLOSED' && cleanActionType !== 'REOPEN_CASE') {
      return {
        errorStatus: 400,
        errorBody: {
          error: `A CLOSED investigation case cannot accept action "${cleanActionType}". Use REOPEN_CASE first.`,
        },
      };
    }

    if (cleanActionType === 'CLOSE_CASE' && prevState === 'CLOSED') {
      return {
        errorStatus: 400,
        errorBody: { error: 'Investigation case is already CLOSED.' },
      };
    }

    if (!caseItem.actionsTaken) {
      caseItem.actionsTaken = [];
    }

    // Prevent duplicate identical non-note actions
    if (
      cleanActionType !== 'ADDED_NOTE' &&
      cleanActionType !== 'REOPEN_CASE' &&
      caseItem.actionsTaken.some(
        (a: any) => a.actionType === cleanActionType && (a.notes || '') === (notes || '')
      ) &&
      (!targetStatus || targetStatus === caseItem.status)
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `Duplicate action "${cleanActionType}" has already been recorded on this investigation case.`,
        },
      };
    }

    if (cleanActionType === 'REOPEN_CASE') {
      caseItem.status = targetStatus && targetStatus !== 'CLOSED' ? targetStatus : 'UNDER_REVIEW';
      // Clear previous confirmation if reopening an IDENTIFIED case so re-attribution is permitted
      if (prevState === 'IDENTIFIED') {
        delete userMerchantOverrides[caseItem.transactionId];
        caseItem.resolvedMerchantId = null;
        caseItem.confirmedMerchantId = null;
        caseItem.resolutionSource = null;
      }
    } else if (cleanActionType === 'CLOSE_CASE' || cleanActionType === 'DISPUTED_RESOLVED') {
      caseItem.status = 'CLOSED';
    } else if (cleanActionType === 'MARKED_UNDER_REVIEW') {
      caseItem.status = targetStatus || 'UNDER_REVIEW';
    } else if (cleanActionType === 'WAITING_BANK_INPUT' || cleanActionType === 'REQUEST_MORE_INFO') {
      caseItem.status = targetStatus || 'NEEDS_USER_INPUT';
    } else if (cleanActionType === 'MARKED_UNRESOLVED') {
      caseItem.status = targetStatus || 'UNRESOLVED';
    } else if (targetStatus) {
      caseItem.status = targetStatus;
    }

    if (notes) {
      caseItem.notes = (caseItem.notes ? caseItem.notes + '\n' : '') + notes;
    }
    caseItem.actionsTaken.push({
      actionId: `ACT-${Date.now()}`,
      actionType: cleanActionType,
      takenAt: new Date().toISOString(),
      notes: notes || `Action ${cleanActionType} recorded by user.`,
      actor: 'USER',
    });
    caseItem.updatedAt = new Date().toISOString();

    recordAuditEvent({
      commitmentId: null,
      transactionId: caseItem.transactionId,
      investigationId: caseItem.id,
      eventType: 'INVESTIGATION_ACTION_RECORDED',
      summary: `Investigation ${caseItem.id} updated with action ${cleanActionType} (Status: ${caseItem.status}).`,
      previousState: prevState,
      newState: caseItem.status,
      actor: 'USER_ACTION',
    });

    return { syncGraph: false, body: caseItem };
  });
});

app.post('/api/investigations/:id/confirm-merchant', async (req, res) => {
  const id = req.params.id;
  const { merchantId, transactionId, rawDescription } = (req.body || {}) as {
    merchantId: string;
    transactionId?: string;
    rawDescription?: string;
  };
  await executeSerializedMutation(res, () =>
    executeAuthoritativeMerchantConfirmation({
      investigationId: id,
      transactionId,
      merchantId,
      rawDescription,
    })
  );
});

// ============================================================================
// REST API ENDPOINTS — REVIEW & RESOLVE QUEUE (Phase 2)
// ============================================================================
app.get('/api/review-queue', (_req, res) => {
  const state = computeCurrentState();
  const queue = buildReviewQueue({
    investigations: investigationCasesStore,
    reconciliationFindings: state.reconciliationFindings,
    alerts: state.alerts,
    commitments: state.commitments,
    statusOverrides: reviewQueueStatusOverrides,
  });
  res.json(queue);
});

const REVIEW_QUEUE_TRANSITIONS: Record<ReviewQueueStatus, ReviewQueueStatus[]> = {
  OPEN: ['IN_REVIEW', 'WAITING_FOR_USER', 'RESOLVED', 'DISMISSED'],
  IN_REVIEW: ['WAITING_FOR_USER', 'RESOLVED', 'DISMISSED', 'OPEN'],
  WAITING_FOR_USER: ['IN_REVIEW', 'RESOLVED', 'DISMISSED', 'OPEN'],
  RESOLVED: ['OPEN'],
  DISMISSED: ['OPEN'],
};

app.post('/api/review-queue/:id/status', async (req, res) => {
  const id = req.params.id;
  const { status, resolutionReason } = (req.body || {}) as {
    status: ReviewQueueStatus;
    resolutionReason?: string;
  };
  const ALLOWED_QUEUE_STATUSES: ReviewQueueStatus[] = [
    'OPEN',
    'IN_REVIEW',
    'WAITING_FOR_USER',
    'RESOLVED',
    'DISMISSED',
  ];
  if (!status || !ALLOWED_QUEUE_STATUSES.includes(status)) {
    res.status(400).json({ error: 'Valid ReviewQueueStatus is required.' });
    return;
  }

  await executeSerializedMutation(res, () => {
    const preState = computeCurrentState();
    const currentQueue = buildReviewQueue({
      investigations: investigationCasesStore,
      reconciliationFindings: preState.reconciliationFindings,
      alerts: preState.alerts,
      commitments: preState.commitments,
      statusOverrides: reviewQueueStatusOverrides,
    });
    const targetItem = currentQueue.find((i) => i.id === id || i.dedupKey === id);

    // Gate E: Reject unknown review queue item IDs with HTTP 404 without mutating state or audit logs
    if (!targetItem) {
      return {
        errorStatus: 404,
        errorBody: { error: `Review queue item "${id}" not found.` },
      };
    }

    const previousStatus: ReviewQueueStatus = targetItem.status;

    if (previousStatus === status) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `Duplicate transition: review queue item "${targetItem.id}" is already in status ${status}.`,
        },
      };
    }

    const allowedNext = REVIEW_QUEUE_TRANSITIONS[previousStatus] || [];
    if (!allowedNext.includes(status)) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `Invalid state transition from ${previousStatus} to ${status} for review queue item "${targetItem.id}".`,
        },
      };
    }

    const isReopening =
      (previousStatus === 'RESOLVED' || previousStatus === 'DISMISSED') && status === 'OPEN';
    if (
      (status === 'RESOLVED' || status === 'DISMISSED' || isReopening) &&
      (!resolutionReason || !String(resolutionReason).trim())
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error: isReopening
            ? `A non-empty resolutionReason is required when reopening a ${previousStatus} review queue item to OPEN.`
            : `A non-empty resolutionReason is required when marking a review queue item as ${status}.`,
        },
      };
    }

    reviewQueueStatusOverrides[targetItem.id] = status;
    reviewQueueStatusOverrides[targetItem.dedupKey] = status;

    recordAuditEvent({
      commitmentId: targetItem.commitmentId || null,
      transactionId: targetItem.transactionId || null,
      reviewItemId: targetItem.id,
      eventType: 'REVIEW_QUEUE_UPDATED',
      summary: `Review Queue item ${targetItem.id} transitioned from ${previousStatus} to ${status}${
        resolutionReason ? ` (Reason: ${resolutionReason.trim()})` : ''
      }.`,
      previousState: previousStatus,
      newState: status,
      actor: 'USER_ACTION',
    });

    const state = computeCurrentState();
    const queue = buildReviewQueue({
      investigations: investigationCasesStore,
      reconciliationFindings: state.reconciliationFindings,
      alerts: state.alerts,
      commitments: state.commitments,
      statusOverrides: reviewQueueStatusOverrides,
    });
    return { syncGraph: false, body: queue };
  });
});

// ============================================================================
// REST API ENDPOINTS — SMART CSV COLUMN MAPPING WIZARD (Phase 4)
// ============================================================================
app.post('/api/import/transactions/preview-mapping', (req, res) => {
  const { csvContent, config } = req.body as {
    csvContent: string;
    config?: Partial<CsvMappingConfig>;
  };
  if (!csvContent || typeof csvContent !== 'string') {
    res.status(400).json({ error: 'csvContent string is required' });
    return;
  }
  const result = previewCsvMapping(csvContent, config);
  res.json(result);
});

app.post('/api/import/transactions/apply-mapped', async (req, res) => {
  const { csvContent, config } = req.body as {
    csvContent: string;
    config: CsvMappingConfig;
  };
  if (!csvContent || !config) {
    res.status(400).json({ error: 'csvContent and config are required' });
    return;
  }
  const parseResult = parseAllMappedCsvRows(csvContent, config, true);
  if (parseResult.validRows.length === 0) {
    res.status(400).json({
      error: 'No valid transaction rows could be parsed using the supplied column mapping.',
      parseResult,
    });
    return;
  }

  await executeSerializedMutation(res, () => {
    const existingFingerprints = new Set(rawCsvRows.map(computeCanonicalTxnFingerprint));
    const newRawRows: RawCsvRow[] = [];
    let existingDuplicatesSkipped = 0;

    for (const vr of parseResult.validRows) {
      (vr as any).source_type = 'CSV_STATEMENT';
      const fp = computeCanonicalTxnFingerprint(vr);
      if (existingFingerprints.has(fp)) {
        existingDuplicatesSkipped++;
        continue;
      }
      existingFingerprints.add(fp);
      newRawRows.push(vr);
    }

    rawCsvRows.push(...newRawRows);
    const batchId = `BATCH-MAP-${Date.now()}`;
    const batchRecord: ImportHistoryEntry = {
      id: batchId,
      filename: 'mapped-statement.csv',
      sourceType: 'CSV_MAPPED',
      totalRecords: parseResult.totalRows,
      acceptedRecords: newRawRows.length,
      rejectedRecords: parseResult.rejectedCount,
      duplicateRecords: parseResult.duplicateCount + existingDuplicatesSkipped,
      importedAt: new Date().toISOString(),
    };
    importHistory.unshift(batchRecord);

    recordAuditEvent({
      commitmentId: null,
      eventType: 'IMPORT',
      summary: `Mapped CSV import: Successfully parsed and committed ${newRawRows.length} valid transaction rows (${existingDuplicatesSkipped} existing duplicates skipped).`,
      previousState: null,
      newState: batchRecord.id,
      actor: 'USER_ACTION',
    });

    const state = computeCurrentState();

    return {
      body: {
        message: `Successfully imported ${newRawRows.length} transactions via Smart Mapping Wizard (${existingDuplicatesSkipped} duplicate rows skipped).`,
        batch: batchRecord,
        totalTransactions: state.transactions.length,
        totalCommitments: state.commitments.length,
        totalAlerts: state.alerts.length,
        importedRowsCount: newRawRows.length,
        duplicatesSkipped: existingDuplicatesSkipped + parseResult.duplicateCount,
        parseResult,
      },
    };
  });
});

// Section 22 Judge Demo Scenario: StreamBox ₹499 invoice vs ₹799 actual debit vs ₹999 UPI AutoPay mandate
app.post('/api/demo/streambox-judge-scenario', async (_req, res) => {
  await executeSerializedMutation(res, () => {
    // Update TXN-1004 (Sept) and TXN-1005 (Oct) to ₹799 so StreamBox has 3 debits of ₹499 (Jun-Aug) and 2 debits of ₹799 (Sep-Oct)
    for (const row of rawCsvRows) {
      if (row.transaction_id === 'TXN-1004' || row.transaction_id === 'TXN-1005') {
        row.amount = '799';
      }
    }

    // Ensure StreamBox service terms are ₹499 (49900 paise) and mandate max is ₹999 (99900 paise)
    const sbTermsIdx = serviceTermsStore.findIndex((s) => s.commitmentId === 'CMT-STREAMBOX');
    const sbTerms: ServiceTermsRecord = {
      id: 'DOC-STREAMBOX-01',
      commitmentId: 'CMT-STREAMBOX',
      merchantName: 'StreamBox Media Pvt Ltd',
      serviceName: 'StreamBox Ultra HD Plan',
      expectedAmountMinor: 49900,
      expectedAmount: 499,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: null,
      renewalDate: '2026-11-10',
      cancellationNoticeDays: 2,
      documentSource: 'PASTED_INVOICE_TEXT',
      sourceType: 'DEMO_SEED',
      rawDocumentText:
        'INVOICE #SB-2026-0891 | StreamBox Media Pvt Ltd | Plan: StreamBox Ultra HD Monthly | Expected Cycle Charge: INR 499.00 (incl. GST) | Billing Cycle: Monthly on the 10th | Cancellation policy: Cancel at least 2 days before next billing date.',
      extractionConfidence: 98,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 499.00 (49900 paise)',
          confidence: 98,
          sourceSnippet: 'Expected Cycle Charge: INR 499.00 (incl. GST)',
          userVerified: true,
        },
        {
          fieldName: 'billingFrequency',
          extractedValue: 'MONTHLY',
          confidence: 98,
          sourceSnippet: 'Billing Cycle: Monthly on the 10th',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: new Date().toISOString(),
    };
    if (sbTermsIdx >= 0) serviceTermsStore[sbTermsIdx] = sbTerms;
    else serviceTermsStore.push(sbTerms);

    const sbMandateIdx = mandatesStore.findIndex((m) => m.commitmentId === 'CMT-STREAMBOX');
    const sbMandate: MandateRecord = {
      id: 'MND-STREAMBOX-01',
      mandateReference: 'UMN-STREAMBOX-9821@okaxis',
      commitmentId: 'CMT-STREAMBOX',
      merchantId: 'MERCH-STREAMBOX',
      merchantName: 'StreamBox Media Pvt Ltd',
      paymentRail: 'UPI_AUTOPAY',
      maxAmountMinor: 99900,
      maxAmount: 999,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-06-10',
      endDate: '2028-06-10',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: new Date().toISOString(),
    };
    if (sbMandateIdx >= 0) mandatesStore[sbMandateIdx] = sbMandate;
    else mandatesStore.push(sbMandate);

    userCommitmentOverrides['CMT-STREAMBOX'] = {
      ...(userCommitmentOverrides['CMT-STREAMBOX'] || {}),
      entityClass: 'FINANCIAL_COMMITMENT',
      verificationStatus: 'USER_CONFIRMED',
      expectedAmountMinorOverride: 49900,
      typicalAmountOverride: 499,
    };

    recordAuditEvent({
      commitmentId: 'CMT-STREAMBOX',
      eventType: 'RECONCILIATION_EVALUATED',
      summary:
        'Activated Section 22 Judge Demo Scenario: StreamBox expected invoice ₹499 vs actual debit ₹799 (+₹300 discrepancy) within ₹999 UPI AutoPay mandate ceiling.',
      previousState: 'MATCHED',
      newState: 'AMOUNT_DISCREPANCY',
    });

    const state = computeCurrentState();
    const finding = state.reconciliationFindings.find((r) => r.commitmentId === 'CMT-STREAMBOX');
    const commitment = state.commitments.find((c) => c.id === 'CMT-STREAMBOX');

    return {
      body: {
        message:
          'Judge Demo Scenario loaded: StreamBox Media expected invoice ₹499.00 vs actual debit ₹799.00 (+₹300.00 discrepancy) within ₹999.00 UPI AutoPay mandate ceiling.',
        commitment,
        finding,
        allFindings: state.reconciliationFindings,
      },
    };
  });
});

app.post('/api/demo/simulate-post-cancel-debit', async (req, res) => {
  const { commitmentId = 'CMT-STREAMBOX' } = req.body as { commitmentId?: string };
  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const cmt = state.commitments.find((c) => c.id === commitmentId) || state.commitments[0];
    if (!cmt) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Commitment not found' },
      };
    }

    const pb = state.playbooks.find((p) => p.commitmentId === cmt.id)!;
    userCommitmentOverrides[cmt.id] = {
      ...(userCommitmentOverrides[cmt.id] || {}),
      cancelledAtOverride: '2026-10-10',
      completedStepIds: pb.steps.map((s) => s.id),
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
      mandateLifecycleStatus: 'REVOCATION_EVIDENCE_ATTACHED',
      evidenceRecords: [
        {
          id: `EVID-SIM-${Date.now()}`,
          cancellationSessionId: `SESS-${cmt.id}`,
          evidenceType: 'SERVICE_CONFIRMATION',
          description: `User recorded full Layer A service + Layer B mandate cancellation for ${cmt.serviceName}.`,
          referenceNumber: `CANC-REF-${cmt.id}-20261010`,
          evidenceDate: '2026-10-10',
          evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
          sourceType: 'DEMO_SEED',
          verificationStatus: 'EVIDENCE_ATTACHED',
          createdAt: '2026-10-10T10:00:00Z',
        },
      ],
    };

    const simTxnId = `TXN-POST-${cmt.id.slice(4)}-99`;
    if (!rawCsvRows.some((r) => r.transaction_id === simTxnId)) {
      rawCsvRows.push({
        transaction_id: simTxnId,
        transaction_date: '2026-10-29',
        raw_description: cmt.connectedDescriptors[0] || `RZP*${cmt.merchantName.toUpperCase()}`,
        amount: cmt.latestAmount,
        currency: cmt.currency || 'INR',
        direction: 'DEBIT',
        payment_rail: cmt.paymentRail,
        account_alias: 'HDFC-XX4821',
        external_reference: `POST-CANCEL-${Date.now()}`,
      });
    }

    recordAuditEvent({
      commitmentId: cmt.id,
      eventType: 'POST_CANCELLATION_DEBIT_DETECTED',
      summary: `Simulated post-cancellation debit ${simTxnId} (${formatCurrency(
        cmt.latestAmount,
        cmt.currency || 'INR'
      )} on 2026-10-29) after cancellation on 2026-10-10.`,
      previousState: 'CANCELLED_USER_CONFIRMED',
      newState: 'POST_CANCEL_ALERT',
      actor: 'SYSTEM_ENGINE',
    });

    const updatedState = computeCurrentState();
    return {
      body: {
        message: `Simulated post-cancellation debit ${simTxnId} (${formatCurrency(
          cmt.latestAmount,
          cmt.currency || 'INR'
        )} on 2026-10-29) after cancellation on 2026-10-10.`,
        commitment: updatedState.commitments.find((c) => c.id === cmt.id),
        alerts: updatedState.alerts,
      },
    };
  });
});

app.post('/api/demo/reset', async (_req, res) => {
  await executeSerializedMutation(res, () => {
    loadSeedData(true);
    const state = computeCurrentState();
    return {
      body: {
        message:
          'Synthetic dataset, mandates, service terms, and sessions reset to initial benchmark state.',
        commitmentsCount: state.commitments.length,
        transactionsCount: state.transactions.length,
      },
    };
  });
});

const handleEvaluateDetectionMetrics = (_req: express.Request, res: express.Response) => {
  const groundTruthPath = path.resolve(process.cwd(), 'data/ground-truth.json');
  const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'));
  const state = computeCurrentState();
  const metrics = evaluateDetectionMetricsAgainstGroundTruth(
    groundTruth,
    state.transactions,
    state.commitments
  );
  res.json(metrics);
};

app.get('/api/detection/metrics', handleEvaluateDetectionMetrics);
app.post('/api/detection/evaluate', handleEvaluateDetectionMetrics);

// ============================================================================
// VITE DEV SERVER / STATIC ASSET MOUNTING & GRACEFUL SHUTDOWN
// ============================================================================
async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`DebitLens Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = async () => {
    await neo4jPersistenceService.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

if (process.env.DEBITLENS_SKIP_LISTEN !== '1') {
  startServer();
}

