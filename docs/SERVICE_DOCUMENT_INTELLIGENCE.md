# Service Document & Invoice Intelligence Specification

## 1. Purpose
To perform genuine Three-Way Reconciliation, DebitLens needs the user's contracted service terms (expected plan price, billing cycle, free-trial expiry date, renewal date, and cancellation notice window).

## 2. Intake Modes (`POST /api/service-documents` & `POST /api/service-terms`)
Users can provide service terms via:
1. **Pasted Invoice / Receipt / Trial Confirmation Text (`PASTED_INVOICE_TEXT`)**
2. **Structured JSON Import (`STRUCTURED_JSON`)**
3. **Manual Verified Entry (`MANUAL_ENTRY`)**

## 3. Deterministic Explainable Parser (`extractServiceTermsFromText`)
Located in `src/engine/reconciliationEngine.ts`, the parser extracts:
- `expectedAmountMinor` & `expectedAmount`: Parses `INR`, `Rs.`, or `₹` currency tokens into exact paise (`toMinorUnits`).
- `billingFrequency`: Detects `MONTHLY`, `YEARLY`, `QUARTERLY`, `WEEKLY`, or `FORTNIGHTLY` cadence tokens.
- `trialEndDate` & `renewalDate`: Extracts ISO dates (`YYYY-MM-DD`) associated with trial windows and renewal schedules.
- `cancellationNoticeDays`: Extracts notice period requirements (e.g., `"Cancel at least 2 days before next billing date"` → `2`).

## 4. Field-Level Provenance & User Verification
Every extracted field includes:
- `fieldName`
- `extractedValue`
- `confidence` (0–100)
- `sourceSnippet` (exact substring from the invoice text)
- `userVerified` (`boolean`)

When a new service document is attached, DebitLens immediately re-evaluates `reconcileCommitment()`, writes an `AuditEventRecord` (`SERVICE_TERMS_ATTACHED`), and syncs the `Document` node (`DOCUMENT_DESCRIBES_COMMITMENT`) and updated `ReconciliationFinding` node (`COMMITMENT_HAS_RECONCILIATION`) to Neo4j AuraDB.
