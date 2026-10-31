# Testing & Ground-Truth Evaluation Report (`DebitLens`)

## 1. Automated Unit & Adversarial Test Suite (`npm test`)

Run command:
```bash
npm test
# Executes: tsx --test src/utils/searchHistory.test.ts src/engine/debitlensEngine.test.ts
```

### Summary of Results: **36 / 36 Passing (0 Failures)**

| Test # | Suite | Test Name | Status |
|---|---|---|---|
| 1 | `debitlensEngine.test.ts` | Neo4j Test 1 & 6: Different aliases resolve to StreamBox while processor-only RAZORPAY stays UNRESOLVED | PASS |
| 2 | `debitlensEngine.test.ts` | Neo4j Test 2, 3, 4, 5: Temporal recurrence, price increase, resumed pattern, trial conversion, and post-cancellation detection | PASS |
| 3 | `debitlensEngine.test.ts` | Neo4j Commitment Graph builder constructs full path and executes Cypher Operations 1–7 | PASS |
| 4 | `debitlensEngine.test.ts` | Sarvam Tests 1–8: Grounded English & Hindi explanations, unknown merchant uncertainty, privacy masking, and two-layer playbook safety | PASS |
| 5 | `debitlensEngine.test.ts` | Adversarial Case 1: Similar merchant names (`RZP*STREAMPLUS-MEDIA`) do not falsely collide with StreamBox | PASS |
| 6 | `debitlensEngine.test.ts` | Adversarial Case 2: Two different merchants using the same payment processor (`Razorpay`) remain separate commitments | PASS |
| 7 | `debitlensEngine.test.ts` | Adversarial Case 3: Unknown processor-only descriptor (`UPI/DR/42571190/RAZORPAY`) stays isolated and never creates a commitment | PASS |
| 8 | `debitlensEngine.test.ts` | Adversarial Case 4: Repeated one-time retail purchases (`POS-GROCERY-MART-BLR`) do not become recurring commitments | PASS |
| 9 | `debitlensEngine.test.ts` | Adversarial Case 5: Refunds (`CREDIT` direction) are excluded from recurring debit totals | PASS |
| 10 | `debitlensEngine.test.ts` | Adversarial Case 6: Reversed transactions (`CREDIT` reversal) do not count as recurring debit occurrences | PASS |
| 11 | `debitlensEngine.test.ts` | Adversarial Case 7: Variable-amount utility commitment (`BESCOM`) is detected as `variableAmount` without false price increase alert | PASS |
| 12 | `debitlensEngine.test.ts` | Adversarial Case 8: Month-end `Jan 31 -> Feb 28 -> Mar 31` payment dates are recognised as `MONTHLY` | PASS |
| 13 | `debitlensEngine.test.ts` | Adversarial Case 9: Annual renewal with only 2 occurrences (~365 days apart) is detected as `YEARLY` | PASS |
| 14 | `debitlensEngine.test.ts` | Adversarial Case 10: Price increase calculates exact delta (+₹30) and annualised impact (+₹360/yr) | PASS |
| 15 | `debitlensEngine.test.ts` | Adversarial Case 11: Post-cancellation debit triggers `POST_CANCEL_ALERT` and links to cancellation session | PASS |
| 16 | `debitlensEngine.test.ts` | Adversarial Case 12: Two payment accounts (`HDFC-XX4821` & `ICICI-CC-9012`) for the same merchant unify into one commitment | PASS |
| 17 | `debitlensEngine.test.ts` | Adversarial Case 13: Duplicate imported transaction IDs are rejected deterministically | PASS |
| 18 | `debitlensEngine.test.ts` | Adversarial Case 14: Incomplete notification record is handled gracefully without crash | PASS |
| 19 | `debitlensEngine.test.ts` | Adversarial Case 15: Generic `UPI/DR/` or `SI-` descriptor without processor or merchant token is NOT misclassified as Razorpay or BillDesk | PASS |
| 20 | `debitlensEngine.test.ts` | RFC-4180 CSV Parser supports quoted commas and escaped double quotes | PASS |
| 21 | `debitlensEngine.test.ts` | Cancellation URLs and Playbooks contain zero fake `.example.com`/`.example.in` domains and zero universal 48-hour rules | PASS |
| 22 | `debitlensEngine.test.ts` | Dynamic Ground-Truth Evaluation computes genuine metrics against `data/ground-truth.json` | PASS |
| 23 | `debitlensEngine.test.ts` | Minor Units conversion (paise) is exact and free of floating-point drift | PASS |
| 24 | `debitlensEngine.test.ts` | Placeholder environment value detector rejects template placeholders | PASS |
| 25 | `debitlensEngine.test.ts` | Three-Way Reconciliation produces accurate outcomes and never claims fraud or non-existent mandates | PASS |
| 26 | `debitlensEngine.test.ts` | Service Terms parser extracts structured billing terms from pasted invoice text and never invents a price when currency token is missing | PASS |
| 27 | `debitlensEngine.test.ts` | All 9 reconciliation outcomes are verified across seed dataset and explicit fixtures (including `FREQUENCY_DISCREPANCY` and `POSSIBLE_DUPLICATE` with/without credit reversal) | PASS |
| 28 | `debitlensEngine.test.ts` | Mandate expiry and non-active status prevent three-way reconciliation from marking `MATCHED`, and post-cancellation explanations respect independent lifecycles | PASS |
| 29 | `debitlensEngine.test.ts` | Evidence Casebook & Independent Cancellation Lifecycles track Layer A and Layer B separately and use accurate `verificationStatus` labels (`IMPORTED_RECORD`, `SYSTEM_GENERATED`, `INFERRED`, `USER_CONFIRMED`) | PASS |
| 30 | `debitlensEngine.test.ts` | Data Coverage summary and Contextual Bhasha Q&A provide grounded, honest responses | PASS |
| 31 | `searchHistory.test.ts` | `normalizeSearchQuery` trims leading/trailing whitespace and collapses internal spaces | PASS |
| 32 | `searchHistory.test.ts` | `addSearchHistoryEntry` prepends new query and ignores blank queries | PASS |
| 33 | `searchHistory.test.ts` | `addSearchHistoryEntry` deduplicates case-insensitively and moves item to top | PASS |
| 34 | `searchHistory.test.ts` | `addSearchHistoryEntry` enforces `maxEntries` limit | PASS |
| 35 | `searchHistory.test.ts` | `removeSearchHistoryEntry` and `clearSearchHistory` remove items properly | PASS |
| 36 | `searchHistory.test.ts` | `filterTransactionsByQuery` and `countDescriptorMatches` match raw descriptors and respect status filter | PASS |

---

## 2. Dynamic Ground-Truth Benchmark Evaluation (`GET /api/detection/metrics` & `POST /api/detection/evaluate`)

All benchmark metrics are dynamically computed by `evaluateDetectionMetricsAgainstGroundTruth` in `src/engine/debitlensEngine.ts` by comparing actual engine output against `data/ground-truth.json`:
- **Total Synthetic Transactions Evaluated:** `45`
- **Labelled Recurring Commitments:** `10` (`True Positives: 10`, `False Positives: 0`, `False Negatives: 0`)
- **Precision / Recall / F1 Score:** `100%` / `100%` / `100%`
- **Merchant Match Accuracy on Labelled Transactions:** `100%`
- **Processor-Only Unmerged Cases (`UPI/DR/42571190/RAZORPAY`, `RAZORPAY*99812-MUM`, `CASHFREE*MERCH-771`):** `3 / 3 isolated (0 False Merges)`
