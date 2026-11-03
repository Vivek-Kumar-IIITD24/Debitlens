import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normaliseDescriptor,
  resolveTransactionDescriptor,
  parseCsvTextRFC4180,
  parseAndNormaliseTransactions,
  detectCommitmentsAndAlerts,
  buildCommitmentGraphResponse,
  redactTransactionForSarvam,
  buildGroundedMerchantExplanation,
  buildGroundedAlertExplanation,
  buildGroundedCancellationExplanation,
  evaluateDetectionMetricsAgainstGroundTruth,
  buildInitialSeedMandates,
  buildInitialSeedServiceTerms,
  extractServiceTermsFromText,
  reconcileCommitment,
  runFullReconciliation,
  buildCommitmentEvidenceCasebook,
  buildDataCoverageSummary,
  deriveIndependentLifecycleStatuses,
  buildGroundedContextualQuestionResponse,
  RawCsvRow,
  NotificationInput,
  parseStrictAmount,
  parseStrictSignedAmount,
  getEffectiveMandateStatus,
  getMissingMandateFields,
  generateMerchantCandidates,
  buildUnrecognizedDebitCase,
  buildReviewQueue,
  generateCommitmentPassport,
  generateEvidencePackData,
  generatePrintableEvidencePackHtml,
  previewCsvMapping,
  escapeHtml,
  parseCsvDate,
  parseAllMappedCsvRows,
  computeCanonicalCsvRowFingerprint,
  buildPlaybookAndSessionForCommitment,
} from './debitlensEngine';
import { buildInitialSeedGuardrails } from './reconciliationEngine';
import { formatExactCurrency } from '../utils/currency';
import {
  toMinorUnits,
  fromMinorUnits,
  toMinorUnitsStrict,
  toMinorUnitsStrictResult,
  fromMinorUnitsStrict,
  fromMinorUnitsStrictResult,
  getCurrencyDecimalsOrNull,
  formatMinorINR,
  formatCurrency,
  formatMinorCurrency,
  getCurrencyDecimals,
  isValidCurrencyCode,
  normalizeCurrencyCode,
  resolveTransactionCurrency,
  UNKNOWN_CURRENCY,
  convertMajorToMinorExact,
} from '../utils/currency';
import os from 'node:os';
import http from 'node:http';
import {
  normalizeDateString,
  isValidCalendarDate,
  isStrictValidIsoDate,
  getRuntimeDateISO,
  getDynamicMonthWindow,
  formatDateTimeIN,
} from '../utils/dateUtils';
import { isPlaceholderEnvValue } from '../services/neo4jPersistenceService';
import { MERCHANT_CATALOGUE } from './referenceData';

const SAMPLE_ROWS: RawCsvRow[] = [
  {
    transaction_id: 'TXN-1001',
    transaction_date: '2026-06-05',
    raw_description: 'RZP*STREAMBOX',
    amount: 499,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'UPI-415600112201',
  },
  {
    transaction_id: 'TXN-1002',
    transaction_date: '2026-07-05',
    raw_description: 'STREAMBOX*BILL',
    amount: 499,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'UPI-418700112202',
  },
  {
    transaction_id: 'TXN-1003',
    transaction_date: '2026-08-05',
    raw_description: 'RAZORPAY*STREAMBOX',
    amount: 499,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'UPI-421800112203',
  },
  {
    transaction_id: 'TXN-2001',
    transaction_date: '2026-08-12',
    raw_description: 'SI-MUSICFLOW-IN',
    amount: 199,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'CARD_EMANDATE',
    account_alias: 'ICICI-CC-9012',
    external_reference: 'SI-MF-01',
  },
  {
    transaction_id: 'TXN-2002',
    transaction_date: '2026-09-12',
    raw_description: 'BILLDESK*MUSICFLOW',
    amount: 199,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'CARD_EMANDATE',
    account_alias: 'ICICI-CC-9012',
    external_reference: 'SI-MF-02',
  },
  {
    transaction_id: 'TXN-2003',
    transaction_date: '2026-10-12',
    raw_description: 'SI-MUSICFLOW-IN',
    amount: 249,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'CARD_EMANDATE',
    account_alias: 'ICICI-CC-9012',
    external_reference: 'SI-MF-03',
  },
  {
    transaction_id: 'TXN-7001',
    transaction_date: '2026-03-08',
    raw_description: 'RZP*READCLOUD',
    amount: 299,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'RC-01',
  },
  {
    transaction_id: 'TXN-7002',
    transaction_date: '2026-04-08',
    raw_description: 'RZP*READCLOUD',
    amount: 299,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'RC-02',
  },
  {
    transaction_id: 'TXN-7003',
    transaction_date: '2026-05-08',
    raw_description: 'READCLOUD*SUB',
    amount: 299,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'RC-03',
  },
  {
    transaction_id: 'TXN-7004',
    transaction_date: '2026-08-09',
    raw_description: 'RZP*READCLOUD',
    amount: 299,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'RC-04',
  },
  {
    transaction_id: 'TXN-8001',
    transaction_date: '2026-10-22',
    raw_description: 'RAZORPAY*LEARNPRO-AI',
    amount: 999,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'LP-TRIAL-01',
  },
  {
    transaction_id: 'TXN-9001',
    transaction_date: '2026-09-02',
    raw_description: 'NACH-BAJAJFIN-EMI44',
    amount: 8450,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'ENACH_NACH',
    account_alias: 'SBI-XX1109',
    external_reference: 'EMI-01',
  },
  {
    transaction_id: 'TXN-9002',
    transaction_date: '2026-10-02',
    raw_description: 'NACH-BAJAJFIN-EMI44',
    amount: 8450,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'ENACH_NACH',
    account_alias: 'SBI-XX1109',
    external_reference: 'EMI-02',
  },
  {
    transaction_id: 'TXN-9101',
    transaction_date: '2026-07-25',
    raw_description: 'SI-DESIGNVAULT-PRO',
    amount: 649,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'CARD_EMANDATE',
    account_alias: 'ICICI-CC-9012',
    external_reference: 'DV-01',
  },
  {
    transaction_id: 'TXN-9102',
    transaction_date: '2026-08-25',
    raw_description: 'SI-DESIGNVAULT-PRO',
    amount: 649,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'CARD_EMANDATE',
    account_alias: 'ICICI-CC-9012',
    external_reference: 'DV-02',
  },
  {
    transaction_id: 'TXN-9104',
    transaction_date: '2026-10-26',
    raw_description: 'SI-DESIGNVAULT-PRO',
    amount: 649,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'CARD_EMANDATE',
    account_alias: 'ICICI-CC-9012',
    external_reference: 'DV-POSTCANCEL',
  },
  {
    transaction_id: 'TXN-9501',
    transaction_date: '2026-09-14',
    raw_description: 'UPI/DR/42571190/RAZORPAY',
    amount: 599,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'UPI-UNRES-01',
  },
  {
    transaction_id: 'TXN-9803',
    transaction_date: '2026-10-16',
    raw_description: 'REV-RZP*STREAMBOX-REFUND',
    amount: 499,
    currency: 'INR',
    direction: 'CREDIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'UPI-REF-01',
  },
];

const SAMPLE_NOTIFICATIONS: NotificationInput[] = [
  {
    id: 'NOTIF-01',
    eventType: 'TRIAL_STARTED',
    merchantHint: 'LearnPro AI',
    eventDate: '2026-10-08',
    trialStartDate: '2026-10-08',
    trialEndDate: '2026-10-22',
    expectedAmount: 999,
    currency: 'INR',
    relatedCommitmentId: 'CMT-LEARNPRO',
    sourceType: 'EMAIL_NOTIFICATION',
    description: '14-day free trial converting to INR 999/month',
  },
];

// ============================================================================
// ORIGINAL 4 CORE TESTS (PRESERVED)
// ============================================================================
test('Neo4j Test 1 & 6: Different aliases resolve to StreamBox while processor-only RAZORPAY stays UNRESOLVED', () => {
  assert.equal(normaliseDescriptor('RZP*STREAMBOX'), 'RZP STREAMBOX');

  const r1 = resolveTransactionDescriptor('RZP*STREAMBOX');
  const r2 = resolveTransactionDescriptor('STREAMBOX*BILL');
  const r3 = resolveTransactionDescriptor('RAZORPAY*STREAMBOX');

  assert.equal(r1.merchantId, 'MERCH-STREAMBOX');
  assert.equal(r2.merchantId, 'MERCH-STREAMBOX');
  assert.equal(r3.merchantId, 'MERCH-STREAMBOX');
  assert.equal(r1.processorId, 'PROC-RAZORPAY');
  assert.equal(r1.resolutionStatus, 'CONFIRMED');

  const unres = resolveTransactionDescriptor('UPI/DR/42571190/RAZORPAY');
  assert.equal(unres.merchantId, null);
  assert.equal(unres.processorId, 'PROC-RAZORPAY');
  assert.equal(unres.resolutionStatus, 'UNRESOLVED');
  assert.equal(unres.matchingMethod, 'PROCESSOR_ONLY_UNRESOLVED');
});

test('Neo4j Test 2, 3, 4, 5: Temporal recurrence, price increase, resumed pattern, trial conversion, and post-cancellation detection', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, alerts } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);

  const streambox = commitments.find((c) => c.id === 'CMT-STREAMBOX');
  assert.ok(streambox, 'StreamBox commitment should be detected');
  assert.equal(streambox.supportingTransactionIds.length, 3, 'Credit refund TXN-9803 must be excluded');
  assert.equal(streambox.connectedDescriptors.length, 3, 'All 3 aliases connected');

  const musicflow = commitments.find((c) => c.id === 'CMT-MUSICFLOW');
  assert.ok(musicflow);
  assert.equal(musicflow.priceChangeDetected, true);
  assert.equal(musicflow.priceChangeAmount, 50);
  assert.equal(musicflow.priceChangePercent, 25.13);

  const readcloud = commitments.find((c) => c.id === 'CMT-READCLOUD');
  assert.ok(readcloud);
  assert.equal(readcloud.resumedAfterGap, true);
  assert.equal(readcloud.recurrenceType, 'RESUMED');

  const learnpro = commitments.find((c) => c.id === 'CMT-LEARNPRO');
  assert.ok(learnpro);
  assert.equal(learnpro.trialConverted, true);

  const designvault = commitments.find((c) => c.id === 'CMT-DESIGNVAULT');
  assert.ok(designvault);
  assert.equal(designvault.status, 'POST_CANCEL_ALERT');
  assert.ok(alerts.some((a) => a.alertType === 'POST_CANCELLATION_DEBIT' && a.commitmentId === 'CMT-DESIGNVAULT'));
});

test('Neo4j Commitment Graph builder constructs full path and executes Cypher Operations 1-7', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, alerts, playbooks, sessions } = detectCommitmentsAndAlerts(
    transactions,
    SAMPLE_NOTIFICATIONS
  );

  const graph = buildCommitmentGraphResponse({
    focusCommitmentId: 'CMT-STREAMBOX',
    transactions,
    commitments,
    alerts,
    playbooks,
    sessions,
    notifications: SAMPLE_NOTIFICATIONS,
    executionMode: 'LOCAL_PREVIEW',
  });

  assert.equal(graph.executionMode, 'LOCAL_PREVIEW');
  assert.ok(graph.nodes.some((n) => n.label === 'Merchant' && n.title === 'StreamBox'));
  assert.ok(graph.nodes.some((n) => n.label === 'CancellationPlaybook'));
  assert.ok(graph.edges.some((e) => e.type === 'DESCRIPTOR_RESOLVES_TO_MERCHANT'));
  assert.ok(graph.edges.some((e) => e.type === 'IMPORT_BATCH_CONTAINS_TRANSACTION'));
  assert.ok(graph.edges.some((e) => e.type === 'SERVICE_HAS_CANCELLATION_PLAYBOOK'));
  assert.equal(graph.executedCypherQueries.length, 5);
});

test('Sarvam Tests 1-8: Grounded English & Hindi explanations, unknown merchant uncertainty, privacy masking, and two-layer playbook safety', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { playbooks } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);

  const knownTxn = transactions.find((t) => t.id === 'TXN-1003')!;
  const redacted = redactTransactionForSarvam(knownTxn);
  assert.ok(redacted.maskedFields.length >= 2, 'Account alias and external reference are redacted');

  const hiExp = buildGroundedMerchantExplanation(knownTxn, 'hi-IN');
  assert.ok(hiExp.localizedExplanation.fullSummary.includes('StreamBox Premium 4K'));
  assert.ok(hiExp.localizedExplanation.fullSummary.includes('Razorpay'));

  const unknownTxn = transactions.find((t) => t.id === 'TXN-9501')!;
  const unknownHi = buildGroundedMerchantExplanation(unknownTxn, 'hi-IN');
  assert.equal(unknownHi.resolvedMerchant, null);
  assert.ok(unknownHi.localizedExplanation.whatRemainsUncertain.includes('पुष्टि नहीं हुई है'));

  const loanPlaybook = playbooks.find((p) => p.commitmentId === 'CMT-BAJAJEMI')!;
  const loanCancelHi = buildGroundedCancellationExplanation(loanPlaybook, 'hi-IN');
  assert.equal(loanCancelHi.preservedInvariants.actionOrderPreserved, true);
  assert.equal(loanCancelHi.preservedInvariants.layerDistinctionMaintained, true);
  assert.equal(loanCancelHi.preservedInvariants.safetyWarningsPreserved, true);
  assert.equal(loanCancelHi.preservedInvariants.allStepsTranslated, true);
  assert.ok(loanCancelHi.localizedPlaybook.contractualWarning?.includes('EMI'));
});

// ============================================================================
// 15 MANDATORY ADVERSARIAL TEST CASES (PART 7.2)
// ============================================================================

test('Adversarial Case 1: Similar merchant names do not falsely collide with StreamBox', () => {
  const res = resolveTransactionDescriptor('RZP*STREAMPLUS-MEDIA');
  assert.equal(res.merchantId, null, 'Unknown similar merchant name STREAMPLUS must not resolve to StreamBox');
  assert.equal(res.processorId, 'PROC-RAZORPAY');
  assert.equal(res.resolutionStatus, 'UNRESOLVED');
});

test('Adversarial Case 2: Two different merchants using the same payment processor (Razorpay) remain separate commitments', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV2-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-1',
    },
    {
      transaction_id: 'ADV2-2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-2',
    },
    {
      transaction_id: 'ADV2-3',
      transaction_date: '2026-08-10',
      raw_description: 'RZP*READCLOUD',
      amount: 299,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-3',
    },
    {
      transaction_id: 'ADV2-4',
      transaction_date: '2026-09-10',
      raw_description: 'RZP*READCLOUD',
      amount: 299,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-4',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments.length, 2);
  assert.ok(commitments.some((c) => c.merchantId === 'MERCH-STREAMBOX'));
  assert.ok(commitments.some((c) => c.merchantId === 'MERCH-READCLOUD'));
});

test('Adversarial Case 3: Unknown processor-only descriptor stays isolated and never creates a commitment', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV3-1',
      transaction_date: '2026-08-14',
      raw_description: 'UPI/DR/42571190/RAZORPAY',
      amount: 599,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UNRES-1',
    },
    {
      transaction_id: 'ADV3-2',
      transaction_date: '2026-09-14',
      raw_description: 'UPI/DR/42571190/RAZORPAY',
      amount: 599,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UNRES-2',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments, alerts } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments.length, 0, 'Processor-only transactions must never merge into a commitment');
  assert.equal(alerts.filter((a) => a.alertType === 'UNIDENTIFIED_MERCHANT').length, 2);
});

test('Adversarial Case 4: Repeated one-time retail purchases without merchant subscription match do not become recurring commitments', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV4-1',
      transaction_date: '2026-10-02',
      raw_description: 'POS-GROCERY-MART-BLR',
      amount: 420,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_ONE_TIME',
      account_alias: 'HDFC-XX4821',
      external_reference: 'POS-1',
    },
    {
      transaction_id: 'ADV4-2',
      transaction_date: '2026-10-09',
      raw_description: 'POS-GROCERY-MART-BLR',
      amount: 615,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_ONE_TIME',
      account_alias: 'HDFC-XX4821',
      external_reference: 'POS-2',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments.length, 0);
});

test('Adversarial Case 5: Refunds (CREDIT direction) are excluded from recurring debit totals', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV5-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'R1',
    },
    {
      transaction_id: 'ADV5-2',
      transaction_date: '2026-08-07',
      raw_description: 'RZP*STREAMBOX REFUND',
      amount: 499,
      currency: 'INR',
      direction: 'CREDIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'R2',
    },
    {
      transaction_id: 'ADV5-3',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'R3',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments[0].supportingTransactionIds.length, 2);
});

test('Adversarial Case 6: Reversed transactions (CREDIT reversal) do not count as recurring debit occurrences', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV6-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REV1',
    },
    {
      transaction_id: 'ADV6-2',
      transaction_date: '2026-08-05',
      raw_description: 'REV-RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'CREDIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REV2',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments.length, 0, 'Single debit + credit reversal must not form a recurring commitment');
});

test('Adversarial Case 7: Variable-amount utility commitment (BESCOM) is detected as variableAmount without false price increase alert', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV7-1',
      transaction_date: '2026-07-18',
      raw_description: 'BBPS*BESCOM-UTIL',
      amount: 1420,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'B1',
    },
    {
      transaction_id: 'ADV7-2',
      transaction_date: '2026-08-18',
      raw_description: 'BBPS*BESCOM-UTIL',
      amount: 1680,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'B2',
    },
    {
      transaction_id: 'ADV7-3',
      transaction_date: '2026-09-18',
      raw_description: 'BBPS*BESCOM-UTIL',
      amount: 1510,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'B3',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments, alerts } = detectCommitmentsAndAlerts(transactions, []);
  const bescom = commitments.find((c) => c.id === 'CMT-BESCOM')!;
  assert.ok(bescom);
  assert.equal(bescom.variableAmount, true);
  assert.equal(bescom.priceChangeDetected, false);
  assert.equal(alerts.filter((a) => a.alertType === 'PRICE_INCREASE').length, 0);
});

test('Adversarial Case 8: Month-end Jan 31 -> Feb 28 -> Mar 31 payment dates are recognised as MONTHLY', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV8-1',
      transaction_date: '2026-01-31',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'M1',
    },
    {
      transaction_id: 'ADV8-2',
      transaction_date: '2026-02-28',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'M2',
    },
    {
      transaction_id: 'ADV8-3',
      transaction_date: '2026-03-31',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'M3',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments[0].recurrenceType, 'MONTHLY');
});

test('Adversarial Case 9: Annual renewal with only 2 occurrences (~365 days apart) is detected as YEARLY', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV9-1',
      transaction_date: '2025-10-15',
      raw_description: 'GOOGLE*CLOUDNOTES',
      amount: 2499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'GOOGLE_PLAY',
      account_alias: 'ICICI-CC-9012',
      external_reference: 'GP-1',
    },
    {
      transaction_id: 'ADV9-2',
      transaction_date: '2026-10-15',
      raw_description: 'GOOGLE*CLOUDNOTES',
      amount: 2499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'GOOGLE_PLAY',
      account_alias: 'ICICI-CC-9012',
      external_reference: 'GP-2',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments[0].recurrenceType, 'YEARLY');
  assert.equal(commitments[0].annualisedAmount, 2499);
});

test('Adversarial Case 10: Price increase calculates exact delta and annualised impact', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV10-1',
      transaction_date: '2026-08-12',
      raw_description: 'SI-MUSICFLOW-IN',
      amount: 119,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'ICICI-CC-9012',
      external_reference: 'P1',
    },
    {
      transaction_id: 'ADV10-2',
      transaction_date: '2026-09-12',
      raw_description: 'SI-MUSICFLOW-IN',
      amount: 119,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'ICICI-CC-9012',
      external_reference: 'P2',
    },
    {
      transaction_id: 'ADV10-3',
      transaction_date: '2026-10-12',
      raw_description: 'SI-MUSICFLOW-IN',
      amount: 149,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'ICICI-CC-9012',
      external_reference: 'P3',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments[0].priceChangeDetected, true);
  assert.equal(commitments[0].priceChangeAmount, 30);
  assert.equal(commitments[0].annualPriceIncreaseImpact, 360);
});

test('Adversarial Case 11: Post-cancellation debit triggers POST_CANCEL_ALERT and links to cancellation session', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, sessions } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);
  const dv = commitments.find((c) => c.id === 'CMT-DESIGNVAULT')!;
  const sess = sessions.find((s) => s.commitmentId === 'CMT-DESIGNVAULT')!;
  assert.equal(dv.status, 'POST_CANCEL_ALERT');
  assert.ok(sess.postCancellationTransactionIds.includes('TXN-9104'));
});

test('Adversarial Case 12: Two payment accounts for the same merchant unify into one merchant commitment history', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'ADV12-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'A1',
    },
    {
      transaction_id: 'ADV12-2',
      transaction_date: '2026-09-05',
      raw_description: 'STREAMBOX*BILL',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'ICICI-CC-9012',
      external_reference: 'A2',
    },
  ];
  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions, []);
  assert.equal(commitments.length, 1);
  assert.equal(commitments[0].supportingTransactionIds.length, 2);
});

test('Adversarial Case 13: Duplicate imported transaction IDs are rejected deterministically', () => {
  const dupRows: RawCsvRow[] = [SAMPLE_ROWS[0], SAMPLE_ROWS[0]];
  const { transactions, duplicateRows } = parseAndNormaliseTransactions(dupRows);
  assert.equal(transactions.length, 1);
  assert.equal(duplicateRows.length, 1);
});

test('Adversarial Case 14: Incomplete notification record is handled gracefully without crash', () => {
  const incompleteNotifs = [
    {
      id: 'NOTIF-INCOMPLETE',
      eventType: 'TRIAL_STARTED',
      merchantHint: 'LearnPro AI',
      eventDate: '2026-10-08',
      expectedAmount: 999,
      currency: 'INR',
    },
  ] as unknown as NotificationInput[];
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments } = detectCommitmentsAndAlerts(transactions, incompleteNotifs);
  const learnpro = commitments.find((c) => c.id === 'CMT-LEARNPRO');
  assert.ok(learnpro, 'LearnPro commitment still detected with incomplete trial notification');
});

test('Adversarial Case 15: Generic UPI/DR/ or SI- descriptor without processor or merchant token is NOT misclassified as Razorpay or BillDesk', () => {
  const upiGeneric = resolveTransactionDescriptor('UPI/DR/9911223344/PAYMENT-TO-VENDOR');
  assert.equal(upiGeneric.processorId, null, 'Generic UPI/DR/ must not be mapped to Razorpay');
  assert.equal(upiGeneric.processorName, null);
  assert.equal(upiGeneric.merchantId, null);
  assert.equal(upiGeneric.matchingMethod, 'GENERIC_MECHANISM_ONLY');

  const siGeneric = resolveTransactionDescriptor('SI-9988776655-AUTODEBIT');
  assert.equal(siGeneric.processorId, null, 'Generic SI- must not be mapped to BillDesk');
  assert.equal(siGeneric.processorName, null);
  assert.equal(siGeneric.merchantId, null);
  assert.equal(siGeneric.matchingMethod, 'GENERIC_MECHANISM_ONLY');
});

// ============================================================================
// ADDITIONAL QUALITY TESTS: RFC-4180 CSV PARSER, GROUND TRUTH & CANCELLATION AUDIT
// ============================================================================
test('RFC-4180 CSV Parser supports quoted commas and escaped double quotes', () => {
  const csvWithQuotes = [
    'transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference',
    'TXN-Q1,2026-10-28,"RZP*STREAMBOX, MUMBAI, IN",499,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,REF-Q1',
    'TXN-Q2,2026-10-29,"SI-CLOUDVAULT ""PRO"" PLAN",219,INR,DEBIT,CARD_EMANDATE,ICICI-CC-9012,REF-Q2',
  ].join('\n');

  const parsed = parseCsvTextRFC4180(csvWithQuotes);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].raw_description, 'RZP*STREAMBOX, MUMBAI, IN');
  assert.equal(parsed[1].raw_description, 'SI-CLOUDVAULT "PRO" PLAN');
});

test('Cancellation URLs and Playbooks contain zero fake .example.com/.example.in domains and zero universal 48-hour rules', () => {
  for (const m of MERCHANT_CATALOGUE) {
    if (m.officialCancellationUrl) {
      assert.ok(
        !m.officialCancellationUrl.includes('example.com') &&
          !m.officialCancellationUrl.includes('example.in'),
        `Merchant ${m.id} must not use fake example domain`
      );
    }
  }

  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { playbooks } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);
  for (const pb of playbooks) {
    const jsonStr = JSON.stringify(pb);
    assert.ok(!jsonStr.includes('example.com') && !jsonStr.includes('example.in'));
    assert.ok(!jsonStr.includes('48 hours'), 'Playbook must not state universal 48-hour rule');
  }
});

test('Dynamic Ground-Truth Evaluation computes genuine metrics against data/ground-truth.json', () => {
  const csvPath = path.resolve(process.cwd(), 'data/synthetic-transactions.csv');
  const notifPath = path.resolve(process.cwd(), 'data/synthetic-notifications.json');
  const gtPath = path.resolve(process.cwd(), 'data/ground-truth.json');

  const parsedCsv = parseCsvTextRFC4180(fs.readFileSync(csvPath, 'utf-8'));
  const notifs = JSON.parse(fs.readFileSync(notifPath, 'utf-8'));
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf-8'));

  const { transactions } = parseAndNormaliseTransactions(parsedCsv);
  const { commitments } = detectCommitmentsAndAlerts(transactions, notifs);
  const metrics = evaluateDetectionMetricsAgainstGroundTruth(gt, transactions, commitments);

  assert.equal(metrics.truePositives, 10);
  assert.equal(metrics.falsePositives, 0);
  assert.equal(metrics.falseNegatives, 0);
  assert.equal(metrics.falseMergesCount, 0);
  assert.equal(metrics.precisionPercent, 100);
  assert.equal(metrics.recallPercent, 100);
});

// ----------------------------------------------------------------------------
// 11. MINOR UNITS, PLACEHOLDER ENV VALIDATION & CANDIDATE VS COMMITMENT
// ----------------------------------------------------------------------------

test('Minor Units conversion (paise) is exact and free of floating-point drift', () => {
  assert.equal(toMinorUnits(499, 'INR'), 49900);
  assert.equal(toMinorUnits(799.5, 'INR'), 79950);
  assert.equal(fromMinorUnits(49900, 'INR'), 499);
  assert.equal(formatMinorINR(49900, 'INR'), '₹499');

  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);
  for (const tx of transactions) {
    assert.equal(tx.amountMinor, Math.round(tx.amount * 100));
  }
  for (const cm of commitments) {
    assert.equal(cm.expectedAmountMinor, Math.round(cm.typicalAmount * 100));
    assert.equal(cm.latestAmountMinor, Math.round(cm.latestAmount * 100));
    assert.ok(
      cm.entityClass === 'FINANCIAL_COMMITMENT' || cm.entityClass === 'RECURRING_CANDIDATE',
      'Commitment must declare entityClass'
    );
    assert.ok(
      cm.verificationStatus === 'CONFIRMED' ||
        cm.verificationStatus === 'PENDING_REVIEW' ||
        cm.verificationStatus === 'USER_CONFIRMED',
      'Commitment must declare verificationStatus'
    );
  }
});

test('Placeholder environment value detector rejects template placeholders', () => {
  assert.equal(isPlaceholderEnvValue(''), true);
  assert.equal(isPlaceholderEnvValue('<PASTE_YOUR_AURA_URI_HERE>'), true);
  assert.equal(isPlaceholderEnvValue('MY_GEMINI_API_KEY'), true);
  assert.equal(isPlaceholderEnvValue('YOUR_SARVAM_API_KEY'), true);
  assert.equal(isPlaceholderEnvValue('neo4j+s://5ded3f74.databases.neo4j.io'), false);
});

// ----------------------------------------------------------------------------
// 12. THREE-WAY FINANCIAL RECONCILIATION & SECTION 22 JUDGE DEMO
// ----------------------------------------------------------------------------

test('Three-Way Reconciliation produces accurate outcomes and never claims fraud or non-existent mandates', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, sessions } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);
  const mandates = buildInitialSeedMandates();
  const serviceTerms = buildInitialSeedServiceTerms();

  const findings = runFullReconciliation({
    commitments,
    transactions,
    mandates,
    serviceTerms,
    sessions,
  });
  assert.ok(findings.length >= commitments.length);

  // StreamBox initial seed: ₹499 invoice vs ₹499 debit vs ₹999 mandate ceiling -> MATCHED
  const streamboxInitial = findings.find((f) => f.commitmentId === 'CMT-STREAMBOX');
  assert.ok(streamboxInitial);
  assert.equal(streamboxInitial.status, 'MATCHED');
  assert.equal(streamboxInitial.withinMandateLimit, true);

  // MusicFlow initial seed: ₹199 plan terms vs ₹249 latest debit -> AMOUNT_DISCREPANCY (+₹50)
  const musicflowFinding = findings.find((f) => f.commitmentId === 'CMT-MUSICFLOW');
  assert.ok(musicflowFinding);
  assert.equal(musicflowFinding.status, 'AMOUNT_DISCREPANCY');
  assert.equal(musicflowFinding.discrepancyAmount, 50);
  assert.equal(musicflowFinding.discrepancyAmountMinor, 5000);
  assert.ok(
    !musicflowFinding.explanation.toLowerCase().includes('fraud'),
    'Must never declare amount discrepancy as fraud'
  );

  // Section 22 Judge Demo: StreamBox debits ₹799 against ₹499 invoice and ₹999 mandate ceiling
  const streamboxCommitment = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const demoTxRow: RawCsvRow = {
    transaction_id: 'TXN-DEMO-799',
    transaction_date: '2026-11-05',
    raw_description: 'RZP*STREAMBOX',
    amount: 799,
    currency: 'INR',
    direction: 'DEBIT',
    payment_rail: 'UPI_AUTOPAY',
    account_alias: 'HDFC-XX4821',
    external_reference: 'UTR60405998877',
  };
  const { transactions: demoNormalized } = parseAndNormaliseTransactions([demoTxRow]);
  const linkedDemoTx = {
    ...demoNormalized[0],
    commitmentId: 'CMT-STREAMBOX',
  };
  const updatedStreambox = {
    ...streamboxCommitment,
    latestAmount: 799,
    latestAmountMinor: 79900,
    supportingTransactionIds: [...streamboxCommitment.supportingTransactionIds, 'TXN-DEMO-799'],
  };
  const streamboxMandate = mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX')!;
  const streamboxTerms = serviceTerms.find((t) => t.commitmentId === 'CMT-STREAMBOX')!;

  const demoFinding = reconcileCommitment({
    commitment: updatedStreambox,
    transactions: [...transactions, linkedDemoTx],
    mandate: streamboxMandate,
    serviceTerms: streamboxTerms,
    cancellationSession: null,
  });

  assert.equal(demoFinding.status, 'AMOUNT_DISCREPANCY');
  assert.equal(demoFinding.expectedServiceAmount, 499);
  assert.equal(demoFinding.actualTransactionAmount, 799);
  assert.equal(demoFinding.mandateMaxAmount, 999);
  assert.equal(demoFinding.discrepancyAmount, 300);
  assert.equal(demoFinding.discrepancyAmountMinor, 30000);
  assert.equal(demoFinding.withinMandateLimit, true);
  assert.ok(demoFinding.explanation.includes('300'));

  // Missing visible mandate -> TRANSACTION_WITHOUT_VISIBLE_MANDATE with epistemic humility
  const noMandateFinding = reconcileCommitment({
    commitment: streamboxCommitment,
    transactions,
    mandate: null,
    serviceTerms: streamboxTerms,
    cancellationSession: null,
  });
  assert.equal(noMandateFinding.status, 'TRANSACTION_WITHOUT_VISIBLE_MANDATE');
  assert.ok(
    noMandateFinding.explanation.includes('no matching mandate was found in the available imported records'),
    'Must use exact epistemically humble wording when mandate is absent from imported records'
  );
});

// ----------------------------------------------------------------------------
// 13. SERVICE TERMS EXTRACTION, EVIDENCE CASEBOOK, LIFECYCLES & BHASHA Q&A
// ----------------------------------------------------------------------------

test('Service Terms parser extracts structured billing terms from pasted invoice text and never invents a price when currency token is missing', () => {
  const extracted = extractServiceTermsFromText({
    commitmentId: 'CMT-STREAMBOX',
    merchantName: 'StreamBox Media Pvt Ltd',
    serviceName: 'StreamBox Standard Monthly Plan',
    documentSource: 'PASTED_INVOICE_TEXT',
    rawText:
      'StreamBox Standard Monthly Plan Invoice #INV-9981. Billing Cycle: Monthly. Plan Price: Rs. 499. Renewal Date: 2026-11-05. Cancel at least 2 days before renewal.',
  });

  assert.equal(extracted.expectedAmount, 499);
  assert.equal(extracted.expectedAmountMinor, 49900);
  assert.equal(extracted.billingFrequency, 'MONTHLY');
  assert.equal(extracted.renewalDate, '2026-11-05');
  assert.equal(extracted.cancellationNoticeDays, 2);
  assert.equal(extracted.userVerified, false, 'Extracted terms must default to userVerified=false');
  assert.ok(
    extracted.extractedFields.every((f) => f.userVerified === false),
    'Field-level userVerified must match document userVerified=false'
  );
  assert.ok(extracted.extractedFields.some((f) => f.fieldName === 'expectedAmount'));
  assert.ok(extracted.extractionConfidence >= 75);

  // Missing currency token in pasted text must keep expectedAmountMinor=null and expectedAmount=null (never invent ₹499)
  const missingPriceDoc = extractServiceTermsFromText({
    commitmentId: 'CMT-STREAMBOX',
    merchantName: 'StreamBox Media Pvt Ltd',
    serviceName: 'StreamBox Plan',
    documentSource: 'PASTED_INVOICE_TEXT',
    rawText: 'Subscription Confirmation #INV-0001. Billing Cycle: Quarterly. Cancel 5 days before renewal.',
  });
  assert.equal(missingPriceDoc.expectedAmountMinor, null, 'Must not invent ₹499 when no currency token is present');
  assert.equal(missingPriceDoc.expectedAmount, null);
  assert.equal(missingPriceDoc.billingFrequency, 'QUARTERLY');
  assert.equal(missingPriceDoc.cancellationNoticeDays, 5);

  // Regression Test (Part 5.1): Missing billing frequency must remain UNKNOWN and never default to MONTHLY
  const missingFrequencyDoc = extractServiceTermsFromText({
    commitmentId: 'CMT-STREAMBOX',
    merchantName: 'StreamBox Media Pvt Ltd',
    serviceName: 'StreamBox Plan',
    documentSource: 'PASTED_INVOICE_TEXT',
    rawText: 'Invoice #INV-7721. Total Amount Paid: Rs. 499.00. Payment method: UPI AutoPay.',
  });
  assert.equal(
    missingFrequencyDoc.billingFrequency,
    'UNKNOWN',
    'Missing billing frequency must remain UNKNOWN and never default to MONTHLY'
  );
  assert.equal(missingFrequencyDoc.expectedAmount, 499);
  assert.equal(missingFrequencyDoc.expectedAmountMinor, 49900);
  const freqField = missingFrequencyDoc.extractedFields.find((f) => f.fieldName === 'billingFrequency');
  assert.ok(freqField);
  assert.equal(freqField.confidence, 0);
  assert.ok(freqField.extractedValue.includes('UNAVAILABLE'));
});

test('All 9 reconciliation outcomes are verified across seed dataset and explicit fixtures (including FREQUENCY_DISCREPANCY and POSSIBLE_DUPLICATE)', () => {
  const csvPath = path.resolve(process.cwd(), 'data/synthetic-transactions.csv');
  const notifPath = path.resolve(process.cwd(), 'data/synthetic-notifications.json');
  const parsedCsv = parseCsvTextRFC4180(fs.readFileSync(csvPath, 'utf-8'));
  const notifs = JSON.parse(fs.readFileSync(notifPath, 'utf-8'));

  const { transactions } = parseAndNormaliseTransactions(parsedCsv);
  const { commitments, sessions } = detectCommitmentsAndAlerts(transactions, notifs);
  const mandates = buildInitialSeedMandates();
  const serviceTerms = buildInitialSeedServiceTerms();

  const findings = runFullReconciliation({
    commitments,
    transactions,
    mandates,
    serviceTerms,
    sessions,
  });

  // Verify dynamic evaluatedAt (not fixed 2026-10-31T00:00:00Z)
  for (const f of findings) {
    assert.notEqual(f.evaluatedAt, '2026-10-31T00:00:00Z');
    assert.ok(!Number.isNaN(Date.parse(f.evaluatedAt)));
  }

  // 1. MATCHED (StreamBox, CloudNotes, LearnPro, Bajaj Finance)
  assert.equal(findings.find((f) => f.commitmentId === 'CMT-STREAMBOX')?.status, 'MATCHED');
  assert.equal(findings.find((f) => f.commitmentId === 'CMT-CLOUDNOTES')?.status, 'MATCHED');
  assert.equal(findings.find((f) => f.commitmentId === 'CMT-LEARNPRO')?.status, 'MATCHED');
  assert.equal(findings.find((f) => f.commitmentId === 'CMT-BAJAJEMI')?.status, 'MATCHED');

  // 2. AMOUNT_DISCREPANCY (MusicFlow: ₹199 documented vs ₹249 actual)
  assert.equal(findings.find((f) => f.commitmentId === 'CMT-MUSICFLOW')?.status, 'AMOUNT_DISCREPANCY');

  // 3. FREQUENCY_DISCREPANCY (MaxLife: QUARTERLY documented schedule vs IRREGULAR observed cadence)
  const maxlifeFinding = findings.find((f) => f.commitmentId === 'CMT-MAXLIFE');
  assert.ok(maxlifeFinding);
  assert.equal(maxlifeFinding.status, 'FREQUENCY_DISCREPANCY');
  assert.ok(maxlifeFinding.explanation.includes('QUARTERLY'));
  assert.ok(maxlifeFinding.explanation.includes('IRREGULAR'));

  // 4. TRANSACTION_WITHOUT_VISIBLE_MANDATE (FitClub)
  assert.equal(
    findings.find((f) => f.commitmentId === 'CMT-FITCLUB')?.status,
    'TRANSACTION_WITHOUT_VISIBLE_MANDATE'
  );

  // 5. SERVICE_TERMS_UNAVAILABLE (ReadCloud & BESCOM)
  assert.equal(
    findings.find((f) => f.commitmentId === 'CMT-READCLOUD')?.status,
    'SERVICE_TERMS_UNAVAILABLE'
  );
  assert.equal(
    findings.find((f) => f.commitmentId === 'CMT-BESCOM')?.status,
    'SERVICE_TERMS_UNAVAILABLE'
  );

  // 6. CONFLICTING_EVIDENCE (DesignVault post-cancellation debit)
  const dvFinding = findings.find((f) => f.commitmentId === 'CMT-DESIGNVAULT');
  assert.ok(dvFinding);
  assert.equal(dvFinding.status, 'CONFLICTING_EVIDENCE');
  assert.ok(dvFinding.explanation.includes('DV-CANC-20260910-881'));
  assert.ok(dvFinding.explanation.includes('SIHUB-REV-994012'));

  // 7. MANDATE_WITHOUT_RECENT_TRANSACTION (Dormant NewsPlus mandate)
  assert.equal(
    findings.find((f) => f.commitmentId === 'MND-DORMANT-NEWSPLUS')?.status,
    'MANDATE_WITHOUT_RECENT_TRANSACTION'
  );

  // Also verify MANDATE_WITHOUT_RECENT_TRANSACTION when an active mandate is linked to an existing commitment with zero recent transactions
  const streamboxCmt = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const streamboxMandate = mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX')!;
  const streamboxTerms = serviceTerms.find((s) => s.commitmentId === 'CMT-STREAMBOX')!;
  const noRecentTxnFinding = reconcileCommitment({
    commitment: streamboxCmt,
    transactions: [], // zero transactions in statement period
    mandate: streamboxMandate,
    serviceTerms: streamboxTerms,
    cancellationSession: null,
  });
  assert.equal(noRecentTxnFinding.status, 'MANDATE_WITHOUT_RECENT_TRANSACTION');

  // 8. UNRESOLVED (Processor-only pool)
  assert.equal(findings.find((f) => f.commitmentId === 'UNRESOLVED-POOL')?.status, 'UNRESOLVED');

  // 9. POSSIBLE_DUPLICATE (Two identical debits within 48 hours without a credit reversal)
  const dupRows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-DUP-0A',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'DUP-0A',
    },
    {
      transaction_id: 'TXN-DUP-0B',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'DUP-0B',
    },
    {
      transaction_id: 'TXN-DUP-1',
      transaction_date: '2026-10-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'DUP-1',
    },
    {
      transaction_id: 'TXN-DUP-2',
      transaction_date: '2026-10-06',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'DUP-2',
    },
  ];
  const { transactions: dupTxns } = parseAndNormaliseTransactions(dupRows);
  const { commitments: dupCmts } = detectCommitmentsAndAlerts(dupTxns, []);
  const dupFinding = reconcileCommitment({
    commitment: dupCmts[0],
    transactions: dupTxns,
    mandate: streamboxMandate,
    serviceTerms: streamboxTerms,
    cancellationSession: null,
  });
  assert.equal(dupFinding.status, 'POSSIBLE_DUPLICATE');

  // Verify that when a matching CREDIT reversal exists within 7 days, POSSIBLE_DUPLICATE is NOT raised
  const reversedDupRows: RawCsvRow[] = [
    ...dupRows,
    {
      transaction_id: 'TXN-DUP-REV',
      transaction_date: '2026-10-07',
      raw_description: 'REV-RZP*STREAMBOX-REFUND',
      amount: 499,
      currency: 'INR',
      direction: 'CREDIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'DUP-REV',
    },
  ];
  const { transactions: revDupTxns } = parseAndNormaliseTransactions(reversedDupRows);
  const { commitments: revDupCmts } = detectCommitmentsAndAlerts(revDupTxns, []);
  const revDupFinding = reconcileCommitment({
    commitment: revDupCmts[0],
    transactions: revDupTxns,
    mandate: streamboxMandate,
    serviceTerms: streamboxTerms,
    cancellationSession: null,
  });
  assert.equal(
    revDupFinding.status,
    'MATCHED',
    'Duplicate debit offset by a matching CREDIT reversal must not raise POSSIBLE_DUPLICATE'
  );
});

test('Mandate expiry and non-active status prevent three-way reconciliation from marking MATCHED, and post-cancellation explanations respect independent lifecycles', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS);
  const mandates = buildInitialSeedMandates();
  const serviceTerms = buildInitialSeedServiceTerms();

  const streambox = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const sbMandate = mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX')!;
  const sbTerms = serviceTerms.find((s) => s.commitmentId === 'CMT-STREAMBOX')!;

  // Expired mandate check (endDate before latest transaction 2026-08-05)
  const expiredMandateFinding = reconcileCommitment({
    commitment: streambox,
    transactions,
    mandate: { ...sbMandate, endDate: '2026-07-01' },
    serviceTerms: sbTerms,
    cancellationSession: null,
  });
  assert.equal(expiredMandateFinding.status, 'CONFLICTING_EVIDENCE');
  assert.ok(expiredMandateFinding.explanation.includes('expired on 2026-07-01'));

  // Non-active (PAUSED) mandate check
  const pausedMandateFinding = reconcileCommitment({
    commitment: streambox,
    transactions,
    mandate: { ...sbMandate, mandateStatus: 'PAUSED' },
    serviceTerms: sbTerms,
    cancellationSession: null,
  });
  assert.equal(pausedMandateFinding.status, 'CONFLICTING_EVIDENCE');
  assert.ok(pausedMandateFinding.explanation.includes('PAUSED'));

  // Post-cancellation explanation when ONLY service cancellation was recorded (mandate still ACTIVE)
  const serviceOnlyCancelFinding = reconcileCommitment({
    commitment: {
      ...streambox,
      status: 'POST_CANCEL_ALERT',
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
      mandateLifecycleStatus: 'ACTIVE',
    },
    transactions,
    mandate: sbMandate,
    serviceTerms: sbTerms,
    cancellationSession: {
      id: 'SESS-SB-TEST',
      commitmentId: 'CMT-STREAMBOX',
      merchantName: streambox.merchantName,
      serviceName: streambox.serviceName,
      paymentRail: streambox.paymentRail,
      status: 'SERVICE_CANCELLED_PAYMENT_PENDING',
      initiatedAt: '2026-08-01T10:00:00Z',
      serviceCancelledAt: '2026-08-01',
      paymentAuthorisationRevokedAt: null,
      lastReviewedAt: '2026-08-01',
      steps: [],
      evidence: [
        {
          id: 'EV-SB-ONLY',
          cancellationSessionId: 'SESS-SB-TEST',
          evidenceType: 'SERVICE_CONFIRMATION',
          referenceNumber: 'SB-TKT-7712',
          evidenceDate: '2026-08-01',
          description: 'Cancelled service only',
          verificationStatus: 'EVIDENCE_ATTACHED',
          createdAt: '2026-08-01T10:00:00Z',
        },
      ],
      postCancellationTransactionIds: ['TXN-1003'],
    },
  });
  assert.equal(serviceOnlyCancelFinding.status, 'CONFLICTING_EVIDENCE');
  assert.ok(serviceOnlyCancelFinding.explanation.includes('SB-TKT-7712'));
  assert.ok(
    serviceOnlyCancelFinding.explanation.includes('mandate revocation is not recorded'),
    'Must not claim both service cancellation and mandate revocation were recorded when only Layer A was recorded'
  );
  assert.ok(
    !serviceOnlyCancelFinding.explanation.includes('DV-CANC-20260910-881'),
    'Must never use fabricated fallback reference DV-CANC-20260910-881'
  );
});

test('Evidence Casebook & Independent Cancellation Lifecycles track Layer A and Layer B separately and use accurate verificationStatus labels', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, alerts, sessions } = detectCommitmentsAndAlerts(
    transactions,
    SAMPLE_NOTIFICATIONS
  );
  const mandates = buildInitialSeedMandates();
  const serviceTerms = buildInitialSeedServiceTerms();
  const findings = runFullReconciliation({
    commitments,
    transactions,
    mandates,
    serviceTerms,
    sessions,
  });

  const streambox = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const streamboxSession = sessions.find((s) => s.commitmentId === 'CMT-STREAMBOX') || null;
  const casebook = buildCommitmentEvidenceCasebook({
    commitment: streambox,
    transactions,
    mandate: mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX') || null,
    serviceTerms: serviceTerms.find((t) => t.commitmentId === 'CMT-STREAMBOX') || null,
    reconciliation: findings.find((f) => f.commitmentId === 'CMT-STREAMBOX') || null,
    alerts,
    session: streamboxSession,
  });

  assert.ok(
    casebook.entries.length >= 4,
    'Evidence casebook must assemble multi-source evidence chain'
  );

  // Verify honest verificationStatus labels on casebook entries
  const mandateEntry = casebook.entries.find((e) => e.category === 'MANDATE_RECORD')!;
  assert.equal(
    mandateEntry.verificationStatus,
    'IMPORTED_RECORD',
    'Imported/demo-seeded mandate must be labelled IMPORTED_RECORD, not CONFIRMED'
  );

  const recEntry = casebook.entries.find((e) => e.category === 'RECONCILIATION_FINDING')!;
  assert.equal(
    recEntry.verificationStatus,
    'SYSTEM_GENERATED',
    'Computed reconciliation finding must be labelled SYSTEM_GENERATED, not CONFIRMED'
  );

  // Verify independent Layer A & Layer B statuses
  const partialCancel = deriveIndependentLifecycleStatuses(
    {
      ...(streamboxSession as any),
      serviceCancelledAt: '2026-10-20',
      paymentAuthorisationRevokedAt: null,
      evidence: [
        {
          id: 'EV-TEST-1',
          evidenceType: 'SERVICE_CONFIRMATION',
          referenceNumber: 'SB-CANCEL-991',
          evidenceDate: '2026-10-20',
          description: 'Cancelled in StreamBox account settings',
          createdAt: '2026-10-20T10:00:00Z',
        },
      ],
    },
    mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX') || null
  );

  assert.equal(partialCancel.serviceLifecycleStatus, 'CANCELLATION_EVIDENCE_ATTACHED');
  assert.equal(partialCancel.mandateLifecycleStatus, 'ACTIVE');
});

test('Data Coverage summary and Contextual Bhasha Q&A provide grounded, honest responses', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, sessions } = detectCommitmentsAndAlerts(
    transactions,
    SAMPLE_NOTIFICATIONS
  );
  const mandates = buildInitialSeedMandates();
  const serviceTerms = buildInitialSeedServiceTerms();
  const findings = runFullReconciliation({
    commitments,
    transactions,
    mandates,
    serviceTerms,
    sessions,
  });

  const coverage = buildDataCoverageSummary({
    transactions,
    commitments,
    mandates,
    serviceTerms,
    notificationsCount: SAMPLE_NOTIFICATIONS.length,
  });

  assert.equal(coverage.importedTransactionCount, transactions.length);
  assert.ok(coverage.blindSpots.length >= 1);

  const streambox = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const qa = buildGroundedContextualQuestionResponse({
    commitment: streambox,
    question: 'Why was I charged this amount and how do I cancel?',
    language: 'hi-IN',
    transactions,
    mandate: mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX') || null,
    serviceTerms: serviceTerms.find((t) => t.commitmentId === 'CMT-STREAMBOX') || null,
    reconciliation: findings.find((f) => f.commitmentId === 'CMT-STREAMBOX') || null,
    session: sessions.find((s) => s.commitmentId === 'CMT-STREAMBOX') || null,
  });

  assert.equal(qa.commitmentId, 'CMT-STREAMBOX');
  assert.ok(qa.englishAnswer.includes('StreamBox'));
  assert.ok(qa.localizedAnswer.includes('StreamBox'));
  assert.ok(qa.evidenceRecordIds.length >= 2);
});

test('Phase 1 Financial Integrity: Strict Amount Parsing rejects non-numeric and trailing garbage', () => {
  assert.equal(parseStrictAmount(499), 499);
  assert.equal(parseStrictAmount('499'), 499);
  assert.equal(parseStrictAmount('499.50'), 499.5);
  assert.equal(parseStrictAmount('₹499.00'), 499);
  assert.equal(parseStrictAmount('Rs. 1,299.00'), 1299);
  assert.equal(parseStrictAmount('INR 799'), 799);

  // Critical requirement: MUST reject 200xyz which standard parseFloat accepts
  assert.equal(parseStrictAmount('200xyz'), null);
  assert.equal(parseStrictAmount('xyz200'), null);
  assert.equal(parseStrictAmount('499 dollars'), null);
  assert.equal(parseStrictAmount(''), null);
  assert.equal(parseStrictAmount(null), null);
  assert.equal(parseStrictAmount(undefined), null);
  assert.equal(parseStrictAmount(NaN), null);
  assert.equal(parseStrictAmount(-50), null);
});

test('Phase 1 Financial Integrity: Mandate validity & missing fields prevent MATCHED status', () => {
  const completeMandate = {
    id: 'MND-TEST-01',
    mandateReference: 'UMN-TEST-01@okaxis',
    commitmentId: 'CMT-TEST',
    merchantId: 'MCH-TEST',
    merchantName: 'Test Service',
    paymentRail: 'UPI_AUTOPAY' as const,
    currency: 'INR',
    maxAmountMinor: 50000,
    maxAmount: 500,
    frequency: 'MONTHLY' as const,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    mandateStatus: 'ACTIVE' as const,
    sourceType: 'USER_IMPORTED' as const,
    updatedAt: '2026-06-01T00:00:00Z',
  };

  assert.equal(getEffectiveMandateStatus(completeMandate), 'ACTIVE_VALID');
  assert.deepEqual(getMissingMandateFields(completeMandate), []);

  // Incomplete mandate
  const incompleteMandate = {
    ...completeMandate,
    maxAmountMinor: null,
    maxAmount: null,
    frequency: 'UNKNOWN' as any,
    mandateStatus: 'UNKNOWN' as any,
  };
  assert.equal(getEffectiveMandateStatus(incompleteMandate), 'INCOMPLETE');
  const missing = getMissingMandateFields(incompleteMandate);
  assert.ok(missing.includes('maxAmount'));
  assert.ok(missing.includes('frequency'));

  // Expired mandate with ACTIVE label
  const expiredMandate = {
    ...completeMandate,
    endDate: '2025-01-01', // Past date
    mandateStatus: 'ACTIVE' as const,
  };
  assert.equal(getEffectiveMandateStatus(expiredMandate), 'EXPIRED');

  // Verify that incomplete mandate produces UNRESOLVED, never MATCHED
  const dummyCommitment = {
    id: 'CMT-TEST',
    merchantName: 'Test Service',
    serviceName: 'Test Plan',
    latestAmount: 500,
    typicalAmount: 500,
    expectedAmountMinor: 50000,
    annualisedAmount: 6000,
    monthlyEquivalent: 500,
    recurrenceType: 'MONTHLY' as const,
    paymentRail: 'UPI_AUTOPAY' as const,
    status: 'ACTIVE' as const,
    entityClass: 'FINANCIAL_COMMITMENT' as const,
    verificationStatus: 'USER_CONFIRMED' as const,
    confidenceScore: 90,
    confidenceLabel: 'HIGH' as const,
    confidenceBreakdown: {
      temporalScore: 30,
      amountRegularityScore: 30,
      descriptorConfidence: 20,
      mandateAlignmentScore: 10,
      totalScore: 90,
      supportingTransactionsCount: 3,
      relationshipConfidence: 'CONFIRMED_MERCHANT_RELATIONSHIP' as const,
    },
    connectedDescriptors: ['TEST*SRV'],
    supportingTransactionIds: ['TXN-T1', 'TXN-T2'],
    firstSeenDate: '2026-06-01',
    latestTransactionDate: '2026-08-01',
    nextExpectedDate: '2026-09-01',
    category: 'SOFTWARE_SAAS' as const,
    detectionExplanation: 'Test explanation',
    isFinancialObligation: false,
    usageStatus: 'ACTIVE_IN_USE' as const,
    serviceLifecycleStatus: 'ACTIVE' as const,
    mandateLifecycleStatus: 'ACTIVE' as const,
  };

  const dummyTxns: any[] = [
    {
      id: 'TXN-T1',
      transactionDate: '2026-06-01',
      amount: 500,
      commitmentId: 'CMT-TEST',
      merchantName: 'Test Service',
      serviceName: 'Test Plan',
      paymentRail: 'UPI_AUTOPAY',
      rawDescription: 'TEST*SRV',
      resolutionStatus: 'CANONICAL_MERCHANT_MATCHED',
    },
    {
      id: 'TXN-T2',
      transactionDate: '2026-07-01',
      amount: 500,
      commitmentId: 'CMT-TEST',
      merchantName: 'Test Service',
      serviceName: 'Test Plan',
      paymentRail: 'UPI_AUTOPAY',
      rawDescription: 'TEST*SRV',
      resolutionStatus: 'CANONICAL_MERCHANT_MATCHED',
    },
  ];

  const findingWithIncomplete = reconcileCommitment({
    commitment: dummyCommitment as any,
    transactions: dummyTxns,
    mandate: incompleteMandate as any,
    serviceTerms: null,
    session: null,
  });

  // Must not be MATCHED
  assert.notEqual(findingWithIncomplete.status, 'MATCHED');
  assert.equal(findingWithIncomplete.status, 'UNRESOLVED');
  assert.ok(findingWithIncomplete.discrepancyDetails?.missingMandateFields?.length! >= 1);
});

test('Phase 2 Product Differentiation: Candidate merchant generation without hallucination', () => {
  const unresolvedTxn: any = {
    id: 'TXN-9501',
    transactionDate: '2026-07-28',
    rawDescription: 'RAZORPAY*STREAMBOX-MUM',
    amount: 499,
    currency: 'INR',
    direction: 'DEBIT',
    paymentRail: 'UPI_AUTOPAY',
    accountAlias: 'HDFC-XX4821',
    resolutionStatus: 'UNRESOLVED',
    isPaymentProcessorIsolated: true,
    processorName: 'Razorpay',
  };

  const candidates = generateMerchantCandidates(unresolvedTxn, [unresolvedTxn], {});
  assert.ok(candidates.length >= 1);
  const streamboxCandidate = candidates.find(
    (c) =>
      (c.candidateMerchantName && c.candidateMerchantName.includes('StreamBox')) ||
      (c.merchantName && c.merchantName.includes('StreamBox'))
  );
  assert.ok(streamboxCandidate);
  assert.ok(streamboxCandidate.confidenceScore >= 70);
  assert.ok(streamboxCandidate.matchReason.length > 5);
});

test('Phase 2 Product Differentiation: Unrecognized Debit Case lifecycle & Review Queue priority', () => {
  const txn: any = {
    id: 'TXN-9502',
    transactionDate: '2026-08-28',
    rawDescription: 'PAYU*UNKNOWN-BILL',
    amount: 799,
    currency: 'INR',
    direction: 'DEBIT',
    paymentRail: 'UPI_AUTOPAY',
    accountAlias: 'HDFC-XX4821',
    resolutionStatus: 'UNRESOLVED',
    isPaymentProcessorIsolated: true,
    processorName: 'PayU',
  };

  const newCase = buildUnrecognizedDebitCase({
    transaction: txn,
    allTransactions: [txn],
    userMerchantOverrides: {},
    existingCases: [],
  });

  assert.equal(newCase.status, 'OPEN');
  assert.equal(newCase.transactionId, 'TXN-9502');
  assert.ok(newCase.candidateMerchants.length >= 0);
  assert.ok(newCase.guidanceChecklist.length >= 3);

  // Review Queue compilation
  const mockReconFinding: any = {
    id: 'REC-01',
    commitmentId: 'CMT-01',
    serviceName: 'StreamBox',
    merchantName: 'StreamBox',
    status: 'AMOUNT_DISCREPANCY',
    discrepancyReason: 'Debit ₹799 vs invoice ₹499',
    severity: 'ACTION_REQUIRED',
    evaluatedAt: '2026-10-31T00:00:00Z',
    transactionEvidence: { latestTransactionAmount: 799 },
    mandateEvidence: { maxAmount: 999 },
    termsEvidence: { expectedAmount: 499 },
  };

  const queue = buildReviewQueue({
    investigations: [newCase],
    reconciliationFindings: [mockReconFinding],
    alerts: [],
    commitments: [],
    statusOverrides: {},
  });

  assert.ok(queue.length >= 2);
  // Reconciliation finding with discrepancy should be P1
  const reconItem = queue.find((i) => i.category === 'PRICE_DISCREPANCY');
  assert.ok(reconItem);
  assert.equal(reconItem.priority, 'P1');

  // Verify status override applies
  const overriddenQueue = buildReviewQueue({
    investigations: [newCase],
    reconciliationFindings: [mockReconFinding],
    alerts: [],
    commitments: [],
    statusOverrides: { [reconItem.id]: 'RESOLVED' },
  });
  const updatedReconItem = overriddenQueue.find((i) => i.id === reconItem.id);
  assert.equal(updatedReconItem?.status, 'RESOLVED');
});

test('Phase 3 Evidence Value: Commitment Passport, Evidence Pack & HTML Print View', () => {
  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments, alerts, sessions } = detectCommitmentsAndAlerts(
    transactions,
    SAMPLE_NOTIFICATIONS
  );
  const mandates = buildInitialSeedMandates();
  const serviceTerms = buildInitialSeedServiceTerms();
  const findings = runFullReconciliation({
    commitments,
    transactions,
    mandates,
    serviceTerms,
    sessions,
  });

  const streambox = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const mandate = mandates.find((m) => m.commitmentId === 'CMT-STREAMBOX') || null;
  const terms = serviceTerms.find((t) => t.commitmentId === 'CMT-STREAMBOX') || null;
  const finding = findings.find((f) => f.commitmentId === 'CMT-STREAMBOX') || null;

  const passport = generateCommitmentPassport({
    commitment: streambox,
    transactions,
    mandate,
    serviceTerms: terms,
    reconciliation: finding,
    alerts: alerts.filter((a) => a.commitmentId === streambox.id),
    casebookEntries: [],
    auditEvents: [],
  });

  assert.equal(passport.commitmentId, 'CMT-STREAMBOX');
  assert.ok(passport.sectionA_Identity.merchantName.includes('StreamBox'));
  assert.ok(passport.sectionB_Mandate.mandatePresent);
  assert.ok(passport.sectionC_Terms.termsPresent);
  assert.ok(passport.sectionD_History.totalDebitsCount >= 3);
  assert.ok(passport.dataCoverage.coveragePercent > 50);

  const packData = generateEvidencePackData({
    commitment: streambox,
    transactions,
    mandate,
    serviceTerms: terms,
    reconciliation: finding,
    alerts: alerts.filter((a) => a.commitmentId === streambox.id),
    casebookEntries: [],
    auditEvents: [],
  });

  assert.equal(packData.commitmentId, 'CMT-STREAMBOX');
  assert.equal(packData.evidencePackVersion, '1.0');
  assert.ok(packData.exportTimestamp);

  const html = generatePrintableEvidencePackHtml(packData);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('DebitLens Financial Evidence Pack'));
  assert.ok(html.includes('StreamBox'));
  assert.ok(html.includes('Section A'));
  assert.ok(html.includes('@media print'));
});

test('Phase 4 Usability: Smart Bank Statement CSV Mapping Wizard', () => {
  const bankCsv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
05/10/2026,UPI-NETFLIX-9812-AUTOPAY,REF9812938,649.00,,45210.50
10/10/2026,POS 4821 SPOTIFY INDIA MUMBAI,POS-88127,119.00,,45091.50
15/10/2026,SALARY CREDIT ACME CORP,SAL-99120,,85000.00,126841.50`;

  const preview = previewCsvMapping(bankCsv, {
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    amountMode: 'SEPARATE_DEBIT_CREDIT',
    debitAmountColumn: 'Withdrawal Amt',
    creditAmountColumn: 'Deposit Amt',
    dateFormat: 'DD/MM/YYYY',
  });

  assert.equal(preview.headers.length, 6);
  assert.ok(preview.headers.includes('Date'));
  assert.ok(preview.headers.includes('Narration'));
  assert.ok(preview.headers.includes('Withdrawal Amt'));

  // 2 debits (Netflix 649, Spotify 119) and 1 credit (Salary 85000 valid with CREDIT direction)
  assert.equal(preview.validRowsCount, 3);
  const netflixRow = preview.previewRows.find((r) => r.mappedRow?.raw_description.includes('NETFLIX'));
  assert.ok(netflixRow);
  assert.equal(netflixRow.mappedRow?.amount, '649');
  assert.equal(netflixRow.mappedRow?.transaction_date, '2026-10-05');
  assert.equal(netflixRow.direction, 'DEBIT');

  const salaryRow = preview.previewRows.find((r) => r.rowNumber === 3);
  assert.ok(salaryRow);
  assert.equal(salaryRow.isValid, true);
  assert.equal(salaryRow.direction, 'CREDIT');
  assert.equal(salaryRow.mappedRow?.amount, '85000');
});

// ----------------------------------------------------------------------------
// 14. REGRESSION TESTS: XSS ESCAPING, FULL CSV PARSING, PASSPORT ZERO-FABRICATION
// ----------------------------------------------------------------------------

test('Phase 4 Hardening: escapeHtml neutralizes XSS vectors in printable evidence pack', () => {
  assert.equal(
    escapeHtml('<script>alert("pwned")</script>'),
    '&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;'
  );
  assert.equal(escapeHtml('Tom & Jerry "Special"'), 'Tom &amp; Jerry &quot;Special&quot;');
  assert.equal(escapeHtml("User's Plan"), 'User&#39;s Plan');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('Phase 4 Hardening: parseCsvDate correctly parses diverse date formats and rejects invalid dates', () => {
  // DD/MM/YYYY
  assert.equal(parseCsvDate('25/12/2026', 'DD/MM/YYYY'), '2026-12-25');
  assert.equal(parseCsvDate('05/01/2026', 'DD/MM/YYYY'), '2026-01-05');

  // DD-MM-YYYY
  assert.equal(parseCsvDate('15-08-2026', 'DD-MM-YYYY'), '2026-08-15');

  // MM/DD/YYYY
  assert.equal(parseCsvDate('12/25/2026', 'MM/DD/YYYY'), '2026-12-25');

  // YYYY-MM-DD
  assert.equal(parseCsvDate('2026-10-31', 'YYYY-MM-DD'), '2026-10-31');

  // AUTO detection
  assert.equal(parseCsvDate('2026-09-15', 'AUTO'), '2026-09-15');
  assert.equal(parseCsvDate('25/12/2026', 'AUTO'), '2026-12-25');

  // Invalid date inputs
  assert.equal(parseCsvDate('', 'AUTO'), null);
  assert.equal(parseCsvDate('invalid-date', 'AUTO'), null);
  assert.equal(parseCsvDate('32/01/2026', 'DD/MM/YYYY'), null);
});

test('Phase 4 Hardening: parseAllMappedCsvRows parses all rows, preserves credits and generates deterministic IDs', () => {
  const multiRowCsv = `Date,Narration,Ref,Debit,Credit
01/10/2026,UPI-SWIGGY-1001,REF-01,350.00,
02/10/2026,UPI-NETFLIX-1002,REF-02,649.00,
03/10/2026,REFUND-SWIGGY-1001,REF-03,,350.00
04/10/2026,SALARY-ACME,REF-04,,95000.00
05/10/2026,ATM-CASH-WDL,REF-05,2000.00,`;

  const parsed = parseAllMappedCsvRows(multiRowCsv, {
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    referenceColumn: 'Ref',
    amountMode: 'SEPARATE_DEBIT_CREDIT',
    debitAmountColumn: 'Debit',
    creditAmountColumn: 'Credit',
    dateFormat: 'DD/MM/YYYY',
  });

  {
    const parsed = parseAllMappedCsvRows(
      `Date,Description,Amount
  01/10/2026,PRECISION-DEBIT,90071992547408.99
  02/10/2026,PRECISION-REFUND,-90071992547408.99`,
      {
        dateColumn: 'Date',
        descriptionColumn: 'Description',
        singleAmountColumn: 'Amount',
        amountMode: 'SINGLE_SIGNED_COLUMN',
        dateFormat: 'DD/MM/YYYY',
        defaultCurrency: 'INR',
      },
      true
    );
    assert.equal(parsed.validRows.length, 2);
    const normalized = parseAndNormaliseTransactions(
      parsed.validRows,
      'BATCH-PRECISION-TEST',
      'CSV_STATEMENT'
    );
    assert.equal(normalized.invalidRows.length, 0);
    assert.equal(normalized.transactions[0].amountMinor, 9007199254740899);
    assert.equal(normalized.transactions[0].amountExact, '90071992547408.99');
    assert.equal(formatExactCurrency(normalized.transactions[0].amountExact, 'INR'), '₹90071992547408.99');
    assert.equal(normalized.transactions[0].direction, 'DEBIT');
    assert.equal(normalized.transactions[1].amountMinor, -9007199254740899);
    assert.equal(normalized.transactions[1].direction, 'CREDIT');
  }

  {
    const parsed = parseAndNormaliseTransactions(
      [
        {
          transaction_id: 'TXN-EXCESS-DECIMALS',
          transaction_date: '2026-10-01',
          raw_description: 'EXCESS DECIMAL',
          amount: '1.001',
          currency: 'INR',
          direction: 'DEBIT',
          payment_rail: 'UNKNOWN',
          account_alias: 'TEST',
          external_reference: '',
        },
        {
          transaction_id: 'TXN-SAFE-BOUNDARY',
          transaction_date: '2026-10-02',
          raw_description: 'SAFE BOUNDARY',
          amount: '90071992547408.99',
          currency: 'INR',
          direction: 'DEBIT',
          payment_rail: 'UNKNOWN',
          account_alias: 'TEST',
          external_reference: '',
        },
        {
          transaction_id: 'TXN-UNSAFE-MINOR',
          transaction_date: '2026-10-03',
          raw_description: 'UNSAFE MINOR',
          amount: '900719925474099.92',
          currency: 'INR',
          direction: 'DEBIT',
          payment_rail: 'UNKNOWN',
          account_alias: 'TEST',
          external_reference: '',
        },
        {
          transaction_id: 'TXN-UNKNOWN-CURRENCY',
          transaction_date: '2026-10-04',
          raw_description: 'UNKNOWN CURRENCY',
          amount: '1.001',
          currency: 'UNKNOWN',
          direction: 'DEBIT',
          payment_rail: 'UNKNOWN',
          account_alias: 'TEST',
          external_reference: '',
        },
        {
          transaction_id: 'TXN-REFUND',
          transaction_date: '2026-10-05',
          raw_description: 'REFUND',
          amount: '-12.34',
          currency: 'INR',
          direction: 'DEBIT',
          payment_rail: 'UNKNOWN',
          account_alias: 'TEST',
          external_reference: '',
        },
      ],
      'BATCH-MONEY-GUARDRAILS',
      'CSV_STATEMENT'
    );
    assert.equal(parsed.invalidRows.length, 2);
    assert.equal(parsed.transactions.length, 3);
    assert.equal(parsed.transactions.find((t) => t.id === 'TXN-SAFE-BOUNDARY')?.amountExact, '90071992547408.99');
    assert.equal(parsed.transactions.find((t) => t.id === 'TXN-UNKNOWN-CURRENCY')?.amountMinor, null);
    assert.equal(parsed.transactions.find((t) => t.id === 'TXN-REFUND')?.direction, 'CREDIT');
  }

  // All 5 rows should be parsed
  assert.equal(parsed.validRows.length, 5);

  // Check debit row
  const netflix = parsed.validRows.find((r) => r.raw_description.includes('NETFLIX'));
  assert.ok(netflix);
  assert.equal(netflix.direction, 'DEBIT');
  assert.equal(netflix.amount, '649');
  assert.equal(netflix.transaction_date, '2026-10-02');
  assert.ok(netflix.transaction_id.startsWith('TXN-MAP-'));

  // Check credit row (preserved!)
  const refund = parsed.validRows.find((r) => r.raw_description.includes('REFUND-SWIGGY'));
  assert.ok(refund);
  assert.equal(refund.direction, 'CREDIT');
  assert.equal(refund.amount, '350');
  assert.equal(refund.transaction_date, '2026-10-03');

  // Check salary credit (preserved!)
  const salary = parsed.validRows.find((r) => r.raw_description.includes('SALARY-ACME'));
  assert.ok(salary);
  assert.equal(salary.direction, 'CREDIT');
  assert.equal(salary.amount, '95000');
});

test('Exact money boundaries reject unrepresentable values and preserve display precision', () => {
  const parsed = parseAndNormaliseTransactions([
    {
      transaction_id: 'TXN-BOUNDARY',
      transaction_date: '2026-10-01',
      raw_description: 'BOUNDARY',
      amount: '90071992547408.99',
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UNKNOWN',
      account_alias: 'TEST',
      external_reference: '',
    },
    {
      transaction_id: 'TXN-EXCESS',
      transaction_date: '2026-10-02',
      raw_description: 'EXCESS',
      amount: '1.001',
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UNKNOWN',
      account_alias: 'TEST',
      external_reference: '',
    },
    {
      transaction_id: 'TXN-UNKNOWN',
      transaction_date: '2026-10-03',
      raw_description: 'UNKNOWN',
      amount: '1.001',
      currency: 'UNKNOWN',
      direction: 'DEBIT',
      payment_rail: 'UNKNOWN',
      account_alias: 'TEST',
      external_reference: '',
    },
  ]);
  assert.equal(parsed.invalidRows.length, 1);
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0].amountMinor, 9007199254740899);
  assert.equal(parsed.transactions[0].amountMinorExact, '9007199254740899');
  assert.equal(parsed.transactions[0].amountExact, '90071992547408.99');
  assert.equal(formatExactCurrency(parsed.transactions[0].amountExact, 'INR'), '₹90071992547408.99');
  assert.equal(parsed.transactions[1].amountMinor, null);
});

test('Exact minor units survive downstream commitment, reconciliation, passport and evidence calculations', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-EXACT-1',
      transaction_date: '2026-06-05',
      raw_description: 'RZP*STREAMBOX',
      amount: '90071992547408.99',
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'EXACT',
      external_reference: 'EXACT-1',
    },
    {
      transaction_id: 'TXN-EXACT-2',
      transaction_date: '2026-07-05',
      raw_description: 'RZP*STREAMBOX',
      amount: '90071992547408.99',
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'EXACT',
      external_reference: 'EXACT-2',
    },
    {
      transaction_id: 'TXN-EXACT-REFUND',
      transaction_date: '2026-07-06',
      raw_description: 'REFUND-RZP*STREAMBOX',
      amount: '90071992547408.99',
      currency: 'INR',
      direction: 'CREDIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'EXACT',
      external_reference: 'EXACT-REFUND',
    },
    {
      transaction_id: 'TXN-EXACT-USD',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: '90071992547408.99',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'EXACT',
      external_reference: 'EXACT-USD',
    },
    {
      transaction_id: 'TXN-EXACT-USD-2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: '90071992547408.99',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'EXACT',
      external_reference: 'EXACT-USD-2',
    },
    {
      transaction_id: 'TXN-EXACT-USD-3',
      transaction_date: '2026-10-05',
      raw_description: 'RZP*STREAMBOX',
      amount: '90071992547408.99',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'EXACT',
      external_reference: 'EXACT-USD-3',
    },
  ];
  const parsed = parseAndNormaliseTransactions(rows);
  assert.equal(parsed.transactions[0].amountMinorExact, '9007199254740899');
  assert.equal(parsed.transactions[2].direction, 'CREDIT');
  const detected = detectCommitmentsAndAlerts(parsed.transactions, []);
  const inrCommitment = detected.commitments.find((commitment) => commitment.currency === 'INR');
  const usdCommitment = detected.commitments.find((commitment) => commitment.currency === 'USD');
  assert.ok(inrCommitment);
  assert.ok(usdCommitment);
  assert.equal(inrCommitment.totalHistoricalSpendExact, '18014398509481798');
  assert.equal(usdCommitment.totalHistoricalSpendExact, '27021597764222697');

  const inrTransactions = parsed.transactions.filter((transaction) => transaction.currency === 'INR');
  const inrPassport = generateCommitmentPassport({
    commitment: inrCommitment,
    transactions: inrTransactions,
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });
  assert.equal(inrPassport.sectionD_History.totalSpentExact, '18014398509481798');
  assert.equal(inrPassport.sectionD_History.averageDebitAmountExact, '₹90071992547408.99');
  const inrPack = generateEvidencePackData({
    commitment: inrCommitment,
    transactions: inrTransactions,
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });
  assert.ok(
    inrPack.transactions.some((entry) => entry.amountMinorExact === '9007199254740899')
  );
  assert.ok(generatePrintableEvidencePackHtml(inrPack).includes('90071992547408.99'));
});

test('Phase 4 Hardening: generateCommitmentPassport strictly upholds zero-fabrication rule for contacts and dates', () => {
  // Test with a synthetic commitment with no merchant catalogue entry
  const unknownCmt = {
    id: 'CMT-CUSTOM-APP',
    merchantName: 'Unknown Startup App',
    serviceName: 'Pro Tier Subscription',
    latestAmount: 299,
    typicalAmount: 299,
    expectedAmountMinor: 29900,
    annualisedAmount: 3588,
    monthlyEquivalent: 299,
    recurrenceType: 'MONTHLY' as const,
    paymentRail: 'UPI_AUTOPAY' as const,
    status: 'ACTIVE' as const,
    entityClass: 'FINANCIAL_COMMITMENT' as const,
    verificationStatus: 'USER_CONFIRMED' as const,
    confidenceScore: 85,
    confidenceLabel: 'HIGH' as const,
    confidenceBreakdown: {
      temporalScore: 30,
      amountRegularityScore: 30,
      descriptorConfidence: 15,
      mandateAlignmentScore: 10,
      totalScore: 85,
      supportingTransactionsCount: 2,
      relationshipConfidence: 'CONFIRMED_MERCHANT_RELATIONSHIP' as const,
    },
    connectedDescriptors: ['CUSTOM*APP'],
    supportingTransactionIds: ['TXN-C1', 'TXN-C2'],
    firstSeenDate: '2026-07-01',
    latestTransactionDate: '2026-08-01',
    nextExpectedDate: '2026-09-01',
    category: 'SOFTWARE_SAAS' as const,
    detectionExplanation: 'Custom detected commitment',
    isFinancialObligation: false,
    usageStatus: 'ACTIVE_IN_USE' as const,
    serviceLifecycleStatus: 'ACTIVE' as const,
    mandateLifecycleStatus: 'ACTIVE' as const,
  };

  const txns: any[] = [
    {
      id: 'TXN-C1',
      transactionDate: '2026-07-01',
      amount: 299,
      commitmentId: 'CMT-CUSTOM-APP',
      merchantName: 'Unknown Startup App',
      serviceName: 'Pro Tier Subscription',
      paymentRail: 'UPI_AUTOPAY',
      rawDescription: 'CUSTOM*APP',
      resolutionStatus: 'CANONICAL_MERCHANT_MATCHED',
    },
    {
      id: 'TXN-C2',
      transactionDate: '2026-08-01',
      amount: 299,
      commitmentId: 'CMT-CUSTOM-APP',
      merchantName: 'Unknown Startup App',
      serviceName: 'Pro Tier Subscription',
      paymentRail: 'UPI_AUTOPAY',
      rawDescription: 'CUSTOM*APP',
      resolutionStatus: 'CANONICAL_MERCHANT_MATCHED',
    },
  ];

  const passport = generateCommitmentPassport({
    commitment: unknownCmt as any,
    transactions: txns,
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });

  // Zero-fabrication assertions: must be null, never placeholder or fabricated strings
  assert.equal(
    passport.sectionA_Identity.supportContact,
    null,
    'Support contact must be null when unknown, never fabricated'
  );
  assert.equal(
    passport.sectionA_Identity.grievanceOfficer,
    null,
    'Grievance officer must be null when unknown, never fabricated'
  );
  assert.equal(
    passport.sectionA_Identity.website,
    null,
    'Service website must be null when unknown, never fabricated'
  );
  assert.equal(
    passport.sectionA_Identity.confirmedAt,
    null,
    'confirmedAt must be null when no genuine audit event exists, never fallback 2026-10-31T00:00:00Z'
  );
  assert.equal(passport.sectionB_Mandate.mandatePresent, false);
  assert.equal(passport.sectionC_Terms.termsPresent, false);
});

test('Regression: Inverted provenance fix ensures system inference is NEVER labeled USER_CONFIRMED', () => {
  const inferredCommitment: any = {
    id: 'CMT-INFERRED',
    serviceName: 'Inferred Cloud SaaS',
    merchantName: 'Unknown SaaS Corp',
    merchantId: 'M-UNKNOWN-SAAS',
    confidenceScore: 85,
    confidenceLabel: 'HIGH',
    connectedDescriptors: ['CLOUD*SAAS*MONTHLY'],
    processorName: null,
    recurrenceType: 'MONTHLY',
    typicalAmount: 999,
    verificationStatus: 'CONFIRMED', // System matching rule CONFIRMED, but NOT user action!
    relationshipStatus: 'SYSTEM_INFERRED',
    category: 'SOFTWARE_SAAS',
    paymentRail: 'CARD_EMANDATE',
  };

  const passport = generateCommitmentPassport({
    commitment: inferredCommitment,
    transactions: [],
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [], // No IDENTITY_MATCH_CONFIRMED audit event
  });

  // Must be SYSTEM_INFERRED (or CATALOGUE_MATCHED if in catalogue), strictly NEVER USER_CONFIRMED or generic CONFIRMED
  assert.notEqual(passport.sectionA_Identity.provenance, 'USER_CONFIRMED');
  assert.equal(passport.sectionA_Identity.provenance, 'SYSTEM_INFERRED');
});

test('Regression: Legal entity does NOT fall back to merchant display name when not in catalogue', () => {
  const commitmentWithoutLegalEntity: any = {
    id: 'CMT-UNLISTED',
    serviceName: 'StreamNow Subscription',
    merchantName: 'StreamNow Pvt Ltd',
    merchantId: 'M-UNLISTED-99',
    confidenceScore: 70,
    confidenceLabel: 'MEDIUM',
    connectedDescriptors: ['STREAMNOW*99'],
    processorName: null,
    recurrenceType: 'MONTHLY',
    typicalAmount: 499,
    category: 'ENTERTAINMENT_STREAMING',
    paymentRail: 'UPI_AUTOPAY',
  };

  const passport = generateCommitmentPassport({
    commitment: commitmentWithoutLegalEntity,
    transactions: [],
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });

  // M-UNLISTED-99 is not in catalogue, legalEntityName must be null, never 'StreamNow Pvt Ltd'
  assert.equal(passport.sectionA_Identity.legalEntityName, null);
});

test('Regression: parseStrictSignedAmount correctly parses negative amounts and accounting parentheses', () => {
  const res1 = parseStrictSignedAmount('-500');
  assert.ok(res1);
  assert.equal(res1.amount, 500);
  assert.equal(res1.isNegative, true);

  const res2 = parseStrictSignedAmount('(499.00)');
  assert.ok(res2);
  assert.equal(res2.amount, 499);
  assert.equal(res2.isNegative, true);

  const res3 = parseStrictSignedAmount('₹799.00');
  assert.ok(res3);
  assert.equal(res3.amount, 799);
  assert.equal(res3.isNegative, false);

  const res4 = parseStrictSignedAmount('-(₹1299)');
  assert.ok(res4);
  assert.equal(res4.amount, 1299);
  assert.equal(res4.isNegative, true);

  const resInvalid = parseStrictSignedAmount('invalid_amount');
  assert.equal(resInvalid, null);
});

test('Regression: Ambiguous row detection flags rows where both debit and credit contain positive values', () => {
  const ambiguousCsv = `Date,Description,Debit,Credit\n2026-10-15,Suspicious Dual Entry,500,500\n2026-10-16,Normal Debit,299,\n`;
  const preview = previewCsvMapping(ambiguousCsv, {
    dateColumn: 'Date',
    descriptionColumn: 'Description',
    amountMode: 'SEPARATE_COLUMNS',
    debitColumn: 'Debit',
    creditColumn: 'Credit',
    dateFormat: 'YYYY-MM-DD',
  });

  assert.equal(preview.totalRows, 2);
  assert.equal(preview.previewRows[0].isValid, false);
  assert.ok(preview.previewRows[0].rejectReason?.includes('Ambiguous row'));
  assert.equal(preview.previewRows[1].isValid, true);

  const parseResult = parseAllMappedCsvRows(ambiguousCsv, {
    dateColumn: 'Date',
    descriptionColumn: 'Description',
    amountMode: 'SEPARATE_COLUMNS',
    debitColumn: 'Debit',
    creditColumn: 'Credit',
    dateFormat: 'YYYY-MM-DD',
  });

  assert.equal(parseResult.validCount, 1);
  assert.equal(parseResult.rejectedCount, 1);
  assert.ok(parseResult.validationErrors[0].reason.includes('Ambiguous row'));
});

test('Regression: Mandate completeness synchronization marks status as INCOMPLETE if required startDate is missing', () => {
  const mandateMissingStartDate: any = {
    id: 'MND-TEST-NO-DATE',
    mandateReference: 'UMN-TEST-NODATE-01',
    commitmentId: 'CMT-TEST',
    merchantName: 'Test Merchant',
    paymentRail: 'UPI_AUTOPAY',
    maxAmountMinor: 100000,
    maxAmount: 1000,
    frequency: 'MONTHLY',
    startDate: null, // MISSING required start date!
    endDate: '2027-10-31',
    mandateStatus: 'ACTIVE',
  };

  const missing = getMissingMandateFields(mandateMissingStartDate);
  assert.ok(missing.includes('startDate'));

  const effectiveStatus = getEffectiveMandateStatus(mandateMissingStartDate);
  assert.equal(effectiveStatus, 'INCOMPLETE', 'Mandate missing required startDate must return INCOMPLETE');
});

test('Regression: Idempotent CSV repeat import skips exact duplicates based on canonical fingerprint', () => {
  const csvContent = `transaction_date,raw_description,amount,currency,direction\n2026-10-01,UPI/DR/NETFLIX/OCT,649,INR,DEBIT\n2026-10-02,UPI/DR/SPOTIFY/OCT,119,INR,DEBIT\n`;
  const parsed1 = parseCsvTextRFC4180(csvContent);
  assert.equal(parsed1.length, 2);

  const fp1 = computeCanonicalCsvRowFingerprint({
    accountAlias: parsed1[0].account_alias || 'PRIMARY-ACCOUNT',
    currency: 'INR',
    parsedDate: parsed1[0].transaction_date,
    direction: 'DEBIT',
    amount: 649,
    rawDescription: parsed1[0].raw_description,
    externalReference: parsed1[0].external_reference,
  });
  const fp2 = computeCanonicalCsvRowFingerprint({
    accountAlias: parsed1[1].account_alias || 'PRIMARY-ACCOUNT',
    currency: 'INR',
    parsedDate: parsed1[1].transaction_date,
    direction: 'DEBIT',
    amount: 119,
    rawDescription: parsed1[1].raw_description,
    externalReference: parsed1[1].external_reference,
  });

  const canonicalStore = new Set([fp1, fp2]);
  let duplicatesSkipped = 0;
  const newInserts: any[] = [];

  for (const row of parsed1) {
    const fp = computeCanonicalCsvRowFingerprint({
      accountAlias: row.account_alias || 'PRIMARY-ACCOUNT',
      currency: row.currency || 'INR',
      parsedDate: row.transaction_date,
      direction: row.direction || 'DEBIT',
      amount: Number(row.amount),
      rawDescription: row.raw_description,
      externalReference: row.external_reference,
    });
    if (canonicalStore.has(fp)) {
      duplicatesSkipped++;
    } else {
      newInserts.push(row);
    }
  }

  assert.equal(duplicatesSkipped, 2);
  assert.equal(newInserts.length, 0);
});

test('Financial Integrity: Commitment with typicalAmount but zero actual transactions never substitutes typicalAmount for actual debit amount', () => {
  const cmtNoTxns: any = {
    id: 'CMT-DORMANT-TEST',
    serviceName: 'NewsPlus Annual Digital',
    merchantName: 'NewsPlus Media Ltd',
    merchantId: 'M-NEWSPLUS',
    confidenceScore: 88,
    confidenceLabel: 'HIGH',
    connectedDescriptors: ['UPI/AUTOPAY/NEWSPLUS'],
    processorName: null,
    recurrenceType: 'YEARLY',
    typicalAmount: 1499,
    latestAmount: 1499,
    annualisedAmount: 1499,
    monthlyEquivalent: 125,
    totalHistoricalSpend: 0,
    lastPaymentDate: '2025-10-01',
    nextExpectedDate: '2026-10-01',
    status: 'ACTIVE',
    relationshipStatus: 'CONFIRMED',
    verificationStatus: 'CONFIRMED',
    category: 'OTT_STREAMING',
    paymentRail: 'UPI_AUTOPAY',
    mandateRef: 'UMN-NEWSPLUS-7712@okicici',
    supportingTransactionIds: [],
    priceChangeDetected: false,
    serviceLifecycleStatus: 'ACTIVE',
    mandateLifecycleStatus: 'ACTIVE',
  };

  const activeMandate: any = {
    id: 'MND-DORMANT-NEWSPLUS',
    mandateReference: 'UMN-NEWSPLUS-7712@okicici',
    commitmentId: 'CMT-DORMANT-TEST',
    merchantId: 'M-NEWSPLUS',
    merchantName: 'NewsPlus Media Ltd',
    paymentRail: 'UPI_AUTOPAY',
    maxAmountMinor: 149900,
    maxAmount: 1499,
    currency: 'INR',
    frequency: 'YEARLY',
    startDate: '2025-10-01',
    endDate: '2027-10-01',
    mandateStatus: 'ACTIVE',
    sourceType: 'DEMO_SEED',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const recFinding = reconcileCommitment({
    commitment: cmtNoTxns,
    transactions: [],
    mandate: activeMandate,
    serviceTerms: null,
    cancellationSession: null,
  });

  assert.equal(recFinding.status, 'MANDATE_WITHOUT_RECENT_TRANSACTION');
  assert.equal(recFinding.actualTransactionAmount, null, 'actualTransactionAmount must be null when no debit exists');
  assert.equal(recFinding.actualTransactionAmountMinor, null, 'actualTransactionAmountMinor must be null when no debit exists');

  const passport = generateCommitmentPassport({
    commitment: cmtNoTxns,
    transactions: [],
    mandate: activeMandate,
    serviceTerms: null,
    reconciliation: recFinding,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });

  assert.equal(
    passport.sectionE_Reconciliation.actualAmount,
    null,
    'Passport actualAmount must be null and NEVER fall back to typicalAmount (1499)'
  );
  assert.equal(
    (passport.sectionE_Reconciliation as any).actualDebitTransactionAmount,
    null,
    'Passport actualDebitTransactionAmount must be null when no transactions exist'
  );
  assert.equal((passport.sectionE_Reconciliation as any).typicalObservedAmount, 1499);
  assert.equal(passport.sectionB_FinancialPattern.amountRange.min, null);
  assert.equal(passport.sectionB_FinancialPattern.amountRange.max, null);
  assert.equal(passport.sectionD_History.latestDebitDate, null);

  const pack = generateEvidencePackData({
    commitment: cmtNoTxns,
    transactions: [],
    mandate: activeMandate,
    serviceTerms: null,
    reconciliation: recFinding,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });

  assert.equal(
    pack.reconciliation.actualDebitAmount,
    null,
    'EvidencePack actualDebitAmount must be null and NEVER fall back to typicalAmount (1499)'
  );
});

test('Provenance & Audit Matching: Unrelated free-text audit summary and unrelated imported transactions do not contaminate commitment provenance or Evidence Pack source notice', () => {
  const cmtStreambox: any = {
    id: 'CMT-STREAMBOX',
    serviceName: 'StreamBox Standard Monthly Plan',
    merchantName: 'StreamBox Media Pvt Ltd',
    merchantId: 'MERCH-STREAMBOX',
    confidenceScore: 95,
    confidenceLabel: 'HIGH',
    connectedDescriptors: ['RZP*STREAMBOX'],
    processorName: 'Razorpay',
    recurrenceType: 'MONTHLY',
    typicalAmount: 499,
    latestAmount: 499,
    annualisedAmount: 5988,
    monthlyEquivalent: 499,
    totalHistoricalSpend: 1497,
    lastPaymentDate: '2026-10-05',
    nextExpectedDate: '2026-11-05',
    status: 'ACTIVE',
    relationshipStatus: 'CONFIRMED',
    verificationStatus: 'CONFIRMED',
    category: 'OTT_STREAMING',
    paymentRail: 'UPI_AUTOPAY',
    mandateRef: 'UMN-STREAMBOX-01',
    supportingTransactionIds: ['TXN-SB-1'],
    priceChangeDetected: false,
    serviceLifecycleStatus: 'ACTIVE',
    mandateLifecycleStatus: 'ACTIVE',
  };

  const allTransactions: any[] = [
    {
      id: 'TXN-SB-1',
      transactionId: 'TXN-SB-1',
      transactionDate: '2026-10-05',
      rawDescription: 'RZP*STREAMBOX',
      normalisedDescription: 'RZP STREAMBOX',
      amount: 499,
      amountMinor: 49900,
      currency: 'INR',
      direction: 'DEBIT',
      paymentRail: 'UPI_AUTOPAY',
      accountAlias: 'HDFC-XX4821',
      commitmentId: 'CMT-STREAMBOX',
      sourceType: 'DEMO_SEED',
    },
    {
      id: 'TXN-OTHER-IMPORTED',
      transactionId: 'TXN-OTHER-IMPORTED',
      transactionDate: '2026-10-10',
      rawDescription: 'UPI/DR/MUSICFLOW',
      normalisedDescription: 'UPI DR MUSICFLOW',
      amount: 199,
      amountMinor: 19900,
      currency: 'INR',
      direction: 'DEBIT',
      paymentRail: 'UPI_AUTOPAY',
      accountAlias: 'ICICI-XX1904',
      commitmentId: 'CMT-MUSICFLOW',
      sourceType: 'CSV_MAPPED',
    },
  ];

  // Unrelated audit event whose summary happens to mention "StreamBox Media Pvt Ltd"
  const unrelatedAuditEvents: any[] = [
    {
      id: 'AUD-UNRELATED-1',
      commitmentId: 'CMT-MUSICFLOW',
      transactionId: 'TXN-OTHER-IMPORTED',
      timestamp: '2026-10-12T10:00:00Z',
      eventType: 'IDENTITY_MATCH_CONFIRMED',
      actionType: 'IDENTITY_MATCH_CONFIRMED',
      summary: 'User compared MusicFlow with StreamBox Media Pvt Ltd and confirmed MusicFlow.',
      actor: 'USER_ACTION',
    },
  ];

  const passport = generateCommitmentPassport({
    commitment: cmtStreambox,
    transactions: allTransactions,
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: unrelatedAuditEvents,
  });

  assert.equal(
    passport.sectionA_Identity.provenance,
    'CATALOGUE_MATCHED',
    'Catalogue-matched commitment without a structured user confirmation for its own ID must be CATALOGUE_MATCHED, never USER_CONFIRMED'
  );
  assert.equal(passport.verificationQuality?.isUserConfirmed, false);

  const pack = generateEvidencePackData({
    commitment: cmtStreambox,
    transactions: allTransactions,
    mandate: null,
    serviceTerms: null,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: unrelatedAuditEvents,
  });

  assert.ok(
    pack.header.syntheticNotice.startsWith('Synthetic Demonstration Dataset'),
    'Synthetic commitment must NOT be labeled Mixed Evidence Source due to an unrelated imported transaction'
  );
  assert.notEqual(pack.commitmentIdentity.resolutionStatus, 'USER_CONFIRMED');
});

test('Strict Calendar Date Validation & Null Event Timestamps: Impossible dates are rejected and missing event dates are never fabricated', () => {
  assert.equal(isValidCalendarDate(2026, 2, 31), false);
  assert.equal(isValidCalendarDate(2026, 2, 30), false);
  assert.equal(isValidCalendarDate(2026, 2, 29), false);
  assert.equal(isValidCalendarDate(2024, 2, 29), true);
  assert.equal(isValidCalendarDate(2026, 4, 31), false);

  assert.equal(normalizeDateString('31/02/2026'), null);
  assert.equal(normalizeDateString('30/02/2026'), null);
  assert.equal(normalizeDateString('29/02/2026'), null);
  assert.equal(normalizeDateString('2026-02-31'), null);
  assert.equal(normalizeDateString('31-04-2026'), null);
  assert.equal(normalizeDateString('29/02/2024'), '2024-02-29');

  assert.equal(parseCsvDate('31/02/2026', 'DD/MM/YYYY'), null);
  assert.equal(parseCsvDate('29/02/2026', 'DD/MM/YYYY'), null);
  assert.equal(parseCsvDate('29/02/2024', 'DD/MM/YYYY'), '2024-02-29');

  // Review Queue with missing evaluatedAt/createdAt must set eventDate=null and createdAt=null, never today's date
  const queue = buildReviewQueue({
    investigations: [
      {
        id: 'INV-TEST-1',
        transactionId: 'TXN-99',
        originalDescriptor: 'PAYU*UNKNOWN*99',
        amount: 299,
        amountMinor: 29900,
        transactionDate: '2026-10-01',
        currency: 'INR',
        paymentRail: 'UPI_ONE_TIME',
        accountAlias: 'HDFC-XX4821',
        possibleProcessor: 'PayU',
        currentAssessment: {
          merchantIdentity: null,
          serviceName: null,
          resolutionStatus: 'UNRESOLVED',
          matchingMethod: 'PROCESSOR_ONLY_UNRESOLVED',
          explanation: 'Processor only',
        },
        candidateMerchants: [
          { candidateMerchantId: 'M1', candidateMerchantName: 'A', candidateServiceName: 'A', candidateType: 'PROCESSOR_RELATIONSHIP', matchReason: '', evidenceSource: '', confidenceScore: 30, confidenceExplanation: '' },
          { candidateMerchantId: 'M2', candidateMerchantName: 'B', candidateServiceName: 'B', candidateType: 'PROCESSOR_RELATIONSHIP', matchReason: '', evidenceSource: '', confidenceScore: 30, confidenceExplanation: '' },
          { candidateMerchantId: 'M3', candidateMerchantName: 'C', candidateServiceName: 'C', candidateType: 'PROCESSOR_RELATIONSHIP', matchReason: '', evidenceSource: '', confidenceScore: 30, confidenceExplanation: '' },
        ],
        status: 'OPEN',
        userAssessment: null,
        userNotes: '',
        evidenceIds: ['TXN-99'],
        recommendedNextAction: 'Check receipt',
        createdAt: '',
        updatedAt: '2026-10-01T00:00:00Z',
        resolutionSource: null,
        resolvedMerchantId: null,
      },
    ],
    reconciliationFindings: [
      {
        id: 'REC-NO-DATE',
        commitmentId: 'CMT-1',
        merchantName: 'Test Merch',
        serviceName: 'Test Service',
        status: 'AMOUNT_DISCREPANCY',
        expectedServiceAmountMinor: 49900,
        expectedServiceAmount: 499,
        actualTransactionAmountMinor: 79900,
        actualTransactionAmount: 799,
        mandateMaxAmountMinor: 99900,
        mandateMaxAmount: 999,
        discrepancyAmountMinor: 30000,
        discrepancyAmount: 300,
        discrepancyPercent: 60.12,
        withinMandateLimit: true,
        latestTransactionId: 'TXN-1',
        mandateReference: 'UMN-1',
        serviceDocumentId: 'DOC-1',
        explanation: 'Discrepancy',
        epistemicCaveat: 'Caveat',
        evidenceRecordIds: ['TXN-1', 'DOC-1'],
        evaluatedAt: '', // Missing timestamp
      },
    ],
    alerts: [],
    commitments: [],
  });

  const invItem = queue.find((i) => i.id === 'RQ-INV-INV-TEST-1')!;
  assert.equal(
    invItem.supportingEvidenceCount,
    1,
    'supportingEvidenceCount must equal evidenceIds.length (1), never candidateMerchants.length (3)'
  );
  assert.equal(invItem.createdAt, null);

  const recItem = queue.find((i) => i.id === 'RQ-REC-REC-NO-DATE')!;
  assert.equal(recItem.eventDate, null, 'Missing evaluatedAt must yield eventDate=null, not today');
  assert.equal(recItem.createdAt, null, 'Missing evaluatedAt must yield createdAt=null, not today');
});

test('CSV Import At Scale (55 Rows): Preserves distinct bank references, accounts, currencies, and matches preview vs apply counts', () => {
  const lines: string[] = [
    'Date,Narration,Debit,Credit,Account,Currency,Reference',
  ];
  // 1-45: 45 distinct daily/monthly transactions across two accounts
  for (let i = 1; i <= 45; i++) {
    const day = String(((i - 1) % 28) + 1).padStart(2, '0');
    const month = i <= 28 ? '09' : '10';
    const acct = i % 2 === 0 ? 'HDFC-XX4821' : 'ICICI-XX1904';
    lines.push(`${day}/${month}/2026,"RZP*STREAMBOX SUB #${i}",499.00,,${acct},INR,UTR-2026-${String(i).padStart(3, '0')}`);
  }
  // 46 & 47: Same date, same narration, same amount, same account, but DIFFERENT bank references (UTR-A vs UTR-B) -> BOTH must be kept!
  lines.push(`15/10/2026,"UPI/DR/CLOUDNOTES/PRO",299.00,,HDFC-XX4821,INR,UTR-SAME-DAY-A`);
  lines.push(`15/10/2026,"UPI/DR/CLOUDNOTES/PRO",299.00,,HDFC-XX4821,INR,UTR-SAME-DAY-B`);
  // 48 & 49: Same date, same narration, same amount, empty reference, but DIFFERENT accounts -> BOTH must be kept!
  lines.push(`16/10/2026,"UPI/DR/MUSICFLOW",199.00,,HDFC-XX4821,INR,`);
  lines.push(`16/10/2026,"UPI/DR/MUSICFLOW",199.00,,ICICI-XX1904,INR,`);
  // 50 & 51: Same date, same narration, same amount, same account, but DIFFERENT currencies (INR vs USD) -> BOTH must be kept!
  lines.push(`17/10/2026,"CLOUD*SAAS*GLOBAL",20.00,,HDFC-XX4821,INR,`);
  lines.push(`17/10/2026,"CLOUD*SAAS*GLOBAL",20.00,,HDFC-XX4821,USD,`);
  // 52: Valid Credit refund row -> kept as CREDIT
  lines.push(`18/10/2026,"REFUND RZP*STREAMBOX",,499.00,HDFC-XX4821,INR,UTR-REFUND-01`);
  // 53: Exact duplicate of row 46 (same account, currency, date, amount, narration, and reference UTR-SAME-DAY-A) -> flagged as duplicate!
  lines.push(`15/10/2026,"UPI/DR/CLOUDNOTES/PRO",299.00,,HDFC-XX4821,INR,UTR-SAME-DAY-A`);
  // 54: Impossible calendar date 31/02/2026 -> rejected!
  lines.push(`31/02/2026,"UPI/DR/INVALIDDATE",499.00,,HDFC-XX4821,INR,UTR-BAD-DATE`);
  // 55: Ambiguous row with both debit and credit -> rejected!
  lines.push(`19/10/2026,"AMBIGUOUS BOTH DR CR",100.00,100.00,HDFC-XX4821,INR,UTR-AMBIG`);

  const csv55 = lines.join('\n');
  const config: any = {
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    amountMode: 'SEPARATE_DEBIT_CREDIT',
    debitColumn: 'Debit',
     debitAmountColumn: 'Debit',
    creditColumn: 'Credit',
    creditAmountColumn: 'Credit',
    accountColumn: 'Account',
    currencyColumn: 'Currency',
    referenceColumn: 'Reference',
    dateFormat: 'DD/MM/YYYY',
  };

  const preview = previewCsvMapping(csv55, config);
  const parsed = parseAllMappedCsvRows(csv55, config, true);

  assert.equal(preview.totalRows, 55);
  assert.equal(parsed.totalRows, 55);
  assert.equal(preview.validRowsCount, 52, '52 valid rows (45 + 2 diff refs + 2 diff accts + 2 diff currencies + 1 credit)');
  assert.equal(parsed.validCount, 52, 'parseAllMappedCsvRows validCount must match previewCsvMapping validRowsCount (52)');
  assert.equal(preview.duplicateRowCount, 1, '1 exact duplicate row');
  assert.equal(parsed.duplicateCount, 1, '1 exact duplicate row');
  assert.equal(preview.rejectedRowCount, 2, '2 rejected rows (31/02/2026 and ambiguous dual debit/credit)');
  assert.equal(parsed.rejectedCount, 2, '2 rejected rows');

  // Verify empty reference rows do NOT get fabricated MAP-... external_reference
  const emptyRefRow = parsed.validRows.find((r) => r.raw_description === 'UPI/DR/MUSICFLOW');
  assert.ok(emptyRefRow);
  assert.equal(emptyRefRow.external_reference, '', 'Missing external reference must remain empty string, never fabricated MAP-...');
});

test('Gate A (Merchant Identity & Confirmation Security): Confirmations are strictly transaction-scoped and never contaminate unrelated transactions sharing the same rawDescription', () => {
  const twoSharedDescriptorRows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-SHARED-A',
      transaction_date: '2026-10-05',
      raw_description: 'PAYU*UNRESOLVED*9901',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_ONE_TIME',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UTR-SHARED-A',
    },
    {
      transaction_id: 'TXN-SHARED-B',
      transaction_date: '2026-10-06',
      raw_description: 'PAYU*UNRESOLVED*9901',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_ONE_TIME',
      account_alias: 'ICICI-XX1904',
      external_reference: 'UTR-SHARED-B',
    },
  ];

  // Confirm only TXN-SHARED-A; also verify a legacy descriptor-keyed entry is ignored
  const overrides: Record<string, string> = {
    'TXN-SHARED-A': 'MERCH-STREAMBOX',
    'PAYU*UNRESOLVED*9901': 'MERCH-STREAMBOX', // Legacy descriptor key must NOT affect TXN-SHARED-B
  };

  const parsed = parseAndNormaliseTransactions(twoSharedDescriptorRows, 'BATCH-TEST-1', 'DEMO_SEED', overrides);
  const txnA = parsed.transactions.find((t) => t.id === 'TXN-SHARED-A')!;
  const txnB = parsed.transactions.find((t) => t.id === 'TXN-SHARED-B')!;

  assert.equal(txnA.resolutionStatus, 'USER_CONFIRMED');
  assert.equal(txnA.merchantId, 'MERCH-STREAMBOX');
  assert.equal(txnA.matchingMethod, 'USER_CONFIRMED_MATCH');

  assert.equal(
    txnB.resolutionStatus,
    'UNRESOLVED',
    'Unrelated transaction TXN-SHARED-B with identical rawDescription must remain UNRESOLVED'
  );
  assert.equal(txnB.merchantId, null);
});

test('Gate C (Currency & Minor-Unit Precision): Multi-currency minor units, formatting, commitment grouping, and cross-currency reconciliation mismatch', () => {
  // 1. Minor unit precision across 0-decimal (JPY), 2-decimal (INR, USD, EUR), and 3-decimal (KWD) currencies
  assert.equal(getCurrencyDecimals('INR'), 2);
  assert.equal(getCurrencyDecimals('USD'), 2);
  assert.equal(getCurrencyDecimals('EUR'), 2);
  assert.equal(getCurrencyDecimals('JPY'), 0);
  assert.equal(getCurrencyDecimals('KWD'), 3);
  assert.equal(isValidCurrencyCode('INR'), true);
  assert.equal(isValidCurrencyCode('JPY'), true);
  assert.equal(isValidCurrencyCode('KWD'), true);
  assert.equal(isValidCurrencyCode('FAKE'), false);
  assert.equal(normalizeCurrencyCode('usd'), 'USD');

  assert.equal(toMinorUnits(499.5, 'INR'), 49950);
  assert.equal(fromMinorUnits(49950, 'INR'), 499.5);
  assert.equal(toMinorUnits(1500, 'JPY'), 1500);
  assert.equal(fromMinorUnits(1500, 'JPY'), 1500);
  assert.equal(toMinorUnits(12.345, 'KWD'), 12345);
  assert.equal(fromMinorUnits(12345, 'KWD'), 12.345);

  assert.ok(formatCurrency(1500, 'JPY').includes('1,500'));
  assert.ok(formatMinorCurrency(1500, 'JPY').includes('1,500'));
  assert.ok(formatCurrency(19.99, 'USD').includes('19.99'));

  // 2. Multi-currency recurring transactions for the same merchant are grouped into separate commitments per (merchantId, currency)
  const multiCurrencyRows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-MC-INR-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UTR-MC-INR-1',
    },
    {
      transaction_id: 'TXN-MC-INR-2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UTR-MC-INR-2',
    },
    {
      transaction_id: 'TXN-MC-USD-1',
      transaction_date: '2026-08-10',
      raw_description: 'RZP*STREAMBOX',
      amount: 9.99,
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'HDFC-INTL-CC',
      external_reference: 'UTR-MC-USD-1',
    },
    {
      transaction_id: 'TXN-MC-USD-2',
      transaction_date: '2026-09-10',
      raw_description: 'RZP*STREAMBOX',
      amount: 9.99,
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'HDFC-INTL-CC',
      external_reference: 'UTR-MC-USD-2',
    },
  ];

  const txns = parseAndNormaliseTransactions(multiCurrencyRows).transactions;
  const { commitments } = detectCommitmentsAndAlerts(txns, []);
  const inrCmt = commitments.find((c) => c.currency === 'INR');
  const usdCmt = commitments.find((c) => c.currency === 'USD');
  assert.ok(inrCmt, 'Must create separate INR commitment');
  assert.ok(usdCmt, 'Must create separate USD commitment');
  assert.notEqual(inrCmt.id, usdCmt.id);
  assert.equal(inrCmt.typicalAmount, 499);
  assert.equal(usdCmt.typicalAmount, 9.99);

  // 3. Cross-currency three-way reconciliation mismatch (INR transaction vs USD mandate/terms -> CONFLICTING_EVIDENCE / CURRENCY_MISMATCH)
  const usdMandate: any = {
    id: 'MND-USD-TEST',
    mandateReference: 'UMN-USD-01',
    commitmentId: inrCmt.id,
    merchantId: inrCmt.merchantId,
    merchantName: inrCmt.merchantName,
    paymentRail: 'UPI_AUTOPAY',
    maxAmountMinor: 49900,
    maxAmount: 499,
    currency: 'USD', // Mismatched currency against INR transaction!
    frequency: 'MONTHLY',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    mandateStatus: 'ACTIVE',
    sourceType: 'USER_IMPORTED',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const mismatchFinding = reconcileCommitment({
    commitment: inrCmt,
    transactions: txns.filter((t) => t.commitmentId === inrCmt.id),
    mandate: usdMandate,
    serviceTerms: null,
    cancellationSession: null,
  });

  assert.equal(mismatchFinding.status, 'CONFLICTING_EVIDENCE');
  assert.equal(mismatchFinding.discrepancyReason, 'CURRENCY_MISMATCH');
  assert.equal(mismatchFinding.withinMandateLimit, null);
  assert.ok(mismatchFinding.explanation.includes('Currency mismatch detected'));
});

test('Gate F (Explicit Source Provenance): Mandate and ServiceTerms with -01 or DOC-SEED- IDs use explicit sourceType and default unknown legacy records to UNKNOWN', () => {
  const baseCmt: any = {
    id: 'CMT-PROV-TEST',
    serviceName: 'CloudVault Pro',
    merchantName: 'CloudVault Inc',
    merchantId: 'M-CLOUDVAULT',
    confidenceScore: 90,
    confidenceLabel: 'HIGH',
    connectedDescriptors: ['CLOUDVAULT*PRO'],
    processorName: null,
    recurrenceType: 'MONTHLY',
    typicalAmount: 599,
    latestAmount: 599,
    annualisedAmount: 7188,
    monthlyEquivalent: 599,
    totalHistoricalSpend: 599,
    lastPaymentDate: '2026-10-01',
    nextExpectedDate: '2026-11-01',
    status: 'ACTIVE',
    relationshipStatus: 'CONFIRMED',
    verificationStatus: 'CONFIRMED',
    category: 'CLOUD_PRODUCTIVITY',
    paymentRail: 'UPI_AUTOPAY',
    supportingTransactionIds: [],
    serviceLifecycleStatus: 'ACTIVE',
    mandateLifecycleStatus: 'ACTIVE',
  };

  // User-imported mandate whose ID ends in -01 must NOT be misclassified as DEMO_SEED
  const userMandateEndingIn01: any = {
    id: 'MND-USER-CUSTOM-01',
    mandateReference: 'UMN-USER-01',
    commitmentId: 'CMT-PROV-TEST',
    merchantId: 'M-CLOUDVAULT',
    merchantName: 'CloudVault Inc',
    paymentRail: 'UPI_AUTOPAY',
    maxAmountMinor: 59900,
    maxAmount: 599,
    currency: 'INR',
    frequency: 'MONTHLY',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    mandateStatus: 'ACTIVE',
    sourceType: 'USER_IMPORTED',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  // User-entered service terms whose ID starts with DOC-SEED- must NOT be misclassified as DEMO_SEED
  const userTermsStartingWithDocSeed: any = {
    id: 'DOC-SEED-USER-CUSTOM-01',
    commitmentId: 'CMT-PROV-TEST',
    merchantId: 'M-CLOUDVAULT',
    merchantName: 'CloudVault Inc',
    serviceName: 'CloudVault Pro',
    documentType: 'MANUAL_TERMS',
    documentLabel: 'User Entered Terms',
    expectedAmountMinor: 59900,
    expectedAmount: 599,
    currency: 'INR',
    billingFrequency: 'MONTHLY',
    effectiveDate: '2026-01-01',
    rawSourceText: 'Rs. 599 monthly',
    extractedNotes: '',
    extractionConfidence: 'EXACT',
    userVerified: true,
    verificationStatus: 'USER_VERIFIED',
    sourceType: 'USER_ENTERED',
    createdAt: '2026-10-01T00:00:00Z',
  };

  const passportUser = generateCommitmentPassport({
    commitment: baseCmt,
    transactions: [],
    mandate: userMandateEndingIn01,
    serviceTerms: userTermsStartingWithDocSeed,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });

  assert.equal(passportUser.sectionB_Mandate.sourceProvenance, 'USER_IMPORTED');
  assert.equal(passportUser.sectionC_Terms.sourceProvenance, 'USER_ENTERED');

  // Legacy records missing sourceType must default to UNKNOWN, never USER_IMPORTED or DEMO_SEED
  const legacyMandateNoSource: any = { ...userMandateEndingIn01, sourceType: undefined };
  const legacyTermsNoSource: any = { ...userTermsStartingWithDocSeed, sourceType: undefined };

  const passportLegacy = generateCommitmentPassport({
    commitment: baseCmt,
    transactions: [],
    mandate: legacyMandateNoSource,
    serviceTerms: legacyTermsNoSource,
    reconciliation: null,
    alerts: [],
    casebookEntries: [],
    auditEvents: [],
  });

  assert.equal(passportLegacy.sectionB_Mandate.sourceProvenance, 'UNKNOWN');
  assert.equal(passportLegacy.sectionC_Terms.sourceProvenance, 'UNKNOWN');
});

test('Gates A, B, D, E Server Integration: Authoritative merchant confirmation, rollback-safe serialized persistence, null evidence dates, and review queue / investigation state machines', async () => {
  const tmpStorePath = path.join(os.tmpdir(), `debitlens-test-store-${Date.now()}.json`);
  process.env.DEBITLENS_SKIP_LISTEN = '1';
  process.env.DEBITLENS_STORE_PATH = tmpStorePath;

  const serverMod = await import('../../server');
  const {
    app,
    loadSeedData,
    setSimulatePersistenceFailureForTesting,
    setSimulateGraphSyncFailureForTesting,
    getGraphSyncMetadata,
  } = serverMod;

  loadSeedData();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function api(method: string, route: string, body?: any) {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, body: json };
  }

  try {
    // 1. Gate A: Legacy route parity & authoritative merchant confirmation validation
    // Reject descriptor-only confirmation lacking transactionId/investigationId
    const missingCtx = await api('POST', '/api/merchants/MERCH-STREAMBOX/confirm', {
      rawDescription: 'PAYU*UNKNOWN*9912',
    });
    assert.equal(missingCtx.status, 400);
    assert.ok(String(missingCtx.body.error).includes('scoped to a specific transactionId or investigationId'));

    // Fetch investigations to find an open investigation case
    const invListRes = await api('GET', '/api/investigations');
    assert.equal(invListRes.status, 200);
    const openInv = invListRes.body.find((i: any) => i.status !== 'CLOSED' && i.candidateMerchants.length > 0);
    assert.ok(openInv, 'Expected at least one open investigation case in seed dataset');

    // Reject arbitrary catalogue merchant not in candidateMerchants
    const nonCandidateMerch = MERCHANT_CATALOGUE.find(
      (m) =>
        !openInv.candidateMerchants.some(
          (c: any) => (c.merchantId || c.candidateMerchantId) === m.id
        )
    )!;
    assert.ok(nonCandidateMerch, 'Expected a catalogue merchant not in candidateMerchants');
    const invalidCandidate = await api('POST', `/api/investigations/${openInv.id}/confirm-merchant`, {
      transactionId: openInv.transactionId,
      merchantId: nonCandidateMerch.id,
    });
    assert.equal(invalidCandidate.status, 400);
    assert.ok(String(invalidCandidate.body.error).includes('not an eligible candidate'));

    // Reject processor-only candidate if present
    const procCandidate = openInv.candidateMerchants.find(
      (c: any) => c.candidateType === 'PROCESSOR_RELATIONSHIP' || c.isProcessorOnly === true
    );
    if (procCandidate) {
      const procRes = await api('POST', `/api/investigations/${openInv.id}/confirm-merchant`, {
        transactionId: openInv.transactionId,
        merchantId: procCandidate.candidateMerchantId,
      });
      assert.equal(procRes.status, 400);
      assert.ok(String(procRes.body.error).includes('Processor-only'));
    }

    // 2. Gate B: Simulated persistence failure rolls back nested state and audit events completely
    const stateBeforeFail = await api('GET', '/api/state');
    const auditCountBefore = stateBeforeFail.body.auditEvents.length;

    setSimulatePersistenceFailureForTesting(true);
    const failedAction = await api('POST', `/api/investigations/${openInv.id}/action`, {
      actionType: 'MARKED_UNDER_REVIEW',
      notes: 'Should roll back on disk write failure',
    });
    setSimulatePersistenceFailureForTesting(false);

    assert.equal(failedAction.status, 500);
    assert.ok(String(failedAction.body.error).includes('Failed to persist application state'));

    const stateAfterFail = await api('GET', '/api/state');
    assert.equal(
      stateAfterFail.body.auditEvents.length,
      auditCountBefore,
      'Audit events must be rolled back completely when disk write fails'
    );
    const invAfterFail = (await api('GET', '/api/investigations')).body.find((i: any) => i.id === openInv.id);
    assert.equal(
      invAfterFail.status,
      openInv.status,
      'Nested investigation status must be rolled back completely when disk write fails'
    );

    // 3. Gate B: Simulated Neo4j graph sync failure preserves canonical JSON state while marking graph sync FAILED
    const underReviewRes = await api('POST', `/api/investigations/${openInv.id}/action`, {
      actionType: 'MARKED_UNDER_REVIEW',
      notes: 'Testing investigation state update',
    });
    assert.equal(underReviewRes.status, 200);
    assert.equal(underReviewRes.body.status, 'UNDER_REVIEW');

    // Trigger a graph-syncing mutation (commitment confirmation) with simulated graph sync failure
    setSimulateGraphSyncFailureForTesting(true);
    const confirmCmtRes = await api('POST', '/api/commitments/CMT-READCLOUD/confirm', {});
    setSimulateGraphSyncFailureForTesting(false);

    assert.equal(confirmCmtRes.status, 200);
    assert.equal(confirmCmtRes.body.verificationStatus, 'USER_CONFIRMED');
    const graphMeta = getGraphSyncMetadata();
    assert.equal(graphMeta.status, 'FAILED');
    assert.ok(graphMeta.lastError?.includes('Simulated Neo4j graph projection failure'));

    const rqList = await api('GET', '/api/review-queue');
    const openRq = rqList.body.find((i: any) => i.status === 'OPEN');
    assert.ok(openRq, 'Expected an OPEN review queue item');

    const toInReview = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'IN_REVIEW',
    });
    assert.equal(toInReview.status, 200);

    // 4. Gate E: Review Queue 404 for unknown ID & strict state transition matrix
    const unknownRq = await api('POST', '/api/review-queue/RQ-NON-EXISTENT-9999/status', {
      status: 'IN_REVIEW',
    });
    assert.equal(unknownRq.status, 404);
    assert.ok(String(unknownRq.body.error).includes('not found'));

    // Reject RESOLVED without resolutionReason
    const resolveNoReason = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'RESOLVED',
    });
    assert.equal(resolveNoReason.status, 400);
    assert.ok(String(resolveNoReason.body.error).includes('resolutionReason'));

    // Valid transition IN_REVIEW -> RESOLVED with reason
    const toResolved = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'RESOLVED',
      resolutionReason: 'Verified with invoice and bank statement',
    });
    assert.equal(toResolved.status, 200);

    // Reject duplicate RESOLVED -> RESOLVED and invalid RESOLVED -> IN_REVIEW
    const dupResolved = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'RESOLVED',
      resolutionReason: 'Duplicate resolve attempt',
    });
    assert.equal(dupResolved.status, 400);
    assert.ok(String(dupResolved.body.error).includes('Duplicate transition'));

    const invalidJump = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'IN_REVIEW',
    });
    assert.equal(invalidJump.status, 400);
    assert.ok(String(invalidJump.body.error).includes('Invalid state transition'));

    // Valid reopen RESOLVED -> OPEN with resolutionReason
    const reopenRq = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'OPEN',
      resolutionReason: 'New billing cycle discrepancy observed',
    });
    assert.equal(reopenRq.status, 200);

    // 5. Gate D: Cancellation evidence date validation & null fallback (never '2026-10-30') + lifecycle separation
    const sessionId = 'SESS-CMT-FITCLUB';

    // Reject invalid calendar date 31/02/2026
    const badDateEv = await api('POST', `/api/cancellation/sessions/${sessionId}/evidence`, {
      evidenceType: 'SERVICE_CONFIRMATION',
      referenceNumber: 'TKT-BAD-DATE',
      description: 'Test invalid date',
      evidenceDate: '31/02/2026',
    });
    assert.equal(badDateEv.status, 400);
    assert.ok(String(badDateEv.body.error).includes('Invalid evidenceDate'));

    // Omitted evidenceDate persists null, never '2026-10-30'
    const nullDateEv = await api('POST', `/api/cancellation/sessions/${sessionId}/evidence`, {
      evidenceType: 'SERVICE_CONFIRMATION',
      referenceNumber: 'TKT-FITCLUB-901',
      description: 'Submitted cancellation ticket via web portal',
    });
    assert.equal(nullDateEv.status, 200);
    assert.equal(nullDateEv.body.evidence.evidenceDate, null, 'Omitted evidenceDate must be null, never 2026-10-30');
    assert.equal(
      nullDateEv.body.evidence.evidenceRecordLifecycle,
      'EVIDENCE_REFERENCE_RECORDED',
      'Reference-only evidence must be EVIDENCE_REFERENCE_RECORDED, never DOCUMENT_UPLOADED'
    );

    // Verify Commitment Passport separates evidenceRecordLifecycle from serviceActionLifecycle
    const passportRes = await api('GET', '/api/commitments/CMT-FITCLUB/passport');
    assert.equal(passportRes.status, 200);
    const fitclubPassport = passportRes.body;
    assert.equal(
      fitclubPassport.sectionF_Cancellation.evidenceRecordLifecycle,
      'EVIDENCE_REFERENCE_RECORDED',
      'Reference-only evidence must be EVIDENCE_REFERENCE_RECORDED, never DOCUMENT_UPLOADED'
    );
    assert.ok(
      fitclubPassport.sectionG_Evidence.evidenceRecords.some(
        (r: any) => r.sourceReference === 'TKT-FITCLUB-901' && r.date === null
      ),
      'Session evidence with null date must appear in Commitment Passport sectionG_Evidence with date: null'
    );

    // Verify Evidence Pack also reflects the session evidence and retains null date
    const packRes = await api('GET', '/api/commitments/CMT-FITCLUB/evidence-pack');
    assert.equal(packRes.status, 200);
    assert.equal(
      packRes.body.cancellationEvidence.evidenceRecordLifecycle,
      'EVIDENCE_REFERENCE_RECORDED'
    );
    assert.ok(
      packRes.body.cancellationEvidence.confirmationReferences.includes('TKT-FITCLUB-901'),
      'Evidence Pack confirmationReferences must include session evidence reference TKT-FITCLUB-901'
    );

    // Verify Casebook POST /api/commitments/:id/evidence with omitted date also propagates to Passport & Evidence Pack with null date and does not contaminate unrelated commitments
    const casebookEvRes = await api('POST', '/api/commitments/CMT-CLOUDNOTES/evidence', {
      category: 'SERVICE_CANCELLATION_EVENT',
      title: 'CloudNotes Web Cancellation Ref',
      description: 'Submitted cancellation in CloudNotes billing settings',
      sourceReference: 'CN-REF-2026-7788',
    });
    assert.equal(casebookEvRes.status, 200);

    const cnPassportRes = await api('GET', '/api/commitments/CMT-CLOUDNOTES/passport');
    assert.equal(cnPassportRes.status, 200);
    assert.equal(
      cnPassportRes.body.sectionF_Cancellation.evidenceRecordLifecycle,
      'EVIDENCE_REFERENCE_RECORDED'
    );
    const cnEvRec = cnPassportRes.body.sectionG_Evidence.evidenceRecords.find(
      (r: any) => r.sourceReference === 'CN-REF-2026-7788'
    );
    assert.ok(cnEvRec, 'Casebook evidence must appear in CloudNotes Commitment Passport');
    assert.equal(cnEvRec.date, null, 'Omitted evidenceDate on POST /api/commitments/:id/evidence must remain null');
    assert.notEqual(
      cnPassportRes.body.sectionF_Cancellation.evidenceRecordLifecycle,
      'DOCUMENT_UPLOADED'
    );

    const cnPackRes = await api('GET', '/api/commitments/CMT-CLOUDNOTES/evidence-pack');
    assert.equal(cnPackRes.status, 200);
    assert.equal(
      cnPackRes.body.cancellationEvidence.evidenceRecordLifecycle,
      'EVIDENCE_REFERENCE_RECORDED'
    );
    assert.ok(
      cnPackRes.body.cancellationEvidence.confirmationReferences.includes('CN-REF-2026-7788')
    );

    // Ensure unrelated commitment CMT-MUSICFLOW is not contaminated by CMT-FITCLUB or CMT-CLOUDNOTES evidence
    const mfPassportRes = await api('GET', '/api/commitments/CMT-MUSICFLOW/passport');
    assert.equal(mfPassportRes.status, 200);
    assert.equal(
      mfPassportRes.body.sectionG_Evidence.evidenceRecords.some(
        (r: any) =>
          r.sourceReference === 'TKT-FITCLUB-901' || r.sourceReference === 'CN-REF-2026-7788'
      ),
      false,
      'Unrelated commitment passport must never contain another commitment evidence record'
    );

    // 6. Gate D: Review Queue requires non-empty resolutionReason for DISMISSED as well as RESOLVED and reopening
    const rqAfterReopen = (await api('GET', '/api/review-queue')).body.find(
      (i: any) => i.id === openRq.id
    );
    assert.equal(rqAfterReopen.status, 'OPEN');

    const dismissEmptyReason = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'DISMISSED',
      resolutionReason: '   ',
    });
    assert.equal(
      dismissEmptyReason.status,
      400,
      'Dismissing a review queue item with whitespace-only resolutionReason must return HTTP 400'
    );

    const dismissValidReason = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'DISMISSED',
      resolutionReason: 'Confirmed one-time charge with cardholder',
    });
    assert.equal(dismissValidReason.status, 200);

    const reopenWithoutReason = await api('POST', `/api/review-queue/${openRq.id}/status`, {
      status: 'OPEN',
    });
    assert.equal(
      reopenWithoutReason.status,
      400,
      'Reopening a DISMISSED review queue item without resolutionReason must return HTTP 400'
    );

    // 7. Gate A: Reporting service cancellation or mandate revocation without a date keeps serviceCancelledAt/paymentAuthorisationRevokedAt null and monitoring reports EFFECTIVE_DATE_UNAVAILABLE
    const srvNoDateRes = await api('PATCH', '/api/cancellations/CMT-MUSICFLOW/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_REPORTED_BY_USER',
      referenceNumber: 'MF-NO-DATE-REF',
      notes: 'Reported cancelled without knowing exact date',
    });
    assert.equal(srvNoDateRes.status, 200);
    assert.equal(srvNoDateRes.body.session.serviceCancelledAt, null);
    assert.equal(srvNoDateRes.body.session.paymentAuthorisationRevokedAt, null);

    const monNoDate = await api('GET', '/api/cancellations/CMT-MUSICFLOW/monitoring');
    assert.equal(monNoDate.status, 200);
    assert.equal(monNoDate.body.serviceCancelledAt, null);
    assert.equal(monNoDate.body.monitoringStatus, 'EFFECTIVE_DATE_UNAVAILABLE');
    assert.ok(
      String(monNoDate.body.monitoringExplanation).includes('unavailable'),
      'Monitoring explanation must state that the effective cancellation/revocation date is unavailable'
    );

    // 8. Gate B: Multi-currency import separates USD from INR in /api/dashboard/summary and /api/dashboard/monthly-trend
    const summaryBeforeUsd = await api('GET', '/api/dashboard/summary');
    const inrMonthlyBefore = summaryBeforeUsd.body.monthlyRecurringSpend;
    const inrAnnualBefore = summaryBeforeUsd.body.annualCommitmentTotal;

    const usdCsv = [
      'Date,Narration,Debit,Credit,Account,Currency,Reference',
      '2026-08-12,RZP*STREAMBOX,19.99,,HDFC-INTL-CC,USD,UTR-USD-AUG',
      '2026-09-12,RZP*STREAMBOX,19.99,,HDFC-INTL-CC,USD,UTR-USD-SEP',
      '2026-10-12,RZP*STREAMBOX,19.99,,HDFC-INTL-CC,USD,UTR-USD-OCT',
    ].join('\n');

    const importUsdRes = await api('POST', '/api/import/transactions/apply-mapped', {
      csvContent: usdCsv,
      config: {
        dateColumn: 'Date',
        descriptionColumn: 'Narration',
        amountMode: 'SEPARATE_DEBIT_CREDIT',
        debitColumn: 'Debit',
        debitAmountColumn: 'Debit',
        creditColumn: 'Credit',
        creditAmountColumn: 'Credit',
        accountColumn: 'Account',
        currencyColumn: 'Currency',
        referenceColumn: 'Reference',
        dateFormat: 'YYYY-MM-DD',
      },
    });
    assert.equal(importUsdRes.status, 200);
    assert.equal(importUsdRes.body.importedRowsCount, 3);

    const summaryAfterUsd = await api('GET', '/api/dashboard/summary');
    assert.equal(
      summaryAfterUsd.body.monthlyRecurringSpend,
      inrMonthlyBefore,
      'Importing USD recurring transactions must NEVER add USD amounts into INR monthlyRecurringSpend'
    );
    assert.equal(
      summaryAfterUsd.body.annualCommitmentTotal,
      inrAnnualBefore,
      'Importing USD recurring transactions must NEVER add USD amounts into INR annualCommitmentTotal'
    );
    assert.equal(summaryAfterUsd.body.isMultiCurrency, true);
    assert.ok(summaryAfterUsd.body.totalsByCurrency.INR);
    assert.ok(summaryAfterUsd.body.totalsByCurrency.USD);
    assert.equal(summaryAfterUsd.body.totalsByCurrency.USD.monthlyRecurringSpend, 19.99);
    assert.equal(summaryAfterUsd.body.totalsByCurrency.USD.monthlyRecurringSpendExact, '1999');
    assert.equal(summaryAfterUsd.body.totalsByCurrency.INR.monthlyRecurringSpendExact !== undefined, true);

    const trendInr = await api('GET', '/api/dashboard/monthly-trend?currency=INR');
    const trendUsd = await api('GET', '/api/dashboard/monthly-trend?currency=USD');
    assert.equal(trendInr.status, 200);
    assert.equal(trendUsd.status, 200);
    const octUsd = trendUsd.body.find((p: any) => p.month === '2026-10');
    assert.equal(octUsd.currency, 'USD');
    assert.equal(octUsd.subscriptions, 19.99);
    assert.equal(octUsd.currencyPrecision, 2);
    assert.equal(octUsd.subscriptionsMinorExact, '1999');
    assert.equal(octUsd.totalMinorExact, '1999');

    // 7. Evidence-attached status validation & separate Layer A/B monitoring + guardrail currency check
    const srvEvidMissing = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
    });
    assert.equal(
      srvEvidMissing.status,
      400,
      'CANCELLATION_EVIDENCE_ATTACHED without SERVICE_CONFIRMATION evidence must return 400'
    );

    const mndEvidMissing = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/mandate-status', {
      mandateLifecycleStatus: 'REVOCATION_EVIDENCE_ATTACHED',
    });
    assert.equal(
      mndEvidMissing.status,
      400,
      'REVOCATION_EVIDENCE_ATTACHED without MANDATE_REVOCATION evidence must return 400'
    );

    const srvEvidValid = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
      referenceNumber: 'TKT-SB-2026-1001',
      effectiveDate: '2026-10-10',
    });
    assert.equal(srvEvidValid.status, 200);
    assert.equal(srvEvidValid.body.session.serviceCancelledAt, '2026-10-10');

    const monAfterLayerA = await api('GET', '/api/cancellations/CMT-STREAMBOX/monitoring');
    assert.equal(monAfterLayerA.status, 200);
    assert.equal(monAfterLayerA.body.serviceMonitoringEligible, true);
    assert.equal(monAfterLayerA.body.mandateMonitoringEligible, false);
    assert.equal(
      monAfterLayerA.body.monitoringStatus,
      'SERVICE_MONITORING_ONLY_MANDATE_DATE_UNAVAILABLE'
    );

    const badGuardrailCurr = await api('PATCH', '/api/guardrails/CMT-STREAMBOX', {
      currency: 'EUR',
      maxExpectedAmountMinor: 49900,
    });
    assert.equal(
      badGuardrailCurr.status,
      400,
      'Cross-currency guardrail update on an INR commitment must return 400'
    );

    const validGuardrailCurr = await api('PATCH', '/api/guardrails/CMT-STREAMBOX', {
      currency: 'INR',
      maxExpectedAmountMinor: 55000,
      preDebitReminderDays: 5,
    });
    assert.equal(validGuardrailCurr.status, 200);
    assert.equal(validGuardrailCurr.body.currency, 'INR');
    assert.equal(validGuardrailCurr.body.provenance, 'USER_CONFIGURED');
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(tmpStorePath)) {
      fs.unlinkSync(tmpStorePath);
    }
  }
});

test('Gate A Regression: Completing local checklist steps on a commitment with Nov/Dec 2026 transactions never fabricates 2026-10-30 and never triggers false post-cancellation alerts', () => {
  const rowsWithNov2026: RawCsvRow[] = [
    {
      transaction_id: 'TXN-NOV-1',
      transaction_date: '2026-09-15',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UTR-NOV-1',
    },
    {
      transaction_id: 'TXN-NOV-2',
      transaction_date: '2026-10-15',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UTR-NOV-2',
    },
    {
      transaction_id: 'TXN-NOV-3',
      transaction_date: '2026-11-15',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'UTR-NOV-3',
    },
  ];

  const txns = parseAndNormaliseTransactions(rowsWithNov2026).transactions;
  const { commitments } = detectCommitmentsAndAlerts(txns, []);
  const streambox = commitments[0];
  assert.ok(streambox);

  // User completes ALL Layer A and Layer B checklist steps locally without providing any external cancellation/revocation date
  const checklistOnlyOverrides = {
    [streambox.id]: {
      completedStepIds: [
        `STEP-${streambox.id}-A1`,
        `STEP-${streambox.id}-A2`,
        `STEP-${streambox.id}-B1`,
        `STEP-${streambox.id}-B2`,
      ],
    },
  };

  const checklistResult = detectCommitmentsAndAlerts(txns, [], checklistOnlyOverrides);
  const session = checklistResult.sessions[0];
  assert.ok(session);

  // 1. Neither serviceCancelledAt nor paymentAuthorisationRevokedAt may be set to '2026-10-30' or any fabricated date
  assert.equal(
    session.serviceCancelledAt,
    null,
    'Checklist step completion alone must NEVER set serviceCancelledAt'
  );
  assert.equal(
    session.paymentAuthorisationRevokedAt,
    null,
    'Checklist step completion alone must NEVER set paymentAuthorisationRevokedAt'
  );
  for (const step of session.steps) {
    assert.notEqual(
      step.completedAt,
      '2026-10-30',
      'Checklist step completedAt must never default to fabricated 2026-10-30'
    );
  }

  // 2. The Nov 2026 transaction must NOT be flagged as a post-cancellation debit
  assert.equal(
    session.postCancellationTransactionIds.length,
    0,
    'Checklist completion without a valid cancellation/revocation date must NEVER flag Nov 2026+ transactions as post-cancellation debits'
  );
  assert.equal(
    checklistResult.alerts.some((a) => a.alertType === 'POST_CANCELLATION_DEBIT'),
    false,
    'Checklist completion without a valid cancellation/revocation date must NEVER create a POST_CANCELLATION_DEBIT alert'
  );

  // 3. Conversely, when a real effective cancellation date (2026-11-01) IS recorded before the 2026-11-15 debit, post-cancellation detection fires accurately
  const datedCancelOverrides = {
    [streambox.id]: {
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED' as const,
      serviceCancelledAtOverride: '2026-11-01',
    },
  };
  const datedResult = detectCommitmentsAndAlerts(txns, [], datedCancelOverrides);
  const datedSession = datedResult.sessions[0];
  assert.equal(datedSession.serviceCancelledAt, '2026-11-01');
  assert.deepEqual(datedSession.postCancellationTransactionIds, ['TXN-NOV-3']);
  assert.equal(
    datedResult.alerts.some((a) => a.alertType === 'POST_CANCELLATION_DEBIT'),
    true,
    'Valid cancellation date prior to subsequent debit must trigger POST_CANCELLATION_DEBIT alert'
  );
});

test('Gate B Regression: Null/undefined monetary amounts never render as ₹0.00, genuine zero formats in its currency, and unsupported currencies never display ₹', () => {
  // 1. Null, undefined, and NaN amounts return 'Amount unavailable', never ₹0.00
  assert.equal(formatCurrency(null, 'INR'), 'Amount unavailable');
  assert.equal(formatCurrency(undefined, 'INR'), 'Amount unavailable');
  assert.equal(formatCurrency(Number.NaN, 'INR'), 'Amount unavailable');
  assert.equal(formatMinorCurrency(null, 'INR'), 'Amount unavailable');
  assert.equal(formatMinorCurrency(undefined, 'INR'), 'Amount unavailable');
  assert.equal(formatMinorCurrency(Number.NaN, 'INR'), 'Amount unavailable');

  // 2. Genuine numeric zero still formats as a valid zero monetary value in the requested currency
  assert.ok(formatCurrency(0, 'INR') === '₹0' || formatCurrency(0, 'INR') === '₹0.00');
  assert.ok(formatMinorCurrency(0, 'INR') === '₹0' || formatMinorCurrency(0, 'INR') === '₹0.00');
  assert.ok(formatCurrency(0, 'USD').includes('$0'));
  assert.equal(formatCurrency(0, 'USD').includes('₹'), false);

  // 3. Unsupported or invalid currency codes are rejected by normalizeCurrencyCode and never fall back to ₹
  assert.equal(normalizeCurrencyCode('XYZ'), '');
  assert.equal(normalizeCurrencyCode('INVALID'), '');
  assert.equal(normalizeCurrencyCode(''), '');

  const unsupportedMajor = formatCurrency(499, 'XYZ');
  const unsupportedMinor = formatMinorCurrency(49900, 'XYZ');
  assert.equal(
    unsupportedMajor.includes('₹'),
    false,
    'Unsupported currency code XYZ must NEVER be rendered with an Indian Rupee (₹) symbol'
  );
  assert.equal(
    unsupportedMinor.includes('₹'),
    false,
    'Unsupported minor currency code XYZ must NEVER be rendered with an Indian Rupee (₹) symbol'
  );
  assert.ok(unsupportedMajor.includes('XYZ'));
  assert.ok(unsupportedMajor.includes('Unsupported currency'));

  // 4. Omitted/undefined currency on formatCurrency / formatMinorCurrency returns explicit unavailable marker, never silently assuming INR or dividing by 100
  assert.equal(formatCurrency(499), '499 (Currency unavailable)');
  assert.equal(formatCurrency(499, undefined), '499 (Currency unavailable)');
  assert.equal(formatCurrency(499, null), '499 (Currency unavailable)');
  assert.equal(formatMinorCurrency(49900), '49900 minor units (Currency unavailable)');
  assert.equal(formatMinorCurrency(49900, undefined), '49900 minor units (Currency unavailable)');
  assert.equal(formatMinorCurrency(49900, null), '49900 minor units (Currency unavailable)');
});

test('Section 2 Currency Integrity: Multi-currency USD/EUR preservation across Alerts, Casebook, Graph, Bhasha & Investigation', () => {
  const usdRows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-USD-1',
      transaction_date: '2026-08-10',
      raw_description: 'RZP*STREAMBOX',
      amount: '$19.99',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'AMEX-XX9001',
      external_reference: 'REF-USD-1',
    },
    {
      transaction_id: 'TXN-USD-2',
      transaction_date: '2026-09-10',
      raw_description: 'RZP*STREAMBOX',
      amount: '$19.99',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'AMEX-XX9001',
      external_reference: 'REF-USD-2',
    },
    {
      transaction_id: 'TXN-USD-3',
      transaction_date: '2026-10-10',
      raw_description: 'RZP*STREAMBOX',
      amount: '$24.99',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'AMEX-XX9001',
      external_reference: 'REF-USD-3',
    },
    {
      transaction_id: 'TXN-USD-UNREC',
      transaction_date: '2026-10-12',
      raw_description: 'STRIPE*UNKNOWN-SAAS-9912',
      amount: '€49.00',
      currency: 'EUR',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'AMEX-XX9001',
      external_reference: 'REF-EUR-1',
    },
  ];

  const { transactions } = parseAndNormaliseTransactions(usdRows);
  assert.equal(transactions.length, 4);
  assert.equal(transactions[0].currency, 'USD');
  assert.equal(transactions[0].amount, 19.99);
  assert.equal(transactions[3].currency, 'EUR');
  assert.equal(transactions[3].amount, 49);

  const { commitments, alerts, playbooks, sessions } = detectCommitmentsAndAlerts(
    transactions,
    [],
    {},
    '2026-10-30'
  );
  const usdCommitment = commitments.find((c) => c.currency === 'USD');
  assert.ok(usdCommitment, 'Must detect USD recurring commitment');
  assert.equal(usdCommitment.currency, 'USD');

  // Verify alerts preserve USD currency and never contain ₹
  const usdAlerts = alerts.filter((a) => a.commitmentId === usdCommitment.id);
  assert.ok(usdAlerts.length > 0, 'Must emit alerts for USD commitment');
  for (const alert of usdAlerts) {
    assert.equal(alert.currency, 'USD');
    assert.equal(alert.title.includes('₹'), false, `Alert title must not contain ₹ for USD: ${alert.title}`);
    assert.equal(alert.description.includes('₹'), false, `Alert description must not contain ₹ for USD: ${alert.description}`);
    assert.equal(alert.detectedValue.includes('₹'), false);
    const bhashaAlert = buildGroundedAlertExplanation(alert, 'hi-IN');
    assert.equal(
      bhashaAlert.localizedExplanation.includes('₹'),
      false,
      'Multilingual alert explanation must not contain ₹ for USD'
    );
  }

  // Verify Evidence Casebook preserves USD across CB-MND-*, CB-DOC-*, and CB-TXN-*
  const usdMandate = {
    id: 'MND-USD-1',
    mandateReference: 'AMEX-MANDATE-USD-1',
    commitmentId: usdCommitment.id,
    merchantId: usdCommitment.merchantId,
    merchantName: usdCommitment.merchantName,
    paymentRail: usdCommitment.paymentRail,
    currency: 'USD',
    maxAmountMinor: 3000,
    maxAmount: 30,
    frequency: 'MONTHLY' as const,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    mandateStatus: 'ACTIVE' as const,
    sourceType: 'USER_IMPORTED' as const,
    updatedAt: '2026-08-01T00:00:00Z',
  };
  const usdTerms = extractServiceTermsFromText({
    commitmentId: usdCommitment.id,
    merchantName: usdCommitment.merchantName,
    serviceName: usdCommitment.serviceName,
    documentSource: 'PASTED_INVOICE_TEXT',
    rawText: 'Subscription Invoice #USD-101. Billing Cycle: Monthly. Plan Price: $19.99 USD.',
    currency: 'USD',
  });
  usdTerms.expectedAmount = 19.99;
  usdTerms.expectedAmountMinor = 1999;
  usdTerms.currency = 'USD';

  const casebook = buildCommitmentEvidenceCasebook({
    commitment: usdCommitment,
    transactions,
    mandate: usdMandate,
    serviceTerms: usdTerms,
    reconciliation: null,
    alerts: usdAlerts,
    session: null,
  });
  const mndEntry = casebook.entries.find((e) => e.id.startsWith('CB-MND-'));
  const docEntry = casebook.entries.find((e) => e.id.startsWith('CB-DOC-'));
  const txnEntry = casebook.entries.find((e) => e.id.startsWith('CB-TXN-'));
  assert.ok(mndEntry && docEntry && txnEntry);
  assert.equal(mndEntry.currency, 'USD');
  assert.equal(docEntry.currency, 'USD');
  assert.equal(txnEntry.currency, 'USD');
  assert.equal(mndEntry.description.includes('₹'), false, `CB-MND description must not use ₹: ${mndEntry.description}`);
  assert.equal(docEntry.description.includes('₹'), false, `CB-DOC description must not use ₹: ${docEntry.description}`);
  assert.equal(txnEntry.description.includes('₹'), false, `CB-TXN description must not use ₹: ${txnEntry.description}`);
  assert.ok(mndEntry.description.includes('$30'));
  assert.ok(docEntry.description.includes('$19.99'));

  // Verify Commitment Graph nodes and supportingTransactionRecords preserve USD
  const graph = buildCommitmentGraphResponse({
    focusCommitmentId: usdCommitment.id,
    commitments,
    transactions,
    notifications: [],
    alerts: usdAlerts,
    playbooks,
    sessions,
    mandates: [usdMandate],
    serviceTerms: [usdTerms],
    reconciliationFindings: [],
  });
  for (const rec of graph.pathExplanation.supportingTransactionRecords) {
    assert.equal(rec.currency, 'USD');
  }
  const cmtNode = graph.nodes.find((n) => n.id === usdCommitment.id);
  assert.ok(cmtNode);
  assert.equal(cmtNode.subtitle.includes('₹'), false, `Commitment node subtitle must not use ₹ for USD: ${cmtNode.subtitle}`);

  // Verify Bhasha merchant explanation and Unrecognized Debit investigation checklist preserve USD / EUR
  const usdBhasha = buildGroundedMerchantExplanation(
    transactions[0],
    'hi-IN',
    undefined,
    'LOCAL_FALLBACK',
    'LOCAL_FALLBACK',
    undefined,
    usdCommitment
  );
  assert.equal(
    usdBhasha.localizedExplanation.whatIsIdentified.includes('₹'),
    false,
    `Bhasha whatIsIdentified must not use ₹ for USD: ${usdBhasha.localizedExplanation.whatIsIdentified}`
  );
  assert.equal(usdBhasha.englishSource.whatIsIdentified.includes('₹'), false);

  const eurCase = buildUnrecognizedDebitCase({
    transaction: transactions[3],
    allTransactions: transactions,
  });
  for (const item of eurCase.guidanceChecklist) {
    assert.equal(item.includes('₹'), false, `Investigation checklist must not use ₹ for EUR: ${item}`);
    assert.ok(item.includes('€49') || !item.includes('49'));
  }
});

test('Section 3 & 4 Regression: Runtime date provider, honest playbook verification status, and engine-level strict calendar validation', () => {
  // 1. Runtime date helper returns valid strict YYYY-MM-DD
  const runtimeToday = getRuntimeDateISO();
  assert.equal(isStrictValidIsoDate(runtimeToday), true);

  // 2. Impossible calendar dates are rejected by isStrictValidIsoDate and inside buildPlaybookAndSessionForCommitment
  for (const invalidDate of ['2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00']) {
    assert.equal(isStrictValidIsoDate(invalidDate), false, `${invalidDate} must be rejected by isStrictValidIsoDate`);
  }

  const { transactions } = parseAndNormaliseTransactions(SAMPLE_ROWS);
  const { commitments } = detectCommitmentsAndAlerts(transactions, SAMPLE_NOTIFICATIONS, {}, '2026-10-30');
  const streambox = commitments.find((c) => c.id === 'CMT-STREAMBOX')!;
  const merchant = MERCHANT_CATALOGUE.find((m) => m.id === streambox.merchantId)!;

  const { playbook, session } = buildPlaybookAndSessionForCommitment({
    commitmentId: streambox.id,
    sessionId: `SESS-${streambox.id}`,
    merchant,
    paymentRail: streambox.paymentRail,
    override: {
      serviceLifecycleStatus: 'CANCELLATION_REPORTED_BY_USER',
      serviceCancelledAtOverride: '2026-02-31', // Impossible date must be rejected by engine
      mandateLifecycleStatus: 'REVOCATION_REPORTED_BY_USER',
      mandateRevokedAtOverride: '2026-04-31', // Impossible date must be rejected by engine
    },
    sortedTransactions: transactions.filter((t) => t.merchantId === streambox.merchantId),
  });

  assert.equal(
    playbook.lastVerifiedDate,
    'Reference catalogue (Not independently verified)',
    'Playbook must state honest reference catalogue status instead of hardcoded 2026-10-31'
  );
  assert.equal(
    session.serviceCancelledAt,
    null,
    'Impossible calendar date 2026-02-31 must be rejected inside buildPlaybookAndSessionForCommitment'
  );
  assert.equal(
    session.paymentAuthorisationRevokedAt,
    null,
    'Impossible calendar date 2026-04-31 must be rejected inside buildPlaybookAndSessionForCommitment'
  );
  assert.equal(
    session.lastReviewedAt,
    null,
    'Unreviewed session must have lastReviewedAt === null rather than fabricated 2026-10-31'
  );
});

test('Section 5.5 Lifecycle Matrix: Request vs completion dates, evidenceDate non-aliasing, refund exclusion, and idempotency', () => {
  const rows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-LC-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-LC-1',
    },
    {
      transaction_id: 'TXN-LC-2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-LC-2',
    },
    {
      transaction_id: 'TXN-LC-3',
      transaction_date: '2026-10-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-LC-3',
    },
    {
      transaction_id: 'TXN-LC-REFUND',
      transaction_date: '2026-10-12',
      raw_description: 'RZP*STREAMBOX REFUND',
      amount: 499,
      currency: 'INR',
      direction: 'CREDIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-LC-4',
    },
    {
      transaction_id: 'TXN-LC-POST-DEBIT',
      transaction_date: '2026-11-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-LC-5',
    },
  ];

  const { transactions } = parseAndNormaliseTransactions(rows);
  const { commitments } = detectCommitmentsAndAlerts(transactions.slice(0, 3), [], {}, '2026-10-30');
  const cmt = commitments[0];
  const merchant = MERCHANT_CATALOGUE.find((m) => m.id === cmt.merchantId)!;

  // Case 1 & 2: CANCELLATION_REQUESTED or evidenceDate alone must NOT set serviceCancelledAt or paymentAuthorisationRevokedAt
  const requestedOnly = buildPlaybookAndSessionForCommitment({
    commitmentId: cmt.id,
    sessionId: `SESS-${cmt.id}`,
    merchant,
    paymentRail: cmt.paymentRail,
    override: {
      serviceLifecycleStatus: 'CANCELLATION_REQUESTED',
      mandateLifecycleStatus: 'REVOCATION_REQUESTED',
      evidenceRecords: [
        {
          id: 'EV-REQ-1',
          cancellationSessionId: `SESS-${cmt.id}`,
          evidenceType: 'SERVICE_CONFIRMATION',
          referenceNumber: 'TICKET-REQ-001',
          evidenceDate: '2026-10-06',
          effectiveDate: null,
          description: 'Submitted cancellation request ticket',
          verificationStatus: 'EVIDENCE_ATTACHED',
          createdAt: '2026-10-06T10:00:00Z',
        },
        {
          id: 'EV-REQ-2',
          cancellationSessionId: `SESS-${cmt.id}`,
          evidenceType: 'MANDATE_REVOCATION',
          referenceNumber: 'UMN-REQ-001',
          evidenceDate: '2026-10-06',
          effectiveDate: null,
          description: 'Submitted revocation request',
          verificationStatus: 'EVIDENCE_ATTACHED',
          createdAt: '2026-10-06T10:00:00Z',
        },
      ],
    },
    sortedTransactions: transactions,
  });

  assert.equal(
    requestedOnly.session.serviceCancelledAt,
    null,
    'CANCELLATION_REQUESTED or evidenceDate alone must NEVER set serviceCancelledAt'
  );
  assert.equal(
    requestedOnly.session.paymentAuthorisationRevokedAt,
    null,
    'REVOCATION_REQUESTED or evidenceDate alone must NEVER set paymentAuthorisationRevokedAt'
  );
  assert.equal(
    requestedOnly.session.postCancellationTransactionIds.length,
    0,
    'Without an effective cancellation/revocation date, no post-cancellation debits may be flagged'
  );

  // Case 3, 4 & 5: Completion status with effective cancellation date on 2026-10-10:
  // - TXN-LC-REFUND (CREDIT on 2026-10-12) must NOT be flagged in postCancellationTransactionIds
  // - TXN-LC-POST-DEBIT (DEBIT on 2026-11-05) MUST be flagged in postCancellationTransactionIds
  const completedCancel = buildPlaybookAndSessionForCommitment({
    commitmentId: cmt.id,
    sessionId: `SESS-${cmt.id}`,
    merchant,
    paymentRail: cmt.paymentRail,
    override: {
      serviceLifecycleStatus: 'CANCELLATION_REPORTED_BY_USER',
      serviceCancelledAtOverride: '2026-10-10',
      mandateLifecycleStatus: 'REVOCATION_REPORTED_BY_USER',
      mandateRevokedAtOverride: '2026-10-10',
    },
    sortedTransactions: transactions,
  });

  assert.equal(completedCancel.session.serviceCancelledAt, '2026-10-10');
  assert.equal(completedCancel.session.paymentAuthorisationRevokedAt, '2026-10-10');
  assert.equal(
    completedCancel.session.postCancellationTransactionIds.includes('TXN-LC-REFUND'),
    false,
    'CREDIT (refund/reversal) transaction after cancellation must NEVER be flagged as a post-cancellation debit'
  );
  assert.deepEqual(
    completedCancel.session.postCancellationTransactionIds,
    ['TXN-LC-POST-DEBIT'],
    'Subsequent DEBIT transaction after cancellation must be flagged in postCancellationTransactionIds'
  );
});

test('Quality-Closure Gate: strict nullable minor-unit helpers, negative credit parsing, non-INR reconciliation pool/mandates, multi-currency guardrails, and separate Layer A/B monitoring', async () => {
  // 1. Strict nullable minor-unit helpers never conflate missing amount or unsupported currency with zero/INR
  assert.equal(getCurrencyDecimalsOrNull('INR'), 2);
  assert.equal(getCurrencyDecimalsOrNull('JPY'), 0);
  assert.equal(getCurrencyDecimalsOrNull('KWD'), 3);
  assert.equal(getCurrencyDecimalsOrNull('XYZ'), null);
  assert.equal(getCurrencyDecimalsOrNull(null), null);
  assert.equal(toMinorUnitsStrict(null, 'INR'), null);
  assert.equal(toMinorUnitsStrict(undefined, 'USD'), null);
  assert.equal(toMinorUnitsStrict(100, 'XYZ'), null);
  assert.equal(toMinorUnitsStrict(1500, 'JPY'), 1500);
  assert.equal(fromMinorUnitsStrict(null, 'INR'), null);
  assert.equal(fromMinorUnitsStrict(1000, 'XYZ'), null);
  assert.equal(fromMinorUnitsStrict(1500, 'JPY'), 1500);

  // 2. parseAndNormaliseTransactions converts negative amounts (-499 or (499.00)) to CREDIT and rejects impossible rollover dates (2026-02-31)
  const parsedBatch = parseAndNormaliseTransactions([
    {
      transaction_id: 'TXN-NEG-01',
      transaction_date: '2026-08-15',
      raw_description: 'RZP*STREAMBOX',
      amount: '-499.00',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'USD-CARD-01',
      external_reference: 'REF-NEG-01',
    },
    {
      transaction_id: 'TXN-BAD-DATE',
      transaction_date: '2026-02-31',
      raw_description: 'RZP*STREAMBOX',
      amount: '499.00',
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'USD-CARD-01',
      external_reference: 'REF-BAD-DATE',
    },
  ]);
  assert.equal(parsedBatch.transactions.length, 1);
  assert.equal(parsedBatch.transactions[0].id, 'TXN-NEG-01');
  assert.equal(parsedBatch.transactions[0].amount, 499);
  assert.equal(parsedBatch.transactions[0].direction, 'CREDIT');
  assert.equal(parsedBatch.transactions[0].currency, 'USD');
  assert.equal(parsedBatch.invalidRows.length, 1);
  assert.equal(parsedBatch.invalidRows[0].rowNumber, 2);

  // 3. Non-INR MANDATE_WITHOUT_RECENT_TRANSACTION and REC-UNRESOLVED-POOL preserve their actual currency
  const { transactions: jpyUnresTxns } = parseAndNormaliseTransactions([
    {
      transaction_id: 'TXN-JPY-UNRES',
      transaction_date: '2026-09-10',
      raw_description: 'RAZORPAY*998877-TOKYO',
      amount: 1500,
      currency: 'JPY',
      direction: 'DEBIT',
      payment_rail: 'CARD_ONE_TIME',
      account_alias: 'JPY-CARD',
      external_reference: 'REF-JPY-01',
    },
  ]);
  const usdDormantMandate = {
    id: 'MND-USD-DORMANT',
    mandateReference: 'SI-USD-DORMANT-01',
    commitmentId: null,
    merchantId: null,
    merchantName: 'CloudSaaS Global Inc.',
    paymentRail: 'CARD_EMANDATE' as const,
    maxAmountMinor: 2999,
    maxAmount: 29.99,
    currency: 'USD',
    frequency: 'MONTHLY' as const,
    startDate: '2026-01-01',
    endDate: null,
    mandateStatus: 'ACTIVE' as const,
    sourceType: 'USER_IMPORTED' as const,
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const findings = runFullReconciliation({
    commitments: [],
    transactions: jpyUnresTxns,
    mandates: [usdDormantMandate],
    serviceTerms: [],
    sessions: [],
  });
  const mndFinding = findings.find((f) => f.id === 'REC-MND-USD-DORMANT');
  assert.ok(mndFinding, 'Expected dormant USD mandate finding');
  assert.equal(mndFinding.currency, 'USD');
  assert.equal(mndFinding.explanation.includes('₹'), false, 'USD mandate explanation must not use ₹');
  assert.ok(mndFinding.explanation.includes('$29.99'), 'USD mandate explanation must format $29.99');

  const unresFinding = findings.find((f) => f.id === 'REC-UNRESOLVED-POOL');
  assert.ok(unresFinding, 'Expected unresolved pool finding');
  assert.equal(unresFinding.currency, 'JPY');
  assert.equal(unresFinding.actualTransactionAmountMinor, 1500, 'JPY has 0 minor decimals so 1500 JPY = 1500 minor units');

  // 4. Multi-currency guardrails preserve commitment currency and minor-unit precision
  const { transactions: usdStreamTxns } = parseAndNormaliseTransactions([
    {
      transaction_id: 'TXN-USD-S1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 19.99,
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'USD-CARD',
      external_reference: 'REF-USD-S1',
    },
    {
      transaction_id: 'TXN-USD-S2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 19.99,
      currency: 'USD',
      direction: 'DEBIT',
      payment_rail: 'CARD_EMANDATE',
      account_alias: 'USD-CARD',
      external_reference: 'REF-USD-S2',
    },
  ]);
  const { commitments: usdCommitments } = detectCommitmentsAndAlerts(usdStreamTxns, [], {}, '2026-10-30');
  const seedGr = buildInitialSeedGuardrails(usdCommitments);
  assert.equal(seedGr.length, 1);
  assert.equal(seedGr[0].currency, 'USD');
  assert.equal(seedGr[0].maxExpectedAmountMinor, 1999);
  assert.equal(seedGr[0].provenance, 'SYSTEM_DERIVED');

  // 5. Separate Layer A (serviceCancelledAt) and Layer B (paymentAuthorisationRevokedAt) monitoring
  const { transactions: splitCancelTxns } = parseAndNormaliseTransactions([
    {
      transaction_id: 'TXN-SC-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-SC-1',
    },
    {
      transaction_id: 'TXN-SC-2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-SC-2',
    },
    {
      transaction_id: 'TXN-SC-BETWEEN',
      transaction_date: '2026-10-12',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-SC-BETWEEN',
    },
    {
      transaction_id: 'TXN-SC-AFTER-BOTH',
      transaction_date: '2026-10-25',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: 'INR',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'HDFC-XX4821',
      external_reference: 'REF-SC-AFTER-BOTH',
    },
  ]);
  const streamMerchant = MERCHANT_CATALOGUE[0];
  const splitSession = buildPlaybookAndSessionForCommitment({
    commitmentId: 'CMT-STREAMBOX',
    sessionId: 'SESS-CMT-STREAMBOX',
    merchant: streamMerchant,
    paymentRail: 'UPI_AUTOPAY',
    override: {
      serviceLifecycleStatus: 'CANCELLATION_REPORTED_BY_USER',
      serviceCancelledAtOverride: '2026-10-10',
      mandateLifecycleStatus: 'REVOCATION_REPORTED_BY_USER',
      mandateRevokedAtOverride: '2026-10-20',
    },
    sortedTransactions: splitCancelTxns,
  });
  assert.equal(splitSession.session.serviceMonitoringEligible, true);
  assert.equal(splitSession.session.mandateMonitoringEligible, true);
  assert.deepEqual(splitSession.session.postServiceCancellationTransactionIds, [
    'TXN-SC-BETWEEN',
    'TXN-SC-AFTER-BOTH',
  ]);
  assert.deepEqual(splitSession.session.postMandateRevocationTransactionIds, [
    'TXN-SC-AFTER-BOTH',
  ]);
});

// ============================================================================
// PART 16: FINAL 10/10 QUALITY CLOSURE TESTS
// ============================================================================

test('Part 2 & 3 Closure: Currency Provenance, Missing Currency -> UNKNOWN (Never Silent INR), and Strict Minor-Unit Edge Cases', () => {
  // 1. Missing currency without account default or user mapping -> UNKNOWN with UNKNOWN_SOURCE provenance
  const missingCurrResolved = resolveTransactionCurrency({
    rawTransactionCurrency: '',
    accountAlias: 'UNMAPPED-ACCT',
  });
  assert.equal(missingCurrResolved.currency, UNKNOWN_CURRENCY);
  assert.equal(missingCurrResolved.currencyProvenance, 'UNKNOWN_SOURCE');
  assert.equal(missingCurrResolved.currencyStatus, 'UNKNOWN');
  assert.equal(missingCurrResolved.decimals, null);

  // 2. Confirmed account default -> CONFIRMED_ACCOUNT_DEFAULT
  const acctDefaultResolved = resolveTransactionCurrency({
    rawTransactionCurrency: '',
    accountAlias: 'HDFC-XX4821',
    confirmedAccountCurrencies: { 'HDFC-XX4821': 'INR' },
  });
  assert.equal(acctDefaultResolved.currency, 'INR');
  assert.equal(acctDefaultResolved.currencyProvenance, 'CONFIRMED_ACCOUNT_DEFAULT');
  assert.equal(acctDefaultResolved.currencyStatus, 'SUPPORTED');

  // 3. Explicit user-selected mapping currency -> USER_SELECTED_MAPPING
  const userMappingResolved = resolveTransactionCurrency({
    rawTransactionCurrency: '',
    accountAlias: 'AMEX-INTL',
    userSelectedMappingCurrency: 'USD',
  });
  assert.equal(userMappingResolved.currency, 'USD');
  assert.equal(userMappingResolved.currencyProvenance, 'USER_SELECTED_MAPPING');
  assert.equal(userMappingResolved.currencyStatus, 'SUPPORTED');

  // 4. Explicit transaction currency overrides defaults -> EXPLICIT_TRANSACTION
  const explicitResolved = resolveTransactionCurrency({
    rawTransactionCurrency: 'GBP',
    accountAlias: 'HDFC-XX4821',
    confirmedAccountCurrencies: { 'HDFC-XX4821': 'INR' },
    userSelectedMappingCurrency: 'USD',
  });
  assert.equal(explicitResolved.currency, 'GBP');
  assert.equal(explicitResolved.currencyProvenance, 'EXPLICIT_TRANSACTION');
  assert.equal(explicitResolved.currencyStatus, 'SUPPORTED');

  // 5. Unsupported ISO code vs UNKNOWN currency distinction
  const unsupportedResolved = resolveTransactionCurrency({
    rawTransactionCurrency: 'ZAR',
  });
  assert.equal(unsupportedResolved.currency, 'ZAR');
  assert.equal(unsupportedResolved.currencyProvenance, 'EXPLICIT_TRANSACTION');
  assert.equal(unsupportedResolved.currencyStatus, 'UNSUPPORTED');
  assert.equal(unsupportedResolved.isMalformedCode, false);

  // 6. parseAndNormaliseTransactions preserves UNKNOWN currency when currency is omitted and never converts to INR
  const unknownRows: RawCsvRow[] = [
    {
      transaction_id: 'TXN-UNK-1',
      transaction_date: '2026-08-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: '',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'ACCT-NO-CURRENCY',
      external_reference: 'REF-UNK-1',
    },
    {
      transaction_id: 'TXN-UNK-2',
      transaction_date: '2026-09-05',
      raw_description: 'RZP*STREAMBOX',
      amount: 499,
      currency: '',
      direction: 'DEBIT',
      payment_rail: 'UPI_AUTOPAY',
      account_alias: 'ACCT-NO-CURRENCY',
      external_reference: 'REF-UNK-2',
    },
  ];
  const parsedUnknown = parseAndNormaliseTransactions(unknownRows, 'BATCH-UNK', 'CSV_STATEMENT');
  assert.equal(parsedUnknown.transactions.length, 2);
  assert.equal(parsedUnknown.transactions[0].currency, 'UNKNOWN');
  assert.equal(parsedUnknown.transactions[0].currencyProvenance, 'UNKNOWN_SOURCE');
  assert.equal(parsedUnknown.transactions[0].currencyStatus, 'UNKNOWN');
  assert.equal(parsedUnknown.transactions[0].amountMinor, null);

  // 7. UNKNOWN currency commitment is never matched against INR mandate in reconciliation
  const { commitments: unkCommitments } = detectCommitmentsAndAlerts(parsedUnknown.transactions, []);
  assert.equal(unkCommitments.length, 1);
  assert.equal(unkCommitments[0].currency, 'UNKNOWN');
  assert.equal(unkCommitments[0].expectedAmountMinor, null);

  const inrMandate = buildInitialSeedMandates().find((m) => m.commitmentId === 'CMT-STREAMBOX')!;
  const unkRec = reconcileCommitment({
    commitment: unkCommitments[0],
    transactions: parsedUnknown.transactions,
    mandate: inrMandate,
    serviceTerms: null,
    cancellationSession: null,
  });
  assert.equal(unkRec.status, 'UNRESOLVED');
  assert.equal(unkRec.discrepancyReason, 'CURRENCY_UNKNOWN');
  assert.equal(unkRec.withinMandateLimit, null);

  // 8. Smart CSV preview and apply produce identical currency and row outcomes when currency is missing vs user-selected
  const smartCsvNoCurr = `Date,Narration,Debit,Credit\n05/10/2026,RZP*STREAMBOX,499.00,\n10/10/2026,UPI/DR/MUSICFLOW,199.00,`;
  const baseMapConfig: any = {
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    amountMode: 'SEPARATE_DEBIT_CREDIT',
    debitAmountColumn: 'Debit',
    creditAmountColumn: 'Credit',
    dateFormat: 'DD/MM/YYYY',
  };
  const prevNoCurr = previewCsvMapping(smartCsvNoCurr, baseMapConfig);
  const applyNoCurr = parseAllMappedCsvRows(smartCsvNoCurr, baseMapConfig, true);
  assert.equal(prevNoCurr.validRowsCount, applyNoCurr.validCount);
  assert.equal(prevNoCurr.previewRows[0].mappedRow?.currency, 'UNKNOWN');
  assert.equal(prevNoCurr.previewRows[0].mappedRow?.currency_provenance, 'UNKNOWN_SOURCE');
  assert.equal(applyNoCurr.validRows[0].currency, 'UNKNOWN');
  assert.equal(applyNoCurr.validRows[0].currency_provenance, 'UNKNOWN_SOURCE');

  const userUsdConfig = { ...baseMapConfig, defaultCurrency: 'USD' };
  const prevUsd = previewCsvMapping(smartCsvNoCurr, userUsdConfig);
  const applyUsd = parseAllMappedCsvRows(smartCsvNoCurr, userUsdConfig, true);
  assert.equal(prevUsd.previewRows[0].mappedRow?.currency, 'USD');
  assert.equal(prevUsd.previewRows[0].mappedRow?.currency_provenance, 'USER_SELECTED_MAPPING');
  assert.equal(applyUsd.validRows[0].currency, 'USD');
  assert.equal(applyUsd.validRows[0].currency_provenance, 'USER_SELECTED_MAPPING');

  // 9. Strict minor-unit conversions for 0/2/3 decimals (JPY, INR/USD/EUR/GBP, KWD/BHD/OMR) and rejection of invalid precision/overflow
  assert.equal(toMinorUnitsStrict(100, 'INR'), 10000);
  assert.equal(toMinorUnitsStrict(100, 'USD'), 10000);
  assert.equal(toMinorUnitsStrict(100, 'EUR'), 10000);
  assert.equal(toMinorUnitsStrict(100, 'GBP'), 10000);
  assert.equal(toMinorUnitsStrict(100, 'JPY'), 100);
  assert.equal(toMinorUnitsStrict(12.345, 'KWD'), 12345);
  assert.equal(toMinorUnitsStrict(12.345, 'BHD'), 12345);
  assert.equal(toMinorUnitsStrict(12.345, 'OMR'), 12345);

  // Reject fractional JPY (0-decimal currency) and >2 decimals in INR
  const jpyFrac = toMinorUnitsStrictResult(100.5, 'JPY');
  assert.equal(jpyFrac.ok, false);
  assert.equal(jpyFrac.error, 'EXCESS_DECIMAL_PLACES');
  assert.equal(toMinorUnitsStrict(100.5, 'JPY'), null);

  const inrExcess = toMinorUnitsStrictResult(499.123, 'INR');
  assert.equal(inrExcess.ok, false);
  assert.equal(inrExcess.error, 'EXCESS_DECIMAL_PLACES');

  // Reject NaN, Infinity, and safe-integer overflow
  assert.equal(toMinorUnitsStrict(Number.NaN, 'INR'), null);
  assert.equal(toMinorUnitsStrict(Number.POSITIVE_INFINITY, 'INR'), null);
  assert.equal(toMinorUnitsStrict(Number.MAX_SAFE_INTEGER, 'INR'), null);
  assert.equal(fromMinorUnitsStrictResult(100.5, 'INR').ok, false);
  assert.equal(fromMinorUnitsStrictResult(Number.MAX_SAFE_INTEGER + 10, 'INR').ok, false);
});

test('Part 7 Closure: Asia/Kolkata Midnight Boundary, IST Formatting, and Dynamic Monthly Trend Window', () => {
  // 1. Asia/Kolkata midnight boundary:
  // 2026-10-31T20:00:00Z is 2026-11-01 01:30:00 IST -> must return '2026-11-01' in Asia/Kolkata!
  const utcLateNight = new Date('2026-10-31T20:00:00.000Z');
  assert.equal(
    getRuntimeDateISO(undefined, utcLateNight),
    '2026-11-01',
    '2026-10-31T20:00:00Z is 01:30 IST on 2026-11-01 and must resolve to 2026-11-01 in Asia/Kolkata'
  );

  // 2026-10-31T18:29:00Z is 2026-10-31 23:59:00 IST -> must return '2026-10-31' in Asia/Kolkata!
  const utcBeforeIstMidnight = new Date('2026-10-31T18:29:00.000Z');
  assert.equal(
    getRuntimeDateISO(undefined, utcBeforeIstMidnight),
    '2026-10-31',
    '2026-10-31T18:29:00Z is 23:59 IST on 2026-10-31 and must resolve to 2026-10-31 in Asia/Kolkata'
  );

  // 2. IST Timestamp formatting uses Asia/Kolkata and labels IST
  const formattedIst = formatDateTimeIN('2026-10-31T20:00:00.000Z');
  assert.ok(formattedIst.includes('Nov') && formattedIst.includes('IST'), `Expected Nov and IST in ${formattedIst}`);

  // 3. Dynamic month window computes trailing N months from reference date instead of hardcoded 2026-06..2026-10
  const windowNov = getDynamicMonthWindow('2026-11-15', 5);
  assert.deepEqual(windowNov, ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);

  const windowFeb = getDynamicMonthWindow('2027-02-10', 5);
  assert.deepEqual(windowFeb, ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
});

test('Part 4, 5 & 6 Server Closure: Demo Mode Server Enforcement, Simulated Data Isolation, Lifecycle Allowlist & Completion Semantics, Forged Provenance Rejection, and Evidence Ownership Validation', async () => {
  const tmpStorePath = path.join(os.tmpdir(), `debitlens-closure-store-${Date.now()}.json`);
  process.env.DEBITLENS_SKIP_LISTEN = '1';
  process.env.DEBITLENS_STORE_PATH = tmpStorePath;

  const serverMod = await import('../../server');
  const { app, loadSeedData, setDemoModeForTesting } = serverMod;

  loadSeedData();
  setDemoModeForTesting(false);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function api(method: string, route: string, body?: any) {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, body: json };
  }

  try {
    // 1. Part 4: Demo Mode defaults to OFF; all demo mutation endpoints return 403 Forbidden with zero state mutation
    const modeInitial = await api('GET', '/api/demo/mode');
    assert.equal(modeInitial.status, 200);
    assert.equal(modeInitial.body.demoModeEnabled, false);

    const txnsBeforeDemoAttempt = (await api('GET', '/api/transactions')).body.length;

    const simBlocked = await api('POST', '/api/demo/simulate-post-cancel-debit', {
      commitmentId: 'CMT-FITCLUB',
    });
    assert.equal(simBlocked.status, 403);
    assert.equal(simBlocked.body.code, 'DEMO_MODE_DISABLED');

    const streamboxBlocked = await api('POST', '/api/demo/streambox-judge-scenario', {});
    assert.equal(streamboxBlocked.status, 403);
    assert.equal(streamboxBlocked.body.code, 'DEMO_MODE_DISABLED');

    const resetBlocked = await api('POST', '/api/demo/reset', {});
    assert.equal(resetBlocked.status, 403);
    assert.equal(resetBlocked.body.code, 'DEMO_MODE_DISABLED');

    const rebuildBlocked = await api('POST', '/api/graph/rebuild-demo', {});
    assert.equal(rebuildBlocked.status, 403);
    assert.equal(rebuildBlocked.body.code, 'DEMO_MODE_DISABLED');

    const txnsAfterDemoAttempt = (await api('GET', '/api/transactions')).body.length;
    assert.equal(
      txnsAfterDemoAttempt,
      txnsBeforeDemoAttempt,
      'Blocked demo endpoints when Demo Mode is OFF must cause zero state mutation'
    );

    // 2. Part 4: Enabling Demo Mode allows simulated scenario and isolates simulated records with DEMO_SEED provenance; turning Demo Mode OFF removes simulated overlays
    const enableDemo = await api('POST', '/api/demo/mode', { enabled: true });
    assert.equal(enableDemo.status, 200);
    assert.equal(enableDemo.body.demoModeEnabled, true);

    const judgeScenarioOk = await api('POST', '/api/demo/streambox-judge-scenario', {});
    assert.equal(judgeScenarioOk.status, 200);
    assert.equal(judgeScenarioOk.body.finding.status, 'AMOUNT_DISCREPANCY');
    assert.equal(judgeScenarioOk.body.finding.actualTransactionAmount, 799);

    const txnsInDemo = (await api('GET', '/api/transactions')).body;
    const simTxn = txnsInDemo.find((t: any) => t.id === 'TXN-1005');
    assert.ok(simTxn, 'Simulated TXN-1005 must appear while Demo Mode is ON');
    assert.equal(simTxn.sourceType, 'DEMO_SEED');

    // Turn Demo Mode OFF -> simulated overlay disappears and StreamBox returns to ₹499 MATCHED
    await api('POST', '/api/demo/mode', { enabled: false });
    const findingsAfterDemoOff = (await api('GET', '/api/reconciliation/findings')).body;
    const sbAfterDemoOff = findingsAfterDemoOff.find((f: any) => f.commitmentId === 'CMT-STREAMBOX');
    assert.equal(sbAfterDemoOff.status, 'MATCHED');
    assert.equal(sbAfterDemoOff.actualTransactionAmount, 499);

    // 3. Part 5: Forged privileged provenance (DEMO_SEED, SYSTEM_GENERATED, INDEPENDENTLY_VERIFIED) is rejected on user routes with HTTP 400 FORGED_PROVENANCE_REJECTED
    const forgedMandate = await api('POST', '/api/mandates/import', {
      mandate: {
        commitmentId: 'CMT-STREAMBOX',
        mandateReference: 'UMN-FORGED-01',
        maxAmount: 999,
        currency: 'INR',
        paymentRail: 'UPI_AUTOPAY',
        frequency: 'MONTHLY',
        startDate: '2026-01-01',
        sourceType: 'INDEPENDENTLY_VERIFIED',
      },
    });
    assert.equal(forgedMandate.status, 400);
    assert.equal(forgedMandate.body.code, 'FORGED_PROVENANCE_REJECTED');

    const forgedTerms = await api('POST', '/api/service-documents', {
      commitmentId: 'CMT-STREAMBOX',
      expectedAmount: 499,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      sourceType: 'DEMO_SEED',
    });
    assert.equal(forgedTerms.status, 400);
    assert.equal(forgedTerms.body.code, 'FORGED_PROVENANCE_REJECTED');

    const forgedEvid = await api('POST', '/api/cancellation/sessions/SESS-CMT-STREAMBOX/evidence', {
      evidenceType: 'SERVICE_CONFIRMATION',
      referenceNumber: 'REF-FORGED-1',
      description: 'Attempted forged provenance',
      sourceType: 'SYSTEM_GENERATED',
    });
    assert.equal(forgedEvid.status, 400);
    assert.equal(forgedEvid.body.code, 'FORGED_PROVENANCE_REJECTED');

    const forgedGuardrail = await api('PATCH', '/api/guardrails/CMT-STREAMBOX', {
      currency: 'INR',
      maxExpectedAmountMinor: 49900,
      sourceType: 'DEMO_SEED',
    });
    assert.equal(forgedGuardrail.status, 400);
    assert.equal(forgedGuardrail.body.code, 'FORGED_PROVENANCE_REJECTED');

    // 4. Part 5: Lifecycle status allowlist enforcement, CANCELLED/REVOKED completion semantics, and effectiveDateHistory
    const bogusServiceStatus = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'TOTALLY_INVALID_STATUS',
    });
    assert.equal(bogusServiceStatus.status, 400);

    const bogusMandateStatus = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/mandate-status', {
      mandateLifecycleStatus: 'TOTALLY_INVALID_MANDATE_STATUS',
    });
    assert.equal(bogusMandateStatus.status, 400);

    // Reject self-declared CANCELLATION_VERIFIED / REVOCATION_VERIFIED without independent verification
    const unverifiedCancelClaim = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_VERIFIED',
      effectiveDate: '2026-10-15',
    });
    assert.equal(unverifiedCancelClaim.status, 400);

    // Reject effectiveDate on CANCELLATION_REQUESTED or ACTIVE
    const reqWithEffDate = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_REQUESTED',
      effectiveDate: '2026-10-15',
    });
    assert.equal(reqWithEffDate.status, 400);

    // Reject CANCELLED without effectiveDate
    const cancelledNoDate = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLED',
    });
    assert.equal(cancelledNoDate.status, 400);

    // Accept CANCELLED with valid effectiveDate -> sets serviceCancelledAt; correcting it appends to effectiveDateHistory
    const cancelledWithDate = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLED',
      effectiveDate: '2026-10-12',
      notes: 'Cancelled service on 12 Oct',
    });
    assert.equal(cancelledWithDate.status, 200);
    assert.equal(cancelledWithDate.body.commitment.serviceLifecycleStatus, 'CANCELLED');
    assert.equal(cancelledWithDate.body.session.serviceCancelledAt, '2026-10-12');

    const correctedCancelDate = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLED',
      effectiveDate: '2026-10-15',
      notes: 'Corrected billing cycle end date to 15 Oct',
    });
    assert.equal(correctedCancelDate.status, 200);
    assert.equal(correctedCancelDate.body.session.serviceCancelledAt, '2026-10-15');
    assert.ok(correctedCancelDate.body.session.effectiveDateHistory.length >= 1);
    assert.equal(correctedCancelDate.body.session.effectiveDateHistory[0].previousDate, '2026-10-12');
    assert.equal(correctedCancelDate.body.session.effectiveDateHistory[0].newDate, '2026-10-15');

    // Accept REVOKED with valid revocationDate -> sets paymentAuthorisationRevokedAt
    const revokedNoDate = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/mandate-status', {
      mandateLifecycleStatus: 'REVOKED',
    });
    assert.equal(revokedNoDate.status, 400);

    const revokedWithDate = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/mandate-status', {
      mandateLifecycleStatus: 'REVOKED',
      revocationDate: '2026-10-16',
    });
    assert.equal(revokedWithDate.status, 200);
    assert.equal(revokedWithDate.body.commitment.mandateLifecycleStatus, 'REVOKED');
    assert.equal(revokedWithDate.body.session.paymentAuthorisationRevokedAt, '2026-10-16');

    // 5. Part 5: Evidence ownership & layer validation (reject linking Layer B evidence or another commitment's evidence to Layer A CANCELLATION_EVIDENCE_ATTACHED)
    const fitclubEv = await api('POST', '/api/cancellation/sessions/SESS-CMT-FITCLUB/evidence', {
      evidenceType: 'SERVICE_CONFIRMATION',
      referenceNumber: 'FIT-SRV-EV-101',
      description: 'FitClub service confirmation',
    });
    assert.equal(fitclubEv.status, 200);
    const fitclubEvId = fitclubEv.body.evidence.id;

    // Attempt to attach FitClub's evidenceId to StreamBox -> rejected with 400 INVALID_EVIDENCE_LINK
    const wrongCommitmentEvLink = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
      evidenceId: fitclubEvId,
      effectiveDate: '2026-10-15',
    });
    assert.equal(wrongCommitmentEvLink.status, 400);
    assert.equal(wrongCommitmentEvLink.body.code, 'INVALID_EVIDENCE_LINK');

    // Create a MANDATE_REVOCATION evidence on StreamBox and attempt to link it to Layer A SERVICE status -> rejected with 400 INVALID_EVIDENCE_LINK
    const sbMandateEv = await api('POST', '/api/cancellation/sessions/SESS-CMT-STREAMBOX/evidence', {
      evidenceType: 'MANDATE_REVOCATION',
      referenceNumber: 'SB-MND-EV-202',
      description: 'StreamBox UPI AutoPay revocation receipt',
      documentUploaded: true,
      documentName: 'revocation_receipt.pdf',
      fileBase64: Buffer.from('%PDF-1.4\n%revocation receipt\n%%EOF').toString('base64'),
    });
    assert.equal(sbMandateEv.status, 200);
    assert.equal(sbMandateEv.body.evidence.evidenceRecordLifecycle, 'DOCUMENT_UPLOADED');
    assert.equal(sbMandateEv.body.evidence.sourceType, 'USER_UPLOADED');

    const wrongLayerEvLink = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/service-status', {
      serviceLifecycleStatus: 'CANCELLATION_EVIDENCE_ATTACHED',
      evidenceId: sbMandateEv.body.evidence.id,
      effectiveDate: '2026-10-15',
    });
    assert.equal(wrongLayerEvLink.status, 400);
    assert.equal(wrongLayerEvLink.body.code, 'INVALID_EVIDENCE_LINK');

    // Linking sbMandateEv to Layer B REVOCATION_EVIDENCE_ATTACHED succeeds!
    const validLayerBEvLink = await api('PATCH', '/api/cancellations/CMT-STREAMBOX/mandate-status', {
      mandateLifecycleStatus: 'REVOCATION_EVIDENCE_ATTACHED',
      evidenceId: sbMandateEv.body.evidence.id,
      revocationDate: '2026-10-16',
    });
    assert.equal(validLayerBEvLink.status, 200);

    // 6. Part 2 & 7: Importing CSV row without currency stores UNKNOWN currency and never contaminates INR dashboard totals
    const inrBeforeUnk = (await api('GET', '/api/dashboard/summary')).body.monthlyRecurringSpend;
    const unkCsv = [
      'transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference',
      'TXN-API-UNK-1,2026-10-20,RZP*STREAMBOX,999.00,,DEBIT,UPI_AUTOPAY,UNMAPPED-ACCT-01,UTR-UNK-01',
    ].join('\n');
    const unkImportRes = await api('POST', '/api/import/transactions', {
      csvContent: unkCsv,
      filename: 'unknown-currency.csv',
    });
    assert.equal(unkImportRes.status, 200);
    assert.equal(unkImportRes.body.batch.acceptedRecords, 1);

    const allTxnsAfterUnk = (await api('GET', '/api/transactions')).body;
    const importedUnkTxn = allTxnsAfterUnk.find((t: any) => t.id === 'TXN-API-UNK-1');
    assert.ok(importedUnkTxn);
    assert.equal(importedUnkTxn.currency, 'UNKNOWN');
    assert.equal(importedUnkTxn.currencyProvenance, 'UNKNOWN_SOURCE');

    const summaryAfterUnk = (await api('GET', '/api/dashboard/summary')).body;
    assert.equal(
      summaryAfterUnk.monthlyRecurringSpend,
      inrBeforeUnk,
      'Transaction with UNKNOWN currency must never be aggregated into INR monthlyRecurringSpend'
    );
    assert.ok(summaryAfterUnk.excludedUnknownCurrencyCount >= 1);

    // 7. Part 7: Dynamic /api/dashboard/monthly-trend window responds to referenceDate
    const dynamicTrend = await api('GET', '/api/dashboard/monthly-trend?referenceDate=2026-12-15&months=5');
    assert.equal(dynamicTrend.status, 200);
    assert.deepEqual(
      dynamicTrend.body.map((m: any) => m.month),
      ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(tmpStorePath)) {
      fs.unlinkSync(tmpStorePath);
    }
  }
});

test('Exact Money Precision & Ambiguous Currency Disambiguation Suite', () => {
  // 1. Exact string/BigInt scaling prevents IEEE 754 precision loss
  const exactRes1 = convertMajorToMinorExact('12345678901.23', 'INR');
  assert.equal(exactRes1.success, true);
  if (exactRes1.success) {
    assert.equal(exactRes1.minorUnits, 1234567890123n);
  }

  const exactRes2 = convertMajorToMinorExact('100.5', 'INR');
  assert.equal(exactRes2.success, true);
  if (exactRes2.success) {
    assert.equal(exactRes2.minorUnits, 10050n);
  }

  const exactResZero = convertMajorToMinorExact('0', 'INR');
  assert.equal(exactResZero.success, true);
  if (exactResZero.success) {
    assert.equal(exactResZero.minorUnits, 0n);
  }

  // Reject excess decimal places for currency
  const excessDecimals = convertMajorToMinorExact('100.123', 'INR');
  assert.equal(excessDecimals.success, false);
  if (!excessDecimals.success) {
    assert.equal(excessDecimals.error, 'EXCESS_DECIMAL_PLACES');
  }

  // toMinorUnitsStrict uses the exact parser and produces safe integer
  assert.equal(toMinorUnitsStrict(12345678901.23, 'INR'), 1234567890123);

  // 2. Ambiguous currency symbols resolution
  // Bare '$' without confirmed account or explicit currency resolves to UNKNOWN_CURRENCY
  const bareDollar = resolveTransactionCurrency({ rawTransactionCurrency: '$' });
  assert.equal(bareDollar.currency, UNKNOWN_CURRENCY);
  assert.equal(bareDollar.currencyProvenance, 'UNKNOWN_SOURCE');

  // Bare '$' with USD confirmed account resolves to USD
  const dollarWithUsdAcct = resolveTransactionCurrency({
    rawTransactionCurrency: '$',
    accountAlias: 'CITI-USD-01',
    confirmedAccountCurrencies: { 'CITI-USD-01': 'USD' },
  });
  assert.equal(dollarWithUsdAcct.currency, 'USD');

  // Bare '$' with CAD confirmed account resolves to CAD
  const dollarWithCadAcct = resolveTransactionCurrency({
    rawTransactionCurrency: '$',
    accountAlias: 'RBC-CAD-01',
    confirmedAccountCurrencies: { 'RBC-CAD-01': 'CAD' },
  });
  assert.equal(dollarWithCadAcct.currency, 'CAD');

  // Explicit CAD / AUD descriptors resolve to respective currencies
  const explicitCad = resolveTransactionCurrency({ rawTransactionCurrency: 'CAD' });
  assert.equal(explicitCad.currency, 'CAD');

  const explicitAud = resolveTransactionCurrency({ rawTransactionCurrency: 'AUD' });
  assert.equal(explicitAud.currency, 'AUD');

  // Bare '¥' without JPY confirmed account resolves to UNKNOWN_CURRENCY
  const bareYen = resolveTransactionCurrency({ rawTransactionCurrency: '¥' });
  assert.equal(bareYen.currency, UNKNOWN_CURRENCY);
  assert.equal(bareYen.currencyProvenance, 'UNKNOWN_SOURCE');

  // Explicit JPY descriptor resolves to JPY
  const explicitJpy = resolveTransactionCurrency({ rawTransactionCurrency: 'JPY' });
  assert.equal(explicitJpy.currency, 'JPY');

  // Service Terms extraction: bare '$' resolves to UNKNOWN, USD resolves to USD
  const termsBareDollar = extractServiceTermsFromText('Monthly cloud subscription for $499 billed every month.');
  assert.equal(termsBareDollar.currency, UNKNOWN_CURRENCY);

  const termsExplicitUsd = extractServiceTermsFromText('Monthly cloud subscription for USD 499 billed every month.');
  assert.equal(termsExplicitUsd.currency, 'USD');
});

test('Final 10/10 Quality Assurance: Demo Reset Sentinel Preservation, Real File Upload, Verification Security & Guardrails', async () => {
  const tmpStorePath = path.resolve(
    os.tmpdir(),
    `debitlens-quality-gate-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  process.env.DEBITLENS_STORE_PATH = tmpStorePath;
  process.env.DEBITLENS_SKIP_LISTEN = '1';

  const {
    app,
    loadSeedData,
    setSimulatePersistenceFailureForTesting,
    setSimulateGraphSyncFailureForTesting,
  } = await import('../../server');
  loadSeedData(true);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const api = async (method: string, endpoint: string, body?: any) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };

  try {
    // ------------------------------------------------------------------------
    // GATE 1: Real File Upload & Magic Byte Validation
    // ------------------------------------------------------------------------
    // A. Reject documentUploaded: true without fileBase64 payload
    const sessionsRes = await api('GET', '/api/cancellation/sessions');
    assert.equal(sessionsRes.status, 200);
    const targetSession = sessionsRes.body.sessions[0];
    assert.ok(targetSession, 'At least one cancellation session exists');

    const fakeUploadRes = await api(
      'POST',
      `/api/cancellation/sessions/${targetSession.id}/evidence`,
      {
        evidenceType: 'SERVICE_CONFIRMATION',
        description: 'Testing fake upload claim without payload',
        referenceNumber: 'REF-FAKE-UPLOAD-01',
        documentUploaded: true,
      }
    );
    assert.equal(fakeUploadRes.status, 400);
    assert.equal(fakeUploadRes.body.code, 'DOCUMENT_PAYLOAD_REQUIRED');

    // B. Reject invalid file signature (text file pretending to be PDF)
    const invalidSignatureRes = await api(
      'POST',
      `/api/cancellation/sessions/${targetSession.id}/evidence`,
      {
        evidenceType: 'SERVICE_CONFIRMATION',
        description: 'Text file pretending to be upload',
        referenceNumber: 'REF-INVALID-MAGIC-01',
        documentUploaded: true,
        fileBase64: Buffer.from('This is a plain text file, not a PDF').toString('base64'),
      }
    );
    assert.equal(invalidSignatureRes.status, 400);
    assert.equal(invalidSignatureRes.body.code, 'INVALID_FILE_SIGNATURE');

    // C. Accept valid PDF with magic bytes %PDF-
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const validPdfRes = await api(
      'POST',
      `/api/cancellation/sessions/${targetSession.id}/evidence`,
      {
        evidenceType: 'SERVICE_CONFIRMATION',
        description: 'Official cancellation confirmation letter PDF',
        referenceNumber: 'REF-VALID-PDF-99',
        evidenceDate: '2026-10-15',
        documentUploaded: true,
        documentName: 'cancellation_receipt.pdf',
        fileBase64: validPdfBuffer.toString('base64'),
      }
    );
    assert.equal(validPdfRes.status, 200);
    assert.equal(validPdfRes.body.evidence.documentUploaded, true);
    assert.equal(validPdfRes.body.evidence.sourceType, 'USER_UPLOADED');
    assert.equal(validPdfRes.body.evidence.evidenceRecordLifecycle, 'DOCUMENT_UPLOADED');
    assert.equal(validPdfRes.body.evidence.verificationStatus, 'EVIDENCE_ATTACHED');
    assert.ok(validPdfRes.body.evidence.sha256Hash, 'SHA-256 hash must be generated');
    assert.equal(validPdfRes.body.evidence.fileSizeBytes, validPdfBuffer.length);
    const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
    const filesAfterFirstUpload = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
    const repeatedPdfRes = await api(
      'POST',
      `/api/cancellation/sessions/${targetSession.id}/evidence`,
      {
        evidenceType: 'SERVICE_CONFIRMATION',
        description: 'Repeated official cancellation confirmation letter PDF',
        referenceNumber: 'REF-VALID-PDF-100',
        documentUploaded: true,
        documentName: 'cancellation_receipt.pdf',
        fileBase64: validPdfBuffer.toString('base64'),
      }
    );
    assert.equal(repeatedPdfRes.status, 200);
    const filesAfterRepeatedUpload = fs.readdirSync(uploadsDir);
    assert.equal(filesAfterRepeatedUpload.length, filesAfterFirstUpload.length + 1);
    assert.notEqual(
      repeatedPdfRes.body.evidence.storagePath,
      validPdfRes.body.evidence.storagePath,
      'Repeated uploads must receive unique storage paths'
    );

    const evidenceBeforeFailedUpload = (await api(
      'GET',
      `/api/commitments/${targetSession.commitmentId}/evidence`
    )).body;
    setSimulatePersistenceFailureForTesting(true);
    const failedUploadRes = await api(
      'POST',
      `/api/cancellation/sessions/${targetSession.id}/evidence`,
      {
        evidenceType: 'SERVICE_CONFIRMATION',
        description: 'Persistence failure cleanup upload',
        referenceNumber: 'REF-FAILED-PERSISTENCE-01',
        documentUploaded: true,
        documentName: 'failed_upload.pdf',
        fileBase64: validPdfBuffer.toString('base64'),
      }
    );
    setSimulatePersistenceFailureForTesting(false);
    assert.equal(failedUploadRes.status, 500);
    const filesAfterFailedUpload = fs.readdirSync(uploadsDir);
    assert.deepEqual(filesAfterFailedUpload.sort(), filesAfterRepeatedUpload.sort());
    const evidenceAfterFailedUpload = (await api(
      'GET',
      `/api/commitments/${targetSession.commitmentId}/evidence`
    )).body;
    assert.equal(evidenceAfterFailedUpload.entries.length, evidenceBeforeFailedUpload.entries.length);

    // D. Accept reference-only evidence without document upload
    const refOnlyRes = await api(
      'POST',
      `/api/cancellation/sessions/${targetSession.id}/evidence`,
      {
        evidenceType: 'SERVICE_CONFIRMATION',
        description: 'Reference-only confirmation code from web portal',
        referenceNumber: 'REF-CODE-ONLY-42',
        evidenceDate: '2026-10-16',
        documentUploaded: false,
      }
    );
    assert.equal(refOnlyRes.status, 200);
    assert.equal(refOnlyRes.body.evidence.documentUploaded, false);
    assert.equal(refOnlyRes.body.evidence.sourceType, 'USER_ENTERED');
    assert.equal(refOnlyRes.body.evidence.evidenceRecordLifecycle, 'EVIDENCE_REFERENCE_RECORDED');
    assert.equal(refOnlyRes.body.evidence.verificationStatus, 'USER_REPORTED');

    // E. Legacy reference and lifecycle routes cannot manufacture uploaded-document state.
    const commitmentEvidenceClaim = await api(
      'POST',
      `/api/commitments/${targetSession.commitmentId}/evidence`,
      {
        title: 'Unsupported upload assertion',
        description: 'No file bytes were supplied',
        sourceReference: 'REF-LEGACY-UPLOAD-01',
        documentUploaded: true,
      }
    );
    assert.equal(commitmentEvidenceClaim.status, 400);
    assert.equal(commitmentEvidenceClaim.body.code, 'DOCUMENT_UPLOAD_REQUIRES_FILE_BYTES');

    const serviceUploadClaim = await api(
      'PATCH',
      `/api/cancellations/${targetSession.id}/service-status`,
      {
        serviceLifecycleStatus: 'CANCELLATION_REQUESTED',
        documentUploaded: true,
      }
    );
    assert.equal(serviceUploadClaim.status, 400);
    assert.equal(serviceUploadClaim.body.code, 'DOCUMENT_UPLOAD_REQUIRES_FILE_BYTES');

    const mandateUploadClaim = await api(
      'PATCH',
      `/api/cancellations/${targetSession.id}/mandate-status`,
      {
        mandateLifecycleStatus: 'REVOCATION_REQUESTED',
        documentUploaded: true,
      }
    );
    assert.equal(mandateUploadClaim.status, 400);
    assert.equal(mandateUploadClaim.body.code, 'DOCUMENT_UPLOAD_REQUIRES_FILE_BYTES');

    // ------------------------------------------------------------------------
    // GATE 2: Rejection of Self-Declared Independent Verification
    // ------------------------------------------------------------------------
    // A. Rejection of CANCELLATION_VERIFIED on service-status endpoint
    const selfDeclareLayerARes = await api(
      'PATCH',
      `/api/cancellations/${targetSession.id}/service-status`,
      {
        serviceLifecycleStatus: 'CANCELLATION_VERIFIED',
        verifiedConfirmation: true,
        referenceNumber: 'REF-CODE-ONLY-42',
      }
    );
    assert.equal(selfDeclareLayerARes.status, 400);
    assert.equal(selfDeclareLayerARes.body.code, 'UNVERIFIED_STATUS_REJECTED');

    // B. Rejection of REVOCATION_VERIFIED on mandate-status endpoint
    const selfDeclareLayerBRes = await api(
      'PATCH',
      `/api/cancellations/${targetSession.id}/mandate-status`,
      {
        mandateLifecycleStatus: 'REVOCATION_VERIFIED',
        verifiedConfirmation: true,
        referenceNumber: 'REF-CODE-ONLY-42',
      }
    );
    assert.equal(selfDeclareLayerBRes.status, 400);
    assert.equal(selfDeclareLayerBRes.body.code, 'UNVERIFIED_STATUS_REJECTED');

    // C. Rejection of forged privileged sourceType
    const forgedProvenanceRes = await api(
      'PATCH',
      `/api/cancellations/${targetSession.id}/service-status`,
      {
        serviceLifecycleStatus: 'CANCELLED',
        sourceType: 'INDEPENDENTLY_VERIFIED',
        effectiveDate: '2026-10-15',
      }
    );
    assert.equal(forgedProvenanceRes.status, 400);
    assert.equal(forgedProvenanceRes.body.code, 'FORGED_PROVENANCE_REJECTED');

    // ------------------------------------------------------------------------
    // GATE 3: Financial Guardrails Validation & Rejection of UNKNOWN Currency
    // ------------------------------------------------------------------------
    // A. Reject missing guardrail amount (no default 499)
    const missingAmountGuardrail = await api('PATCH', `/api/guardrails/${targetSession.commitmentId}`, {
      currency: 'INR',
    });
    assert.equal(missingAmountGuardrail.status, 400);
    assert.equal(missingAmountGuardrail.body.code, 'AMOUNT_REQUIRED');

    // B. Guardrail succeeds with explicit positive amount
    const validGuardrailRes = await api('PATCH', `/api/guardrails/${targetSession.commitmentId}`, {
      currency: 'INR',
      maxExpectedAmount: 1499.0,
      preDebitReminderDays: 4,
    });
    assert.equal(validGuardrailRes.status, 200);
    assert.equal(validGuardrailRes.body.maxExpectedAmountMinor, 149900);
    assert.equal(validGuardrailRes.body.currency, 'INR');

    // ------------------------------------------------------------------------
    // GATE 4: Demo Reset Sentinel Data Preservation
    // ------------------------------------------------------------------------
    // A. Import a user transaction with unique sentinel ID
    const userCsv = [
      'transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference',
      'TXN-USER-SENTINEL-01,2026-10-18,USER*CANONICAL-PURCHASE,2499.00,INR,DEBIT,UPI_AUTOPAY,HDFC-XX4821,UTR-USER-SENTINEL',
    ].join('\n');
    const userImportRes = await api('POST', '/api/import/transactions', {
      csvContent: userCsv,
      filename: 'user-sentinel.csv',
    });
    assert.equal(userImportRes.status, 200);
    assert.equal(userImportRes.body.batch.acceptedRecords, 1);

    // B. Import a user mandate with unique sentinel ID
    const userMandateRes = await api('POST', '/api/mandates/import', {
      mandate: {
        id: 'MAND-USER-SENTINEL-01',
        mandateReference: 'MND-REF-SENTINEL-01',
        currency: 'INR',
        maxAmount: 2499,
        commitmentId: 'CMT-USER-SENTINEL',
        merchantName: 'User Canonical Merchant',
        serviceName: 'User Protected Service',
        paymentRail: 'UPI_AUTOPAY',
        mandateStatus: 'ACTIVE',
        sourceType: 'USER_ENTERED',
        createdAt: '2026-10-18T10:00:00Z',
      },
    });
    assert.equal(userMandateRes.status, 200);

    // C. Enable Demo Mode and simulate a post-cancellation debit (creates ephemeral DEMO_SEED transaction)
    const enableDemoRes = await api('POST', '/api/demo/mode', { enabled: true });
    assert.equal(enableDemoRes.status, 200);

    const simRes = await api('POST', '/api/demo/simulate-post-cancel-debit', {
      commitmentId: targetSession.commitmentId,
    });
    assert.equal(simRes.status, 200);

    // Verify simulated transaction exists before reset
    const txnsBeforeReset = (await api('GET', '/api/transactions')).body;
    assert.ok(txnsBeforeReset.some((t: any) => t.id.startsWith('TXN-POST-')));
    assert.ok(txnsBeforeReset.some((t: any) => t.id === 'TXN-USER-SENTINEL-01'));

    // D. Trigger Demo Reset
    const resetRes = await api('POST', '/api/demo/reset');
    assert.equal(resetRes.status, 200);
    assert.ok(resetRes.body.preservedUserRecords.transactions >= 1, 'Preserved user transactions');
    assert.ok(resetRes.body.preservedUserRecords.mandates >= 1, 'Preserved user mandates');

    // E. Verify Canonical User Data is 100% PRESERVED after Demo Reset
    const txnsAfterReset = (await api('GET', '/api/transactions')).body;
    const userTxnPreserved = txnsAfterReset.find((t: any) => t.id === 'TXN-USER-SENTINEL-01');
    assert.ok(userTxnPreserved, 'User-imported transaction must survive demo reset');
    assert.equal(userTxnPreserved.amount, 2499.0);
    const baselineIdsAfterFirstReset = txnsAfterReset
      .filter((t: any) => t.sourceType === 'DEMO_SEED' || t.importBatchId === 'BATCH-SEED-01')
      .map((t: any) => t.id)
      .sort();

    // Ephemeral simulated demo transaction MUST be cleared
    const simTxnAfterReset = txnsAfterReset.find((t: any) => t.id.startsWith('TXN-POST-'));
    assert.equal(simTxnAfterReset, undefined, 'Ephemeral simulated demo debits must be wiped on reset');

    // User mandate must survive
    const mandatesAfterReset = (await api('GET', '/api/mandates')).body;
    const userMandatePreserved = mandatesAfterReset.find((m: any) => m.id === 'MAND-USER-SENTINEL-01');
    assert.ok(userMandatePreserved, 'User mandate must survive demo reset');

    // User guardrail configured above must survive
    const guardrailsAfterReset = (await api('GET', '/api/guardrails')).body;
    const userGuardrailPreserved = guardrailsAfterReset.find(
      (g: any) => g.commitmentId === targetSession.commitmentId
    );
    assert.ok(userGuardrailPreserved, 'User guardrail must survive demo reset');
    assert.equal(userGuardrailPreserved.maxExpectedAmountMinor, 149900);

    // Audit trail must contain the sentinel demo reset event
    const evidenceCasebook = (await api('GET', `/api/commitments/${targetSession.commitmentId}/evidence`)).body;
    assert.ok(evidenceCasebook.auditEvents.length > 0);

    const secondReset = await api('POST', '/api/demo/reset');
    assert.equal(secondReset.status, 200);
    const txnsAfterSecondReset = (await api('GET', '/api/transactions')).body;
    const baselineIdsAfterSecondReset = txnsAfterSecondReset
      .filter((t: any) => t.sourceType === 'DEMO_SEED' || t.importBatchId === 'BATCH-SEED-01')
      .map((t: any) => t.id)
      .sort();
    assert.deepEqual(baselineIdsAfterSecondReset, baselineIdsAfterFirstReset);
    assert.deepEqual(
      txnsAfterSecondReset.find((t: any) => t.id === 'TXN-USER-SENTINEL-01'),
      txnsAfterReset.find((t: any) => t.id === 'TXN-USER-SENTINEL-01')
    );

    setSimulateGraphSyncFailureForTesting(true);
    const graphMutationTarget = (await api('GET', '/api/investigations')).body.find(
      (item: any) => item.status !== 'CLOSED'
    );
    assert.ok(graphMutationTarget);
    const [graphFailure, concurrentMutation] = await Promise.all([
      api('POST', '/api/graph/rebuild-demo', {}),
      api('POST', `/api/investigations/${graphMutationTarget.id}/action`, {
        actionType: 'MARKED_UNDER_REVIEW',
        notes: 'Concurrent mutation must survive graph projection failure',
      }),
    ]);
    setSimulateGraphSyncFailureForTesting(false);
    assert.equal(graphFailure.status, 502);
    assert.equal(graphFailure.body.projectionStatus, 'FAILED');
    assert.equal(graphFailure.body.canonicalPersistenceStatus, 'UNCHANGED');
    assert.equal(concurrentMutation.status, 200);
    const persistedAfterGraphFailure = JSON.parse(fs.readFileSync(tmpStorePath, 'utf8'));
    assert.ok(
      persistedAfterGraphFailure.investigationCases.some(
        (item: any) => item.id === graphMutationTarget.id && item.status === 'UNDER_REVIEW'
      )
    );
    assert.equal(
      (await api('GET', '/api/investigations')).body.find((item: any) => item.id === graphMutationTarget.id).status,
      'UNDER_REVIEW'
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(tmpStorePath)) {
      fs.unlinkSync(tmpStorePath);
    }
  }
});
