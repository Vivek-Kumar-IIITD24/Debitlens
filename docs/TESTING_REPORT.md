# Testing & Ground-Truth Evaluation Report (`DebitLens`)

## 1. Automated Unit & Adversarial Test Suite (`src/engine/debitlensEngine.test.ts`)

Run command:
```bash
npx --yes tsx --test src/engine/debitlensEngine.test.ts
```

### Summary of Results: **22 / 22 Passing (0 Failures)**

| Test # | Test Name | Status |
|---|---|---|
| 1 | Neo4j Test 1 & 6: Different aliases resolve to StreamBox while processor-only RAZORPAY stays UNRESOLVED | PASS |
| 2 | Neo4j Test 2, 3, 4, 5: Temporal recurrence, price increase, resumed pattern, trial conversion, and post-cancellation detection | PASS |
| 3 | Neo4j Commitment Graph builder constructs full path and executes Cypher Operations 1–7 | PASS |
| 4 | Sarvam Tests 1–8: Grounded English & Hindi explanations, unknown merchant uncertainty, privacy masking, and two-layer playbook safety | PASS |
| 5 | Adversarial Case 1: Similar merchant names (`RZP*STREAMPLUS-MEDIA`) do not falsely collide with StreamBox | PASS |
| 6 | Adversarial Case 2: Two different merchants using the same payment processor (`Razorpay`) remain separate commitments | PASS |
| 7 | Adversarial Case 3: Unknown processor-only descriptor (`UPI/DR/42571190/RAZORPAY`) stays isolated and never creates a commitment | PASS |
| 8 | Adversarial Case 4: Repeated one-time retail purchases (`POS-GROCERY-MART-BLR`) do not become recurring commitments | PASS |
| 9 | Adversarial Case 5: Refunds (`CREDIT` direction) are excluded from recurring debit totals | PASS |
| 10 | Adversarial Case 6: Reversed transactions (`CREDIT` reversal) do not count as recurring debit occurrences | PASS |
| 11 | Adversarial Case 7: Variable-amount utility commitment (`BESCOM`) is detected as `variableAmount` without false price increase alert | PASS |
| 12 | Adversarial Case 8: Month-end `Jan 31 -> Feb 28 -> Mar 31` payment dates are recognised as `MONTHLY` | PASS |
| 13 | Adversarial Case 9: Annual renewal with only 2 occurrences (~365 days apart) is detected as `YEARLY` | PASS |
| 14 | Adversarial Case 10: Price increase calculates exact delta (+₹30) and annualised impact (+₹360/yr) | PASS |
| 15 | Adversarial Case 11: Post-cancellation debit triggers `POST_CANCEL_ALERT` and links to cancellation session | PASS |
| 16 | Adversarial Case 12: Two payment accounts (`HDFC-XX4821` & `ICICI-CC-9012`) for the same merchant unify into one commitment | PASS |
| 17 | Adversarial Case 13: Duplicate imported transaction IDs are rejected deterministically | PASS |
| 18 | Adversarial Case 14: Incomplete notification record is handled gracefully without crash | PASS |
| 19 | Adversarial Case 15: Generic `UPI/DR/` or `SI-` descriptor without processor or merchant token is NOT misclassified as Razorpay or BillDesk | PASS |
| 20 | RFC-4180 CSV Parser supports quoted commas and escaped double quotes | PASS |
| 21 | Cancellation URLs and Playbooks contain zero fake `.example.com`/`.example.in` domains and zero universal 48-hour rules | PASS |
| 22 | Dynamic Ground-Truth Evaluation computes genuine metrics against `data/ground-truth.json` | PASS |

---

## 2. Dynamic Ground-Truth Benchmark Evaluation (`GET /api/detection/metrics` & `POST /api/detection/evaluate`)

All benchmark metrics are dynamically computed by `evaluateDetectionMetricsAgainstGroundTruth` in `src/engine/debitlensEngine.ts` by comparing actual engine output against `data/ground-truth.json`:
- **Total Synthetic Transactions Evaluated:** `45`
- **Labelled Recurring Commitments:** `10` (`True Positives: 10`, `False Positives: 0`, `False Negatives: 0`)
- **Precision / Recall / F1 Score:** `100%` / `100%` / `100%`
- **Merchant Match Accuracy on Labelled Transactions:** `100%`
- **Processor-Only Unmerged Cases (`UPI/DR/42571190/RAZORPAY`, `RAZORPAY*99812-MUM`, `BILLDESK*TXN88410`):** `3 / 3 isolated (0 False Merges)`
