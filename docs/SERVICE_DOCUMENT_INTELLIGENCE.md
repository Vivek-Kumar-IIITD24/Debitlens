# Service Document & Invoice Intelligence Specification

## 1. Purpose
To perform genuine Three-Way Reconciliation, DebitLens compares the user's contracted service terms (expected plan price, billing cycle, free-trial expiry date, renewal date, and cancellation notice window) against actual statement debits and payment mandate limits.

## 2. Supported Intake Modes (`POST /api/service-documents` & `POST /api/service-terms`)
DebitLens supports text-based and structured service terms intake (it does **not** claim general binary PDF file upload or optical character recognition / OCR):
1. **Pasted Invoice / Receipt / Trial Confirmation Text (`PASTED_INVOICE_TEXT`)**
2. **Structured JSON Import (`STRUCTURED_JSON`)**
3. **Manual Verified Entry (`MANUAL_ENTRY`)**

## 3. Deterministic Explainable Parser (`extractServiceTermsFromText`)
Located in `src/engine/reconciliationEngine.ts`, the parser extracts:
- `expectedAmountMinor` & `expectedAmount`: Parses explicit `INR`, `Rs.`, or `₹` currency tokens into exact paise (`toMinorUnits`). **Missing Price Rule:** If no currency token is found in the pasted text, `expectedAmountMinor` and `expectedAmount` remain `null` (never invented or defaulted to ₹499), and reconciliation reports `SERVICE_TERMS_UNAVAILABLE`.
- `billingFrequency`: Detects `MONTHLY`, `YEARLY`, `QUARTERLY`, `WEEKLY`, or `FORTNIGHTLY` cadence tokens.
- `trialEndDate` & `renewalDate`: Extracts ISO dates (`YYYY-MM-DD`) associated with trial windows and renewal schedules.
- `cancellationNoticeDays`: Extracts notice period requirements (e.g., `"Cancel at least 2 days before next billing date"` → `2`).

## 4. Field-Level Provenance, Extracted-Field Preview & Explicit User Confirmation
Every extracted field includes:
- `fieldName`
- `extractedValue`
- `confidence` (0–100)
- `sourceSnippet` (exact substring from the invoice text)
- `userVerified` (`boolean`, always kept synchronized with the parent document's `userVerified` status)

When a user submits **Pasted Invoice Text** (`PASTED_INVOICE_TEXT`), the extracted record defaults to `userVerified: false` (and all `extractedFields` have `userVerified: false`). The Reconciliation Centre UI displays an **Extracted-Field Preview** showing each parsed value, confidence score, and source snippet, and provides an explicit **"Confirm & Verify Extracted Terms"** action (`userVerified: true`) so unverified text extractions are never silently marked as user-confirmed.
