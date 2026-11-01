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
  getEffectiveMandateStatus,
  getMissingMandateFields,
  generateMerchantCandidates,
  buildUnrecognizedDebitCase,
  buildReviewQueue,
  generateCommitmentPassport,
  generateEvidencePackData,
  generatePrintableEvidencePackHtml,
  previewCsvMapping,
} from './debitlensEngine';
import { toMinorUnits, fromMinorUnits, formatMinorINR } from '../utils/currency';
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
  assert.equal(toMinorUnits(499), 49900);
  assert.equal(toMinorUnits(799.5), 79950);
  assert.equal(fromMinorUnits(49900), 499);
  assert.equal(formatMinorINR(49900), '₹499');

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
    merchantName: 'Test Service',
    paymentRail: 'UPI_AUTOPAY' as const,
    maxAmountMinor: 50000,
    maxAmount: 500,
    frequency: 'MONTHLY' as const,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    mandateStatus: 'ACTIVE' as const,
    sourceType: 'IMPORT' as const,
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
    commitment: dummyCommitment,
    transactions: dummyTxns,
    mandate: incompleteMandate,
    serviceTerms: null,
    session: null,
  });

  // Must not be MATCHED
  assert.notEqual(findingWithIncomplete.status, 'MATCHED');
  assert.equal(findingWithIncomplete.status, 'UNRESOLVED');
  assert.ok(findingWithIncomplete.discrepancyDetails.missingMandateFields?.length! >= 1);
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
  const streamboxCandidate = candidates.find((c) => c.merchantName.includes('StreamBox'));
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
  const reconItem = queue.find((i) => i.category === 'RECONCILIATION_DISCREPANCY');
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

  // 2 debits (Netflix 649, Spotify 119) and 1 credit (Salary 85000 skipped)
  assert.equal(preview.validRowsCount, 2);
  const netflixRow = preview.previewRows.find((r) => r.mappedRow?.raw_description.includes('NETFLIX'));
  assert.ok(netflixRow);
  assert.equal(netflixRow.mappedRow?.amount, '649');
  assert.equal(netflixRow.mappedRow?.transaction_date, '2026-10-05');

  const salaryRow = preview.previewRows.find((r) => r.rowNumber === 3);
  assert.ok(salaryRow);
  assert.equal(salaryRow.isValid, false);
  assert.ok(salaryRow.validationError?.includes('Credit/Deposit row'));
});




