# Neo4j Cypher Query Catalogue

All Cypher queries in DebitLens are parameterised and executed via the official `neo4j-driver` against Neo4j AuraDB. Each query reports its genuine execution mode (`LIVE_NEO4J`, `EMPTY_LIVE_RESULT`, `QUERY_FAILED`, `LOCAL_PREVIEW`, `NOT_CONFIGURED`, or `CONNECTION_FAILED`).

## Operation 1: Multi-Descriptor Merchant Unification (`OP1_DESCRIPTOR_UNIFICATION`)
Finds all distinct statement descriptors that resolve to the same canonical merchant across payment processors and bank accounts:
```cypher
MATCH (t:Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)-[r:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(m:Merchant)<-[:COMMITMENT_FOR_SERVICE]-(s:Service)<-[:COMMITMENT_FOR_SERVICE]-(c:Commitment {id: $commitmentId})
RETURN d.rawDescriptor AS descriptor, r.matchingMethod AS method, r.confidence AS confidence, count(t) AS txnCount
```

## Operation 2: End-to-End Commitment Provenance Path (`OP2_COMMITMENT_PROVENANCE_PATH`)
Traverses from `Account` → `Transaction` → `Descriptor` → `Merchant` → `Service` → `Commitment` → `Mandate` → `PaymentRail`:
```cypher
MATCH (a:Account)-[:ACCOUNT_HAS_TRANSACTION]->(t:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c:Commitment {id: $commitmentId})
OPTIONAL MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT]->(m:Merchant)
OPTIONAL MATCH (c)-[:COMMITMENT_AUTHORISED_BY]->(md:Mandate)-[:MANDATE_USES_RAIL]->(r:PaymentRail)
RETURN a.id AS account, t.id AS txnId, d.rawDescriptor AS descriptor, m.title AS merchant, c.id AS commitmentId, md.id AS mandate, r.title AS rail
```

## Operation 3: Shared Payment Processor Isolation Check (`OP3_PROCESSOR_ISOLATION_CHECK`)
Verifies that multiple merchants sharing a payment processor (e.g., Razorpay) remain separate commitments and that processor-only unresolved transactions (`TXN-9501`, `TXN-9502`, `TXN-9503`) are never falsely merged:
```cypher
MATCH (t:Transaction)-[:TRANSACTION_PROCESSED_BY]->(p:PaymentProcessor)
OPTIONAL MATCH (t)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(c:Commitment)
RETURN p.title AS processor, t.id AS transactionId, t.status AS resolutionStatus, coalesce(c.id, 'ISOLATED_NO_FALSE_MERGE') AS commitmentLink
ORDER BY p.title, t.id
```

## Operation 4: Trial-to-Paid & Notification Correlation (`OP4_NOTIFICATION_CORRELATION`)
Correlates pre-debit/trial notifications with subsequent recurring debits:
```cypher
MATCH (n:NotificationEvent)-[r:NOTIFICATION_SUPPORTS_COMMITMENT]->(c:Commitment {id: $commitmentId})<-[:TRANSACTION_SUPPORTS_COMMITMENT]-(t:Transaction)
RETURN n.id AS notificationId, n.subtitle AS eventType, c.id AS commitmentId, collect(t.id) AS linkedTransactions
```

## Operation 5: Two-Layer Cancellation & Playbook Path (`OP5_TWO_LAYER_CANCELLATION_PATH`)
Retrieves both Layer A (service cancellation) and Layer B (mandate revocation) steps and attached evidence for a commitment:
```cypher
MATCH (c:Commitment {id: $commitmentId})-[:COMMITMENT_FOR_SERVICE]->(s:Service)-[:SERVICE_HAS_CANCELLATION_PLAYBOOK]->(pb:CancellationPlaybook)
OPTIONAL MATCH (c)-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(cs:CancellationSession)-[:SESSION_HAS_STEP]->(st:CancellationStep)
OPTIONAL MATCH (cs)-[:SESSION_HAS_EVIDENCE]->(ev:CancellationEvidence)
RETURN pb.id AS playbookId, cs.status AS sessionState, count(DISTINCT st) AS stepsCount, collect(DISTINCT ev.title) AS evidenceRefs
```

## Operation 6: Post-Cancellation Debit Verification (`OP6_POST_CANCELLATION_VERIFICATION`)
Identifies any debit transaction occurring after a user-recorded cancellation date:
```cypher
MATCH (c:Commitment {id: $commitmentId})-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(cs:CancellationSession)
OPTIONAL MATCH (c)-[:COMMITMENT_HAS_ALERT]->(al:DetectionAlert)-[:ALERT_SUPPORTED_BY]->(t:Transaction)
RETURN c.id AS commitmentId, cs.status AS sessionStatus, al.id AS alertId, t.id AS postCancelTransactionId
```

## Operation 7: Three-Way Reconciliation & Unresolved Processor-Only Query (`OP7_UNRESOLVED_ISOLATION`)
Executed live by `GET /api/graph/unresolved-transactions`:
```cypher
MATCH (t:Transaction {demoNamespace: 'DEBITLENS_DEMO_V1', status: 'UNRESOLVED'})-[:TRANSACTION_PROCESSED_BY]->(p:PaymentProcessor)
OPTIONAL MATCH (t)-[:TRANSACTION_HAS_DESCRIPTOR]->(d:Descriptor)
WHERE NOT (t)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(:Commitment)
RETURN t.id AS id,
       coalesce(t.transactionDate, t.date) AS transactionDate,
       coalesce(t.rawDescription, d.rawDescriptor) AS rawDescription,
       t.amount AS amount,
       t.paymentRail AS paymentRail,
       p.id AS processorId,
       p.processorName AS processorName,
       coalesce(t.matchingMethod, d.matchingMethod, 'PROCESSOR_ONLY_UNRESOLVED') AS matchingMethod,
       t.status AS resolutionStatus,
       t.confidence AS confidenceScore,
       coalesce(t.resolutionExplanation, t.unmergedReason) AS resolutionExplanation
ORDER BY t.id
```
