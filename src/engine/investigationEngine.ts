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
} from '../types/debitlens';
import { MERCHANT_CATALOGUE, PAYMENT_PROCESSORS } from './referenceData';
import { formatINR, formatMinorINR, toMinorUnits, fromMinorUnits } from '../utils/currency';
import { normaliseDescriptor, detectProcessor, parseStrictAmount } from './debitlensEngine';
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
): (MerchantCandidate & { merchantId?: string; merchantName?: string; category?: string; website?: string })[] {
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

  // 1. Check user confirmed overrides for identical or substring descriptor
  for (const [overrideDesc, mId] of Object.entries(userOverrides)) {
    if (upper.includes(overrideDesc.toUpperCase()) || overrideDesc.toUpperCase().includes(upper)) {
      const merch = MERCHANT_CATALOGUE.find((m) => m.id === mId);
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
          matchReason: `Matches your previously confirmed descriptor mapping "${overrideDesc}" -> ${merch.canonicalName}.`,
          evidenceSource: 'USER_CONFIRMED_OVERRIDE',
          confidenceScore: 92,
          confidenceExplanation: 'Derived from your prior explicit manual assignment in this workspace.',
        });
      }
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
          matchReason: `Known client of payment processor ${detectedProc.name}.`,
          evidenceSource: `PAYMENT_PROCESSOR [${detectedProc.name}]`,
          confidenceScore: 40,
          confidenceExplanation: `Possible intermediary match: ${m.canonicalName} frequently processes via ${detectedProc.name}, but this does not confirm the debit without additional evidence.`,
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
    candidates.length > 0 && candidates[0].confidenceScore >= 80
      ? `Review candidate "${candidateName}". If confirmed, associate to resolve descriptor.`
      : `Check your bank SMS/UPI app details for reference "${transaction.id}". If unfamiliar, inspect mandate list before filing a bank dispute.`;

  return {
    id: existingCase.id || `CASE-DEBIT-${transaction.id}`,
    transactionId: transaction.id,
    originalDescriptor: transaction.rawDescription,
    amount: transaction.amount,
    amountMinor: transaction.amountMinor,
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
      `Search Gmail/SMS for payments of ₹${transaction.amount} around ${transaction.transactionDate}.`,
      'Check banking/UPI app for active e-mandate or UPI AutoPay with matching ceiling amounts.',
      'Under RBI zero-liability guidelines, notify your bank within 3 calendar days if unauthorised.',
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
      supportingEvidenceCount: inv.candidateMerchants.length,
      recommendedAction: inv.recommendedNextAction,
      actionType: 'INVESTIGATE_DEBIT',
      createdAt: inv.createdAt,
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
      category = 'RECONCILIATION_DISCREPANCY' as any;
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
      eventDate: f.evaluatedAt ? f.evaluatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      whyItAppeared: f.explanation || (f as any).discrepancyReason || 'Three-way reconciliation discrepancy detected.',
      supportingEvidenceCount: Array.isArray(f.evidenceRecordIds) ? f.evidenceRecordIds.length : 2,
      recommendedAction: f.recommendedAction || 'Review commitment documents and statement records.',
      actionType,
      createdAt: f.evaluatedAt || new Date().toISOString(),
      updatedAt: f.evaluatedAt || new Date().toISOString(),
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

    if (alt.alertType === 'POST_CANCEL_ALERT') {
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
      eventDate: alt.createdAt,
      whyItAppeared: alt.description,
      supportingEvidenceCount: 2,
      recommendedAction: alt.suggestedAction,
      actionType,
      createdAt: `${alt.createdAt}T00:00:00Z`,
      updatedAt: `${alt.createdAt}T00:00:00Z`,
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
    return Date.parse(b.eventDate) - Date.parse(a.eventDate);
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
  const evidenceCasebookEntries: EvidenceCasebookEntry[] =
    params.evidenceCasebookEntries || params.casebookEntries || [];

  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id && t.direction === 'DEBIT')
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const mandate =
    mandateList.find(
      (m) =>
        m.commitmentId === commitment.id ||
        (commitment.mandateRef && m.mandateReference === commitment.mandateRef)
    ) || (mandateList.length > 0 ? mandateList[0] : null);

  const terms =
    termsList.find((s) => s.commitmentId === commitment.id) ||
    (termsList.length > 0 ? termsList[0] : null);

  const amounts = cmtTxns.map((t) => t.amount);
  const minAmount = amounts.length > 0 ? Math.min(...amounts) : commitment.typicalAmount;
  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : commitment.typicalAmount;

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
  const firstDebitDate = cmtTxns[0]?.transactionDate || commitment.firstSeenDate || null;
  const latestDebitDate = cmtTxns[cmtTxns.length - 1]?.transactionDate || commitment.lastPaymentDate || null;

  const verifiedElementsCount = coverageItems.filter((c) => c.present).length;

  const sectionA_Identity = {
    serviceName: commitment.serviceName,
    merchantName: commitment.merchantName,
    merchantId: commitment.merchantId,
    legalEntityName: commitment.merchantName,
    category: commitment.category,
    supportContact: `support@${commitment.merchantName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    grievanceOfficer: `Grievance Officer (${commitment.merchantName})`,
    website: `https://${commitment.merchantName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    confidenceScore: commitment.confidenceScore,
    confidenceLabel: commitment.confidenceLabel,
    connectedDescriptors: commitment.connectedDescriptors,
    processorName: commitment.processorName,
    accountAlias: cmtTxns[0]?.accountAlias || 'Default Account',
    provenance: commitment.verificationStatus === 'CONFIRMED' ? 'USER_CONFIRMED' : 'CONFIRMED',
    confirmedAt: commitment.verificationStatus === 'CONFIRMED' ? '2026-10-31T00:00:00Z' : null,
  };

  const sectionB_Mandate = {
    mandatePresent: Boolean(mandate),
    rail: mandate?.paymentRail || commitment.paymentRail || 'UNKNOWN',
    mandateReference: mandate?.mandateReference || commitment.mandateRef || null,
    maxAmount: mandate?.maxAmount ?? null,
    mandateStatus: effectiveMandateStatus,
    frequency: mandate?.frequency || commitment.recurrenceType || 'UNKNOWN',
    startDate: mandate?.startDate || null,
    endDate: mandate?.endDate || null,
  };

  const sectionC_Terms = {
    termsPresent: Boolean(terms),
    serviceName: terms?.serviceName || commitment.serviceName,
    expectedAmount: terms?.expectedAmount ?? null,
    billingFrequency: terms?.billingFrequency || commitment.recurrenceType || 'UNKNOWN',
    renewalDate: commitment.nextExpectedDate || null,
    userVerified: Boolean(terms?.userVerified),
    sourceDocument: terms?.documentSource || null,
  };

  const sectionD_History = {
    totalDebitsCount,
    totalSpent,
    firstDebitDate,
    latestDebitDate,
    averageDebitAmount: totalDebitsCount > 0 ? Math.round(totalSpent / totalDebitsCount) : commitment.typicalAmount,
    cadence: commitment.recurrenceType,
  };

  const sectionE_Reconciliation = {
    reconciliationStatus: reconciliationFinding?.status || 'UNRESOLVED',
    outcome: reconciliationFinding?.status || 'UNRESOLVED',
    amountComparison: reconciliationFinding
      ? `Debit ₹${reconciliationFinding.actualTransactionAmount} vs Documented ₹${reconciliationFinding.expectedServiceAmount ?? 'Unavailable'}`
      : 'Awaiting comparison data',
    cadenceComparison: `Observed ${commitment.recurrenceType} cadence vs Mandate ${mandate?.frequency || 'Unregistered'}`,
    lifecycleComparison: areBothStopped ? 'Both Stopped' : 'Active or Inconsistent',
    expectedPrice: reconciliationFinding?.expectedServiceAmount ?? null,
    actualAmount: reconciliationFinding?.actualTransactionAmount ?? commitment.typicalAmount,
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

  const sectionF_Cancellation = {
    serviceLifecycleStatus: commitment.serviceLifecycleStatus,
    mandateLifecycleStatus: commitment.mandateLifecycleStatus,
    bothCancelled: areBothStopped,
    areBothStopped,
    cancellationSummary,
  };

  const sectionG_Evidence = {
    evidenceRecordsCount: evidenceCasebookEntries.length,
    evidenceRecords: evidenceCasebookEntries.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.eventDate,
      verificationStatus: e.verificationStatus,
      sourceReference: e.sourceReference,
    })),
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
    // Backwards compatibility sections
    sectionB_FinancialPattern: {
      observedCadence: commitment.recurrenceType,
      transactionCount: cmtTxns.length,
      firstObservedDate: cmtTxns[0]?.transactionDate || commitment.lastPaymentDate,
      latestTransactionDate: cmtTxns[cmtTxns.length - 1]?.transactionDate || commitment.lastPaymentDate,
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

  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id)
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const mandate =
    mandateList.find(
      (m) =>
        m.commitmentId === commitment.id ||
        (commitment.mandateRef && m.mandateReference === commitment.mandateRef)
    ) || (mandateList.length > 0 ? mandateList[0] : null);

  const terms =
    termsList.find((s) => s.commitmentId === commitment.id) ||
    (termsList.length > 0 ? termsList[0] : null);

  const missingGaps: string[] = [];
  if (!terms) missingGaps.push('Contracted invoice or terms document not attached');
  if (!mandate) missingGaps.push('No bank mandate record found in imported data');
  if (commitment.confidenceScore < 80) missingGaps.push('Merchant identity unconfirmed by user');

  const postCancelTxns = cmtTxns.filter((t) => t.isPostCancellationDebit);

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
      syntheticNotice:
        'Synthetic Demonstration Dataset · Generated for verified evaluation. Zero customer credentials collected.',
    },
    commitmentIdentity: {
      merchantName: commitment.merchantName,
      serviceName: commitment.serviceName,
      commitmentId: commitment.id,
      descriptors: commitment.connectedDescriptors,
      resolutionStatus: commitment.confidenceLabel === 'HIGH' ? 'CONFIRMED' : 'INFERRED',
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
      source: t.sourceType,
    })),
    serviceTerms: {
      documentedPrice: terms?.expectedAmount ?? null,
      billingFrequency: terms?.billingFrequency || 'UNKNOWN',
      currency: terms?.currency || 'INR',
      documentSource: terms?.documentSource || null,
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
      provenance: mandate?.sourceType || 'UNAVAILABLE',
      missingFields: getMissingMandateFields(mandate),
    },
    reconciliation: {
      outcome: reconciliationFinding?.status || 'UNRESOLVED',
      explanation:
        reconciliationFinding?.explanation ||
        'Reconciliation pending attachment of complete statement and mandate records.',
      expectedServicePrice: reconciliationFinding?.expectedServiceAmount ?? null,
      actualDebitAmount: reconciliationFinding?.actualTransactionAmount ?? commitment.typicalAmount,
      mandateCap: reconciliationFinding?.mandateMaxAmount ?? null,
      discrepancyAmount: reconciliationFinding?.discrepancyAmount ?? null,
      discrepancyPercent: reconciliationFinding?.discrepancyPercent ?? null,
      recommendedAction:
        reconciliationFinding?.recommendedAction || 'Inspect account transactions and verified plan tier.',
    },
    cancellationEvidence: {
      serviceLifecycle: commitment.serviceLifecycleStatus,
      mandateLifecycle: commitment.mandateLifecycleStatus,
      requestDates: {
        service: cancellationSession?.serviceCancelledAt || null,
        mandate: cancellationSession?.paymentAuthorisationRevokedAt || null,
      },
      confirmationReferences: cancellationSession?.evidence.map((e) => e.referenceNumber) || [],
      evidenceSources: cancellationSession?.evidence.map((e) => e.evidenceType) || [],
      verificationStatus:
        cancellationSession?.evidence.length ? 'EVIDENCE_ATTACHED' : 'NO_EVIDENCE_ATTACHED',
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
          ? `${postCancelTxns.length} debit(s) occurred after recorded cancellation date.`
          : 'No subsequent statement debits detected after recorded cancellation date.',
    },
    dataLimitations: {
      missingDocuments: !terms,
      missingMandateDetails: !mandate || getEffectiveMandateStatus(mandate) === 'INCOMPLETE',
      unconfirmedMerchant: commitment.confidenceScore < 80,
      unverifiedCancellation: !cancellationSession || cancellationSession.evidence.length === 0,
      evidenceGaps: missingGaps,
    },
    provenanceNotice:
      'DebitLens presents available records and rule-based findings. This report does not independently verify statements, merchant confirmations or bank records unless explicitly identified. Synthetic demonstration data is labelled where applicable.',
  };
}

export function generatePrintableEvidencePackHtml(pack: EvidencePackData): string {
  const formatAmount = (amt: number | null) => (amt !== null ? formatINR(amt) : 'Unavailable');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${pack.header.reportTitle} — ${pack.commitmentIdentity.serviceName}</title>
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
      <div style="font-size: 0.9rem; color: #64748b;">${pack.header.subtitle} · Report ID: <code>${pack.header.reportId}</code></div>
      <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">Generated: ${pack.header.generatedAt}</div>
    </div>
    <div style="text-align: right;">
      <span class="badge badge-warn">${pack.header.syntheticNotice.split('·')[0].trim()}</span>
    </div>
  </div>

  <h2>Section A: Commitment Identity & Merchant Profile</h2>
  <table>
    <tr><th style="width: 30%;">Service Name</th><td><strong>${pack.commitmentIdentity.serviceName}</strong></td></tr>
    <tr><th>Merchant Name</th><td>${pack.commitmentIdentity.merchantName} (${pack.commitmentIdentity.commitmentId})</td></tr>
    <tr><th>Connected Descriptors</th><td><code>${pack.commitmentIdentity.descriptors.join(', ')}</code></td></tr>
    <tr><th>Resolution Status</th><td>${pack.commitmentIdentity.resolutionStatus} (${pack.commitmentIdentity.provenance})</td></tr>
  </table>

  <h2>Section B: Payment Mandate Authorisation</h2>
  <table>
    <tr><th style="width: 30%;">Mandate Reference</th><td><code>${pack.paymentMandate.mandateReference || 'Unavailable'}</code></td></tr>
    <tr><th>Payment Rail</th><td>${pack.paymentMandate.paymentRail.replace(/_/g, ' ')}</td></tr>
    <tr><th>Maximum Limit</th><td>${formatAmount(pack.paymentMandate.maxAuthorisedAmount)}</td></tr>
    <tr><th>Effective Mandate Status</th><td><span class="badge">${pack.paymentMandate.effectiveStatus}</span></td></tr>
    <tr><th>Start / Expiry Date</th><td>${pack.paymentMandate.startDate || '—'} / ${pack.paymentMandate.expiryDate || 'No Expiry'}</td></tr>
  </table>

  <h2>Section C: Commercial Terms & Pricing</h2>
  <table>
    <tr><th style="width: 30%;">Documented Price</th><td>${formatAmount(pack.serviceTerms.documentedPrice)}</td></tr>
    <tr><th>Billing Frequency</th><td>${pack.serviceTerms.billingFrequency}</td></tr>
    <tr><th>Verification Status</th><td>${pack.serviceTerms.verificationStatus}</td></tr>
  </table>

  <h2>Section D: Transaction History & Cadence</h2>
  <table>
    <tr><th style="width: 30%;">Total Transactions</th><td>${pack.transactions.length} debits recorded</td></tr>
    <tr><th>Post-Cancellation Activity</th><td><strong>${pack.postCancellationActivity.monitoringStatement}</strong></td></tr>
  </table>

  <h2>Section E: Three-Way Reconciliation Analysis</h2>
  <table>
    <tr><th style="width: 30%;">Reconciliation Outcome</th><td><span class="badge">${pack.reconciliation.outcome}</span></td></tr>
    <tr><th>Documented Price</th><td>${formatAmount(pack.reconciliation.expectedServicePrice)}</td></tr>
    <tr><th>Actual Statement Debit</th><td><strong>${formatAmount(pack.reconciliation.actualDebitAmount)}</strong></td></tr>
    <tr><th>Mandate Limit Ceiling</th><td>${formatAmount(pack.reconciliation.mandateCap)}</td></tr>
    <tr><th>Amount Discrepancy</th><td>${pack.reconciliation.discrepancyAmount !== null ? formatINR(pack.reconciliation.discrepancyAmount) : 'None'} (${pack.reconciliation.discrepancyPercent ?? 0}%)</td></tr>
    <tr><th>Detailed Finding</th><td>${pack.reconciliation.explanation}</td></tr>
    <tr><th>Recommended Action</th><td>${pack.reconciliation.recommendedAction}</td></tr>
  </table>

  <h2>Section F: Two-Layer Cancellation & Post-Cancellation Monitoring</h2>
  <table>
    <tr><th style="width: 30%;">Service Lifecycle (Layer A)</th><td>${pack.cancellationEvidence.serviceLifecycle}</td></tr>
    <tr><th>Mandate Lifecycle (Layer B)</th><td>${pack.cancellationEvidence.mandateLifecycle}</td></tr>
    <tr><th>Cancellation References</th><td>${pack.cancellationEvidence.confirmationReferences.length ? pack.cancellationEvidence.confirmationReferences.join(', ') : 'None attached'}</td></tr>
    <tr><th>Subsequent Statement Debits</th><td><strong>${pack.postCancellationActivity.monitoringStatement}</strong></td></tr>
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
          <td>${t.date}</td>
          <td><code>${t.description}</code></td>
          <td>${t.direction}</td>
          <td>${formatINR(t.amount)}</td>
          <td><small>${t.id}</small></td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>Provenance & Accuracy Notice:</strong><br>
    ${pack.provenanceNotice}
  </div>
</body>
</html>`;
}

// ============================================================================
// 5. SMART BANK STATEMENT CSV MAPPING WIZARD
// ============================================================================
export function previewCsvMapping(
  csvText: string,
  userConfig?: Partial<CsvMappingConfig>
): CsvMappingPreviewResult {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
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

  // Parse header line respecting quotes
  const parseHeaderLine = (line: string): string[] => {
    const res: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) {
        res.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    res.push(cur.trim());
    return res;
  };

  const headers = parseHeaderLine(lines[0]);
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

  const previewRows: CsvMappingPreviewRow[] = [];
  const validationErrors: { row: number; reason: string }[] = [];
  let validRowCount = 0;
  let rejectedRowCount = 0;
  let duplicateRowCount = 0;
  const seenKeys = new Set<string>();

  const dataLines = lines.slice(1);

  dataLines.forEach((line, idx) => {
    const rowNum = idx + 1; // 1-indexed data row
    const cells = parseHeaderLine(line);
    const rawDate = dateIdx >= 0 ? cells[dateIdx] || '' : '';
    const rawDesc = descIdx >= 0 ? cells[descIdx] || '' : '';
    const rawRef = refIdx >= 0 ? cells[refIdx] || '' : '';

    let interpretedAmount: number | null = null;
    let direction: 'DEBIT' | 'CREDIT' = 'DEBIT';
    let rawAmountStr = '';
    let isCreditRow = false;

    if (isSeparate) {
      const drStr = debitIdx >= 0 ? cells[debitIdx] || '' : '';
      const crStr = creditIdx >= 0 ? cells[creditIdx] || '' : '';
      const drAmt = parseStrictAmount(drStr);
      const crAmt = parseStrictAmount(crStr);

      if (drAmt !== null && drAmt > 0) {
        interpretedAmount = drAmt;
        direction = 'DEBIT';
        rawAmountStr = drStr;
      } else if (crAmt !== null && crAmt > 0) {
        interpretedAmount = crAmt;
        direction = 'CREDIT';
        rawAmountStr = crStr;
        isCreditRow = true;
      } else {
        rawAmountStr = drStr || crStr || '0';
        interpretedAmount = null;
      }
    } else {
      const str = signedIdx >= 0 ? cells[signedIdx] || '' : '';
      rawAmountStr = str;
      const num = parseStrictAmount(str);
      if (num !== null) {
        if (num < 0) {
          interpretedAmount = Math.abs(num);
          direction = 'CREDIT';
          isCreditRow = true;
        } else {
          interpretedAmount = num;
          direction = 'DEBIT';
        }
      }
    }

    // Parse date with chosen format
    let parsedDate: string | null = null;
    if (rawDate) {
      if (config.dateFormat === 'DD/MM/YYYY') {
        const parts = rawDate.split(/[-/.]/);
        if (parts.length === 3) {
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          parsedDate = `${y}-${m}-${d}`;
        }
      } else if (config.dateFormat === 'MM/DD/YYYY') {
        const parts = rawDate.split(/[-/.]/);
        if (parts.length === 3) {
          const m = parts[0].padStart(2, '0');
          const d = parts[1].padStart(2, '0');
          const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          parsedDate = `${y}-${m}-${d}`;
        }
      } else {
        const ms = Date.parse(rawDate);
        if (!isNaN(ms)) {
          parsedDate = new Date(ms).toISOString().slice(0, 10);
        }
      }
    }

    let isValid = true;
    let rejectReason: string | undefined;

    if (isCreditRow) {
      isValid = false;
      rejectReason = 'Credit/Deposit row (filtered out)';
    } else if (!rawDesc) {
      isValid = false;
      rejectReason = 'Missing description';
    } else if (interpretedAmount === null || interpretedAmount <= 0) {
      isValid = false;
      rejectReason = `Invalid amount "${rawAmountStr}"`;
    } else if (!parsedDate || isNaN(Date.parse(parsedDate))) {
      isValid = false;
      rejectReason = `Invalid date "${rawDate}" under format ${config.dateFormat}`;
    }

    const dedupKey = `${parsedDate}_${rawDesc}_${interpretedAmount}`;
    if (isValid) {
      if (seenKeys.has(dedupKey)) {
        duplicateRowCount++;
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
          currency: 'INR',
          direction: 'DEBIT',
          account_alias: config.defaultAccountAlias,
          payment_rail: config.defaultRail,
          external_reference: rawRef || undefined,
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
    totalRows: dataLines.length,
    totalRowsFound: dataLines.length,
    validRowCount,
    validRowsCount: validRowCount,
    rejectedRowCount,
    duplicateRowCount,
    unmappedHeaders,
    validationErrors,
  };
}
