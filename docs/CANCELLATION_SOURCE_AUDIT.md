# Cancellation Playbook Source & URL Audit (`DebitLens`)

## 1. Zero Fictional `.example.com` / `.example.in` URLs

All merchants and payment rails in `src/engine/referenceData.ts` and `src/engine/debitlensEngine.ts` have been audited to ensure **zero fake or placeholder `.example.com` / `.example.in` links** exist anywhere in the codebase.

### 1.1 Synthetic Demo Brands (`officialCancellationUrl: null`, `isDemoSyntheticService: true`)
For synthetic demonstration brands created for the HackFront benchmark dataset (`StreamBox`, `MusicFlow`, `FitClub Pro`, `ReadCloud`, `LearnPro AI`, `DesignVault`), DebitLens sets `officialCancellationUrl: null` and `isDemoSyntheticService: true`. Layer A instructions explicitly display `[Demo-Only Synthetic Service Instruction]` rather than fabricating fake external links.

### 1.2 Verified Official Real-World Service & Rail Routes
For real-world services and payment rails, DebitLens links only to verified official domains:
| Entity | Type | Verified Official URL | Last Verified |
|---|---|---|---|
| **Google Play Subscriptions** (`CloudNotes`) | Layer A & Layer B (`GOOGLE_PLAY`) | `https://support.google.com/googleplay/answer/7018481` | `2026-10-31` |
| **Google Pay UPI AutoPay** | Layer B (`UPI_AUTOPAY`) | `https://support.google.com/pay/india/answer/10840624?hl=en` | `2026-10-31` |
| **NPCI NACH / eNACH Mandate Overview** | Layer B (`ENACH_NACH`) | `https://www.npci.org.in/what-we-do/nach/product-overview` | `2026-10-31` |
| **RBI Recurring Card e-Mandate Reference** | Layer B (`CARD_EMANDATE`) | `https://www.rbi.org.in/Scripts/NotificationUser.aspx` | `2026-10-31` |
| **BESCOM Domestic Utility** | Layer A (`MERCH-BESCOM`) | `https://bescom.karnataka.gov.in` | `2026-10-31` |
| **MaxLife Insurance Customer Service** | Layer A (`MERCH-MAXLIFE`) | `https://www.maxlifeinsurance.com/customer-service` | `2026-10-31` |
| **Bajaj Finance Customer Portal** | Layer A (`MERCH-BAJAJFIN`) | `https://www.bajajfinserv.in/customer-portal` | `2026-10-31` |

---

## 2. Removal of Unsupported Universal "48 Hours" Deadlines

Different payment rails, card issuers, and merchants enforce different billing cut-off rules. DebitLens does **not** claim a universal "cancel at least 48 hours before renewal" rule. Instead, playbooks instruct users to:
> *"Check the merchant's stated cancellation cut-off and renewal terms."*

---

## 3. Contractual Obligation Safety Guardrails

For loan EMIs (`Bajaj Finance`), insurance policies (`MaxLife Insurance`), and essential utilities (`BESCOM`), DebitLens displays a prominent amber warning in both English and the selected Indian language (`hi-IN`, `ta-IN`, `bn-IN`, etc.) explaining that revoking a NACH/AutoPay mandate does **not** extinguish the underlying loan contract or policy obligation and may cause bounce fees, CIBIL credit score impact, or policy lapse.
