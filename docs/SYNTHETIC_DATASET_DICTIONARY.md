# Synthetic Dataset Dictionary

All datasets in `data/` are 100% synthetic and crafted to test every required HackFront Fintech T4.1 + Neo4j + Sarvam AI scenario.

## 1. `data/synthetic-transactions.csv` (45 Transactions)
| Transaction IDs | Merchant / Descriptor | Pattern Tested |
| :--- | :--- | :--- |
| `TXN-1001..1005` | `RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX` | Multi-descriptor unification across Razorpay + UPI AutoPay |
| `TXN-2001..2005` | `SI-MUSICFLOW-IN`, `BILLDESK*MUSICFLOW` | Monthly Card e-Mandate with price increase (`₹199` → `₹249`) |
| `TXN-3001..3002` | `GOOGLE *CLOUDNOTES PRO` | Annual Google Play subscription (2 occurrences, ~365 days apart) |
| `TXN-4001..4004` | `BILLDESK*FITCLUB99`, `FITCLUB*GYM-MUM` | Quarterly membership without imported mandate (`TRANSACTION_WITHOUT_VISIBLE_MANDATE`) |
| `TXN-5001..5005` | `UPI/AUTOPAY/BESCOM-BLR` | Variable-amount utility auto-debit (`₹1,380` – `₹1,610`) |
| `TXN-6001..6003` | `NACH-DR-MAXLIFE-INS` | Irregular NACH insurance obligation (`FREQUENCY_DISCREPANCY` vs annual policy) |
| `TXN-7001..7004` | `RZP*READCLOUD`, `READCLOUD*DIGI` | Month-end cadence (`Jan 31` → `Feb 28` → `Mar 31`) + resumed after gap (`SERVICE_TERMS_UNAVAILABLE`) |
| `TXN-8001` | `UPI/AUTOPAY/LEARNPRO-AI` | Trial-to-paid conversion (`₹999`) corroborated by `NOTIF-01` |
| `TXN-9001..9004` | `NACH-BAJAJ-FIN-EMI` | Contractual Loan EMI obligation (`₹4,250` → `₹8,450` penalty/revision) |
| `TXN-9101..9104` | `SI-DESIGNVAULT-PRO` | Cancelled on `2026-09-10`, post-cancellation debit `TXN-9104` on `2026-10-26` (`CONFLICTING_EVIDENCE`) |
| `TXN-9501..9503` | `UPI/DR/42571190/RAZORPAY`, `RAZORPAY*99812-MUM`, `CASHFREE*MERCH-771` | Processor-only descriptors kept `UNRESOLVED` (never falsely merged) |
| `TXN-9601..9603` | `UPI/SWIGGY-ORDER` | Habitual irregular food orders (excluded from recurring commitments) |
| `TXN-9701` | `RZP*STREAMBOX-REFUND` | `CREDIT` refund transaction (excluded from recurring debit totals) |
| `TXN-9801..9802` | `THIRDWAVE COFFEE ROASTERS`, `INDIGO AIRLINES PNQ-DEL` | One-time retail/travel spend (excluded from recurring commitments) |

## 2. Seed Mandates (`buildInitialSeedMandates`)
Includes 9 active/revoked mandates linked to commitments (`MND-STREAMBOX-01` with `₹999` ceiling, `MND-MUSICFLOW-01` with `₹500` ceiling, `MND-CLOUDNOTES-01`, `MND-BESCOM-01`, `MND-MAXLIFE-01`, `MND-READCLOUD-01`, `MND-LEARNPRO-01`, `MND-BAJAJEMI-01`, `MND-DESIGNVAULT-01`) plus 1 dormant mandate with no recent transactions (`MND-DORMANT-NEWSPLUS` → `MANDATE_WITHOUT_RECENT_TRANSACTION`).

## 3. Seed Service Terms / Invoices (`buildInitialSeedServiceTerms`)
Includes 8 documented service terms records (`DOC-STREAMBOX-01` at `₹499/mo`, `DOC-MUSICFLOW-01` at `₹199/mo`, `DOC-CLOUDNOTES-01` at `₹1,499/yr`, `DOC-FITCLUB-01` at `₹2,499/qtr`, `DOC-BESCOM-01`, `DOC-MAXLIFE-01`, `DOC-LEARNPRO-01`, `DOC-BAJAJEMI-01`, `DOC-DESIGNVAULT-01`), while `CMT-READCLOUD` intentionally has no attached document to demonstrate `SERVICE_TERMS_UNAVAILABLE`.
