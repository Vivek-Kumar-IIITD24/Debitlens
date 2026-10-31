import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchQuery,
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
  clearSearchHistory,
  filterTransactionsByQuery,
  countDescriptorMatches,
  DEFAULT_DESCRIPTOR_SEARCH_HISTORY,
  SearchHistoryEntry,
} from './searchHistory';
import { TransactionRecord } from '../types/debitlens';

const SAMPLE_TRANSACTIONS: TransactionRecord[] = [
  {
    id: 'TXN-1001',
    transactionId: 'TXN-1001',
    accountId: 'ACC-1',
    accountAlias: 'HDFC-XX4821',
    importBatchId: 'BATCH-1',
    rawDescription: 'RZP*STREAMBOX',
    normalisedDescription: 'RZP*STREAMBOX',
    amount: 499,
    currency: 'INR',
    direction: 'DEBIT',
    transactionDate: '2026-06-05',
    paymentRail: 'UPI_AUTOPAY',
    paymentMechanism: 'UPI_AUTOPAY',
    merchantIdentity: {
      merchantId: 'MERCH-STREAMBOX',
      canonicalName: 'StreamBox',
      serviceName: 'StreamBox Premium 4K',
    },
    processorIdentity: {
      processorId: 'PROC-RAZORPAY',
      processorName: 'Razorpay',
    },
    processorId: 'PROC-RAZORPAY',
    processorName: 'Razorpay',
    merchantId: 'MERCH-STREAMBOX',
    merchantName: 'StreamBox',
    serviceName: 'StreamBox Premium 4K',
    resolutionStatus: 'CONFIRMED',
    matchingMethod: 'PROCESSOR_PLUS_MERCHANT_MATCH',
    confidenceScore: 99,
    resolutionExplanation: 'Matched StreamBox alias',
    sourceType: 'DEMO_SEED',
    externalReference: 'REF-1001',
    commitmentId: 'CMT-STREAMBOX',
  },
  {
    id: 'TXN-9502',
    transactionId: 'TXN-9502',
    accountId: 'ACC-1',
    accountAlias: 'HDFC-XX4821',
    importBatchId: 'BATCH-1',
    rawDescription: 'RAZORPAY*99812-MUM',
    normalisedDescription: 'RAZORPAY*99812-MUM',
    amount: 799,
    currency: 'INR',
    direction: 'DEBIT',
    transactionDate: '2026-10-14',
    paymentRail: 'UPI_AUTOPAY',
    paymentMechanism: 'UPI_AUTOPAY',
    merchantIdentity: {
      merchantId: null,
      canonicalName: null,
      serviceName: null,
    },
    processorIdentity: {
      processorId: 'PROC-RAZORPAY',
      processorName: 'Razorpay',
    },
    processorId: 'PROC-RAZORPAY',
    processorName: 'Razorpay',
    merchantId: null,
    merchantName: null,
    serviceName: null,
    resolutionStatus: 'UNRESOLVED',
    matchingMethod: 'PROCESSOR_ONLY_UNRESOLVED',
    confidenceScore: 30,
    resolutionExplanation: 'Processor-only descriptor',
    sourceType: 'DEMO_SEED',
    externalReference: 'REF-9502',
    commitmentId: null,
  },
];

test('normalizeSearchQuery trims leading/trailing whitespace and collapses internal spaces', () => {
  assert.equal(normalizeSearchQuery('  RZP*STREAMBOX  '), 'RZP*STREAMBOX');
  assert.equal(normalizeSearchQuery('UPI/DR/42571190   RAZORPAY'), 'UPI/DR/42571190 RAZORPAY');
  assert.equal(normalizeSearchQuery('   '), '');
});

test('addSearchHistoryEntry prepends new query and ignores blank queries', () => {
  const initial: SearchHistoryEntry[] = [
    { query: 'RZP*STREAMBOX', timestamp: '2026-10-31T08:00:00.000Z', matchCount: 2 },
  ];
  const unchanged = addSearchHistoryEntry(initial, '   ');
  assert.deepEqual(unchanged, initial);

  const updated = addSearchHistoryEntry(
    initial,
    'CASHFREE*MERCH-771',
    1,
    8,
    '2026-10-31T09:30:00.000Z'
  );
  assert.equal(updated.length, 2);
  assert.equal(updated[0].query, 'CASHFREE*MERCH-771');
  assert.equal(updated[0].matchCount, 1);
  assert.equal(updated[1].query, 'RZP*STREAMBOX');
});

test('addSearchHistoryEntry deduplicates case-insensitively and moves item to top', () => {
  const initial: SearchHistoryEntry[] = [
    { query: 'RAZORPAY*99812-MUM', timestamp: '2026-10-31T08:00:00.000Z' },
    { query: 'RZP*STREAMBOX', timestamp: '2026-10-31T07:00:00.000Z' },
  ];
  const updated = addSearchHistoryEntry(
    initial,
    'rzp*streambox',
    2,
    8,
    '2026-10-31T10:00:00.000Z'
  );
  assert.equal(updated.length, 2);
  assert.equal(updated[0].query, 'rzp*streambox');
  assert.equal(updated[0].timestamp, '2026-10-31T10:00:00.000Z');
  assert.equal(updated[1].query, 'RAZORPAY*99812-MUM');
});

test('addSearchHistoryEntry enforces maxEntries limit', () => {
  let history: SearchHistoryEntry[] = [];
  for (let i = 1; i <= 5; i++) {
    history = addSearchHistoryEntry(history, `DESC-${i}`, 1, 3, `2026-10-31T0${i}:00:00.000Z`);
  }
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((h) => h.query),
    ['DESC-5', 'DESC-4', 'DESC-3']
  );
});

test('removeSearchHistoryEntry and clearSearchHistory remove items properly', () => {
  const remaining = removeSearchHistoryEntry(
    DEFAULT_DESCRIPTOR_SEARCH_HISTORY,
    'rzp*streambox'
  );
  assert.equal(remaining.length, DEFAULT_DESCRIPTOR_SEARCH_HISTORY.length - 1);
  assert.equal(
    remaining.some((item) => item.query === 'RZP*STREAMBOX'),
    false
  );

  const cleared = clearSearchHistory();
  assert.equal(cleared.length, 0);
});

test('filterTransactionsByQuery and countDescriptorMatches match raw descriptors and respect status filter', () => {
  const streamboxMatches = filterTransactionsByQuery(SAMPLE_TRANSACTIONS, 'RZP*STREAMBOX', 'ALL');
  assert.equal(streamboxMatches.length, 1);
  assert.equal(streamboxMatches[0].id, 'TXN-1001');

  const unresolvedMatches = filterTransactionsByQuery(SAMPLE_TRANSACTIONS, 'RAZORPAY', 'UNRESOLVED');
  assert.equal(unresolvedMatches.length, 1);
  assert.equal(unresolvedMatches[0].id, 'TXN-9502');

  assert.equal(countDescriptorMatches(SAMPLE_TRANSACTIONS, 'RAZORPAY*99812-MUM'), 1);
  assert.equal(countDescriptorMatches(SAMPLE_TRANSACTIONS, 'NONEXISTENT*DESC'), 0);
});
