# Partner Track Implementation — Neo4j + Sarvam AI

## 1. Combined Innovation Architecture

1. **Neo4j AuraDB** discovers and connects the financial relationships across raw statement descriptors, payment processors, merchants, services, commitments, mandates, payment rails, cancellation sessions, and evidence.
2. **Java Deterministic Detection Engine** analyses recurring intervals, amount variations, price increases, trial conversions, resumed charges, and confidence scores.
3. **Sarvam AI (DebitLens Bhasha)** explains the verified findings and two-layer cancellation instructions in the user's preferred Indian language (`hi-IN`, `ta-IN`, `bn-IN`, `te-IN`, `mr-IN`, `kn-IN`).
4. **DebitLens Cancellation & Verification Engine** guides the user through separate service and mandate actions and monitors subsequent imports for post-cancellation debits.

## 2. Why Neo4j + Sarvam Strengthen PS T4.1

- **Why a Graph over a Flat Transaction Table:** One subscription (`StreamBox Premium 4K`) appears under three distinct bank descriptors (`RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX`). Meanwhile, one payment processor (`Razorpay`) processes both verified merchants (`StreamBox`, `ReadCloud`, `LearnPro AI`) and opaque processor-only charges (`UPI/DR/42571190/RAZORPAY`, `RAZORPAY*99812-MUM`). Neo4j models these as explicit nodes and evidence-weighted relationships so multi-alias histories unify while processor-only debits stay unmerged.
- **Why Sarvam AI Grounded on Graph Evidence:** Ordinary consumers struggle to interpret `NACH-DR-MAXLIFE-POL99` or `SI-MUSICFLOW-IN` and often confuse uninstalling an app or revoking a UPI mandate with cancelling a service contract. Sarvam AI translates verified structured facts and two-layer playbooks into natural Hindi, Tamil, and Bengali while preserving official URLs, action order, and contractual loan/insurance safety warnings.
