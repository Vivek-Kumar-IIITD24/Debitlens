# Explainable Confidence Scoring & Candidate Classification Specification

## 1. 100-Point Additive Formula (`computeConfidenceBreakdown`)
Every detected commitment in DebitLens receives an explicit, inspectable 100-point confidence breakdown:

$$\text{Total Score} = P_{\text{interval}} + P_{\text{identity}} + P_{\text{occurrences}} + P_{\text{amount}} + P_{\text{mandate/notif}}$$

1. **Interval Consistency ($P_{\text{interval}}$, max 30 points):**
   - Regular cadence with low variance ($\le 3$ days drift): `28–30 pts`
   - Annual renewal or resumed cadence: `22–26 pts`
   - Irregular cadence with mandate/notification support: `16–20 pts`
2. **Merchant Identity Resolution ($P_{\text{identity}}$, max 25 points):**
   - Exact canonical or verified alias match (`CONFIRMED`): `25 pts`
   - Processor + merchant token match: `22–24 pts`
   - Inferred descriptor match (`INFERRED`): `18 pts`
3. **Occurrence Count ($P_{\text{occurrences}}$, max 20 points):**
   - $\ge 4$ occurrences: `20 pts`
   - $3$ occurrences: `17 pts`
   - $2$ occurrences (e.g., annual renewal): `14 pts`
   - $1$ occurrence + verified trial conversion notification: `12 pts`
4. **Amount Stability ($P_{\text{amount}}$, max 15 points):**
   - Fixed recurring amount: `15 pts`
   - Step-change price increase or variable utility bill: `12 pts`
5. **Mandate or Pre-Debit Notification Evidence ($P_{\text{mandate/notif}}$, max 10 points):**
   - Linked mandate reference or pre-debit/trial notification present: `10 pts`
   - Statement evidence only: `5 pts`

## 2. `RecurringCandidate` vs Confirmed `FinancialCommitment`
- **`FINANCIAL_COMMITMENT` (`CONFIRMED` / `USER_CONFIRMED`):** Commitments with `totalScore >= 85` and at least 3 occurrences (or verified annual/mandate backing).
- **`RECURRING_CANDIDATE` (`PENDING_REVIEW`):** Lower-occurrence or trial-converted patterns (`totalScore < 85`, such as `CMT-LEARNPRO` with 1 trial conversion debit or `CMT-READCLOUD` resumed after a gap) start as `RECURRING_CANDIDATE` (`PENDING_REVIEW`) until the user explicitly confirms (`POST /api/commitments/:id/confirm`) or rejects (`POST /api/commitments/:id/reject`) them.
