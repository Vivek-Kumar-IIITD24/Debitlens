# Neo4j Parameterised Cypher Queries (`docs/NEO4J_QUERIES.md`)

All graph queries use parameterised Cypher (`$merchantId`, `$commitmentId`) and never concatenate user input.

## Query 1 — Operation A: Multi-Descriptor Merchant Alias Resolution
```cypher
MATCH (t:Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)-[r:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(m:Merchant {id: $merchantId})
RETURN m.canonicalName AS merchant, d.rawDescriptor AS descriptor, r.matchingMethod AS method, r.confidence AS confidence, count(t) AS txnCount
ORDER BY txnCount DESC
```

## Query 2 — Operation B & C: Cross-Source Supporting Transactions for a Commitment
```cypher
MATCH (a:Account)-[:ACCOUNT_HAS_TRANSACTION]->(t:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c:Commitment {id: $commitmentId})
MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
OPTIONAL MATCH (n:NotificationEvent)-[:NOTIFICATION_SUPPORTS_COMMITMENT]->(c)
RETURN t.transactionId AS txnId, t.transactionDate AS date, d.rawDescriptor AS descriptor, t.amount AS amount, a.accountAlias AS account, collect(n.eventType) AS notifications
ORDER BY t.transactionDate ASC
```

## Query 3 — Operation E: Post-Cancellation Subsequent Debit Detection
```cypher
MATCH (c:Commitment)-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(s:CancellationSession)
WHERE s.serviceCancelledAt IS NOT NULL
MATCH (t:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c)
WHERE date(t.transactionDate) > date(s.serviceCancelledAt)
OPTIONAL MATCH (s)-[:SESSION_HAS_EVIDENCE]->(e:CancellationEvidence)
RETURN c.id AS commitmentId, c.serviceName AS service, s.serviceCancelledAt AS cancelledOn, t.transactionId AS subsequentTxnId, t.transactionDate AS debitDate, t.amount AS amount, collect(e.referenceNumber) AS evidenceRefs
```

## Query 4 — Operation F: Unresolved Processor-Only Transactions
```cypher
MATCH (t:Transaction)-[:TRANSACTION_PROCESSED_BY]->(p:PaymentProcessor)
MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
WHERE NOT (d)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(:Merchant)
RETURN t.transactionId AS txnId, t.transactionDate AS date, d.rawDescriptor AS rawDescriptor, p.processorName AS processor, t.amount AS amount, 'UNRESOLVED_REVIEW_CASE' AS status
ORDER BY t.transactionDate DESC
```
