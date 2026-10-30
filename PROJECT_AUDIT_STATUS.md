# Cotrix GST — database/startup audit status

## Changes included in this revision
- Keeps the additive `user_mobile` migration for legacy tables.
- Adds an early startup migration for `inventory_items.item_name` and `inventory_items.normalized_name`, and backfills blank values before inventory index creation.
- Adds early migrations for several other columns referenced by startup indexes (`audit_edit_logs.timestamp_marker`, `credit_debit_notes.created_at`, journal/tax/bank user columns, inventory movement index columns, and admin index columns).
- Keeps the schema-name regression check for `user_mobilo`.

## Checks run
- `node scripts/check-schema-names.mjs`: passed.
- Static ordering checks for user_mobile/normalized_name migration before relevant index declarations: passed.
- Dependency installation timed out in this environment, so a full TypeScript check, production build, and automated runtime tests could not be completed.
- No connection to the production Vercel PostgreSQL database was available. The live schema and login flow remain unverified.

## Deployment guidance
1. Back up the production PostgreSQL database before deploying schema changes.
2. Commit and deploy this exact ZIP's source to the same Git branch/project configured in Vercel; confirm the deployment commit matches the latest changes.
3. Confirm `DATABASE_URL` points to the intended database and production `SESSION_SECRET` is configured (at least 32 characters).
4. Check the new deployment's function logs and run a login smoke test.
5. If startup still fails, capture the first error from the new deployment. Startup migration can only add the columns explicitly listed; additional legacy schema differences may need a targeted migration.
