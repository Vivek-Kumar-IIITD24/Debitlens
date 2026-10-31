# Three-Way Financial Reconciliation Engine Specification

## 1. Overview
Traditional subscription trackers only look at bank statement rows. They cannot tell whether a ₹799 debit was actually the price the user agreed to on their invoice, or why the bank allowed a higher debit without asking for a new OTP.

DebitLens performs **Three-Way Financial Reconciliation** across:
1. **Layer 1 — Documented Service Terms / Invoices (`ServiceTermsRecord`):** Expected plan price (`expectedAmountMinor`, or `null` when unavailable), billing cadence, trial end date, and cancellation notice period.
2. **Layer 2 — Actual Statement Transactions (`TransactionRecord`):** Observed debits in integer minor units (`amountMinor` in paise) and observed cadence, plus any matching `CREDIT` reversals/refunds.
3. **Layer 3 — Available Payment Authorisations (`MandateRecord`):** Active UPI AutoPay, Card Standing Instruction, or eNACH mandate ceiling (`maxAmountMinor`), lifecycle status (`mandateStatus`), and expiry date (`endDate`).

## 2. Exact Minor-Unit Arithmetic (`paise`) & Dynamic Timestamps
All monetary comparisons in `src/utils/currency.ts` and `src/engine/reconciliationEngine.ts` operate on integer minor units (`1 INR = 100 paise`) via `toMinorUnits(amount)` and `fromMinorUnits(minor)` to eliminate IEEE-754 floating-point drift. Every newly generated `ReconciliationFindingRecord` sets `evaluatedAt` dynamically (`new Date().toISOString()`).

## 3. Nine Deterministic Reconciliation Statuses
1. `MATCHED`: Statement debit, documented service invoice price, and active non-expired mandate ceiling are aligned (`mandate.mandateStatus === 'ACTIVE'` and `!mandate.endDate || Date.parse(mandate.endDate) >= Date.parse(latestTxnDate)`) (e.g., CloudNotes Pro ₹1,499/year; Bajaj Finance EMI ₹8,450/month; LearnPro AI ₹999/month; StreamBox initial seed ₹499/month).
2. `AMOUNT_DISCREPANCY`: Actual statement debit differs from documented service terms price (e.g., MusicFlow ₹199 invoice vs ₹249 debit; or the **Section 22 StreamBox Judge Demo** where expected invoice is ₹499, actual debit is ₹799, and UPI AutoPay mandate ceiling is ₹999 → `+₹300` discrepancy that passed automatically because ₹799 ≤ ₹999).
3. `FREQUENCY_DISCREPANCY`: Observed transaction cadence differs from documented service billing frequency while amount and mandate ceiling align (e.g., Max Life Insurance `CMT-MAXLIFE`: ₹12,850 `QUARTERLY` policy schedule vs `IRREGULAR` NACH presentation intervals of 138d and 108d).
4. `TRANSACTION_WITHOUT_VISIBLE_MANDATE`: Recurring debits exist in the imported statement, but no matching mandate exists in the imported mandate registry (e.g., FitClub Card Standing Instruction). Always states: *"No matching mandate was found in the available imported records."*
5. `MANDATE_WITHOUT_RECENT_TRANSACTION`: An active mandate exists in the imported registry (either standalone like `MND-DORMANT-NEWSPLUS` up to ₹399/month, or linked to an existing commitment that has zero matching debit transactions in the imported statement period).
6. `SERVICE_TERMS_UNAVAILABLE`: Statement debits and active mandate ceiling are present, but either no invoice/service terms document has been attached (`CMT-READCLOUD` ₹299/month, `CMT-BESCOM`) or the attached pasted invoice text contained no extractable currency token (`expectedAmountMinor === null`).
7. `POSSIBLE_DUPLICATE`: Two identical debits for the same commitment occurred within 48 hours **without** a matching `CREDIT` reversal or refund within 7 days. If a matching `CREDIT` reversal offsets the duplicate debit, `POSSIBLE_DUPLICATE` is not raised.
8. `CONFLICTING_EVIDENCE`: Either (a) a debit occurred after a recorded service cancellation and/or mandate revocation reference (e.g., DesignVault `TXN-9104` on `2026-10-26` after Layer A service cancellation ref `DV-CANC-20260910-881` and Layer B mandate revocation ref `SIHUB-REV-994012` on `2026-09-10`, reporting each layer independently based only on its actual recorded evidence), or (b) a debit occurred against a mandate whose `mandateStatus !== 'ACTIVE'` or whose `endDate` expired prior to the debit date.
9. `UNRESOLVED`: Processor-only or unidentified statement descriptors (`TXN-9501`, `TXN-9502`, `TXN-9503`) that are intentionally kept isolated until merchant identity is verified.
