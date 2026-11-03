# DebitLens demo video script (2–3 minutes)

Use synthetic data only. Record the running application, not slides.

| Time | Screen and action | Presenter narration |
|---|---|---|
| 0:00–0:15 | Dashboard | “A bank statement can show a debit without explaining the service, processor, or action needed. DebitLens makes that commitment traceable.” |
| 0:15–0:40 | Import Studio; choose the supplied synthetic CSV; import; open Transactions | “I am importing a synthetic statement. DebitLens preserves the source descriptor, amount, direction and currency, then identifies recurring candidates.” |
| 0:40–1:05 | Open an unexplained/recurring debit investigation | “The descriptor is interpreted without collapsing processor and merchant identity. An unresolved candidate remains unresolved; it is not presented as independently verified.” |
| 1:05–1:30 | Open Commitment Passport/Reconciliation Centre | “The reconciliation compares the actual transaction with available service terms and mandate evidence. Missing evidence stays visible, and the actual amount and currency are not replaced with an estimate.” |
| 1:30–1:55 | Open Cancellation Centre; update Layer A, then Layer B separately | “Service cancellation and payment-mandate revocation are two separate actions. Recording one does not claim that the other completed or that a merchant confirmed it.” |
| 1:55–2:20 | Add reference-only evidence, then upload a synthetic PDF/image; open Evidence Pack | “A reference is labelled as user-entered evidence. A file is stored only after bytes and signatures are checked. The UI explicitly says authenticity has not been independently verified.” |
| 2:20–2:40 | Show Passport/Evidence Pack and observed post-cancellation activity | “DebitLens preserves provenance and highlights later observed activity without asserting fraud or legal liability.” |

## Exact navigation checklist

1. Start `npm run dev` and open `http://localhost:3000`.
2. Keep Demo Mode OFF unless explicitly demonstrating a scoped demo operation.
3. Use the supplied files under `public/samples/` or another synthetic CSV.
4. Navigate Dashboard → Import Studio → Transactions.
5. Select a recurring or unresolved row → Investigation.
6. Open Commitment Passport → Reconciliation.
7. Open Cancellation Centre and perform Layer A and Layer B independently.
8. Add reference-only evidence, then upload a synthetic PDF/image.
9. Open Evidence Pack and post-cancellation monitoring.

## Do not claim

- No bank, merchant or payment provider was contacted by this prototype.
- A checksum or valid file signature does not prove authenticity.
- User confirmation is not independent verification.
- An observed post-cancellation debit is not automatically fraud, fault or legal liability.
- Neo4j/Sarvam are optional integrations and are not required for local startup.

## Recording checklist

- [ ] Synthetic/non-sensitive data only.
- [ ] 1920×1080 or 1440×900 capture; readable browser zoom.
- [ ] Cursor and important state changes are visible.
- [ ] Browser notifications, credentials and unrelated tabs are hidden.
- [ ] Audio is clear and matches the actions.
- [ ] No unsupported claims in narration.
- [ ] Replay the final recording and check every workflow is visible.
