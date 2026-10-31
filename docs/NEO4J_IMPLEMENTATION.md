# Neo4j Partner Track Implementation — Financial Commitment Graph (`DebitLens`)

## 1. Architectural Role

DebitLens models recurring financial commitments as a connected multi-hop knowledge graph in **Neo4j AuraDB** via the official `neo4j-driver` TypeScript/Node.js driver (`src/services/neo4jPersistenceService.ts`).

### Execution Mode Transparency
DebitLens never fabricates live database status:
- **`LIVE_NEO4J`**: Reported only when `NEO4J_URI`, `NEO4J_USERNAME`, and `NEO4J_PASSWORD` are configured and `driver.verifyConnectivity()` + live Cypher graph queries succeed.
- **`LOCAL_PREVIEW`**: Reported when Neo4j AuraDB credentials are not set in `.env` and `ALLOW_LOCAL_PREVIEW=true`.
- **`NOT_CONFIGURED`**: Reported when credentials are absent and local preview is disabled.
- **`CONNECTION_FAILED`**: Reported when credentials are provided but connectivity verification fails.

---

## 2. Complete Graph Schema (17 Node Labels & 18 Relationship Types)

### 2.1 Node Labels (17) with Uniqueness Constraints
Every node label has an explicit `CREATE CONSTRAINT ... IF NOT EXISTS FOR (n:Label) REQUIRE n.id IS UNIQUE`:
1. `:User` (`id`, `title`, `profileType`, `currency`)
2. `:Account` (`id`, `accountAlias`, `masked`)
3. `:ImportBatch` (`id`, `totalRecords`, `source`)
4. `:Transaction` (`id`, `transactionId`, `date`, `amount`, `rawDescription`, `accountAlias`)
5. `:Descriptor` (`id`, `rawDescriptor`, `normalisedDescriptor`, `matchingMethod`)
6. `:Merchant` (`id`, `canonicalName`, `category`, `isFinancialObligation`)
7. `:PaymentProcessor` (`id`, `processorName`)
8. `:Service` (`id`, `serviceName`, `typicalAmount`, `latestAmount`)
9. `:Commitment` (`id`, `recurrenceType`, `annualisedAmount`, `monthlyEquivalent`, `nextExpectedDate`, `status`)
10. `:Mandate` (`id`, `mandateRef`, `paymentRail`, `status`)
11. `:PaymentRail` (`id`, `railType`, `officialSupportUrl`)
12. `:NotificationEvent` (`id`, `eventType`, `eventDate`, `description`)
13. `:CancellationPlaybook` (`id`, `officialServiceUrl`, `officialRailSupportUrl`, `lastVerifiedDate`)
14. `:CancellationSession` (`id`, `status`, `serviceCancelledAt`, `paymentAuthorisationRevokedAt`)
15. `:CancellationStep` (`id`, `layer`, `completed`)
16. `:CancellationEvidence` (`id`, `referenceNumber`, `evidenceDate`, `description`)
17. `:DetectionAlert` (`id`, `alertType`, `severity`, `title`)

### 2.2 Relationship Types (18) with Evidence Metadata
Every persisted relationship stores `confidenceScore`, `relationshipStatus` (`CONFIRMED`, `INFERRED`, `USER_CONFIRMED`, `UNRESOLVED`), `evidenceType`, `matchMethod`, `sourceReference`, and `createdAt`:
1. `(:User)-[:USER_OWNS_ACCOUNT]->(:Account)`
2. `(:Account)-[:ACCOUNT_HAS_TRANSACTION]->(:Transaction)`
3. `(:ImportBatch)-[:IMPORT_BATCH_CONTAINS_TRANSACTION]->(:Transaction)`
4. `(:Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(:Descriptor)`
5. `(:Descriptor)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(:Merchant)`
6. `(:Transaction)-[:TRANSACTION_PROCESSED_BY]->(:PaymentProcessor)`
7. `(:Merchant)-[:MERCHANT_OFFERS_SERVICE]->(:Service)`
8. `(:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(:Commitment)`
9. `(:Commitment)-[:COMMITMENT_FOR_SERVICE]->(:Service)`
10. `(:Commitment)-[:COMMITMENT_AUTHORISED_BY]->(:Mandate)`
11. `(:Mandate)-[:MANDATE_USES_RAIL]->(:PaymentRail)`
12. `(:Service)-[:SERVICE_HAS_CANCELLATION_PLAYBOOK]->(:CancellationPlaybook)`
13. `(:Commitment)-[:COMMITMENT_HAS_ALERT]->(:DetectionAlert)`
14. `(:DetectionAlert)-[:ALERT_SUPPORTED_BY]->(:Transaction)`
15. `(:Commitment)-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(:CancellationSession)`
16. `(:CancellationSession)-[:SESSION_HAS_STEP]->(:CancellationStep)`
17. `(:CancellationSession)-[:SESSION_HAS_EVIDENCE]->(:CancellationEvidence)`
18. `(:NotificationEvent)-[:NOTIFICATION_SUPPORTS_COMMITMENT]->(:Commitment)`

---

## 3. Parameterised Cypher Operations (Operations 1–7)

### Operation 1 — Merchant Alias Resolution
Unifies `RZP*STREAMBOX`, `STREAMBOX*BILL`, and `RAZORPAY*STREAMBOX` under `:Merchant {id: 'MERCH-STREAMBOX'}`:
```cypher
MATCH (t:Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)-[r:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(m:Merchant {id: $merchantId})
RETURN m.canonicalName AS merchant, d.rawDescriptor AS descriptor, r.matchingMethod AS method, r.confidence AS confidence, count(t) AS txnCount
ORDER BY txnCount DESC
```

### Operations 2, 3 & 4 — Cross-Source Commitment Evidence & Irregular Interval Discovery
Retrieves all transactions, descriptors, accounts, and notifications supporting a commitment across batches:
```cypher
MATCH (a:Account)-[:ACCOUNT_HAS_TRANSACTION]->(t:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c:Commitment {id: $commitmentId})
MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
OPTIONAL MATCH (n:NotificationEvent)-[:NOTIFICATION_SUPPORTS_COMMITMENT]->(c)
RETURN t.transactionId AS txnId, t.transactionDate AS date, d.rawDescriptor AS descriptor, t.amount AS amount, a.accountAlias AS account, collect(n.eventType) AS notifications
ORDER BY t.transactionDate ASC
```

### Operation 5 — Resumed Commitments After Interval Gap
Identifies commitments like `ReadCloud` (`RZP*READCLOUD` + `READCLOUD*SUB`) that paused in Jun–Jul 2026 and resumed in Aug–Oct 2026:
```cypher
MATCH (t:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c:Commitment {recurrenceType: 'RESUMED'})
MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
RETURN c.id AS commitmentId, c.serviceName AS service, t.transactionId AS txnId, t.transactionDate AS date, d.rawDescriptor AS descriptor, t.amount AS amount
ORDER BY t.transactionDate ASC
```

### Operation 6 — Post-Cancellation Subsequent Debit Detection
Traverses `CancellationSession` and flags any connected `Transaction` dated after `serviceCancelledAt` (`DesignVault` `TXN-9104` on `2026-10-26` after `2026-09-10` cancellation):
```cypher
MATCH (c:Commitment)-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(s:CancellationSession)
WHERE s.serviceCancelledAt IS NOT NULL
MATCH (t:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c)
WHERE date(t.transactionDate) > date(s.serviceCancelledAt)
OPTIONAL MATCH (s)-[:SESSION_HAS_EVIDENCE]->(e:CancellationEvidence)
RETURN c.id AS commitmentId, c.serviceName AS service, s.serviceCancelledAt AS cancelledOn, t.transactionId AS subsequentTxnId, t.transactionDate AS debitDate, t.amount AS amount, collect(e.referenceNumber) AS evidenceRefs
```

### Operation 7 — Unknown Processor-Only Isolation
Ensures `UPI/DR/42571190/RAZORPAY` (`TXN-9501`) links to `:PaymentProcessor {id: 'PROC-RAZORPAY'}` but never merges into `StreamBox`, `ReadCloud`, or `LearnPro AI`:
```cypher
MATCH (t:Transaction)-[:TRANSACTION_PROCESSED_BY]->(p:PaymentProcessor)
MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
WHERE NOT (d)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(:Merchant)
RETURN t.transactionId AS txnId, t.transactionDate AS date, d.rawDescriptor AS rawDescriptor, p.processorName AS processor, t.amount AS amount, 'UNRESOLVED_REVIEW_CASE' AS status
ORDER BY t.transactionDate DESC
```
