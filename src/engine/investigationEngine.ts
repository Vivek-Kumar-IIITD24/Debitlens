import {
  TransactionRecord,
  CommitmentRecord,
  MandateRecord,
  ServiceTermsRecord,
  ReconciliationFindingRecord,
  DetectionAlertRecord,
  CancellationSessionRecord,
  EvidenceCasebookEntry,
  MerchantCandidate,
  UnrecognizedDebitCase,
  ReviewQueueItem,
  ReviewQueuePriority,
  ReviewQueueStatus,
  CommitmentPassport,
  EvidencePackData,
  CsvMappingConfig,
  CsvMappingPreviewResult,
  CsvMappingPreviewRow,
  RelationshipConfidenceStatus,
  RecurrenceFrequency,
  PaymentRailType,
  DateFormatOption,
  ServiceLifecycleStatus,
  MandateLifecycleStatus,
  RecordSourceProvenance,
  ActionLifecycleStatus,
  EvidenceRecordLifecycleStatus,
} from '../types/debitlens';
import { MERCHANT_CATALOGUE, PAYMENT_PROCESSORS } from './referenceData';
import {
  formatINR,
  formatMinorINR,
  formatCurrency,
  normalizeCurrencyCode,
  toMinorUnits,
  fromMinorUnits,
} from '../utils/currency';
import { normaliseDescriptor, detectProcessor, parseStrictAmount, parseStrictSignedAmount, RawCsvRow } from './debitlensEngine';
import { getEffectiveMandateStatus, getMissingMandateFields } from './reconciliationEngine';

// ============================================================================
// 1. "I DON'T RECOGNISE THIS DEBIT" — EVIDENCE-SUPPORTED CANDIDATE ENGINE
// ============================================================================
export function generateMerchantCandidates(
  paramsOrTxn:
    | {
        transaction: TransactionRecord;
        allTransactions?: TransactionRecord[];
        userOverrides?: Record<string, string>;
      }
    | TransactionRecord,
  maybeAllTxns?: TransactionRecord[],
  maybeOverrides?: Record<string, string>
): MerchantCandidate[] {
  let transaction: TransactionRecord;
  let allTransactions: TransactionRecord[] = [];
  let userOverrides: Record<string, string> = {};

  if (paramsOrTxn && 'transaction' in paramsOrTxn && (paramsOrTxn as any).transaction) {
    transaction = (paramsOrTxn as any).transaction;
    allTransactions = (paramsOrTxn as any).allTransactions || [];
    userOverrides = (paramsOrTxn as any).userOverrides || {};
  } else {
    transaction = paramsOrTxn as TransactionRecord;
    allTransactions = maybeAllTxns || [];
    userOverrides = maybeOverrides || {};
  }
  const raw = transaction.rawDescription;
  const upper = raw.toUpperCase().trim();
  const normalised = normaliseDescriptor(raw);
  const candidates: (MerchantCandidate & { merchantId?: string; merchantName?: string; category?: string; website?: string })[] = [];
  const seenMerchantIds = new Set<string>();

  // 1. Check transaction-scoped user confirmed overrides for this specific transaction ID
  const directOverrideMerchantId =
    (transaction.id ? userOverrides[transaction.id] || userOverrides[`TXN:${transaction.id}`] : undefined);
  if (directOverrideMerchantId) {
    const merch = MERCHANT_CATALOGUE.find((m) => m.id === directOverrideMerchantId);
    if (merch && !seenMerchantIds.has(merch.id)) {
      seenMerchantIds.add(merch.id);
      candidates.push({
        candidateMerchantId: merch.id,
        candidateMerchantName: merch.canonicalName,
        candidateServiceName: merch.serviceName,
        merchantId: merch.id,
        merchantName: merch.canonicalName,
        serviceName: merch.serviceName,
        candidateType: 'PREVIOUS_OVERRIDE',
        matchReason: `Matches your confirmed assignment for transaction ${transaction.id} -> ${merch.canonicalName}.`,
        evidenceSource: 'USER_CONFIRMED_OVERRIDE',
        confidenceScore: 95,
        confidenceExplanation: 'Derived from your explicit manual confirmation for this transaction.',
      });
    }
  }

  // 2. Check exact and normalised catalogue alias matches
  for (const merch of MERCHANT_CATALOGUE) {
    for (const aliasEntry of merch.aliases) {
      if (upper.includes(aliasEntry.alias.toUpperCase())) {
        if (!seenMerchantIds.has(merch.id)) {
          seenMerchantIds.add(merch.id);
          candidates.push({
            candidateMerchantId: merch.id,
            candidateMerchantName: merch.canonicalName,
            candidateServiceName: merch.serviceName,
            merchantId: merch.id,
            merchantName: merch.canonicalName,
            serviceName: merch.serviceName,
            candidateType: 'EXACT_ALIAS',
            matchReason: `Descriptor token contains curated alias "${aliasEntry.alias}".`,
            evidenceSource: `MERCHANT_CATALOGUE [Rule: ${aliasEntry.matchingRule}]`,
            confidenceScore: aliasEntry.confidenceWeight,
            confidenceExplanation: `Strong match against curated merchant sub-identifier in reference catalogue.`,
          });
        }
      } else if (normalised.includes(aliasEntry.normalisedAlias)) {
        if (!seenMerchantIds.has(merch.id)) {
          seenMerchantIds.add(merch.id);
          candidates.push({
            candidateMerchantId: merch.id,
            candidateMerchantName: merch.canonicalName,
            candidateServiceName: merch.serviceName,
            merchantId: merch.id,
            merchantName: merch.canonicalName,
            serviceName: merch.serviceName,
            candidateType: 'NORMALISED_ALIAS',
            matchReason: `Normalised descriptor contains normalised merchant token "${aliasEntry.normalisedAlias}".`,
            evidenceSource: `MERCHANT_CATALOGUE [Normalised Match]`,
            confidenceScore: Math.max(70, aliasEntry.confidenceWeight - 10),
            confidenceExplanation: 'Normalised text pattern matches known recurring merchant.',
          });
        }
      }
    }
  }

  // 3. Check historical resolution of similar descriptors in imported statement
  const rawTokens = normalised.split(' ').filter((t) => t.length > 2);
  for (const t of allTransactions) {
    if (t.id === transaction.id || !t.merchantId) continue;
    const tNorm = normaliseDescriptor(t.rawDescription);
    const sharedToken = rawTokens.find((tok) => tNorm.includes(tok));
    if (sharedToken && !seenMerchantIds.has(t.merchantId)) {
      const merch = MERCHANT_CATALOGUE.find((m) => m.id === t.merchantId);
      if (merch) {
        seenMerchantIds.add(merch.id);
        candidates.push({
          candidateMerchantId: merch.id,
          candidateMerchantName: merch.canonicalName,
          candidateServiceName: merch.serviceName,
          merchantId: merch.id,
          merchantName: merch.canonicalName,
          serviceName: merch.serviceName,
          candidateType: 'RELATED_HISTORY',
          matchReason: `Shares descriptor token "${sharedToken}" with resolved transaction ${t.id} (${t.rawDescription}).`,
          evidenceSource: `TRANSACTION_HISTORY [${t.id}]`,
          confidenceScore: 68,
          confidenceExplanation: `Similar wording was previously resolved to ${merch.canonicalName} in imported statement.`,
        });
      }
    }
  }

  // 4. If transaction identifies a payment processor, surface common merchants using that processor
  const detectedProc = detectProcessor(raw);
  if (detectedProc && candidates.length < 3) {
    const procMerchants = MERCHANT_CATALOGUE.filter((m) =>
      m.aliases.some((a) => a.processorId === detectedProc.id)
    );
    for (const m of procMerchants.slice(0, 2)) {
      if (!seenMerchantIds.has(m.id)) {
        seenMerchantIds.add(m.id);
        candidates.push({
          candidateMerchantId: m.id,
          candidateMerchantName: m.canonicalName,
          candidateServiceName: m.serviceName,
          merchantId: m.id,
          merchantName: m.canonicalName,
          serviceName: m.serviceName,
          candidateType: 'PROCESSOR_RELATIONSHIP',
          isProcessorOnly: true,
          matchReason: `Other merchants may use this processor (${detectedProc.name}); no direct link to this transaction is established.`,
          evidenceSource: `PAYMENT_PROCESSOR [${detectedProc.name}]`,
          confidenceScore: 40,
          confidenceExplanation: `Other merchants may use this processor; no direct link to this transaction is established.`,
        });
      }
    }
  }

  // Sort candidates by confidence score descending
  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function buildUnrecognizedDebitCase(params: {
  transaction: TransactionRecord;
  candidates?: MerchantCandidate[];
  allTransactions?: TransactionRecord[];
  userMerchantOverrides?: Record<string, string>;
  userOverrides?: Record<string, string>;
  existingCases?: UnrecognizedDebitCase[];
  existingCase?: Partial<UnrecognizedDebitCase>;
}): UnrecognizedDebitCase & { guidanceChecklist: string[]; actionsTaken: any[]; notes: string } {
  const { transaction, existingCase = {} } = params;
  const candidates =
    params.candidates ||
    generateMerchantCandidates({
      transaction,
      allTransactions: params.allTransactions || [],
      userOverrides: params.userMerchantOverrides || params.userOverrides || {},
    });
  const now = new Date().toISOString();

  const candidateName =
    candidates.length > 0
      ? candidates[0].candidateMerchantName || (candidates[0] as any).merchantName
      : null;

  const recommendedNextAction =
    candidates.length > 0 && candidates[0].confidenceScore >= 80 && !(candidates[0] as any).isProcessorOnly
      ? `Review candidate "${candidateName}". If confirmed, associate to resolve descriptor.`
      : `Check your bank SMS/UPI app details for reference "${transaction.id}". If unfamiliar, inspect mandate list before filing a bank dispute.`;

  return {
    id: existingCase.id || `CASE-DEBIT-${transaction.id}`,
    transactionId: transaction.id,
    originalDescriptor: transaction.rawDescription,
    amount: transaction.amount,
    amountMinor: transaction.amountMinor ?? toMinorUnits(transaction.amount),
    transactionDate: transaction.transactionDate,
    currency: transaction.currency,
    paymentRail: transaction.paymentRail,
    accountAlias: transaction.accountAlias,
    externalReference: (transaction as any).externalReference ?? null,
    possibleProcessor: transaction.processorName,
    currentAssessment: {
      merchantIdentity: transaction.merchantName,
      serviceName: (transaction as any).merchantIdentity?.serviceName ?? null,
      resolutionStatus: transaction.resolutionStatus,
      matchingMethod: transaction.matchingMethod,
      explanation: transaction.resolutionExplanation,
    },
    candidateMerchants: candidates,
    status: existingCase.status || 'OPEN',
    userAssessment: existingCase.userAssessment || 'UNRECOGNIZED',
    userNotes: existingCase.userNotes || '',
    notes: (existingCase as any).notes || (transaction as any).resolutionExplanation || '',
    evidenceIds: existingCase.evidenceIds || [transaction.id],
    recommendedNextAction,
    guidanceChecklist: [
      `Search Gmail/SMS for payments of ${formatCurrency(transaction.amount, transaction.currency || 'INR')} around ${transaction.transactionDate}.`,
      'Check banking/UPI app for active e-mandate or UPI AutoPay with matching ceiling amounts.',
      'Report any suspected unauthorised transaction to your bank immediately through its official channels. Customer liability and reporting timelines depend on the cause of the transaction and the applicable RBI directions and bank policy. Keep your complaint acknowledgement or reference number.',
    ],
    actionsTaken: (existingCase as any).actionsTaken || [],
    createdAt: existingCase.createdAt || now,
    updatedAt: now,
    resolutionSource: existingCase.resolutionSource || null,
    resolvedMerchantId: existingCase.resolvedMerchantId || null,
  };
}

// ============================================================================
// 2. PRIORITY "REVIEW & RESOLVE" INBOX BUILDER
// ============================================================================
export function buildReviewQueue(params: {
  reconciliationFindings: ReconciliationFindingRecord[];
  alerts?: DetectionAlertRecord[];
  investigationCases?: UnrecognizedDebitCase[];
  investigations?: UnrecognizedDebitCase[];
  commitments?: CommitmentRecord[];
  mandates?: MandateRecord[];
  serviceTerms?: ServiceTermsRecord[];
  statusOverrides?: Record<string, ReviewQueueStatus>;
}): ReviewQueueItem[] {
  const {
    reconciliationFindings = [],
    alerts = [],
    commitments = [],
    mandates = [],
    serviceTerms = [],
    statusOverrides = {},
  } = params;
  const investigationCases = params.investigations || params.investigationCases || [];

  const items: ReviewQueueItem[] = [];
  const seenDedupKeys = new Set<string>();

  // A. Add open and under-review Investigation Cases
  for (const inv of investigationCases) {
    if (inv.status === 'CLOSED') continue;
    const dedupKey = `UNRESOLVED_DEBIT-${inv.transactionId}-${inv.transactionDate}`;
    if (seenDedupKeys.has(dedupKey)) continue;
    seenDedupKeys.add(dedupKey);

    const override =
      statusOverrides[dedupKey] ||
      statusOverrides[`RQ-INV-${inv.id}`] ||
      statusOverrides[inv.id];
    const status: ReviewQueueStatus = override || (inv.status === 'IDENTIFIED' ? 'RESOLVED' : 'OPEN');

    items.push({
      id: `RQ-INV-${inv.id}`,
      dedupKey,
      title: `Unrecognised Debit: ${inv.originalDescriptor}`,
      priority: 'P1' as any,
      status,
      category: 'UNRESOLVED_DEBIT',
      commitmentId: null,
      transactionId: inv.transactionId,
      mandateReference: null,
      serviceName: inv.currentAssessment.serviceName || 'Unknown Merchant / Service',
      merchantName: inv.currentAssessment.merchantIdentity || inv.possibleProcessor || 'Unidentified',
      amount: inv.amount,
      amountMinor: inv.amountMinor,
      eventDate: inv.transactionDate,
      whyItAppeared: `Raw descriptor "${inv.originalDescriptor}" lacks a confirmed merchant identity. ${
        inv.possibleProcessor ? `Identifies payment processor ${inv.possibleProcessor}.` : ''
      }`,
      supportingEvidenceCount: Array.isArray(inv.evidenceIds)
        ? inv.evidenceIds.length
        : inv.transactionId
        ? 1
        : 0,
      recommendedAction: inv.recommendedNextAction,
      actionType: 'INVESTIGATE_DEBIT',
      createdAt: inv.createdAt || null,
      updatedAt: inv.updatedAt,
    });
  }

  // B. Add Three-Way Reconciliation Findings
  for (const f of reconciliationFindings) {
    if (f.status === 'MATCHED') continue; // Matched items do not clutter the default active queue
    const dedupKey = `REC-${f.status}-${f.commitmentId}`;
    if (seenDedupKeys.has(dedupKey)) continue;
    seenDedupKeys.add(dedupKey);

    const cmt = commitments.find((c) => c.id === f.commitmentId);
    let priority: ReviewQueuePriority = 'P1' as any;
    let category: ReviewQueueItem['category'] = 'RECONCILIATION_DISCREPANCY' as any;
    let actionType: ReviewQueueItem['actionType'] = 'REVIEW_DISCREPANCY';

    if (f.status === 'CONFLICTING_EVIDENCE') {
      priority = 'P0' as any;
      category = 'CONFLICTING_EVIDENCE';
      actionType = 'INSPECT_EVIDENCE';
    } else if (f.status === 'AMOUNT_DISCREPANCY') {
      priority = 'P1' as any;
      category = 'PRICE_DISCREPANCY';
      actionType = 'REVIEW_DISCREPANCY';
    } else if (f.status === 'FREQUENCY_DISCREPANCY') {
      priority = 'P1' as any;
      category = 'FREQUENCY_DISCREPANCY';
      actionType = 'REVIEW_DISCREPANCY';
    } else if (f.status === 'SERVICE_TERMS_UNAVAILABLE') {
      priority = 'P2' as any;
      category = 'SERVICE_TERMS_MISSING';
      actionType = 'ADD_SERVICE_TERMS';
    } else if (f.status === 'MANDATE_WITHOUT_RECENT_TRANSACTION') {
      priority = 'P1' as any;
      category = 'DORMANT_MANDATE';
      actionType = 'VERIFY_MANDATE';
    } else if (f.status === 'POSSIBLE_DUPLICATE') {
      priority = 'P1' as any;
      category = 'POSSIBLE_DUPLICATE';
      actionType = 'REVIEW_DISCREPANCY';
    }

    const override =
      statusOverrides[dedupKey] ||
      statusOverrides[`RQ-REC-${f.id}`] ||
      statusOverrides[f.id] ||
      statusOverrides[`REC-${f.id}`];
    const status: ReviewQueueStatus = override || 'OPEN';

    items.push({
      id: `RQ-REC-${f.id}`,
      dedupKey,
      title: `${f.serviceName}: ${(f.status || 'DISCREPANCY').replace(/_/g, ' ')}`,
      priority,
      status,
      category,
      commitmentId: f.commitmentId || null,
      transactionId: f.latestTransactionId || null,
      mandateReference: f.mandateReference || null,
      serviceName: f.serviceName || cmt?.serviceName || 'Financial Commitment',
      merchantName: f.merchantName || cmt?.merchantName || 'Merchant',
      amount: f.actualTransactionAmount ?? (f as any).transactionEvidence?.latestTransactionAmount ?? null,
      amountMinor: f.actualTransactionAmountMinor ?? null,
      eventDate: f.evaluatedAt ? f.evaluatedAt.slice(0, 10) : null,
      whyItAppeared: f.explanation || (f as any).discrepancyReason || 'Three-way reconciliation discrepancy detected.',
      supportingEvidenceCount: Array.isArray(f.evidenceRecordIds) && f.evidenceRecordIds.length > 0
        ? f.evidenceRecordIds.length
        : (f.latestTransactionId ? 1 : 0) + (f.mandateReference ? 1 : 0) + (f.commitmentId ? 1 : 0),
      recommendedAction: f.recommendedAction || 'Review commitment documents and statement records.',
      actionType,
      createdAt: f.evaluatedAt || null,
      updatedAt: f.evaluatedAt || '',
    });
  }

  // C. Add High-Priority Smart Alerts (Post-Cancel, Trial Conversion, Resumed)
  for (const alt of alerts) {
    if (alt.status === 'RESOLVED') continue;
    const dedupKey = `ALT-${alt.alertType}-${alt.commitmentId || alt.transactionId}`;
    if (seenDedupKeys.has(dedupKey)) continue;
    seenDedupKeys.add(dedupKey);

    let priority: ReviewQueuePriority = 'P1' as any;
    let category: ReviewQueueItem['category'] = 'PRICE_DISCREPANCY';
    let actionType: ReviewQueueItem['actionType'] = 'INSPECT_EVIDENCE';

    if (alt.alertType === 'POST_CANCELLATION_DEBIT' || (alt.alertType as string) === 'POST_CANCEL_ALERT') {
      priority = 'P0' as any;
      category = 'POST_CANCEL_DEBIT';
      actionType = 'OPEN_CANCELLATION';
    } else if (alt.alertType === 'TRIAL_CONVERSION') {
      priority = 'P2' as any;
      category = 'TRIAL_CONVERSION';
      actionType = 'VIEW_PASSPORT';
    } else if (alt.alertType === 'ANNUAL_RENEWAL') {
      priority = 'P2' as any;
      category = 'UPCOMING_RENEWAL';
      actionType = 'VIEW_PASSPORT';
    } else if (alt.alertType === 'PRICE_INCREASE') {
      priority = 'P1' as any;
      category = 'PRICE_DISCREPANCY';
      actionType = 'REVIEW_DISCREPANCY';
    }

    const override = statusOverrides[dedupKey] || statusOverrides[`RQ-ALT-${alt.id}`];
    const status: ReviewQueueStatus = override || (alt.status === 'ACKNOWLEDGED' ? 'IN_REVIEW' : 'OPEN');
    const cmt = commitments.find((c) => c.id === alt.commitmentId);
    const alertEvidenceCount = (alt.transactionId ? 1 : 0) + (alt.commitmentId ? 1 : 0);

    const rawCreatedAt = alt.createdAt || null;
    const cleanDateOnly = rawCreatedAt
      ? rawCreatedAt.includes('T')
        ? rawCreatedAt.slice(0, 10)
        : rawCreatedAt
      : null;
    const cleanIsoTimestamp = rawCreatedAt
      ? rawCreatedAt.includes('T')
        ? rawCreatedAt
        : `${rawCreatedAt}T00:00:00Z`
      : null;

    items.push({
      id: `RQ-ALT-${alt.id}`,
      dedupKey,
      title: alt.title,
      priority,
      status,
      category,
      commitmentId: alt.commitmentId ?? null,
      transactionId: alt.transactionId ?? null,
      mandateReference: null,
      serviceName: cmt?.serviceName || 'Financial Commitment',
      merchantName: cmt?.merchantName || 'Merchant',
      amount: alt.detectedValue ? parseStrictAmount(alt.detectedValue.replace(/[^\d.]/g, '')) : null,
      amountMinor: null,
      eventDate: cleanDateOnly,
      whyItAppeared: alt.description,
      supportingEvidenceCount: alertEvidenceCount,
      recommendedAction: alt.suggestedAction,
      actionType,
      createdAt: cleanIsoTimestamp,
      updatedAt: cleanIsoTimestamp || '',
    });
  }

  // Priority ordering: P0 / HIGH_ATTENTION -> P1 / REVIEW_REQUIRED -> P2 / UPCOMING -> P3 / INFORMATIONAL
  const priorityWeight: Record<string, number> = {
    P0: 5,
    HIGH_ATTENTION: 4,
    P1: 4,
    REVIEW_REQUIRED: 3,
    P2: 2,
    UPCOMING: 2,
    P3: 1,
    INFORMATIONAL: 1,
  };

  return items.sort((a, b) => {
    const diff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    if (diff !== 0) return diff;
    const dB = b.eventDate ? Date.parse(b.eventDate) || 0 : 0;
    const dA = a.eventDate ? Date.parse(a.eventDate) || 0 : 0;
    return dB - dA;
  });
}

// ============================================================================
// 3. COMMITMENT PASSPORT GENERATOR (Section 6)
// ============================================================================
export function generateCommitmentPassport(params: {
  commitment: CommitmentRecord;
  transactions?: TransactionRecord[];
  mandates?: MandateRecord[];
  mandate?: MandateRecord | null;
  serviceTerms?: ServiceTermsRecord[] | ServiceTermsRecord | null;
  terms?: ServiceTermsRecord | null;
  reconciliationFinding?: ReconciliationFindingRecord | null;
  reconciliation?: ReconciliationFindingRecord | null;
  cancellationSession?: CancellationSessionRecord | null;
  session?: CancellationSessionRecord | null;
  evidenceCasebookEntries?: EvidenceCasebookEntry[];
  casebookEntries?: EvidenceCasebookEntry[];
  alerts?: any[];
  auditEvents?: any[];
}): CommitmentPassport {
  const commitment = params.commitment;
  const transactions = params.transactions || [];
  const mandateList: MandateRecord[] = Array.isArray(params.mandates)
    ? params.mandates
    : params.mandate
    ? [params.mandate]
    : [];
  const termsList: ServiceTermsRecord[] = Array.isArray(params.serviceTerms)
    ? params.serviceTerms
    : params.serviceTerms
    ? [params.serviceTerms as ServiceTermsRecord]
    : params.terms
    ? [params.terms]
    : [];
  const reconciliationFinding: ReconciliationFindingRecord | null =
    params.reconciliationFinding || params.reconciliation || null;
  const cancellationSession: CancellationSessionRecord | null =
    params.cancellationSession || params.session || null;
  const evidenceCasebookEntries: EvidenceCasebookEntry[] = (
    params.evidenceCasebookEntries ||
    params.casebookEntries ||
    []
  ).filter((e: any) => !e.commitmentId || e.commitmentId === commitment.id);

  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id && t.direction === 'DEBIT')
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const mandate =
    mandateList.find(
      (m) =>
        m.commitmentId === commitment.id ||
        (commitment.mandateRef && m.mandateReference === commitment.mandateRef)
    ) || null;

  const terms =
    termsList.find((s) => s.commitmentId === commitment.id) || null;

  const amounts = cmtTxns.map((t) => t.amount);
  const minAmount = amounts.length > 0 ? Math.min(...amounts) : null;
  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : null;

  const effectiveMandateStatus = getEffectiveMandateStatus(mandate);
  const missingMandateFields = getMissingMandateFields(mandate);

  const missingTermsFields: string[] = [];
  if (!terms) {
    missingTermsFields.push('terms_document');
  } else {
    if (terms.expectedAmountMinor === null) missingTermsFields.push('expectedAmount');
    if (!terms.billingFrequency || terms.billingFrequency === 'UNKNOWN') missingTermsFields.push('billingFrequency');
  }

  // Calculate Data Coverage Quality
  const coverageItems = [
    { label: 'Statement Transactions', present: cmtTxns.length > 0, weight: 25 },
    { label: 'Payment Authorisation', present: Boolean(mandate && effectiveMandateStatus === 'ACTIVE_VALID'), weight: 25 },
    { label: 'Documented Service Terms', present: Boolean(terms && terms.expectedAmountMinor !== null), weight: 25 },
    { label: 'Merchant Identity', present: commitment.confidenceScore >= 70, weight: 25 },
  ];
  const qualityPercent = coverageItems.reduce(
    (acc, it) => acc + (it.present ? it.weight : 0),
    0
  );

  const missingItems: string[] = [];
  if (cmtTxns.length === 0) missingItems.push('No statement debits found in imported period');
  if (!mandate) missingItems.push('No matching payment mandate imported');
  else if (effectiveMandateStatus !== 'ACTIVE_VALID') missingItems.push(`Mandate is ${effectiveMandateStatus}`);
  if (!terms) missingItems.push('No contracted service terms or invoice attached');
  else if (terms.expectedAmountMinor === null) missingItems.push('Contracted service price unavailable in terms');

  const areBothStopped =
    commitment.serviceLifecycleStatus === 'CANCELLED' &&
    commitment.mandateLifecycleStatus === 'REVOKED';

  let cancellationSummary = 'Service subscription and payment mandate are both currently active.';
  if (areBothStopped) {
    cancellationSummary = 'Both service subscription cancellation and payment mandate revocation have been recorded.';
  } else if (commitment.serviceLifecycleStatus === 'CANCELLED') {
    cancellationSummary = 'Service subscription is cancelled, but payment mandate has not been confirmed revoked in banking records.';
  } else if (commitment.mandateLifecycleStatus === 'REVOKED') {
    cancellationSummary = 'Payment mandate is revoked, but service account cancellation remains unverified with the merchant.';
  }

  const totalDebitsCount = cmtTxns.length;
  const totalSpent = amounts.reduce((acc, a) => acc + a, 0);
  const firstDebitDate = cmtTxns[0]?.transactionDate || commitment.firstObservedDate || (commitment as any).firstSeenDate || null;
  const latestDebitDate = cmtTxns[cmtTxns.length - 1]?.transactionDate || null;

  const verifiedElementsCount = coverageItems.filter((c) => c.present).length;

  const merchInfo = MERCHANT_CATALOGUE.find((m) => m.id === commitment.merchantId);
  const auditEventsList = params.auditEvents || [];
  const cmtTxnIdSet = new Set(cmtTxns.map((t) => t.id));
  const confirmEvent = auditEventsList.find(
    (e: any) =>
      (e.commitmentId === commitment.id ||
        (e.transactionId && cmtTxnIdSet.has(e.transactionId))) &&
      (e.eventType === 'IDENTITY_MATCH_CONFIRMED' ||
        e.eventType === 'CANDIDATE_CONFIRMED' ||
        e.actionType === 'IDENTITY_MATCH_CONFIRMED' ||
        e.actionType === 'CANDIDATE_CONFIRMED')
  );
  const confirmedAt = confirmEvent?.timestamp || null;

  const isUserConfirmed = Boolean(
    confirmEvent ||
    commitment.verificationStatus === 'USER_CONFIRMED' ||
    commitment.relationshipStatus === 'USER_CONFIRMED'
  );

  let resolvedProvenance: 'USER_CONFIRMED' | 'CATALOGUE_MATCHED' | 'SYSTEM_INFERRED' | 'SUGGESTED' | 'UNKNOWN' = 'UNKNOWN';
  if (isUserConfirmed) {
    resolvedProvenance = 'USER_CONFIRMED';
  } else if (merchInfo && (commitment.verificationStatus === 'CONFIRMED' || commitment.relationshipStatus === 'CONFIRMED')) {
    resolvedProvenance = 'CATALOGUE_MATCHED';
  } else if (
    commitment.relationshipStatus === 'INFERRED' ||
    (commitment.relationshipStatus as string) === 'SYSTEM_INFERRED' ||
    commitment.confidenceLabel === 'HIGH'
  ) {
    resolvedProvenance = 'SYSTEM_INFERRED';
  } else if (commitment.confidenceLabel === 'MEDIUM') {
    resolvedProvenance = 'SUGGESTED';
  } else {
    resolvedProvenance = 'UNKNOWN';
  }

  const sectionA_Identity = {
    serviceName: commitment.serviceName,
    merchantName: commitment.merchantName,
    merchantId: commitment.merchantId,
    legalEntityName: (merchInfo as any)?.legalEntityName || null,
    category: commitment.category,
    supportContact: (merchInfo as any)?.customerSupportEmail || null,
    grievanceOfficer: null,
    website: (merchInfo as any)?.officialWebsite || null,
    confidenceScore: commitment.confidenceScore,
    confidenceLabel: commitment.confidenceLabel,
    connectedDescriptors: commitment.connectedDescriptors,
    processorName: commitment.processorName,
    accountAlias: cmtTxns[0]?.accountAlias || 'Default Account',
    provenance: resolvedProvenance,
    confirmedAt,
  };

  const cmtCurrency =
    normalizeCurrencyCode(commitment.currency || cmtTxns[0]?.currency || 'INR') || 'INR';
  const mandateCurrency = mandate
    ? normalizeCurrencyCode(mandate.currency || 'INR') || mandate.currency || 'INR'
    : cmtCurrency;
  const termsCurrency = terms
    ? normalizeCurrencyCode(terms.currency || 'INR') || terms.currency || 'INR'
    : cmtCurrency;

  const sectionB_Mandate = {
    mandatePresent: Boolean(mandate),
    rail: mandate?.paymentRail || commitment.paymentRail || 'UNKNOWN',
    mandateReference: mandate?.mandateReference || commitment.mandateRef || null,
    maxAmount: mandate?.maxAmount ?? null,
    currency: mandateCurrency,
    mandateStatus: effectiveMandateStatus,
    frequency: mandate?.frequency || 'UNKNOWN',
    startDate: mandate?.startDate || null,
    endDate: mandate?.endDate || null,
    sourceType: (mandate?.sourceType || 'UNKNOWN') as RecordSourceProvenance,
    sourceProvenance: (mandate?.sourceType || 'UNKNOWN') as RecordSourceProvenance,
  };

  const sectionC_Terms = {
    termsPresent: Boolean(terms),
    serviceName: terms?.serviceName || commitment.serviceName,
    expectedAmount: terms?.expectedAmount ?? null,
    currency: termsCurrency,
    billingFrequency: terms?.billingFrequency || 'UNKNOWN',
    renewalDate: commitment.nextExpectedDate || null,
    userVerified: Boolean(terms?.userVerified),
    sourceDocument: terms?.documentSource || null,
    sourceType: (terms?.sourceType || 'UNKNOWN') as RecordSourceProvenance,
    sourceProvenance: (terms?.sourceType || 'UNKNOWN') as RecordSourceProvenance,
  };

  const sectionD_History = {
    totalDebitsCount,
    totalSpent,
    currency: cmtCurrency,
    firstDebitDate,
    latestDebitDate,
    averageDebitAmount: totalDebitsCount > 0 ? Math.round(totalSpent / totalDebitsCount) : null,
    cadence: commitment.recurrenceType,
  };

  const latestActualTxnAmount = cmtTxns.length > 0 ? cmtTxns[cmtTxns.length - 1].amount : null;
  const reconciledActualTxnAmount =
    reconciliationFinding?.latestTransactionId && reconciliationFinding.actualTransactionAmount !== null
      ? reconciliationFinding.actualTransactionAmount
      : latestActualTxnAmount;

  const recCurrency = reconciliationFinding?.currency || cmtCurrency;

  const sectionE_Reconciliation = {
    reconciliationStatus: reconciliationFinding?.status || 'UNRESOLVED',
    outcome: reconciliationFinding?.status || 'UNRESOLVED',
    currency: recCurrency,
    amountComparison: reconciliationFinding
      ? `Debit ${
          reconciledActualTxnAmount !== null
            ? formatCurrency(reconciledActualTxnAmount, recCurrency)
            : 'Unavailable'
        } vs Documented ${
          reconciliationFinding.expectedServiceAmount !== null
            ? formatCurrency(reconciliationFinding.expectedServiceAmount, termsCurrency)
            : 'Unavailable'
        }`
      : 'Awaiting comparison data',
    cadenceComparison: `Observed ${commitment.recurrenceType} cadence vs Mandate ${mandate?.frequency || 'Unregistered'}`,
    lifecycleComparison: areBothStopped ? 'Both Stopped' : 'Active or Inconsistent',
    actualReconciledDebit: reconciledActualTxnAmount,
    actualDebitTransactionAmount: latestActualTxnAmount,
    typicalObservedAmount: commitment.typicalAmount,
    expectedBillingAmount: reconciliationFinding?.expectedServiceAmount ?? terms?.expectedAmount ?? null,
    mandateMaxAmount: reconciliationFinding?.mandateMaxAmount ?? mandate?.maxAmount ?? null,
    expectedPrice: reconciliationFinding?.expectedServiceAmount ?? null,
    actualAmount: reconciledActualTxnAmount,
    mandateCap: reconciliationFinding?.mandateMaxAmount ?? null,
    discrepancyAmount: reconciliationFinding?.discrepancyAmount ?? null,
    discrepancyPercent: reconciliationFinding?.discrepancyPercent ?? null,
    explanation:
      reconciliationFinding?.explanation ||
      'Reconciliation pending attachment of complete statement, mandate, or service documents.',
    evidenceRecordIds: reconciliationFinding?.evidenceRecordIds || [],
    recommendedAction:
      reconciliationFinding?.recommendedAction ||
      'Attach missing service terms or import mandates to complete three-way reconciliation.',
  };

  const deriveServiceActionLifecycle = (status?: ServiceLifecycleStatus | string): ActionLifecycleStatus => {
    const s = String(status || 'UNKNOWN');
    if (!status || s === 'ACTIVE' || s === 'UNKNOWN') return 'NOT_STARTED';
    if (s === 'CANCELLATION_IN_PROGRESS') return 'USER_INTENDS_TO_ACT';
    if (s === 'CANCELLATION_REQUESTED') return 'USER_REPORTED_REQUEST';
    if (s === 'CANCELLATION_REPORTED_BY_USER' || s === 'CANCELLATION_EVIDENCE_ATTACHED') {
      return 'USER_REPORTED_ACKNOWLEDGEMENT';
    }
    if (s === 'CANCELLATION_CONFIRMED' || s === 'CANCELLED') {
      return 'USER_REPORTED_COMPLETION';
    }
    return 'NOT_STARTED';
  };

  const deriveMandateActionLifecycle = (status?: MandateLifecycleStatus | string): ActionLifecycleStatus => {
    const m = String(status || 'UNKNOWN');
    if (!status || m === 'ACTIVE' || m === 'PAUSED' || m === 'EXPIRED' || m === 'UNKNOWN' || m === 'PENDING_VERIFICATION') {
      return 'NOT_STARTED';
    }
    if (m === 'REVOCATION_INITIATED') return 'USER_REPORTED_REQUEST';
    if (m === 'REVOCATION_REPORTED_BY_USER' || m === 'REVOCATION_REPORTED' || m === 'REVOCATION_EVIDENCE_ATTACHED') {
      return 'USER_REPORTED_ACKNOWLEDGEMENT';
    }
    if (m === 'REVOKED') return 'USER_REPORTED_COMPLETION';
    return 'NOT_STARTED';
  };

  const sessionEv = cancellationSession?.evidence || [];
  const customEv = evidenceCasebookEntries.filter(
    (e) =>
      e.actor === 'USER_CASEBOOK_ATTACHMENT' ||
      e.actor === 'USER_EVIDENCE_SUBMISSION' ||
      e.category === 'SERVICE_CANCELLATION_EVENT' ||
      e.category === 'MANDATE_REVOCATION_EVENT' ||
      e.evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED' ||
      e.evidenceRecordLifecycle === 'USER_NOTE_RECORDED'
  );
  const hasReferenceRecorded =
    sessionEv.some(
      (e) =>
        e.evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED' ||
        Boolean(
          e.referenceNumber &&
            e.referenceNumber !== 'UNSPECIFIED-REF' &&
            !e.referenceNumber.startsWith('REF-NOTE-')
        )
    ) ||
    customEv.some(
      (e) =>
        e.evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED' ||
        Boolean(
          e.sourceReference &&
            e.sourceReference !== 'UNSPECIFIED-REF' &&
            !e.sourceReference.startsWith('REF-NOTE-')
        )
    );
  const hasNoteRecorded = sessionEv.length > 0 || customEv.length > 0;
  const derivedEvidenceRecordLifecycle: EvidenceRecordLifecycleStatus = hasReferenceRecorded
    ? 'EVIDENCE_REFERENCE_RECORDED'
    : hasNoteRecorded
    ? 'USER_NOTE_RECORDED'
    : 'NO_EVIDENCE_RECORDED';

  const sectionF_Cancellation = {
    serviceLifecycleStatus: commitment.serviceLifecycleStatus,
    mandateLifecycleStatus: commitment.mandateLifecycleStatus,
    serviceActionLifecycle: deriveServiceActionLifecycle(commitment.serviceLifecycleStatus),
    mandateActionLifecycle: deriveMandateActionLifecycle(commitment.mandateLifecycleStatus),
    evidenceRecordLifecycle: derivedEvidenceRecordLifecycle,
    bothCancelled: areBothStopped,
    areBothStopped,
    cancellationSummary,
  };

  const mappedCasebookRecords = evidenceCasebookEntries.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: (e as any).eventDate !== undefined ? (e as any).eventDate : e.timestamp || null,
    evidenceDate: (e as any).eventDate !== undefined ? (e as any).eventDate : null,
    verificationStatus: e.verificationStatus,
    evidenceRecordLifecycle:
      e.evidenceRecordLifecycle ||
      (e.actor === 'USER_CASEBOOK_ATTACHMENT' || e.actor === 'USER_EVIDENCE_SUBMISSION'
        ? 'EVIDENCE_REFERENCE_RECORDED'
        : undefined),
    sourceReference: e.sourceReference,
    sourceType: e.sourceType || 'UNKNOWN',
  }));
  const existingSourceRefs = new Set(mappedCasebookRecords.map((r) => r.sourceReference));
  const unmappedSessionRecords = sessionEv
    .filter((ev) => !existingSourceRefs.has(ev.referenceNumber))
    .map((ev) => ({
      id: `CB-CANC-${ev.id}`,
      title: `${ev.evidenceType.replace(/_/g, ' ')}: Ref ${ev.referenceNumber}`,
      description: ev.description,
      date: ev.evidenceDate ?? null,
      evidenceDate: ev.evidenceDate ?? null,
      verificationStatus: ev.verificationStatus || 'EVIDENCE_ATTACHED',
      evidenceRecordLifecycle: ev.evidenceRecordLifecycle || 'EVIDENCE_REFERENCE_RECORDED',
      sourceReference: ev.referenceNumber,
      sourceType: ev.sourceType || 'USER_ENTERED',
    }));
  const allPassportEvidenceRecords = [...mappedCasebookRecords, ...unmappedSessionRecords];

  const sectionG_Evidence = {
    evidenceRecordsCount: allPassportEvidenceRecords.length,
    evidenceRecords: allPassportEvidenceRecords,
  };

  const recordCoverage = {
    percent: qualityPercent,
    presentCount: verifiedElementsCount,
    totalCount: 4,
    missingItems,
  };

  const verificationQuality = {
    provenance: resolvedProvenance,
    confidenceScore: commitment.confidenceScore,
    confidenceLabel: commitment.confidenceLabel,
    isUserConfirmed,
    confirmedAt,
  };

  const financialReconciliationStatus = {
    status: reconciliationFinding?.status || 'UNRESOLVED',
    isDiscrepancy: Boolean(reconciliationFinding?.status?.includes('DISCREPANCY')),
    explanation:
      reconciliationFinding?.explanation ||
      'Reconciliation pending attachment of complete statement, mandate, or service documents.',
  };

  const dataCoverage = {
    coveragePercent: qualityPercent,
    verifiedElementsCount,
    totalElementsCount: 4,
    missingElements: missingItems,
    qualitySummary: `${qualityPercent}% evidence completeness across transactions, mandate, terms, and merchant identity.`,
    statusBreakdown: {
      verified: verifiedElementsCount,
      missing: missingItems.length,
    },
    overallQualityPercent: qualityPercent,
    coverageStatement: `${qualityPercent}% evidence completeness across transactions, mandate, terms, and merchant identity.`,
    missingItems,
  };

  return {
    commitmentId: commitment.id,
    generatedAt: new Date().toISOString(),
    sectionA_Identity,
    sectionB_Mandate,
    sectionC_Terms,
    sectionD_History,
    sectionE_Reconciliation,
    sectionF_Cancellation,
    sectionG_Evidence,
    dataCoverage,
    recordCoverage,
    verificationQuality,
    financialReconciliationStatus,
    // Backwards compatibility sections
    sectionB_FinancialPattern: {
      observedCadence: commitment.recurrenceType,
      transactionCount: cmtTxns.length,
      firstObservedDate: cmtTxns[0]?.transactionDate || commitment.firstObservedDate || null,
      latestTransactionDate: cmtTxns[cmtTxns.length - 1]?.transactionDate || null,
      typicalAmount: commitment.typicalAmount,
      amountRange: { min: minAmount, max: maxAmount },
      priceChangesDetected: commitment.priceChangeDetected,
      annualisedAmount: commitment.annualisedAmount,
    },
    sectionC_Authorisation: {
      mandateReference: mandate?.mandateReference || commitment.mandateRef || null,
      paymentRail: mandate?.paymentRail || commitment.paymentRail || 'UNKNOWN',
      mandateMaxAmount: mandate?.maxAmount || null,
      effectiveMandateStatus,
      startDate: mandate?.startDate || null,
      endDate: mandate?.endDate || null,
      sourceType: mandate?.sourceType || 'UNAVAILABLE',
      missingMandateFields,
    },
    sectionD_ServiceTerms: {
      documentedPrice: terms?.expectedAmount ?? null,
      billingFrequency: terms?.billingFrequency || 'UNKNOWN',
      currency: terms?.currency || 'INR',
      sourceDocumentId: terms?.id || null,
      extractionMethod: terms?.documentSource || null,
      userVerified: Boolean(terms?.userVerified),
      missingFields: missingTermsFields,
    },
    sectionF_Lifecycle: {
      serviceLifecycleStatus: commitment.serviceLifecycleStatus,
      mandateLifecycleStatus: commitment.mandateLifecycleStatus,
      areBothStopped,
      cancellationSummary,
    },
    sectionG_EvidenceTimeline: evidenceCasebookEntries,
  };
}

// ============================================================================
// 4. REAL EVIDENCE PACK EXPORT (JSON & PRINT-READY HTML)
// ============================================================================
export function generateEvidencePackData(params: {
  commitment: CommitmentRecord;
  transactions?: TransactionRecord[];
  mandates?: MandateRecord[];
  mandate?: MandateRecord | null;
  serviceTerms?: ServiceTermsRecord[] | ServiceTermsRecord | null;
  terms?: ServiceTermsRecord | null;
  reconciliationFinding?: ReconciliationFindingRecord | null;
  reconciliation?: ReconciliationFindingRecord | null;
  cancellationSession?: CancellationSessionRecord | null;
  session?: CancellationSessionRecord | null;
  alerts?: any[];
  casebookEntries?: any[];
  auditEvents?: any[];
}): EvidencePackData {
  const commitment = params.commitment;
  const transactions = params.transactions || [];
  const mandateList: MandateRecord[] = Array.isArray(params.mandates)
    ? params.mandates
    : params.mandate
    ? [params.mandate]
    : [];
  const termsList: ServiceTermsRecord[] = Array.isArray(params.serviceTerms)
    ? params.serviceTerms
    : params.serviceTerms
    ? [params.serviceTerms as ServiceTermsRecord]
    : params.terms
    ? [params.terms]
    : [];
  const reconciliationFinding: ReconciliationFindingRecord | null =
    params.reconciliationFinding || params.reconciliation || null;
  const cancellationSession: CancellationSessionRecord | null =
    params.cancellationSession || params.session || null;
  const packCasebookEntries: EvidenceCasebookEntry[] = (
    params.casebookEntries || []
  ).filter((e: any) => !e.commitmentId || e.commitmentId === commitment.id);

  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id)
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const mandate =
    mandateList.find(
      (m) =>
        m.commitmentId === commitment.id ||
        (commitment.mandateRef && m.mandateReference === commitment.mandateRef)
    ) || null;

  const terms =
    termsList.find((s) => s.commitmentId === commitment.id) || null;

  const missingGaps: string[] = [];
  if (!terms) missingGaps.push('Contracted invoice or terms document not attached');
  if (!mandate) missingGaps.push('No bank mandate record found in imported data');
  if (commitment.confidenceScore < 80) missingGaps.push('Merchant identity unconfirmed by user');

  const effectiveCancelDate =
    cancellationSession?.serviceCancelledAt ||
    cancellationSession?.paymentAuthorisationRevokedAt ||
    null;
  const postCancelIdSet = new Set(cancellationSession?.postCancellationTransactionIds || []);
  const postCancelTxns = cmtTxns.filter(
    (t) =>
      t.direction === 'DEBIT' &&
      (Boolean(t.isPostCancellationDebit) ||
        postCancelIdSet.has(t.id) ||
        (effectiveCancelDate &&
          !Number.isNaN(Date.parse(effectiveCancelDate)) &&
          Date.parse(t.transactionDate) > Date.parse(effectiveCancelDate)))
  );
  const cmtDebitTxns = cmtTxns.filter((t) => t.direction === 'DEBIT');

  // Explicit provenance classification from record metadata (Section 9 / Gate F)
  // Never infer synthetic vs imported provenance from ID suffixes like -01 or DOC-SEED-
  const termsOrigin: RecordSourceProvenance | null = terms
    ? (terms.sourceType || 'UNKNOWN')
    : null;
  const mandateOrigin: RecordSourceProvenance | null = mandate
    ? (mandate.sourceType || 'UNKNOWN')
    : null;

  const isImportedOrigin = (src?: string | null) =>
    src === 'CSV_STATEMENT' ||
    src === 'IMPORTED_CSV' ||
    src === 'USER_UPLOAD' ||
    src === 'USER_CSV_UPLOAD' ||
    src === 'CSV_MAPPED' ||
    src === 'NOTIFICATION_JSON' ||
    src === 'USER_IMPORTED' ||
    src === 'USER_ENTERED';

  const isSyntheticOrigin = (src?: string | null) =>
    src === 'DEMO_SEED' || src === 'SYNTHETIC' || src === 'SYNTHETIC_DEMO';

  const isUnknownOrigin = (src?: string | null) => !src || src === 'UNKNOWN';

  const hasImported =
    cmtTxns.some((t) => isImportedOrigin(t.sourceType as string)) ||
    isImportedOrigin(mandateOrigin) ||
    isImportedOrigin(termsOrigin);

  const hasSynthetic =
    cmtTxns.some((t) => isSyntheticOrigin(t.sourceType as string)) ||
    isSyntheticOrigin(mandateOrigin) ||
    isSyntheticOrigin(termsOrigin) ||
    (cmtTxns.length === 0 && !hasImported && !terms && !mandate);

  const hasUnknownOrigin =
    cmtTxns.some((t) => isUnknownOrigin(t.sourceType as string)) ||
    (mandate !== null && isUnknownOrigin(mandateOrigin)) ||
    (terms !== null && isUnknownOrigin(termsOrigin));

  const syntheticNotice =
    hasImported && hasSynthetic
      ? 'Mixed Evidence Source · Comprises both user-imported/entered records and demonstration seed fixtures for this commitment. Processed locally and deterministically. Zero customer credentials collected.'
      : hasUnknownOrigin && !hasImported && !hasSynthetic
      ? 'Unknown Provenance Record(s) · One or more linked records lack explicit origin metadata and are treated as UNKNOWN provenance.'
      : hasUnknownOrigin && (hasImported || hasSynthetic)
      ? `Mixed / Unknown Provenance · Includes ${hasImported ? 'user-imported/entered' : 'synthetic'} records alongside record(s) with UNKNOWN origin metadata.`
      : hasImported
      ? 'User-Imported Statement Records · Processed locally and deterministically. Zero customer credentials collected.'
      : 'Synthetic Demonstration Dataset · Generated for verified evaluation. Zero customer credentials collected.';

  const cmtTxnIdSet = new Set(cmtTxns.map((t) => t.id));
  const isUserConfirmedIdentity = Boolean(
    commitment.verificationStatus === 'USER_CONFIRMED' ||
    commitment.relationshipStatus === 'USER_CONFIRMED' ||
    (commitment as any).isUserConfirmed ||
    (params.auditEvents || []).some(
      (e: any) =>
        (e.commitmentId === commitment.id ||
          (e.transactionId && cmtTxnIdSet.has(e.transactionId))) &&
        (e.eventType === 'IDENTITY_MATCH_CONFIRMED' ||
          e.eventType === 'CANDIDATE_CONFIRMED' ||
          e.actionType === 'IDENTITY_MATCH_CONFIRMED' ||
          e.actionType === 'CANDIDATE_CONFIRMED')
    )
  );

  const evItems = cancellationSession?.evidence || [];
  const customPackEv = packCasebookEntries.filter(
    (e) =>
      e.actor === 'USER_CASEBOOK_ATTACHMENT' ||
      e.actor === 'USER_EVIDENCE_SUBMISSION' ||
      e.category === 'SERVICE_CANCELLATION_EVENT' ||
      e.category === 'MANDATE_REVOCATION_EVENT' ||
      e.evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED' ||
      e.evidenceRecordLifecycle === 'USER_NOTE_RECORDED'
  );
  const hasPackRefRecorded =
    evItems.some(
      (e) =>
        e.evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED' ||
        Boolean(
          e.referenceNumber &&
            e.referenceNumber !== 'UNSPECIFIED-REF' &&
            !e.referenceNumber.startsWith('REF-NOTE-')
        )
    ) ||
    customPackEv.some(
      (e) =>
        e.evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED' ||
        Boolean(
          e.sourceReference &&
            e.sourceReference !== 'UNSPECIFIED-REF' &&
            !e.sourceReference.startsWith('REF-NOTE-')
        )
    );
  const hasPackNoteRecorded = evItems.length > 0 || customPackEv.length > 0;
  const evidenceRecordLifecycle: EvidenceRecordLifecycleStatus = hasPackRefRecorded
    ? 'EVIDENCE_REFERENCE_RECORDED'
    : hasPackNoteRecorded
    ? 'USER_NOTE_RECORDED'
    : 'NO_EVIDENCE_RECORDED';

  const sLife = String(commitment.serviceLifecycleStatus || 'UNKNOWN');
  const mLife = String(commitment.mandateLifecycleStatus || 'UNKNOWN');

  const serviceActionLifecycle: ActionLifecycleStatus =
    sLife === 'ACTIVE' || sLife === 'UNKNOWN'
      ? 'NOT_STARTED'
      : sLife === 'CANCELLATION_IN_PROGRESS'
      ? 'USER_INTENDS_TO_ACT'
      : sLife === 'CANCELLATION_REQUESTED'
      ? 'USER_REPORTED_REQUEST'
      : sLife === 'CANCELLATION_REPORTED_BY_USER' || sLife === 'CANCELLATION_EVIDENCE_ATTACHED'
      ? 'USER_REPORTED_ACKNOWLEDGEMENT'
      : 'USER_REPORTED_COMPLETION';

  const mandateActionLifecycle: ActionLifecycleStatus =
    mLife === 'ACTIVE' || mLife === 'PAUSED' || mLife === 'EXPIRED' || mLife === 'UNKNOWN' || mLife === 'PENDING_VERIFICATION'
      ? 'NOT_STARTED'
      : mLife === 'REVOCATION_INITIATED'
      ? 'USER_REPORTED_REQUEST'
      : mLife === 'REVOCATION_REPORTED_BY_USER' || mLife === 'REVOCATION_REPORTED' || mLife === 'REVOCATION_EVIDENCE_ATTACHED'
      ? 'USER_REPORTED_ACKNOWLEDGEMENT'
      : 'USER_REPORTED_COMPLETION';

  return {
    commitmentId: commitment.id,
    evidencePackVersion: '1.0',
    exportTimestamp: new Date().toISOString(),
    header: {
      platformName: 'DebitLens',
      reportTitle: 'DebitLens Financial Evidence Pack',
      subtitle: 'Financial Evidence Summary',
      reportId: `EVP-${commitment.id}-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      syntheticNotice,
    },
    commitmentIdentity: {
      merchantName: commitment.merchantName,
      serviceName: commitment.serviceName,
      commitmentId: commitment.id,
      descriptors: commitment.connectedDescriptors,
      resolutionStatus: isUserConfirmedIdentity
        ? 'USER_CONFIRMED'
        : commitment.confidenceLabel === 'HIGH'
        ? 'SYSTEM_INFERRED'
        : 'INFERRED',
      provenance: 'RULE_BASED_DESCRIPTOR_RESOLVER',
    },
    transactions: cmtTxns.map((t) => ({
      id: t.id,
      date: t.transactionDate,
      description: t.rawDescription,
      amount: t.amount,
      direction: t.direction,
      currency: t.currency,
      reference: (t as any).externalReference ?? null,
      source: t.sourceType || 'UNKNOWN',
    })),
    serviceTerms: {
      documentedPrice: terms?.expectedAmount ?? null,
      billingFrequency: terms?.billingFrequency || 'UNKNOWN',
      currency: terms?.currency || commitment.currency || 'INR',
      documentSource: terms ? `${terms.documentSource} (${termsOrigin || 'UNKNOWN'})` : null,
      documentId: terms?.id || null,
      verificationStatus: terms?.userVerified ? 'USER_CONFIRMED' : 'UNVERIFIED',
      missingFields: !terms ? ['terms_document'] : terms.expectedAmount === null ? ['expectedAmount'] : [],
    },
    paymentMandate: {
      mandateId: mandate?.id || null,
      mandateReference: mandate?.mandateReference || commitment.mandateRef || null,
      paymentRail: mandate?.paymentRail || commitment.paymentRail || 'UNKNOWN',
      maxAuthorisedAmount: mandate?.maxAmount || null,
      effectiveStatus: getEffectiveMandateStatus(mandate),
      startDate: mandate?.startDate || null,
      expiryDate: mandate?.endDate || null,
      provenance: mandate ? (mandate.sourceType || 'UNKNOWN') : 'UNAVAILABLE',
      missingFields: getMissingMandateFields(mandate),
    },
    reconciliation: {
      outcome: reconciliationFinding?.status || 'UNRESOLVED',
      explanation:
        reconciliationFinding?.explanation ||
        'Reconciliation pending attachment of complete statement and mandate records.',
      currency: reconciliationFinding?.currency || commitment.currency || 'INR',
      expectedServicePrice: reconciliationFinding?.expectedServiceAmount ?? null,
      actualDebitAmount:
        reconciliationFinding?.latestTransactionId && reconciliationFinding.actualTransactionAmount !== null
          ? reconciliationFinding.actualTransactionAmount
          : cmtDebitTxns.length > 0
          ? cmtDebitTxns[cmtDebitTxns.length - 1].amount
          : null,
      mandateCap: reconciliationFinding?.mandateMaxAmount ?? null,
      discrepancyAmount: reconciliationFinding?.discrepancyAmount ?? null,
      discrepancyPercent: reconciliationFinding?.discrepancyPercent ?? null,
      recommendedAction:
        reconciliationFinding?.recommendedAction || 'Inspect account transactions and verified plan tier.',
    },
    cancellationEvidence: {
      serviceLifecycle: sLife,
      mandateLifecycle: mLife,
      serviceActionLifecycle,
      mandateActionLifecycle,
      evidenceRecordLifecycle,
      requestDates: {
        service: cancellationSession?.serviceCancelledAt || null,
        mandate: cancellationSession?.paymentAuthorisationRevokedAt || null,
      },
      confirmationReferences: Array.from(
        new Set([
          ...evItems.map((e) => e.referenceNumber).filter(Boolean),
          ...customPackEv.map((e) => e.sourceReference).filter(Boolean),
        ])
      ),
      evidenceSources: Array.from(
        new Set([
          ...evItems.map((e) => e.evidenceType).filter(Boolean),
          ...customPackEv.map((e) => e.category).filter(Boolean),
        ])
      ),
      // Section 7.1 & 7.2: Never derive verified acknowledgement or completion from evidenceType alone, and never claim file upload without an uploaded file
      verificationStatus:
        evidenceRecordLifecycle === 'EVIDENCE_REFERENCE_RECORDED'
          ? 'EVIDENCE_REFERENCE_RECORDED'
          : evidenceRecordLifecycle === 'USER_NOTE_RECORDED'
          ? 'USER_NOTE_RECORDED'
          : serviceActionLifecycle !== 'NOT_STARTED' || mandateActionLifecycle !== 'NOT_STARTED'
          ? 'USER_REPORTED'
          : 'NO_EVIDENCE_AVAILABLE',
    },
    postCancellationActivity: {
      subsequentDebitsDetected: postCancelTxns.length > 0,
      subsequentDebits: postCancelTxns.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        amount: t.amount,
        description: t.rawDescription,
      })),
      monitoringStatement:
        postCancelTxns.length > 0
          ? `${postCancelTxns.length} debit(s) occurred after recorded cancellation date (${effectiveCancelDate}).`
          : (serviceActionLifecycle !== 'NOT_STARTED' || mandateActionLifecycle !== 'NOT_STARTED') &&
            !effectiveCancelDate
          ? 'Cancellation or revocation has been reported, but the post-action timeline cannot yet be established because the effective cancellation/revocation date is unavailable (null). Observed transactions remain preserved in transaction history.'
          : 'No subsequent statement debits detected after recorded cancellation date.',
    },
    dataLimitations: {
      missingDocuments: !terms,
      missingMandateDetails: !mandate || getEffectiveMandateStatus(mandate) === 'INCOMPLETE',
      unconfirmedMerchant: commitment.confidenceScore < 80,
      unverifiedCancellation: !hasPackRefRecorded && !hasPackNoteRecorded,
      evidenceGaps: missingGaps,
    },
    provenanceNotice:
      'DebitLens presents available records and rule-based findings. This report does not independently verify statements, merchant confirmations or bank records unless explicitly identified. Synthetic demonstration data is labelled where applicable.',
  };
}

export function escapeHtml(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generatePrintableEvidencePackHtml(pack: EvidencePackData): string {
  const packCcy = pack.reconciliation.currency || pack.serviceTerms.currency || 'INR';
  const formatAmount = (amt: number | null, ccy: string = packCcy) =>
    amt !== null ? escapeHtml(formatCurrency(amt, ccy)) : 'Unavailable';
  const debitsCount = pack.transactions.filter((t) => t.direction === 'DEBIT').length;
  const creditsCount = pack.transactions.filter((t) => t.direction === 'CREDIT').length;
  const debCountText =
    creditsCount > 0
      ? `${debitsCount} debit${debitsCount === 1 ? '' : 's'}, ${creditsCount} credit${creditsCount === 1 ? '' : 's'} (${pack.transactions.length} total records)`
      : `${debitsCount} debit${debitsCount === 1 ? '' : 's'} recorded`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(pack.header.reportTitle)} — ${escapeHtml(pack.commitmentIdentity.serviceName)}</title>
  <style>
    @media print {
      body { font-size: 11pt; color: #0f172a; margin: 0.5in; }
      .no-print { display: none; }
      .page-break { page-break-after: always; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; margin: 2rem auto; max-width: 800px; padding: 0 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; color: #0f172a; }
    h2 { font-size: 1.1rem; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 0.25rem; margin-top: 1.5rem; color: #0f766e; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.85rem; }
    th, td { border: 1px solid #cbd5e1; padding: 0.4rem 0.6rem; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .header-box { border-bottom: 2px solid #0f766e; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-start; }
    .badge { display: inline-block; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; background: #e0f2fe; color: #0369a1; }
    .badge-warn { background: #fef3c7; color: #92400e; }
    .disclaimer { font-size: 0.75rem; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 0.75rem; border-radius: 6px; margin-top: 2rem; }
    .print-btn { background: #0f766e; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 1.5rem; text-align: right;">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="header-box">
    <div>
      <h1>DebitLens Financial Evidence Pack</h1>
      <div style="font-size: 0.9rem; color: #64748b;">${escapeHtml(pack.header.subtitle)} · Report ID: <code>${escapeHtml(pack.header.reportId)}</code></div>
      <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">Generated: ${escapeHtml(pack.header.generatedAt)}</div>
    </div>
    <div style="text-align: right;">
      <span class="badge badge-warn">${escapeHtml(pack.header.syntheticNotice.split('·')[0].trim())}</span>
    </div>
  </div>

  <h2>Section A: Commitment Identity & Merchant Profile</h2>
  <table>
    <tr><th style="width: 30%;">Service Name</th><td><strong>${escapeHtml(pack.commitmentIdentity.serviceName)}</strong></td></tr>
    <tr><th>Merchant Name</th><td>${escapeHtml(pack.commitmentIdentity.merchantName)} (${escapeHtml(pack.commitmentIdentity.commitmentId)})</td></tr>
    <tr><th>Connected Descriptors</th><td><code>${escapeHtml(pack.commitmentIdentity.descriptors.join(', '))}</code></td></tr>
    <tr><th>Resolution Status</th><td>${escapeHtml(pack.commitmentIdentity.resolutionStatus)} (${escapeHtml(pack.commitmentIdentity.provenance)})</td></tr>
  </table>

  <h2>Section B: Payment Mandate Authorisation</h2>
  <table>
    <tr><th style="width: 30%;">Mandate Reference</th><td><code>${escapeHtml(pack.paymentMandate.mandateReference || 'Unavailable')}</code></td></tr>
    <tr><th>Payment Rail</th><td>${escapeHtml(pack.paymentMandate.paymentRail.replace(/_/g, ' '))}</td></tr>
    <tr><th>Maximum Limit</th><td>${formatAmount(pack.paymentMandate.maxAuthorisedAmount, packCcy)}</td></tr>
    <tr><th>Effective Mandate Status</th><td><span class="badge">${escapeHtml(pack.paymentMandate.effectiveStatus)}</span></td></tr>
    <tr><th>Start / Expiry Date</th><td>${escapeHtml(pack.paymentMandate.startDate || '—')} / ${escapeHtml(pack.paymentMandate.expiryDate || 'No Expiry')}</td></tr>
  </table>

  <h2>Section C: Commercial Terms & Pricing</h2>
  <table>
    <tr><th style="width: 30%;">Documented Price</th><td>${formatAmount(pack.serviceTerms.documentedPrice, pack.serviceTerms.currency)}</td></tr>
    <tr><th>Billing Frequency</th><td>${escapeHtml(pack.serviceTerms.billingFrequency)}</td></tr>
    <tr><th>Verification Status</th><td>${escapeHtml(pack.serviceTerms.verificationStatus)}</td></tr>
  </table>

  <h2>Section D: Transaction History & Cadence</h2>
  <table>
    <tr><th style="width: 30%;">Total Transactions</th><td>${debCountText}</td></tr>
    <tr><th>Post-Cancellation Activity</th><td><strong>${escapeHtml(pack.postCancellationActivity.monitoringStatement)}</strong></td></tr>
  </table>

  <h2>Section E: Three-Way Reconciliation Analysis</h2>
  <table>
    <tr><th style="width: 30%;">Reconciliation Outcome</th><td><span class="badge">${escapeHtml(pack.reconciliation.outcome)}</span></td></tr>
    <tr><th>Documented Price</th><td>${formatAmount(pack.reconciliation.expectedServicePrice, pack.serviceTerms.currency)}</td></tr>
    <tr><th>Actual Statement Debit</th><td><strong>${formatAmount(pack.reconciliation.actualDebitAmount, packCcy)}</strong></td></tr>
    <tr><th>Mandate Limit Ceiling</th><td>${formatAmount(pack.reconciliation.mandateCap, packCcy)}</td></tr>
    <tr><th>Amount Discrepancy</th><td>${pack.reconciliation.discrepancyAmount !== null ? escapeHtml(formatCurrency(pack.reconciliation.discrepancyAmount, packCcy)) : 'None'} (${escapeHtml(pack.reconciliation.discrepancyPercent ?? 0)}%)</td></tr>
    <tr><th>Detailed Finding</th><td>${escapeHtml(pack.reconciliation.explanation)}</td></tr>
    <tr><th>Recommended Action</th><td>${escapeHtml(pack.reconciliation.recommendedAction)}</td></tr>
  </table>

  <h2>Section F: Two-Layer Cancellation & Post-Cancellation Monitoring</h2>
  <table>
    <tr><th style="width: 30%;">Service Lifecycle (Layer A)</th><td>${escapeHtml(pack.cancellationEvidence.serviceLifecycle)}</td></tr>
    <tr><th>Mandate Lifecycle (Layer B)</th><td>${escapeHtml(pack.cancellationEvidence.mandateLifecycle)}</td></tr>
    <tr><th>Evidence Record Status</th><td>${escapeHtml(pack.cancellationEvidence.verificationStatus)}</td></tr>
    <tr><th>Cancellation References</th><td>${pack.cancellationEvidence.confirmationReferences.length ? escapeHtml(pack.cancellationEvidence.confirmationReferences.join(', ')) : 'None recorded'}</td></tr>
    <tr><th>Subsequent Statement Debits</th><td><strong>${escapeHtml(pack.postCancellationActivity.monitoringStatement)}</strong></td></tr>
  </table>

  <h2>Section G: Statement Transaction Evidence (${pack.transactions.length} Records)</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Raw Descriptor</th><th>Direction</th><th>Amount</th><th>ID</th></tr>
    </thead>
    <tbody>
      ${pack.transactions
        .map(
          (t) => `<tr>
          <td>${escapeHtml(t.date)}</td>
          <td><code>${escapeHtml(t.description)}</code></td>
          <td>${escapeHtml(t.direction)}</td>
          <td>${escapeHtml(formatCurrency(t.amount, t.currency))}</td>
          <td><small>${escapeHtml(t.id)}</small></td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>Provenance & Accuracy Notice:</strong><br>
    ${escapeHtml(pack.provenanceNotice)}
  </div>
</body>
</html>`;
}

// ============================================================================
// 5. SMART BANK STATEMENT CSV MAPPING WIZARD
// ============================================================================
export function parseCsvDate(
  rawDate: string,
  format: DateFormatOption = 'YYYY-MM-DD'
): string | null {
  if (!rawDate || !rawDate.trim()) return null;
  const trimmed = rawDate.trim();

  if (format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY') {
    const parts = trimmed.split(/[-/.]/);
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const yStr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      const y = parseInt(yStr, 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2100) {
        const testDate = new Date(Date.UTC(y, m - 1, d));
        if (testDate.getUTCDate() === d && testDate.getUTCMonth() === m - 1) {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }
    }
  } else if (format === 'MM/DD/YYYY' || format === 'MM-DD-YYYY') {
    const parts = trimmed.split(/[-/.]/);
    if (parts.length === 3) {
      const m = parseInt(parts[0], 10);
      const d = parseInt(parts[1], 10);
      const yStr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      const y = parseInt(yStr, 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2100) {
        const testDate = new Date(Date.UTC(y, m - 1, d));
        if (testDate.getUTCDate() === d && testDate.getUTCMonth() === m - 1) {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }
    }
  } else if (format === 'YYYY-MM-DD') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      const testDate = new Date(Date.UTC(y, m - 1, d));
      if (testDate.getUTCDate() === d && testDate.getUTCMonth() === m - 1) {
        return trimmed;
      }
    }
  } else {
    // AUTO format — only accept unambiguous ISO or unambiguous DD/MM or MM/DD where day > 12 or day === month
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      const testDate = new Date(Date.UTC(y, m - 1, d));
      if (testDate.getUTCDate() === d && testDate.getUTCMonth() === m - 1) {
        return trimmed;
      }
      return null;
    }
    const slashParts = trimmed.split(/[-/.]/);
    if (slashParts.length === 3) {
      const p0 = parseInt(slashParts[0], 10);
      const p1 = parseInt(slashParts[1], 10);
      const p2 = slashParts[2].length === 2 ? `20${slashParts[2]}` : slashParts[2];
      const y = parseInt(p2, 10);
      if (y >= 1970 && y <= 2100) {
        if (p0 > 12 && p0 <= 31 && p1 >= 1 && p1 <= 12) {
          const testDate = new Date(Date.UTC(y, p1 - 1, p0));
          if (testDate.getUTCDate() === p0 && testDate.getUTCMonth() === p1 - 1) {
            return `${y}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
          }
        } else if (p1 > 12 && p1 <= 31 && p0 >= 1 && p0 <= 12) {
          const testDate = new Date(Date.UTC(y, p0 - 1, p1));
          if (testDate.getUTCDate() === p1 && testDate.getUTCMonth() === p0 - 1) {
            return `${y}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
          }
        } else if (p0 === p1 && p0 >= 1 && p0 <= 12) {
          const testDate = new Date(Date.UTC(y, p1 - 1, p0));
          if (testDate.getUTCDate() === p0 && testDate.getUTCMonth() === p1 - 1) {
            return `${y}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
          }
        } else {
          // Ambiguous date (e.g. 05/06/2026 under AUTO format) — reject so user selects explicit format
          return null;
        }
      }
    }
  }
  return null;
}

export function parseCsvRowsRFC4180(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function previewCsvMapping(
  csvText: string,
  userConfig?: Partial<CsvMappingConfig>
): CsvMappingPreviewResult {
  const allParsedRows = parseCsvRowsRFC4180(csvText);
  if (allParsedRows.length === 0) {
    const emptyConfig: CsvMappingConfig = {
      dateColumn: '',
      descriptionColumn: '',
      amountMode: 'SINGLE_SIGNED_COLUMN',
      dateFormat: 'YYYY-MM-DD',
    };
    return {
      headers: [],
      suggestedMappings: emptyConfig,
      detectedMapping: emptyConfig,
      previewRows: [],
      totalRows: 0,
      totalRowsFound: 0,
      validRowCount: 0,
      validRowsCount: 0,
      rejectedRowCount: 0,
      duplicateRowCount: 0,
      unmappedHeaders: [],
      validationErrors: [{ row: 0, reason: 'CSV content is empty' }],
    };
  }

  const headers = allParsedRows[0];
  const lowerHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Suggest Date column
  const dateCandidates = ['transactiondate', 'date', 'txndate', 'valuedate', 'postingdate'];
  const suggestedDate =
    headers.find((_, i) => dateCandidates.includes(lowerHeaders[i])) || headers[0] || '';

  // Suggest Description column
  const descCandidates = ['rawdescription', 'description', 'narration', 'particulars', 'details', 'remarks'];
  const suggestedDesc =
    headers.find((_, i) => descCandidates.includes(lowerHeaders[i])) || headers[1] || '';

  // Suggest Amount Mode & Columns
  const debitCandidates = ['debit', 'withdrawal', 'dr', 'debitamount', 'withdrawalamt', 'dr_amt'];
  const creditCandidates = ['credit', 'deposit', 'cr', 'creditamount', 'depositamt', 'cr_amt'];
  const signedCandidates = ['amount', 'transactionamount', 'netamount'];

  const foundDebit = headers.find((_, i) => debitCandidates.includes(lowerHeaders[i]));
  const foundCredit = headers.find((_, i) => creditCandidates.includes(lowerHeaders[i]));
  const foundSigned = headers.find((_, i) => signedCandidates.includes(lowerHeaders[i]));

  const isSeparate =
    userConfig?.amountMode === 'SEPARATE_DEBIT_CREDIT' ||
    userConfig?.amountMode === 'SEPARATE_COLUMNS' ||
    Boolean(!userConfig?.amountMode && (foundDebit || foundCredit));

  const chosenAmountMode: CsvMappingConfig['amountMode'] =
    userConfig?.amountMode || (isSeparate ? 'SEPARATE_DEBIT_CREDIT' : 'SINGLE_SIGNED_COLUMN');

  const debitCol =
    userConfig?.debitAmountColumn || userConfig?.debitColumn || foundDebit || '';
  const creditCol =
    userConfig?.creditAmountColumn || userConfig?.creditColumn || foundCredit || '';
  const signedCol =
    userConfig?.singleAmountColumn || userConfig?.signedAmountColumn || foundSigned || 'amount';

  const refCandidates = ['externalreference', 'reference', 'utr', 'refno', 'referenceno', 'chequeno', 'chqrefno'];
  const suggestedRef = headers.find((_, i) => refCandidates.includes(lowerHeaders[i]));

  const accountCandidates = ['accountalias', 'account', 'accountno', 'accountnumber', 'acct'];
  const suggestedAccount = headers.find((_, i) => accountCandidates.includes(lowerHeaders[i]));

  const currencyCandidates = ['currency', 'curr', 'ccy'];
  const suggestedCurrency = headers.find((_, i) => currencyCandidates.includes(lowerHeaders[i]));

  const config: CsvMappingConfig = {
    dateColumn: userConfig?.dateColumn || suggestedDate,
    descriptionColumn: userConfig?.descriptionColumn || suggestedDesc,
    amountMode: chosenAmountMode,
    debitColumn: debitCol,
    debitAmountColumn: debitCol,
    creditColumn: creditCol,
    creditAmountColumn: creditCol,
    singleAmountColumn: signedCol,
    signedAmountColumn: signedCol,
    dateFormat: userConfig?.dateFormat || 'YYYY-MM-DD',
    referenceColumn: userConfig?.referenceColumn || suggestedRef || '',
    accountColumn: userConfig?.accountColumn || suggestedAccount || '',
    currencyColumn: userConfig?.currencyColumn || suggestedCurrency || '',
    defaultRail: userConfig?.defaultRail || 'UNKNOWN',
    defaultAccountAlias: userConfig?.defaultAccountAlias || 'PRIMARY-ACCOUNT',
  };

  const dateIdx = headers.indexOf(config.dateColumn);
  const descIdx = headers.indexOf(config.descriptionColumn);
  const debitIdx = debitCol ? headers.indexOf(debitCol) : -1;
  const creditIdx = creditCol ? headers.indexOf(creditCol) : -1;
  const signedIdx = signedCol ? headers.indexOf(signedCol) : -1;
  const refIdx = config.referenceColumn ? headers.indexOf(config.referenceColumn) : -1;
  const acctIdx = config.accountColumn ? headers.indexOf(config.accountColumn) : -1;
  const currIdx = config.currencyColumn ? headers.indexOf(config.currencyColumn) : -1;

  const previewRows: CsvMappingPreviewRow[] = [];
  const validationErrors: { row: number; reason: string }[] = [];
  let validRowCount = 0;
  let rejectedRowCount = 0;
  let duplicateRowCount = 0;
  const seenKeys = new Set<string>();

  const dataRows = allParsedRows.slice(1);

  dataRows.forEach((cells, idx) => {
    const rowNum = idx + 1; // 1-indexed data row
    const rawDate = dateIdx >= 0 ? cells[dateIdx] || '' : '';
    const rawDesc = descIdx >= 0 ? cells[descIdx] || '' : '';
    const rawRef = refIdx >= 0 ? cells[refIdx] || '' : '';
    const acctAlias = (acctIdx >= 0 && cells[acctIdx]) ? cells[acctIdx] : config.defaultAccountAlias || 'PRIMARY-ACCOUNT';
    const rawCurrency = currIdx >= 0 ? (cells[currIdx] || '').trim() : 'INR';
    const validatedCurrency = normalizeCurrencyCode(rawCurrency);
    const currency = validatedCurrency || 'INR';

    let interpretedAmount: number | null = null;
    let direction: 'DEBIT' | 'CREDIT' = 'DEBIT';
    let rawAmountStr = '';
    let isAmbiguous = false;

    if (isSeparate) {
      const drStr = debitIdx >= 0 ? cells[debitIdx] || '' : '';
      const crStr = creditIdx >= 0 ? cells[creditIdx] || '' : '';
      const drAmt = parseStrictAmount(drStr);
      const crAmt = parseStrictAmount(crStr);

      if (drAmt !== null && drAmt > 0 && crAmt !== null && crAmt > 0) {
        isAmbiguous = true;
        rawAmountStr = `Debit: ${drStr}, Credit: ${crStr}`;
        interpretedAmount = null;
      } else if (drAmt !== null && drAmt > 0) {
        interpretedAmount = drAmt;
        direction = 'DEBIT';
        rawAmountStr = drStr;
      } else if (crAmt !== null && crAmt > 0) {
        interpretedAmount = crAmt;
        direction = 'CREDIT';
        rawAmountStr = crStr;
      } else {
        rawAmountStr = drStr || crStr || '0';
        interpretedAmount = null;
      }
    } else {
      const str = signedIdx >= 0 ? cells[signedIdx] || '' : '';
      rawAmountStr = str;
      const parsedSigned = parseStrictSignedAmount(str);
      if (parsedSigned !== null && parsedSigned.amount > 0) {
        interpretedAmount = parsedSigned.amount;
        direction = parsedSigned.isNegative ? 'CREDIT' : 'DEBIT';
      }
    }

    const parsedDate = parseCsvDate(rawDate, config.dateFormat);

    let isValid = true;
    let rejectReason: string | undefined;

    if (isAmbiguous) {
      isValid = false;
      rejectReason = 'Ambiguous row: both debit and credit columns contain positive amounts';
    } else if (!rawDesc) {
      isValid = false;
      rejectReason = 'Missing description';
    } else if (!validatedCurrency) {
      isValid = false;
      rejectReason = `Invalid or unsupported ISO 4217 currency code "${rawCurrency}"`;
    } else if (interpretedAmount === null || interpretedAmount <= 0) {
      isValid = false;
      rejectReason = `Invalid amount "${rawAmountStr}"`;
    } else if (!parsedDate) {
      isValid = false;
      rejectReason = `Invalid date "${rawDate}" under format ${config.dateFormat}`;
    }

    const dedupKey = parsedDate && interpretedAmount !== null && validatedCurrency
      ? computeCanonicalCsvRowFingerprint({
          accountAlias: acctAlias,
          currency,
          parsedDate,
          direction,
          amount: interpretedAmount,
          rawDescription: rawDesc,
          externalReference: rawRef,
        })
      : '';
    if (isValid) {
      if (seenKeys.has(dedupKey)) {
        duplicateRowCount++;
        isValid = false;
        rejectReason = 'Duplicate row within file';
      } else {
        seenKeys.add(dedupKey);
        validRowCount++;
      }
    } else {
      rejectedRowCount++;
      validationErrors.push({ row: rowNum, reason: rejectReason || 'Validation failed' });
    }

    const mappedRow = isValid && parsedDate && interpretedAmount !== null
      ? {
          transaction_date: parsedDate,
          raw_description: rawDesc,
          amount: String(interpretedAmount),
          currency,
          direction,
          account_alias: acctAlias,
          payment_rail: config.defaultRail || 'UNKNOWN',
          external_reference: rawRef || '',
        }
      : null;

    if (previewRows.length < 10) {
      previewRows.push({
        rowNumber: rowNum,
        rawDate,
        parsedDate,
        rawDescription: rawDesc,
        rawAmount: rawAmountStr,
        interpretedAmount,
        direction,
        isValid,
        rejectReason,
        validationError: rejectReason,
        mappedRow,
      });
    }
  });

  const mappedColumnNames = [
    config.dateColumn,
    config.descriptionColumn,
    config.debitColumn,
    config.creditColumn,
    config.signedAmountColumn,
    config.referenceColumn,
    config.accountColumn,
    config.currencyColumn,
  ].filter(Boolean);

  const unmappedHeaders = headers.filter((h) => !mappedColumnNames.includes(h));

  return {
    headers,
    suggestedMappings: config,
    detectedMapping: config,
    previewRows,
    totalRows: dataRows.length,
    totalRowsFound: dataRows.length,
    validRowCount,
    validRowsCount: validRowCount,
    rejectedRowCount,
    duplicateRowCount,
    unmappedHeaders,
    validationErrors,
  };
}

export function parseAllMappedCsvRows(
  csvContent: string,
  config: CsvMappingConfig,
  includeCredits: boolean = true
): {
  validRows: RawCsvRow[];
  totalRows: number;
  validCount: number;
  rejectedCount: number;
  duplicateCount: number;
  validationErrors: { row: number; reason: string }[];
} {
  const allParsedRows = parseCsvRowsRFC4180(csvContent);
  if (allParsedRows.length < 2) {
    return {
      validRows: [],
      totalRows: 0,
      validCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      validationErrors: [{ row: 0, reason: 'CSV has no data rows' }],
    };
  }

  const headers = allParsedRows[0];
  const dateIdx = headers.indexOf(config.dateColumn);
  const descIdx = headers.indexOf(config.descriptionColumn);
  const debitIdx = config.debitAmountColumn || config.debitColumn ? headers.indexOf(config.debitAmountColumn || config.debitColumn!) : -1;
  const creditIdx = config.creditAmountColumn || config.creditColumn ? headers.indexOf(config.creditAmountColumn || config.creditColumn!) : -1;
  const signedIdx = config.singleAmountColumn || config.signedAmountColumn ? headers.indexOf(config.singleAmountColumn || config.signedAmountColumn!) : -1;
  const refIdx = config.referenceColumn ? headers.indexOf(config.referenceColumn) : -1;
  const acctIdx = config.accountColumn ? headers.indexOf(config.accountColumn) : -1;
  const currIdx = config.currencyColumn ? headers.indexOf(config.currencyColumn) : -1;

  const isSeparate = config.amountMode === 'SEPARATE_DEBIT_CREDIT' || config.amountMode === 'SEPARATE_COLUMNS';
  const dataRows = allParsedRows.slice(1);
  const validRows: RawCsvRow[] = [];
  const validationErrors: { row: number; reason: string }[] = [];
  const seenDedupKeys = new Set<string>();
  let duplicateCount = 0;
  let rejectedCount = 0;

  dataRows.forEach((cells, idx) => {
    const rowNum = idx + 1;
    const rawDate = dateIdx >= 0 ? cells[dateIdx] || '' : '';
    const rawDesc = descIdx >= 0 ? cells[descIdx] || '' : '';
    const rawRef = refIdx >= 0 ? cells[refIdx] || '' : '';
    const acctAlias = (acctIdx >= 0 && cells[acctIdx]) ? cells[acctIdx] : config.defaultAccountAlias || 'PRIMARY-ACCOUNT';
    const rawCurrency = currIdx >= 0 ? (cells[currIdx] || '').trim() : 'INR';
    const validatedCurrency = normalizeCurrencyCode(rawCurrency);
    const currency = validatedCurrency || 'INR';

    let amount: number | null = null;
    let direction: 'DEBIT' | 'CREDIT' = 'DEBIT';

    if (isSeparate) {
      const drStr = debitIdx >= 0 ? cells[debitIdx] || '' : '';
      const crStr = creditIdx >= 0 ? cells[creditIdx] || '' : '';
      const drAmt = parseStrictAmount(drStr);
      const crAmt = parseStrictAmount(crStr);

      if (drAmt !== null && drAmt > 0 && crAmt !== null && crAmt > 0) {
        rejectedCount++;
        validationErrors.push({ row: rowNum, reason: 'Ambiguous row: both debit and credit columns contain positive amounts' });
        return;
      } else if (drAmt !== null && drAmt > 0) {
        amount = drAmt;
        direction = 'DEBIT';
      } else if (crAmt !== null && crAmt > 0) {
        amount = crAmt;
        direction = 'CREDIT';
      }
    } else {
      const str = signedIdx >= 0 ? cells[signedIdx] || '' : '';
      const parsedSigned = parseStrictSignedAmount(str);
      if (parsedSigned !== null && parsedSigned.amount > 0) {
        amount = parsedSigned.amount;
        direction = parsedSigned.isNegative ? 'CREDIT' : 'DEBIT';
      }
    }

    if (!rawDesc) {
      rejectedCount++;
      validationErrors.push({ row: rowNum, reason: 'Missing description' });
      return;
    }

    if (!validatedCurrency) {
      rejectedCount++;
      validationErrors.push({ row: rowNum, reason: `Invalid or unsupported ISO 4217 currency code "${rawCurrency}"` });
      return;
    }

    if (amount === null || amount <= 0) {
      rejectedCount++;
      validationErrors.push({ row: rowNum, reason: `Invalid amount` });
      return;
    }

    if (!includeCredits && direction === 'CREDIT') {
      // Excluded
      return;
    }

    const parsedDate = parseCsvDate(rawDate, config.dateFormat);
    if (!parsedDate) {
      rejectedCount++;
      validationErrors.push({ row: rowNum, reason: `Invalid date "${rawDate}"` });
      return;
    }

    const dedupKey = computeCanonicalCsvRowFingerprint({
      accountAlias: acctAlias,
      currency,
      parsedDate,
      direction,
      amount,
      rawDescription: rawDesc,
      externalReference: rawRef,
    });
    if (seenDedupKeys.has(dedupKey)) {
      duplicateCount++;
      return;
    }
    seenDedupKeys.add(dedupKey);

    // Deterministic ID generation based on canonical row fingerprint
    let hash = 0;
    for (let c = 0; c < dedupKey.length; c++) {
      hash = (hash << 5) - hash + dedupKey.charCodeAt(c);
      hash |= 0;
    }
    const cleanHash = Math.abs(hash).toString(36);
    const txnId = `TXN-MAP-${cleanHash}-${rowNum}`;

    validRows.push({
      transaction_id: txnId,
      transaction_date: parsedDate,
      raw_description: rawDesc,
      amount: String(amount),
      currency,
      direction,
      payment_rail: (config.defaultRail as any) || 'UNKNOWN',
      account_alias: acctAlias,
      external_reference: rawRef || '',
    });
  });

  return {
    validRows,
    totalRows: dataRows.length,
    validCount: validRows.length,
    rejectedCount,
    duplicateCount,
    validationErrors,
  };
}

export function computeCanonicalCsvRowFingerprint(params: {
  accountAlias: string;
  currency: string;
  parsedDate: string;
  direction: string;
  amount: number;
  rawDescription: string;
  externalReference?: string | null;
}): string {
  const acct = (params.accountAlias || 'PRIMARY-ACCOUNT').trim().toUpperCase();
  const curr = (params.currency || 'INR').trim().toUpperCase();
  const dt = (params.parsedDate || '').trim();
  const dir = (params.direction || 'DEBIT').trim().toUpperCase();
  const amtMinor = toMinorUnits(Number(params.amount) || 0, curr);
  const desc = (params.rawDescription || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const ref = (params.externalReference || '').trim().toUpperCase();
  return `${acct}|${curr}|${dt}|${dir}|${amtMinor}|${desc}|${ref}`;
}
