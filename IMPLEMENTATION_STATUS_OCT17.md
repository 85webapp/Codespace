# Cotrix GST implementation status — revision

## Changes in this revision
- Settings `RecordsManager` continues to provide tenant-scoped search, date-range filtering, selection, bulk delete, and limited descriptive/date edits.
- Bulk deletion now uses one PostgreSQL transaction for the entire selected batch. It locks and validates every requested record before changing data; any failure rolls back the whole batch.
- The bulk delete transaction reverses supported inventory movements, removes linked journal and app-created bank entries, adjusts supported party balances, and writes audit log entries.
- Unauthenticated requests to the purchases and quotations list endpoints now return HTTP 401 rather than returning empty results or exposing unscoped quotation data.
- Existing Cloudinary signed-upload workflow is retained for purchase-bill and admin media uploads.
- Invoices, purchases, expenses, and Settings record management support from/to date filters.

## Validation performed
- `node scripts/check-schema-names.mjs` passes.
- Source-level route checks and ZIP integrity check pass.
- `tsc --noEmit` cannot complete because dependencies/type packages are unavailable (`vite/client` missing). `npm install --no-audit --no-fund` timed out in this environment.
- No PostgreSQL service/credentials are available here, so database migrations and end-to-end accounting/stock tests were not run.

## Still not certified as complete
- Full monetary, GST, and line-item editing with journal, tax-ledger, party-balance, and stock re-posting is not implemented. The UI intentionally limits edits to descriptive/date fields to avoid silently corrupting accounts.
- Universal date filtering across every report/list in the application is not implemented; date filtering exists on the core sales, purchase, expense, and record-management lists.
- A successful production build, browser automation suite, and staging PostgreSQL integration tests remain required before claiming production readiness.


## PDF download/share compatibility update
- Added legacy Blob-download API support where available.
- Added a visible manual Download PDF / Open PDF recovery panel for browsers and mobile WebViews that ignore scripted downloads.
- File sharing uses the native Web Share API where supported; unsupported browsers fall back to the PDF recovery panel. A browser cannot be forced to invoke native sharing if the OS/container does not expose file sharing.
- Native Android WebView DownloadListener/FileProvider still requires the Android wrapper source and cannot be configured from this web-only repository.
