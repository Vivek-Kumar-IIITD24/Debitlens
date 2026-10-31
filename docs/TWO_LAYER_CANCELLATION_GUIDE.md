# Two-Layer Cancellation & Independent Lifecycle Guide

## 1. Why Single-Layer Cancellation Fails
In Indian recurring payment rails, two separate relationships exist:
- **Layer A — Service Subscription Relationship (`ServiceLifecycleStatus`):** The user's account contract with the merchant (e.g., StreamBox, MusicFlow, DesignVault).
- **Layer B — Payment Collection Authorisation (`MandateLifecycleStatus`):** The bank or payment rail mandate (`UPI_AUTOPAY`, `CARD_EMANDATE`, `ENACH_NACH`, `GOOGLE_PLAY`) that permits automated pull debits.

If a user cancels only Layer A, an unrevoked Layer B mandate can still allow a trailing or erroneous debit to pass. Conversely, if a user revokes only Layer B for a contractual obligation (such as a Bajaj Finance loan EMI or Max Life insurance policy), they may incur bounce charges, late fees, or policy lapse without terminating the underlying contract.

## 2. Two Independent Lifecycle State Machines

### Layer A: `ServiceLifecycleStatus` (`PATCH /api/cancellations/:id/service-status`)
- `UNKNOWN`
- `ACTIVE`
- `CANCELLATION_REQUESTED`
- `CANCELLATION_REPORTED_BY_USER`
- `CANCELLATION_EVIDENCE_ATTACHED`
- `CANCELLED`
- `CANCELLATION_REJECTED`
- `CANCELLATION_DISPUTED`
- `MERCHANT_UNRESPONSIVE`
- `EXPIRED`

### Layer B: `MandateLifecycleStatus` (`PATCH /api/cancellations/:id/mandate-status`)
- `UNKNOWN`
- `ACTIVE`
- `PAUSED`
- `PAUSED_REPORTED_BY_USER`
- `REVOCATION_REQUESTED`
- `REVOCATION_REPORTED_BY_USER`
- `REVOCATION_EVIDENCE_ATTACHED`
- `REVOKED`
- `REVOCATION_FAILED`
- `MANDATE_NOT_VISIBLE_IN_IMPORTED_DATA`
- `EXPIRED`

## 3. Financial Obligation Guardrail
For contractual obligations (`isFinancialObligation: true`, such as Bajaj Finance EMI and Max Life Insurance), DebitLens displays a prominent warning instructing the user **not** to blindly revoke the eNACH mandate without obtaining a loan foreclosure/NOC or policy surrender confirmation first.

## 4. Post-Cancellation Monitoring (`GET /api/cancellations/:id/monitoring`)
After a user records cancellation/revocation timestamps and reference numbers, any subsequent statement import is checked against `serviceCancelledAt` and `paymentAuthorisationRevokedAt`. If a debit occurs after cancellation (e.g., `TXN-9104` for DesignVault), DebitLens flags `POST_CANCELLATION_DEBIT_DETECTED` and updates the three-way reconciliation status to `CONFLICTING_EVIDENCE`.
