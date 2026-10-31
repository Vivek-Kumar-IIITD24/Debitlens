# Neo4j Financial Commitment & Reconciliation Graph Schema

## 1. Architectural Role of Neo4j AuraDB
DebitLens uses **Neo4j AuraDB** via the official `neo4j-driver` package as its persistent graph store for financial relationships. All demo nodes are namespaced with `demoNamespace: "DEBITLENS_DEMO_V1"` so demo rebuilds (`POST /api/graph/rebuild-demo`) only affect demo entities and preserve schema constraints.

## 2. Node Labels
- `User` — Primary account holder (`USER-DEMO-01`)
- `Account` — Bank or card accounts (`HDFC-XX4821`, `ICICI-CC-9012`, `SBI-XX1109`)
- `ImportBatch` — Statement import batch metadata (`BATCH-SEED-01`)
- `Transaction` — Individual debit/credit records with `amountMinor` (paise), `rawDescription`, `status`, `matchingMethod`, `confidence`
- `Descriptor` — Raw and normalised statement descriptor nodes (`RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX`)
- `Merchant` — Canonical merchant entities (`MERCH-STREAMBOX`, `MERCH-MUSICFLOW`, etc.)
- `PaymentProcessor` — Intermediary payment gateways (`PROC-RAZORPAY`, `PROC-BILLDESK`, `PROC-CASHFREE`)
- `Service` — Specific subscription plans or financial obligations
- `Commitment` / `FinancialCommitment` / `RecurringCandidate` — Detected recurring commitments with `entityClass`, `verificationStatus`, `serviceLifecycleStatus`, `mandateLifecycleStatus`
- `Mandate` — Imported payment authorisations (`MND-STREAMBOX-01`, `maxAmountMinor`, `mandateStatus`)
- `PaymentRail` — Underlying collection rail (`UPI_AUTOPAY`, `CARD_EMANDATE`, `ENACH_NACH`, `GOOGLE_PLAY`)
- `Document` — Extracted service terms / invoice documents (`DOC-STREAMBOX-01`, `expectedAmountMinor`, `billingFrequency`)
- `ReconciliationFinding` — Three-way reconciliation outcome (`REC-CMT-STREAMBOX`, `status`, `discrepancyAmountMinor`, `withinMandateLimit`)
- `NotificationEvent` — Pre-debit or trial-started notifications (`NOTIF-01`, `NOTIF-02`, `NOTIF-03`)
- `CancellationPlaybook` — Mechanism-specific two-layer cancellation playbooks
- `CancellationSession` — User cancellation workflow state
- `CancellationStep` — Individual Layer A and Layer B steps
- `CancellationEvidence` — Retained user cancellation/revocation references
- `DetectionAlert` — Temporal, price-increase, or post-cancellation alerts

## 3. Relationship Types & Evidence Properties
Every relationship stores `id`, `status` (`CONFIRMED`, `INFERRED`, `USER_CONFIRMED`, `UNRESOLVED`), `confidence` (0–100), `matchingMethod`, `evidenceType`, `sourceReference`, `createdAt`, and `evidenceSummary`:
- `(User)-[:USER_OWNS_ACCOUNT]->(Account)`
- `(ImportBatch)-[:IMPORT_BATCH_CONTAINS_TRANSACTION]->(Transaction)`
- `(Account)-[:ACCOUNT_HAS_TRANSACTION]->(Transaction)`
- `(Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(Descriptor)`
- `(Descriptor)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(Merchant)`
- `(Transaction)-[:TRANSACTION_PROCESSED_BY]->(PaymentProcessor)`
- `(Merchant)-[:MERCHANT_OFFERS_SERVICE]->(Service)`
- `(Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(Commitment)`
- `(Commitment)-[:COMMITMENT_FOR_SERVICE]->(Service)`
- `(Commitment)-[:COMMITMENT_AUTHORISED_BY]->(Mandate)`
- `(Mandate)-[:MANDATE_USES_RAIL]->(PaymentRail)`
- `(Document)-[:DOCUMENT_DESCRIBES_COMMITMENT]->(Commitment)`
- `(Commitment)-[:COMMITMENT_HAS_RECONCILIATION]->(ReconciliationFinding)`
- `(Service)-[:SERVICE_HAS_CANCELLATION_PLAYBOOK]->(CancellationPlaybook)`
- `(Commitment)-[:COMMITMENT_HAS_ALERT]->(DetectionAlert)`
- `(DetectionAlert)-[:ALERT_SUPPORTED_BY]->(Transaction)`
- `(Commitment)-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(CancellationSession)`
- `(CancellationSession)-[:SESSION_HAS_STEP]->(CancellationStep)`
- `(CancellationSession)-[:SESSION_HAS_EVIDENCE]->(CancellationEvidence)`
- `(NotificationEvent)-[:NOTIFICATION_SUPPORTS_COMMITMENT]->(Commitment)`

## 4. Uniqueness Constraints Verified via `SHOW CONSTRAINTS`
`ensureConstraints()` creates and verifies 19 uniqueness constraints (`user_id_unique`, `account_id_unique`, `batch_id_unique`, `txn_id_unique`, `descriptor_id_unique`, `merchant_id_unique`, `processor_id_unique`, `service_id_unique`, `commitment_id_unique`, `mandate_id_unique`, `rail_id_unique`, `notif_id_unique`, `playbook_id_unique`, `session_id_unique`, `step_id_unique`, `evidence_id_unique`, `alert_id_unique`, `doc_id_unique`, `rec_id_unique`) and executes `SHOW CONSTRAINTS YIELD name RETURN count(name) AS cnt` to confirm active schema enforcement.
