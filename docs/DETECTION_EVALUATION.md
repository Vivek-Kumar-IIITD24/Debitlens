# Recurring-Payment Detection & Ground-Truth Evaluation Report

## 1. Dynamic Evaluation Methodology
DebitLens evaluates its detection and identity engine dynamically via `evaluateDetectionMetricsAgainstGroundTruth()` (`GET /api/detection/metrics` and `POST /api/detection/evaluate`) against `data/ground-truth.json`, `data/synthetic-transactions.csv` (45 transactions), and `data/synthetic-notifications.json` (3 notifications). No metrics are hardcoded.

## 2. Benchmark Results (`npm test`)
- **True Positives (Commitments):** `10 / 10` (`CMT-STREAMBOX`, `CMT-MUSICFLOW`, `CMT-CLOUDNOTES`, `CMT-FITCLUB`, `CMT-BESCOM`, `CMT-MAXLIFE`, `CMT-READCLOUD`, `CMT-LEARNPRO`, `CMT-BAJAJEMI`, `CMT-DESIGNVAULT`)
- **False Positives:** `0`
- **False Negatives:** `0`
- **False Processor Merges (`falseMergesCount`):** `0`
- **Precision:** `100%`
- **Recall:** `100%`
- **Unresolved Processor-Only Isolation:** `3 / 3` (`TXN-9501`, `TXN-9502`, `TXN-9503` kept isolated as `UNRESOLVED`)
- **Habitual / One-Time / Refund Exclusion:** `TXN-9801` Thirdwave Coffee, `TXN-9802` IndiGo Airlines, and `TXN-9803` StreamBox refund excluded from recurring commitments

## 3. Automated Test Suite (`36 / 36` Passing)
Executed via `npm test` (`30` tests in `src/engine/debitlensEngine.test.ts` + `6` tests in `src/utils/searchHistory.test.ts`):
- Descriptor normalisation & 6-tier identity hierarchy
- All 15 adversarial edge cases (shared processors, refunds, reversals, month-end Jan 31 → Feb 28 → Mar 31, 2-occurrence annual renewals, variable utility bills, post-cancellation debits, duplicate CSV IDs, RFC-4180 quoted CSV fields)
- Integer minor-unit (`paise`) conversions and placeholder env rejection (`isPlaceholderEnvValue`)
- Three-way financial reconciliation across all 9 outcomes (`MATCHED`, `AMOUNT_DISCREPANCY`, `FREQUENCY_DISCREPANCY`, `TRANSACTION_WITHOUT_VISIBLE_MANDATE`, `MANDATE_WITHOUT_RECENT_TRANSACTION`, `SERVICE_TERMS_UNAVAILABLE`, `POSSIBLE_DUPLICATE` with/without credit reversal, `CONFLICTING_EVIDENCE` including expired/non-active mandates, and `UNRESOLVED`) + Section 22 StreamBox Judge Demo
- Deterministic service terms extraction from pasted invoice text (`expectedAmountMinor: null` when currency token is missing, `userVerified: false` until explicitly confirmed)
- Evidence Casebook (`IMPORTED_RECORD`, `SYSTEM_GENERATED`, `INFERRED`, `USER_CONFIRMED` status labels), independent Layer A & Layer B cancellation lifecycles, Data Coverage blind spots, and Contextual Sarvam Bhasha Q&A
- Raw Statement Descriptor Search History utilities (`src/utils/searchHistory.test.ts`).
