# Neo4j Property Graph Model (`docs/NEO4J_GRAPH_MODEL.md`)

## 1. Node Labels (16 Node Types)

1. `(:User)` — Consumer profile (`userId`, `profileType`, `currency`)
2. `(:Account)` — Bank / card account alias (`accountAlias`, `masked`)
3. `(:ImportBatch)` — Statement / notification import batch (`batchId`, `filename`, `totalRecords`)
4. `(:Transaction)` — Normalised debit/credit record (`transactionId`, `transactionDate`, `amount`, `direction`)
5. `(:Descriptor)` — Raw and normalised statement string (`rawDescriptor`, `normalisedDescriptor`)
6. `(:Merchant)` — Canonical business entity (`id`, `canonicalName`, `category`, `isFinancialObligation`)
7. `(:PaymentProcessor)` — Aggregator / clearing house (`processorId`, `processorName`)
8. `(:Service)` — Subscription or contractual product (`serviceId`, `serviceName`, `typicalAmount`)
9. `(:Commitment)` — Detected recurring financial commitment (`id`, `recurrenceType`, `annualisedAmount`, `confidenceScore`)
10. `(:Mandate)` — Standing instruction or UPI AutoPay authorisation (`mandateRef`, `status`)
11. `(:PaymentRail)` — Collection mechanism (`railType`: `UPI_AUTOPAY`, `CARD_EMANDATE`, `ENACH_NACH`, `GOOGLE_PLAY`)
12. `(:NotificationEvent)` — Pre-debit or free-trial event (`notificationId`, `eventType`, `trialStartDate`, `trialEndDate`)
13. `(:CancellationPlaybook)` — Curated two-layer stop guide (`playbookId`, `officialServiceUrl`, `officialRailSupportUrl`)
14. `(:CancellationSession)` — User cancellation state machine (`sessionId`, `status`, `serviceCancelledAt`, `paymentAuthorisationRevokedAt`)
15. `(:CancellationStep)` — Individual Layer A or Layer B checklist item (`stepId`, `layer`, `completed`)
16. `(:CancellationEvidence)` — Saved confirmation reference (`evidenceId`, `referenceNumber`, `evidenceDate`)
17. `(:DetectionAlert)` — Flagged anomaly (`alertId`, `alertType`, `severity`, `detectedValue`)

## 2. Relationship Types (17 Relationships)

- `(:User)-[:USER_OWNS_ACCOUNT]->(:Account)`
- `(:Account)-[:ACCOUNT_HAS_TRANSACTION]->(:Transaction)`
- `(:Transaction)-[:TRANSACTION_HAS_DESCRIPTOR]->(:Descriptor)`
- `(:Descriptor)-[:DESCRIPTOR_RESOLVES_TO_MERCHANT {status, confidence, matchingMethod}]->(:Merchant)`
- `(:Transaction)-[:TRANSACTION_PROCESSED_BY]->(:PaymentProcessor)`
- `(:Merchant)-[:MERCHANT_OFFERS_SERVICE]->(:Service)`
- `(:Transaction)-[:TRANSACTION_SUPPORTS_COMMITMENT]->(:Commitment)`
- `(:Commitment)-[:COMMITMENT_FOR_SERVICE]->(:Service)`
- `(:Commitment)-[:COMMITMENT_AUTHORISED_BY]->(:Mandate)`
- `(:Mandate)-[:MANDATE_USES_RAIL]->(:PaymentRail)`
- `(:Service)-[:SERVICE_HAS_CANCELLATION_PLAYBOOK]->(:CancellationPlaybook)`
- `(:Commitment)-[:COMMITMENT_HAS_ALERT]->(:DetectionAlert)`
- `(:DetectionAlert)-[:ALERT_SUPPORTED_BY]->(:Transaction)`
- `(:Commitment)-[:COMMITMENT_HAS_CANCELLATION_SESSION]->(:CancellationSession)`
- `(:CancellationSession)-[:SESSION_HAS_STEP]->(:CancellationStep)`
- `(:CancellationSession)-[:SESSION_HAS_EVIDENCE]->(:CancellationEvidence)`
- `(:NotificationEvent)-[:NOTIFICATION_SUPPORTS_COMMITMENT]->(:Commitment)`

## 3. Relationship Epistemic States

Every identity and commitment relationship stores `status` in `['CONFIRMED', 'INFERRED', 'USER_CONFIRMED', 'UNRESOLVED']`. Unknown processor-only transactions (`UPI/DR/42571190/RAZORPAY`) never receive a `[:DESCRIPTOR_RESOLVES_TO_MERCHANT]` relationship until explicitly confirmed by the user.
