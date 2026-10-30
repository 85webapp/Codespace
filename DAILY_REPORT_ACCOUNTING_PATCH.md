# Daily Report accounting posting patch

The daily cash summary POST route now writes a deterministic journal entry (`JE-DAILY-<summary id>`) from the unbilled B2C sales and purchase rows. GST-rate groups are treated as tax-inclusive gross amounts and split into taxable value and tax. Sales credit revenue and output CGST/SGST while debiting cash/bank; purchases debit purchase expense/value and input CGST/SGST while crediting cash/bank. Re-saving the same daily summary updates the same journal entry rather than adding a second entry.

## Important limits
- This is a journal/trial-balance posting, not a generated tax invoice or a row in the operational `invoices` / `purchases` tables. The operational sales and purchase lists will not automatically show these summaries until those views are explicitly extended with a separate “Daily Report” record type.
- The code assumes entered amount is GST-inclusive and uses CGST/SGST split equally. It does not infer inter-state IGST from a counter sale because daily summary input has no place-of-supply/customer state.
- Live Neon transaction testing and production build were not possible in this environment. Deploy to staging first and verify trial balance debit/credit totals before using this for statutory filing.
