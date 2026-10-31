# Partner Track Demonstration Script (`docs/PARTNER_TRACK_DEMO.md` & `docs/NEO4J_PARTNER_TRACK_DEMO.md`)

## DEMO A — NEO4J TRACK (Relationship Intelligence)

1. Click **"Demo A: Neo4j Commitment Graph"** in the top workspace toolbar to open the interactive `@xyflow/react` Commitment Map focused on **StreamBox Premium 4K (`CMT-STREAMBOX`)**.
2. Observe how three distinct raw statement descriptors (`RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX`) connect via `[:DESCRIPTOR_RESOLVES_TO_MERCHANT]` to a single canonical `(:Merchant {name: "StreamBox"})` node while keeping `(:PaymentProcessor {name: "Razorpay Software Pvt Ltd"})` separate.
3. Notice on the same canvas how `TXN-9501` (`UPI/DR/42571190/RAZORPAY`) connects **only** to `(:PaymentProcessor {name: "Razorpay"})` with dashed red `UNRESOLVED` edges — proving that Neo4j prevents false subscription merges.
4. Scroll to the **Executed Parameterised Cypher Queries** panel and switch between `OP_A_ALIAS_RESOLUTION`, `OP_B_C_COMMITMENT_HISTORY`, `OP_E_POST_CANCELLATION_TRAVERSAL`, and `OP_F_UNRESOLVED_PROCESSOR_ONLY`.
5. Switch Focus Commitment to **MaxLife Term Shield Policy #99 (`CMT-MAXLIFE`)** or **ReadCloud Unlimited eBooks (`CMT-READCLOUD`)** to show how irregular and resumed payment histories are unified by the graph.

## DEMO B — SARVAM AI TRACK (DebitLens Bhasha)

1. Click **"Demo B: Sarvam Bhasha (Hindi / Tamil)"** in the workspace toolbar.
2. Inspect **Case 1: `RAZORPAY*STREAMBOX` (`TXN-1003`)** in Hindi (`हिन्दी · hi-IN`). Point out the side-by-side Hindi and English explanation: *"यह भुगतान StreamBox Premium 4K की सदस्यता से जुड़ा हुआ है। भुगतान विवरण में Razorpay Software Pvt Ltd का नाम दिखाई देता है, जो भुगतान प्रोसेसर के रूप में कार्य करता है।"*
3. Click **Case 2: `UPI/DR/42571190/RAZORPAY` (`TXN-9501`)** to show that for an unknown processor-only debit, Sarvam Bhasha preserves uncertainty in Hindi (`असली मर्चेंट या सेवा की पुष्टि नहीं हुई है`) without guessing.
4. Inspect the **Privacy-by-Design Redacted Payload** box showing how `HDFC-XX4821` and `UPI-421800112203` are masked before calling Sarvam AI.
5. Scroll down to **B. Multilingual Two-Layer Cancellation Playbook**, select **Bajaj Finance Consumer Loan EMI #44 (`CMT-BAJAJEMI`)**, and switch between Hindi (`hi-IN`), Tamil (`ta-IN`), and Bengali (`bn-IN`) to show that Layer A (Service), Layer B (Mandate), official URLs, and Loan EMI contractual warnings remain completely intact.
