import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
import {
  normalizeDateString,
  getRuntimeDateISO,
  getDynamicMonthWindow,
} from './src/utils/dateUtils';
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
  TransactionRecord,
  EvidenceCasebookEntry,
  AuditEventRecord,
  FinancialGuardrailConfig,
  ServiceLifecycleStatus,
  RecordSourceProvenance,
  MandateLifecycleStatus,
  RecurrenceFrequency,
  PaymentRailType,
  UnrecognizedDebitCase,
  UnrecognizedDebitCaseStatus,
  ReviewQueueStatus,
  CsvMappingConfig,
  MerchantConfirmationRecord,
  ALLOWED_SERVICE_LIFECYCLE_STATUSES,
  ALLOWED_MANDATE_LIFECYCLE_STATUSES,
  EffectiveDateChangeRecord,
} from './src/types/debitlens';
import {
  toMinorUnits,
  fromMinorUnits,
  toMinorUnitsStrict,
  fromMinorUnitsStrict,
  normalizeCurrencyCode,
  isValidCurrencyCode,
  getMinorUnitLabel,
  formatCurrency,
  resolveTransactionCurrency,
  isUnknownCurrency,
  UNKNOWN_CURRENCY,
  getCurrencyDecimalsOrNull,
} from './src/utils/currency';
import {
  neo4jPersistenceService,
  isPlaceholderEnvValue,
} from './src/services/neo4jPersistenceService';

dotenv.config();

export const app = express();
app.use(express.json({ limit: '25mb' }));

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
  demoModeEnabled?: boolean;
  primaryDisplayCurrency?: string;
  confirmedAccountCurrencies?: Record<string, string>;
  demoSimulatedRows?: RawCsvRow[];
  demoCommitmentOverrides?: Record<string, UserCommitmentStateOverride>;
  demoServiceTerms?: ServiceTermsRecord[];
  demoMandates?: MandateRecord[];
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
let demoModeEnabled = false;
let primaryDisplayCurrency = 'INR';
let confirmedAccountCurrencies: Record<string, string> = {};
let demoSimulatedRows: RawCsvRow[] = [];
let demoCommitmentOverrides: Record<string, UserCommitmentStateOverride> = {};
let demoServiceTerms: ServiceTermsRecord[] = [];
let demoMandates: MandateRecord[] = [];

export function getDemoModeState(): boolean {
  return demoModeEnabled;
}

export function setDemoModeForTesting(enabled: boolean): void {
  demoModeEnabled = Boolean(enabled);
}

const PRIVILEGED_PROVENANCE_SOURCES: ReadonlySet<string> = new Set([
  'SYSTEM_GENERATED',
  'DEMO_SEED',
  'INDEPENDENTLY_VERIFIED',
]);

function isForgedPrivilegedProvenance(claimedSourceType: unknown): boolean {
  if (typeof claimedSourceType !== 'string') return false;
  return PRIVILEGED_PROVENANCE_SOURCES.has(claimedSourceType.trim().toUpperCase());
}

function getEffectiveMandates(): MandateRecord[] {
  if (!demoModeEnabled || demoMandates.length === 0) {
    return mandatesStore;
  }
  const merged = [...mandatesStore];
  for (const dm of demoMandates) {
    const idx = merged.findIndex(
      (m) => m.id === dm.id || (dm.commitmentId && m.commitmentId === dm.commitmentId)
    );
    if (idx >= 0) {
      if (merged[idx].sourceType === 'DEMO_SEED' || merged[idx].sourceType === 'SYSTEM_GENERATED') {
        merged[idx] = dm;
      }
    } else {
      merged.push(dm);
    }
  }
  return merged;
}

function getEffectiveServiceTerms(): ServiceTermsRecord[] {
  if (!demoModeEnabled || demoServiceTerms.length === 0) {
    return serviceTermsStore;
  }
  const merged = [...serviceTermsStore];
  for (const ds of demoServiceTerms) {
    const idx = merged.findIndex(
      (s) => s.id === ds.id || (ds.commitmentId && s.commitmentId === ds.commitmentId)
    );
    if (idx >= 0) {
      if (merged[idx].sourceType === 'DEMO_SEED' || merged[idx].sourceType === 'SYSTEM_GENERATED') {
        merged[idx] = ds;
      }
    } else {
      merged.push(ds);
    }
  }
  return merged;
}

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
    demoModeEnabled,
    primaryDisplayCurrency,
    confirmedAccountCurrencies,
    demoSimulatedRows,
    demoCommitmentOverrides,
    demoServiceTerms,
    demoMandates,
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
  demoModeEnabled = Boolean(cloned.demoModeEnabled);
  primaryDisplayCurrency = cloned.primaryDisplayCurrency || 'INR';
  confirmedAccountCurrencies = cloned.confirmedAccountCurrencies || {};
  demoSimulatedRows = cloned.demoSimulatedRows || [];
  demoCommitmentOverrides = cloned.demoCommitmentOverrides || {};
  demoServiceTerms = cloned.demoServiceTerms || [];
  demoMandates = cloned.demoMandates || [];
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
      demoModeEnabled,
      primaryDisplayCurrency,
      confirmedAccountCurrencies,
      demoSimulatedRows,
      demoCommitmentOverrides,
      demoServiceTerms,
      demoMandates,
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
    currency: row.currency || UNKNOWN_CURRENCY,
    parsedDate: row.transaction_date || '',
    direction: row.direction || 'DEBIT',
    amount: row.amount || '0',
    rawDescription: row.raw_description || '',
    externalReference: row.external_reference || '',
  });
}

let mutationQueue = Promise.resolve();

export type RouteMutationResult<T = any> =
  | { status?: number; body: T; syncGraph?: boolean; cleanup?: () => void }
  | {
      errorStatus: number;
      errorBody: { error: string; [key: string]: any };
      cleanup?: () => void;
    };

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
      let cleanup: (() => void) | undefined;
      try {
        const outcome = await mutator();
        cleanup = outcome.cleanup;
        if ('errorStatus' in outcome) {
          cleanup?.();
          restoreStateSnapshot(snapshot);
          res.status(outcome.errorStatus).json(outcome.errorBody);
          resolve();
          return;
        }
        const saveRes = savePersistentStore();
        if (!saveRes.saved) {
          cleanup?.();
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
        cleanup?.();
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
        demoModeEnabled = Boolean(saved.demoModeEnabled);
        primaryDisplayCurrency = saved.primaryDisplayCurrency || 'INR';
        confirmedAccountCurrencies = saved.confirmedAccountCurrencies || {};
        demoSimulatedRows = saved.demoSimulatedRows || [];
        demoCommitmentOverrides = saved.demoCommitmentOverrides || {};
        demoServiceTerms = saved.demoServiceTerms || [];
        demoMandates = saved.demoMandates || [];
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
  primaryDisplayCurrency = 'INR';
  confirmedAccountCurrencies = {};
  demoSimulatedRows = [];
  demoCommitmentOverrides = {};
  demoServiceTerms = [];
  demoMandates = [];
  auditEventsStore = buildInitialSeedAuditEvents();
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

function buildInitialSeedAuditEvents(): AuditEventRecord[] {
  return [
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
}

export function resetDemoDataOnly(): {
  commitmentsCount: number;
  transactionsCount: number;
  preservedUserRecords: {
    transactions: number;
    mandates: number;
    serviceTerms: number;
    guardrails: number;
    auditEvents: number;
  };
} {
  // 1. Reset ephemeral demo simulations and demo-specific overrides
  demoSimulatedRows = [];
  demoCommitmentOverrides = {};
  demoServiceTerms = [];
  demoMandates = [];

  // 2. Preserve user-imported transactions (rows belonging to user import batches or not DEMO_SEED/DEMO_SIMULATION)
  const csvPath = path.resolve(process.cwd(), 'data/synthetic-transactions.csv');
  const baseSeedRows = parseCsvTextRFC4180(fs.readFileSync(csvPath, 'utf-8'));
  const baseSeedFingerprints = new Set(
    baseSeedRows.map((row) => computeCanonicalTxnFingerprint(row))
  );
  const userRows = (rawCsvRows || []).filter((r) => {
    const sourceType = String(r.source_type || '').trim().toUpperCase();
    const importBatch = String(r.import_batch_id || '').trim().toUpperCase();
    const explicitlyDemo = sourceType === 'DEMO_SEED' || sourceType === 'DEMO_SIMULATION';
    const explicitlySeedBatch = importBatch === 'BATCH-SEED-01';
    const explicitlyUserOwned = Boolean(sourceType || importBatch) && !explicitlyDemo && !explicitlySeedBatch;
    const isUnclassifiedSeedDuplicate =
      !sourceType && !importBatch && baseSeedFingerprints.has(computeCanonicalTxnFingerprint(r));
    return !explicitlyDemo && !explicitlySeedBatch && (explicitlyUserOwned || !isUnclassifiedSeedDuplicate);
  });

  rawCsvRows = [...baseSeedRows, ...userRows];

  // 3. Preserve user mandates (sourceType !== 'DEMO_SEED')
  const userMandates = (mandatesStore || []).filter((m) => m.sourceType !== 'DEMO_SEED');
  mandatesStore = [...buildInitialSeedMandates(), ...userMandates];

  // 4. Preserve user service terms (sourceType !== 'DEMO_SEED')
  const userTerms = (serviceTermsStore || []).filter((t) => t.sourceType !== 'DEMO_SEED');
  serviceTermsStore = [...buildInitialSeedServiceTerms(), ...userTerms];

  // 5. Preserve user guardrails (sourceType !== 'DEMO_SEED')
  const userGuardrails = (guardrailsStore || []).filter((g) => g.sourceType !== 'DEMO_SEED');
  guardrailsStore = [...userGuardrails];

  // 6. User overrides (userMerchantOverrides, userCommitmentOverrides, merchantConfirmationsStore, customCasebookEntries, investigationCasesStore, confirmedAccountCurrencies) are preserved intact!

  // 7. Preserve user import batches
  const userBatches = (importHistory || []).filter(
    (b) =>
      b.id !== 'BATCH-SEED-01' &&
      b.id !== 'BATCH-NOTIF-01' &&
      b.id !== 'BATCH-MANDATE-01' &&
      b.id !== 'BATCH-DOCS-01'
  );
  importHistory = [
    {
      id: 'BATCH-SEED-01',
      filename: 'synthetic-transactions.csv',
      sourceType: 'CSV_STATEMENT',
      totalRecords: baseSeedRows.length,
      acceptedRecords: baseSeedRows.length,
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
    ...userBatches,
  ];

  // 8. Preserve user audit events and record a sentinel reset audit event
  const userEvents = (auditEventsStore || []).filter(
    (e) => e.actor !== 'DEMO_SEED_SCENARIO' && !e.id.startsWith('AUD-SEED-')
  );
  auditEventsStore = [
    ...buildInitialSeedAuditEvents(),
    ...userEvents,
    {
      id: `AUD-DEMO-RESET-${Date.now()}`,
      commitmentId: 'SYSTEM',
      timestamp: new Date().toISOString(),
      eventType: 'DEMO_DATA_RESET',
      summary: `Demo baseline reset executed. Preserved ${userRows.length} canonical user transactions, ${userMandates.length} user mandates, ${userTerms.length} user service terms, ${userGuardrails.length} user guardrails, and user audit trails.`,
      previousState: null,
      newState: 'PRESERVED_USER_DATA_DEMO_BASELINE',
      actor: 'DEMO_SEED_SCENARIO',
    },
  ];

  savePersistentStore();
  const state = computeCurrentState();
  return {
    commitmentsCount: state.commitments.length,
    transactionsCount: state.transactions.length,
    preservedUserRecords: {
      transactions: userRows.length,
      mandates: userMandates.length,
      serviceTerms: userTerms.length,
      guardrails: userGuardrails.length,
      auditEvents: userEvents.length,
    },
  };
}

loadSeedData(false);

export function computeCurrentState() {
  const effectiveRawRows = demoModeEnabled
    ? [
        ...rawCsvRows.map((r) => {
          const demoRowReplacement = demoSimulatedRows.find(
            (dr) => dr.transaction_id === r.transaction_id && (dr as any).__replacesBaseRow
          );
          return demoRowReplacement || r;
        }),
        ...demoSimulatedRows.filter((dr) => !(dr as any).__replacesBaseRow),
      ]
    : rawCsvRows;

  const { transactions, invalidRows, duplicateRows } = parseAndNormaliseTransactions(
    effectiveRawRows,
    'BATCH-SEED-01',
    'DEMO_SEED',
    userMerchantOverrides,
    undefined,
    confirmedAccountCurrencies
  );

  // Merge demoCommitmentOverrides ONLY when demoModeEnabled is true, without overwriting user overrides
  const effectiveCommitmentOverrides: Record<string, UserCommitmentStateOverride> = {
    ...userCommitmentOverrides,
  };
  if (demoModeEnabled) {
    for (const [cmtId, demoOvr] of Object.entries(demoCommitmentOverrides)) {
      if (!effectiveCommitmentOverrides[cmtId]) {
        effectiveCommitmentOverrides[cmtId] = demoOvr;
      } else {
        effectiveCommitmentOverrides[cmtId] = {
          ...demoOvr,
          ...effectiveCommitmentOverrides[cmtId],
        };
      }
    }
  }

  const { commitments, alerts, playbooks, sessions } = detectCommitmentsAndAlerts(
    transactions,
    notificationEvents,
    effectiveCommitmentOverrides
  );

  for (const alt of alerts) {
    if (alertStatusOverrides[alt.id]) {
      alt.status = alertStatusOverrides[alt.id];
    }
  }

  const effectiveMandates = getEffectiveMandates();
  const effectiveServiceTerms = getEffectiveServiceTerms();

  const reconciliationFindings = runFullReconciliation({
    commitments,
    transactions,
    mandates: effectiveMandates,
    serviceTerms: effectiveServiceTerms,
    sessions,
  });



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
    demoModeEnabled,
    primaryDisplayCurrency,
    confirmedAccountCurrencies,
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
  if (!demoModeEnabled) {
    res.status(403).json({
      error: 'Demo Mode is disabled. Enable Demo Mode before rebuilding demo graph data.',
      code: 'DEMO_MODE_DISABLED',
    });
    return;
  }
  try {
    const state = computeCurrentState();
    if (simulateGraphSyncFailureForTesting) {
      await Promise.resolve();
      throw new Error('Simulated Neo4j graph projection failure for testing');
    }
    const rebuildResult = await neo4jPersistenceService.rebuildDemoGraphInNeo4j({
      transactions: state.transactions,
      commitments: state.commitments,
      alerts: state.alerts,
      playbooks: state.playbooks,
      sessions: state.sessions,
      notifications: notificationEvents,
      mandates: getEffectiveMandates(),
      serviceTerms: getEffectiveServiceTerms(),
      reconciliationFindings: state.reconciliationFindings,
    });
    const projectionFailed = rebuildResult.rebuilt === false;
    res.status(projectionFailed ? 502 : 200).json({
      ...rebuildResult,
      commitmentsCount: state.commitments.length,
      transactionsCount: state.transactions.length,
      projectionStatus: projectionFailed ? 'FAILED' : 'REBUILT',
      canonicalPersistenceStatus: 'UNCHANGED',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: `Graph projection rebuild failed; canonical persisted records were left unchanged: ${message}`,
      projectionStatus: 'FAILED',
      canonicalPersistenceStatus: 'UNCHANGED',
    });
  }
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
app.get('/api/demo/mode', (_req, res) => {
  res.json({
    demoModeEnabled,
  });
});

app.post('/api/demo/mode', async (req, res) => {
  const { enabled } = (req.body || {}) as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'Boolean "enabled" parameter is required.' });
    return;
  }
  await executeSerializedMutation(res, () => {
    demoModeEnabled = enabled;
    const state = computeCurrentState();
    return {
      syncGraph: false,
      body: {
        demoModeEnabled,
        commitmentsCount: state.commitments.length,
        transactionsCount: state.transactions.length,
      },
    };
  });
});

app.get('/api/settings/preferences', (_req, res) => {
  res.json({
    primaryDisplayCurrency,
    confirmedAccountCurrencies,
    demoModeEnabled,
  });
});

app.patch('/api/settings/preferences', async (req, res) => {
  const { primaryCurrency, confirmedAccountCurrencies: incomingAccountMap } = (req.body || {}) as {
    primaryCurrency?: string;
    confirmedAccountCurrencies?: Record<string, string>;
  };
  await executeSerializedMutation(res, () => {
    if (primaryCurrency !== undefined) {
      const norm = normalizeCurrencyCode(primaryCurrency);
      if (!norm) {
        return {
          errorStatus: 400,
          errorBody: { error: `Unsupported primaryDisplayCurrency "${primaryCurrency}".` },
        };
      }
      primaryDisplayCurrency = norm;
    }
    if (incomingAccountMap && typeof incomingAccountMap === 'object') {
      const nextMap: Record<string, string> = { ...confirmedAccountCurrencies };
      for (const [alias, curr] of Object.entries(incomingAccountMap)) {
        if (!curr) {
          delete nextMap[alias];
          continue;
        }
        const norm = normalizeCurrencyCode(curr);
        if (!norm) {
          return {
            errorStatus: 400,
            errorBody: {
              error: `Unsupported confirmed account currency "${curr}" for account "${alias}".`,
            },
          };
        }
        nextMap[alias.trim()] = norm;
      }
      confirmedAccountCurrencies = nextMap;
    }
    return {
      syncGraph: false,
      body: {
        primaryDisplayCurrency,
        confirmedAccountCurrencies,
        demoModeEnabled,
      },
    };
  });
});

app.get('/api/state', (_req, res) => {
  const state = computeCurrentState();
  res.json(state);
});

app.get('/api/dashboard/summary', (req, res) => {
  const state = computeCurrentState();
  const activeCommitments = state.commitments.filter(
    (c) => c.status !== 'CANCELLED_USER_CONFIRMED' && c.verificationStatus !== 'REJECTED'
  );

  const requestedCurrency = req.query.currency
    ? normalizeCurrencyCode(String(req.query.currency))
    : null;
  const primaryCurrency = requestedCurrency || primaryDisplayCurrency || 'INR';

  const totalsByCurrency: Record<
    string,
    {
      currency: string;
      currencyStatus: 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
      monthlyRecurringSpend: number;
      monthlyRecurringSpendExact: string | null;
      annualCommitmentTotal: number;
      annualCommitmentTotalExact: string | null;
      discretionaryAnnual: number;
      discretionaryAnnualExact: string | null;
      obligationAnnual: number;
      obligationAnnualExact: string | null;
      activeCommitmentsCount: number;
    }
  > = {};

  for (const c of activeCommitments) {
    const rawCurr =
      c.currency !== undefined && c.currency !== null ? String(c.currency).trim().toUpperCase() : '';
    const isUnknown = isUnknownCurrency(rawCurr);
    const isSupported = !isUnknown && isValidCurrencyCode(rawCurr);
    const currKey = isUnknown ? UNKNOWN_CURRENCY : rawCurr;
    const currencyStatus: 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN' = isUnknown
      ? 'UNKNOWN'
      : isSupported
      ? 'SUPPORTED'
      : 'UNSUPPORTED';

    if (!totalsByCurrency[currKey]) {
      totalsByCurrency[currKey] = {
        currency: currKey,
        currencyStatus,
        monthlyRecurringSpend: 0,
        monthlyRecurringSpendExact: '0',
        annualCommitmentTotal: 0,
        annualCommitmentTotalExact: '0',
        discretionaryAnnual: 0,
        discretionaryAnnualExact: '0',
        obligationAnnual: 0,
        obligationAnnualExact: '0',
        activeCommitmentsCount: 0,
      };
    }
    const bucket = totalsByCurrency[currKey];
    const addExact = (current: string | null, value: string | null | undefined): string | null =>
      current !== null && value !== null && value !== undefined
        ? (BigInt(current) + BigInt(value)).toString()
        : null;
    bucket.monthlyRecurringSpendExact = addExact(
      bucket.monthlyRecurringSpendExact,
      c.monthlyEquivalentExact
    );
    bucket.annualCommitmentTotalExact = addExact(
      bucket.annualCommitmentTotalExact,
      c.annualisedAmountExact
    );
    if (c.isFinancialObligation) {
      bucket.obligationAnnualExact = addExact(
        bucket.obligationAnnualExact,
        c.annualisedAmountExact
      );
    } else {
      bucket.discretionaryAnnualExact = addExact(
        bucket.discretionaryAnnualExact,
        c.annualisedAmountExact
      );
    }
    if (c.monthlyEquivalent !== null) {
      bucket.monthlyRecurringSpend = Number(
        (bucket.monthlyRecurringSpend + c.monthlyEquivalent).toFixed(2)
      );
    }
    if (c.annualisedAmount !== null) {
      bucket.annualCommitmentTotal = Number(
        (bucket.annualCommitmentTotal + c.annualisedAmount).toFixed(2)
      );
    }
    if (c.isFinancialObligation) {
      if (c.annualisedAmount !== null) {
        bucket.obligationAnnual = Number(
          (bucket.obligationAnnual + c.annualisedAmount).toFixed(2)
        );
      }
    } else {
      if (c.annualisedAmount !== null) {
        bucket.discretionaryAnnual = Number(
          (bucket.discretionaryAnnual + c.annualisedAmount).toFixed(2)
        );
      }
    }
    bucket.activeCommitmentsCount += 1;
  }

  const primaryBucket = totalsByCurrency[primaryCurrency] || {
    currency: primaryCurrency,
    currencyStatus: 'SUPPORTED' as const,
    monthlyRecurringSpend: 0,
    monthlyRecurringSpendExact: '0',
    annualCommitmentTotal: 0,
    annualCommitmentTotalExact: '0',
    discretionaryAnnual: 0,
    discretionaryAnnualExact: '0',
    obligationAnnual: 0,
    obligationAnnualExact: '0',
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
  const unsupportedCurrenciesCount = currencySummaries
    .filter((cs) => cs.currencyStatus === 'UNSUPPORTED')
    .reduce((sum, cs) => sum + cs.activeCommitmentsCount, 0);

  const unknownCurrencyTxnsCount = state.transactions.filter(
    (t) => t.currency === UNKNOWN_CURRENCY || isUnknownCurrency(t.currency)
  ).length;
  const unknownCurrencyCommitmentsCount =
    totalsByCurrency[UNKNOWN_CURRENCY]?.activeCommitmentsCount || 0;
  const excludedUnknownCurrencyCount =
    unknownCurrencyCommitmentsCount + unknownCurrencyTxnsCount;
  const primaryCurrencyTransactions = state.transactions.filter(
    (transaction) =>
      transaction.currency === primaryCurrency &&
      transaction.amountMinorExact !== null &&
      transaction.amountMinorExact !== undefined
  );
  const totalDebitAmountExact = primaryCurrencyTransactions
    .filter((transaction) => transaction.direction === 'DEBIT')
    .reduce((sum, transaction) => sum + BigInt(transaction.amountMinorExact!), 0n);
  const unresolvedDebitAmountExact = primaryCurrencyTransactions
    .filter(
      (transaction) =>
        transaction.direction === 'DEBIT' && transaction.resolutionStatus === 'UNRESOLVED'
    )
    .reduce((sum, transaction) => sum + BigInt(transaction.amountMinorExact!), 0n);
  const exactMinorToLegacyAmount = (minor: bigint): number | null =>
    minor <= BigInt(Number.MAX_SAFE_INTEGER) && minor >= BigInt(Number.MIN_SAFE_INTEGER)
      ? fromMinorUnitsStrict(Number(minor), primaryCurrency)
      : null;

  res.json({
    primaryCurrency,
    monthlyRecurringSpend: primaryBucket.monthlyRecurringSpend,
    monthlyRecurringSpendExact: primaryBucket.monthlyRecurringSpendExact,
    annualCommitmentTotal: primaryBucket.annualCommitmentTotal,
    annualCommitmentTotalExact: primaryBucket.annualCommitmentTotalExact,
    discretionaryAnnual: primaryBucket.discretionaryAnnual,
    discretionaryAnnualExact: primaryBucket.discretionaryAnnualExact,
    obligationAnnual: primaryBucket.obligationAnnual,
    obligationAnnualExact: primaryBucket.obligationAnnualExact,
    totalsByCurrency,
    currencySummaries,
    unknownCurrencyCommitmentsCount,
    unknownCurrencyTransactionsCount: unknownCurrencyTxnsCount,
    excludedUnknownCurrencyCount,
    unsupportedCurrenciesCount,
    isMultiCurrency: currencySummaries.length > 1,
    totalDebitAmount: exactMinorToLegacyAmount(totalDebitAmountExact),
    totalDebitAmountExact: totalDebitAmountExact.toString(),
    unresolvedDebitAmount: exactMinorToLegacyAmount(unresolvedDebitAmountExact),
    unresolvedDebitAmountExact: unresolvedDebitAmountExact.toString(),
    activeCommitmentsCount: activeCommitments.length,
    totalCommitmentsCount: state.commitments.length,
    upcomingPaymentsCount: activeCommitments.filter((c) => Boolean(c.nextExpectedDate)).length,
    priceChangeAlertsCount,
    reviewRequiredCount,
    totalAlertsCount: state.alerts.filter((a) => a.status === 'OPEN').length,
    unresolvedTransactionsCount: unresolvedTxnsCount,
    demoModeEnabled,
  });
});

app.get('/api/dashboard/monthly-trend', (req, res) => {
  const state = computeCurrentState();
  const targetCurrency = String(req.query.currency || primaryDisplayCurrency || 'INR')
    .trim()
    .toUpperCase();
  const requestedMonthsCount = Math.min(
    24,
    Math.max(1, Number(req.query.months) || 5)
  );

  const explicitReferenceDate = req.query.referenceDate
    ? normalizeDateString(String(req.query.referenceDate))
    : null;

  let anchorDateISO = explicitReferenceDate;
  if (!anchorDateISO) {
    const currencyDebitDates = state.transactions
      .filter(
        (t) =>
          t.direction === 'DEBIT' &&
          !isUnknownCurrency(t.currency) &&
          (normalizeCurrencyCode(t.currency) || String(t.currency).trim().toUpperCase()) ===
            targetCurrency
      )
      .map((t) => t.transactionDate)
      .sort();
    anchorDateISO =
      currencyDebitDates.length > 0
        ? currencyDebitDates[currencyDebitDates.length - 1]
        : getRuntimeDateISO();
  }

  const months = getDynamicMonthWindow(anchorDateISO, requestedMonthsCount);
  const obligationIds = new Set(
    state.commitments.filter((c) => c.isFinancialObligation).map((c) => c.id)
  );
  const toExactMinor = (transaction: TransactionRecord): bigint | null => {
    if (transaction.amountMinorExact !== null && transaction.amountMinorExact !== undefined) {
      return BigInt(transaction.amountMinorExact);
    }
    if (transaction.amountMinor !== null && transaction.amountMinor !== undefined) {
      return BigInt(transaction.amountMinor);
    }
    const converted = toMinorUnitsStrict(transaction.amountExact ?? transaction.amount, targetCurrency);
    return converted === null ? null : BigInt(converted);
  };
  const allTargetDebitMinors = state.transactions
    .filter(
      (t) =>
        t.direction === 'DEBIT' &&
        !isUnknownCurrency(t.currency) &&
        (normalizeCurrencyCode(t.currency) || String(t.currency).trim().toUpperCase()) ===
          targetCurrency
    )
    .map(toExactMinor)
    .filter((value): value is bigint => value !== null);
  const globalAbsoluteMinor = allTargetDebitMinors.reduce((sum, value) => {
    const absolute = value < 0n ? -value : value;
    return sum + absolute;
  }, 0n);
  const requiresRelativeChartScale =
    globalAbsoluteMinor > BigInt(Number.MAX_SAFE_INTEGER);

  const trend = months.map((m) => {
    const monthTxns = state.transactions.filter(
      (t) =>
        t.direction === 'DEBIT' &&
        t.transactionDate.startsWith(m) &&
        !isUnknownCurrency(t.currency) &&
        (normalizeCurrencyCode(t.currency) || String(t.currency).trim().toUpperCase()) ===
          targetCurrency
    );
    const subscriptionsMinorExact = monthTxns
      .filter(
        (t) =>
          t.commitmentId &&
          !obligationIds.has(t.commitmentId) &&
          !['CMT-BAJAJEMI', 'CMT-MAXLIFE', 'CMT-BESCOM'].includes(t.commitmentId)
      )
      .reduce(
        (sum, transaction) =>
          toExactMinor(transaction) === null ? sum : sum + toExactMinor(transaction)!,
        0n
      );
    const obligationsMinorExact = monthTxns
      .filter(
        (t) =>
          t.commitmentId &&
          (obligationIds.has(t.commitmentId) ||
            ['CMT-BAJAJEMI', 'CMT-MAXLIFE', 'CMT-BESCOM'].includes(t.commitmentId))
      )
      .reduce(
        (sum, transaction) =>
          toExactMinor(transaction) === null ? sum : sum + toExactMinor(transaction)!,
        0n
      );
    const unresolvedMinorExact = monthTxns
      .filter((t) => t.resolutionStatus === 'UNRESOLVED')
      .reduce(
        (sum, transaction) =>
          toExactMinor(transaction) === null ? sum : sum + toExactMinor(transaction)!,
        0n
      );
    const totalMinorExact =
      subscriptionsMinorExact + obligationsMinorExact + unresolvedMinorExact;
    const monthAbsoluteMinor = [
      subscriptionsMinorExact,
      obligationsMinorExact,
      unresolvedMinorExact,
      totalMinorExact,
    ].reduce((max, value) => {
      const absolute = value < 0n ? -value : value;
      return absolute > max ? absolute : max;
    }, 0n);
    const chartScaleMinor =
      requiresRelativeChartScale ? globalAbsoluteMinor : monthAbsoluteMinor;
    const chartUnits = (minor: bigint): number => {
      if (chartScaleMinor === 0n) return 0;
      if (!requiresRelativeChartScale) {
        return fromMinorUnitsStrict(Number(minor), targetCurrency) ?? 0;
      }
      const scaled = (minor * 1000000n) / chartScaleMinor;
      if (scaled === 0n && minor !== 0n) return minor < 0n ? -0.000001 : 0.000001;
      return Number(scaled) / 1000000;
    };
    return {
      month: m,
      currency: targetCurrency,
      currencyPrecision: getCurrencyDecimalsOrNull(targetCurrency),
      subscriptions: chartUnits(subscriptionsMinorExact),
      subscriptionsMinorExact: subscriptionsMinorExact.toString(),
      obligations: chartUnits(obligationsMinorExact),
      obligationsMinorExact: obligationsMinorExact.toString(),
      unresolved: chartUnits(unresolvedMinorExact),
      unresolvedMinorExact: unresolvedMinorExact.toString(),
      total: chartUnits(totalMinorExact),
      totalMinorExact: totalMinorExact.toString(),
      chartScaleMinorExact: chartScaleMinor.toString(),
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
    recurrenceType?: RecurrenceFrequency | null;
    nextExpectedDate?: string | null;
    lastUsedDate?: string | null;
  };

  const validOverrideFrequencies: RecurrenceFrequency[] = [
    'WEEKLY',
    'FORTNIGHTLY',
    'MONTHLY',
    'QUARTERLY',
    'HALF_YEARLY',
    'YEARLY',
    'IRREGULAR',
    'ONE_TIME',
  ];
  if (
    recurrenceType !== undefined &&
    recurrenceType !== null &&
    !validOverrideFrequencies.includes(recurrenceType)
  ) {
    res.status(400).json({
      error: 'Invalid recurrenceType override',
      code: 'INVALID_RECURRENCE_FREQUENCY',
    });
    return;
  }

  await executeSerializedMutation(res, () => {
    const current = userCommitmentOverrides[id] || {};
    const nextOverride = { ...current };
    if (recurrenceType === null) {
      delete nextOverride.recurrenceTypeOverride;
    } else if (recurrenceType !== undefined) {
      nextOverride.recurrenceTypeOverride = recurrenceType;
    }
    userCommitmentOverrides[id] = {
      ...nextOverride,
      ...(typicalAmount !== undefined ? { typicalAmountOverride: Number(typicalAmount) } : {}),
      ...(expectedAmountMinor !== undefined
        ? { expectedAmountMinorOverride: Number(expectedAmountMinor) }
        : {}),
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
      if (isForgedPrivilegedProvenance((item as any).sourceType)) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Client-forged privileged sourceType "${(item as any).sourceType}" is not permitted on user mandate imports.`,
            code: 'FORGED_PROVENANCE_REJECTED',
          },
        };
      }
      if (!item.mandateReference) {
        rejectedRows++;
        continue;
      }
      const cleanRef = String(item.mandateReference).trim();
      if (!cleanRef) {
        rejectedRows++;
        continue;
      }

      const rawCurr =
        item.currency !== undefined && item.currency !== null ? String(item.currency).trim() : '';
      const validCurrency = rawCurr ? normalizeCurrencyCode(rawCurr) : null;
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
          maxAmount = fromMinorUnitsStrict(maxMinor, validCurrency);
        }
      } else if (item.maxAmount !== undefined && item.maxAmount !== null && String(item.maxAmount) !== '') {
        const parsed = parseStrictAmount(item.maxAmount);
        if (parsed !== null && parsed > 0) {
          maxMinor = toMinorUnitsStrict(parsed, validCurrency);
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

  if (isForgedPrivilegedProvenance((req.body || {}).sourceType)) {
    res.status(400).json({
      error: `Client-forged privileged sourceType "${(req.body || {}).sourceType}" is not permitted on user service document submissions.`,
      code: 'FORGED_PROVENANCE_REJECTED',
    });
    return;
  }

  await executeSerializedMutation(res, () => {
    const stateBefore = computeCurrentState();
    const targetCmt = stateBefore.commitments.find((c) => c.id === commitmentId);
    const existingDoc = serviceTermsStore.find((s) => s.commitmentId === commitmentId) || null;

    if (currency !== undefined && currency !== null && String(currency).trim() !== '' && !isValidCurrencyCode(currency)) {
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
      if (currency && isValidCurrencyCode(currency)) {
        docRecord.currency = normalizeCurrencyCode(currency)!;
      }
      if (expectedAmountMinor !== undefined || expectedAmount !== undefined) {
        if (expectedAmountMinor === null || expectedAmount === null) {
          docRecord.expectedAmountMinor = null;
          docRecord.expectedAmount = null;
        } else if (isValidCurrencyCode(docRecord.currency)) {
          const minor =
            expectedAmountMinor !== undefined
              ? Number(expectedAmountMinor)
              : toMinorUnitsStrict(Number(expectedAmount), docRecord.currency);
          docRecord.expectedAmountMinor = minor;
          docRecord.expectedAmount = fromMinorUnitsStrict(minor, docRecord.currency);
        } else {
          return {
            errorStatus: 400,
            errorBody: {
              error: 'Cannot convert expectedAmount to minor units without a valid supported currency.',
            },
          };
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
        currency: currency && isValidCurrencyCode(currency) ? normalizeCurrencyCode(currency)! : existingDoc.currency,
        billingFrequency: billingFrequency || existingDoc.billingFrequency,
        userVerified: isVerified,
        extractedFields: existingDoc.extractedFields.map((f) => ({
          ...f,
          userVerified: isVerified,
        })),
      };
    } else {
      const isVerified = userVerified !== undefined ? Boolean(userVerified) : true;
      const candidateCurrency =
        currency ||
        (existingDoc?.currency && !isUnknownCurrency(existingDoc.currency)
          ? existingDoc.currency
          : null) ||
        (targetCmt?.currency && !isUnknownCurrency(targetCmt.currency) ? targetCmt.currency : null);
      const effectiveCurrency = candidateCurrency
        ? normalizeCurrencyCode(candidateCurrency) || UNKNOWN_CURRENCY
        : UNKNOWN_CURRENCY;

      if (
        (expectedAmountMinor !== undefined || expectedAmount !== undefined) &&
        effectiveCurrency === UNKNOWN_CURRENCY
      ) {
        return {
          errorStatus: 400,
          errorBody: {
            error:
              'Explicit currency is required when specifying expectedAmount or expectedAmountMinor for a commitment without an established currency.',
          },
        };
      }

      const minorLabel =
        effectiveCurrency !== UNKNOWN_CURRENCY ? getMinorUnitLabel(effectiveCurrency) : 'minor units';
      const minor =
        expectedAmountMinor !== undefined && expectedAmountMinor !== null
          ? Number(expectedAmountMinor)
          : expectedAmount !== undefined && expectedAmount !== null && effectiveCurrency !== UNKNOWN_CURRENCY
          ? toMinorUnitsStrict(Number(expectedAmount), effectiveCurrency)
          : existingDoc?.expectedAmountMinor ?? null;
      const major =
        minor !== null && effectiveCurrency !== UNKNOWN_CURRENCY
          ? fromMinorUnitsStrict(minor, effectiveCurrency)
          : null;
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
    documentUploaded = false,
    sourceType,
  } = (req.body || {}) as {
    category?: EvidenceCasebookEntry['category'];
    title: string;
    description: string;
    sourceReference: string;
    amountMinor?: number | null;
    evidenceDate?: string | null;
    documentUploaded?: boolean;
    sourceType?: RecordSourceProvenance;
  };

  if (documentUploaded === true) {
    res.status(400).json({
      error:
        'This reference-only endpoint cannot establish an uploaded document. Upload file bytes through POST /api/cancellation/sessions/:id/evidence.',
      code: 'DOCUMENT_UPLOAD_REQUIRES_FILE_BYTES',
    });
    return;
  }

  if (isForgedPrivilegedProvenance(sourceType)) {
    res.status(400).json({
      error: `Client-forged privileged sourceType "${sourceType}" is not permitted on user evidence submissions.`,
      code: 'FORGED_PROVENANCE_REJECTED',
    });
    return;
  }

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
      currency: targetCmt.currency || UNKNOWN_CURRENCY,
      sourceType: 'USER_ENTERED',
      evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
      verificationStatus: 'USER_CONFIRMED',
      actor: 'USER_CASEBOOK_ATTACHMENT',
    };
    customCasebookEntries.push(entry);

    recordAuditEvent({
      commitmentId: id,
      eventType: 'EVIDENCE_ATTACHED',
      summary: `Attached evidence reference "${title}" (Ref: ${sourceReference}${
        parsedEvidenceDate ? `, Date: ${parsedEvidenceDate}` : ''
      }).`,
      previousState: null,
      newState: sourceReference,
    });

    const state = computeCurrentState();
    const cmt = state.commitments.find((c) => c.id === id)!;
    const effectiveMandates = getEffectiveMandates();
    const effectiveServiceTerms = getEffectiveServiceTerms();
    const mandate =
      effectiveMandates.find(
        (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
      ) || null;
    const serviceTerms = effectiveServiceTerms.find((s) => s.commitmentId === cmt.id) || null;
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
  const {
    serviceLifecycleStatus,
    referenceNumber,
    evidenceId,
    notes,
    effectiveDate,
    evidenceDate,
    requestDate,
    acknowledgementDate,
    documentUploaded,
    documentName,
    sourceType,
    verifiedConfirmation,
  } = (req.body || {}) as {
    serviceLifecycleStatus: ServiceLifecycleStatus;
    referenceNumber?: string;
    evidenceId?: string;
    notes?: string;
    effectiveDate?: string | null;
    evidenceDate?: string | null;
    requestDate?: string | null;
    acknowledgementDate?: string | null;
    documentUploaded?: boolean;
    documentName?: string | null;
    sourceType?: RecordSourceProvenance;
    verifiedConfirmation?: boolean;
  };

  if (documentUploaded === true || (typeof documentName === 'string' && documentName.trim())) {
    res.status(400).json({
      error:
        'Lifecycle status endpoints accept reference-only evidence. Upload file bytes through POST /api/cancellation/sessions/:id/evidence and link the resulting evidence record.',
      code: 'DOCUMENT_UPLOAD_REQUIRES_FILE_BYTES',
    });
    return;
  }

  if (
    !serviceLifecycleStatus ||
    !ALLOWED_SERVICE_LIFECYCLE_STATUSES.includes(serviceLifecycleStatus)
  ) {
    res.status(400).json({
      error: `Invalid serviceLifecycleStatus "${serviceLifecycleStatus}". Allowed values: ${ALLOWED_SERVICE_LIFECYCLE_STATUSES.join(', ')}.`,
      code: 'INVALID_SERVICE_LIFECYCLE_STATUS',
    });
    return;
  }

  if (isForgedPrivilegedProvenance(sourceType)) {
    res.status(400).json({
      error: `Client-forged privileged sourceType "${sourceType}" is not permitted on user lifecycle updates.`,
      code: 'FORGED_PROVENANCE_REJECTED',
    });
    return;
  }

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

    let parsedEffectiveDate: string | null = null;
    if (effectiveDate !== null && effectiveDate !== undefined && String(effectiveDate).trim() !== '') {
      parsedEffectiveDate = normalizeDateString(String(effectiveDate));
      if (!parsedEffectiveDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid effectiveDate "${effectiveDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    let parsedEvidDate: string | null = null;
    if (evidenceDate !== null && evidenceDate !== undefined && String(evidenceDate).trim() !== '') {
      parsedEvidDate = normalizeDateString(String(evidenceDate));
      if (!parsedEvidDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid evidenceDate "${evidenceDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    let parsedRequestDate: string | null | undefined = undefined;
    if (requestDate !== undefined) {
      if (requestDate === null || String(requestDate).trim() === '') {
        parsedRequestDate = null;
      } else {
        parsedRequestDate = normalizeDateString(String(requestDate));
        if (!parsedRequestDate) {
          return {
            errorStatus: 400,
            errorBody: { error: `Invalid requestDate "${requestDate}".` },
          };
        }
      }
    }

    let parsedAckDate: string | null | undefined = undefined;
    if (acknowledgementDate !== undefined) {
      if (acknowledgementDate === null || String(acknowledgementDate).trim() === '') {
        parsedAckDate = null;
      } else {
        parsedAckDate = normalizeDateString(String(acknowledgementDate));
        if (!parsedAckDate) {
          return {
            errorStatus: 400,
            errorBody: { error: `Invalid acknowledgementDate "${acknowledgementDate}".` },
          };
        }
      }
    }

    if (
      (serviceLifecycleStatus === 'ACTIVE' ||
        serviceLifecycleStatus === 'CANCELLATION_REQUESTED') &&
      parsedEffectiveDate !== null
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `effectiveDate cannot be set when Layer A status is ${serviceLifecycleStatus}. Use requestDate for CANCELLATION_REQUESTED.`,
          code: 'EFFECTIVE_DATE_NOT_ALLOWED_FOR_STATUS',
        },
      };
    }

    const isServiceCompletion =
      serviceLifecycleStatus === 'CANCELLATION_REPORTED_BY_USER' ||
      serviceLifecycleStatus === 'CANCELLATION_EVIDENCE_ATTACHED' ||
      serviceLifecycleStatus === 'CANCELLATION_VERIFIED' ||
      serviceLifecycleStatus === 'CANCELLED';

    const cmtId = sess.commitmentId;
    const prevCmt = state.commitments.find((c) => c.id === cmtId);

    const currentOverride = userCommitmentOverrides[cmtId] || {};
    const existingEvid = currentOverride.evidenceRecords ?? sess.evidence;
    const updatedEvid = [...existingEvid];

    const existingEffectiveDate =
      currentOverride.serviceCancelledAtOverride ?? sess.serviceCancelledAt ?? null;

    if (
      serviceLifecycleStatus === 'CANCELLED' &&
      !parsedEffectiveDate &&
      !existingEffectiveDate
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Setting Layer A status to CANCELLED requires a valid effectiveDate (YYYY-MM-DD).',
          code: 'EFFECTIVE_DATE_REQUIRED',
        },
      };
    }

    // Validate evidenceId if explicitly provided
    if (evidenceId !== undefined && evidenceId !== null && String(evidenceId).trim() !== '') {
      const cleanEvidId = String(evidenceId).trim();
      const matchedEvid = updatedEvid.find((e) => e.id === cleanEvidId);
      if (!matchedEvid || matchedEvid.cancellationSessionId !== sess.id) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Evidence record "${cleanEvidId}" does not exist or does not belong to commitment "${cmtId}" (session "${sess.id}").`,
            code: 'INVALID_EVIDENCE_LINK',
          },
        };
      }
      if (matchedEvid.evidenceType !== 'SERVICE_CONFIRMATION') {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Evidence record "${cleanEvidId}" has type "${matchedEvid.evidenceType}", which cannot satisfy Layer A SERVICE_CONFIRMATION.`,
            code: 'INVALID_EVIDENCE_LINK',
          },
        };
      }
    }

    const cleanRef = referenceNumber ? referenceNumber.trim() : '';
    const hasExistingServiceEvidence = updatedEvid.some(
      (e) =>
        e.cancellationSessionId === sess.id &&
        e.evidenceType === 'SERVICE_CONFIRMATION' &&
        Boolean(e.referenceNumber?.trim())
    );

    if (
      serviceLifecycleStatus === 'CANCELLATION_EVIDENCE_ATTACHED' &&
      !cleanRef &&
      !hasExistingServiceEvidence
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Cannot set Layer A status to CANCELLATION_EVIDENCE_ATTACHED without a valid SERVICE_CONFIRMATION evidence reference number.',
          code: 'EVIDENCE_REQUIRED',
        },
      };
    }

    if (serviceLifecycleStatus === 'CANCELLATION_VERIFIED') {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Cannot self-declare CANCELLATION_VERIFIED on user endpoints. Verification requires independent institutional confirmation or automated statement reconciliation.',
          code: 'UNVERIFIED_STATUS_REJECTED',
        },
      };
    }

    const assignedSourceType: RecordSourceProvenance = 'USER_ENTERED';

    if (cleanRef) {
      const evidType =
        serviceLifecycleStatus === 'MERCHANT_UNRESPONSIVE'
          ? 'MERCHANT_UNRESPONSIVE'
          : 'SERVICE_CONFIRMATION';
      const alreadyExists = updatedEvid.some(
        (e) =>
          e.referenceNumber === cleanRef &&
          e.evidenceType === evidType &&
          (e.evidenceDate ?? null) === (parsedEvidDate ?? null)
      );
      if (!alreadyExists) {
        updatedEvid.push({
          id: `EVID-SRV-${Date.now()}`,
          cancellationSessionId: sess.id,
          evidenceType: evidType,
          description: notes || `Service lifecycle updated to ${serviceLifecycleStatus}`,
          referenceNumber: cleanRef,
          evidenceDate: parsedEvidDate,
          ...(isServiceCompletion && parsedEffectiveDate ? { effectiveDate: parsedEffectiveDate } : {}),
          documentUploaded: false,
          evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
          sourceType: assignedSourceType,
          verificationStatus:
            serviceLifecycleStatus === 'CANCELLATION_EVIDENCE_ATTACHED'
              ? 'EVIDENCE_ATTACHED'
              : 'USER_REPORTED',
          createdAt: new Date().toISOString(),
        });
      }
    }

    const nextServiceCancelledAt = isServiceCompletion
      ? effectiveDate !== undefined
        ? parsedEffectiveDate
        : existingEffectiveDate
      : null;

    const historyList: EffectiveDateChangeRecord[] = [
      ...(currentOverride.effectiveDateHistory ?? sess.effectiveDateHistory ?? []),
    ];
    if (
      existingEffectiveDate &&
      nextServiceCancelledAt &&
      existingEffectiveDate !== nextServiceCancelledAt
    ) {
      const nowIso = new Date().toISOString();
      historyList.push({
        layer: 'SERVICE',
        previousDate: existingEffectiveDate,
        newDate: nextServiceCancelledAt,
        updatedAt: nowIso,
        changedAt: nowIso,
        sourceType: assignedSourceType,
        reason: notes || 'Corrected Layer A effective cancellation date',
      });
    }

    userCommitmentOverrides[cmtId] = {
      ...currentOverride,
      serviceLifecycleStatus,
      serviceCancelledAtOverride: nextServiceCancelledAt,
      ...(parsedRequestDate !== undefined
        ? { serviceCancellationRequestedAtOverride: parsedRequestDate }
        : {}),
      ...(parsedAckDate !== undefined
        ? { serviceCancellationAcknowledgedAtOverride: parsedAckDate }
        : {}),
      effectiveDateHistory: historyList,
      evidenceRecords: updatedEvid,
    };

    recordAuditEvent({
      commitmentId: cmtId,
      eventType: 'SERVICE_STATUS_UPDATED',
      summary: `Updated Layer A Service Lifecycle Status to ${serviceLifecycleStatus}${
        cleanRef ? ` (Ref: ${cleanRef})` : ''
      }${nextServiceCancelledAt ? ` [Effective Date: ${nextServiceCancelledAt}]` : ''}.`,
      previousState: `${prevCmt?.serviceLifecycleStatus || 'ACTIVE'}${
        sess.serviceCancelledAt ? ` (${sess.serviceCancelledAt})` : ''
      }`,
      newState: `${serviceLifecycleStatus}${
        nextServiceCancelledAt ? ` (${nextServiceCancelledAt})` : ''
      }`,
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
  const {
    mandateLifecycleStatus,
    referenceNumber,
    evidenceId,
    notes,
    revocationDate,
    effectiveDate,
    evidenceDate,
    requestDate,
    acknowledgementDate,
    documentUploaded,
    documentName,
    sourceType,
    verifiedConfirmation,
  } = (req.body || {}) as {
    mandateLifecycleStatus: MandateLifecycleStatus;
    referenceNumber?: string;
    evidenceId?: string;
    notes?: string;
    revocationDate?: string | null;
    effectiveDate?: string | null;
    evidenceDate?: string | null;
    requestDate?: string | null;
    acknowledgementDate?: string | null;
    documentUploaded?: boolean;
    documentName?: string | null;
    sourceType?: RecordSourceProvenance;
    verifiedConfirmation?: boolean;
  };

  if (documentUploaded === true || (typeof documentName === 'string' && documentName.trim())) {
    res.status(400).json({
      error:
        'Lifecycle status endpoints accept reference-only evidence. Upload file bytes through POST /api/cancellation/sessions/:id/evidence and link the resulting evidence record.',
      code: 'DOCUMENT_UPLOAD_REQUIRES_FILE_BYTES',
    });
    return;
  }

  if (
    !mandateLifecycleStatus ||
    !ALLOWED_MANDATE_LIFECYCLE_STATUSES.includes(mandateLifecycleStatus)
  ) {
    res.status(400).json({
      error: `Invalid mandateLifecycleStatus "${mandateLifecycleStatus}". Allowed values: ${ALLOWED_MANDATE_LIFECYCLE_STATUSES.join(', ')}.`,
      code: 'INVALID_MANDATE_LIFECYCLE_STATUS',
    });
    return;
  }

  if (isForgedPrivilegedProvenance(sourceType)) {
    res.status(400).json({
      error: `Client-forged privileged sourceType "${sourceType}" is not permitted on user mandate lifecycle updates.`,
      code: 'FORGED_PROVENANCE_REJECTED',
    });
    return;
  }

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

    const hasExplicitRevocationParam = revocationDate !== undefined || effectiveDate !== undefined;
    const rawRevocationInput = revocationDate !== undefined ? revocationDate : effectiveDate ?? null;
    let parsedRevocationDate: string | null = null;
    if (
      rawRevocationInput !== null &&
      rawRevocationInput !== undefined &&
      String(rawRevocationInput).trim() !== ''
    ) {
      parsedRevocationDate = normalizeDateString(String(rawRevocationInput));
      if (!parsedRevocationDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid revocationDate "${rawRevocationInput}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    let parsedEvidDate: string | null = null;
    if (evidenceDate !== null && evidenceDate !== undefined && String(evidenceDate).trim() !== '') {
      parsedEvidDate = normalizeDateString(String(evidenceDate));
      if (!parsedEvidDate) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid evidenceDate "${evidenceDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    let parsedRequestDate: string | null | undefined = undefined;
    if (requestDate !== undefined) {
      if (requestDate === null || String(requestDate).trim() === '') {
        parsedRequestDate = null;
      } else {
        parsedRequestDate = normalizeDateString(String(requestDate));
        if (!parsedRequestDate) {
          return {
            errorStatus: 400,
            errorBody: { error: `Invalid requestDate "${requestDate}".` },
          };
        }
      }
    }

    let parsedAckDate: string | null | undefined = undefined;
    if (acknowledgementDate !== undefined) {
      if (acknowledgementDate === null || String(acknowledgementDate).trim() === '') {
        parsedAckDate = null;
      } else {
        parsedAckDate = normalizeDateString(String(acknowledgementDate));
        if (!parsedAckDate) {
          return {
            errorStatus: 400,
            errorBody: { error: `Invalid acknowledgementDate "${acknowledgementDate}".` },
          };
        }
      }
    }

    if (
      (mandateLifecycleStatus === 'ACTIVE' ||
        mandateLifecycleStatus === 'REVOCATION_REQUESTED') &&
      parsedRevocationDate !== null
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `effectiveDate / revocationDate cannot be set when Layer B status is ${mandateLifecycleStatus}. Use requestDate for REVOCATION_REQUESTED.`,
          code: 'EFFECTIVE_DATE_NOT_ALLOWED_FOR_STATUS',
        },
      };
    }

    const isMandateCompletion =
      mandateLifecycleStatus === 'REVOCATION_REPORTED_BY_USER' ||
      mandateLifecycleStatus === 'REVOCATION_EVIDENCE_ATTACHED' ||
      mandateLifecycleStatus === 'REVOCATION_VERIFIED' ||
      mandateLifecycleStatus === 'REVOKED';

    const cmtId = sess.commitmentId;
    const prevCmt = state.commitments.find((c) => c.id === cmtId);

    const currentOverride = userCommitmentOverrides[cmtId] || {};
    const existingEvid = currentOverride.evidenceRecords ?? sess.evidence;
    const updatedEvid = [...existingEvid];

    const existingRevocationDate =
      currentOverride.mandateRevokedAtOverride ?? sess.paymentAuthorisationRevokedAt ?? null;

    if (
      mandateLifecycleStatus === 'REVOKED' &&
      !parsedRevocationDate &&
      !existingRevocationDate
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Setting Layer B status to REVOKED requires a valid effectiveDate / revocationDate (YYYY-MM-DD).',
          code: 'EFFECTIVE_DATE_REQUIRED',
        },
      };
    }

    // Validate evidenceId if explicitly provided
    if (evidenceId !== undefined && evidenceId !== null && String(evidenceId).trim() !== '') {
      const cleanEvidId = String(evidenceId).trim();
      const matchedEvid = updatedEvid.find((e) => e.id === cleanEvidId);
      if (!matchedEvid || matchedEvid.cancellationSessionId !== sess.id) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Evidence record "${cleanEvidId}" does not exist or does not belong to commitment "${cmtId}" (session "${sess.id}").`,
            code: 'INVALID_EVIDENCE_LINK',
          },
        };
      }
      if (matchedEvid.evidenceType !== 'MANDATE_REVOCATION') {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Evidence record "${cleanEvidId}" has type "${matchedEvid.evidenceType}", which cannot satisfy Layer B MANDATE_REVOCATION.`,
            code: 'INVALID_EVIDENCE_LINK',
          },
        };
      }
    }

    const cleanRef = referenceNumber ? referenceNumber.trim() : '';
    const hasExistingMandateEvidence = updatedEvid.some(
      (e) =>
        e.cancellationSessionId === sess.id &&
        e.evidenceType === 'MANDATE_REVOCATION' &&
        Boolean(e.referenceNumber?.trim())
    );
    if (
      mandateLifecycleStatus === 'REVOCATION_EVIDENCE_ATTACHED' &&
      !cleanRef &&
      !hasExistingMandateEvidence
    ) {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Cannot set Layer B status to REVOCATION_EVIDENCE_ATTACHED without a valid MANDATE_REVOCATION evidence reference number.',
          code: 'EVIDENCE_REQUIRED',
        },
      };
    }

    if (mandateLifecycleStatus === 'REVOCATION_VERIFIED') {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Cannot self-declare REVOCATION_VERIFIED on user endpoints. Revocation verification requires banking institution confirmation or NPCI/UPI mandate status synchronization.',
          code: 'UNVERIFIED_STATUS_REJECTED',
        },
      };
    }

    const assignedSourceType: RecordSourceProvenance = 'USER_ENTERED';

    if (cleanRef) {
      const alreadyExists = updatedEvid.some(
        (e) =>
          e.referenceNumber === cleanRef &&
          e.evidenceType === 'MANDATE_REVOCATION' &&
          (e.evidenceDate ?? null) === (parsedEvidDate ?? null)
      );
      if (!alreadyExists) {
        updatedEvid.push({
          id: `EVID-MND-${Date.now()}`,
          cancellationSessionId: sess.id,
          evidenceType: 'MANDATE_REVOCATION',
          description: notes || `Mandate lifecycle updated to ${mandateLifecycleStatus}`,
          referenceNumber: cleanRef,
          evidenceDate: parsedEvidDate,
          ...(isMandateCompletion && parsedRevocationDate
            ? { effectiveDate: parsedRevocationDate }
            : {}),
          documentUploaded: false,
          evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
          sourceType: assignedSourceType,
          verificationStatus:
            mandateLifecycleStatus === 'REVOCATION_EVIDENCE_ATTACHED'
              ? 'EVIDENCE_ATTACHED'
              : 'USER_REPORTED',
          createdAt: new Date().toISOString(),
        });
      }
    }

    const nextMandateRevokedAt = isMandateCompletion
      ? hasExplicitRevocationParam
        ? parsedRevocationDate
        : existingRevocationDate
      : null;

    const historyList: EffectiveDateChangeRecord[] = [
      ...(currentOverride.effectiveDateHistory ?? sess.effectiveDateHistory ?? []),
    ];
    if (
      existingRevocationDate &&
      nextMandateRevokedAt &&
      existingRevocationDate !== nextMandateRevokedAt
    ) {
      const nowIso = new Date().toISOString();
      historyList.push({
        layer: 'MANDATE',
        previousDate: existingRevocationDate,
        newDate: nextMandateRevokedAt,
        updatedAt: nowIso,
        changedAt: nowIso,
        sourceType: assignedSourceType,
        reason: notes || 'Corrected Layer B effective mandate revocation date',
      });
    }

    userCommitmentOverrides[cmtId] = {
      ...currentOverride,
      mandateLifecycleStatus,
      mandateRevokedAtOverride: nextMandateRevokedAt,
      ...(parsedRequestDate !== undefined
        ? { mandateRevocationRequestedAtOverride: parsedRequestDate }
        : {}),
      ...(parsedAckDate !== undefined
        ? { mandateRevocationAcknowledgedAtOverride: parsedAckDate }
        : {}),
      effectiveDateHistory: historyList,
      evidenceRecords: updatedEvid,
    };

    // Also sync status into mandatesStore if matching mandate exists
    const mndIdx = mandatesStore.findIndex((m) => m.commitmentId === cmtId);
    if (mndIdx >= 0) {
      if (isMandateCompletion) {
        mandatesStore[mndIdx].mandateStatus =
          mandateLifecycleStatus === 'REVOKED'
            ? 'REVOKED'
            : 'REVOCATION_REPORTED';
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
        cleanRef ? ` (Ref: ${cleanRef})` : ''
      }${nextMandateRevokedAt ? ` [Effective Revocation Date: ${nextMandateRevokedAt}]` : ''}.`,
      previousState: `${prevCmt?.mandateLifecycleStatus || 'ACTIVE'}${
        sess.paymentAuthorisationRevokedAt ? ` (${sess.paymentAuthorisationRevokedAt})` : ''
      }`,
      newState: `${mandateLifecycleStatus}${
        nextMandateRevokedAt ? ` (${nextMandateRevokedAt})` : ''
      }`,
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
  const postServiceCancelTxns = state.transactions.filter((t) =>
    (sess.postServiceCancellationTransactionIds || []).includes(t.id)
  );
  const postMandateRevokeTxns = state.transactions.filter((t) =>
    (sess.postMandateRevocationTransactionIds || []).includes(t.id)
  );
  const debitsBetweenServiceCancelAndMandateRevoke = postServiceCancelTxns.filter((t) =>
    sess.paymentAuthorisationRevokedAt
      ? t.transactionDate <= sess.paymentAuthorisationRevokedAt
      : true
  );
  const commitmentTransactions = state.transactions
    .filter((t) => t.commitmentId === sess.commitmentId && t.direction === 'DEBIT')
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  const srvStatus = cmt?.serviceLifecycleStatus || 'ACTIVE';
  const mndStatus = cmt?.mandateLifecycleStatus || 'ACTIVE';
  const hasServiceCancelReported =
    srvStatus === 'CANCELLATION_REPORTED_BY_USER' ||
    srvStatus === 'CANCELLATION_EVIDENCE_ATTACHED' ||
    srvStatus === 'CANCELLATION_VERIFIED' ||
    srvStatus === 'CANCELLED';
  const hasMandateRevokeReported =
    mndStatus === 'REVOCATION_REPORTED_BY_USER' ||
    mndStatus === 'REVOCATION_EVIDENCE_ATTACHED' ||
    mndStatus === 'REVOCATION_VERIFIED' ||
    mndStatus === 'REVOKED';
  const hasCancelOrRevokeReported = hasServiceCancelReported || hasMandateRevokeReported;

  const serviceMonitoringEligible = Boolean(sess.serviceCancelledAt);
  const mandateMonitoringEligible = Boolean(sess.paymentAuthorisationRevokedAt);
  const effectiveCancelDate = sess.serviceCancelledAt || sess.paymentAuthorisationRevokedAt || null;

  const serviceMonitoringStatus = sess.serviceCancelledAt
    ? postServiceCancelTxns.length > 0
      ? 'POST_SERVICE_CANCELLATION_DEBIT_DETECTED'
      : 'SERVICE_MONITORING_CLEAN'
    : hasServiceCancelReported
    ? 'SERVICE_EFFECTIVE_DATE_UNAVAILABLE'
    : 'SERVICE_ACTIVE';

  const mandateMonitoringStatus = sess.paymentAuthorisationRevokedAt
    ? postMandateRevokeTxns.length > 0
      ? 'POST_MANDATE_REVOCATION_DEBIT_DETECTED'
      : 'MANDATE_MONITORING_CLEAN'
    : hasMandateRevokeReported
    ? 'MANDATE_REVOCATION_DATE_UNAVAILABLE'
    : 'MANDATE_ACTIVE';

  let monitoringStatus: string;
  let monitoringExplanation: string;
  if (postMandateRevokeTxns.length > 0) {
    monitoringStatus = 'POST_CANCELLATION_DEBIT_DETECTED';
    monitoringExplanation = `${postMandateRevokeTxns.length} debit(s) observed after recorded Layer B mandate revocation date (${sess.paymentAuthorisationRevokedAt}).`;
  } else if (postServiceCancelTxns.length > 0) {
    monitoringStatus = 'POST_CANCELLATION_DEBIT_DETECTED';
    monitoringExplanation = sess.paymentAuthorisationRevokedAt
      ? `${postServiceCancelTxns.length} debit(s) observed after Layer A service cancellation (${sess.serviceCancelledAt}) and before/on Layer B mandate revocation (${sess.paymentAuthorisationRevokedAt}); zero debits after mandate revocation.`
      : `${postServiceCancelTxns.length} debit(s) observed after Layer A service cancellation (${sess.serviceCancelledAt}) while Layer B payment mandate revocation date is not yet recorded.`;
  } else if (sess.serviceCancelledAt && sess.paymentAuthorisationRevokedAt) {
    monitoringStatus = 'MONITORING_ACTIVE_CLEAN';
    monitoringExplanation = `Zero debits observed after Layer A service cancellation (${sess.serviceCancelledAt}) and Layer B mandate revocation (${sess.paymentAuthorisationRevokedAt}).`;
  } else if (sess.serviceCancelledAt && !sess.paymentAuthorisationRevokedAt) {
    monitoringStatus = 'SERVICE_MONITORING_ONLY_MANDATE_DATE_UNAVAILABLE';
    monitoringExplanation = `Zero debits observed after Layer A service cancellation (${sess.serviceCancelledAt}). Layer B mandate revocation effective date is unavailable (null).`;
  } else if (!sess.serviceCancelledAt && sess.paymentAuthorisationRevokedAt) {
    monitoringStatus = 'MANDATE_MONITORING_ONLY_SERVICE_DATE_UNAVAILABLE';
    monitoringExplanation = `Zero debits observed after Layer B mandate revocation (${sess.paymentAuthorisationRevokedAt}). Layer A service cancellation effective date is unavailable (null).`;
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
    serviceMonitoringEligible,
    mandateMonitoringEligible,
    serviceMonitoringStatus,
    mandateMonitoringStatus,
    postServiceCancellationDebitDetected: postServiceCancelTxns.length > 0,
    postMandateRevocationDebitDetected: postMandateRevokeTxns.length > 0,
    postServiceCancellationTransactions: postServiceCancelTxns,
    postMandateRevocationTransactions: postMandateRevokeTxns,
    debitsBetweenServiceCancelAndMandateRevoke,
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
  const {
    evidenceType,
    description,
    referenceNumber,
    evidenceDate,
    effectiveDate,
    documentUploaded,
    documentName,
    documentMimeType,
    fileBase64,
    sourceType,
  } = req.body as {
    evidenceType: CancellationEvidenceRecord['evidenceType'];
    description: string;
    referenceNumber: string;
    evidenceDate?: string | null;
    effectiveDate?: string | null;
    documentUploaded?: boolean;
    documentName?: string | null;
    documentMimeType?: string | null;
    fileBase64?: string | null;
    sourceType?: RecordSourceProvenance;
  };

  if (isForgedPrivilegedProvenance(sourceType)) {
    res.status(400).json({
      error: `Client-forged privileged sourceType "${sourceType}" is not permitted on cancellation evidence submissions.`,
      code: 'FORGED_PROVENANCE_REJECTED',
    });
    return;
  }

  if (!referenceNumber || !description) {
    res.status(400).json({ error: 'Reference number and description are required.' });
    return;
  }

  const ALLOWED_EVIDENCE_TYPES: CancellationEvidenceRecord['evidenceType'][] = [
    'SERVICE_CONFIRMATION',
    'MANDATE_REVOCATION',
    'MERCHANT_UNRESPONSIVE',
    'CONFIRMATION_NUMBER',
  ];
  if (evidenceType && !ALLOWED_EVIDENCE_TYPES.includes(evidenceType)) {
    res.status(400).json({
      error: `Invalid evidenceType "${evidenceType}". Allowed values: ${ALLOWED_EVIDENCE_TYPES.join(', ')}.`,
    });
    return;
  }

  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const sess = state.sessions.find(
      (s) => s.id === req.params.id || s.commitmentId === req.params.id
    );
    if (!sess) {
      return {
        errorStatus: 404,
        errorBody: { error: 'Session not found' },
      };
    }

    const cleanFileBase64 =
      typeof fileBase64 === 'string' && fileBase64.trim() !== '' ? fileBase64.trim() : null;
    const isUploadedDocRequested = Boolean(documentUploaded);

    if (isUploadedDocRequested && !cleanFileBase64) {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Cannot mark documentUploaded=true without providing a valid file upload payload (fileBase64). To record reference-only confirmation numbers, record evidence without document upload.',
          code: 'DOCUMENT_PAYLOAD_REQUIRED',
        },
      };
    }

    let fileBuffer: Buffer | null = null;
    let detectedMimeType: string | null = null;
    let detectedExtension: string | null = null;
    let computedSha256: string | null = null;
    let savedStoragePath: string | null = null;

    if (cleanFileBase64) {
      const base64Data = cleanFileBase64.replace(/^data:[^;]+;base64,/, '');
      try {
        fileBuffer = Buffer.from(base64Data, 'base64');
      } catch {
        return {
          errorStatus: 400,
          errorBody: {
            error: 'Corrupted or invalid base64 file data provided.',
            code: 'INVALID_BASE64',
          },
        };
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return {
          errorStatus: 400,
          errorBody: {
            error: 'Uploaded file payload is empty.',
            code: 'EMPTY_FILE',
          },
        };
      }

      const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
      if (fileBuffer.length > MAX_UPLOAD_BYTES) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `File size (${fileBuffer.length} bytes) exceeds maximum allowable upload size of 10MB.`,
            code: 'FILE_TOO_LARGE',
          },
        };
      }

      // Magic byte checks:
      // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
      // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      // JPEG: 0xFF 0xD8 0xFF
      // WebP: RIFF ... WEBP
      if (
        fileBuffer.length >= 5 &&
        fileBuffer[0] === 0x25 &&
        fileBuffer[1] === 0x50 &&
        fileBuffer[2] === 0x44 &&
        fileBuffer[3] === 0x46 &&
        fileBuffer[4] === 0x2d
      ) {
        detectedMimeType = 'application/pdf';
        detectedExtension = 'pdf';
      } else if (
        fileBuffer.length >= 8 &&
        fileBuffer[0] === 0x89 &&
        fileBuffer[1] === 0x50 &&
        fileBuffer[2] === 0x4e &&
        fileBuffer[3] === 0x47 &&
        fileBuffer[4] === 0x0d &&
        fileBuffer[5] === 0x0a &&
        fileBuffer[6] === 0x1a &&
        fileBuffer[7] === 0x0a
      ) {
        detectedMimeType = 'image/png';
        detectedExtension = 'png';
      } else if (
        fileBuffer.length >= 3 &&
        fileBuffer[0] === 0xff &&
        fileBuffer[1] === 0xd8 &&
        fileBuffer[2] === 0xff
      ) {
        detectedMimeType = 'image/jpeg';
        detectedExtension = 'jpg';
      } else if (
        fileBuffer.length >= 12 &&
        fileBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        fileBuffer.subarray(8, 12).toString('ascii') === 'WEBP'
      ) {
        detectedMimeType = 'image/webp';
        detectedExtension = 'webp';
      } else {
        return {
          errorStatus: 400,
          errorBody: {
            error:
              'Invalid file signature or unsupported file format. Allowed formats: PDF (%PDF-), PNG (89 50 4E 47), JPEG (FF D8 FF), and WebP (RIFF...WEBP).',
            code: 'INVALID_FILE_SIGNATURE',
          },
        };
      }

      computedSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const safeFilename = `${computedSha256.slice(0, 16)}_${crypto.randomUUID()}.${detectedExtension}`;
      savedStoragePath = path.join('data/uploads', safeFilename);
      fs.writeFileSync(path.resolve(process.cwd(), savedStoragePath), fileBuffer);
    }
    const cleanupSavedUpload = () => {
      if (!savedStoragePath) return;
      const absoluteSavedPath = path.resolve(process.cwd(), savedStoragePath);
      try {
        if (fs.existsSync(absoluteSavedPath)) fs.unlinkSync(absoluteSavedPath);
      } finally {
        savedStoragePath = null;
      }
    };

    // Gate D: Never default omitted historical evidenceDate to '2026-10-30' or today's date!
    let parsedEvidenceDate: string | null = null;
    if (evidenceDate !== undefined && evidenceDate !== null && String(evidenceDate).trim() !== '') {
      parsedEvidenceDate = normalizeDateString(String(evidenceDate));
      if (!parsedEvidenceDate) {
        cleanupSavedUpload();
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid evidenceDate "${evidenceDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    let parsedEffectiveDate: string | null = null;
    if (effectiveDate !== undefined && effectiveDate !== null && String(effectiveDate).trim() !== '') {
      parsedEffectiveDate = normalizeDateString(String(effectiveDate));
      if (!parsedEffectiveDate) {
        cleanupSavedUpload();
        return {
          errorStatus: 400,
          errorBody: {
            error: `Invalid effectiveDate "${effectiveDate}". Provide a valid YYYY-MM-DD calendar date or omit it.`,
          },
        };
      }
    }

    const cmtId = sess.commitmentId;
    const existingEvidence = userCommitmentOverrides[cmtId]?.evidenceRecords ?? sess.evidence;
    const cleanRef = referenceNumber.trim();
    const resolvedType = evidenceType || 'SERVICE_CONFIRMATION';
    const isRealDocumentUploaded = Boolean(fileBuffer && computedSha256);
    const assignedSourceType: RecordSourceProvenance = isRealDocumentUploaded
      ? 'USER_UPLOADED'
      : 'USER_ENTERED';

    const existingDuplicate = existingEvidence.find(
      (e) =>
        e.referenceNumber === cleanRef &&
        e.evidenceType === resolvedType &&
        (e.evidenceDate ?? null) === (parsedEvidenceDate ?? null) &&
        (e.effectiveDate ?? null) === (parsedEffectiveDate ?? null) &&
        (e.sha256Hash ?? null) === (computedSha256 ?? null)
    );
    const newEvid: CancellationEvidenceRecord =
      existingDuplicate || {
        id: `EVID-${Date.now()}`,
        cancellationSessionId: sess.id,
        evidenceType: resolvedType,
        description,
        referenceNumber: cleanRef,
        evidenceDate: parsedEvidenceDate,
        ...(parsedEffectiveDate ? { effectiveDate: parsedEffectiveDate } : {}),
        documentUploaded: isRealDocumentUploaded,
        ...(documentName || savedStoragePath
          ? { documentName: documentName || (savedStoragePath ? path.basename(savedStoragePath) : null) }
          : {}),
        ...(detectedMimeType || documentMimeType
          ? { documentMimeType: detectedMimeType || documentMimeType }
          : {}),
        ...(computedSha256 ? { sha256Hash: computedSha256 } : {}),
        ...(fileBuffer ? { fileSizeBytes: fileBuffer.length } : {}),
        ...(savedStoragePath ? { storagePath: savedStoragePath } : {}),
        evidenceRecordLifecycle: isRealDocumentUploaded
          ? 'DOCUMENT_UPLOADED'
          : 'EVIDENCE_REFERENCE_RECORDED',
        sourceType: assignedSourceType,
        verificationStatus: isRealDocumentUploaded ? 'EVIDENCE_ATTACHED' : 'USER_REPORTED',
        createdAt: new Date().toISOString(),
      };
    if (existingDuplicate) cleanupSavedUpload();
    if (!existingDuplicate) {
      userCommitmentOverrides[cmtId] = {
        ...(userCommitmentOverrides[cmtId] || {}),
        evidenceRecords: [...existingEvidence, newEvid],
      };
      recordAuditEvent({
        commitmentId: cmtId,
        eventType: 'EVIDENCE_ATTACHED',
        summary: `Attached ${resolvedType} ${
          isRealDocumentUploaded ? 'uploaded document' : 'evidence reference'
        } (Ref: ${cleanRef}${
          parsedEvidenceDate ? `, Evidence Date: ${parsedEvidenceDate}` : ''
        }${parsedEffectiveDate ? `, Effective Date: ${parsedEffectiveDate}` : ''}).`,
        previousState: null,
        newState: cleanRef,
      });
    }
    const updatedState = computeCurrentState();
    return {
      body: {
        evidence: newEvid,
        session: updatedState.sessions.find((s) => s.id === sess.id),
        commitment: updatedState.commitments.find((c) => c.id === cmtId),
      },
      cleanup: cleanupSavedUpload,
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
    mandates: getEffectiveMandates(),
    serviceTerms: getEffectiveServiceTerms(),
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
    currency,
    maxExpectedAmountMinor,
    maxExpectedAmount,
    alertOnAnyIncrease,
    preDebitReminderDays,
    requireTwoLayerCancellationConfirmation,
    sourceType,
  } = (req.body || {}) as Partial<FinancialGuardrailConfig>;

  if (isForgedPrivilegedProvenance(sourceType)) {
    res.status(400).json({
      error: `Client-forged privileged sourceType "${sourceType}" is not permitted on guardrail updates.`,
      code: 'FORGED_PROVENANCE_REJECTED',
    });
    return;
  }

  await executeSerializedMutation(res, () => {
    const state = computeCurrentState();
    const targetCommitment = state.commitments.find((c) => c.id === cmtId);
    if (!targetCommitment) {
      return {
        errorStatus: 404,
        errorBody: { error: `Commitment "${cmtId}" not found.` },
      };
    }
    const commitmentCurrency =
      targetCommitment?.currency && !isUnknownCurrency(targetCommitment.currency)
        ? normalizeCurrencyCode(targetCommitment.currency)
        : null;

    if (!commitmentCurrency) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `Commitment ${cmtId} has unknown currency. Confirm the commitment currency through a supported provenance-recorded flow before configuring a guardrail.`,
          code: 'UNKNOWN_CURRENCY_GUARDRAIL_NOT_ALLOWED',
        },
      };
    }

    if (currency !== undefined && currency !== null && String(currency).trim() !== '') {
      if (!isValidCurrencyCode(currency)) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Unsupported or invalid guardrail currency "${currency}".`,
          },
        };
      }
      const normalizedReqCurrency = normalizeCurrencyCode(currency);
      if (commitmentCurrency && normalizedReqCurrency !== commitmentCurrency) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `Cross-currency guardrail mismatch: commitment ${cmtId} is denominated in ${commitmentCurrency}, cannot configure guardrail in ${normalizedReqCurrency}.`,
          },
        };
      }
    }

    const idx = guardrailsStore.findIndex((g) => g.commitmentId === cmtId);
    const existingGuardrail = idx >= 0 ? guardrailsStore[idx] : null;
    const resolvedCurrency =
      (currency && isValidCurrencyCode(currency) ? normalizeCurrencyCode(currency) : null) ||
      existingGuardrail?.currency ||
      commitmentCurrency;

    if (!resolvedCurrency || !isValidCurrencyCode(resolvedCurrency) || isUnknownCurrency(resolvedCurrency)) {
      return {
        errorStatus: 400,
        errorBody: {
          error: `Explicit valid confirmed currency is required to configure a financial guardrail for commitment ${cmtId}. Reconcile or confirm currency first.`,
          code: 'UNKNOWN_CURRENCY_GUARDRAIL_NOT_ALLOWED',
        },
      };
    }

    let resolvedMinor = existingGuardrail?.maxExpectedAmountMinor ?? null;
    if (maxExpectedAmountMinor !== undefined && maxExpectedAmountMinor !== null) {
      const numMinor = Number(maxExpectedAmountMinor);
      if (!Number.isSafeInteger(numMinor) || numMinor <= 0) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `maxExpectedAmountMinor must be a positive safe integer, received "${maxExpectedAmountMinor}".`,
            code: 'INVALID_AMOUNT',
          },
        };
      }
      resolvedMinor = numMinor;
    } else if (maxExpectedAmount !== undefined && maxExpectedAmount !== null) {
      const parsedMajor = parseStrictAmount(maxExpectedAmount);
      if (parsedMajor === null || parsedMajor <= 0) {
        return {
          errorStatus: 400,
          errorBody: {
            error: `maxExpectedAmount must be a positive finite amount, received "${maxExpectedAmount}".`,
            code: 'INVALID_AMOUNT',
          },
        };
      }
      resolvedMinor = toMinorUnitsStrict(parsedMajor, resolvedCurrency);
    } else if (resolvedMinor === null) {
      return {
        errorStatus: 400,
        errorBody: {
          error:
            'Explicit positive maxExpectedAmount or maxExpectedAmountMinor is required to configure a financial guardrail.',
          code: 'AMOUNT_REQUIRED',
        },
      };
    }

    const nowIso = new Date().toISOString();
    const updated: FinancialGuardrailConfig = {
      commitmentId: cmtId,
      currency: resolvedCurrency,
      precision: getCurrencyDecimalsOrNull(resolvedCurrency) ?? 2,
      maxExpectedAmountMinor: resolvedMinor,
      maxExpectedAmount: fromMinorUnitsStrict(resolvedMinor, resolvedCurrency),
      alertOnAnyIncrease:
        alertOnAnyIncrease !== undefined
          ? Boolean(alertOnAnyIncrease)
          : existingGuardrail?.alertOnAnyIncrease ?? true,
      preDebitReminderDays:
        preDebitReminderDays !== undefined
          ? Number(preDebitReminderDays)
          : existingGuardrail?.preDebitReminderDays ?? 3,
      requireTwoLayerCancellationConfirmation:
        requireTwoLayerCancellationConfirmation !== undefined
          ? Boolean(requireTwoLayerCancellationConfirmation)
          : existingGuardrail?.requireTwoLayerCancellationConfirmation ?? true,
      sourceType: 'USER_ENTERED',
      provenance: 'USER_CONFIGURED',
      createdAt: existingGuardrail?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (idx >= 0) {
      guardrailsStore[idx] = updated;
    } else {
      guardrailsStore.push(updated);
    }

    recordAuditEvent({
      commitmentId: cmtId,
      eventType: 'GUARDRAIL_UPDATED',
      summary: `Updated financial guardrail for ${cmtId} (${resolvedCurrency} minor cap: ${updated.maxExpectedAmountMinor}, reminder: ${updated.preDebitReminderDays}d).`,
      previousState: existingGuardrail
        ? `${existingGuardrail.currency} ${existingGuardrail.maxExpectedAmountMinor}`
        : null,
      newState: `${updated.currency} ${updated.maxExpectedAmountMinor}`,
    });

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
  const {
    csvContent,
    filename = 'uploaded-statement.csv',
    defaultCurrency = null,
    confirmedAccountCurrencies: incomingAccountMap,
  } = req.body as {
    csvContent: string;
    filename?: string;
    defaultCurrency?: string | null;
    confirmedAccountCurrencies?: Record<string, string>;
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
    const effectiveAccountMap = {
      ...confirmedAccountCurrencies,
      ...(incomingAccountMap || {}),
    };
    const existingIds = new Set(rawCsvRows.map((r) => r.transaction_id));
    const existingFingerprints = new Set(rawCsvRows.map(computeCanonicalTxnFingerprint));
    const combinedRows = [...rawCsvRows];
    let added = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const r of parsedRows) {
      const amt = parseStrictAmount(r.amount);
      const validDate = normalizeDateString(r.transaction_date);
      const accountAlias = r.account_alias?.trim() || 'PRIMARY-ACCOUNT';
      const accountConfirmedCurr = effectiveAccountMap[accountAlias] || null;
      const resolvedCurr = resolveTransactionCurrency({
        explicitCurrency: r.currency,
        userSelectedMappingCurrency: defaultCurrency,
        confirmedAccountCurrency: accountConfirmedCurr,
      });

      if (
        !r.transaction_id ||
        !validDate ||
        resolvedCurr.isMalformedCode ||
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
        currency: resolvedCurr.currency,
        currency_provenance: resolvedCurr.currencyProvenance,
        currency_status: resolvedCurr.currencyStatus,
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
      const resolvedCurr = resolveTransactionCurrency({
        explicitCurrency: item.currency,
      });
      const validDate = normalizeDateString(String(item.eventDate));
      if (resolvedCurr.isMalformedCode || !validDate) {
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
        currency: resolvedCurr.currency,
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
  const mergedConfig: Partial<CsvMappingConfig> = {
    ...(config || {}),
    confirmedAccountCurrencies: {
      ...confirmedAccountCurrencies,
      ...(config?.confirmedAccountCurrencies || {}),
    },
  };
  const result = previewCsvMapping(csvContent, mergedConfig);
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
  const mergedConfig: CsvMappingConfig = {
    ...config,
    confirmedAccountCurrencies: {
      ...confirmedAccountCurrencies,
      ...(config.confirmedAccountCurrencies || {}),
    },
  };
  const parseResult = parseAllMappedCsvRows(csvContent, mergedConfig, true);
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
  if (!demoModeEnabled) {
    res.status(403).json({
      error: 'Demo Mode is disabled. Enable Demo Mode before loading demonstration scenarios.',
      code: 'DEMO_MODE_DISABLED',
    });
    return;
  }
  await executeSerializedMutation(res, () => {
    // Isolate StreamBox demo row overrides into demoSimulatedRows (never mutate user rawCsvRows)
    for (const row of rawCsvRows) {
      if (row.transaction_id === 'TXN-1004' || row.transaction_id === 'TXN-1005') {
        const simCopy: RawCsvRow & { __replacesBaseRow?: boolean } = {
          ...row,
          amount: '799',
          source_type: 'DEMO_SEED',
          __replacesBaseRow: true,
        };
        const existingSimIdx = demoSimulatedRows.findIndex(
          (dr) => dr.transaction_id === row.transaction_id
        );
        if (existingSimIdx >= 0) {
          demoSimulatedRows[existingSimIdx] = simCopy;
        } else {
          demoSimulatedRows.push(simCopy);
        }
      }
    }

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
    const sbTermsIdx = demoServiceTerms.findIndex((s) => s.commitmentId === 'CMT-STREAMBOX');
    if (sbTermsIdx >= 0) demoServiceTerms[sbTermsIdx] = sbTerms;
    else demoServiceTerms.push(sbTerms);

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
    const sbMandateIdx = demoMandates.findIndex((m) => m.commitmentId === 'CMT-STREAMBOX');
    if (sbMandateIdx >= 0) demoMandates[sbMandateIdx] = sbMandate;
    else demoMandates.push(sbMandate);

    demoCommitmentOverrides['CMT-STREAMBOX'] = {
      ...(demoCommitmentOverrides['CMT-STREAMBOX'] || {}),
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
      actor: 'DEMO_SEED_SCENARIO',
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
  if (!demoModeEnabled) {
    res.status(403).json({
      error: 'Demo Mode is disabled. Enable Demo Mode before simulating post-cancellation debits.',
      code: 'DEMO_MODE_DISABLED',
    });
    return;
  }
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
    demoCommitmentOverrides[cmt.id] = {
      ...(demoCommitmentOverrides[cmt.id] || {}),
      cancelledAtOverride: '2026-10-10',
      serviceCancelledAtOverride: '2026-10-10',
      mandateRevokedAtOverride: '2026-10-10',
      completedStepIds: pb.steps.map((s) => s.id),
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
      mandateLifecycleStatus: 'REVOCATION_EVIDENCE_ATTACHED',
      evidenceRecords: [
        {
          id: `EVID-SIM-${Date.now()}`,
          cancellationSessionId: `SESS-${cmt.id}`,
          evidenceType: 'SERVICE_CONFIRMATION',
          description: `Simulated Layer A service + Layer B mandate cancellation for ${cmt.serviceName}.`,
          referenceNumber: `CANC-REF-${cmt.id}-20261010`,
          evidenceDate: '2026-10-10',
          effectiveDate: '2026-10-10',
          evidenceRecordLifecycle: 'EVIDENCE_REFERENCE_RECORDED',
          sourceType: 'DEMO_SEED',
          verificationStatus: 'EVIDENCE_ATTACHED',
          createdAt: '2026-10-10T10:00:00Z',
        },
      ],
    };

    const simTxnId = `TXN-POST-${cmt.id.slice(4)}-99`;
    if (!demoSimulatedRows.some((r) => r.transaction_id === simTxnId)) {
      demoSimulatedRows.push({
        transaction_id: simTxnId,
        transaction_date: '2026-10-29',
        raw_description: cmt.connectedDescriptors[0] || `RZP*${cmt.merchantName.toUpperCase()}`,
        amount: cmt.latestAmount,
        currency: cmt.currency || UNKNOWN_CURRENCY,
        direction: 'DEBIT',
        payment_rail: cmt.paymentRail,
        account_alias: 'HDFC-XX4821',
        external_reference: `POST-CANCEL-${Date.now()}`,
        source_type: 'DEMO_SEED',
      });
    }

    recordAuditEvent({
      commitmentId: cmt.id,
      eventType: 'POST_CANCELLATION_DEBIT_DETECTED',
      summary: `Simulated post-cancellation debit ${simTxnId} (${formatCurrency(
        cmt.latestAmount,
        cmt.currency || UNKNOWN_CURRENCY
      )} on 2026-10-29) after cancellation on 2026-10-10.`,
      previousState: 'CANCELLED_USER_CONFIRMED',
      newState: 'POST_CANCEL_ALERT',
      actor: 'DEMO_SEED_SCENARIO',
    });

    const updatedState = computeCurrentState();
    return {
      body: {
        message: `Simulated post-cancellation debit ${simTxnId} (${formatCurrency(
          cmt.latestAmount,
          cmt.currency || UNKNOWN_CURRENCY
        )} on 2026-10-29) after cancellation on 2026-10-10.`,
        commitment: updatedState.commitments.find((c) => c.id === cmt.id),
        alerts: updatedState.alerts,
      },
    };
  });
});

app.post('/api/demo/reset', async (_req, res) => {
  if (!demoModeEnabled) {
    res.status(403).json({
      error: 'Demo Mode is disabled. Enable Demo Mode before resetting demonstration data.',
      code: 'DEMO_MODE_DISABLED',
    });
    return;
  }
  await executeSerializedMutation(res, () => {
    const resetResult = resetDemoDataOnly();
    return {
      body: {
        message:
          'Synthetic demonstration dataset reset to benchmark baseline. Canonical user transactions, mandates, terms, and guardrails preserved.',
        commitmentsCount: resetResult.commitmentsCount,
        transactionsCount: resetResult.transactionsCount,
        preservedUserRecords: resetResult.preservedUserRecords,
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
  const configuredPort = process.env.PORT?.trim() || '3000';
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error(`Invalid PORT "${configuredPort}". PORT must be an integer between 1 and 65535.`);
  }
  const PORT = Number(configuredPort);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error(`Invalid PORT "${configuredPort}". PORT must be an integer between 1 and 65535.`);
  }
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
