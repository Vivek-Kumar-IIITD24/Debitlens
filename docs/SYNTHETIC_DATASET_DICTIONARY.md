# Synthetic Dataset Dictionary

All datasets in `data/` are 100% synthetic and crafted to test every required HackFront Fintech T4.1 + Neo4j + Sarvam AI scenario.

## 1. `data/synthetic-transactions.csv` (45 Transactions)
| Transaction IDs | Merchant / Descriptor | Pattern Tested |
| :--- | :--- | :--- |
| `TXN-1001..1005` | `RZP*STREAMBOX`, `STREAMBOX*BILL`, `RAZORPAY*STREAMBOX` | Multi-descriptor unification across Razorpay + UPI AutoPay (`MATCHED` at `₹499`, or `AMOUNT_DISCREPANCY` in Section 22 Judge Demo at `₹799`) |
| `TXN-2001..2005` | `SI-MUSICFLOW-IN`, `BILLDESK*MUSICFLOW` | Monthly Card e-Mandate with price increase (`₹199` documented vs `₹249` actual → `AMOUNT_DISCREPANCY`) |
| `TXN-3001..3003` | `GOOGLE*CLOUDNOTES` | Annual Google Play subscription (`₹1,499/year` → `MATCHED`) |
| `TXN-4001..4004` | `PAYU*FITCLUBPRO`, `FITCLUB*QUARTERLY` | Quarterly membership without imported mandate (`TRANSACTION_WITHOUT_VISIBLE_MANDATE`) |
| `TXN-5001..5005` | `BBPS*BESCOM-UTIL`, `BILLDESK*BESCOM` | Variable-amount utility auto-debit (`₹1,390` – `₹1,685` → `SERVICE_TERMS_UNAVAILABLE`) |
| `TXN-6001..6003` | `NACH-DR-MAXLIFE-POL99` | Irregular NACH insurance obligation (`138d`, `108d` observed intervals vs `QUARTERLY` documented policy at `₹12,850` → `FREQUENCY_DISCREPANCY`) |
| `TXN-7001..7005` | `RZP*READCLOUD`, `READCLOUD*SUB` | Resumed after 2-month gap (`SERVICE_TERMS_UNAVAILABLE`) |
| `TXN-8001` | `RAZORPAY*LEARNPRO-AI` | Trial-to-paid conversion (`₹999`) corroborated by `NOTIF-201` (`MATCHED`) |
| `TXN-9001..9004` | `NACH-BAJAJFIN-EMI44` | Contractual Loan EMI obligation (`₹8,450/month` → `MATCHED`) |
| `TXN-9101..9104` | `SI-DESIGNVAULT-PRO` | Cancelled on `2026-09-10`, post-cancellation debit `TXN-9104` on `2026-10-26` (`CONFLICTING_EVIDENCE`) |
| `TXN-9501..9503` | `UPI/DR/42571190/RAZORPAY`, `RAZORPAY*99812-MUM`, `CASHFREE*MERCH-771` | Processor-only descriptors kept `UNRESOLVED` (never falsely merged) |
| `TXN-9801..9802` | `THIRDWAVE COFFEE ROASTERS`, `INDIGO AIRLINES PNQ-DEL` | One-time retail/travel spend (excluded from recurring commitments) |
| `TXN-9803` | `REV-RZP*STREAMBOX-REFUND` | `CREDIT` refund transaction (`₹499`, excluded from recurring debit totals) |

## 2. Seed Mandates (`buildInitialSeedMandates`)
Includes 9 active/revoked mandates linked to commitments (`MND-STREAMBOX-01` with `₹999` ceiling, `MND-MUSICFLOW-01` with `₹500` ceiling, `MND-CLOUDNOTES-01` at `₹1,499/yr`, `MND-BESCOM-01` at `₹5,000/mo`, `MND-MAXLIFE-01` at `₹15,000/qtr`, `MND-READCLOUD-01` at `₹299/mo`, `MND-LEARNPRO-01` at `₹999/mo`, `MND-BAJAJEMI-01` at `₹8,450/mo`, `MND-DESIGNVAULT-01` revoked on `2026-09-10`) plus 1 dormant mandate with no recent transactions (`MND-DORMANT-NEWSPLUS` → `MANDATE_WITHOUT_RECENT_TRANSACTION`).

## 3. Seed Service Terms / Invoices (`buildInitialSeedServiceTerms`)
Includes 8 documented service terms records (`DOC-STREAMBOX-01` at `₹499/mo`, `DOC-MUSICFLOW-01` at `₹199/mo`, `DOC-CLOUDNOTES-01` at `₹1,499/yr`, `DOC-FITCLUB-01` at `₹1,499/mo`, `DOC-MAXLIFE-01` at `₹12,850/qtr`, `DOC-LEARNPRO-01` at `₹999/mo`, `DOC-BAJAJEMI-01` at `₹8,450/mo`, `DOC-DESIGNVAULT-01` at `₹649/mo`), while `CMT-READCLOUD` and `CMT-BESCOM` intentionally have no attached document to demonstrate `SERVICE_TERMS_UNAVAILABLE`.
