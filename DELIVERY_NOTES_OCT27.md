# COTRIX GST code update — 27 Oct 2026

## Changes applied in this source package
- Updated closing reminder logic to check whether the previous day's Daily Report is outstanding; reminder repeats are suppressed for the same date/time window. Uses browser notification, haptics, and a short audio tone where browser/device permissions and support allow it.
- Expanded Edit Records descriptive fields to include customer GSTIN/address and supplier mobile, and added corresponding tenant-scoped server update fields.
- Added Hindi display translations for the added edit fields and previous-day report reminder text.
- Declared Node.js >=22.12.0 in package.json to align with the current Vite 8 toolchain requirements on Vercel.
- Preserved existing database tables and migration behavior; no database reset/drop operation was added.

## Important status
This package is source code for your own staging/deployment verification. The existing Daily Report endpoint currently posts balanced journal lines for unbilled counter sales/purchases; it does **not** yet create separate operational rows in the `invoices` and `purchases` tables. The generic Edit Records form also still protects item prices/GST/totals from direct editing because those require coordinated tax, stock, and journal reposting. Do not treat those two requirements as completed in this package. No production build or live Neon database test was performed in this environment.
