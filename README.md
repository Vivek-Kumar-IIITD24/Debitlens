# DebitLens

**Find it. Understand it. Reconcile it. Verify it.**

DebitLens is a local React/Express prototype for finding recurring or unexplained debits. It imports statement CSV data, separates merchants from payment processors, compares transactions with service terms and mandates, supports evidence-backed cancellation workflows, and keeps service cancellation separate from mandate revocation.

The canonical financial state is local JSON. Neo4j and Sarvam are optional projections/services; they are not required for offline startup.

## Requirements

- Node.js **22.12.0 or newer**. Vite 8.3.5 requires `^20.19.0 || >=22.12.0`.
- npm 10 or newer.
- `package-lock.json` is authoritative. The recommended version is recorded in [.nvmrc](./.nvmrc).

## Install and start

Replace `<repository-url>` in the commands below with the HTTPS URL shown by the repository hosting page. This checkout has no configured Git remote, so no project-specific clone URL can be asserted here.

### Windows PowerShell

```powershell
git clone <repository-url> DebitLens
Set-Location .\DebitLens
Copy-Item .env.example .env
npm ci --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

### macOS

```bash
git clone <repository-url> DebitLens
cd DebitLens
cp .env.example .env
npm ci --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

### Linux

```bash
git clone <repository-url> DebitLens
cd DebitLens
cp .env.example .env
npm ci --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

If port 3000 is busy, edit the existing line in `.env` from `PORT=3000` to `PORT=3001`; do not add a duplicate `PORT` entry.

## Environment variables

| Variable | Purpose | Required? | Default behaviour |
|---|---|---:|---|
| `NODE_ENV` | Runtime environment | No | `development` in `.env.example` |
| `PORT` | Express/Vite server port | No | `3000` |
| `CLIENT_ORIGIN` | Documented client origin | No | `http://localhost:5173` |
| `NEO4J_ENABLED` | Enable Neo4j projection | No | `false` |
| `NEO4J_URI` | Neo4j/Aura URI | Only when enabled | Placeholder; no connection offline |
| `NEO4J_USERNAME` | Neo4j username | Only when enabled | Placeholder |
| `NEO4J_PASSWORD` | Neo4j password | Only when enabled | Placeholder |
| `NEO4J_DATABASE` | Neo4j database name | No | `neo4j` |
| `SARVAM_ENABLED` | Enable Sarvam explanations/translations | No | `false` in `.env.example` |
| `SARVAM_API_KEY` | Sarvam API key | Only when enabled | Placeholder; local fallback remains available |
| `SARVAM_BASE_URL` | Sarvam API endpoint | No | `https://api.sarvam.ai` |
| `SARVAM_CHAT_MODEL` | Sarvam chat model | No | `sarvam-105b` |
| `SARVAM_TRANSLATION_MODEL` | Sarvam translation model | No | `sarvam-translate:v1` |
| `SARVAM_DEFAULT_LANGUAGE` | Default language code | No | `en-IN` |
| `DEMO_MODE` | Enable demo-only reset and simulation controls | No | `false` |
| `ALLOW_LOCAL_PREVIEW` | Permit local graph preview when Neo4j is unavailable | No | `true` |

Additional test/runtime-only variables used by the source include `DEBITLENS_STORE_PATH`, `DEBITLENS_SKIP_LISTEN`, and `DISABLE_HMR`; they are not needed for normal setup.

## First-run workflow

1. Start the server with `npm run dev`.
2. Open **Transactions & Explorer** and use the import flow with the sample CSV.
3. Review detected commitments in **Discover Commitments**.
4. Open **Financial Overview** for recurring spend and alerts.
5. Use **Review & Resolve** or the transaction investigation drawer for unresolved debits.
6. Inspect **3-Way Reconciliation** to compare transactions, service terms and mandates.
7. Open **Evidence Casebook** to record evidence references or upload a valid document.
8. Use **Cancellation Centre** to track service cancellation and mandate revocation independently.
9. Use **Settings & Diagnostics** to inspect local storage and optional integrations.

## CSV import contract

The repository sample is [data/synthetic-transactions.csv](./data/synthetic-transactions.csv). A browser-downloadable copy is also available at [public/samples/debitlens-transactions.csv](./public/samples/debitlens-transactions.csv).

The actual header row is:

```csv
transaction_id,transaction_date,raw_description,amount,currency,direction,payment_rail,account_alias,external_reference
```

- Mandatory fields: `transaction_id`, `transaction_date`, `raw_description`, and `amount`.
- Optional fields: `currency`, `direction`, `payment_rail`, `account_alias`, and `external_reference`.
- Dates accept the mapper-selected formats such as `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, and `MM/DD/YYYY`.
- Amounts must be ordinary decimal text, with no currency symbols or trailing text. Supported currencies reject excess decimal places and unsafe minor-unit values.
- Missing or `UNKNOWN` currency remains explicitly unknown rather than being silently treated as INR.
- Negative amounts and credit/refund rows are retained as credits; a negative debit is normalised as a credit.
- Monetary fields:
  - `amount` is the backward-compatible JavaScript numeric major-unit field and can lose precision for large values.
  - `amountExact` preserves the normalized original decimal text for display.
  - `amountMinor` is the safe numeric minor-unit compatibility field.
  - `amountMinorExact` is the JSON-safe exact minor-unit integer string and is authoritative for exact calculations when the currency is supported.
- Missing or `UNKNOWN` currency has no authoritative minor-unit interpretation; it remains explicitly unavailable rather than being treated as INR.
- Derived display values and legacy numeric summaries are rounded to the currency's supported decimal scale. Exact companion fields are provided where available; the prototype does not claim every derived public number is arbitrary-precision.

## Storage, backup and demo reset

- Canonical state: `data/persistent-store.json`.
- Uploaded evidence: `data/uploads/`.
- Both locations are local runtime data and are ignored by Git.
- For a safe backup, stop the server and copy `data/persistent-store.json` together with the complete `data/uploads/` directory.
- Demo reset is available only when **Demo Mode** is enabled. It removes tagged demo/simulation state, restores the baseline seed once, and preserves user and conservatively unclassified records. Back up the two data locations before resetting.

## Offline and optional integrations

The default startup is offline. The deterministic CSV, commitment, reconciliation, evidence and cancellation workflows do not require external services.

Neo4j is an optional rebuildable relationship projection. Set `NEO4J_ENABLED=true` and provide its URI, username and password to connect; otherwise the application reports local preview/unavailable status and keeps canonical JSON authoritative.

Sarvam is optional language assistance. Set `SARVAM_ENABLED=true` and provide `SARVAM_API_KEY`; without credentials the application uses its local fallback explanations.

## Commands

```bash
npm ci --legacy-peer-deps
npm run dev
npm run start
npm test
npm run typecheck
npm run build
npm run clean
node scripts/health-smoke.mjs
```

`npm run clean` removes generated `dist/` and `server.js` only. It does not remove canonical JSON or uploaded evidence. The health smoke script starts a temporary server on an available port, verifies `/api/health`, and terminates it.

## Troubleshooting

- **Unsupported Node.js:** check `node --version`; use Node 22.12.0 or newer. `.nvmrc` contains the recommended version.
- **Dependency installation conflict:** use `npm ci --legacy-peer-deps`, not a plain install.
- **Port conflict:** change the existing `.env` value `PORT=3000` to `PORT=3001`, restart the server, and open the matching URL.
- **Browser connection refused:** confirm `npm run dev` is still running and that the browser port matches `.env`.
- **Upload failure:** use PDF, PNG, JPEG or WebP content with a valid signature, stay within the 10 MB limit, and ensure `data/uploads/` is writable.
- **Missing Neo4j/Sarvam credentials:** leave the corresponding integration disabled for offline operation, or provide valid credentials and enable it explicitly.

## Limitations

DebitLens is a local single-process JSON prototype, not a production multi-user financial service. It has no bank connectivity, legal cancellation authority, regulatory approval, bank-grade access control, or guaranteed external-service availability. Financial analysis uses exact minor units where representable; derived public numeric summaries remain bounded by JavaScript number fields and should be displayed through the preserved exact transaction text when precision is material.

The cross-platform workflow is configured in [.github/workflows/ci.yml](./.github/workflows/ci.yml), but configuration is not proof of execution. Hosted Ubuntu, Windows and macOS results must be checked from actual workflow runs.
