# Database startup migration

The server now runs idempotent `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS user_mobile VARCHAR(32)` statements before creating relational-table indexes. This addresses existing PostgreSQL tables that predate the `user_mobile` column; `CREATE TABLE IF NOT EXISTS` alone does not add columns to an existing table.

Deploy this code to Vercel and verify the `DATABASE_URL` environment variable points to the intended PostgreSQL database. The migration is additive and does not drop or rewrite existing records. Review the Vercel function logs after deployment; any remaining schema mismatch will appear as a new explicit database error.


Legacy inventory migration: the startup bootstrap now adds `item_name` and `normalized_name` if missing, backfills blank values from existing item names/IDs, and enforces NOT NULL before creating the inventory index. Review database backups before deployment as with any schema migration.
