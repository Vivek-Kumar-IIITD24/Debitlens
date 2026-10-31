# DebitLens Evidence Casebook & Audit Timeline

## 1. Dispute-Ready Evidence Chain (`GET /api/commitments/:id/evidence`)
When a consumer disputes an unexpected debit or a post-cancellation charge with a merchant or bank/card issuer, screenshots alone are rarely sufficient. They need a chronological chain of evidence linking:
1. **Payment Authorisation (`MANDATE_RECORD`):** Mandate reference (`UMN-...`, `SIHUB-...`, `NACH-...`), authorised ceiling (`maxAmountMinor`), payment rail, and start date.
2. **Documented Service Terms (`SERVICE_TERMS_DOCUMENT`):** Invoice ID, contracted plan price (`expectedAmountMinor`), billing frequency, and raw document excerpt.
3. **Statement Transactions (`TRANSACTION_EVIDENCE`):** Exact booking dates, raw descriptors, UTR/reference IDs, amounts in paise, and matching rules.
4. **Service Cancellation Event (`SERVICE_CANCELLATION_EVENT`):** Layer A merchant cancellation confirmation reference and timestamp.
5. **Mandate Revocation Event (`MANDATE_REVOCATION_EVENT`):** Layer B bank/UPI mandate revocation reference and timestamp.
6. **Three-Way Reconciliation Finding (`RECONCILIATION_FINDING`):** Computed discrepancy or conflicting-evidence summary with epistemic caveat.
7. **Post-Cancellation Monitoring Alert (`POST_CANCELLATION_MONITORING`):** Any subsequent debit detected after recorded cancellation.
8. **User-Attached Evidence (`USER_CUSTOM_EVIDENCE`):** Additional ticket numbers or bank dispute references added via `POST /api/commitments/:id/evidence`.

## 2. Immutable Audit Event Log (`AuditEventRecord`)
Every state change across the platform appends a timestamped `AuditEventRecord`:
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
