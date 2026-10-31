# DebitLens — Financial Commitment Intelligence & Reconciliation Platform

**Tagline:** *Find it. Understand it. Reconcile it. Verify it.*

**HackFront India Submission:**
- **Primary Track:** Fintech Problem Statement T4.1 (Recurring Payment & Subscription Intelligence)
- **Partner Track 1:** **Neo4j** — *Best Use of Neo4j* (Persistent Commitment & Reconciliation Graph on Neo4j AuraDB)
- **Partner Track 2:** **Sarvam AI** — *Best Use of Sarvam* (*DebitLens Bhasha* Grounded Indian-Language Financial Intelligence)

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

- **Backend (`server.ts`):** Node.js + Express + TypeScript API server with official `neo4j-driver` v6 connection pooling, parameterised Cypher queries, `SHOW CONSTRAINTS` verification, Sarvam AI concurrency-limited client (`runWithConcurrencyLimit`, 10s timeout), and atomic local persistence (`data/persistent-store.json`).
- **Core Intelligence Engines (`src/engine/`):**
  - `debitlensEngine.ts`: RFC-4180 CSV parser, descriptor normaliser, 6-tier identity resolver, temporal cadence detector, 100-point explainable confidence scorer, ground-truth evaluator, and graph builder.
  - `reconciliationEngine.ts`: Three-way reconciliation engine, deterministic invoice/receipt term extractor, Evidence Casebook & Audit Timeline builder, Data Coverage analyser, Financial Guardrails, and grounded Contextual Bhasha Q&A builder.
- **Frontend (`src/`):** React 19 + TypeScript + Tailwind CSS + Lucide Icons + Recharts workspace featuring:
  - **Overview Dashboard & Spend Breakdown**
  - **Commitments & Recurring Candidates Review**
  - **3-Way Reconciliation Centre & Section 22 Judge Demo**
  - **Evidence Casebook, Audit Timeline, Data Coverage & Guardrails**
  - **Transactions Explorer with Raw Statement Descriptor Search History**
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
2. Install dependencies and start the server on port `3000`:
   ```bash
   npm install
   npm run dev
   ```
3. Run automated unit & adversarial tests (34 tests including ground-truth evaluation and three-way reconciliation):
   ```bash
   npm test
   ```
4. Run TypeScript typechecking and production build:
   ```bash
   npm run typecheck
   npm run build
   ```

---

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
