# DebitLens — Financial Commitment Intelligence & Reconciliation Platform

**Tagline:** *Find it. Understand it. Reconcile it. Verify it.*

---

## 1. Product Positioning & Five Intelligence Pillars

Ordinary consumers face opaque bank statement descriptors (`RZP*STREAMBOX`, `SI-MUSICFLOW-IN`, `UPI/DR/42571190/RAZORPAY`), silent trial-to-paid conversions, unannounced price increases that still pass because of high UPI AutoPay / eNACH mandate caps, and post-cancellation charges caused by revoking only the merchant account or only the payment mandate.

**DebitLens** is an evidence-backed financial commitment intelligence and three-way reconciliation platform built around five pillars:

1. **Identity Intelligence:** Separates **Merchant Identity**, **Payment Processor Identity** (Razorpay, BillDesk, Cashfree, Paytm), and **Payment Rail Mechanism** (`UPI_AUTOPAY`, `CARD_EMANDATE`, `ENACH_NACH`, `GOOGLE_PLAY`). Never merges unknown processor-only transactions (`TXN-9501`, `TXN-9502`, `TXN-9503`) into false commitments.
2. **Temporal Intelligence:** Deterministic recurrence detection across weekly, fortnightly, monthly (including Jan 31 → Feb 28 → Mar 31 month-end handling), quarterly, annual (2-occurrence support), resumed-after-gap, and trial-to-paid conversion patterns. Distinguishes `RecurringCandidate` (`PENDING_REVIEW`) from confirmed `FinancialCommitment` (`CONFIRMED` / `USER_CONFIRMED`).
3. **Reconciliation Intelligence:** **Three-Way Financial Reconciliation Engine** comparing **(1) Documented Service Terms / Invoices**, **(2) Actual Statement Transactions** (stored in integer minor units / `paise`), and **(3) Available Payment Authorisations / Mandates** across 9 deterministic outcomes (`MATCHED`, `AMOUNT_DISCREPANCY`, `FREQUENCY_DISCREPANCY`, `TRANSACTION_WITHOUT_VISIBLE_MANDATE`, `MANDATE_WITHOUT_RECENT_TRANSACTION`, `SERVICE_TERMS_UNAVAILABLE`, `POSSIBLE_DUPLICATE`, `CONFLICTING_EVIDENCE`, `UNRESOLVED`).
4. **Cancellation & Verification Intelligence:** Mechanism-specific **Two-Layer Cancellation Assistant** tracking **Layer A (`ServiceLifecycleStatus`)** and **Layer B (`MandateLifecycleStatus`)** independently, backed by a chronological **Evidence Casebook & Audit Timeline** and post-cancellation debit monitoring.
5. **Multilingual Financial Intelligence (*DebitLens Bhasha*):** Privacy-preserving Indian-language explanation and contextual Q&A powered by **Sarvam AI** (`sarvam-105b` + `sarvam-translate:v1`) across English (`en-IN`), Hindi (`hi-IN`), Tamil (`ta-IN`), Telugu (`te-IN`), Kannada (`kn-IN`), Bengali (`bn-IN`), Marathi (`mr-IN`), Gujarati (`gu-IN`), Malayalam (`ml-IN`), Punjabi (`pa-IN`), Odia (`or-IN`), and Urdu (`ur-IN`), with field-level status tracking (`LIVE_SARVAM`, `PARTIAL_SARVAM`, `LOCAL_FALLBACK`).

---

## 2. Epistemic Honesty Principles

- **Evidence over speculation:** Every link, confidence score, and reconciliation finding cites exact transaction IDs, mandate references, or document IDs.
- **Discrepancy ≠ Fraud:** DebitLens never declares an amount discrepancy or post-cancellation debit to be "fraud"; it flags `AMOUNT_DISCREPANCY` or `CONFLICTING_EVIDENCE` with clear explanations of possible legitimate causes (tier upgrade, tax revision, trailing billing cycle) alongside dispute-ready evidence.
- **Data Coverage Humility:** Absence of a mandate in imported records is reported as `"No matching mandate was found in the available imported records"` (`TRANSACTION_WITHOUT_VISIBLE_MANDATE`), never as proof that no bank authorisation exists.
- **Partner Integration Honesty:** Neo4j and Sarvam statuses are reported per operation (`LIVE_NEO4J`, `LOCAL_PREVIEW`, `NOT_CONFIGURED`, `CONNECTION_FAILED`, `EMPTY_LIVE_RESULT`, `QUERY_FAILED`; and `LIVE_SARVAM`, `PARTIAL_SARVAM`, `LOCAL_FALLBACK`).

---

## 3. Architecture & Technology Stack

- **Backend (`server.ts`):** Node.js + Express + TypeScript API server with official `neo4j-driver` v6 connection pooling, parameterised Cypher queries, `SHOW CONSTRAINTS` verification, Sarvam AI concurrency-limited client (`runWithConcurrencyLimit`, 10s timeout), and atomic local persistence (`data/persistent-store.json` written via temporary file + `fs.renameSync` with explicit caller error reporting).
  - **Core Intelligence Engines (`src/engine/`):**
  - `debitlensEngine.ts`: RFC-4180 CSV parser, strict signed/unsigned amount parsers (`parseStrictAmount`, `parseStrictSignedAmount`), descriptor normaliser, 6-tier identity resolver, temporal cadence detector, 100-point explainable confidence scorer, ground-truth evaluator, and graph builder.
  - `reconciliationEngine.ts`: Three-way reconciliation engine, synchronized mandate completeness & lifecycle validator, deterministic invoice/receipt term extractor (`expectedAmountMinor: null` when no currency token is present, `userVerified: false` until explicitly confirmed), Evidence Casebook & Append-Only Application Audit Timeline builder, Data Coverage analyser, Financial Guardrails, and grounded Contextual Bhasha Q&A builder.
  - `investigationEngine.ts`: Unrecognized Debit Investigation engine, Commitment Passport generator (3 distinct quality metrics: `recordCoverage`, `verificationQuality`, `financialReconciliationStatus`), Printable Evidence Pack HTML/JSON generator with XSS sanitization, Review & Resolve priority queue builder, and Smart Bank Statement CSV Column Mapping Wizard with canonical fingerprint deduplication.
- **Frontend (`src/`):** React 19 + TypeScript + Tailwind CSS + Lucide Icons + Recharts workspace featuring:
  - **Overview Dashboard & Spend Breakdown**
  - **Commitments, Commitment Passport Modal & Printable Evidence Pack**
  - **Review & Resolve Priority Inbox**
  - **Unrecognized Debit Investigation Drawer**
  - **3-Way Reconciliation Centre, Extracted-Field Preview & Section 22 Judge Demo**
  - **Evidence Casebook, Append-Only Application Audit Timeline, Data Coverage & Guardrails**
  - **Transactions Explorer with Raw Statement Descriptor Search History**
  - **Smart CSV Statement Mapping Wizard & Mandate Registry Import**
  - **Neo4j Commitment Map & Live Cypher Inspector**
  - **Sarvam Bhasha Explainer & Contextual Financial Q&A**
  - **Two-Layer Cancellation Centre (Independent Layer A & Layer B Lifecycles)**

---

## 4. Environment Configuration & Running Locally

1. Copy `.env.example` to `.env` and provide your credentials (never use placeholder strings such as `<PASTE_YOUR_...>`):
   ```bash
   NEO4J_ENABLED=true
   NEO4J_URI=neo4j+s://<your-instance>.databases.neo4j.io
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=<your-password>
   NEO4J_DATABASE=<your-database-name>
   ALLOW_LOCAL_PREVIEW=true

   SARVAM_ENABLED=true
   SARVAM_API_KEY=<your-sarvam-api-key>
   SARVAM_BASE_URL=https://api.sarvam.ai
   SARVAM_CHAT_MODEL=sarvam-105b
   SARVAM_TRANSLATE_MODEL=sarvam-translate:v1
   SARVAM_DEFAULT_LANGUAGE=en-IN
   ```
2. Install dependencies and start the server on port `3000` (both `npm run dev` and `npm start` execute `tsx server.ts`):
   ```bash
   npm install
   npm run dev
   # or: npm start
   ```
3. Run automated unit, financial integrity & adversarial tests (71 tests across `src/engine/debitlensEngine.test.ts` and `src/utils/searchHistory.test.ts`):
   ```bash
   npm test
   ```
4. Run TypeScript typechecking and production build:
   ```bash
   npm run typecheck
   npm run build
   ```

---

## 5. Architectural Invariants & Quality Guarantees

- **Authoritative Canonical JSON Store:** `data/persistent-store.json` is the single source of financial truth. All mutations serialize through atomic write-to-temp-plus-rename (`fs.renameSync`) with rollback-safe snapshots. Neo4j is an asynchronous graph projection only. Sarvam AI is a read-only language assistant (never establishes financial facts).
- **Demo Reset Sentinel Preservation:** The `/api/demo/reset` endpoint wipes only ephemeral demo simulations (`demoSimulatedRows`, `demoCommitmentOverrides`, `demoServiceTerms`, `demoMandates`), restoring baseline seed data while strictly preserving 100% of user data: user-imported transactions (`import_batch_id !== 'BATCH-SEED-01'`), user mandates (`sourceType !== 'DEMO_SEED'`), user service terms, user-configured guardrails, custom casebook entries, investigation cases, merchant confirmations, user commitment overrides, confirmed account currencies, and user audit trails. An `AUD-DEMO-RESET` sentinel audit record is appended.
- **Cryptographic File Upload Verification (Zero False Claims):** Document uploads in `/api/cancellation/sessions/:id/evidence` require genuine Base64 payloads with magic byte signature verification (PDF, PNG, JPEG, WebP), 10MB size limits, and SHA-256 hashing stored to disk. Upload claims without payload are strictly rejected with HTTP 400 `DOCUMENT_PAYLOAD_REQUIRED`. Non-file reference evidence truthfully records `documentUploaded: false` and `sourceType: 'USER_ENTERED'`.
- **Elimination of Client-Declared Independent Verification:** Client PATCH endpoints reject premature terminal statuses (`CANCELLATION_VERIFIED`, `REVOCATION_VERIFIED`) with HTTP 400 `UNVERIFIED_STATUS_REJECTED`. Forged privileged provenance (`INDEPENDENTLY_VERIFIED`, `SYSTEM_GENERATED`) submitted from client requests is rejected with HTTP 400 `FORGED_PROVENANCE_REJECTED`. Independent verification can only be established through subsequent bank statements or explicit system reconciliation.
- **Empty Initial Guardrails & Zero Hardcoded Amounts:** Guardrails start completely unconfigured (empty state). Users must explicitly configure a positive `maxExpectedAmount` or `maxExpectedAmountMinor`; missing amounts are rejected with HTTP 400 `AMOUNT_REQUIRED` without arbitrary fallback caps. Commitments with `UNKNOWN` currency are prevented from guardrail creation until currency is confirmed.
- **Exact Money Precision & Currency Disambiguation:** All monetary arithmetic uses exact string decimal parsing and BigInt minor-unit scaling (`paise`, `cents`), completely eliminating IEEE-754 floating-point drift even on 11-digit sums. Ambiguous currency symbols (`$` or `¥`) without confirmed account context resolve to `UNKNOWN_CURRENCY` with `UNKNOWN_SOURCE` provenance rather than guessing USD or JPY.
- **Demo Mode Default:** Demo Mode defaults strictly OFF on both client and server; baseline production behaviour requires real user imports and actions.

---

## 5. Prototype Architecture vs Production Deployment Boundaries

- **Single-User Local Persistence Prototype:** Application state is persisted locally in `data/persistent-store.json` using atomic write-to-temp-plus-rename (`fs.renameSync`) and serialized through an in-memory route mutation queue (`executeSerializedMutation`) with full deep-copy state snapshot rollback on validation error, runtime throw, or disk write failure, and asynchronous Neo4j graph projection triggered only after canonical JSON commit succeeds.
- **Production Multi-User Evolution:** In a multi-tenant production deployment, `data/persistent-store.json` would be replaced by per-tenant encrypted PostgreSQL / Cloud SQL transactional storage with RBAC authentication, Account Aggregator (AA) / NPCI UPI AutoPay API webhooks, and hardware-backed KMS audit log signing.
- **Regulatory Scope:** DebitLens is an informational consumer financial intelligence and evidence-preparation tool; it does not execute payments, revoke bank mandates directly, or provide formal legal advice.

## 5. Documentation Index (`/docs`)

- [`docs/NEO4J_GRAPH_SCHEMA.md`](docs/NEO4J_GRAPH_SCHEMA.md) — Node labels, relationship types, constraints, and evidence properties.
- [`docs/CYPHER_QUERY_CATALOGUE.md`](docs/CYPHER_QUERY_CATALOGUE.md) — Parameterised Cypher queries for graph sync, traversal, and unresolved isolation.
- [`docs/SARVAM_BHASHA_DESIGN.md`](docs/SARVAM_BHASHA_DESIGN.md) — Grounded multilingual architecture, PII redaction, concurrency control, and field-level status reporting.
- [`docs/RECONCILIATION_ENGINE.md`](docs/RECONCILIATION_ENGINE.md) — Three-way reconciliation specification, minor-unit arithmetic, and all 9 outcome statuses.
- [`docs/SERVICE_DOCUMENT_INTELLIGENCE.md`](docs/SERVICE_DOCUMENT_INTELLIGENCE.md) — Deterministic extraction of billing terms from invoices/receipts and user verification workflow.
- [`docs/EVIDENCE_CASEBOOK.md`](docs/EVIDENCE_CASEBOOK.md) — Chronological evidence chain, audit log events, and dispute-ready export.
- [`docs/TWO_LAYER_CANCELLATION_GUIDE.md`](docs/TWO_LAYER_CANCELLATION_GUIDE.md) — Independent `ServiceLifecycleStatus` (Layer A) and `MandateLifecycleStatus` (Layer B) workflows.
- [`docs/CONFIDENCE_SCORING_SPEC.md`](docs/CONFIDENCE_SCORING_SPEC.md) — 100-point additive confidence formula and `RecurringCandidate` vs `FinancialCommitment` thresholds.
- [`docs/DETECTION_EVALUATION.md`](docs/DETECTION_EVALUATION.md) — Dynamic benchmark evaluation against `data/ground-truth.json` (100% precision, 100% recall, 0 false merges).
- [`docs/SYNTHETIC_DATASET_DICTIONARY.md`](docs/SYNTHETIC_DATASET_DICTIONARY.md) — Complete catalogue of the 45 synthetic transactions, 10 mandates, 8 service documents, and 3 notifications.
- [`docs/PRIVACY_AND_SECURITY.md`](docs/PRIVACY_AND_SECURITY.md) — Data minimization, account/reference masking, and secret protection.
- [`docs/DEMO_SCRIPT_3_MINUTES.md`](docs/DEMO_SCRIPT_3_MINUTES.md) — Step-by-step 3-minute live judge walkthrough including the StreamBox ₹499 vs ₹799 vs ₹999 reconciliation demo.
- [`docs/QNA_DEFENCE_SHEET.md`](docs/QNA_DEFENCE_SHEET.md) — Engineering answers to anticipated judge questions on Fintech, Neo4j, and Sarvam AI.
