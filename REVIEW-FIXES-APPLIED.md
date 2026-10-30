# Cotrix GST — Applied Code Fixes

This report describes changes made in this revision. The patch was checked for TypeScript/TSX syntax, but it has not been run against the owner's live Neon/Firebase/Cloudinary/Vercel services.

## Security and tenant isolation

- Removed insecure default admin credentials. Admin access now requires configured `ADMIN_MOBILE` and `ADMIN_PASSWORD`.
- Production startup now requires `DATABASE_URL` and a `SESSION_SECRET` of at least 32 characters.
- PostgreSQL query/connection failures no longer silently fall back to volatile in-memory writes in production. Database bootstrap failure stops production startup.
- Credentialed CORS no longer reflects arbitrary origins. Configure `CORS_ALLOWED_ORIGINS` when the frontend and API use different origins.
- Session revocation and cashier-device revocation are checked against PostgreSQL rather than trusting process-local caches.
- Logout revokes customer/admin sessions and clears both cookies; password reset evicts cached sessions.
- Legacy `x-user-mobile` headers are stripped centrally by `apiFetch`; the server does not use them as authentication.
- Removed shared `__NO_TENANT__`/guest fallbacks from payment, settlement, expense, accounting, staging-flush, profile, and backup queries. Payment deletion and audit reads are tenant-scoped.
- Account-scoped backup now requires an authenticated owner and exports only that owner's rows.

## Accounting integrity

- Invoice creation now validates amounts and creates the invoice, journal entry, bank-app entry, audit record, and party balance update in one PostgreSQL transaction. Invoice number allocation is serialized per tenant.
- Purchase creation now validates amounts and payment values and writes the purchase, balanced journal, bank-app entry, audit record, and supplier balance update in one transaction. Duplicate checks are serialized per tenant.
- Expense creation now writes the expense, journal, bank-app entry, and audit record atomically. The accounting engine no longer double-counts expenses that already have journal entries. Business profile upserts preserve existing non-empty fields when partial forms submit empty placeholders.
- Payment In/Out writes the payment, party balance update, journal, optional BRS app entry, and audit record atomically. Deleting a standard payment reverses its linked ledger effect; settlement-voucher payments cannot be deleted directly because their invoice allocations need a reversal workflow.
- Settlement vouchers now update the voucher, party balance, FIFO invoice/purchase allocations, mirrored payment, journal, optional BRS app entry, and audit record within one transaction. Direct deletion of a settlement-linked payment is blocked to avoid leaving invoice allocations behind.
- Credit/debit notes are tenant-scoped and saved with their journal, party-balance adjustment, and audit record in one transaction. Manual journal entries validate every line and commit with an audit record.
- ITC no longer falls back to all raw purchase rows. It counts only rows with the server-set `gstr2b_verified` flag and an accepted verification source.
- Manually entered purchases no longer automatically become eligible ITC records. GSTR-2B promotion endpoints now require a tenant-owned staged/books record and a matching imported GSTR-2B row with matching taxable and total values.
- RCM is stored on purchase records, its amount is calculated server-side from taxable value and selected GST rate, and RCM liability is sourced from purchases rather than sales invoices. RCM liability is not automatically added to available ITC.
- BRS reconciliation now reads persisted bank-statement rows, avoids ambiguous automatic matches, and persists match status, clearing date, and linked journal entry IDs in a transaction.
- Manual BRS entries validate non-negative values, debit/credit exclusivity, and the running balance against the latest saved statement balance when dates can be compared.

## Store and checkout

- Product stock is persisted in the database and editable in Admin Store. Unknown existing stock defaults to zero rather than a fabricated quantity; set the actual stock in Admin Store before accepting orders.
- Added tenant-owned `inventory_items` and `inventory_movements` ledgers. Named purchase lines increase stock and sales invoices decrease stock in their respective transactions; sales of tracked items are blocked if stock would become negative. Generic placeholder purchase lines are intentionally not treated as real inventory.
- Checkout reserves stock using conditional database updates in the order transaction to prevent overselling under concurrent orders.
- Cancelling an order restores reserved stock once. Cancelled orders cannot be reopened without a new stock reservation.
- Checkout enforces all configured product variant dimensions server-side.
- Online QR/UPI orders are stored as `PAYMENT_PENDING`, not falsely confirmed/paid. Admins can record a UTR/transaction reference after checking their bank/UPI app; the server blocks dispatch statuses until payment is marked verified.
- Customer confirmation text now distinguishes an online order awaiting manual payment verification from a confirmed COD/verified order.

## UX reliability

- `apiFetch` now tolerates unavailable/restricted local storage without crashing API calls.
- Existing PDF sharing, haptic feedback, and Web Audio feedback utilities were retained.

## Validation performed

- TypeScript/TSX syntax transpilation: **52 files parsed, 0 syntax diagnostics**.
- `npm run build` was attempted but could not start because `vite` is not installed in this environment. `npm install` timed out, so a full build, dependency-backed TypeScript semantic check, and lint run could not be completed here.
- No live database migration or end-to-end test was performed against the owner's hosted services. Apply this revision to a staging deployment first and verify the schema migrations before production.

## Important operational note

- Set `DATABASE_URL`, `SESSION_SECRET` (32+ characters), `ADMIN_MOBILE`, `ADMIN_PASSWORD`, and any needed `CORS_ALLOWED_ORIGINS` in the hosting environment. Do not place real secrets in source files or this ZIP.
- GSTR-2B promotion verifies against records imported into this app; it is not a direct live GSTN API verification.
- Online payment verification is manual by an administrator after checking the bank/UPI transaction; this revision does not claim an automatic payment gateway integration.

## Follow-up review (2026-10-17)

- Added `npm run check:schema-names` as a regression guard against the reported `user_mobilo` spelling mistake. The supplied archive already used `user_mobile` in its SQL schema declarations; no `user_mobilo` occurrence was found in the source files.
- Fixed `.env.example`: `VITE_API_BASE_URL` and `CORS_ALLOWED_ORIGINS` were accidentally combined on one line, which made the example environment configuration misleading.
- Validation limitation: dependency installation timed out in this environment, so the full Vite build and dependency-backed TypeScript checks remain unverified. Run the regression check and build in an environment with project dependencies installed; test database initialization against a staging PostgreSQL database before production.
