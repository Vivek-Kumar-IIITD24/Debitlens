# Multilingual UX Architecture (`docs/MULTILINGUAL_UX.md`)

1. **Persistent Top Toolbar Selector:** Allows instant switching between English (`en-IN`), Hindi (`hi-IN`), Tamil (`ta-IN`), Bengali (`bn-IN`), Telugu (`te-IN`), Marathi (`mr-IN`), and Kannada (`kn-IN`).
2. **Non-Destructive Translation:** Merchant names (`StreamBox`, `MusicFlow`), processor names (`Razorpay`, `BillDesk`), INR currency figures (`₹499`), transaction IDs (`TXN-1003`), and official URLs are preserved verbatim across all target scripts.
3. **Side-by-Side English Reference Toggle:** Every translated explanation includes a toggleable English source card (`TranslationComparison.tsx`) and explicit model/fallback attribution (`LIVE_SARVAM_API` vs `VERIFIED_STATIC_FALLBACK`).
