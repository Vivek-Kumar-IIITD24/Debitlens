# Sarvam AI Integration & Multilingual UX (`docs/SARVAM_INTEGRATION.md`)

## 1. Models & Official Endpoints Used

1. **Sarvam-105B (`sarvam-105b`)**
   - Endpoint: `POST https://api.sarvam.ai/v1/chat/completions`
   - Purpose: Grounded, hallucination-free explanation of cryptic merchant descriptors and financial alerts based strictly on structured evidence from DebitLens.
2. **Sarvam Translate (`sarvam-translate:v1`) & Mayura (`mayura:v1`)**
   - Endpoint: `POST https://api.sarvam.ai/translate`
   - Purpose: Translating verified explanations and two-layer cancellation playbooks into Indian languages (`hi-IN`, `ta-IN`, `bn-IN`, `te-IN`, `mr-IN`, `kn-IN`).

## 2. Grounding & Privacy Rules

- **Server-Side Only:** `SARVAM_API_KEY` is read exclusively in the backend (`server.ts` / `SarvamApiClient.java`) and sent via `api-subscription-key` header.
- **Privacy Redaction (`redactTransactionForSarvam`):** Account aliases (`HDFC-XX4821` -> `[MASKED_ACCOUNT]`), mandate references (`UPI-415600112201` -> `[REDACTED_REF]`), and numeric strings are stripped before any external API request.
- **Zero Guessing on Unknown Merchants:** When explaining `UPI/DR/42571190/RAZORPAY`, DebitLens Bhasha states that `Razorpay` is identified as a payment processor while the underlying merchant remains unverified.
- **Two-Layer Playbook Invariants:** Translation preserves action step numbering, official URLs, the distinction between Layer A (Service) and Layer B (Mandate), and loan/insurance contractual warnings.
