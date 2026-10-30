# Cotrix GST source audit and test status

## Targeted fixes included in this ZIP

- `src/components/IndianAmountInput.tsx`: added a reusable responsive money input that groups digits using Indian numbering while typing and after blur, preserves decimal text such as `200.00`, emits ungrouped numeric strings to existing state/calculation code, and validates required/min/max values.
- `src/utils/formatters.ts`: added safe parsing for comma-grouped values, Indian input formatting, and preserved trailing decimal zeroes in editable amount values.
- Integrated the money input into existing monetary entry points in sales, purchases, expenses, party opening balances, business capital, payment settlement, bank reconciliation, journal entries, GST reconciliation, OCR invoice review, product pricing, daily close/cash figures, and other money fields. Quantity, distance, GST percentage, invoice sequence, and other non-money numeric fields remain numeric inputs.
- `src/utils/pdfShare.ts`: added bounded waiting for images/fonts, disabled tainted-canvas rendering, added PNG download/share helpers, improved object-URL cleanup timing, and distinguishes cancelled sharing from unsupported/failed sharing. Share status avoids claiming that a customer received the file.
- `src/components/BusinessProfileModal.tsx`: added a separate visiting-card PNG download action and busy/error/status feedback.
- `src/components/InvoiceDetailModal.tsx`: added Save as Image and Share Image actions; expanded the PDF cache key to cover invoice and company data, selected theme/color, layout and print settings.
- `src/components/ReportsHub.tsx`: improved report JSON metadata, column/record output, numeric value coercion for clearly numeric cells, empty-table messaging, and duplicate-click protection. Existing report calculations and navigation were not intentionally changed.
- `scripts/test-formatters.ts` and `package.json`: added a reproducible formatting test command (`npm run test:formatters`).

## Report IDs found in source

The report selector/export path references these IDs: `sale_report`, `purchase_report`, `day_book`, `all_transactions`, `bill_wise_profit`, `profit_and_loss`, `cashflow`, `balance_sheet`, `trial_balance`, `party_statement`, `party_wise_profit`, `all_parties_report`, `sale_purchase_by_party`, `gst_report`, `tax_ledger`, `rcm_account`, `brs_statement`, `journal_ledger`, and `audit_log`.

## Checks actually run in this environment

- Indian number formatting/parsing: **PASS** — 8 formatting cases plus grouped-value parsing and currency formatting were executed against the compiled `formatters.ts` implementation.
- `node scripts/check-schema-names.mjs`: **PASS** — `Schema-name regression check passed.`
- TypeScript/TSX syntax scan with global `tsc` and unresolved imports: **no TS1xxx parser/syntax errors found**, but it is not a substitute for a dependency-complete typecheck.
- `npm run lint`: **BLOCKED** — `TS2688: Cannot find type definition file for 'vite/client'`; project dependencies are not installed.
- `npm run build`: **BLOCKED** — `vite: not found`; the package installation attempt timed out and the offline install failed because the `@google/genai` package is not cached.
- Real Android Chrome / WhatsApp / WebView tests: **NOT RUN**.

## Important limitations

- Report JSON still reads the currently displayed HTML table because report components do not expose one shared structured-data contract for every report. It does not fabricate rows when no table exists, but summary-only/non-table report content may not be represented as structured records. Report-by-report integration with each actual report data source is still required for a complete authoritative JSON export system.
- PNG export renders the current invoice element as one tall image. Very long documents may hit browser canvas limits; use the PDF for complete paginated output.
- Native share support depends on a secure browser context and the platform's Web Share file support. This has not been verified on a physical Android device. Android WebView wrappers may need native download/share integration.
- Business-card and document image export depend on images being canvas-readable (same-origin or CORS-enabled). Rendering failures should surface an error rather than produce a misleading success message.
- The complete requested regression matrix (every report, all invoice page sizes/templates, sales/purchase workflows, GST calculations, auth/session behavior, database-backed tests, and real mobile sharing) could not be executed here. This ZIP is a targeted repair/audit build, **not a certified production-ready release**. Install dependencies and run the checks below before deploying.

## Before deployment

From the project folder, run:

```bash
npm install
npm run test:formatters
npm run lint
npm run build
npm run check:schema-names
```

Then test the existing billing and report workflows against a non-production database and verify file sharing on supported mobile browsers before promoting the build.
