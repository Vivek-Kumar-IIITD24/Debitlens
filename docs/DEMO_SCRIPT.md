# 4-Minute Judge Demonstration Script (`DebitLens`)

**Track Eligibility:**
1. **Primary Track:** HackFront India Fintech PS T4.1 — Recurring Payment & Financial Commitment Intelligence
2. **Partner Track 1:** Best Use of **Neo4j** (Multi-Hop Financial Commitment Graph)
3. **Partner Track 2:** Best Use of **Sarvam AI** ("DebitLens Bhasha" Multilingual Financial Intelligence)

---

## Minute 0:00 – 0:45 — Overview & Honest Partner Integration Status
1. Open the **Overview Dashboard**.
2. Point out the **Partner Track Integration Status Strip** at the top:
   - Shows exact **Neo4j Graph Mode** (`LIVE_NEO4J` when AuraDB credentials are set, or transparent `LOCAL_PREVIEW` when unconfigured).
   - Shows exact **Sarvam AI Runtime Status** (`LIVE_SUCCESS`, `CONFIGURED_NOT_TESTED`, or `LOCAL_FALLBACK`).
3. Highlight the 6 KPI cards separating **Discretionary Subscriptions** (₹23,864/yr) from **Contractual Obligations** (₹1,38,940/yr — Loan EMI, Insurance, Utility) and **Requires Review** items.

---

## Minute 0:45 – 1:45 — Neo4j Commitment Map (Partner Track 1)
1. Click **Demo A: Neo4j Commitment Graph** in the top toolbar.
2. Show the **Core Commitment Path** for **StreamBox Premium 4K**:
   - Three distinct statement descriptors (`RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX`) resolve via `:DESCRIPTOR_RESOLVES_TO_MERCHANT` to `:Merchant {canonicalName: 'StreamBox'}` -> `:Service` -> `:Commitment` -> `:Mandate` -> `:PaymentRail` -> `:CancellationPlaybook`.
   - Meanwhile, `UPI/DR/42571190/RAZORPAY` (`TXN-9501`) links to `:PaymentProcessor {processorName: 'Razorpay Software Pvt Ltd'}` with status `UNRESOLVED` and is **never falsely merged** into StreamBox.
3. Click **Core Commitment Path — Click to Expand** to reveal all supporting transactions, import batches, and detection alerts.
4. Scroll to the **Executed Parameterised Cypher Queries (Operations 1–7)** panel and switch across Operations 1, 2–4, 5, 6, and 7 to show the exact parameterised Cypher queries and result rows.

---

## Minute 1:45 – 2:45 — Sarvam AI "DebitLens Bhasha" (Partner Track 2)
1. Click **Demo B: Sarvam Bhasha (Hindi / Tamil)** in the top toolbar.
2. Compare **Case 1 (`RAZORPAY*STREAMBOX`)** vs **Case 2 (`UPI/DR/42571190/RAZORPAY`)** in **Hindi (`hi-IN`)**, **Tamil (`ta-IN`)**, or **Bengali (`bn-IN`)**:
   - In Case 1, Bhasha explains that Razorpay is the payment processor and StreamBox Premium 4K is the verified merchant service.
   - In Case 2, Bhasha's **Anti-Hallucination Guardrail** explicitly states in Hindi/Tamil that only the processor (Razorpay) is known and the merchant is unverified.
3. Inspect the **Privacy-by-Design Redacted Payload** box showing that account numbers and bank references are stripped before calling Sarvam AI.
4. Scroll to **B. Multilingual Two-Layer Cancellation Playbook** and switch the commitment selector to **Bajaj Finance — Consumer Loan EMI #44** to demonstrate that contractual loan warnings and all Layer A/B steps are translated while preserving official URLs and action order.

---

## Minute 2:45 – 3:30 — Two-Layer Cancellation & Post-Cancellation Debit Verification
1. Click **Post-Cancellation Case (DesignVault)** in the top toolbar to open the **Cancellation Centre**.
2. Show the **Post-Cancellation Subsequent Debit Alert (`TXN-9104`)**: DesignVault was cancelled on `2026-09-10` with saved confirmation reference `DV-CANC-20260910-881`, yet a ₹649 debit occurred on `2026-10-26`.
3. Click **Simulate Post-Cancellation Debit** on any other commitment to demonstrate live workflow state transitions and post-cancellation detection.

---

## Minute 3:30 – 4:00 — RFC-4180 CSV & JSON Notification Import + Ground-Truth Metrics
1. Open **Import & Methodology** in the left sidebar.
2. Demonstrate importing a CSV statement batch with quoted commas (`"RZP*STREAMBOX, MUMBAI IN"`) and switching to **2. JSON Notification & Trial Import** to upload mandate/trial notifications.
3. Review the **Detection Methodology & Ground-Truth Benchmark** table showing live-computed Precision, Recall, F1, and 0 False Processor Merges against `data/ground-truth.json`.
