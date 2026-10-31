# Neo4j Partner Track Demo Guide (`docs/NEO4J_PARTNER_TRACK_DEMO.md`)

See `docs/PARTNER_TRACK_DEMO.md` for the step-by-step judge walkthrough covering:
- Multi-descriptor alias unification (`RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX` -> `StreamBox`)
- Processor-only isolation (`UPI/DR/42571190/RAZORPAY` -> `Razorpay` only, `UNRESOLVED`)
- Post-cancellation subsequent debit graph traversal (`DesignVault Pro Assets`, `TXN-9104`)
- Live parameterised Cypher queries (Operations A–F)

# Multilingual UX Guide (`docs/MULTILINGUAL_UX.md`)

DebitLens Bhasha provides a persistent language selector in the top toolbar supporting 7 Indian languages (`en-IN`, `hi-IN`, `ta-IN`, `bn-IN`, `te-IN`, `mr-IN`, `kn-IN`). Switching languages updates merchant explanations, cancellation playbooks, and financial alerts in place without losing the user's selected commitment or transaction context.
