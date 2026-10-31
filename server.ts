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
} from './src/engine/debitlensEngine';
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
} from './src/types/debitlens';
import { neo4jPersistenceService } from './src/services/neo4jPersistenceService';

dotenv.config();

const app = express();
app.use(express.json({ limit: '5mb' }));

// ============================================================================
// DURABLE STATE & SYNTHETIC SEED LOADER (Survives Server Restarts)
// ============================================================================
const PERSISTENT_STORE_PATH = path.resolve(process.cwd(), 'data/persistent-store.json');

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

interface PersistentAppStore {
  rawCsvRows: RawCsvRow[];
  notificationEvents: NotificationInput[];
  userMerchantOverrides: Record<string, string>;
  userCommitmentOverrides: Record<string, UserCommitmentStateOverride>;
  alertStatusOverrides: Record<string, 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'>;
  importHistory: ImportHistoryEntry[];
}

let rawCsvRows: RawCsvRow[] = [];
let notificationEvents: NotificationInput[] = [];
let userMerchantOverrides: Record<string, string> = {};
let userCommitmentOverrides: Record<string, UserCommitmentStateOverride> = {};
let alertStatusOverrides: Record<string, 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'> = {};
let importHistory: ImportHistoryEntry[] = [];

function savePersistentStore() {
  try {
    const payload: PersistentAppStore = {
      rawCsvRows,
      notificationEvents,
      userMerchantOverrides,
      userCommitmentOverrides,
      alertStatusOverrides,
      importHistory,
    };
    fs.writeFileSync(PERSISTENT_STORE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Warning: could not write persistent-store.json:', err);
  }
}

function loadSeedData(forceReset = false) {
  if (!forceReset && fs.existsSync(PERSISTENT_STORE_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(PERSISTENT_STORE_PATH, 'utf-8')) as PersistentAppStore;
      if (Array.isArray(saved.rawCsvRows) && saved.rawCsvRows.length > 0) {
        rawCsvRows = saved.rawCsvRows;
        notificationEvents = saved.notificationEvents || [];
        userMerchantOverrides = saved.userMerchantOverrides || {};
        userCommitmentOverrides = saved.userCommitmentOverrides || {};
        alertStatusOverrides = saved.alertStatusOverrides || {};
        importHistory = saved.importHistory || [];
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
  userCommitmentOverrides = {};
  alertStatusOverrides = {};
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
  ];
  savePersistentStore();
}

loadSeedData(false);

function computeCurrentState() {
  const { transactions, invalidRows, duplicateRows } = parseAndNormaliseTransactions(
    rawCsvRows,
    'BATCH-SEED-01',
    'CSV_STATEMENT',
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

  return { transactions, invalidRows, duplicateRows, commitments, alerts, playbooks, sessions };
}

// Sync initial seed to Neo4j if configured
async function syncStateToGraphAsync() {
  if (!neo4jPersistenceService.isConfigured()) return;
  const state = computeCurrentState();
  await neo4jPersistenceService.syncFullGraphToNeo4j({
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
  });
}

syncStateToGraphAsync();

// ============================================================================
// SARVAM AI BACKEND CLIENT & RUNTIME STATUS TRACKING
// ============================================================================
const SARVAM_BASE_URL = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai';
const SARVAM_CHAT_MODEL = process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';
const SARVAM_TRANSLATION_MODEL = process.env.SARVAM_TRANSLATION_MODEL || 'sarvam-translate:v1';
const SARVAM_DEFAULT_LANGUAGE = (process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN') as LanguageCode;

function isSarvamConfigured(): boolean {
  const enabled = process.env.SARVAM_ENABLED !== 'false';
  const key = process.env.SARVAM_API_KEY;
  return Boolean(
    enabled &&
      key &&
      key.trim() !== '' &&
      key !== 'your-sarvam-subscription-key' &&
      key !== '<api-key>'
  );
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
 * Splits text into sentence-aware chunks under maxChars so long cancellation playbooks
 * never fail Sarvam character limits.
 */
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
    return { translatedText: inputText, status: 'LIVE_SUCCESS' };
  }

  const cacheKey = `${model}:${targetLanguage}:${inputText}`;
  if (translationCache.has(cacheKey)) {
    return { translatedText: translationCache.get(cacheKey)!, status: 'LIVE_SUCCESS' };
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
    sarvamLastRequestStatus = 'LIVE_SUCCESS';
    sarvamLastError = null;
    return { translatedText: joined, status: 'LIVE_SUCCESS' };
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
      sarvamLastRequestStatus = 'LIVE_SUCCESS';
      sarvamLastError = null;
      return { content, status: 'LIVE_SUCCESS' };
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
    application: 'DebitLens Financial Commitment Intelligence',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/integrations/status', async (_req, res) => {
  const state = computeCurrentState();
  const neo4jHealth = await neo4jPersistenceService.checkConnectivity();
  const fullGraph = buildCommitmentGraphResponse({
    focusCommitmentId: state.commitments[0]?.id || null,
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
    executionMode: neo4jHealth.status,
  });

  const sarvamConfigured = isSarvamConfigured();
  const effectiveSarvamStatus = getEffectiveSarvamStatus();
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
      nodeCount: fullGraph.nodes.length,
      relationshipCount: fullGraph.edges.length,
      constraintsVerified: neo4jHealth.connected,
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
      message:
        effectiveSarvamStatus === 'LIVE_SUCCESS'
          ? `Live Sarvam AI verified (${SARVAM_CHAT_MODEL} + ${SARVAM_TRANSLATION_MODEL}). Last successful call at ${sarvamLastSuccessfulRequest}.`
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
  const health = await neo4jPersistenceService.checkConnectivity();
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
  });
  res.json(graphResponse.pathExplanation);
});

app.get('/api/graph/unresolved-transactions', (_req, res) => {
  const state = computeCurrentState();
  const unresolved = state.transactions.filter(
    (t) => t.direction === 'DEBIT' && t.resolutionStatus === 'UNRESOLVED'
  );
  res.json({
    count: unresolved.length,
    cypherExecuted: `MATCH (t:Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
OPTIONAL MATCH (t)-[:TRANSACTION_PROCESSED_BY]->(p:PaymentProcessor)
WHERE NOT (d)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(:Merchant)
RETURN t, d, p
ORDER BY t.date DESC`,
    transactions: unresolved,
  });
});

app.post('/api/graph/rebuild-demo', async (_req, res) => {
  loadSeedData(true);
  const state = computeCurrentState();
  const rebuildResult = await neo4jPersistenceService.rebuildDemoGraphInNeo4j({
    transactions: state.transactions,
    commitments: state.commitments,
    alerts: state.alerts,
    playbooks: state.playbooks,
    sessions: state.sessions,
    notifications: notificationEvents,
  });
  res.json({
    ...rebuildResult,
    commitmentsCount: state.commitments.length,
    transactionsCount: state.transactions.length,
  });
});

// ============================================================================
// REST API ENDPOINTS — SARVAM AI ("DEBITLENS BHASHA")
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

    const [chatRes, whyRes, idRes, uncRes, actRes, sumRes] = await Promise.all([
      callSarvamChatExplanationApi(systemPrompt, userPrompt),
      callSarvamTranslateApi(baseExplanation.englishSource.whyConfusing, language),
      callSarvamTranslateApi(baseExplanation.englishSource.whatIsIdentified, language),
      callSarvamTranslateApi(baseExplanation.englishSource.whatRemainsUncertain, language),
      callSarvamTranslateApi(baseExplanation.englishSource.recommendedAction, language),
      callSarvamTranslateApi(baseExplanation.englishSource.fullSummary, language),
    ]);

    if (chatRes.content || sumRes.translatedText) {
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
        'LIVE_SARVAM',
        'LIVE_SUCCESS'
      );
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
    const tasks: Array<Promise<void>> = [];

    if (enPb.contractualWarning) {
      tasks.push(
        callSarvamTranslateApi(enPb.contractualWarning, language).then((r) => {
          if (r.translatedText) translatedMap.contractualWarning = r.translatedText;
        })
      );
    }

    tasks.push(
      callSarvamTranslateApi(enPb.layerATitle, language).then((r) => {
        if (r.translatedText) translatedMap.layerATitle = r.translatedText;
      }),
      callSarvamTranslateApi(enPb.layerADescription, language).then((r) => {
        if (r.translatedText) translatedMap.layerADescription = r.translatedText;
      }),
      callSarvamTranslateApi(enPb.layerBTitle, language).then((r) => {
        if (r.translatedText) translatedMap.layerBTitle = r.translatedText;
      }),
      callSarvamTranslateApi(enPb.layerBDescription, language).then((r) => {
        if (r.translatedText) translatedMap.layerBDescription = r.translatedText;
      }),
      callSarvamTranslateApi(enPb.confirmationExplanation, language).then((r) => {
        if (r.translatedText) translatedMap.confirmationExplanation = r.translatedText;
      }),
      callSarvamTranslateApi(enPb.statusMessage, language).then((r) => {
        if (r.translatedText) translatedMap.statusMessage = r.translatedText;
      })
    );

    enPb.layerASteps.forEach((step, idx) => {
      tasks.push(
        callSarvamTranslateApi(step.title, language).then((r) => {
          if (r.translatedText) translatedMap[`layerA_title_${idx}`] = r.translatedText;
        }),
        callSarvamTranslateApi(step.instruction, language).then((r) => {
          if (r.translatedText) translatedMap[`layerA_inst_${idx}`] = r.translatedText;
        })
      );
    });

    enPb.layerBSteps.forEach((step, idx) => {
      tasks.push(
        callSarvamTranslateApi(step.title, language).then((r) => {
          if (r.translatedText) translatedMap[`layerB_title_${idx}`] = r.translatedText;
        }),
        callSarvamTranslateApi(step.instruction, language).then((r) => {
          if (r.translatedText) translatedMap[`layerB_inst_${idx}`] = r.translatedText;
        })
      );
    });

    enPb.safetyAndEscalationNotes.forEach((note, idx) => {
      tasks.push(
        callSarvamTranslateApi(note, language).then((r) => {
          if (r.translatedText) translatedMap[`escalation_${idx}`] = r.translatedText;
        })
      );
    });

    await Promise.all(tasks);

    if (Object.keys(translatedMap).length > 0) {
      const liveCancel = buildGroundedCancellationExplanation(
        playbook,
        language,
        translatedMap,
        'LIVE_SARVAM',
        'LIVE_SUCCESS'
      );
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
    const [titleRes, expRes, actRes] = await Promise.all([
      callSarvamTranslateApi(alert.title, language),
      callSarvamTranslateApi(alert.description, language),
      callSarvamTranslateApi(alert.suggestedAction, language),
    ]);
    if (expRes.translatedText) {
      res.json(
        buildGroundedAlertExplanation(
          alert,
          language,
          {
            title: titleRes.translatedText || undefined,
            explanation: expRes.translatedText,
            action: actRes.translatedText || undefined,
          },
          'LIVE_SARVAM',
          'LIVE_SUCCESS'
        )
      );
      return;
    }
  }

  res.json(baseAlert);
};
app.post('/api/language/financial-alert', handleFinancialAlertExplanation);
app.post('/api/sarvam/financial-alert', handleFinancialAlertExplanation);

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

// ============================================================================
// REST API ENDPOINTS — CORE DEBITLENS DASHBOARD, COMMITMENTS, TRANSACTIONS
// ============================================================================
app.get('/api/dashboard/summary', (_req, res) => {
  const state = computeCurrentState();
  const activeCommitments = state.commitments.filter(
    (c) => c.status !== 'CANCELLED_USER_CONFIRMED'
  );
  const monthlyRecurringSpend = Number(
    activeCommitments.reduce((sum, c) => sum + c.monthlyEquivalent, 0).toFixed(2)
  );
  const annualCommitmentTotal = Number(
    activeCommitments.reduce((sum, c) => sum + c.annualisedAmount, 0).toFixed(2)
  );
  const discretionaryAnnual = Number(
    activeCommitments
      .filter((c) => !c.isFinancialObligation)
      .reduce((sum, c) => sum + c.annualisedAmount, 0)
      .toFixed(2)
  );
  const obligationAnnual = Number(
    activeCommitments
      .filter((c) => c.isFinancialObligation)
      .reduce((sum, c) => sum + c.annualisedAmount, 0)
      .toFixed(2)
  );
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
        c.status === 'POST_CANCEL_ALERT'
    ).length + unresolvedTxnsCount;

  res.json({
    monthlyRecurringSpend,
    annualCommitmentTotal,
    discretionaryAnnual,
    obligationAnnual,
    activeCommitmentsCount: activeCommitments.length,
    totalCommitmentsCount: state.commitments.length,
    upcomingPaymentsCount: activeCommitments.filter((c) => Boolean(c.nextExpectedDate)).length,
    priceChangeAlertsCount,
    reviewRequiredCount,
    totalAlertsCount: state.alerts.filter((a) => a.status === 'OPEN').length,
    unresolvedTransactionsCount: unresolvedTxnsCount,
  });
});

app.get('/api/dashboard/monthly-trend', (_req, res) => {
  const state = computeCurrentState();
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const trend = months.map((m) => {
    const monthTxns = state.transactions.filter(
      (t) => t.direction === 'DEBIT' && t.transactionDate.startsWith(m)
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

app.post('/api/merchants/:id/confirm', async (req, res) => {
  const { rawDescription } = req.body as { rawDescription: string };
  if (!rawDescription) {
    res.status(400).json({ error: 'rawDescription is required' });
    return;
  }
  userMerchantOverrides[rawDescription] = req.params.id;
  savePersistentStore();
  const state = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    message: `Descriptor "${rawDescription}" confirmed for merchant ${req.params.id}.`,
    transactions: state.transactions,
    commitments: state.commitments,
  });
});

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
  res.json({
    commitment: cmt,
    supportingTransactions,
    playbook,
    session,
  });
});

app.patch('/api/commitments/:id/usage', async (req, res) => {
  const { lastUsedDate } = req.body as { lastUsedDate: string | null };
  const id = req.params.id;
  userCommitmentOverrides[id] = {
    ...(userCommitmentOverrides[id] || {}),
    lastUsedDate,
  };
  savePersistentStore();
  const state = computeCurrentState();
  await syncStateToGraphAsync();
  const updated = state.commitments.find((c) => c.id === id);
  res.json(updated);
});

app.get('/api/commitments/:id/evidence', (req, res) => {
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === req.params.id);
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }
  res.json({
    commitmentId: cmt.id,
    confidenceBreakdown: cmt.confidenceBreakdown,
    supportingTransactions: state.transactions.filter((t) => t.commitmentId === cmt.id),
    connectedDescriptors: cmt.connectedDescriptors,
  });
});

app.get('/api/alerts', (_req, res) => {
  const state = computeCurrentState();
  res.json(state.alerts);
});

app.patch('/api/alerts/:id/status', async (req, res) => {
  const { status } = req.body as { status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' };
  alertStatusOverrides[req.params.id] = status;
  savePersistentStore();
  const state = computeCurrentState();
  await syncStateToGraphAsync();
  res.json(state.alerts.find((a) => a.id === req.params.id));
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

app.patch('/api/cancellation/sessions/:id/steps/:stepId', async (req, res) => {
  const { completed } = req.body as { completed: boolean };
  const state = computeCurrentState();
  const sess = state.sessions.find((s) => s.id === req.params.id);
  if (!sess) {
    res.status(404).json({ error: 'Cancellation session not found' });
    return;
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
  savePersistentStore();
  const updatedState = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    session: updatedState.sessions.find((s) => s.id === req.params.id),
    commitment: updatedState.commitments.find((c) => c.id === cmtId),
  });
});

app.post('/api/cancellation/sessions/:id/evidence', async (req, res) => {
  const { evidenceType, description, referenceNumber, evidenceDate } = req.body as {
    evidenceType: CancellationEvidenceRecord['evidenceType'];
    description: string;
    referenceNumber: string;
    evidenceDate: string;
  };
  if (!referenceNumber || !description) {
    res.status(400).json({ error: 'Reference number and description are required.' });
    return;
  }
  const state = computeCurrentState();
  const sess = state.sessions.find((s) => s.id === req.params.id);
  if (!sess) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const cmtId = sess.commitmentId;
  const existingEvidence = userCommitmentOverrides[cmtId]?.evidenceRecords ?? sess.evidence;
  const newEvid: CancellationEvidenceRecord = {
    id: `EVID-${Date.now()}`,
    cancellationSessionId: sess.id,
    evidenceType: evidenceType || 'SERVICE_CONFIRMATION',
    description,
    referenceNumber,
    evidenceDate: evidenceDate || '2026-10-30',
    verificationStatus: 'USER_REPORTED',
    createdAt: new Date().toISOString(),
  };
  userCommitmentOverrides[cmtId] = {
    ...(userCommitmentOverrides[cmtId] || {}),
    evidenceRecords: [...existingEvidence, newEvid],
  };
  savePersistentStore();
  const updatedState = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    session: updatedState.sessions.find((s) => s.id === req.params.id),
    commitment: updatedState.commitments.find((c) => c.id === cmtId),
  });
});

// ============================================================================
// IMPORT, DETECTION METRICS & DEMO ENDPOINTS
// ============================================================================
app.get('/api/import/history', (_req, res) => {
  res.json(importHistory);
});

app.get('/api/import/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(
    [
      'transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference',
      'TXN-DEMO-101,2026-10-28,"RZP*STREAMBOX, MUMBAI IN",299,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UMN-STREAMBOX-01',
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
  const existingIds = new Set(rawCsvRows.map((r) => r.transaction_id));
  const combinedRows = [...rawCsvRows];
  let added = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const r of parsedRows) {
    const amt = parseFloat(String(r.amount || ''));
    if (
      !r.transaction_id ||
      !r.transaction_date ||
      !r.raw_description ||
      Number.isNaN(amt) ||
      amt <= 0
    ) {
      rejected++;
      continue;
    }
    if (existingIds.has(r.transaction_id)) {
      duplicates++;
      continue;
    }
    existingIds.add(r.transaction_id);
    combinedRows.push(r);
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
  savePersistentStore();

  const state = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    batch: batchRecord,
    totalTransactions: state.transactions.length,
    totalCommitments: state.commitments.length,
    totalAlerts: state.alerts.length,
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

  const existingIds = new Set(notificationEvents.map((n) => n.id));
  let added = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const item of incomingList) {
    if (!item || typeof item !== 'object' || !item.id || !item.eventDate || !item.merchantHint) {
      rejected++;
      continue;
    }
    if (existingIds.has(String(item.id))) {
      duplicates++;
      continue;
    }
    existingIds.add(String(item.id));
    notificationEvents.push({
      id: String(item.id),
      eventDate: String(item.eventDate),
      eventType: item.eventType || 'MANDATE_CREATED',
      merchantHint: String(item.merchantHint),
      serviceHint: String(item.serviceHint || item.merchantHint),
      trialStartDate: item.trialStartDate ?? null,
      trialEndDate: item.trialEndDate ?? null,
      expectedAmount: Number(item.expectedAmount || 0),
      currency: String(item.currency || 'INR'),
      paymentRail: item.paymentRail || 'UPI_AUTOPAY',
      mandateRef: String(item.mandateRef || `MND-${item.id}`),
      rawSummary: String(item.rawSummary || `${item.eventType} for ${item.merchantHint}`),
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
  savePersistentStore();

  const state = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    batch: batchRecord,
    totalNotifications: notificationEvents.length,
    totalCommitments: state.commitments.length,
    totalAlerts: state.alerts.length,
  });
});

app.post('/api/demo/simulate-post-cancel-debit', async (req, res) => {
  const { commitmentId = 'CMT-STREAMBOX' } = req.body as { commitmentId?: string };
  const state = computeCurrentState();
  const cmt = state.commitments.find((c) => c.id === commitmentId) || state.commitments[0];
  if (!cmt) {
    res.status(404).json({ error: 'Commitment not found' });
    return;
  }

  const pb = state.playbooks.find((p) => p.commitmentId === cmt.id)!;
  userCommitmentOverrides[cmt.id] = {
    ...(userCommitmentOverrides[cmt.id] || {}),
    cancelledAtOverride: '2026-10-10',
    completedStepIds: pb.steps.map((s) => s.id),
    evidenceRecords: [
      {
        id: `EVID-SIM-${Date.now()}`,
        cancellationSessionId: `SESS-${cmt.id}`,
        evidenceType: 'SERVICE_CONFIRMATION',
        description: `User recorded full Layer A service + Layer B mandate cancellation for ${cmt.serviceName}.`,
        referenceNumber: `CANC-REF-${cmt.id}-20261010`,
        evidenceDate: '2026-10-10',
        verificationStatus: 'USER_REPORTED',
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
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: cmt.paymentRail,
      account_alias: 'HDFC-XX4821',
      external_reference: `POST-CANCEL-${Date.now()}`,
    });
  }

  savePersistentStore();
  const updatedState = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    message: `Simulated post-cancellation debit ${simTxnId} (₹${cmt.latestAmount} on 2026-10-29) after cancellation on 2026-10-10.`,
    commitment: updatedState.commitments.find((c) => c.id === cmt.id),
    alerts: updatedState.alerts,
  });
});

app.post('/api/demo/reset', async (_req, res) => {
  loadSeedData(true);
  const state = computeCurrentState();
  await syncStateToGraphAsync();
  res.json({
    message: 'Synthetic dataset and cancellation sessions reset to initial benchmark state.',
    commitmentsCount: state.commitments.length,
    transactionsCount: state.transactions.length,
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

startServer();
