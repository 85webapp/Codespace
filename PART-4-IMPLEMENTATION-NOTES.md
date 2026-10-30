# Part-4 Implementation Notes

## ITC Dashboard
- Replaced the dark cockpit styling with a white/slate light theme and readable responsive tables.
- Dashboard figures are now loaded from the account-scoped `/api/compliance/itc-summary` endpoint. It displays a loading state and an error/retry state rather than substituting client-side zero/RCM figures if the API fails.
- Tax matrix categories without a corresponding source in the available database are returned as unavailable (`null`) rather than being represented as fake zero amounts.

## Tax Ledger Accounts
- Added tenant-scoped `tax_ledger_opening_balances` persistence for Electronic Cash Ledger and Electronic Credit Ledger (ITC) opening balances.
- Added `GET /api/accounting/tax-ledger-balances` and `PUT /api/accounting/tax-ledger-balances`.
- Replaced hard-coded sample ledger/tax amounts in Reports > Tax Ledger Accounts with saved balances and live ITC summary values.

## Purchase, Sales, Expenses, and BRS
- Purchase entry forms support Cash or Bank/Check for paid amounts, partial paid amounts for unpaid bills, and a quick full-payment checkbox.
- Purchase backend derives the effective paid amount and remaining payable balance, and journals paid portions to Cash/Bank while only the remainder goes to the supplier due account.
- Sales journal entries split the amount actually received from the remaining receivable. Bank/Check/UPI receipts are added to BRS as app-side entries.
- Expenses now create tenant-scoped double-entry journal rows and route online/bank/cheque expenses into BRS. Cash expenses route to the Cash Account.
- BRS rows distinguish app-side ledger entries from imported/manual bank statement entries so the app-side entries do not inflate the statement balance or match themselves during reconciliation.
- Expanded the manual BRS entry form with reference and optional statement-balance fields.

## Validation
- Syntax transpilation was run on the modified TypeScript/TSX files.
- A full dependency-backed type check, production build, and live Neon database test were not possible in this environment because dependency installation timed out.
