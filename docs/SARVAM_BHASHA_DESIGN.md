# Sarvam AI ("DebitLens Bhasha") Multilingual Architecture

## 1. Design Philosophy: Deterministic Facts First, Language Second
Sarvam AI is never asked to guess a merchant identity, invent a cancellation URL, or decide whether a transaction is recurring. Instead:
1. The deterministic DebitLens engine resolves merchant identity, processor identity, payment rail, confidence score, three-way reconciliation outcome, and two-layer cancellation steps.
2. PII and sensitive identifiers (full account numbers, phone numbers, email addresses, full mandate tokens) are redacted via `redactTransactionForSarvam()` into a verifiable `RedactedPrivacyPayload`.
3. **Sarvam AI** (`sarvam-105b` for grounded explanation + `sarvam-translate:v1` for structured field translation) translates and explains those verified facts in the user's chosen Indian language.

## 2. Supported Languages
- English (`en-IN`), Hindi (`hi-IN`), Tamil (`ta-IN`), Bengali (`bn-IN`), Telugu (`te-IN`), Marathi (`mr-IN`), Gujarati (`gu-IN`), Kannada (`kn-IN`), Malayalam (`ml-IN`), Punjabi (`pa-IN`), Odia (`or-IN`), and Urdu (`ur-IN`).

## 3. Concurrency Control, Timeouts & Field-Level Honesty
- **Concurrency Limiter:** `runWithConcurrencyLimit(tasks, 3)` in `server.ts` limits parallel Sarvam HTTP requests to at most 3 concurrent calls to prevent HTTP 429 rate-limiting during multi-step playbook translation.
- **10-Second Request Timeout:** Every Sarvam HTTP call uses `AbortSignal.timeout(10000)` so a slow network response never hangs the UI.
- **Field-Level Status Tracking (`fieldStatuses`):** Every translated field (`whyConfusing`, `whatIsIdentified`, `whatRemainsUncertain`, `recommendedAction`, `fullSummary`, `layerASteps`, `layerBSteps`, etc.) records whether it came from `LIVE_SARVAM` or `LOCAL_FALLBACK`.
- **No False `LIVE_SARVAM` Claims:**
  - If all fields succeed via live Sarvam API → `status: "LIVE_SARVAM"`, `mode: "LIVE_SARVAM"`.
  - If some fields succeed and others fall back → `status: "PARTIAL_SARVAM"`, `mode: "PARTIAL_SARVAM_API"`.
  - If all fields use curated verified fallback → `status: "LOCAL_FALLBACK"`, `mode: "LOCAL_FALLBACK"`.

## 4. Contextual Bhasha Financial Q&A (`POST /api/sarvam/ask`)
Allows users to ask grounded questions about any commitment (e.g., *"Why was ₹799 debited when my invoice is ₹499?"* or *"Will deleting the app stop my UPI AutoPay?"*) and returns:
- Grounded English explanation (`englishAnswer`)
- Localized Indian-language explanation (`localizedAnswer`) preserving exact merchant names, transaction IDs (`TXN-1005`), document IDs (`DOC-STREAMBOX-01`), mandate references (`UMN-STREAMBOX-9821@okaxis`), and INR amounts (`₹499`, `₹799`, `₹999`)
- Explicit `groundedFactsUsed` and `evidenceRecordIds`.
