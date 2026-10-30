-- =============================================================================
-- ENTERPRISE ACCOUNTING & FORENSIC AUDIT ENGINE SCHEMA (Neon PostgreSQL)
-- Double-Entry Bookkeeping, Compliant Edit Log, and Final Accounts Engine
-- =============================================================================

-- 1. FORENSIC AUDIT TRAIL / EDIT LOG ENGINE (Section 143(3)(j) & Rule 11(g))
-- Captures INSERT, EDIT/UPDATE, DELETE changes immutably with old vs new diff payload
CREATE TABLE IF NOT EXISTS audit_edit_logs (
  log_id VARCHAR(64) PRIMARY KEY,
  table_name VARCHAR(64) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(16) NOT NULL CHECK (action_type IN ('INSERT', 'EDIT', 'UPDATE', 'DELETE')),
  user_id_context VARCHAR(64) NOT NULL DEFAULT 'SYSTEM_SESSION',
  timestamp_marker TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delta_diff_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_edit_logs_table_record ON audit_edit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_edit_logs_timestamp ON audit_edit_logs(timestamp_marker DESC);

-- 2. DOUBLE-ENTRY GENERAL LEDGER SYSTEM (journal_entries)
-- Automatic Journal Entry Pipeline: Records standard double-entry matrix
CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(64) PRIMARY KEY,
  entry_no VARCHAR(64) UNIQUE NOT NULL,
  date VARCHAR(16) NOT NULL,
  voucher_type VARCHAR(32) NOT NULL CHECK (voucher_type IN ('SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'CREDIT_NOTE', 'DEBIT_NOTE', 'BRS_ADJUSTMENT')),
  voucher_ref_no VARCHAR(64),
  narration TEXT,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ account: string, debit: number, credit: number }]
  user_mobile VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_voucher_type ON journal_entries(voucher_type);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_mobile ON journal_entries(user_mobile);

-- 3. STRUCTURAL BALANCE CACHE AGGREGATES
-- Accelerates real-time aggregation across all active ledger branches
CREATE TABLE IF NOT EXISTS balance_cache_aggregates (
  account_code VARCHAR(64) PRIMARY KEY,
  account_name VARCHAR(128) NOT NULL,
  account_group VARCHAR(64) NOT NULL, -- 'ASSETS', 'LIABILITIES', 'EQUITY', 'REVENUE', 'DIRECT_EXPENSES', 'INDIRECT_EXPENSES'
  sub_group VARCHAR(64) NOT NULL,     -- 'CURRENT_ASSETS', 'FIXED_ASSETS', 'CURRENT_LIABILITIES', 'CAPITAL', 'REVENUE_OPERATING', etc.
  total_debit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_credit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  net_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  balance_type VARCHAR(8) NOT NULL CHECK (balance_type IN ('Dr', 'Cr')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. BANK STATEMENT EXTRACTION & RECONCILIATION DATASET
CREATE TABLE IF NOT EXISTS bank_statement_records (
  id VARCHAR(64) PRIMARY KEY,
  user_mobile VARCHAR(32),
  statement_date VARCHAR(16) NOT NULL,
  value_date VARCHAR(16),
  description TEXT NOT NULL,
  ref_cheque_no VARCHAR(64),
  debit_withdrawal NUMERIC(15, 2) DEFAULT 0.00,
  credit_deposit NUMERIC(15, 2) DEFAULT 0.00,
  balance NUMERIC(15, 2),
  reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'UNRECONCILED' CHECK (reconciliation_status IN ('CLEARED', 'UNRECONCILED', 'MISSING_IN_BOOKS')),
  clearing_date VARCHAR(16),
  matched_journal_entry_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_stmt_status ON bank_statement_records(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bank_stmt_user ON bank_statement_records(user_mobile);

-- 5. TEMPORARY PURCHASE STAGING TABLE (PDF OCR & Multi-Image Ingestion Stream)
CREATE TABLE IF NOT EXISTS temporary_purchase_stage (
  id VARCHAR(64) PRIMARY KEY,
  user_mobile VARCHAR(32),
  supplier_name VARCHAR(128),
  supplier_gstin VARCHAR(32),
  supplier_phone VARCHAR(32),
  supplier_address TEXT,
  supplier_state VARCHAR(64),
  supplier_state_code VARCHAR(8),
  place_of_supply VARCHAR(64),
  invoice_classification VARCHAR(16) NOT NULL DEFAULT 'B2B' CHECK (invoice_classification IN ('B2B', 'B2C', 'B2G')),
  invoice_number VARCHAR(64) NOT NULL,
  invoice_date VARCHAR(32) NOT NULL,
  hsn_code VARCHAR(32),
  taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
  cgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  sgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  igst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_MATCH',
  duplicate_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  raw_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temp_purchase_gstin_inv ON temporary_purchase_stage(supplier_gstin, invoice_number);
CREATE INDEX IF NOT EXISTS idx_temp_purchase_user ON temporary_purchase_stage(user_mobile);

-- 6. GSTR-2B GOVERNMENT PORTAL CACHE TABLE (Native JSON Parser Stream)
CREATE TABLE IF NOT EXISTS gstr2b_portal_cache (
  id VARCHAR(64) PRIMARY KEY,
  user_mobile VARCHAR(32),
  supplier_gstin VARCHAR(32) NOT NULL,
  supplier_name VARCHAR(128),
  invoice_number VARCHAR(64) NOT NULL,
  invoice_date VARCHAR(32) NOT NULL,
  taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  cgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  sgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  igst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  filing_period VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gstr2b_cache_gstin_inv ON gstr2b_portal_cache(supplier_gstin, invoice_number);
CREATE INDEX IF NOT EXISTS idx_gstr2b_cache_user ON gstr2b_portal_cache(user_mobile);

-- 7. PERMANENT PURCHASE LEDGER (Final Confirmed Tax Audit Books)
CREATE TABLE IF NOT EXISTS permanent_purchase_ledger (
  id VARCHAR(64) PRIMARY KEY,
  user_mobile VARCHAR(32),
  supplier_name VARCHAR(128) NOT NULL,
  supplier_gstin VARCHAR(32) NOT NULL,
  supplier_phone VARCHAR(32),
  invoice_number VARCHAR(64) NOT NULL,
  invoice_date VARCHAR(32) NOT NULL,
  taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  cgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  sgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  igst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  verification_source VARCHAR(64) NOT NULL DEFAULT 'GSTR2B_RECONCILED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perm_purchase_gstin_inv ON permanent_purchase_ledger(supplier_gstin, invoice_number);
CREATE INDEX IF NOT EXISTS idx_perm_purchase_user ON permanent_purchase_ledger(user_mobile);

-- 8. PAYMENT VOUCHERS LEDGER (Multi-Tenant Customer Receipts & Vendor Settlements)
CREATE TABLE IF NOT EXISTS payment_vouchers_ledger (
  voucher_id VARCHAR(64) PRIMARY KEY,
  tenant_mobile_id VARCHAR(32) NOT NULL,
  party_id VARCHAR(64),
  party_name VARCHAR(128) NOT NULL,
  party_phone VARCHAR(32),
  party_gstin VARCHAR(32),
  party_address TEXT,
  voucher_type_direction VARCHAR(32) NOT NULL,
  base_amount_paid NUMERIC(15, 2) NOT NULL,
  net_balance_snapshot NUMERIC(15, 2) NOT NULL,
  balance_after_settlement NUMERIC(15, 2) NOT NULL,
  payment_mode VARCHAR(32) NOT NULL DEFAULT 'Cash-Drawer',
  notes TEXT,
  date VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvl_tenant_mobile ON payment_vouchers_ledger(tenant_mobile_id);
CREATE INDEX IF NOT EXISTS idx_pvl_party_name ON payment_vouchers_ledger(party_name);
CREATE INDEX IF NOT EXISTS idx_pvl_direction ON payment_vouchers_ledger(voucher_type_direction);
CREATE INDEX IF NOT EXISTS idx_pvl_created_at ON payment_vouchers_ledger(created_at DESC);


-- 6. User-entered tax ledger opening balances (tenant-scoped)
CREATE TABLE IF NOT EXISTS tax_ledger_opening_balances (
  user_mobile VARCHAR(32) PRIMARY KEY,
  electronic_cash_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (electronic_cash_balance >= 0),
  electronic_credit_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (electronic_credit_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bank_statement_records ADD COLUMN IF NOT EXISTS record_source VARCHAR(24) NOT NULL DEFAULT 'BANK_STATEMENT';
ALTER TABLE bank_statement_records ALTER COLUMN debit_withdrawal DROP NOT NULL;
ALTER TABLE bank_statement_records ALTER COLUMN credit_deposit DROP NOT NULL;

-- Reconciliation persistence and safety migrations (idempotent on existing Neon databases)
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'UNRECONCILED';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE bank_statement_records ADD COLUMN IF NOT EXISTS matched_journal_entry_id VARCHAR(64);
ALTER TABLE bank_statement_records ADD COLUMN IF NOT EXISTS clearing_date VARCHAR(16);
ALTER TABLE permanent_purchase_ledger ADD COLUMN IF NOT EXISTS gstr2b_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE permanent_purchase_ledger ALTER COLUMN verification_source SET DEFAULT 'UNVERIFIED';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_reverse_charge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rcm_applicable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rcm_calculated_tax NUMERIC(15,2) NOT NULL DEFAULT 0.00;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rcm_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_inter_state BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gstr2b_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) NOT NULL DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_by VARCHAR(32);
UPDATE orders SET payment_status='COD_DUE' WHERE payment_method='COD' AND payment_status='PENDING';


-- Tenant-owned stock ledger used by purchase and sales invoice flows
CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(64) PRIMARY KEY, user_mobile VARCHAR(32) NOT NULL, item_name VARCHAR(256) NOT NULL,
  normalized_name VARCHAR(256) NOT NULL, hsn VARCHAR(32), unit VARCHAR(32) NOT NULL DEFAULT 'PCS',
  quantity_on_hand NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  average_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_mobile, normalized_name)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(64) PRIMARY KEY, user_mobile VARCHAR(32) NOT NULL, inventory_item_id VARCHAR(64) NOT NULL,
  source_type VARCHAR(24) NOT NULL, source_id VARCHAR(64) NOT NULL, quantity_delta NUMERIC(15,3) NOT NULL,
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_user_source ON inventory_movements(user_mobile, source_type, source_id);

CREATE TABLE IF NOT EXISTS credit_debit_notes (
  id VARCHAR(64) PRIMARY KEY, user_mobile VARCHAR(32), note_number VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL, date VARCHAR(32) NOT NULL, original_invoice_no VARCHAR(64),
  original_invoice_date VARCHAR(32), party_id VARCHAR(64), party_name VARCHAR(128), party_gstin VARCHAR(32),
  reason TEXT, sub_total NUMERIC(15,2) NOT NULL DEFAULT 0, cgst_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_total NUMERIC(15,2) NOT NULL DEFAULT 0, igst_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(15,2) NOT NULL DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE credit_debit_notes ADD COLUMN IF NOT EXISTS user_mobile VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_user ON credit_debit_notes(user_mobile, created_at DESC);
