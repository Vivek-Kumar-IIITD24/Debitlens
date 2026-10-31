# DebitLens — Financial Commitment Intelligence Platform

> **"Find it. Understand it. Stop it."**  
> *DebitLens connects the financial relationships hidden behind recurring payments using **Neo4j**, evaluates temporal patterns deterministically, guides users through **Two-Layer Cancellation**, and explains every finding in Indian languages using **Sarvam AI ("DebitLens Bhasha")**.*

---

## 1. Competition Tracks

1. **Primary Track:** HackFront India Fintech PS T4.1 — Recurring Payment & Subscription Intelligence
2. **Partner Track 1 — Best Use of Neo4j:** Multi-hop financial relationship graph (`17` node labels, `18` relationship types, `7` parameterised Cypher operations) separating payment processors (`Razorpay`, `BillDesk`, `PayU`) from canonical merchants (`StreamBox`, `MusicFlow`, `ReadCloud`) and isolating unresolved processor-only descriptors (`UPI/DR/42571190/RAZORPAY`).
3. **Partner Track 2 — Best Use of Sarvam AI ("DebitLens Bhasha"):** Grounded multilingual financial explanations (`sarvam-105b`, `sarvam-translate:v1`, `mayura:v1`) across 12 scheduled Indian languages (`en-IN`, `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `mr-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `pa-IN`, `or-IN`, `ur-IN`) with strict privacy redaction, anti-hallucination guardrails for unknown descriptors, and complete Layer A + Layer B cancellation playbook translation.

---

## 2. Single Active Full-Stack Architecture

- **Frontend:** React 19 + TypeScript + Tailwind CSS + `@xyflow/react` (Interactive Neo4j Commitment Map) + `recharts`
- **Backend:** Express + TypeScript (`server.ts`) serving both REST APIs (`/api/*`) and Vite middleware on port `3000`
- **Graph Persistence & Query Service:** `src/services/neo4jPersistenceService.ts` using official `neo4j-driver` with parameterised `UNWIND` + `MERGE` batches and live Cypher queries
- **Durable State Persistence:** Survives server restarts via `data/persistent-store.json` + live Neo4j sync when configured

---

## 3. Environment Configuration (`.env.example`)

Copy `.env.example` to `.env` and provide your credentials to switch from transparent `LOCAL_PREVIEW` / `LOCAL_FALLBACK` to `LIVE_NEO4J` and `LIVE_SARVAM`:

```env
NEO4J_ENABLED=true
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=neo4j

SARVAM_ENABLED=true
SARVAM_API_KEY=<api-key>
SARVAM_BASE_URL=https://api.sarvam.ai
SARVAM_CHAT_MODEL=sarvam-105b
SARVAM_TRANSLATION_MODEL=sarvam-translate:v1
SARVAM_DEFAULT_LANGUAGE=en-IN

DEMO_MODE=true
ALLOW_LOCAL_PREVIEW=true
```

---

## 4. Running & Testing

```bash
# Install dependencies
npm install

# Run full-stack development server on http://localhost:3000
npm run dev

# Run the 22 automated unit & adversarial tests
npx --yes tsx --test src/engine/debitlensEngine.test.ts

# Build for production
npm run build
```

---

## 5. Documentation Index (`docs/`)

- [`docs/CURRENT_IMPLEMENTATION_AUDIT.md`](docs/CURRENT_IMPLEMENTATION_AUDIT.md) — Engineering audit & remediation log
- [`docs/NEO4J_IMPLEMENTATION.md`](docs/NEO4J_IMPLEMENTATION.md) — 17 node labels, 18 relationships, and Cypher Operations 1–7
- [`docs/SARVAM_IMPLEMENTATION.md`](docs/SARVAM_IMPLEMENTATION.md) — Runtime status states, privacy redaction, and full Layer A/B translation
- [`docs/CANCELLATION_SOURCE_AUDIT.md`](docs/CANCELLATION_SOURCE_AUDIT.md) — Official URL verification and synthetic service labelling
- [`docs/TESTING_REPORT.md`](docs/TESTING_REPORT.md) — 22 unit/adversarial test results & dynamic ground-truth evaluation
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — 4-minute judge demonstration walkthrough
