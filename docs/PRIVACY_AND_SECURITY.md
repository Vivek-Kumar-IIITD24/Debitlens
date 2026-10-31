# Privacy, Data Minimization & Security Architecture

## 1. Zero Raw PII Sent to External LLM APIs
Before any transaction or commitment context is sent to Sarvam AI (`sarvam-105b` or `sarvam-translate:v1`), `redactTransactionForSarvam()` constructs a `RedactedPrivacyPayload`:
- Bank account numbers and aliases are masked or omitted (`maskedFields: ["accountAlias", "externalReference", "rawBankAccountNumber", "customerPhone", "customerEmail"]`).
- Any 10+ digit sequences, UPI UTR numbers, or email patterns inside raw descriptors are scrubbed via regex (`/\b\d{6,}\b/g` → `[REDACTED_ID]`).
- The exact `privacyAudit` payload sent to Sarvam is returned in the API response and displayed in the **Bhasha Explainer Privacy Audit** panel so judges and users can verify that no raw account identifiers leave the server.

## 2. Secret & Credential Protection
- `NEO4J_PASSWORD` and `SARVAM_API_KEY` are read exclusively on the backend (`server.ts` and `src/services/neo4jPersistenceService.ts`).
- `GET /api/integrations/status` masks the Neo4j URI (`neo4j+s://5ded3f74.databases.neo4j.io`) and never returns or logs passwords or API keys.
- `isPlaceholderEnvValue()` rejects template placeholders such as `<PASTE_YOUR_AURA_URI_HERE>` or `YOUR_SARVAM_API_KEY` so unconfigured templates are never mistaken for live credentials.
- `.env` and runtime state files (`data/persistent-store.json`) are excluded from version control and submission archives.
