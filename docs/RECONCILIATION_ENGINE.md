# Three-Way Financial Reconciliation Engine Specification

## 1. Overview
Traditional subscription trackers only look at bank statement rows. They cannot tell whether a ₹799 debit was actually the price the user agreed to on their invoice, or why the bank allowed a higher debit without asking for a new OTP.

DebitLens performs **Three-Way Financial Reconciliation** across:
1. **Layer 1 — Documented Service Terms / Invoices (`ServiceTermsRecord`):** Expected plan price (`expectedAmountMinor`), billing cadence, trial end date, and cancellation notice period.
2. **Layer 2 — Actual Statement Transactions (`TransactionRecord`):** Observed debits in integer minor units (`amountMinor` in paise) and observed cadence.
3. **Layer 3 — Available Payment Authorisations (`MandateRecord`):** Active UPI AutoPay, Card Standing Instruction, or eNACH mandate ceiling (`maxAmountMinor`) and lifecycle status.

## 2. Exact Minor-Unit Arithmetic (`paise`)
All monetary comparisons in `src/utils/currency.ts` and `src/engine/reconciliationEngine.ts` operate on integer minor units (`1 INR = 100 paise`) via `toMinorUnits(amount)` and `fromMinorUnits(minor)` to eliminate IEEE-754 floating-point drift.

## 3. Nine Deterministic Reconciliation Statuses
1. `MATCHED`: Statement debit, documented service invoice price, and active mandate ceiling are aligned (e.g., CloudNotes Pro ₹1,499/year; Bajaj Finance EMI ₹4,250/month; StreamBox initial seed ₹499/month).
2. `AMOUNT_DISCREPANCY`: Actual statement debit differs from documented service terms price (e.g., MusicFlow ₹199 invoice vs ₹249 debit; or the **Section 22 StreamBox Judge Demo** where expected invoice is ₹499, actual debit is ₹799, and UPI AutoPay mandate ceiling is ₹999 → `+₹300` discrepancy that passed automatically because ₹799 ≤ ₹999).
3. `FREQUENCY_DISCREPANCY`: Observed transaction cadence differs from documented service billing frequency (e.g., Max Life Insurance policy vs irregular NACH presentation).
4. `TRANSACTION_WITHOUT_VISIBLE_MANDATE`: Recurring debits exist in the imported statement, but no matching mandate exists in the imported mandate registry (e.g., FitClub Card Standing Instruction). Always states: *"No matching mandate was found in the available imported records."*
5. `MANDATE_WITHOUT_RECENT_TRANSACTION`: An active mandate exists in the imported registry (`MND-DORMANT-NEWSPLUS` up to ₹399/month), but no recent debit transactions occurred in the statement window.
6. `SERVICE_TERMS_UNAVAILABLE`: Statement debits and mandate ceiling are present, but no invoice or service terms document has been attached yet (e.g., ReadCloud Digital ₹299/month).
7. `POSSIBLE_DUPLICATE`: Two identical debits for the same commitment occurred within 48 hours without a corresponding credit reversal.
8. `CONFLICTING_EVIDENCE`: A debit occurred after a recorded service cancellation and/or mandate revocation reference (e.g., DesignVault `TXN-9104` on `2026-10-26` after cancellation on `2026-09-10` with ref `DV-CANC-20260910-881`).
9. `UNRESOLVED`: Processor-only or unidentified statement descriptors (`TXN-9501`, `TXN-9502`, `TXN-9503`) that are intentionally kept isolated until merchant identity is verified.
