# COTRIX GST follow-up fixes (26 Oct 2026)

This package contains source-level fixes for the requested follow-up work:

- Settings language control is no longer hard-coded/disabled; English and Hindi can be selected and the chosen locale is passed to the locale layer.
- Cashier Link has a dedicated Settings entry for non-cashier users.
- Cashier approval session metadata is persisted in localStorage so a reload/browser restart does not automatically discard it. The app still calls `/api/cashier/me` to validate approval and should clear the session when the server revokes access.
- Print CSS no longer forces every `.html2pdf__page-break` marker to split printed output, and tries to keep table rows/sections together.

## Important verification limits

- This environment could not complete `npm install`, so `npm run build` and TypeScript checks were not completed.
- The full Hindi translation catalogue is not yet complete; the selector/locale plumbing is enabled, but not every screen is translated.
- Daily-report-to-ledger/invoice posting is not changed here because posting invoice rows without validating all required columns, stock, tax, and payment side effects risks corrupting accounting data or creating duplicate sales. The existing daily summary is saved separately and ledger queries currently only surface limited estimated cash/online rows.
- The Business Details white screen needs the browser console error from the deployed build to isolate the runtime exception; no reliable source-level exception was identifiable from static inspection alone.
- Full invoice print verification needs actual A4 and thermal print-preview testing.
- Cashier persistent login is subject to `/api/cashier/me` approval validation; server-side revocation must remain authoritative.
