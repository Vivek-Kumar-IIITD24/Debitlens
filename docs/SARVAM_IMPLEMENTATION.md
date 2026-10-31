# Sarvam AI Partner Track Implementation — "DebitLens Bhasha"

## 1. Architectural Overview & Runtime Status Honesty

DebitLens Bhasha uses **Sarvam AI** (`sarvam-105b` chat completion and `sarvam-translate:v1` / `mayura:v1` translation) to communicate verified financial commitment intelligence to Indian consumers in 12 scheduled languages (`en-IN`, `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `mr-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `pa-IN`, `or-IN`, `ur-IN`).

### Genuine Runtime Status Tracking
DebitLens never equates `configured` with `apiReachable`. Instead, `/api/sarvam/status`, `/api/sarvam/health`, and `/api/integrations/status` report one of 6 verified states:
- `NOT_CONFIGURED`: `SARVAM_API_KEY` is not set in `.env`.
- `CONFIGURED_NOT_TESTED`: `SARVAM_API_KEY` is configured server-side, awaiting first live request.
- `LIVE_SUCCESS`: Live HTTP call to `https://api.sarvam.ai` succeeded (`lastSuccessfulRequest` timestamp recorded).
- `RATE_LIMITED`: HTTP 429 received from Sarvam API; falls back transparently to `LOCAL_FALLBACK`.
- `REQUEST_FAILED`: Network or HTTP error from Sarvam API; falls back transparently to `LOCAL_FALLBACK`.
- `LOCAL_FALLBACK`: Deterministic, source-checked Indian-language explanations served when live API is unconfigured or unavailable.

---

## 2. Privacy-by-Design Redaction (`redactTransactionForSarvam`)

Before any payload is sent to Sarvam AI, `redactTransactionForSarvam` strips account numbers (`accountAlias`), external bank references (`externalReference`), and personal identifiers. Only structured, verified facts (`rawDescriptor`, `merchant`, `merchantVerified`, `processor`, `service`, `amount`, `currency`, `frequency`, `confidence`, `resolutionStatus`, `paymentRail`) are included. The exact redacted JSON payload is displayed in the **Privacy-by-Design Redacted Payload Inspector** in the UI.

---

## 3. Anti-Hallucination Guardrail for Unresolved Descriptors

For processor-only or generic mechanism descriptors such as `UPI/DR/42571190/RAZORPAY` (`TXN-9501`):
- `merchantVerified` is `false` and `resolvedMerchant` is `null`.
- Both the system prompt for `sarvam-105b` and the deterministic Bhasha fallback explicitly state that **only the payment processor (`Razorpay Software Pvt Ltd`) is identified and the underlying merchant is unverified**, preventing any guessed merchant names.

---

## 4. Complete Two-Layer Cancellation Playbook Translation

When translating a cancellation playbook (`POST /api/language/cancellation-explanation` or `POST /api/sarvam/cancellation-explanation`), DebitLens translates **every field** across both layers using sentence-aware chunking (`splitIntoSentenceChunks` under 900/1800 characters):
1. `contractualWarning` (preserving loan EMI, insurance policy, and utility warnings)
2. `layerATitle` and `layerADescription`
3. All `layerASteps[i].title` and `layerASteps[i].instruction`
4. `layerBTitle` and `layerBDescription`
5. All `layerBSteps[i].title` and `layerBSteps[i].instruction`
6. All `safetyAndEscalationNotes[i]`
7. `confirmationExplanation` and `statusMessage`

Official URLs, INR amounts, dates, and brand names are preserved intact.
