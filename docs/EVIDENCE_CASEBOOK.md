# DebitLens Evidence Casebook & Append-Only Application Audit Timeline

## 1. Dispute-Ready Evidence Chain (`GET /api/commitments/:id/evidence`)
When a consumer disputes an unexpected debit or a post-cancellation charge with a merchant or bank/card issuer, screenshots alone are rarely sufficient. They need a chronological chain of evidence with accurate provenance and verification status labels (`verificationStatus`):
1. **Payment Authorisation (`MANDATE_RECORD`):** Mandate reference (`UMN-...`, `SIHUB-...`, `NACH-...`), authorised ceiling (`maxAmountMinor`), payment rail, and start date. Labelled `USER_CONFIRMED` when manually entered by the user, or `IMPORTED_RECORD` when loaded from imported/demo-seeded mandate records (never automatically labelled independently `CONFIRMED`).
2. **Documented Service Terms (`SERVICE_TERMS_DOCUMENT`):** Invoice ID, contracted plan price (`expectedAmountMinor`), billing frequency, and raw document excerpt. Labelled `USER_CONFIRMED` when explicitly verified by the user, or `INFERRED` when extracted from pasted text and awaiting user confirmation.
3. **Statement Transactions (`TRANSACTION_EVIDENCE`):** Exact booking dates, raw descriptors, UTR/reference IDs, amounts in paise, and matching rules (`CONFIRMED` / `USER_CONFIRMED` / `INFERRED`).
4. **Service Cancellation Event (`SERVICE_CANCELLATION_EVENT`):** Layer A merchant cancellation confirmation reference (`evidenceType === 'SERVICE_CONFIRMATION'`) and timestamp. Labelled `USER_CONFIRMED` when reference evidence is attached, or `INFERRED` when user-reported without a reference.
5. **Mandate Revocation Event (`MANDATE_REVOCATION_EVENT`):** Layer B bank/UPI mandate revocation reference (`evidenceType === 'MANDATE_REVOCATION'`) and timestamp. Labelled `USER_CONFIRMED` when reference evidence is attached, or `INFERRED` when user-reported without a reference.
6. **Three-Way Reconciliation Finding (`RECONCILIATION_FINDING`):** Computed discrepancy or conflicting-evidence summary with epistemic caveat. Labelled `SYSTEM_GENERATED` (distinguishing computed analytical output from externally verified evidence).
7. **Post-Cancellation Monitoring Alert (`POST_CANCELLATION_MONITORING`):** Any subsequent debit detected after recorded cancellation. Labelled `SYSTEM_GENERATED`.
8. **User-Attached Evidence (`USER_CUSTOM_EVIDENCE`):** Additional ticket numbers or bank dispute references added via `POST /api/commitments/:id/evidence` (`USER_CONFIRMED`).

## 2. Append-Only Application Audit Timeline (`AuditEventRecord`)
Every state change across the platform appends a timestamped `AuditEventRecord` to the application audit timeline (persisted atomically via temporary file + `fs.renameSync` to `data/persistent-store.json`):
- `CANDIDATE_CONFIRMED` / `CANDIDATE_REJECTED`
- `IDENTITY_MATCH_CONFIRMED`
- `MANDATE_IMPORTED`
- `SERVICE_TERMS_ATTACHED`
- `RECONCILIATION_EVALUATED`
- `SERVICE_STATUS_UPDATED` / `MANDATE_STATUS_UPDATED`
- `EVIDENCE_ATTACHED`
- `POST_CANCELLATION_DEBIT_DETECTED`
- `GUARDRAIL_UPDATED`
- `JUDGE_DEMO_SCENARIO_TRIGGERED`
