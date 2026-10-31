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
  RawCsvRow,
  NotificationInput,
} from './debitlensEngine';
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
  const incompleteNotifs: NotificationInput[] = [
    {
      id: 'NOTIF-INCOMPLETE',
      eventType: 'TRIAL_STARTED',
      merchantHint: 'LearnPro AI',
      eventDate: '2026-10-08',
      expectedAmount: 999,
      currency: 'INR',
    },
  ];
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
