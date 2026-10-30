import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool, testConnection } from './src/server/db.ts';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini SDK with User-Agent header
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const cleanMobileNumber = (value: unknown) => String(value ?? '').replace(/\D/g, '').slice(0, 15);
const safeEqual = (a: string, b: string): boolean => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};
if (process.env.NODE_ENV === 'production' && String(process.env.SESSION_SECRET || '').length < 32) {
  throw new Error('SESSION_SECRET must be configured with at least 32 characters in production.');
}

export function normalizeMimeType(mime: string | undefined, base64: string): string {
  if (!mime || typeof mime !== 'string' || mime === 'application/octet-stream' || !mime.includes('/')) {
    if (base64.startsWith('JVBERi0') || base64.startsWith('data:application/pdf')) return 'application/pdf';
    if (base64.startsWith('/9j/') || base64.startsWith('data:image/jpeg')) return 'image/jpeg';
    if (base64.startsWith('iVBORw') || base64.startsWith('data:image/png')) return 'image/png';
    if (base64.startsWith('UklGR') || base64.startsWith('data:image/webp')) return 'image/webp';
    return 'image/jpeg';
  }
  const lower = mime.toLowerCase().trim();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower.includes('pdf')) return 'application/pdf';
  if (lower.includes('png')) return 'image/png';
  if (lower.includes('webp')) return 'image/webp';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'image/jpeg';
  return 'image/jpeg';
}

export async function runGeminiVisionOCR(prompt: string, mimeType: string | undefined, cleanBase64: string, schemaProperties: any): Promise<any> {
  if (!ai || !cleanBase64 || cleanBase64.length < 50) return null;
  const normalizedMime = normalizeMimeType(mimeType, cleanBase64);
  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  
  for (const modelName of models) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: schemaProperties,
          },
        },
      });

      if (response && response.text) {
        return JSON.parse(response.text.trim());
      }
    } catch (err: any) {
      console.warn(`[OCR] Model ${modelName} attempt error:`, err.message);
    }
  }
  return null;
}

async function bcryptHash(password: string): Promise<string> {
  const b = (bcrypt as any).default || bcrypt;
  return b.hash(password, 12);
}

async function bcryptVerify(password: string, stored: string): Promise<boolean> {
  const b = (bcrypt as any).default || bcrypt;
  return b.compare(password, stored);
}

async function initRelationalTables() {
  try {
    // Backfill columns on tables created by older deployments. CREATE TABLE IF NOT EXISTS
    // does not update an existing table, which otherwise causes startup index creation to fail.
    const userMobileMigrationTables = [
      'temporary_purchase_stage', 'staged_purchases', 'gstr2b_portal_cache',
      'permanent_purchase_ledger', 'expenses', 'payments', 'quotations',
      'credit_debit_notes', 'journal_entries', 'tax_ledger_opening_balances',
      'bank_statement_records', 'invoices', 'purchases', 'parties',
      'app_settings', 'daily_cash_summaries', 'company_profiles',
      'ineligible_tax_logs', 'inventory_items', 'inventory_movements',
      'payment_vouchers_ledger'
    ];
    for (const tableName of userMobileMigrationTables) {
      // Table names come only from the fixed allowlist above, never from request input.
      await pool.query(`ALTER TABLE IF EXISTS ${tableName} ADD COLUMN IF NOT EXISTS user_mobile VARCHAR(32)`);
    }

    // Repair columns used by startup indexes on databases created by older app versions.
    // These must run BEFORE any CREATE INDEX statements in the bootstrap below.
    const startupColumnMigrations: Array<[string, string, string]> = [
      ['audit_edit_logs', 'timestamp_marker', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
      ['audit_edit_logs', 'table_name', "VARCHAR(64) NOT NULL DEFAULT 'unknown'"],
      ['audit_edit_logs', 'record_id', "VARCHAR(64) NOT NULL DEFAULT 'unknown'"],
      ['credit_debit_notes', 'created_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
      ['journal_entries', 'user_mobile', 'VARCHAR(32)'],
      ['tax_ledger_opening_balances', 'user_mobile', 'VARCHAR(32)'],
      ['bank_statement_records', 'user_mobile', 'VARCHAR(32)'],
      ['bank_statement_records', 'reconciliation_status', "VARCHAR(32) NOT NULL DEFAULT 'UNRECONCILED'"],
      ['inventory_items', 'user_mobile', 'VARCHAR(32)'],
      ['inventory_items', 'item_name', 'VARCHAR(256)'],
      ['inventory_items', 'normalized_name', 'VARCHAR(256)'],
      ['inventory_items', 'hsn', 'VARCHAR(32)'],
      ['inventory_items', 'unit', "VARCHAR(32) NOT NULL DEFAULT 'PCS'"],
      ['inventory_items', 'quantity_on_hand', 'NUMERIC(15,3) NOT NULL DEFAULT 0'],
      ['inventory_items', 'average_cost', 'NUMERIC(15,2) NOT NULL DEFAULT 0'],
      ['inventory_items', 'created_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
      ['inventory_items', 'updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
      ['inventory_movements', 'user_mobile', 'VARCHAR(32)'],
      ['inventory_movements', 'source_type', 'VARCHAR(24)'],
      ['inventory_movements', 'source_id', 'VARCHAR(64)'],
      ['admin_device_registry', 'mobile', 'VARCHAR(32)'],
      ['admin_access_blocks', 'is_locked', 'BOOLEAN NOT NULL DEFAULT TRUE'],
      ['admin_access_blocks', 'blocked_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
    ];
    for (const [tableName, columnName, columnDefinition] of startupColumnMigrations) {
      // Identifiers/definitions are fixed in this source-controlled allowlist.
      await pool.query(`ALTER TABLE IF EXISTS ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${columnDefinition}`);
    }

    // Upgrade legacy inventory tables before the index below is created. CREATE TABLE IF NOT EXISTS
    // will not add these columns when inventory_items already exists from an older deployment.
    await pool.query(`ALTER TABLE IF EXISTS inventory_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(256)`);
    await pool.query(`ALTER TABLE IF EXISTS inventory_items ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(256)`);
    // Repair null/default/nullable states too, not just missing columns. These
    // statements are idempotent and safe to rerun on every application boot.
    await pool.query(`
      DO $$
      BEGIN
        IF to_regclass('public.inventory_items') IS NOT NULL THEN
          UPDATE inventory_items SET quantity_on_hand=0 WHERE quantity_on_hand IS NULL;
          UPDATE inventory_items SET average_cost=0 WHERE average_cost IS NULL;
          UPDATE inventory_items SET unit='PCS' WHERE unit IS NULL OR BTRIM(unit)='';
          UPDATE inventory_items SET created_at=NOW() WHERE created_at IS NULL;
          UPDATE inventory_items SET updated_at=NOW() WHERE updated_at IS NULL;
          ALTER TABLE inventory_items ALTER COLUMN quantity_on_hand SET DEFAULT 0;
          ALTER TABLE inventory_items ALTER COLUMN quantity_on_hand SET NOT NULL;
          ALTER TABLE inventory_items ALTER COLUMN average_cost SET DEFAULT 0;
          ALTER TABLE inventory_items ALTER COLUMN average_cost SET NOT NULL;
          ALTER TABLE inventory_items ALTER COLUMN unit SET DEFAULT 'PCS';
          ALTER TABLE inventory_items ALTER COLUMN unit SET NOT NULL;
          ALTER TABLE inventory_items ALTER COLUMN created_at SET DEFAULT NOW();
          ALTER TABLE inventory_items ALTER COLUMN created_at SET NOT NULL;
          ALTER TABLE inventory_items ALTER COLUMN updated_at SET DEFAULT NOW();
          ALTER TABLE inventory_items ALTER COLUMN updated_at SET NOT NULL;
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF to_regclass('public.inventory_items') IS NOT NULL THEN
          UPDATE inventory_items
          SET item_name = COALESCE(NULLIF(BTRIM(item_name), ''), id),
              normalized_name = COALESCE(NULLIF(BTRIM(normalized_name), ''), LOWER(BTRIM(COALESCE(NULLIF(item_name, ''), id))))
          WHERE item_name IS NULL OR BTRIM(item_name) = '' OR normalized_name IS NULL OR BTRIM(normalized_name) = '';
          ALTER TABLE inventory_items ALTER COLUMN item_name SET NOT NULL;
          ALTER TABLE inventory_items ALTER COLUMN normalized_name SET NOT NULL;
        END IF;
      END $$;
    `);
    await pool.query(`
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

      CREATE TABLE IF NOT EXISTS staged_purchases (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        supplier_name VARCHAR(128),
        supplier_gstin VARCHAR(32),
        supplier_phone VARCHAR(32),
        supplier_address TEXT,
        supplier_state VARCHAR(64),
        supplier_state_code VARCHAR(8),
        place_of_supply VARCHAR(64),
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
        verification_source VARCHAR(64) NOT NULL DEFAULT 'UNVERIFIED',
        gstr2b_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        expense_no VARCHAR(64) NOT NULL,
        date VARCHAR(32) NOT NULL,
        category VARCHAR(64) NOT NULL,
        title VARCHAR(128) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        payment_mode VARCHAR(32) NOT NULL DEFAULT 'CASH',
        paid_to VARCHAR(128),
        notes TEXT,
        recurring_expense_id VARCHAR(64),
        recurrence_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_expense_id VARCHAR(64);
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_date DATE;

      CREATE TABLE IF NOT EXISTS permanent_expenses (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32) NOT NULL,
        title VARCHAR(128) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        category VARCHAR(64) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
        payment_mode VARCHAR(32) NOT NULL DEFAULT 'CASH',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE permanent_expenses ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
      ALTER TABLE permanent_expenses ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
      ALTER TABLE permanent_expenses ADD COLUMN IF NOT EXISTS end_date DATE;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_occurrence
        ON expenses (recurring_expense_id, recurrence_date)
        WHERE recurring_expense_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_permanent_expenses_active_user
        ON permanent_expenses (user_mobile, active);

      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        type VARCHAR(32) NOT NULL,
        receipt_no VARCHAR(64) NOT NULL,
        date VARCHAR(32) NOT NULL,
        party_id VARCHAR(64),
        party_name VARCHAR(128) NOT NULL,
        party_phone VARCHAR(32),
        amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        payment_type VARCHAR(32) NOT NULL DEFAULT 'Cash',
        payment_ref_no VARCHAR(64),
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS quotations (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        quotation_number VARCHAR(64) NOT NULL,
        date VARCHAR(32) NOT NULL,
        valid_until VARCHAR(32),
        party_id VARCHAR(64),
        party_name VARCHAR(128) NOT NULL,
        party_phone VARCHAR(32),
        party_gstin VARCHAR(32),
        party_state VARCHAR(64),
        party_state_code VARCHAR(8),
        place_of_supply VARCHAR(64),
        items JSONB,
        sub_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        cgst_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        sgst_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        igst_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        round_off NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        grand_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        notes TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        converted_invoice_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_edit_logs (
        log_id VARCHAR(64) PRIMARY KEY,
        table_name VARCHAR(64) NOT NULL,
        record_id VARCHAR(64) NOT NULL,
        action_type VARCHAR(16) NOT NULL,
        user_id_context VARCHAR(64) NOT NULL DEFAULT 'SYSTEM_SESSION',
        timestamp_marker TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delta_diff_payload JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_audit_edit_logs_timestamp ON audit_edit_logs(timestamp_marker DESC);

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

      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_classification VARCHAR(32);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS party_pincode VARCHAR(16);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_purchase_cost NUMERIC(15, 2) DEFAULT 0;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS counter_sales JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS counter_purchases JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS sales_cash NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS sales_online NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS purchases_cash NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS purchases_online NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS payment_split_mode VARCHAR(16) NOT NULL DEFAULT 'percentage';
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS cash_percentage NUMERIC(5,2) NOT NULL DEFAULT 50;

      CREATE TABLE IF NOT EXISTS company_profiles (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        trade_name VARCHAR(128),
        name VARCHAR(128),
        gstin VARCHAR(32),
        pan VARCHAR(32),
        phone VARCHAR(32),
        phone2 VARCHAR(32),
        email VARCHAR(128),
        address TEXT,
        city VARCHAR(64),
        state VARCHAR(64),
        state_code VARCHAR(8),
        pincode VARCHAR(16),
        bank_name VARCHAR(128),
        account_number VARCHAR(64),
        ifsc_code VARCHAR(32),
        upi_id VARCHAR(128),
        logo_base64 TEXT,
        signature_title VARCHAR(128),
        signature_base64 TEXT,
        business_type VARCHAR(64),
        business_category VARCHAR(128),
        business_description TEXT,
        card_theme VARCHAR(64),
        show_gstin_on_card BOOLEAN DEFAULT TRUE,
        show_type_on_card BOOLEAN DEFAULT FALSE,
        show_category_on_card BOOLEAN DEFAULT FALSE,
        books_beginning_date VARCHAR(32),
        opening_capital NUMERIC(15, 2) DEFAULT 0.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS signature_base64 TEXT;
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS business_description TEXT;
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS card_theme VARCHAR(64);
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS show_gstin_on_card BOOLEAN DEFAULT TRUE;
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS show_type_on_card BOOLEAN DEFAULT FALSE;
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS show_category_on_card BOOLEAN DEFAULT FALSE;
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS books_beginning_date VARCHAR(32);
      ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS opening_capital NUMERIC(15, 2) DEFAULT 0.00;

      CREATE TABLE IF NOT EXISTS credit_debit_notes (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        note_number VARCHAR(64) NOT NULL,
        type VARCHAR(16) NOT NULL,
        date VARCHAR(32) NOT NULL,
        original_invoice_no VARCHAR(64),
        original_invoice_date VARCHAR(32),
        party_id VARCHAR(64),
        party_name VARCHAR(128),
        party_gstin VARCHAR(32),
        reason TEXT,
        sub_total NUMERIC(15,2) NOT NULL DEFAULT 0,
        cgst_total NUMERIC(15,2) NOT NULL DEFAULT 0,
        sgst_total NUMERIC(15,2) NOT NULL DEFAULT 0,
        igst_total NUMERIC(15,2) NOT NULL DEFAULT 0,
        grand_total NUMERIC(15,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE credit_debit_notes ADD COLUMN IF NOT EXISTS user_mobile VARCHAR(32);
      CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_user ON credit_debit_notes(user_mobile, created_at DESC);

      CREATE TABLE IF NOT EXISTS ineligible_tax_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32),
        supplier_name VARCHAR(128),
        invoice_number VARCHAR(64),
        amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        legal_section VARCHAR(64) DEFAULT 'Section 17(5)',
        reason_category VARCHAR(128) DEFAULT 'Blocked ITC',
        blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(64) PRIMARY KEY,
        entry_no VARCHAR(64) UNIQUE NOT NULL,
        date VARCHAR(16) NOT NULL,
        voucher_type VARCHAR(32) NOT NULL,
        voucher_ref_no VARCHAR(64),
        narration TEXT,
        lines JSONB NOT NULL DEFAULT '[]'::jsonb,
        user_mobile VARCHAR(32),
        reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'UNRECONCILED',
        reconciled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'UNRECONCILED';
      ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_journal_entries_user_mobile ON journal_entries(user_mobile);

      CREATE TABLE IF NOT EXISTS tax_ledger_opening_balances (
        user_mobile VARCHAR(32) PRIMARY KEY,
        electronic_cash_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (electronic_cash_balance >= 0),
        electronic_credit_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (electronic_credit_balance >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bank_statement_records (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32) NOT NULL,
        statement_date VARCHAR(16) NOT NULL,
        value_date VARCHAR(16),
        description TEXT NOT NULL,
        ref_cheque_no VARCHAR(64),
        debit_withdrawal NUMERIC(15, 2) DEFAULT 0.00,
        credit_deposit NUMERIC(15, 2) DEFAULT 0.00,
        balance NUMERIC(15, 2),
        reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'UNRECONCILED',
        record_source VARCHAR(24) NOT NULL DEFAULT 'BANK_STATEMENT',
        clearing_date VARCHAR(16),
        matched_journal_entry_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE bank_statement_records ADD COLUMN IF NOT EXISTS record_source VARCHAR(24) NOT NULL DEFAULT 'BANK_STATEMENT';
      ALTER TABLE bank_statement_records ADD COLUMN IF NOT EXISTS clearing_date VARCHAR(16);
      ALTER TABLE bank_statement_records ADD COLUMN IF NOT EXISTS matched_journal_entry_id VARCHAR(64);
      ALTER TABLE bank_statement_records ALTER COLUMN debit_withdrawal DROP NOT NULL;
      ALTER TABLE bank_statement_records ALTER COLUMN credit_deposit DROP NOT NULL;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(32) NOT NULL DEFAULT 'CASH';
      ALTER TABLE permanent_purchase_ledger ADD COLUMN IF NOT EXISTS gstr2b_verified BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE permanent_purchase_ledger ALTER COLUMN verification_source SET DEFAULT 'UNVERIFIED';
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_reverse_charge BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rcm_applicable BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rcm_calculated_tax NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rcm_tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_inter_state BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gstr2b_verified BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_tax_ledger_opening_balances_user ON tax_ledger_opening_balances(user_mobile);
      CREATE INDEX IF NOT EXISTS idx_bank_statement_records_user ON bank_statement_records(user_mobile);
    `);
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE client_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id VARCHAR(64) PRIMARY KEY, user_mobile VARCHAR(32) NOT NULL, token_hash CHAR(64) UNIQUE NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS cashier_devices (
        device_id VARCHAR(64) PRIMARY KEY, owner_mobile_id VARCHAR(32) NOT NULL, cashier_name VARCHAR(128) NOT NULL, profile_picture TEXT,
        token_hash CHAR(64) UNIQUE NOT NULL, approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ,
        revoked BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS cashier_link_tokens (
        owner_mobile_id VARCHAR(32) PRIMARY KEY, token_hash CHAR(64) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS cashier_sessions (
        id VARCHAR(64) PRIMARY KEY, device_id VARCHAR(64), owner_mobile VARCHAR(32) NOT NULL,
        cashier_name VARCHAR(128) NOT NULL, token_hash CHAR(64) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS cashier_asset_requests (
        request_id VARCHAR(64) PRIMARY KEY, owner_mobile VARCHAR(32) NOT NULL, device_token_hash CHAR(64) NOT NULL,
        cashier_name VARCHAR(128) NOT NULL, record_type VARCHAR(16) NOT NULL CHECK (record_type IN ('SALES','PURCHASES','EXPENSES')),
        action_type VARCHAR(16) NOT NULL CHECK (action_type IN ('DELETE','EDIT')), record_id VARCHAR(128) NOT NULL,
        details TEXT, status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), handled_at TIMESTAMPTZ, handled_by VARCHAR(32)
      );
      CREATE INDEX IF NOT EXISTS idx_cashier_asset_requests_owner_status ON cashier_asset_requests(owner_mobile,status,created_at DESC);
      CREATE TABLE IF NOT EXISTS password_reset_requests (
        request_id VARCHAR(64) PRIMARY KEY, user_mobile VARCHAR(32) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
        handled_at TIMESTAMPTZ, handled_by VARCHAR(64)
      );
      ALTER TABLE cashier_handshake_auth ADD COLUMN IF NOT EXISTS status_token_hash CHAR(64);
      ALTER TABLE cashier_handshake_auth ADD COLUMN IF NOT EXISTS profile_picture TEXT;
      ALTER TABLE cashier_devices ADD COLUMN IF NOT EXISTS profile_picture TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS created_by_cashier VARCHAR(128);
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS counter_sales JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS counter_purchases JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS sales_cash NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS sales_online NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS purchases_cash NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS purchases_online NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS payment_split_mode VARCHAR(16) NOT NULL DEFAULT 'percentage';
      ALTER TABLE daily_cash_summaries ADD COLUMN IF NOT EXISTS cash_percentage NUMERIC(5,2) NOT NULL DEFAULT 50;

      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        compare_price NUMERIC(15, 2) DEFAULT 0.00,
        media JSONB DEFAULT '[]'::jsonb,
        variants JSONB DEFAULT '[]'::jsonb,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);

      CREATE TABLE IF NOT EXISTS inventory_items (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32) NOT NULL,
        item_name VARCHAR(256) NOT NULL,
        normalized_name VARCHAR(256) NOT NULL,
        hsn VARCHAR(32),
        unit VARCHAR(32) NOT NULL DEFAULT 'PCS',
        quantity_on_hand NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
        average_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_mobile, normalized_name)
      );
      -- Legacy databases may already have inventory_items without the newer index columns.
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS user_mobile VARCHAR(32);
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(256);
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(256);
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS hsn VARCHAR(32);
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit VARCHAR(32) NOT NULL DEFAULT 'PCS';
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS quantity_on_hand NUMERIC(15,3) NOT NULL DEFAULT 0;
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS average_cost NUMERIC(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      UPDATE inventory_items
        SET item_name = COALESCE(NULLIF(BTRIM(item_name), ''), id),
            normalized_name = COALESCE(NULLIF(BTRIM(normalized_name), ''), LOWER(BTRIM(COALESCE(NULLIF(item_name, ''), id))))
        WHERE item_name IS NULL OR BTRIM(item_name) = '' OR normalized_name IS NULL OR BTRIM(normalized_name) = '';
      CREATE INDEX IF NOT EXISTS idx_inventory_items_user_name ON inventory_items(user_mobile, normalized_name);
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id VARCHAR(64) PRIMARY KEY,
        user_mobile VARCHAR(32) NOT NULL,
        inventory_item_id VARCHAR(64) NOT NULL,
        source_type VARCHAR(24) NOT NULL,
        source_id VARCHAR(64) NOT NULL,
        quantity_delta NUMERIC(15,3) NOT NULL,
        unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_user_source ON inventory_movements(user_mobile, source_type, source_id);

      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(64) PRIMARY KEY,
        customer_name VARCHAR(128) NOT NULL,
        customer_mobile VARCHAR(32) NOT NULL,
        customer_email VARCHAR(128),
        address JSONB NOT NULL DEFAULT '{}'::jsonb,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        payment_method VARCHAR(32) NOT NULL DEFAULT 'COD',
        payment_sub_option VARCHAR(64),
        subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        cod_fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        grand_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) NOT NULL DEFAULT 'PENDING';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(128);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_by VARCHAR(32);
      UPDATE orders SET payment_status='COD_DUE' WHERE payment_method='COD' AND payment_status='PENDING';

      CREATE TABLE IF NOT EXISTS admin_payment_settings (
        id VARCHAR(32) PRIMARY KEY DEFAULT 'GLOBAL',
        qr_code_url TEXT,
        phone_number VARCHAR(32),
        upi_id VARCHAR(128),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customer_wallets (
        customer_mobile VARCHAR(32) PRIMARY KEY,
        payment_in NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        payment_out NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        due_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        monthly_fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        fee_last_applied TIMESTAMPTZ,
        transactions JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin_device_registry (
        fingerprint_hash CHAR(64) NOT NULL,
        mobile VARCHAR(32) NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (fingerprint_hash, mobile)
      );
      CREATE INDEX IF NOT EXISTS idx_admin_device_registry_mobile ON admin_device_registry(mobile);
      CREATE TABLE IF NOT EXISTS admin_access_blocks (
        id VARCHAR(64) PRIMARY KEY,
        mobile VARCHAR(32) NOT NULL,
        fingerprint_hash CHAR(64),
        device_label VARCHAR(128),
        reason TEXT NOT NULL DEFAULT 'Account deleted by administrator',
        blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        unlocked_at TIMESTAMPTZ,
        is_locked BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE INDEX IF NOT EXISTS idx_admin_access_blocks_locked ON admin_access_blocks(is_locked, blocked_at DESC);
    `);
    // Post-bootstrap compatibility repair: old deployments may have columns added under
    // an earlier typo or may have missed columns because the table did not exist at the
    // beginning of initialization. Keep this after CREATE TABLE statements and before the
    // server starts accepting requests.
    const tenantTables = [
      'temporary_purchase_stage', 'staged_purchases', 'gstr2b_portal_cache',
      'permanent_purchase_ledger', 'expenses', 'payments', 'quotations',
      'credit_debit_notes', 'journal_entries', 'tax_ledger_opening_balances',
      'bank_statement_records', 'invoices', 'purchases', 'parties', 'app_settings',
      'daily_cash_summaries', 'company_profiles', 'ineligible_tax_logs',
      'inventory_items', 'inventory_movements', 'payment_vouchers_ledger'
    ];
    for (const tableName of tenantTables) {
      const tableExists = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1 LIMIT 1`,
        [tableName]
      );
      if (!tableExists.rows.length) continue;
      await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS user_mobile VARCHAR(32)`);
      const legacyColumn = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'user_mobilo' LIMIT 1`,
        [tableName]
      );
      if (legacyColumn.rows.length) {
        await pool.query(`UPDATE ${tableName} SET user_mobile = user_mobilo WHERE (user_mobile IS NULL OR BTRIM(user_mobile) = '') AND user_mobilo IS NOT NULL`);
      }
    }
    // Repair legacy inventory shape before routes or indexes query normalized_name.
    const inventoryExists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'inventory_items' LIMIT 1`
    );
    if (inventoryExists.rows.length) {
      await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(256)`);
      await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(256)`);
      await pool.query(`UPDATE inventory_items SET item_name=COALESCE(NULLIF(BTRIM(item_name),''),id), normalized_name=COALESCE(NULLIF(BTRIM(normalized_name),''),LOWER(BTRIM(COALESCE(NULLIF(item_name,''),id))) ) WHERE item_name IS NULL OR BTRIM(item_name)='' OR normalized_name IS NULL OR BTRIM(normalized_name)=''`);
      await pool.query(`ALTER TABLE inventory_items ALTER COLUMN item_name SET NOT NULL`);
      await pool.query(`ALTER TABLE inventory_items ALTER COLUMN normalized_name SET NOT NULL`);
    }

    // Inspect legacy auth schemas before reading optional columns. Older versions
    // removed plaintext `password`, so selecting it unconditionally caused warnings
    // and skipped the rest of the migration on every production request/startup.
    // Preserve all existing user records and never recreate plaintext password fields.
    for (const table of ['users', 'client_users']) {
      try {
        const tableCheck = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1 LIMIT 1`, [table]
        );
        if (!tableCheck.rows.length) continue;
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS password_hash TEXT`);
        const columns = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1`, [table]
        );
        const columnNames = new Set(columns.rows.map((r: any) => String(r.column_name)));
        if (columnNames.has('password')) {
          const legacy = await pool.query(`SELECT id, password FROM ${table} WHERE password_hash IS NULL AND password IS NOT NULL`);
          for (const row of legacy.rows) {
            await pool.query(`UPDATE ${table} SET password_hash=$1 WHERE id=$2`, [await bcryptHash(String(row.password)), row.id]);
          }
          await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS password`);
        }
        if (columnNames.has('admin_visible_pass')) await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS admin_visible_pass`);
        // Do not enforce NOT NULL here: older accounts may need password reset if an
        // earlier release already removed their plaintext password without a hash.
      } catch (e: any) {
        console.error(`[security] ${table} password-hash migration failed:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('Table bootstrap failed:', e.message);
    if (process.env.NODE_ENV === 'production') throw e;
  }
}

// Explicit Cloudinary programmable media credentials from environment variables
const CLOUDINARY_CONFIG = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
};

// Reusable Cloudinary upload function
async function uploadImageToCloudinary(base64Data: string, folder = 'gst_purchase_bills'): Promise<string> {
  if (!CLOUDINARY_CONFIG.cloud_name || !CLOUDINARY_CONFIG.api_key || !CLOUDINARY_CONFIG.api_secret) {
    return '';
  }
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const crypto = await import('crypto');
    const toSign = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_CONFIG.api_secret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    const cleanData = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    const formData = new URLSearchParams();
    formData.append('file', cleanData);
    formData.append('api_key', CLOUDINARY_CONFIG.api_key);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('signature', signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      return data.secure_url || data.url || '';
    } else {
      const errText = await response.text();
      console.warn('Cloudinary upload status:', response.status, errText);
    }
  } catch (err: any) {
    console.warn('Cloudinary upload network error:', err.message);
  }
  return '';
}

// Immutable audit edit log writer (Pillar 3 requirement)
async function recordAuditEditLog(
  tableName: string,
  recordId: string,
  actionType: 'INSERT' | 'EDIT' | 'UPDATE' | 'DELETE',
  userContext: string,
  deltaPayload: any
) {
  try {
    const logId = 'AEL-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    await pool.query(
      `INSERT INTO audit_edit_logs (log_id, table_name, record_id, action_type, user_id_context, timestamp_marker, delta_diff_payload)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [logId, tableName, recordId, actionType, userContext || 'SYSTEM', JSON.stringify(deltaPayload)]
    );
  } catch (logErr: any) {
    console.warn('Audit edit log write skipped:', logErr.message);
  }
}

let appInstance: express.Express | null = null;

export async function getApp(): Promise<express.Express> {
  if (appInstance) return appInstance;
  await initRelationalTables();
  const app = express();
  // Trust the single hosting proxy (Vercel/Render) so secure-origin checks use the public HTTPS scheme.
  app.set('trust proxy', 1);

  // Apply every elapsed 30-day subscription cycle in a transaction. The row lock prevents duplicate charges.
  const applyRecurringFees = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wallets = await client.query(`SELECT customer_mobile FROM customer_wallets WHERE monthly_fee > 0`);
      for (const item of wallets.rows) {
        const locked = await client.query(`SELECT customer_mobile,payment_in,payment_out,due_balance,monthly_fee,fee_last_applied,transactions FROM customer_wallets WHERE customer_mobile=$1 FOR UPDATE`, [item.customer_mobile]);
        const wallet = locked.rows[0];
        if (!wallet) continue;
        const fee = Number.parseFloat(String(wallet.monthly_fee || '0')) || 0;
        if (fee <= 0) continue;
        const lastApplied = wallet.fee_last_applied ? new Date(wallet.fee_last_applied).getTime() : Date.now();
        const cycles = Math.floor((Date.now() - lastApplied) / (30 * 24 * 60 * 60 * 1000));
        if (cycles < 1) continue;
        const transactions = Array.isArray(wallet.transactions) ? [...wallet.transactions] : (typeof wallet.transactions === 'string' ? JSON.parse(wallet.transactions || '[]') : []);
        for (let cycle = 1; cycle <= cycles; cycle++) {
          const appliedAt = new Date(lastApplied + cycle * 30 * 24 * 60 * 60 * 1000);
          transactions.unshift({ type: 'MONTHLY_FEE', amount: fee, date: appliedAt.toISOString(), notes: `Monthly recurring subscription fee (${appliedAt.toISOString().slice(0, 7)})` });
        }
        const due = (Number.parseFloat(String(wallet.due_balance || '0')) || 0) + fee * cycles;
        const feeLastApplied = new Date(lastApplied + cycles * 30 * 24 * 60 * 60 * 1000).toISOString();
        await client.query(`UPDATE customer_wallets SET due_balance=$1,fee_last_applied=$2,transactions=$3,updated_at=NOW() WHERE customer_mobile=$4`, [due, feeLastApplied, JSON.stringify(transactions), wallet.customer_mobile]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn('[admin] Recurring fee processing failed:', (error as any)?.message || error);
    } finally { client.release(); }
  };
  
    // Credentialed CORS must never reflect arbitrary attacker-controlled origins.
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || '').trim();
    const configuredOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',').map((v) => v.trim()).filter(Boolean);
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    const allowedOrigins = new Set([
      ...configuredOrigins,
      requestOrigin,
      ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'] : []),
    ]);
    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'This origin is not allowed to access the Cotrix API.' });
    }
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Device-Fingerprint, X-Admin-Token, X-Cashier-Device');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1]) : null;
  const PORT = portFromArg || (process.env.PORT ? parseInt(process.env.PORT) : 3000);

  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Helper date formatter DD/MM/YYYY
  const getFormattedDate = (d = new Date()) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const applyPermanentExpenses = async (userMobile?: string) => {
    try {
      const current = new Date();
      const todayIso = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      await pool.query(`UPDATE permanent_expenses SET active=FALSE WHERE active=TRUE AND end_date < CURRENT_DATE`);
      const templates = await pool.query(
        `SELECT id,user_mobile,title,description,notes,category,amount,payment_mode,start_date,end_date
         FROM permanent_expenses WHERE active=TRUE AND (end_date IS NULL OR end_date >= CURRENT_DATE)
           AND ($1::text IS NULL OR user_mobile=$1)`,
        [userMobile || null]
      );

      for (const template of templates.rows) {
        let occurrenceIso = template.start_date instanceof Date
          ? template.start_date.toISOString().slice(0, 10)
          : String(template.start_date).slice(0, 10);
        const endIso = template.end_date instanceof Date
          ? template.end_date.toISOString().slice(0, 10)
          : template.end_date ? String(template.end_date).slice(0, 10) : null;
        while (occurrenceIso <= todayIso && (!endIso || occurrenceIso <= endIso)) {
          const expenseDate = getFormattedDate(new Date(`${occurrenceIso}T12:00:00`));
          const amount = Number(template.amount);
          const mode = String(template.payment_mode || 'CASH').toUpperCase();
          const bankExpense = ['BANK', 'BANK/CHECK', 'CHEQUE', 'CHECK', 'UPI', 'ONLINE'].includes(mode) || mode.includes('BANK') || mode.includes('UPI');
          const expenseId = `EXP-${crypto.randomUUID()}`;
          const expenseNo = `PERM-${String(template.id).slice(-8)}-${occurrenceIso.replace(/-/g, '')}`;
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const inserted = await client.query(
              `INSERT INTO expenses (id,user_mobile,expense_no,date,category,title,amount,payment_mode,paid_to,notes,recurring_expense_id,recurrence_date,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'',$11,$9,$10,NOW())
               ON CONFLICT (recurring_expense_id,recurrence_date) WHERE recurring_expense_id IS NOT NULL DO NOTHING
               RETURNING id`,
              [expenseId, template.user_mobile, expenseNo, expenseDate, template.category, template.title, amount, mode, template.id, occurrenceIso, [template.description, template.notes].filter(Boolean).join(' - ') || 'Recurring expense']
            );
            if (inserted.rowCount) {
              const lines = [
                { account: `Expense: ${template.category}`, debit: amount, credit: 0 },
                { account: bankExpense ? 'Bank Account' : 'Cash Account', debit: 0, credit: amount },
              ];
              await client.query(
                `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
                 VALUES ($1,$2,$3,'PAYMENT',$4,$5,$6,$7,NOW())`,
                [`JE-${expenseId}`, `JV-EXP-${expenseId}`, expenseDate, expenseNo, `Permanent expense: ${template.title}`, JSON.stringify(lines), template.user_mobile]
              );
              if (bankExpense) {
                await client.query(
                  `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
                   VALUES ($1,$2,$3,$3,$4,'',$5,0,'UNRECONCILED','APP_ENTRY',NOW())`,
                  [`BRS-EXP-${expenseId}`, template.user_mobile, expenseDate, `Permanent expense ${expenseNo} - ${template.title}`, amount]
                );
              }
            }
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.warn('[expenses] Permanent expense posting failed:', (error as any)?.message || error);
          } finally {
            client.release();
          }
          const nextDate = new Date(`${occurrenceIso}T00:00:00Z`);
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          occurrenceIso = nextDate.toISOString().slice(0, 10);
        }
      }
    } catch (error) {
      console.warn('[expenses] Permanent expense processing skipped:', (error as any)?.message || error);
    }
  };

  // 1. Database Health Check
  app.get('/api/db/status', async (_req: Request, res: Response) => {
    const status = await testConnection();
    if (status.success) {
      try {
        const tableQuery = await pool.query(
          "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
        );
        res.json({
          connected: true,
          provider: 'PostgreSQL (DATABASE_URL)',
          region: 'configured database region',
          timestamp: status.timestamp,
          version: status.version,
          tablesCount: parseInt(tableQuery.rows[0].count),
          latencyMs: undefined,
        });
      } catch (err: any) {
        res.status(503).json({
          connected: false,
          provider: 'Neon PostgreSQL',
          timestamp: status.timestamp,
          error: err.message,
        });
      }
    } else {
      res.status(500).json({
        connected: false,
        error: status.error,
      });
    }
  });

  // ---------------- Secure owner authentication ----------------
  const parseCookie = (req: Request, name: string) => {
    const raw = String(req.headers.cookie || '');
    const found = raw.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.slice(name.length+1)) : '';
  };
  const sessions = new Map<string,{mobile:string;role:string;expires:number}>();
  const deviceCache = new Map<string,{ownerMobile:string;cashierName:string;revoked:boolean}>();
  const loginAttempts = new Map<string,{failures:number;blockedUntil:number}>();
  const resetAttempts = new Map<string,{count:number;windowStart:number}>();
  const adminAttempts = new Map<string,{failures:number;blockedUntil:number}>();
  const rateLimited = (map:Map<string,{count?:number;failures?:number;windowStart?:number;blockedUntil?:number}>, key:string, max:number, windowMs:number) => { const now=Date.now(); const a=map.get(key); if(a?.blockedUntil && a.blockedUntil>now) return true; if(!a || !a.windowStart || now-a.windowStart>=windowMs){ map.set(key,{count:1,windowStart:now}); return false; } a.count=(a.count||0)+1; if((a.count||0)>max){ a.blockedUntil=now+windowMs; map.set(key,a); return true; } map.set(key,a); return false; };
  const DEVICE_SECRET = crypto.createHash('sha256').update(String(process.env.SESSION_SECRET || 'cotrix-development-only-device-secret')).digest();
  const deriveDeviceToken=(statusToken:string,requestId:string,ownerMobile:string)=>crypto.createHmac('sha256',DEVICE_SECRET).update(`${statusToken}|${requestId}|${ownerMobile}`).digest('base64url');
  const issueSession=async(mobile:string,role='CUSTOMER')=>{const token=newToken();const expires=new Date(Date.now()+7*24*60*60*1000);await pool.query(`INSERT INTO auth_sessions(id,user_mobile,token_hash,role,expires_at) VALUES($1,$2,$3,$4,$5)`,[`SES-${crypto.randomUUID()}`,mobile,hashToken(token),role,expires]);sessions.set(token,{mobile,role,expires:expires.getTime()});return token;};
  // Resolve tenant identity only from a server-issued, non-revoked session or an approved cashier device.
  // Client-supplied mobile numbers (headers, query strings, and request bodies) are never authentication.
  const requireOwner = async (req: Request, _res: Response): Promise<string | null> => {
    // A cashier device credential can never be upgraded by a coexisting administrator cookie.
    if (String(req.headers['x-cashier-device'] || '')) return null;
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const token = parseCookie(req, 'cotrix_session') || bearer;
    if (!token) return null;
    const result = await pool.query(
      `SELECT user_mobile,role,expires_at,revoked FROM auth_sessions WHERE token_hash=$1 LIMIT 1`,
      [hashToken(token)]
    );
    const row = result.rows[0];
    if (!row || row.revoked || row.role !== 'CUSTOMER' || new Date(row.expires_at).getTime() <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    const session = { mobile: row.user_mobile, role: row.role, expires: new Date(row.expires_at).getTime() };
    sessions.set(token, session);
    return cleanMobileNumber(session.mobile);
  };

  const getUserMobile = (req: Request) => {
    // Never allow a same-browser admin cookie to override a verified cashier device identity.
    const cashierToken = String(req.headers['x-cashier-device'] || '');
    if (cashierToken) {
      const cashierInfo = deviceCache.get(cashierToken);
      if (cashierInfo && !cashierInfo.revoked) return cleanMobileNumber(cashierInfo.ownerMobile);
    }
    const t = parseCookie(req, 'cotrix_session');
    const s = t ? sessions.get(t) : undefined;
    if (s && s.role === 'CUSTOMER' && s.expires > Date.now()) return cleanMobileNumber(s.mobile);
    // The API middleware validates bearer sessions and sets userMobile only after verification.
    const authenticatedMobile = cleanMobileNumber((req as any).userMobile || '');
    if (authenticatedMobile.length === 10) return authenticatedMobile;
    const d = String(req.headers['x-cashier-device'] || '');
    if (d) {
      const info = deviceCache.get(d);
      if (info && !info.revoked) return cleanMobileNumber(info.ownerMobile);
    }
    return '';
  };
  const getCashierName=(req:Request)=>{const t=(req.headers['x-cashier-device'] as string) || '';return t?deviceCache.get(t)?.cashierName||null:null;};
  const requireCashierDevice=async(req:Request,res:Response)=>{
    const t = (req.headers['x-cashier-device'] as string) || '';
    if(!t){res.status(403).json({error:'Cashier device is not approved.'});return null;}
    const r=await pool.query(`SELECT owner_mobile_id,cashier_name,revoked FROM cashier_devices WHERE token_hash=$1 LIMIT 1`,[hashToken(t)]);
    const row=r.rows[0];
    if(!row||row.revoked){res.status(403).json({error:'Cashier device access has been revoked.'});return null;}
    const info={ownerMobile:row.owner_mobile_id,cashierName:row.cashier_name,revoked:false};
    deviceCache.set(t,info);
    await pool.query(`UPDATE cashier_devices SET last_used_at=NOW() WHERE token_hash=$1`,[hashToken(t)]);
    return info;
  };

  app.post('/api/auth/register', async(req,res)=>{try{const {name,mobile,password}=req.body||{};const m=cleanMobileNumber(mobile),p=String(password||'').trim(),fingerprintHash=readDeviceFingerprint(req);if(!name||m.length!==10)return res.status(400).json({error:'Name and valid 10-digit mobile are required.'});if(p.length<8||!/[A-Za-z]/.test(p)||!/\d/.test(p))return res.status(400).json({error:'Password must be at least 8 characters and contain letters and numbers.'});if(!(await assertAccessNotBlocked(m,fingerprintHash)))return res.status(403).json({error:'Registration is blocked for this mobile number or device. Contact the administrator.'});if((await pool.query('SELECT id FROM users WHERE mobile=$1 LIMIT 1',[m])).rows.length)return res.status(409).json({error:'This mobile number is already registered. Please login.'});const h=await bcryptHash(p),id=`USR-${m}`;await pool.query(`INSERT INTO users(id,name,mobile,password_hash,role,created_at) VALUES($1,$2,$3,$4,'CUSTOMER',NOW())`,[id,String(name).trim(),m,h]);await pool.query(`INSERT INTO client_users(id,name,mobile,password_hash,role,created_at) VALUES($1,$2,$3,$4,'CUSTOMER',NOW()) ON CONFLICT(mobile) DO UPDATE SET password_hash=EXCLUDED.password_hash,name=EXCLUDED.name`,[id,String(name).trim(),m,h]).catch(()=>{});await recordDeviceFingerprint(m,fingerprintHash);res.status(201).json({success:true,user:{name:String(name).trim(),mobile:m,role:'CUSTOMER'}});}catch(e:any){res.status(500).json({error:e.message});}});

  const ADMIN_MOBILE = String(process.env.ADMIN_MOBILE || '').replace(/\D/g, '');
  const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');

  app.post('/api/auth/login', async (req, res) => {
    try {
      const m = cleanMobileNumber(req.body?.mobile), p = String(req.body?.password || '');
      if (m.length !== 10 || !p) return res.status(400).json({ error: 'Mobile and Password are required.' });

      // Automatic Admin Recognition if admin credentials are used
      if (ADMIN_MOBILE && ADMIN_PASSWORD && safeEqual(m, ADMIN_MOBILE) && safeEqual(p, ADMIN_PASSWORD)) {
        loginAttempts.delete(m);
        const token = await issueSession(ADMIN_MOBILE, 'ADMIN');
        res.setHeader('Set-Cookie', [
          `cotrix_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
          `cotrix_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
        ]);
        return res.json({ success: true, user: { name: 'Admin', mobile: ADMIN_MOBILE, role: 'ADMIN' }, admin: { name: 'Admin', userId: ADMIN_MOBILE, role: 'ADMIN' } });
      }

      const fingerprintHash = readDeviceFingerprint(req);
      if (!(await assertAccessNotBlocked(m, fingerprintHash))) {
        return res.status(403).json({ error: 'Access is blocked for this mobile number or device. Contact the administrator.' });
      }

      const a = loginAttempts.get(m);
      if (a && a.blockedUntil > Date.now()) return res.status(429).json({ error: 'Too many failed attempts. Please try again in a few minutes.' });
      const r = await pool.query('SELECT name,mobile,password_hash,role FROM users WHERE mobile=$1 LIMIT 1', [m]);
      const ok = r.rows[0] && await bcryptVerify(p, String(r.rows[0].password_hash || ''));
      if (!ok) {
        const failures = (a?.failures || 0) + 1;
        if (failures >= 5) loginAttempts.set(m, { failures: 0, blockedUntil: Date.now() + 5 * 60 * 1000 });
        else loginAttempts.set(m, { failures, blockedUntil: 0 });
        return res.status(401).json({ error: 'Invalid Mobile Number or Password' });
      }
      loginAttempts.delete(m);
      await recordDeviceFingerprint(m, fingerprintHash);
      const token = await issueSession(m, r.rows[0].role);
      res.setHeader('Set-Cookie', `cotrix_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      res.json({ success: true, user: { name: r.rows[0].name, mobile: r.rows[0].mobile, role: r.rows[0].role } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth/password-reset-request',async(req,res)=>{try{const m=cleanMobileNumber(req.body?.mobile);if(m.length!==10)return res.status(400).json({error:'Enter your registered 10-digit mobile number.'});if(rateLimited(resetAttempts,m,3,15*60*1000))return res.status(429).json({error:'Too many reset requests. Please wait and try again.'});const exists=(await pool.query('SELECT id FROM users WHERE mobile=$1 LIMIT 1',[m])).rows.length>0;if(exists){const active=await pool.query(`SELECT request_id FROM password_reset_requests WHERE user_mobile=$1 AND status='PENDING' AND expires_at>NOW() LIMIT 1`,[m]);if(!active.rows.length)await pool.query(`INSERT INTO password_reset_requests(request_id,user_mobile,status,expires_at) VALUES($1,$2,'PENDING',NOW()+INTERVAL '30 minutes')`,[`PR-${crypto.randomUUID()}`,m]);}res.json({success:true,message:'If this mobile number is registered, a password reset request has been sent to the administrator.'});}catch(e:any){res.status(500).json({error:'Unable to process the reset request.'});}});
  app.get('/api/auth/me', async (req, res) => {
    try {
      const t=parseCookie(req,'cotrix_session');
      if(!t) return res.status(401).json({error:'Not authenticated'});
      const sessionResult=await pool.query(`SELECT user_mobile,role,expires_at,revoked FROM auth_sessions WHERE token_hash=$1 LIMIT 1`,[hashToken(t)]);
      const sessionRow=sessionResult.rows[0];
      const session=sessionRow&&!sessionRow.revoked&&new Date(sessionRow.expires_at).getTime()>Date.now()
        ? {mobile:sessionRow.user_mobile,role:sessionRow.role,expires:new Date(sessionRow.expires_at).getTime()}
        : null;
      if(!session||session.role!=='CUSTOMER'||session.expires<=Date.now()){sessions.delete(t);return res.status(401).json({error:'Session expired'});}
      sessions.set(t,session);
      const r=await pool.query('SELECT name,mobile,role FROM users WHERE mobile=$1 LIMIT 1',[session.mobile]);
      if(!r.rows.length) return res.status(401).json({error:'Account not found'});
      res.json({user:r.rows[0]});
    } catch(e:any){res.status(500).json({error:e.message});}
  });

  app.post('/api/auth/logout',async(req,res)=>{const tokens=[parseCookie(req,'cotrix_session'),parseCookie(req,'cotrix_admin_session')].filter(Boolean);for(const t of tokens){sessions.delete(t);await pool.query('UPDATE auth_sessions SET revoked=true WHERE token_hash=$1',[hashToken(t)]).catch(()=>{});}const secure=process.env.NODE_ENV==='production'?'; Secure':'';res.setHeader('Set-Cookie',[`cotrix_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,`cotrix_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`]);res.json({success:true});});
  const requireAdmin=async(req: Request,res: Response)=>{const t=parseCookie(req,'cotrix_admin_session') || (process.env.NODE_ENV !== 'production' ? String(req.headers['x-admin-token'] || '') : '');if(!t){res.status(401).json({error:'Admin login required.'});return false;}const r=await pool.query('SELECT user_mobile,role,expires_at,revoked FROM auth_sessions WHERE token_hash=$1 LIMIT 1',[hashToken(t)]);const row=r.rows[0];if(row&&!row.revoked&&row.role==='ADMIN'&&new Date(row.expires_at).getTime()>Date.now()){sessions.set(t,{mobile:row.user_mobile,role:'ADMIN',expires:new Date(row.expires_at).getTime()});return true;}sessions.delete(t);res.status(401).json({error:'Admin login required.'});return false;};
  const readDeviceFingerprint = (req: Request) => {
    const raw = String(req.headers['x-device-fingerprint'] || '').trim().slice(0, 160);
    return /^[A-Za-z0-9._:-]{8,160}$/.test(raw) ? hashToken(raw) : '';
  };
  const assertAccessNotBlocked = async (mobile: string, fingerprintHash: string) => {
    const accountBlock = await pool.query(`SELECT id FROM admin_access_blocks WHERE mobile=$1 AND fingerprint_hash IS NULL AND is_locked=TRUE LIMIT 1`, [mobile]);
    if (accountBlock.rows.length) return false;
    if (fingerprintHash) {
      const deviceBlock = await pool.query(`SELECT id FROM admin_access_blocks WHERE fingerprint_hash=$1 AND is_locked=TRUE LIMIT 1`, [fingerprintHash]);
      if (deviceBlock.rows.length) return false;
    }
    return true;
  };
  const recordDeviceFingerprint = async (mobile: string, fingerprintHash: string) => {
    if (!fingerprintHash || !/^\d{10}$/.test(mobile)) return;
    await pool.query(`INSERT INTO admin_device_registry(fingerprint_hash,mobile,first_seen_at,last_seen_at) VALUES($1,$2,NOW(),NOW()) ON CONFLICT(fingerprint_hash,mobile) DO UPDATE SET last_seen_at=NOW()`, [fingerprintHash, mobile]);
  };

  app.get('/api/admin/session', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.json({ authenticated: true, role: 'ADMIN' });
  });

  app.post('/api/admin/login', async (req, res) => {
    const m = cleanMobileNumber(req.body?.mobile), p = String(req.body?.password || '');
    const attempt = adminAttempts.get(m);
    if (attempt && attempt.blockedUntil > Date.now()) return res.status(429).json({ error: 'Too many failed admin login attempts. Try again later.' });
    if (!ADMIN_MOBILE || !ADMIN_PASSWORD || !safeEqual(m, ADMIN_MOBILE) || !safeEqual(p, ADMIN_PASSWORD)) {
      const failures = (attempt?.failures || 0) + 1;
      adminAttempts.set(m, { failures, blockedUntil: failures >= 5 ? Date.now() + 10 * 60 * 1000 : 0 });
      return res.status(401).json({ error: 'Invalid mobile number or password.' });
    }
    adminAttempts.delete(m);
    const t = await issueSession(ADMIN_MOBILE, 'ADMIN');
    res.setHeader('Set-Cookie', `cotrix_admin_session=${encodeURIComponent(t)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    let registeredName = '';
    try {
      const account = await pool.query('SELECT name FROM users WHERE mobile=$1 LIMIT 1', [ADMIN_MOBILE]);
      registeredName = String(account.rows[0]?.name || '').trim();
    } catch { /* The admin login remains available if the optional profile lookup is unavailable. */ }
    const adminName = registeredName || String(process.env.ADMIN_NAME || '').trim() || 'Account Owner';
    res.json({ success: true, admin: { name: adminName, userId: ADMIN_MOBILE, mobile: ADMIN_MOBILE, role: 'ADMIN' } });
  });
  app.get('/api/admin/customers',async(req,res)=>{if(!(await requireAdmin(req,res)))return;const users=await pool.query(`SELECT id,name,mobile,created_at FROM users WHERE role!='ADMIN' ORDER BY created_at DESC`);const rr=await pool.query(`SELECT user_mobile FROM password_reset_requests WHERE status='PENDING' AND expires_at>NOW()`);const pending=new Set(rr.rows.map((r:any)=>r.user_mobile));res.json({customers:users.rows.map((r:any)=>({id:r.id,name:r.name,mobile:r.mobile,createdAt:r.created_at,resetRequested:pending.has(r.mobile)}))});});
  app.post('/api/admin/reset-password',async(req,res)=>{if(!(await requireAdmin(req,res)))return;try{const m=cleanMobileNumber(req.body?.mobile),p=String(req.body?.newPassword||''),c=String(req.body?.confirmPassword||'');if(m.length!==10)return res.status(400).json({error:'Invalid mobile number.'});if(p.length<8||!/[A-Za-z]/.test(p)||!/\d/.test(p))return res.status(400).json({error:'Password must be at least 8 characters and contain letters and numbers.'});if(p!==c)return res.status(400).json({error:'Password and Confirm Password do not match.'});if(!(await pool.query('SELECT id FROM users WHERE mobile=$1 LIMIT 1',[m])).rows.length)return res.status(404).json({error:'User not found.'});const h=await bcryptHash(p);await pool.query('UPDATE users SET password_hash=$1 WHERE mobile=$2',[h,m]);await pool.query('UPDATE client_users SET password_hash=$1 WHERE mobile=$2',[h,m]).catch(()=>{});await pool.query('UPDATE auth_sessions SET revoked=true WHERE user_mobile=$1',[m]);for(const [token,session] of sessions.entries())if(session.mobile===m)sessions.delete(token);await pool.query(`UPDATE password_reset_requests SET status='APPROVED',handled_at=NOW(),handled_by='ADMIN' WHERE user_mobile=$1 AND status='PENDING'`,[m]);res.json({success:true});}catch(e:any){res.status(500).json({error:e.message});}});
  app.get('/api/admin/password-reset-requests',async(req,res)=>{if(!(await requireAdmin(req,res)))return;await pool.query(`UPDATE password_reset_requests SET status='EXPIRED' WHERE status='PENDING' AND expires_at<=NOW()`);const r=await pool.query(`SELECT request_id,user_mobile,created_at,expires_at FROM password_reset_requests WHERE status='PENDING' ORDER BY created_at DESC`);res.json({requests:r.rows});});

  // ---------------- Customer Wallets & Recurring Fees ----------------
  app.get('/api/admin/customers-with-wallets', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      await applyRecurringFees();
      const usersRes = await pool.query(`SELECT u.id, COALESCE(NULLIF(BTRIM(u.name), ''), 'Customer') AS name, u.mobile, u.created_at FROM users u WHERE u.role != 'ADMIN' ORDER BY u.created_at DESC`);
      const walletsRes = await pool.query(`SELECT * FROM customer_wallets`);
      const walletMap = new Map<string, any>();
      for (const w of walletsRes.rows) {
        walletMap.set(w.customer_mobile, w);
      }
      const resetReqs = await pool.query(`SELECT user_mobile FROM password_reset_requests WHERE status='PENDING' AND expires_at>NOW()`);
      const pendingSet = new Set(resetReqs.rows.map((r: any) => r.user_mobile));

      const enriched = [];
      for (const u of usersRes.rows) {
        let w = walletMap.get(u.mobile);
        if (!w) {
          w = { customer_mobile: u.mobile, payment_in: 0, payment_out: 0, due_balance: 0, monthly_fee: 0, transactions: [] };
        }

        const due = parseFloat(w.due_balance || '0');
        const pIn = parseFloat(w.payment_in || '0');
        const pOut = parseFloat(w.payment_out || '0');
        const netAdvance = pIn - pOut;

        let statusColor: 'RED' | 'BLUE' | 'GREEN' = 'GREEN';
        if (due > 0) {
          statusColor = 'RED'; // Due Balance
        } else if (netAdvance > 0) {
          statusColor = 'BLUE'; // Advanced Payment
        } else {
          statusColor = 'GREEN'; // Settled / Zero
        }

        enriched.push({
          id: u.id,
          name: u.name,
          mobile: u.mobile,
          createdAt: u.created_at,
          resetRequested: pendingSet.has(u.mobile),
          payment_in: pIn,
          payment_out: pOut,
          due_balance: due,
          monthly_fee: parseFloat(w.monthly_fee || '0'),
          transactions: Array.isArray(w.transactions) ? w.transactions : (typeof w.transactions === 'string' ? JSON.parse(w.transactions || '[]') : []),
          statusColor,
        });
      }
      res.json({ customers: enriched });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin security: permanent account deletion and locked-device management.
  app.get('/api/admin/locked-devices', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const result = await pool.query(`SELECT id,mobile,fingerprint_hash,device_label,reason,blocked_at,unlocked_at,is_locked FROM admin_access_blocks WHERE is_locked=TRUE ORDER BY blocked_at DESC`);
      res.json({ devices: result.rows.map((row: any) => ({ id: row.id, mobile: row.mobile,
        fingerprint: row.fingerprint_hash ? `${String(row.fingerprint_hash).slice(0, 12)}…` : null,
        deviceLabel: row.device_label || (row.fingerprint_hash ? 'Registered browser device' : 'Mobile number block'),
        reason: row.reason, blockedAt: row.blocked_at, isLocked: Boolean(row.is_locked) })) });
    } catch (e: any) { res.status(500).json({ error: e.message || 'Unable to load locked devices.' }); }
  });

  app.post('/api/admin/locked-devices/:id/unlock', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const existing = await pool.query(`SELECT id,mobile,is_locked FROM admin_access_blocks WHERE id=$1 LIMIT 1`, [req.params.id]);
      if (!existing.rows.length || !existing.rows[0].is_locked) return res.status(404).json({ error: 'Locked entry was not found or is already unlocked.' });
      await pool.query(`UPDATE admin_access_blocks SET is_locked=FALSE,unlocked_at=NOW() WHERE id=$1`, [req.params.id]);
      res.json({ success: true, message: 'This block was removed. Other active blocks for the same mobile number or device may still apply.' });
    } catch (e: any) { res.status(500).json({ error: e.message || 'Unable to unlock this entry.' }); }
  });

  app.post('/api/admin/customers/:mobile/delete', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const mobile = cleanMobileNumber(req.params.mobile);
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
    if (String(req.body?.confirmation || '') !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm permanent account deletion.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(`SELECT id,name,mobile,role FROM users WHERE mobile=$1 LIMIT 1`, [mobile]);
      const user = userResult.rows[0];
      if (!user || String(user.role || '').toUpperCase() === 'ADMIN') {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer account was not found.' });
      }
      const fingerprints = await client.query(`SELECT fingerprint_hash FROM admin_device_registry WHERE mobile=$1`, [mobile]);
      const deviceHashes = new Set<string>(fingerprints.rows.map((row: any) => String(row.fingerprint_hash || '')).filter(Boolean));

      await client.query(`INSERT INTO admin_access_blocks(id,mobile,fingerprint_hash,device_label,reason,blocked_at,is_locked) VALUES($1,$2,NULL,'Mobile number','Account permanently deleted by administrator',NOW(),TRUE)`, [`BLK-M-${crypto.randomUUID()}`, mobile]);
      for (const fingerprintHash of deviceHashes) {
        await client.query(`INSERT INTO admin_access_blocks(id,mobile,fingerprint_hash,device_label,reason,blocked_at,is_locked) VALUES($1,$2,$3,'Registered browser device','Device blocked after account deletion',NOW(),TRUE)`, [`BLK-D-${crypto.randomUUID()}`, mobile, fingerprintHash]);
      }

      await client.query(`UPDATE cashier_devices SET revoked=TRUE WHERE owner_mobile_id=$1`, [mobile]);
      await client.query(`UPDATE cashier_link_tokens SET revoked=TRUE WHERE owner_mobile_id=$1`, [mobile]);
      await client.query(`UPDATE cashier_sessions SET revoked=TRUE WHERE owner_mobile=$1`, [mobile]);
      await client.query(`UPDATE auth_sessions SET revoked=TRUE WHERE user_mobile=$1`, [mobile]);

      // Remove tenant-owned records only. A customer's phone on another tenant's invoice is not an ownership key.
      const ownedColumns = ['user_mobile','tenant_mobile_id','owner_mobile_id','owner_mobile'];
      const tableMeta = await client.query(`SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.column_name = ANY($1::text[])`, [ownedColumns]);
      const protectedTables = new Set(['admin_access_blocks','admin_device_registry','users','client_users']);
      const ownership = new Map<string, Set<string>>();
      for (const row of tableMeta.rows) {
        const tableName = String(row.table_name);
        if (protectedTables.has(tableName) || tableName.startsWith('pg_')) continue;
        if (!ownership.has(tableName)) ownership.set(tableName, new Set());
        ownership.get(tableName)!.add(String(row.column_name));
      }
      for (const [tableName, columns] of ownership) {
        const safeTable = tableName.replace(/"/g, '""');
        for (const column of columns) {
          const safeColumn = column.replace(/"/g, '""');
          await client.query(`DELETE FROM "${safeTable}" WHERE "${safeColumn}"=$1`, [mobile]);
        }
      }
      // The in-memory development database does not expose information_schema.columns, so use a fixed tenant-owned fallback there.
      if (tableMeta.rows.length === 0) {
        const fallbackOwnedTables = [
          ['temporary_purchase_stage', 'user_mobile'], ['staged_purchases', 'user_mobile'],
          ['gstr2b_portal_cache', 'user_mobile'], ['permanent_purchase_ledger', 'user_mobile'],
          ['expenses', 'user_mobile'], ['payments', 'user_mobile'], ['quotations', 'user_mobile'],
          ['journal_entries', 'user_mobile'], ['payment_vouchers_ledger', 'tenant_mobile_id'],
          ['company_profiles', 'user_mobile'], ['ineligible_tax_logs', 'user_mobile'],
          ['bank_statement_records', 'user_mobile'], ['tax_ledger_opening_balances', 'user_mobile'], ['invoices', 'user_mobile'], ['purchases', 'user_mobile'],
          ['parties', 'user_mobile'], ['app_settings', 'user_mobile'], ['daily_cash_summaries', 'user_mobile'],
        ];
        for (const [tableName, columnName] of fallbackOwnedTables) {
          await client.query(`DELETE FROM ${tableName} WHERE ${columnName}=$1`, [mobile]);
        }
      }
      await client.query(`DELETE FROM customer_wallets WHERE customer_mobile=$1`, [mobile]);
      await client.query(`DELETE FROM orders WHERE customer_mobile=$1`, [mobile]);
      await client.query(`DELETE FROM audit_edit_logs WHERE user_id_context=$1 OR user_id_context=$2`, [mobile, String(user.id)]);
      await client.query(`DELETE FROM client_users WHERE mobile=$1`, [mobile]);
      await client.query(`DELETE FROM users WHERE mobile=$1`, [mobile]);
      await client.query(`DELETE FROM admin_device_registry WHERE mobile=$1`, [mobile]);
      await client.query('COMMIT');
      for (const [token, session] of sessions.entries()) if (session.mobile === mobile) sessions.delete(token);
      for (const [token, device] of deviceCache.entries()) if (device.ownerMobile === mobile) deviceCache.set(token, { ...device, revoked: true });
      res.json({ success: true, message: 'Account deleted. Its mobile number and registered browser devices have been blocked.' });
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: e.message || 'Unable to delete this account.' });
    } finally { client.release(); }
  });

  app.post('/api/admin/customers/:mobile/wallet', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const client = await pool.connect();
    try {
      const mobile = cleanMobileNumber(req.params.mobile);
      const { type, amount, notes = '' } = req.body || {};
      const numAmount = Number(amount);
      if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'Invalid customer mobile number.' });
      if (!Number.isFinite(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Please enter a valid amount greater than 0.' });
      if (!['PAYMENT_IN', 'PAYMENT_OUT', 'ADD_DUE'].includes(String(type))) return res.status(400).json({ error: 'Choose a valid wallet transaction type.' });
      await client.query('BEGIN');
      await client.query('INSERT INTO customer_wallets (customer_mobile) VALUES ($1) ON CONFLICT (customer_mobile) DO NOTHING', [mobile]);
      const wRes = await client.query('SELECT * FROM customer_wallets WHERE customer_mobile=$1 FOR UPDATE', [mobile]);
      const w = wRes.rows[0];
      let pIn = Number(w?.payment_in || 0), pOut = Number(w?.payment_out || 0), due = Number(w?.due_balance || 0), fee = Number(w?.monthly_fee || 0);
      let txs = w ? (Array.isArray(w.transactions) ? w.transactions : (typeof w.transactions === 'string' ? JSON.parse(w.transactions || '[]') : [])) : [];
      if (type === 'PAYMENT_IN') { pIn += numAmount; due = Math.max(0, due - numAmount); }
      else if (type === 'PAYMENT_OUT') { pOut += numAmount; }
      else { due += numAmount; }
      txs.unshift({ id: 'TX-' + crypto.randomUUID(), type, amount: numAmount, notes: String(notes || '').slice(0, 500), date: new Date().toISOString() });
      await client.query(
        `INSERT INTO customer_wallets (customer_mobile,payment_in,payment_out,due_balance,monthly_fee,transactions,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (customer_mobile) DO UPDATE SET payment_in=EXCLUDED.payment_in,payment_out=EXCLUDED.payment_out,
           due_balance=EXCLUDED.due_balance,transactions=EXCLUDED.transactions,updated_at=NOW()`,
        [mobile,pIn,pOut,due,fee,JSON.stringify(txs)]
      );
      await client.query('COMMIT');
      res.json({ success: true, wallet: { payment_in: pIn, payment_out: pOut, due_balance: due, monthly_fee: fee, transactions: txs } });
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: e.message || 'Unable to update customer wallet.' });
    } finally { client.release(); }
  });

  app.post('/api/admin/customers/:mobile/fee', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const mobile = cleanMobileNumber(req.params.mobile);
      const monthlyFee = Math.max(0, parseFloat(req.body?.monthly_fee || '0'));
      await pool.query(
        `INSERT INTO customer_wallets (customer_mobile, monthly_fee, fee_last_applied, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (customer_mobile) DO UPDATE SET
           monthly_fee = EXCLUDED.monthly_fee,
           fee_last_applied = NOW(),
           updated_at = NOW()`,
        [mobile, monthlyFee]
      );
      res.json({ success: true, monthly_fee: monthlyFee });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Tenant-scoped signed upload credentials for private business documents.
  app.post('/api/cloudinary/signature', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
    if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.' });
    const requested = String(req.body?.purpose || 'purchase-bills');
    const folderSuffix = requested === 'purchase-bills' ? 'purchase-bills' : requested === 'profile' ? 'profile' : 'documents';
    const tenant = userMobile.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    const folder = `cotrix/${tenant}/${folderSuffix}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex');
    res.json({ cloud_name: cloudName, api_key: apiKey, timestamp, folder, signature });
  });

  // ---------------- Signed Cloudinary uploads for admin product media ----------------
  app.post('/api/admin/cloudinary-signature', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(503).json({ error: 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.' });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'cotrix-products';
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex');
    res.json({ cloud_name: cloudName, api_key: apiKey, timestamp, folder, signature });
  });

  // ---------------- Admin Payment Details Settings (QR Code, Phone, UPI) ----------------
  app.get('/api/admin/payment-settings', async (_req: Request, res: Response) => {
    try {
      const r = await pool.query(`SELECT qr_code_url, phone_number, upi_id FROM admin_payment_settings WHERE id = 'GLOBAL' LIMIT 1`);
      res.json(r.rows[0] || { qr_code_url: '', phone_number: '', upi_id: '' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/payment-settings', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { qr_code_url, phone_number, upi_id } = req.body;
      await pool.query(
        `INSERT INTO admin_payment_settings (id, qr_code_url, phone_number, upi_id, updated_at)
         VALUES ('GLOBAL', $1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET
           qr_code_url = EXCLUDED.qr_code_url,
           phone_number = EXCLUDED.phone_number,
           upi_id = EXCLUDED.upi_id,
           updated_at = NOW()`,
        [qr_code_url || '', phone_number || '', upi_id || '']
      );
      res.json({ success: true, payment_settings: { qr_code_url, phone_number, upi_id } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---------------- Store Products & Catalog ----------------
  // Tenant-owned GST inventory. Stock is moved only from persisted purchase/sales records.
  app.get('/api/inventory/items', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    try {
      const result = await pool.query('SELECT * FROM inventory_items WHERE user_mobile=$1 ORDER BY item_name ASC', [userMobile]);
      res.json(result.rows);
    } catch (error: any) { res.status(500).json({ error: error.message || 'Unable to load inventory.' }); }
  });
  app.get('/api/inventory/movements', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    try {
      const result = await pool.query(
        `SELECT m.*, i.item_name, i.unit FROM inventory_movements m JOIN inventory_items i ON i.id=m.inventory_item_id AND i.user_mobile=m.user_mobile
         WHERE m.user_mobile=$1 ORDER BY m.created_at DESC LIMIT 1000`, [userMobile]
      );
      res.json(result.rows);
    } catch (error: any) { res.status(500).json({ error: error.message || 'Unable to load inventory movements.' }); }
  });

  app.get('/api/products', async (req: Request, res: Response) => {
    try {
      const showAll = req.query.all === 'true';
      if (showAll && !(await requireAdmin(req, res))) return;
      const sql = showAll
        ? `SELECT * FROM products ORDER BY created_at DESC`
        : `SELECT * FROM products WHERE is_published = TRUE ORDER BY created_at DESC`;
      const r = await pool.query(sql);
      res.json({ products: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/products', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { title, description = '', price, compare_price = 0, media = [], variants = [] } = req.body;
      const is_published = req.body?.is_published === undefined ? true : (req.body.is_published === true || String(req.body.is_published).toLowerCase() === 'true');
      const stock = Number(req.body?.stock ?? 0);
      if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Stock must be a non-negative whole number.' });
      if (!title || !Number.isFinite(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ error: 'Product Title and a valid Price are required.' });
      }
      if (!Number.isFinite(Number(compare_price)) || Number(compare_price) < 0) return res.status(400).json({ error: 'Compare price must be a valid non-negative amount.' });
      if (is_published && (!Array.isArray(media) || media.length < 1)) {
        return res.status(400).json({ error: 'At least one product photo or video is required before publishing.' });
      }
      if (!Array.isArray(media) || media.some((url: unknown) => typeof url !== 'string' || !/^https?:\/\//i.test(url))) {
        return res.status(400).json({ error: 'Product media must contain valid HTTP or HTTPS URLs.' });
      }
      if (!Array.isArray(variants) || variants.some((v: any) => !v || !String(v.name || '').trim() || !Array.isArray(v.options) || v.options.length === 0 || v.options.some((option: any) => !String(option || '').trim()))) return res.status(400).json({ error: 'Each product variant must have a name and at least one valid option.' });
      if (new Set(variants.map((v: any) => String(v.name).trim().toLowerCase())).size !== variants.length) return res.status(400).json({ error: 'Product variant names must be unique.' });
      const id = 'PRD-' + crypto.randomUUID();
      const r = await pool.query(
        `INSERT INTO products (id, title, description, price, compare_price, media, variants, is_published, stock, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [id, String(title).trim(), description, parseFloat(price), parseFloat(compare_price || '0'), JSON.stringify(media), JSON.stringify(variants), is_published, stock]
      );
      res.status(201).json({ success: true, product: r.rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/products/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { title, description, price, compare_price, media, variants, is_published } = req.body;
      const stock = req.body?.stock === undefined ? undefined : Number(req.body.stock);
      if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) return res.status(400).json({ error: 'Stock must be a non-negative whole number.' });
      if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) <= 0)) return res.status(400).json({ error: 'Price must be greater than zero.' });
      if (compare_price !== undefined && (!Number.isFinite(Number(compare_price)) || Number(compare_price) < 0)) return res.status(400).json({ error: 'Compare price must be non-negative.' });
      if (media !== undefined && (!Array.isArray(media) || media.some((url: unknown) => typeof url !== 'string' || !/^https?:\/\//i.test(url)))) {
        return res.status(400).json({ error: 'Product media must contain valid HTTP or HTTPS URLs.' });
      }
      if (is_published === true && Array.isArray(media) && media.length === 0) {
        return res.status(400).json({ error: 'At least one product photo or video is required before publishing.' });
      }
      if (variants !== undefined && (!Array.isArray(variants) || variants.some((v: any) => !v || !String(v.name || '').trim() || !Array.isArray(v.options) || v.options.length === 0 || v.options.some((option: any) => !String(option || '').trim())))) return res.status(400).json({ error: 'Each product variant must have a name and at least one valid option.' });
      if (Array.isArray(variants) && new Set(variants.map((v: any) => String(v.name).trim().toLowerCase())).size !== variants.length) return res.status(400).json({ error: 'Product variant names must be unique.' });
      const r = await pool.query(
        `UPDATE products SET
           title = COALESCE($1, title),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           compare_price = COALESCE($4, compare_price),
           media = COALESCE($5, media),
           variants = COALESCE($6, variants),
           is_published = COALESCE($7, is_published),
           stock = COALESCE($8, stock),
           updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [
          title ? String(title).trim() : null,
          description !== undefined ? description : null,
          price !== undefined ? parseFloat(price) : null,
          compare_price !== undefined ? parseFloat(compare_price) : null,
          media ? JSON.stringify(media) : null,
          variants ? JSON.stringify(variants) : null,
          is_published !== undefined ? (is_published === true || String(is_published).toLowerCase() === 'true') : null,
          stock === undefined ? null : stock,
          req.params.id,
        ]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Product not found.' });
      res.json({ success: true, product: r.rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/products/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      await pool.query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Resolve customer identity from a server-issued session; never trust a submitted mobile number alone.
  const getAuthenticatedCustomerMobile = async (req: Request): Promise<string | null> => {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const token = parseCookie(req, 'cotrix_session') || bearer;
    if (!token) return null;
    const result = await pool.query(`SELECT user_mobile, role, expires_at, revoked FROM auth_sessions WHERE token_hash = $1 LIMIT 1`, [hashToken(token)]);
    const row = result.rows[0];
    if (!row || row.revoked || row.role !== 'CUSTOMER' || new Date(row.expires_at).getTime() <= Date.now()) return null;
    sessions.set(token, { mobile: row.user_mobile, role: row.role, expires: new Date(row.expires_at).getTime() });
    return cleanMobileNumber(row.user_mobile);
  };

  // ---------------- Customer Orders & Checkout ----------------
  app.get('/api/orders', async (req: Request, res: Response) => {
    try {
      if (req.query.admin === 'true') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query(`SELECT * FROM orders ORDER BY created_at DESC`);
        return res.json({ orders: r.rows });
      }
      const mobile = await getAuthenticatedCustomerMobile(req);
      if (!mobile || mobile.length !== 10) return res.status(401).json({ error: 'Please sign in to view your orders.' });
      const r = await pool.query(`SELECT * FROM orders WHERE customer_mobile = $1 ORDER BY created_at DESC`, [mobile]);
      res.json({ orders: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post('/api/orders', async (req: Request, res: Response) => {
    let client: any = null;
    try {
      client = await pool.connect();
      const mobile = await getAuthenticatedCustomerMobile(req);
      if (!mobile || mobile.length !== 10) return res.status(401).json({ error: 'Please sign in before placing an order.' });
      const { customer_email, address, items, payment_method, payment_sub_option } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });
      if (!address || !String(address.line1 || '').trim() || !String(address.street || '').trim() || !String(address.building_number || '').trim() || !/^\d{6}$/.test(String(address.pincode || ''))) {
        return res.status(400).json({ error: 'Complete the delivery address with a valid 6-digit PIN Code.' });
      }
      if (!['COD', 'ONLINE'].includes(payment_method)) return res.status(400).json({ error: 'Select a valid payment method.' });
      const validOptions = ['QR_CODE', 'UPI_ID', 'PHONE'];
      if (payment_method === 'ONLINE' && !validOptions.includes(payment_sub_option)) return res.status(400).json({ error: 'Select an online payment option.' });
      if (payment_method === 'ONLINE') {
        const settings = await pool.query(`SELECT qr_code_url, phone_number, upi_id FROM admin_payment_settings WHERE id = 'GLOBAL' LIMIT 1`);
        const cfg = settings.rows[0] || {};
        if (payment_sub_option === 'QR_CODE' && !cfg.qr_code_url) return res.status(400).json({ error: 'QR payment is not configured.' });
        if (payment_sub_option === 'UPI_ID' && !cfg.upi_id) return res.status(400).json({ error: 'UPI payment is not configured.' });
        if (payment_sub_option === 'PHONE' && !cfg.phone_number) return res.status(400).json({ error: 'Phone payment is not configured.' });
      }
      const userResult = await pool.query(`SELECT name FROM users WHERE mobile = $1 LIMIT 1`, [mobile]);
      if (!userResult.rows.length) return res.status(401).json({ error: 'The signed-in customer account could not be verified.' });
      const normalizedItems: any[] = [];
      let subtotal = 0;
      for (const item of items) {
        const productId = String(item.productId || '').trim();
        const quantity = Number.parseInt(String(item.quantity || '1'), 10);
        if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ error: 'Each item must have a valid product and quantity between 1 and 99.' });
        const productResult = await pool.query(`SELECT id, title, price, media, variants FROM products WHERE id = $1 AND is_published = TRUE LIMIT 1`, [productId]);
        if (!productResult.rows.length) return res.status(400).json({ error: 'A product in your cart is no longer available.' });
        const product = productResult.rows[0];
        const price = Number(product.price);
        const variant = String(item.variant || '').trim();
        const availableVariants = Array.isArray(product.variants) ? product.variants : (typeof product.variants === 'string' ? JSON.parse(product.variants || '[]') : []);
        if (availableVariants.length > 0 && !variant) {
          return res.status(400).json({ error: 'Select all required options for this product before checkout.' });
        }
        if (variant) {
          const parts = variant.split(',').map((part: string) => part.trim()).filter(Boolean);
          const selectedNames = new Set<string>();
          for (const part of parts) {
            const separator = part.indexOf(':');
            if (separator < 1) return res.status(400).json({ error: 'Invalid product variant selection.' });
            const name = part.slice(0, separator).trim();
            const value = part.slice(separator + 1).trim();
            if (selectedNames.has(name)) return res.status(400).json({ error: 'A product variant was selected more than once.' });
            selectedNames.add(name);
            const definition = availableVariants.find((v: any) => v?.name === name);
            if (!definition || !Array.isArray(definition.options) || !definition.options.includes(value)) return res.status(400).json({ error: 'A selected product variant is no longer available.' });
          }
          if (availableVariants.some((definition: any) => !selectedNames.has(String(definition.name)))) {
            return res.status(400).json({ error: 'Select all required product variants before checkout.' });
          }
        }
        subtotal += price * quantity;
        normalizedItems.push({ productId: product.id, title: product.title, price, quantity, variant, image: Array.isArray(product.media) ? product.media[0] || '' : '' });
      }
      const codFee = payment_method === 'COD' ? 20 : 0;
      const grandTotal = subtotal + codFee;
      const id = 'ORD-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      await client.query('BEGIN');
      // Reserve inventory atomically; conditional updates prevent overselling during concurrent checkouts.
      const requestedByProduct = new Map<string, number>();
      for (const item of normalizedItems) requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + item.quantity);
      for (const [productId, quantity] of requestedByProduct) {
        const reserved = await client.query(
          `UPDATE products SET stock = stock - $2, updated_at = NOW()
           WHERE id = $1 AND is_published = TRUE AND stock >= $2 RETURNING id, stock`,
          [productId, quantity]
        );
        if (!reserved.rows.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'One or more products no longer have enough stock. Refresh the cart and try again.' });
        }
      }
      const initialStatus = payment_method === 'ONLINE' ? 'PAYMENT_PENDING' : 'CONFIRMED';
      const initialPaymentStatus = payment_method === 'ONLINE' ? 'PENDING' : 'COD_DUE';
      const r = await client.query(
        `INSERT INTO orders (id, customer_name, customer_mobile, customer_email, address, items, payment_method, payment_sub_option, subtotal, cod_fee, grand_total, status, payment_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING *`,
        [id, userResult.rows[0].name, mobile, String(customer_email || '').trim(), JSON.stringify(address), JSON.stringify(normalizedItems), payment_method, payment_method === 'ONLINE' ? payment_sub_option : null, subtotal, codFee, grandTotal, initialStatus, initialPaymentStatus]
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, order: r.rows[0] });
    } catch (e: any) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: e.message });
    } finally { if (client) client.release(); }
  });
  app.post('/api/admin/orders/:id/verify-payment', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const reference = String(req.body?.payment_reference || '').trim().slice(0, 128);
    if (reference.length < 3) return res.status(400).json({ error: 'Enter the transaction/UTR reference after checking the payment in your bank or UPI app.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found.' }); }
      const order = found.rows[0];
      if (String(order.payment_method).toUpperCase() !== 'ONLINE') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Only online-payment orders need payment verification.' }); }
      if (String(order.status).toUpperCase() === 'CANCELLED') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Cancelled orders cannot be marked paid.' }); }
      if (String(order.payment_status).toUpperCase() === 'VERIFIED') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Payment is already verified for this order.' }); }
      const updated = await client.query(
        `UPDATE orders SET payment_status='VERIFIED',payment_reference=$1,payment_verified_at=NOW(),payment_verified_by=$2,
          status=CASE WHEN status='PAYMENT_PENDING' THEN 'CONFIRMED' ELSE status END,updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [reference, ADMIN_MOBILE || 'ADMIN', req.params.id]
      );
      await client.query('COMMIT');
      res.json({ success: true, order: updated.rows[0], verificationMode: 'ADMIN_MANUAL' });
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: error.message || 'Unable to verify payment.' });
    } finally { client.release(); }
  });

  app.put('/api/orders/:id/status', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const client = await pool.connect();
    try {
      const { status } = req.body || {};
      const validStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
      if (!status || !validStatuses.includes(status)) return res.status(400).json({ error: 'Valid order status is required.' });
      await client.query('BEGIN');
      const currentRes = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!currentRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found.' });
      }
      const current = currentRes.rows[0];
      if (String(current.status).toUpperCase() === 'CANCELLED' && status !== 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A cancelled order cannot be reopened automatically. Create a new order to reserve stock again.' });
      }
      if (String(current.payment_method).toUpperCase() === 'ONLINE' && String(current.payment_status || 'PENDING').toUpperCase() !== 'VERIFIED' && status !== 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Verify the online payment and record its transaction reference before confirming or dispatching this order.' });
      }
      if (status === 'CANCELLED' && String(current.status).toUpperCase() !== 'CANCELLED') {
        const orderItems = Array.isArray(current.items) ? current.items : (typeof current.items === 'string' ? JSON.parse(current.items || '[]') : []);
        for (const item of orderItems) {
          const productId = String(item.productId || '').trim();
          const quantity = Number(item.quantity || 0);
          if (productId && Number.isInteger(quantity) && quantity > 0) {
            await client.query('UPDATE products SET stock=stock+$2, updated_at=NOW() WHERE id=$1', [productId, quantity]);
          }
        }
      }
      const updated = await client.query('UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, req.params.id]);
      await client.query('COMMIT');
      res.json({ success: true, order: updated.rows[0] });
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: e.message || 'Unable to update order status.' });
    } finally { client.release(); }
  });

  // Cashier access link contains only owner identity. Regenerating it revokes the previous link.
  app.get('/api/cashier/me', async (req, res) => {
    const d = await requireCashierDevice(req, res);
    if (!d) return;
    const profile = await pool.query(`SELECT profile_picture FROM cashier_devices WHERE token_hash=$1 LIMIT 1`, [hashToken(String(req.headers['x-cashier-device'] || ''))]);
    res.json({ approved: true, ownerMobile: d.ownerMobile, cashierName: d.cashierName, profile_picture: profile.rows[0]?.profile_picture || '' });
  });

  app.get('/api/cashier/preview', async (req, res) => {
    try {
      const owner = cleanMobileNumber(String(req.query.owner || ''));
      const link = String(req.query.link || '');
      if (owner.length !== 10 || !link) return res.status(400).json({ error: 'Invalid cashier link.' });
      const valid = await pool.query(`SELECT 1 FROM cashier_link_tokens WHERE owner_mobile_id=$1 AND token_hash=$2 AND revoked=false`, [owner, hashToken(link)]);
      if (!valid.rows.length) return res.status(403).json({ error: 'This cashier link is invalid or revoked.' });
      
      const r = await pool.query(`SELECT trade_name, name, phone, email, address, city, state, state_code, pincode, logo_base64 FROM company_profiles WHERE user_mobile=$1 ORDER BY updated_at DESC LIMIT 1`, [owner]);
      const c = r.rows[0] || {};
      let businessName = c.trade_name || c.name;
      if (!businessName) {
        const u = await pool.query(`SELECT name FROM users WHERE mobile=$1 LIMIT 1`, [owner]);
        businessName = u.rows[0]?.name ? `${u.rows[0].name}'s Business` : 'Cotrix Enterprise';
      }
      res.json({
        business_name: businessName,
        logo_url: c.logo_base64 || '',
        phone: c.phone || '',
        city: c.city || '',
        state: c.state || '',
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Unable to load business preview.' });
    }
  });

  app.post('/api/cashier/link', async (req, res) => {
    try {
      const owner = await requireOwner(req, res);
      if (!owner) return;
      const raw = newToken(24);
      await pool.query(
        `INSERT INTO cashier_link_tokens(owner_mobile_id, token_hash, created_at, revoked)
         VALUES($1, $2, NOW(), false)
         ON CONFLICT(owner_mobile_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, created_at=NOW(), revoked=false`,
        [owner, hashToken(raw)]
      );
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
      const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
      res.json({ success: true, link: `${proto}://${host}/cashier?owner=${encodeURIComponent(owner)}&link=${encodeURIComponent(raw)}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Unable to generate cashier link.' });
    }
  });

  app.post('/api/cashier-handshake/request', async (req, res) => {
    try {
      const owner = cleanMobileNumber(req.body?.ownerMobile);
      const link = String(req.body?.link || '');
      const name = String(req.body?.cashierName || '').trim();
      const profilePicture = String(req.body?.profilePicture || '').slice(0, 1400000);
      if (owner.length !== 10 || !link || name.length < 2) return res.status(400).json({ error: 'Cashier name and valid access link are required.' });
      
      const valid = await pool.query(`SELECT 1 FROM cashier_link_tokens WHERE owner_mobile_id=$1 AND token_hash=$2 AND revoked=false`, [owner, hashToken(link)]);
      if (!valid.rows.length) return res.status(403).json({ error: 'This cashier link is invalid or revoked.' });
      
      // Expire previous pending requests for this cashier name
      await pool.query(`UPDATE cashier_handshake_auth SET permission_status='EXPIRED', updated_at=NOW() WHERE owner_mobile_id=$1 AND cashier_name=$2 AND permission_status='PENDING'`, [owner, name]);
      
      const id = `CHR-${crypto.randomUUID()}`;
      const code = String(crypto.randomInt(10000, 100000));
      const statusToken = newToken(24);
      await pool.query(
        `INSERT INTO cashier_handshake_auth(id, request_id, owner_mobile_id, cashier_name, profile_picture, handshake_code_five_digit, status_token_hash, permission_status, created_at, expires_at, updated_at)
         VALUES($1, $1, $2, $3, $4, $5, $6, 'PENDING', NOW(), NOW()+INTERVAL '30 minutes', NOW())`,
        [id, owner, name, profilePicture || null, code, hashToken(statusToken)]
      );
      res.json({ success: true, requestId: id, code, statusToken });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/cashier-handshake/status', async (req, res) => {
    const id = String(req.query.requestId || '');
    const statusToken = String(req.query.statusToken || '');
    if (!id || !statusToken) return res.status(400).json({ error: 'Invalid handshake status token.' });
    
    await pool.query(`UPDATE cashier_handshake_auth SET permission_status='EXPIRED', updated_at=NOW() WHERE request_id=$1 AND permission_status='PENDING' AND expires_at<=NOW()`, [id]);
    const r = await pool.query(
      `SELECT request_id, permission_status, handshake_code_five_digit, expires_at, owner_mobile_id, cashier_name, profile_picture, status_token_hash 
       FROM cashier_handshake_auth 
       WHERE request_id=$1 AND status_token_hash=$2 LIMIT 1`,
      [id, hashToken(statusToken)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Handshake request not found.' });
    const row = r.rows[0];
    if (row.permission_status === 'APPROVED') {
      const token = deriveDeviceToken(row.status_token_hash, id, row.owner_mobile_id);
      // Cashier credentials are returned to the terminal and held in tab-scoped sessionStorage.
      // Never set a shared-origin cookie for a cashier device.
      return res.json({ ...row, deviceToken: token });
    }
    res.json(row);
  });

  app.get('/api/cashier-handshake/pending', async (req, res) => {
    try {
      const owner = await requireOwner(req, res);
      if (!owner) return;
      await pool.query(`UPDATE cashier_handshake_auth SET permission_status='EXPIRED', updated_at=NOW() WHERE owner_mobile_id=$1 AND permission_status='PENDING' AND expires_at<=NOW()`, [owner]);
      const requests = await pool.query(`SELECT request_id, cashier_name, handshake_code_five_digit, created_at, expires_at FROM cashier_handshake_auth WHERE owner_mobile_id=$1 AND permission_status='PENDING' ORDER BY created_at DESC`, [owner]);
      const devices = await pool.query(`SELECT device_id, cashier_name, approved_at, last_used_at, revoked FROM cashier_devices WHERE owner_mobile_id=$1 ORDER BY approved_at DESC`, [owner]);
      res.json({ requests: requests.rows, devices: devices.rows });
    } catch (error) {
      console.error('[cashier-handshake/pending]', error);
      if (!res.headersSent) res.status(500).json({ error: 'Unable to load cashier permissions. Please retry.' });
    }
  });

  app.post('/api/cashier-handshake/decision', async (req, res) => {
    const owner = await requireOwner(req, res);
    if (!owner) return;
    const id = String(req.body?.requestId || '');
    const decision = req.body?.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const r = await pool.query(`SELECT * FROM cashier_handshake_auth WHERE request_id=$1 AND owner_mobile_id=$2 AND permission_status='PENDING' AND expires_at>NOW() LIMIT 1`, [id, owner]);
    if (!r.rows.length) return res.status(404).json({ error: 'Request is missing or expired.' });
    
    const cashierName = r.rows[0].cashier_name;
    if (decision === 'REJECTED') {
      await pool.query(`UPDATE cashier_handshake_auth SET permission_status='REJECTED', updated_at=NOW() WHERE request_id=$1`, [id]);
      const devRes = await pool.query(
        `UPDATE cashier_devices SET revoked=true WHERE owner_mobile_id=$1 AND cashier_name=$2 RETURNING token_hash`,
        [owner, cashierName]
      );
      for (const devRow of devRes.rows) {
        for (const [token, info] of deviceCache.entries()) {
          if (hashToken(token) === devRow.token_hash) {
            info.revoked = true;
            deviceCache.set(token, info);
          }
        }
      }
      return res.json({ success: true, message: 'Cashier request rejected and device blocked.' });
    }
    
    const token = deriveDeviceToken(r.rows[0].status_token_hash, id, owner);
    const deviceId = `DEV-${crypto.randomUUID()}`;
    await pool.query(`INSERT INTO cashier_devices(device_id, owner_mobile_id, cashier_name, profile_picture, token_hash, approved_at, revoked) VALUES($1, $2, $3, $4, $5, NOW(), false)`, [deviceId, owner, cashierName, r.rows[0].profile_picture || null, hashToken(token)]);
    await pool.query(`UPDATE cashier_handshake_auth SET permission_status='APPROVED', updated_at=NOW() WHERE request_id=$1`, [id]);
    deviceCache.set(token, { ownerMobile: owner, cashierName, revoked: false });
    res.json({ success: true, deviceToken: token });
  });

  app.post('/api/cashier/devices/:deviceId/remove', async (req, res) => {
    const owner = await requireOwner(req, res);
    if (!owner) return;
    const r = await pool.query(`UPDATE cashier_devices SET revoked=true WHERE device_id=$1 AND owner_mobile_id=$2 RETURNING token_hash, cashier_name`, [req.params.deviceId, owner]);
    if (!r.rows.length) return res.status(404).json({ error: 'Device not found.' });
    for (const [token, info] of deviceCache.entries()) {
      if (hashToken(token) === r.rows[0].token_hash) {
        info.revoked = true;
        deviceCache.set(token, info);
      }
    }
    await pool.query(
      `UPDATE cashier_handshake_auth SET permission_status='REJECTED', updated_at=NOW() WHERE owner_mobile_id=$1 AND cashier_name=$2`,
      [owner, r.rows[0].cashier_name]
    );
    res.json({ success: true });
  });

  // Server-side auth & cashier allow-list (Hybrid Cookie + Header Fallback for Netlify/Render/Vercel)
  app.use('/api', async (req, res, next) => {
    if (req.path.startsWith('/auth/') || req.path.startsWith('/admin/') || req.path.startsWith('/cashier-handshake/') || req.path.startsWith('/products') || req.path.startsWith('/orders')) return next();

    // Cashier identity takes precedence over any administrator cookie in the same browser.
    // A verified cashier device is bound to its owner's tenant and never inherits admin auth state.
    const cashierDeviceToken = String(req.headers['x-cashier-device'] || '');
    if (cashierDeviceToken) {
      const cashierDevice = await requireCashierDevice(req, res);
      if (!cashierDevice) return;
      (req as any).userMobile = cleanMobileNumber(cashierDevice.ownerMobile);
      (req as any).cashierName = cashierDevice.cashierName;
      const protectedAccountingPath = /^\/(invoices|purchases|expenses|payments|records\/manage)(?:\/|$)/.test(req.path);
      if (protectedAccountingPath && ['DELETE','PATCH','PUT'].includes(req.method.toUpperCase())) {
        return res.status(403).json({ error: 'Cashiers must submit an edit or deletion request for owner approval.' });
      }
      return next();
    }

    // 1. Check Cookie first
    const sessionCookie = parseCookie(req, 'cotrix_session');
    let owner: { mobile: string; role: string; expires: number } | undefined;
    if (sessionCookie) {
      const r = await pool.query(`SELECT user_mobile, role, expires_at, revoked FROM auth_sessions WHERE token_hash=$1 LIMIT 1`, [hashToken(sessionCookie)]);
      const row = r.rows[0];
      if (row && !row.revoked && new Date(row.expires_at).getTime() > Date.now()) {
        owner = { mobile: row.user_mobile, role: row.role, expires: new Date(row.expires_at).getTime() };
        sessions.set(sessionCookie, owner);
      } else {
        sessions.delete(sessionCookie);
      }
    }

    // 2. Accept only a server-issued bearer session as a fallback to the HttpOnly cookie.
    // A mobile number supplied by the browser is not proof of identity.
    if (!owner) {
      const authHeader = String(req.headers.authorization || '');
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token) {
          const r = await pool.query(`SELECT user_mobile, role, expires_at, revoked FROM auth_sessions WHERE token_hash=$1 LIMIT 1`, [hashToken(token)]);
          const row = r.rows[0];
          if (row && !row.revoked && new Date(row.expires_at).getTime() > Date.now()) {
            owner = { mobile: row.user_mobile, role: row.role, expires: new Date(row.expires_at).getTime() };
            sessions.set(token, owner);
          } else {
            sessions.delete(token);
          }
        }
      }
    }

    if (owner && owner.role === 'CUSTOMER' && owner.expires > Date.now()) {
      (req as any).userMobile = cleanMobileNumber(owner.mobile);
      return next();
    }

    return res.status(401).json({ error: 'Login required.' });
  });


  // Cashier asset requests: cashier submissions are bound to a verified device token; owner decisions are tenant-scoped.
  app.post('/api/cashier-asset-requests', async (req: Request, res: Response) => {
    try {
      const device = await requireCashierDevice(req, res); if (!device) return;
      const recordType = String(req.body?.recordType || '').toUpperCase();
      const actionType = String(req.body?.action || '').toUpperCase();
      const recordId = String(req.body?.recordId || '').trim().slice(0,128);
      const details = String(req.body?.details || '').trim().slice(0,2000);
      if (!['SALES','PURCHASES','EXPENSES'].includes(recordType) || !['DELETE','EDIT'].includes(actionType) || !recordId) return res.status(400).json({error:'Choose a record type, request type, and record ID.'});
      const requestId = `CAR-${crypto.randomUUID()}`;
      await pool.query(`INSERT INTO cashier_asset_requests(request_id,owner_mobile,device_token_hash,cashier_name,record_type,action_type,record_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[requestId,device.ownerMobile,hashToken(String(req.headers['x-cashier-device']||'')),device.cashierName,recordType,actionType,recordId,details]);
      return res.status(201).json({success:true,requestId});
    } catch(e:any) { return res.status(500).json({error:'Unable to submit the cashier request.'}); }
  });
  app.get('/api/cashier-asset-requests', async (req: Request, res: Response) => {
    try { const owner = await requireOwner(req,res); if(!owner) return res.status(401).json({error:'Owner login required.'});
      const r = await pool.query(`SELECT request_id,cashier_name,record_type,action_type,record_id,details,status,created_at FROM cashier_asset_requests WHERE owner_mobile=$1 AND status='PENDING' ORDER BY created_at DESC`,[owner]);
      return res.json({requests:r.rows});
    } catch(e:any) { return res.status(500).json({error:'Unable to load cashier requests.'}); }
  });
  app.post('/api/cashier-asset-requests/:requestId/decision', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const owner = await requireOwner(req,res); if(!owner) return res.status(401).json({error:'Owner login required.'});
      const decision = String(req.body?.decision||'').toUpperCase(); if(!['APPROVED','REJECTED'].includes(decision)) return res.status(400).json({error:'Invalid decision.'});
      await client.query('BEGIN');
      const found = await client.query(`SELECT * FROM cashier_asset_requests WHERE request_id=$1 AND owner_mobile=$2 AND status='PENDING' FOR UPDATE`,[req.params.requestId,owner]);
      if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Request not found or already handled.'});}
      const item=found.rows[0];
      if(decision==='APPROVED' && item.action_type==='DELETE') {
        if(item.record_type==='SALES') {
          const foundRecord=await client.query(`SELECT * FROM invoices WHERE user_mobile=$1 AND (id::text=$2 OR invoice_number=$2) FOR UPDATE`,[owner,item.record_id]);
          if(!foundRecord.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Sales record was not found. No records were deleted.'});}
          const record=foundRecord.rows[0];
          const movements=await client.query(`SELECT inventory_item_id,SUM(quantity_delta) AS delta FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2 GROUP BY inventory_item_id`,[owner,record.id]);
          for(const movement of movements.rows) await client.query(`UPDATE inventory_items SET quantity_on_hand=quantity_on_hand-$1,updated_at=NOW() WHERE id=$2 AND user_mobile=$3`,[Number(movement.delta||0),movement.inventory_item_id,owner]);
          await client.query(`DELETE FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2`,[owner,record.id]);
          await client.query(`DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2`,[owner,`JE-${record.id}`]);
          await client.query(`DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'`,[owner,`BRS-SALE-${record.id}`]);
          const due=Math.max(0,Number(record.balance_amount||0)); if(due>0&&record.party_name) await client.query(`UPDATE parties SET current_balance=COALESCE(current_balance,0)-$1 WHERE user_mobile=$2 AND (id=$3 OR LOWER(TRIM(name))=LOWER(TRIM($4)))`,[due,owner,record.party_id||'',record.party_name]);
          await client.query(`INSERT INTO audit_edit_logs(log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES($1,'invoices',$2,'DELETE',$3,NOW(),$4)`,[`AEL-${crypto.randomUUID()}`,record.id,owner,JSON.stringify({invoice_number:record.invoice_number,grand_total:record.grand_total,approved_cashier_request:item.request_id})]);
          await client.query(`DELETE FROM invoices WHERE id=$1 AND user_mobile=$2`,[record.id,owner]);
        } else if(item.record_type==='PURCHASES') {
          const foundRecord=await client.query(`SELECT * FROM purchases WHERE user_mobile=$1 AND (id::text=$2 OR supplier_invoice_no=$2) FOR UPDATE`,[owner,item.record_id]);
          if(!foundRecord.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Purchase record was not found. No records were deleted.'});}
          const record=foundRecord.rows[0];
          const movements=await client.query(`SELECT inventory_item_id,SUM(quantity_delta) AS delta FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2 GROUP BY inventory_item_id`,[owner,record.id]);
          for(const movement of movements.rows){const stock=await client.query(`SELECT quantity_on_hand FROM inventory_items WHERE id=$1 AND user_mobile=$2 FOR UPDATE`,[movement.inventory_item_id,owner]); if(stock.rows.length&&Number(stock.rows[0].quantity_on_hand||0)-Number(movement.delta||0)<-0.0001) throw new Error('This purchase cannot be deleted because related stock has already been consumed.'); await client.query(`UPDATE inventory_items SET quantity_on_hand=GREATEST(0,quantity_on_hand-$1),updated_at=NOW() WHERE id=$2 AND user_mobile=$3`,[Number(movement.delta||0),movement.inventory_item_id,owner]);}
          await client.query(`DELETE FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2`,[owner,record.id]); await client.query(`DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2`,[owner,`JE-${record.id}`]); await client.query(`DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'`,[owner,`BRS-PUR-${record.id}`]);
          const unpaid=Math.max(0,Number(record.grand_total||0)-Number(record.paid_amount||0)); if(unpaid>0&&record.supplier_name) await client.query(`UPDATE parties SET current_balance=COALESCE(current_balance,0)+$1 WHERE user_mobile=$2 AND (id=$3 OR LOWER(TRIM(name))=LOWER(TRIM($4)))`,[unpaid,owner,record.supplier_id||'',record.supplier_name]);
          await client.query(`INSERT INTO audit_edit_logs(log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES($1,'purchases',$2,'DELETE',$3,NOW(),$4)`,[`AEL-${crypto.randomUUID()}`,record.id,owner,JSON.stringify({supplier_invoice_no:record.supplier_invoice_no,grand_total:record.grand_total,approved_cashier_request:item.request_id})]); await client.query(`DELETE FROM purchases WHERE id=$1 AND user_mobile=$2`,[record.id,owner]);
        } else {
          const foundRecord=await client.query(`SELECT * FROM payments WHERE user_mobile=$1 AND UPPER(COALESCE(type,'')) IN ('EXPENSE','EXPENSES') AND (id::text=$2 OR receipt_no=$2) FOR UPDATE`,[owner,item.record_id]);
          if(!foundRecord.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Expense record was not found. No records were deleted.'});}
          const record=foundRecord.rows[0]; const voucher=await client.query(`SELECT voucher_id FROM payment_vouchers_ledger WHERE voucher_id=$1 AND tenant_mobile_id=$2 LIMIT 1`,[record.id,owner]); if(voucher.rows.length) throw new Error('This expense is linked to a settlement voucher. Record a reversal transaction instead.');
          const amount=Number(record.amount||0); const delta=String(record.type||'').toUpperCase()==='PAYMENT_IN'?-amount:amount;
          if(record.party_name) await client.query(`UPDATE parties SET current_balance=COALESCE(current_balance,0)-$1,updated_at=NOW() WHERE user_mobile=$2 AND LOWER(TRIM(name))=LOWER(TRIM($3))`,[delta,owner,record.party_name]);
          await client.query(`DELETE FROM journal_entries WHERE id=$1 AND user_mobile=$2`,[`JE-${record.id}`,owner]); await client.query(`DELETE FROM bank_statement_records WHERE id=$1 AND user_mobile=$2 AND record_source='APP_ENTRY'`,[`BRS-PAY-${record.id}`,owner]);
          await client.query(`INSERT INTO audit_edit_logs(log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES($1,'payments',$2,'DELETE',$3,NOW(),$4)`,[`AEL-${crypto.randomUUID()}`,record.id,owner,JSON.stringify({receipt_no:record.receipt_no,amount:record.amount,approved_cashier_request:item.request_id})]); await client.query(`DELETE FROM payments WHERE id=$1 AND user_mobile=$2`,[record.id,owner]);
        }
      }
      await client.query(`UPDATE cashier_asset_requests SET status=$1,handled_at=NOW(),handled_by=$2 WHERE request_id=$3`,[decision,owner,item.request_id]);
      await client.query('COMMIT'); return res.json({success:true,status:decision});
    } catch(e:any) { await client.query('ROLLBACK').catch(()=>{}); return res.status(500).json({error:'Unable to process the cashier request.'}); }
    finally { client.release(); }
  });

  // 2. Company Profile (User-scoped or Clean Blank)
  app.get('/api/company', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query('SELECT * FROM company_profiles WHERE user_mobile=$1 ORDER BY updated_at DESC LIMIT 1', [userMobile]);
      if (result.rows.length) {
        const row = result.rows[0];
        if (req.headers['x-cashier-device']) {
          return res.json({ id: row.id, user_mobile: userMobile, trade_name: row.trade_name || row.name || '', name: row.name || row.trade_name || '', gstin: row.gstin || '', phone: row.phone || '', phone2: row.phone2 || '', email: row.email || '', address: row.address || '', city: row.city || '', state: row.state || '', state_code: row.state_code || '', pincode: row.pincode || '', logo_base64: row.logo_base64 || '', card_theme: row.card_theme ?? null, business_type: row.business_type || '', business_category: row.business_category || '', show_gstin_on_card: row.show_gstin_on_card ?? null, show_type_on_card: row.show_type_on_card ?? null, show_category_on_card: row.show_category_on_card ?? false });
        }
        return res.json({ ...row, opening_capital: row.opening_capital == null ? 0 : Number(row.opening_capital) });
      }
      return res.json({ id: 'CP-' + userMobile, user_mobile: userMobile, trade_name: '', name: '', gstin: '', pan: '', phone: userMobile, phone2: '', email: '', address: '', city: '', state: '', state_code: '', pincode: '', business_type: '', business_category: '', card_theme: 'classic_blue', books_beginning_date: '', opening_capital: 0 });
    } catch (err: any) { res.status(500).json({ error: err.message || 'Unable to load business profile.' }); }
  });

  const handleCompanySave = async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const {
        trade_name,
        name,
        gstin,
        pan,
        phone,
        phone2,
        email,
        address,
        city,
        state,
        state_code,
        pincode,
        bank_name,
        account_number,
        ifsc_code,
        upi_id,
        logo_base64,
        signature_title,
        signature_base64,
        business_type,
        business_category,
        business_description,
        card_theme,
        show_gstin_on_card,
        show_type_on_card,
        show_category_on_card,
        books_beginning_date,
        opening_capital,
      } = req.body;

      const profileId = 'CP-' + userMobile;
      const cleanOpeningCapital = opening_capital !== undefined && opening_capital !== null && opening_capital !== '' ? (Number.isFinite(Number(opening_capital)) ? Number(opening_capital) : null) : null;

      const result = await pool.query(
        `INSERT INTO company_profiles (
          id, user_mobile, trade_name, name, gstin, pan, phone, phone2, email,
          address, city, state, state_code, pincode, bank_name, account_number,
          ifsc_code, upi_id, logo_base64, signature_title, signature_base64,
          business_type, business_category, business_description, card_theme,
          show_gstin_on_card, show_type_on_card, show_category_on_card,
          books_beginning_date, opening_capital, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25,
          $26, $27, $28,
          $29, $30, NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          trade_name = COALESCE(NULLIF(EXCLUDED.trade_name, ''), company_profiles.trade_name),
          name = COALESCE(NULLIF(EXCLUDED.name, ''), company_profiles.name),
          gstin = COALESCE(NULLIF(EXCLUDED.gstin, ''), company_profiles.gstin),
          pan = COALESCE(NULLIF(EXCLUDED.pan, ''), company_profiles.pan),
          phone = COALESCE(NULLIF(EXCLUDED.phone, ''), company_profiles.phone),
          phone2 = COALESCE(NULLIF(EXCLUDED.phone2, ''), company_profiles.phone2),
          email = COALESCE(NULLIF(EXCLUDED.email, ''), company_profiles.email),
          address = COALESCE(NULLIF(EXCLUDED.address, ''), company_profiles.address),
          city = COALESCE(NULLIF(EXCLUDED.city, ''), company_profiles.city),
          state = COALESCE(NULLIF(EXCLUDED.state, ''), company_profiles.state),
          state_code = COALESCE(NULLIF(EXCLUDED.state_code, ''), company_profiles.state_code),
          pincode = COALESCE(NULLIF(EXCLUDED.pincode, ''), company_profiles.pincode),
          bank_name = COALESCE(NULLIF(EXCLUDED.bank_name, ''), company_profiles.bank_name),
          account_number = COALESCE(NULLIF(EXCLUDED.account_number, ''), company_profiles.account_number),
          ifsc_code = COALESCE(NULLIF(EXCLUDED.ifsc_code, ''), company_profiles.ifsc_code),
          upi_id = COALESCE(NULLIF(EXCLUDED.upi_id, ''), company_profiles.upi_id),
          logo_base64 = COALESCE(EXCLUDED.logo_base64, company_profiles.logo_base64),
          signature_title = COALESCE(NULLIF(EXCLUDED.signature_title, ''), company_profiles.signature_title),
          signature_base64 = COALESCE(EXCLUDED.signature_base64, company_profiles.signature_base64),
          business_type = COALESCE(NULLIF(EXCLUDED.business_type, ''), company_profiles.business_type),
          business_category = COALESCE(NULLIF(EXCLUDED.business_category, ''), company_profiles.business_category),
          business_description = COALESCE(NULLIF(EXCLUDED.business_description, ''), company_profiles.business_description),
          card_theme = COALESCE(NULLIF(EXCLUDED.card_theme, ''), company_profiles.card_theme),
          show_gstin_on_card = COALESCE(EXCLUDED.show_gstin_on_card, company_profiles.show_gstin_on_card),
          show_type_on_card = COALESCE(EXCLUDED.show_type_on_card, company_profiles.show_type_on_card),
          show_category_on_card = COALESCE(EXCLUDED.show_category_on_card, company_profiles.show_category_on_card),
          books_beginning_date = COALESCE(NULLIF(EXCLUDED.books_beginning_date, ''), company_profiles.books_beginning_date),
          opening_capital = COALESCE(EXCLUDED.opening_capital, company_profiles.opening_capital),
          updated_at = NOW()
        RETURNING *`,
        [
          profileId,
          userMobile || null,
          trade_name || '',
          name || trade_name || '',
          gstin || '',
          pan || '',
          phone ?? null,
          phone2 || '',
          email || '',
          address || '',
          city || '',
          state ?? null,
          state_code ?? null,
          pincode || '',
          bank_name || '',
          account_number || '',
          ifsc_code || '',
          upi_id || '',
          logo_base64 || null,
          signature_title || '',
          signature_base64 || null,
          business_type ?? null,
          business_category ?? null,
          business_description || '',
          card_theme ?? null,
          show_gstin_on_card ?? null,
          show_type_on_card ?? null,
          show_category_on_card ?? null,
          books_beginning_date ?? null,
          cleanOpeningCapital,
        ]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
  app.put('/api/company', handleCompanySave);
  app.post('/api/company', handleCompanySave);

  // 3. App Settings
  app.get('/api/settings', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const settingsId = userMobile ? 'SET-' + userMobile : 'DEFAULT';
      const result = await pool.query('SELECT * FROM app_settings WHERE id = $1 LIMIT 1', [settingsId]);
      if (result.rows.length > 0) {
        res.json(result.rows[0]);
      } else {
        res.json({
          id: settingsId,
          language: 'en',
          currency: '₹',
          decimal_places: 2,
          date_format: 'DD/MM/YYYY',
          show_compliance_warnings: true,
          notifications_enabled: false,
          closing_alarm_time: '21:30',
          eway_sync_threshold: 50000,
          financial_year: '',
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/settings', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const settingsId = userMobile ? 'SET-' + userMobile : 'DEFAULT';

      // Merge with what is already saved so partial updates never reset other fields
      const existing = await pool.query('SELECT * FROM app_settings WHERE id = $1 LIMIT 1', [settingsId]);
      const prev = existing.rows[0] || {};
      const b = req.body || {};
      const pick = (key: string, fallback: any) =>
        b[key] !== undefined && b[key] !== null ? b[key] : prev[key] !== undefined && prev[key] !== null ? prev[key] : fallback;

      const result = await pool.query(
        `INSERT INTO app_settings (id, user_mobile, language, currency, decimal_places, date_format, show_compliance_warnings, notifications_enabled, closing_alarm_time, eway_sync_threshold, financial_year, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (id) DO UPDATE SET
          language = EXCLUDED.language,
          currency = EXCLUDED.currency,
          decimal_places = EXCLUDED.decimal_places,
          date_format = EXCLUDED.date_format,
          show_compliance_warnings = EXCLUDED.show_compliance_warnings,
          notifications_enabled = EXCLUDED.notifications_enabled,
          closing_alarm_time = EXCLUDED.closing_alarm_time,
          eway_sync_threshold = EXCLUDED.eway_sync_threshold,
          financial_year = EXCLUDED.financial_year,
          updated_at = NOW()
         RETURNING *`,
        [
          settingsId,
          userMobile || null,
          pick('language', 'en'),
          pick('currency', '₹'),
          pick('decimal_places', 2),
          pick('date_format', 'DD/MM/YYYY'),
          pick('show_compliance_warnings', true),
          pick('notifications_enabled', false),
          pick('closing_alarm_time', '21:30'),
          pick('eway_sync_threshold', 50000),
          pick('financial_year', ''),
        ]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Daily Cash Summaries & Shop-Closure Alert Pipeline
  app.get('/api/daily-cash-summaries', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const listRes = await pool.query('SELECT * FROM daily_cash_summaries WHERE user_mobile = $1 ORDER BY created_at DESC LIMIT 60', [userMobile]);
      
      const now = new Date();
      const todayStr = getFormattedDate(now);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = getFormattedDate(yesterday);

      const isTodaySubmitted = listRes.rows.some((row: any) => row.date === todayStr);
      const isYesterdaySubmitted = listRes.rows.some((row: any) => row.date === yesterdayStr);

      const settingsRes = await pool.query('SELECT closing_alarm_time, notifications_enabled FROM app_settings WHERE (user_mobile = $1 OR id = $2) ORDER BY updated_at DESC LIMIT 1', [userMobile || '', 'DEFAULT']);
      const alarmTimeStr = settingsRes.rows[0]?.closing_alarm_time || '21:30';
      const notificationsEnabled = settingsRes.rows[0]?.notifications_enabled || false;
      const [alarmHour, alarmMin] = alarmTimeStr.split(':').map(Number);
      
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const isPastAlarmTime = (currentHour > alarmHour) || (currentHour === alarmHour && currentMin >= alarmMin);

      const isAlertActive = notificationsEnabled && !isTodaySubmitted && isPastAlarmTime;
      const previousDayOutstanding = notificationsEnabled && !isYesterdaySubmitted;

      res.json({
        summaries: listRes.rows,
        status: {
          todayDate: todayStr,
          yesterdayDate: yesterdayStr,
          isTodaySubmitted,
          isYesterdaySubmitted,
          isAlertActive,
          previousDayOutstanding,
          alarmTime: alarmTimeStr,
          isPastAlarmTime,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/daily-cash-summaries', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const {
        b2c_unbilled_sales,
        cash_in_hand,
        personal_expenses,
        notes,
        date,
        counter_sales, counter_purchases, sales_cash, sales_online, purchases_cash, purchases_online, payment_split_mode, cash_percentage,
      } = req.body;

      const reportDate = date || getFormattedDate();
      const id = 'CS-' + Date.now();

      // Calculate recorded sales if invoices exist today
      const todayInvoices = await pool.query(
        "SELECT COALESCE(SUM(grand_total), 0) as total FROM invoices WHERE date = $1 AND user_mobile = $2",
        [reportDate, userMobile]
      );
      const totalBilled = parseFloat(todayInvoices.rows[0]?.total || '0');
      const unbilled = parseFloat(b2c_unbilled_sales || '0') || 0;
      const totalRecordedSales = totalBilled + unbilled;

      // Expenses total: use the value sent by the closure form, otherwise sum that day's recorded expenses
      const expSumRes = await pool.query(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date = $1 AND user_mobile = $2',
        [reportDate, userMobile]
      );
      const computedExpenses = parseFloat(expSumRes.rows[0]?.total || '0');
      const dayExpenses =
        personal_expenses !== undefined && personal_expenses !== null && personal_expenses !== ''
          ? parseFloat(personal_expenses) || 0
          : computedExpenses;
      const noteValue = notes || 'Daily report';
      const counterSalesValue = Array.isArray(counter_sales) ? counter_sales : [];
      const counterPurchasesValue = Array.isArray(counter_purchases) ? counter_purchases : [];
      const salesCashValue = Math.max(0, Number(sales_cash) || 0);
      const salesOnlineValue = Math.max(0, Number(sales_online) || 0);
      const purchasesCashValue = Math.max(0, Number(purchases_cash) || 0);
      const purchasesOnlineValue = Math.max(0, Number(purchases_online) || 0);
      const splitModeValue = payment_split_mode === 'manual' ? 'manual' : 'percentage';
      const cashPercentageValue = Math.min(100, Math.max(0, Number(cash_percentage) || 0));
      const billedCashRes = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(paid_amount, grand_total)), 0) AS total FROM invoices WHERE date = $1 AND user_mobile = $2 AND UPPER(COALESCE(payment_mode,'')) = 'CASH'`,
        [reportDate, userMobile]
      );
      const dayCashExpensesRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date = $1 AND user_mobile = $2 AND UPPER(COALESCE(payment_mode,'')) = 'CASH'`,
        [reportDate, userMobile]
      );
      const cashValue = Math.max(0, (Number(billedCashRes.rows[0]?.total) || 0) + salesCashValue - purchasesCashValue - (Number(dayCashExpensesRes.rows[0]?.total) || 0));

      // One report per date: update if it already exists, otherwise insert
      const existing = await pool.query(
        'SELECT id FROM daily_cash_summaries WHERE date = $1 AND user_mobile = $2 ORDER BY created_at DESC LIMIT 1',
        [reportDate, userMobile]
      );

      let result;
      if (existing.rows.length > 0) {
        result = await pool.query(
          `UPDATE daily_cash_summaries
           SET b2c_unbilled_sales = $1, cash_in_hand = $2, personal_expenses = $3, total_recorded_sales = $4, notes = $5,
               counter_sales = $6::jsonb, counter_purchases = $7::jsonb, sales_cash = $8, sales_online = $9,
               purchases_cash = $10, purchases_online = $11, payment_split_mode = $12, cash_percentage = $13
           WHERE id = $14 AND user_mobile = $15
           RETURNING *`,
          [unbilled, cashValue, dayExpenses, totalRecordedSales, noteValue, JSON.stringify(counterSalesValue), JSON.stringify(counterPurchasesValue), salesCashValue, salesOnlineValue, purchasesCashValue, purchasesOnlineValue, splitModeValue, cashPercentageValue, existing.rows[0].id, userMobile]
        );
      } else {
        result = await pool.query(
          `INSERT INTO daily_cash_summaries (
            id, user_mobile, date, b2c_unbilled_sales, cash_in_hand, personal_expenses, total_recorded_sales, notes, created_by_cashier, created_at,
            counter_sales, counter_purchases, sales_cash, sales_online, purchases_cash, purchases_online, payment_split_mode, cash_percentage
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17)
          RETURNING *`,
          [id, userMobile, reportDate, unbilled, cashValue, dayExpenses, totalRecordedSales, noteValue, getCashierName(req), JSON.stringify(counterSalesValue), JSON.stringify(counterPurchasesValue), salesCashValue, salesOnlineValue, purchasesCashValue, purchasesOnlineValue, splitModeValue, cashPercentageValue]
        );
      }

      // Post the daily unbilled counter totals to the accounting journal. The journal
      // entry ID is deterministic per summary, so re-saving the same date replaces
      // the previous posting instead of creating duplicate ledger entries.
      const savedSummary = result.rows[0];
      const dailyJournalId = `JE-DAILY-${savedSummary.id}`;
      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
      const normalizedEntries = (items: any[]) => {
        const groups = new Map<number, number>();
        for (const item of items) {
          const gross = Math.max(0, Number(item?.amount) || 0);
          const rate = Math.max(0, Math.min(100, Number(item?.gst_rate ?? item?.gstRate) || 0));
          if (gross > 0) groups.set(rate, (groups.get(rate) || 0) + gross);
        }
        return [...groups.entries()].map(([rate, gross]) => {
          const taxable = round2(gross / (1 + rate / 100));
          return { rate, gross: round2(gross), taxable, tax: round2(gross - taxable) };
        });
      };
      const makeDailyLines = (kind: 'SALE' | 'PURCHASE', items: any[], cash: number, online: number) => {
        const grouped = normalizedEntries(items);
        const grossTotal = round2(grouped.reduce((sum, item) => sum + item.gross, 0));
        // Keep entries balanced even if a legacy summary has incomplete payment split.
        const cashAmount = round2(Math.min(grossTotal, Math.max(0, cash)));
        const bankAmount = round2(Math.max(0, grossTotal - cashAmount));
        const lines: any[] = [];
        if (kind === 'SALE') {
          if (cashAmount > 0) lines.push({ account: 'Cash in Hand (Galla/Drawer)', debit: cashAmount, credit: 0 });
          if (bankAmount > 0) lines.push({ account: 'Bank Account', debit: bankAmount, credit: 0 });
          for (const item of grouped) {
            if (item.taxable > 0) lines.push({ account: 'B2C Daily Counter Sales', debit: 0, credit: item.taxable });
            if (item.tax > 0) {
              lines.push({ account: 'Output Tax Liability - CGST', debit: 0, credit: round2(item.tax / 2) });
              lines.push({ account: 'Output Tax Liability - SGST', debit: 0, credit: round2(item.tax - round2(item.tax / 2)) });
            }
          }
          const lineTotal = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
          const creditTotal = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
          if (Math.abs(lineTotal - creditTotal) > 0.01) {
            const delta = round2(lineTotal - creditTotal);
            if (delta > 0) lines.push({ account: 'B2C Daily Counter Sales', debit: 0, credit: delta });
            else lines.push({ account: 'Cash in Hand (Galla/Drawer)', debit: Math.abs(delta), credit: 0 });
          }
        } else {
          if (cashAmount > 0) lines.push({ account: 'Cash in Hand (Galla/Drawer)', debit: 0, credit: cashAmount });
          if (bankAmount > 0) lines.push({ account: 'Bank Account', debit: 0, credit: bankAmount });
          for (const item of grouped) {
            if (item.taxable > 0) lines.push({ account: 'B2C Daily Counter Purchases', debit: item.taxable, credit: 0 });
            if (item.tax > 0) {
              lines.push({ account: 'Input Tax Credit - CGST', debit: round2(item.tax / 2), credit: 0 });
              lines.push({ account: 'Input Tax Credit - SGST', debit: round2(item.tax - round2(item.tax / 2)), credit: 0 });
            }
          }
          const debitTotal = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
          const creditTotal = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
          if (Math.abs(debitTotal - creditTotal) > 0.01) {
            const delta = round2(debitTotal - creditTotal);
            if (delta > 0) lines.push({ account: 'Cash in Hand (Galla/Drawer)', debit: 0, credit: delta });
            else lines.push({ account: 'B2C Daily Counter Purchases', debit: Math.abs(delta), credit: 0 });
          }
        }
        return lines;
      };
      const dailySalesLines = makeDailyLines('SALE', counterSalesValue, salesCashValue, salesOnlineValue);
      const dailyPurchaseLines = makeDailyLines('PURCHASE', counterPurchasesValue, purchasesCashValue, purchasesOnlineValue);
      const dailyLines = [...dailySalesLines, ...dailyPurchaseLines];
      if (dailyLines.length) {
        const dr = round2(dailyLines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
        const cr = round2(dailyLines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
        if (Math.abs(dr - cr) > 0.02) throw new Error(`Daily report accounting entry is not balanced (debit ${dr}, credit ${cr}).`);
        await pool.query(
          `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
           VALUES ($1,$2,$3,'JOURNAL',$4,$5,$6::jsonb,$7,NOW())
           ON CONFLICT (id) DO UPDATE SET date=EXCLUDED.date, narration=EXCLUDED.narration, lines=EXCLUDED.lines, created_at=NOW()`,
          [dailyJournalId, `JV-DAILY-${savedSummary.id}`, reportDate, String(savedSummary.id), `Daily Report ${reportDate}: unbilled B2C sales and purchases`, JSON.stringify(dailyLines), userMobile]
        );
      } else {
        await pool.query('DELETE FROM journal_entries WHERE id=$1 AND user_mobile=$2', [dailyJournalId, userMobile]);
      }

      res.status(201).json({ ...savedSummary, accounting_posted: dailyLines.length > 0, accounting_entry_id: dailyLines.length ? dailyJournalId : null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Parties & Ledgers (You Get / You Give)
  app.get('/api/parties', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) {
        return res.json({ parties: [], youGet: [], youGive: [], totalGet: 0, totalGive: 0 });
      }

      const result = await pool.query('SELECT * FROM parties WHERE user_mobile = $1 ORDER BY name ASC', [userMobile]);
      const cashierDevice = Boolean(req.headers['x-cashier-device']);
      const parties = cashierDevice
        ? result.rows.map((p: any) => ({ ...p, opening_balance: 0, current_balance: 0, balance_numeric: 0 }))
        : result.rows;

      const youGet = cashierDevice ? [] : parties
        .filter((p: any) => parseFloat(p.current_balance) > 0 || p.type === 'CUSTOMER')
        .map((p: any) => ({
          ...p,
          balance_numeric: Math.abs(parseFloat(p.current_balance || '0')),
        }));

      const youGive = cashierDevice ? [] : parties
        .filter((p: any) => parseFloat(p.current_balance) < 0 || p.type === 'SUPPLIER')
        .map((p: any) => ({
          ...p,
          balance_numeric: Math.abs(parseFloat(p.current_balance || '0')),
        }));

      const totalGet = youGet.reduce((sum: number, p: any) => sum + p.balance_numeric, 0);
      const totalGive = youGive.reduce((sum: number, p: any) => sum + p.balance_numeric, 0);

      res.json({
        parties,
        youGet,
        youGive,
        totalGet,
        totalGive,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/parties', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      const {
        name,
        contact_person,
        phone,
        email,
        gstin,
        type,
        billing_address,
        city,
        state,
        state_code,
        pincode,
        opening_balance,
        balance_type,
      } = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Party name is required.' });
      }

      // The same party (same name with same phone, or same GSTIN) is never saved twice for one account
      const cleanPartyName = String(name).trim();
      const cleanPartyPhone = String(phone || '').trim();
      const cleanPartyGstin = String(gstin || '').trim().toUpperCase();
      const dupParty = await pool.query(
        `SELECT id, name FROM parties
         WHERE user_mobile = $1
           AND ( (lower(name) = lower($2) AND COALESCE(phone, '') = $3)
              OR ($4 <> '' AND upper(COALESCE(gstin, '')) = $4) )
         LIMIT 1`,
        [userMobile, cleanPartyName, cleanPartyPhone, cleanPartyGstin]
      );
      if (dupParty.rows.length > 0) {
        return res.status(409).json({ error: `Party "${dupParty.rows[0].name}" already exists.` });
      }

      // Unique id (the old 4-digit id could collide)
      const id = 'P-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      let numericBal = parseFloat(opening_balance || '0');
      if (balance_type === 'YOU_GIVE' && numericBal > 0) {
        numericBal = -numericBal;
      }

      const result = await pool.query(
        `INSERT INTO parties (
          id, user_mobile, name, contact_person, phone, email, gstin, type, billing_address,
          city, state, state_code, pincode, opening_balance, current_balance, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        RETURNING *`,
        [
          id,
          userMobile,
          cleanPartyName,
          contact_person || '',
          phone || '',
          email || '',
          gstin || '',
          type || 'CUSTOMER',
          billing_address || '',
          city || 'Delhi',
          state ?? null,
          state_code ?? null,
          pincode || '',
          numericBal,
          numericBal,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Automated Progressive Party Entity Generation Engine (Part 4 requirement)
  async function ensurePartyRecord(params: {
    userMobile: string;
    partyName: string;
    phone?: string;
    gstin?: string;
    state?: string;
    stateCode?: string;
    type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
    balanceDelta?: number;
    db?: any;
    strict?: boolean;
  }) {
    const { userMobile, partyName, phone, gstin, state, stateCode, type = 'CUSTOMER', balanceDelta = 0, strict = false } = params;
    const db = params.db || pool;
    if (!partyName || !partyName.trim() || partyName.toLowerCase() === 'retail cash customer' || partyName.toLowerCase() === 'walk-in') {
      return null;
    }
    const cleanName = partyName.trim();
    try {
      const existing = await db.query(
        'SELECT id, current_balance, type FROM parties WHERE user_mobile = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1',
        [userMobile, cleanName]
      );
      if (existing.rows.length > 0) {
        const party = existing.rows[0];
        if (balanceDelta !== 0) {
          await db.query(
            'UPDATE parties SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
            [balanceDelta, party.id]
          );
        }
        return party.id;
      } else {
        const newPartyId = 'PTY-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        await db.query(
          `INSERT INTO parties (
            id, user_mobile, name, phone, gstin, type, state, state_code, opening_balance, current_balance, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, NOW())
          ON CONFLICT (id) DO NOTHING`,
          [
            newPartyId,
            userMobile,
            cleanName,
            phone || '',
            gstin || '',
            type,
            state || 'Uttar Pradesh',
            stateCode || '09',
            balanceDelta,
          ]
        );
        return newPartyId;
      }
    } catch (err: any) {
      if (strict) throw err;
      console.warn('Auto progressive party generation notice:', err.message);
      return null;
    }
  }

  // 6. Invoices & Cash Memos
  app.get('/api/invoices', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const params: any[] = [userMobile];
      let sql = 'SELECT * FROM invoices WHERE user_mobile = $1';
      const from = String(req.query.from || '').trim(); const to = String(req.query.to || '').trim();
      if (from) { params.push(from); sql += ` AND (CASE WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN date::date ELSE TO_DATE(date, 'DD/MM/YYYY') END) >= $${params.length}::date`; }
      if (to) { params.push(to); sql += ` AND (CASE WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN date::date ELSE TO_DATE(date, 'DD/MM/YYYY') END) <= $${params.length}::date`; }
      sql += ' ORDER BY created_at DESC';
      const result = await pool.query(sql, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/invoices', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const {
        type = 'TAX_INVOICE', invoice_classification = 'B2B', invoice_number, date, due_date,
        party_id, party_name, party_gstin, party_phone, party_address, party_state, party_state_code,
        place_of_supply, is_inter_state, is_reverse_charge, items, sub_total, cgst_total, sgst_total,
        igst_total, round_off, grand_total, paid_amount, balance_amount, payment_mode, payment_status,
        notes, party_pincode, total_purchase_cost,
      } = req.body || {};
      const amount = {
        subtotal: Number(sub_total ?? 0), cgst: Number(cgst_total ?? 0), sgst: Number(sgst_total ?? 0),
        igst: Number(igst_total ?? 0), round: Number(round_off ?? 0), total: Number(grand_total ?? 0),
        cost: Number(total_purchase_cost ?? 0),
      };
      if (Object.values(amount).some((value) => !Number.isFinite(value)) || amount.subtotal < 0 || amount.cgst < 0 || amount.sgst < 0 || amount.igst < 0 || amount.total < 0 || amount.cost < 0) {
        return res.status(400).json({ error: 'Invoice amounts must be valid numbers and cannot be negative.' });
      }
      if (Math.abs(amount.total - (amount.subtotal + amount.cgst + amount.sgst + amount.igst + amount.round)) > 1.01) {
        return res.status(400).json({ error: 'Invoice total does not match taxable value, GST, and round-off.' });
      }
      if (items !== undefined && !Array.isArray(items)) return res.status(400).json({ error: 'Invoice items must be a list.' });
      const requestedPaid = Number(paid_amount ?? (String(payment_status || '').toUpperCase() === 'PAID' ? amount.total : 0));
      if (!Number.isFinite(requestedPaid) || requestedPaid < 0) return res.status(400).json({ error: 'Paid amount must be a valid non-negative number.' });
      const salePaid = Math.min(amount.total, requestedPaid);
      const saleDue = Math.max(0, amount.total - salePaid);
      const effectiveStatus = saleDue <= 0.009 ? 'PAID' : salePaid > 0 ? 'PARTIAL' : 'UNPAID';
      const invoiceDate = String(date || getFormattedDate());
      const finalInvNo = String(invoice_number || '').trim();
      const id = 'INV-' + crypto.randomUUID();
      const saleMode = String(payment_mode || 'CASH').toUpperCase();
      const isBankSale = ['BANK', 'BANK/UPI', 'BANK/ A/C / UPI', 'CHEQUE', 'CHECK', 'UPI', 'BANK A/C / UPI'].includes(saleMode) || saleMode.includes('BANK') || saleMode.includes('UPI') || saleMode.includes('CHEQUE') || saleMode.includes('CHECK');
      await client.query('BEGIN');
      // Serialize invoice-number allocation per tenant to avoid concurrent duplicate numbers.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invoice:${userMobile}`]);
      let chosenInvoiceNo = finalInvNo;
      if (!chosenInvoiceNo) {
        const countRes = await client.query('SELECT count(*) FROM invoices WHERE user_mobile=$1', [userMobile]);
        chosenInvoiceNo = `INV/${new Date().getFullYear()}/${String(Number.parseInt(countRes.rows[0]?.count || '0', 10) + 1).padStart(3, '0')}`;
      }
      const duplicate = await client.query('SELECT id FROM invoices WHERE user_mobile=$1 AND invoice_number=$2 LIMIT 1', [userMobile, chosenInvoiceNo]);
      if (duplicate.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Invoice number ${chosenInvoiceNo} already exists. Please use a different number.` });
      }
      const result = await client.query(
        `INSERT INTO invoices (
          id,user_mobile,type,invoice_classification,invoice_number,date,due_date,party_id,party_name,party_gstin,
          party_phone,party_address,party_pincode,party_state,party_state_code,place_of_supply,is_inter_state,
          is_reverse_charge,items,sub_total,cgst_total,sgst_total,igst_total,round_off,grand_total,paid_amount,
          balance_amount,payment_mode,payment_status,total_purchase_cost,notes,created_by_cashier,created_at,updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW(),NOW()
        ) RETURNING *`,
        [id,userMobile,type,invoice_classification || 'B2B',chosenInvoiceNo,invoiceDate,due_date || invoiceDate,party_id || 'CASH_CUSTOMER',
          party_name || 'Retail Cash Customer',party_gstin || '',party_phone || '',party_address || '',party_pincode || '',party_state ?? null,
          party_state_code ?? null,place_of_supply || '07-Delhi',is_inter_state === true || String(is_inter_state).toLowerCase() === 'true',
          is_reverse_charge === true || String(is_reverse_charge).toLowerCase() === 'true',JSON.stringify(items || []),amount.subtotal,amount.cgst,amount.sgst,
          amount.igst,amount.round,amount.total,salePaid,saleDue,saleMode,effectiveStatus,amount.cost,notes || '',getCashierName(req)]
      );
      const soldLines = new Map<string, { name: string; quantity: number }>();
      for (const item of (Array.isArray(items) ? items : [])) {
        const itemName = String(item?.name || item?.item_name || item?.title || '').trim();
        const normalizedName = itemName.toLowerCase();
        const quantity = Number(item?.qty ?? item?.quantity ?? 0);
        if (!itemName || !Number.isFinite(quantity) || quantity <= 0) continue;
        const existing = soldLines.get(normalizedName) || { name: itemName, quantity: 0 };
        existing.quantity += quantity;
        soldLines.set(normalizedName, existing);
      }
      for (const [normalizedName, line] of soldLines) {
        const inventoryRes = await client.query('SELECT id,quantity_on_hand,average_cost FROM inventory_items WHERE user_mobile=$1 AND normalized_name=$2 FOR UPDATE', [userMobile,normalizedName]);
        if (!inventoryRes.rows.length) continue; // Service or non-tracked invoice line.
        const stock = Number(inventoryRes.rows[0].quantity_on_hand || 0);
        if (stock < line.quantity) throw new Error(`Insufficient inventory for ${line.name}. Available: ${stock}, requested: ${line.quantity}.`);
        await client.query('UPDATE inventory_items SET quantity_on_hand=quantity_on_hand-$1,updated_at=NOW() WHERE id=$2 AND user_mobile=$3', [line.quantity,inventoryRes.rows[0].id,userMobile]);
        await client.query(
          `INSERT INTO inventory_movements (id,user_mobile,inventory_item_id,source_type,source_id,quantity_delta,unit_cost,created_at)
           VALUES ($1,$2,$3,'SALE',$4,$5,$6,NOW())`,
          [`INVMOVE-${crypto.randomUUID()}`,userMobile,inventoryRes.rows[0].id,id,-line.quantity,Number(inventoryRes.rows[0].average_cost || 0)]
        );
      }
      const jeLines: any[] = [];
      if (salePaid > 0) jeLines.push({ account: isBankSale ? 'Bank Account' : 'Cash Account', debit: salePaid, credit: 0 });
      if (saleDue > 0) jeLines.push({ account: party_name ? `Debtor: ${party_name}` : 'Accounts Receivable', debit: saleDue, credit: 0 });
      if (amount.subtotal > 0) jeLines.push({ account: 'B2B/B2C Sales Revenue Account', debit: 0, credit: amount.subtotal });
      if (amount.cgst > 0) jeLines.push({ account: 'Output Tax Liability - CGST', debit: 0, credit: amount.cgst });
      if (amount.sgst > 0) jeLines.push({ account: 'Output Tax Liability - SGST', debit: 0, credit: amount.sgst });
      if (amount.igst > 0) jeLines.push({ account: 'Output Tax Liability - IGST', debit: 0, credit: amount.igst });
      if (amount.round > 0) jeLines.push({ account: 'Round Off Account', debit: 0, credit: amount.round });
      else if (amount.round < 0) jeLines.push({ account: 'Round Off Account', debit: Math.abs(amount.round), credit: 0 });
      const debitSum = jeLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const creditSum = jeLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      if (Math.abs(debitSum - creditSum) > 0.05) throw new Error('Invoice journal is not balanced; the invoice was not saved.');
      await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,'SALES',$4,$5,$6,$7,NOW())`,
        [`JE-${id}`,`JV-SALE-${id}`,invoiceDate,chosenInvoiceNo,`Sales Tax Invoice issued to ${party_name || 'Walk-in'}`,JSON.stringify(jeLines),userMobile]
      );
      if (salePaid > 0 && isBankSale) await client.query(
        `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
         VALUES ($1,$2,$3,$3,$4,$5,0,$6,'UNRECONCILED','APP_ENTRY',NOW())`,
        [`BRS-SALE-${id}`,userMobile,invoiceDate,`Sales receipt ${chosenInvoiceNo} - ${party_name || 'Customer'}`,String(notes || ''),salePaid]
      );
      await client.query(
        `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
         VALUES ($1,'invoices',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`,id,userMobile,JSON.stringify({ invoice_number: chosenInvoiceNo, grand_total: amount.total, party_name, date: invoiceDate })]
      );
      if (party_name) await ensurePartyRecord({ userMobile, partyName: String(party_name), phone: party_phone, gstin: party_gstin, state: party_state, stateCode: party_state_code, type: 'CUSTOMER', balanceDelta: saleDue, db: client, strict: true });
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to save invoice and accounting entries.' });
    } finally { client.release(); }
  });

  // Delete a sales invoice and reverse every app-generated accounting/stock effect atomically.
  app.delete('/api/invoices/:id', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM invoices WHERE id=$1 AND user_mobile=$2 FOR UPDATE', [req.params.id, userMobile]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found.' }); }
      const invoice = found.rows[0];
      const movements = await client.query(`SELECT inventory_item_id, SUM(quantity_delta) AS delta FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2 GROUP BY inventory_item_id`, [userMobile, invoice.id]);
      for (const movement of movements.rows) {
        await client.query(`UPDATE inventory_items SET quantity_on_hand=quantity_on_hand-$1, updated_at=NOW() WHERE id=$2 AND user_mobile=$3`, [Number(movement.delta || 0), movement.inventory_item_id, userMobile]);
      }
      await client.query('DELETE FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2', [userMobile, invoice.id]);
      await client.query('DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2', [userMobile, `JE-${invoice.id}`]);
      await client.query(`DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'`, [userMobile, `BRS-SALE-${invoice.id}`]);
      const due = Math.max(0, Number(invoice.balance_amount || 0));
      if (due > 0 && invoice.party_name) {
        await client.query(`UPDATE parties SET current_balance=COALESCE(current_balance,0)-$1 WHERE user_mobile=$2 AND (id=$3 OR LOWER(TRIM(name))=LOWER(TRIM($4)))`, [due, userMobile, invoice.party_id || '', invoice.party_name]);
      }
      await client.query(`INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES ($1,'invoices',$2,'DELETE',$3,NOW(),$4)`, [`AEL-${crypto.randomUUID()}`, invoice.id, userMobile, JSON.stringify({ invoice_number: invoice.invoice_number, grand_total: invoice.grand_total })]);
      await client.query('DELETE FROM invoices WHERE id=$1 AND user_mobile=$2', [invoice.id, userMobile]);
      await client.query('COMMIT');
      res.json({ success: true, message: 'Invoice, journal, bank entry, and stock movements were deleted atomically.' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to delete invoice safely.' });
    } finally { client.release(); }
  });

  // Settings: tenant-scoped records manager with date/search filtering.
  app.get('/api/records/manage', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const type = String(req.query.type || 'sales');
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const q = String(req.query.q || '').trim().slice(0, 120);
    const config: Record<string, { table: string; date: string; search: string[]; title: string; amount: string }> = {
      sales: { table: 'invoices', date: 'date', search: ['invoice_number','party_name','party_phone'], title: 'invoice_number', amount: 'grand_total' },
      purchases: { table: 'purchases', date: 'date', search: ['supplier_name','supplier_invoice_no','supplier_gstin'], title: 'supplier_invoice_no', amount: 'grand_total' },
      expenses: { table: 'expenses', date: 'date', search: ['expense_no','title','category','paid_to'], title: 'expense_no', amount: 'amount' },
    };
    const cfg = config[type];
    if (!cfg) return res.status(400).json({ error: 'Unsupported record type.' });
    try {
      const params: any[] = [userMobile];
      let where = 'user_mobile=$1';
      if (from) { params.push(from); where += ` AND ${cfg.date}::date >= $${params.length}::date`; }
      if (to) { params.push(to); where += ` AND ${cfg.date}::date <= $${params.length}::date`; }
      if (q) {
        params.push(`%${q}%`);
        const n = params.length;
        where += ` AND (${cfg.search.map(c => `COALESCE(${c}::text,'') ILIKE $${n}`).join(' OR ')})`;
      }
      const result = await pool.query(`SELECT *, ${cfg.date} AS date, ${cfg.title} AS title, ${cfg.amount} AS amount FROM ${cfg.table} WHERE ${where} ORDER BY ${cfg.date} DESC NULLS LAST, id DESC LIMIT 500`, params);
      res.json({ records: result.rows, limit: 500 });
    } catch (err: any) { res.status(500).json({ error: 'Unable to load records.', detail: err.message }); }
  });

  // Update descriptive/date fields only; financial totals are intentionally not editable here
  // because changing them without a full tax/stock re-post would corrupt the general ledger.
  app.patch('/api/records/manage/:type/:id', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const config: Record<string, { table: string; fields: Record<string,string>; journalType: string }> = {
      sales: { table: 'invoices', journalType: 'SALES', fields: { date:'date', due_date:'due_date', invoice_number:'invoice_number', party_name:'party_name', party_phone:'party_phone', party_gstin:'party_gstin', party_address:'party_address', notes:'notes' } },
      purchases: { table: 'purchases', journalType: 'PURCHASE', fields: { date:'date', supplier_name:'supplier_name', supplier_invoice_no:'supplier_invoice_no', supplier_gstin:'supplier_gstin', supplier_phone:'supplier_phone', notes:'notes' } },
      expenses: { table: 'expenses', journalType: 'JOURNAL', fields: { date:'date', expense_no:'expense_no', category:'category', title:'title', paid_to:'paid_to', notes:'notes' } },
    };
    const cfg = config[String(req.params.type)];
    if (!cfg) return res.status(400).json({ error: 'Unsupported record type.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = Object.entries(body).filter(([key, value]) => cfg.fields[key] && value !== undefined).map(([key, value]) => [cfg.fields[key], value]);
    if (!updates.length) return res.status(400).json({ error: 'No supported fields to update. Amounts and tax values must be edited through the full transaction editor.' });
    if (updates.some(([key, value]) => key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value)))) return res.status(400).json({ error: 'Date must use YYYY-MM-DD.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const old = await client.query(`SELECT * FROM ${cfg.table} WHERE id=$1 AND user_mobile=$2 FOR UPDATE`, [req.params.id, userMobile]);
      if (!old.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Record not found.' }); }
      const uniqueField = req.params.type === 'sales' ? 'invoice_number' : req.params.type === 'purchases' ? 'supplier_invoice_no' : 'expense_no';
      const uniqueUpdate = updates.find(([column]) => column === uniqueField);
      if (uniqueUpdate && String(uniqueUpdate[1] || '').trim()) {
        const duplicate = await client.query(`SELECT id FROM ${cfg.table} WHERE user_mobile=$1 AND LOWER(TRIM(${uniqueField}))=LOWER(TRIM($2)) AND id<>$3 LIMIT 1`, [userMobile, String(uniqueUpdate[1]), req.params.id]);
        if (duplicate.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'That record number is already in use.' }); }
      }
      const sets = updates.map(([column], i) => `${column}=$${i+3}`);
      const vals = updates.map(([,value]) => value === null ? null : String(value));
      const updated = await client.query(`UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id=$1 AND user_mobile=$2 RETURNING *`, [req.params.id, userMobile, ...vals]);
      const changed = Object.fromEntries(updates.map(([column], i) => [column, vals[i]]));
      if (changed.date) { await client.query('UPDATE journal_entries SET date=$1 WHERE id=$2 AND user_mobile=$3', [changed.date, `JE-${req.params.id}`, userMobile]); const bankId = req.params.type === 'sales' ? `BRS-SALE-${req.params.id}` : req.params.type === 'purchases' ? `BRS-PUR-${req.params.id}` : `BRS-EXP-${req.params.id}`; await client.query('UPDATE bank_statement_records SET statement_date=$1, value_date=COALESCE(value_date,$1) WHERE id=$2 AND user_mobile=$3 AND record_source=\'APP_ENTRY\'', [changed.date, bankId, userMobile]); }
      if (changed.title || changed.party_name || changed.supplier_name || changed.invoice_number || changed.supplier_invoice_no) {
        const label = changed.title || changed.party_name || changed.supplier_name || changed.invoice_number || changed.supplier_invoice_no;
        await client.query('UPDATE journal_entries SET narration=$1 WHERE id=$2 AND user_mobile=$3', [`Updated ${cfg.journalType.toLowerCase()} record: ${label}`, `JE-${req.params.id}`, userMobile]);
      }
      await client.query(`INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES ($1,$2,$3,'EDIT',$4,NOW(),$5)`, [`AEL-${crypto.randomUUID()}`, cfg.table, req.params.id, userMobile, JSON.stringify({ before: old.rows[0], after: updated.rows[0] })]);
      await client.query('COMMIT');
      res.json({ success: true, record: updated.rows[0] });
    } catch (err: any) { await client.query('ROLLBACK').catch(()=>{}); res.status(500).json({ error: err.message || 'Unable to update record safely.' }); }
    finally { client.release(); }
  });

  // Atomic tenant-scoped bulk deletion. Every selected record and its linked
  // accounting/stock effects commit together or the whole batch is rolled back.
  app.post('/api/records/manage/bulk-delete', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const type = String(req.body?.type || '');
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map((id: unknown) => String(id).trim()).filter(Boolean))] : [];
    const tableByType: Record<string,string> = { sales: 'invoices', purchases: 'purchases', expenses: 'expenses' };
    const table = tableByType[type];
    if (!table) return res.status(400).json({ error: 'Unsupported record type.' });
    if (!ids.length || ids.length > 100) return res.status(400).json({ error: 'Select between 1 and 100 records.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock and validate all records before changing anything. This prevents a
      // mixed-owner or partially missing batch from producing a partial delete.
      const found = await client.query(`SELECT id FROM ${table} WHERE user_mobile=$1 AND id = ANY($2::text[]) FOR UPDATE`, [userMobile, ids]);
      const foundIds = new Set(found.rows.map((r:any) => String(r.id)));
      const missing = ids.filter(id => !foundIds.has(id));
      if (missing.length) throw new Error(`Record not found or access denied: ${missing.slice(0,5).join(', ')}`);
      for (const id of ids) {
        if (type === 'sales') {
          const inv = (await client.query('SELECT * FROM invoices WHERE id=$1 AND user_mobile=$2 FOR UPDATE', [id,userMobile])).rows[0];
          const moves = await client.query('SELECT inventory_item_id,SUM(quantity_delta) delta FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2 GROUP BY inventory_item_id', [userMobile,id]);
          for (const m of moves.rows) await client.query('UPDATE inventory_items SET quantity_on_hand=quantity_on_hand-($1),updated_at=NOW() WHERE id=$2 AND user_mobile=$3', [Number(m.delta||0),m.inventory_item_id,userMobile]);
          await client.query('DELETE FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2',[userMobile,id]);
          await client.query('DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2',[userMobile,`JE-${id}`]);
          await client.query("DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'",[userMobile,`BRS-SALE-${id}`]);
          if (Number(inv.balance_amount||0)>0 && inv.party_name) await client.query('UPDATE parties SET current_balance=COALESCE(current_balance,0)-$1 WHERE user_mobile=$2 AND (id=$3 OR LOWER(TRIM(name))=LOWER(TRIM($4)))',[Number(inv.balance_amount),userMobile,inv.party_id||'',inv.party_name]);
        } else if (type === 'purchases') {
          const pur = (await client.query('SELECT * FROM purchases WHERE id=$1 AND user_mobile=$2 FOR UPDATE',[id,userMobile])).rows[0];
          const moves = await client.query('SELECT inventory_item_id,SUM(quantity_delta) delta FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2 GROUP BY inventory_item_id',[userMobile,id]);
          for (const m of moves.rows) {
            const stock=(await client.query('SELECT quantity_on_hand FROM inventory_items WHERE id=$1 AND user_mobile=$2 FOR UPDATE',[m.inventory_item_id,userMobile])).rows[0];
            if (stock && Number(stock.quantity_on_hand||0)-Number(m.delta||0)<-0.0001) throw new Error(`Purchase ${id} stock has been consumed; delete related sales first.`);
            await client.query('UPDATE inventory_items SET quantity_on_hand=GREATEST(0,quantity_on_hand-$1),updated_at=NOW() WHERE id=$2 AND user_mobile=$3',[Number(m.delta||0),m.inventory_item_id,userMobile]);
          }
          await client.query('DELETE FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2',[userMobile,id]);
          await client.query('DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2',[userMobile,`JE-${id}`]);
          await client.query("DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'",[userMobile,`BRS-PUR-${id}`]);
          const unpaid=Math.max(0,Number(pur.grand_total||0)-Number(pur.paid_amount||0));
          if(unpaid>0&&pur.supplier_name) await client.query('UPDATE parties SET current_balance=COALESCE(current_balance,0)+$1 WHERE user_mobile=$2 AND (id=$3 OR LOWER(TRIM(name))=LOWER(TRIM($4)))',[unpaid,userMobile,pur.supplier_id||'',pur.supplier_name]);
        } else {
          await client.query('DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2',[userMobile,`JE-${id}`]);
          await client.query("DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'",[userMobile,`BRS-EXP-${id}`]);
        }
        await client.query(`INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES ($1,$2,$3,'DELETE',$4,NOW(),$5)`,[`AEL-${crypto.randomUUID()}`,table,id,userMobile,JSON.stringify({source:'settings_bulk_delete',batch_size:ids.length})]);
        await client.query(`DELETE FROM ${table} WHERE id=$1 AND user_mobile=$2`,[id,userMobile]);
      }
      await client.query('COMMIT');
      res.json({ success: true, results: ids.map(id=>({id,success:true})), deleted: ids.length, failed: 0, atomic: true });
    } catch (e:any) {
      await client.query('ROLLBACK').catch(()=>{});
      res.status(409).json({ success:false, error:e.message||'Bulk delete failed; no records were deleted.', deleted:0, failed:ids.length, atomic:true });
    } finally { client.release(); }
  });

  // Quotations / Estimates API
  app.get('/api/quotations', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query('SELECT * FROM quotations WHERE user_mobile = $1 ORDER BY created_at DESC', [userMobile]);
      res.json(result.rows || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quotations', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const {
        quotation_number,
        date,
        valid_until,
        party_id,
        party_name,
        party_phone,
        party_gstin,
        party_address,
        party_state,
        party_state_code,
        place_of_supply,
        items,
        sub_total,
        cgst_total,
        sgst_total,
        igst_total,
        round_off,
        grand_total,
        notes,
      } = req.body;

      const id = 'QUO-' + Date.now();
      const finalQuoNo = quotation_number || `EST-${Math.floor(100 + Math.random() * 900)}`;

      const result = await pool.query(
        `INSERT INTO quotations (
          id, user_mobile, quotation_number, date, valid_until, party_id,
          party_name, party_phone, party_gstin, party_address, party_state, party_state_code,
          place_of_supply, items, sub_total, cgst_total, sgst_total, igst_total,
          round_off, grand_total, notes, status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, 'OPEN', NOW()
        ) RETURNING *`,
        [
          id,
          userMobile,
          finalQuoNo,
          date || getFormattedDate(),
          valid_until || date || getFormattedDate(),
          party_id || 'CASH_CUSTOMER',
          party_name || 'Customer',
          party_phone || '',
          party_gstin || '',
          party_address || '',
          party_state ?? null,
          party_state_code ?? null,
          place_of_supply || '07-Delhi',
          JSON.stringify(items || []),
          parseFloat(sub_total || '0'),
          parseFloat(cgst_total || '0'),
          parseFloat(sgst_total || '0'),
          parseFloat(igst_total || '0'),
          parseFloat(round_off || '0'),
          parseFloat(grand_total || '0'),
          notes || '',
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quotations/:id/convert', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const { id } = req.params;

      const quoRes = await pool.query('SELECT * FROM quotations WHERE id = $1', [id]);
      if (quoRes.rows.length === 0) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

      const q = quoRes.rows[0];

      // Generate invoice number
      const countRes = await pool.query(
        userMobile
          ? 'SELECT count(*) FROM invoices WHERE user_mobile = $1'
          : 'SELECT count(*) FROM invoices',
        userMobile ? [userMobile] : []
      );
      const invoiceSeq = parseInt(countRes.rows[0]?.count || '0') + 1;
      const invNumber = `INV-${String(invoiceSeq).padStart(3, '0')}`;
      const invId = 'INV-' + Date.now();
      const invDate = getFormattedDate();

      // Insert into invoices
      const invResult = await pool.query(
        `INSERT INTO invoices (
          id, user_mobile, type, invoice_number, date, due_date, party_id,
          party_name, party_gstin, party_phone, party_state, party_state_code,
          place_of_supply, is_inter_state, is_reverse_charge, items, sub_total,
          cgst_total, sgst_total, igst_total, round_off, grand_total,
          paid_amount, balance_amount, payment_mode, payment_status, notes,
          created_at, updated_at
        ) VALUES (
          $1, $2, 'TAX_INVOICE', $3, $4, $4, $5, $6, $7, $8, $9, $10,
          $11, false, false, $12, $13, $14, $15, $16, $17, $18,
          0.00, $18, 'CREDIT', 'UNPAID', $19, NOW(), NOW()
        ) RETURNING *`,
        [
          invId,
          q.user_mobile,
          invNumber,
          invDate,
          q.party_id || 'CASH_CUSTOMER',
          q.party_name,
          q.party_gstin || '',
          q.party_phone || '',
          q.party_state ?? null,
          q.party_state_code ?? null,
          q.place_of_supply || '07-Delhi',
          typeof q.items === 'string' ? q.items : JSON.stringify(q.items || []),
          q.sub_total,
          q.cgst_total,
          q.sgst_total,
          q.igst_total,
          q.round_off,
          q.grand_total,
          `Converted from Quotation #${q.quotation_number}`,
        ]
      );

      // Update party balance if credit customer
      if (q.party_id && q.party_id !== 'CASH_CUSTOMER') {
        await pool.query(
          `UPDATE parties SET current_balance = current_balance + $1 WHERE id = $2`,
          [parseFloat(q.grand_total || '0'), q.party_id]
        );
      }

      // Update quotation status to CONVERTED
      await pool.query(
        `UPDATE quotations SET status = 'CONVERTED', converted_invoice_id = $1 WHERE id = $2`,
        [invId, id]
      );

      res.json({
        success: true,
        message: 'Quotation converted to Tax Invoice successfully',
        invoice: invResult.rows[0],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Purchases & Expense Register
  app.get('/api/purchases', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const params: any[] = [userMobile]; let sql = 'SELECT * FROM purchases WHERE user_mobile = $1';
      const from = String(req.query.from || '').trim(); const to = String(req.query.to || '').trim();
      if (from) { params.push(from); sql += ` AND (CASE WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN date::date ELSE TO_DATE(date, 'DD/MM/YYYY') END) >= $${params.length}::date`; }
      if (to) { params.push(to); sql += ` AND (CASE WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN date::date ELSE TO_DATE(date, 'DD/MM/YYYY') END) <= $${params.length}::date`; }
      sql += ' ORDER BY created_at DESC'; const result = await pool.query(sql, params); res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/purchases', async (req: Request, res: Response) => {
    let client: any = null;
    let committedPurchase: any = null;
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const {
        supplier_invoice_no, invoice_classification = 'B2B', date, due_date, supplier_id,
        supplier_name, supplier_gstin, supplier_state, supplier_state_code, items,
        sub_total, cgst_total, sgst_total, igst_total, grand_total, payment_status,
        paid_amount, payment_mode, notes, raw_image_url, raw_image_base64,
        is_reverse_charge = false, rcm_applicable = false, rcm_calculated_tax = 0, rcm_tax_rate = 0,
        is_inter_state = false, gstr2b_verified = false,
      } = req.body || {};

      const amounts = {
        subtotal: Number(sub_total ?? 0), cgst: Number(cgst_total ?? 0),
        sgst: Number(sgst_total ?? 0), igst: Number(igst_total ?? 0), total: Number(grand_total ?? 0),
        rcm: Number(rcm_calculated_tax ?? 0),
      };
      const isRcmFlag = is_reverse_charge === true || rcm_applicable === true || String(is_reverse_charge).toLowerCase() === 'true' || String(rcm_applicable).toLowerCase() === 'true';
      const rcmRate = Number(rcm_tax_rate ?? 0);
      if (!Number.isFinite(rcmRate) || rcmRate < 0 || rcmRate > 100) return res.status(400).json({ error: 'RCM tax rate must be between 0 and 100.' });
      if (isRcmFlag) {
        if (rcmRate <= 0) return res.status(400).json({ error: 'Select a valid GST rate for the reverse-charge calculation.' });
        const computedRcm = Math.round((amounts.subtotal * rcmRate / 100) * 100) / 100;
        if (amounts.rcm > 0 && Math.abs(amounts.rcm - computedRcm) > 0.05) return res.status(400).json({ error: 'RCM tax does not match taxable value and selected GST rate.' });
        amounts.rcm = computedRcm;
      } else {
        amounts.rcm = 0;
      }
      if (Object.values(amounts).some((n) => !Number.isFinite(n) || n < 0)) {
        return res.status(400).json({ error: 'Purchase amounts must be valid non-negative numbers.' });
      }
      if (Math.abs(amounts.total - (amounts.subtotal + amounts.cgst + amounts.sgst + amounts.igst)) > 1.01) {
        return res.status(400).json({ error: 'Purchase total does not match taxable value plus GST. Please verify the bill amounts.' });
      }
      if (amounts.rcm > amounts.total) return res.status(400).json({ error: 'RCM tax cannot exceed the purchase total.' });
      if (items !== undefined && !Array.isArray(items)) return res.status(400).json({ error: 'Purchase items must be a list.' });

      let storedImageUrl = typeof raw_image_url === 'string' ? raw_image_url : '';
      if (raw_image_base64 && typeof raw_image_base64 === 'string' && raw_image_base64.length > 50) {
        try {
          const cleanB64 = raw_image_base64.replace(/^data:image\/\w+;base64,/, '');
          storedImageUrl = await uploadImageToCloudinary(cleanB64, 'gst_purchase_bills') || storedImageUrl;
        } catch (cloudinaryError: any) {
          console.warn('Cloudinary upload on purchase save warning:', cloudinaryError.message);
        }
      }

      const cleanInvNo = String(supplier_invoice_no || '').trim();
      const cleanSupName = String(supplier_name || '').trim();
      const cleanDate = String(date || getFormattedDate()).trim();
      const id = 'PUR-' + crypto.randomUUID();
      const safeGrandTotal = amounts.total;
      const requestedPaid = Number(paid_amount ?? (String(payment_status || '').toUpperCase() === 'PAID' ? safeGrandTotal : 0));
      if (!Number.isFinite(requestedPaid) || requestedPaid < 0) return res.status(400).json({ error: 'Paid amount must be a valid non-negative number.' });
      const effectivePaid = Math.min(safeGrandTotal, requestedPaid);
      const unpaidBalance = Math.max(0, safeGrandTotal - effectivePaid);
      const normalizedPaymentMode = String(payment_mode || 'CASH').trim().toUpperCase();
      const validModes = ['CASH', 'BANK', 'BANK/CHECK', 'CHEQUE', 'CHECK', 'UPI', 'ONLINE'];
      if (!validModes.includes(normalizedPaymentMode) && !normalizedPaymentMode.includes('BANK') && !normalizedPaymentMode.includes('UPI')) {
        return res.status(400).json({ error: 'Choose Cash or Bank/Check/UPI for purchase payments.' });
      }
      const effectivePaymentStatus = unpaidBalance <= 0.009 ? 'PAID' : effectivePaid > 0 ? 'PARTIAL' : 'UNPAID';
      const purchaseIsBank = ['BANK', 'BANK/CHECK', 'CHEQUE', 'CHECK', 'UPI', 'ONLINE'].includes(normalizedPaymentMode) || normalizedPaymentMode.includes('BANK') || normalizedPaymentMode.includes('UPI');
      const taxablePlusTax = amounts.subtotal + amounts.cgst + amounts.sgst + amounts.igst;
      const rounding = safeGrandTotal - taxablePlusTax;

      client = await pool.connect();
      await client.query('BEGIN');
      if (cleanInvNo && cleanSupName) {
        const dedupeKey = `${userMobile}|${cleanInvNo.toLowerCase()}|${cleanSupName.toLowerCase()}|${cleanDate}|${safeGrandTotal.toFixed(2)}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [dedupeKey]);
        const existing = await client.query(
          `SELECT id, supplier_invoice_no, supplier_name, date, grand_total FROM purchases WHERE user_mobile = $1`, [userMobile]
        );
        const duplicate = existing.rows.find((row: any) =>
          String(row.supplier_invoice_no || '').trim().toLowerCase() === cleanInvNo.toLowerCase() &&
          String(row.supplier_name || '').trim().toLowerCase() === cleanSupName.toLowerCase() &&
          String(row.date || '').trim() === cleanDate &&
          Math.abs(Number(row.grand_total || 0) - safeGrandTotal) < 0.5
        );
        if (duplicate) {
          await client.query('ROLLBACK');
          return res.status(409).json({ duplicate: true, error: `Duplicate entry prevented: Bill #${cleanInvNo} (${cleanSupName}, ${cleanDate}, ₹${safeGrandTotal}) already exists in your records.`, existingId: duplicate.id });
        }
      }

      const result = await client.query(
        `INSERT INTO purchases (
          id, user_mobile, invoice_classification, supplier_invoice_no, date, due_date, supplier_id, supplier_name,
          supplier_gstin, supplier_state, supplier_state_code, items, sub_total,
          cgst_total, sgst_total, igst_total, grand_total, payment_status,
          paid_amount, payment_mode, notes, raw_image_url, created_by_cashier, created_at, updated_at,
          is_reverse_charge, rcm_applicable, rcm_calculated_tax, rcm_tax_rate, is_inter_state, gstr2b_verified
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW(),$24,$25,$26,$27,$28,$29
        ) RETURNING *`,
        [id, userMobile, invoice_classification || 'B2B', cleanInvNo || `BILL-${Date.now().toString().slice(-4)}`,
          cleanDate, due_date || cleanDate, supplier_id || 'DIRECT_VENDOR', cleanSupName, supplier_gstin || '',
          supplier_state ?? null, supplier_state_code ?? null, JSON.stringify(items || []), amounts.subtotal,
          amounts.cgst, amounts.sgst, amounts.igst, safeGrandTotal, effectivePaymentStatus, effectivePaid,
          normalizedPaymentMode, notes || '', storedImageUrl || null, getCashierName(req), isRcmFlag,
          isRcmFlag, amounts.rcm, rcmRate, is_inter_state === true || String(is_inter_state).toLowerCase() === 'true', false]
      );
      committedPurchase = result.rows[0];

      const jeLines: any[] = [{ account: 'Purchase Asset Account', debit: amounts.subtotal, credit: 0 }];
      const isRcmPurchase = isRcmFlag;
      if (!isRcmPurchase && amounts.cgst > 0) jeLines.push({ account: 'Input Tax Credit - CGST Pool', debit: amounts.cgst, credit: 0 });
      if (!isRcmPurchase && amounts.sgst > 0) jeLines.push({ account: 'Input Tax Credit - SGST Pool', debit: amounts.sgst, credit: 0 });
      if (!isRcmPurchase && amounts.igst > 0) jeLines.push({ account: 'Input Tax Credit - IGST Pool', debit: amounts.igst, credit: 0 });
      if (isRcmPurchase && amounts.rcm > 0) {
        jeLines.push({ account: 'RCM Tax Expense / Recoverable', debit: amounts.rcm, credit: 0 });
        jeLines.push({ account: 'RCM GST Payable', debit: 0, credit: amounts.rcm });
      }
      if (rounding > 0.005) jeLines.push({ account: 'Purchase Rounding / Other Charges', debit: rounding, credit: 0 });
      else if (rounding < -0.005) jeLines.push({ account: 'Purchase Discount / Rounding', debit: 0, credit: Math.abs(rounding) });
      if (unpaidBalance > 0) jeLines.push({ account: `Creditor: ${cleanSupName || 'Vendor'}`, debit: 0, credit: unpaidBalance });
      if (effectivePaid > 0) jeLines.push({ account: purchaseIsBank ? 'Bank Account' : 'Cash Account', debit: 0, credit: effectivePaid });
      const debitSum = jeLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const creditSum = jeLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      if (Math.abs(debitSum - creditSum) > 0.02) throw new Error('Purchase journal is not balanced; purchase was not saved.');

      await client.query(
        `INSERT INTO journal_entries (id, entry_no, date, voucher_type, voucher_ref_no, narration, lines, user_mobile, created_at)
         VALUES ($1,$2,$3,'PURCHASE',$4,$5,$6,$7,NOW())`,
        [`JE-${id}`, `JV-PUR-${id}`, cleanDate, cleanInvNo || id, `Purchase Invoice from ${cleanSupName || 'Vendor'}`, JSON.stringify(jeLines), userMobile]
      );
      if (effectivePaid > 0 && purchaseIsBank) {
        await client.query(
          `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
           VALUES ($1,$2,$3,$3,$4,$5,$6,0,'UNRECONCILED','APP_ENTRY',NOW())`,
          [`BRS-PUR-${id}`, userMobile, cleanDate, `Purchase payment ${cleanInvNo || id} - ${cleanSupName || 'Supplier'}`, '', effectivePaid]
        );
      }
      const inventoryLines = new Map<string, { name: string; hsn: string; unit: string; quantity: number; totalCost: number }>();
      for (const item of (Array.isArray(items) ? items : [])) {
        const itemName = String(item?.name || item?.item_name || item?.title || '').trim();
        const normalizedName = itemName.toLowerCase();
        const quantity = Number(item?.qty ?? item?.quantity ?? 0);
        if (!itemName || !Number.isFinite(quantity) || quantity <= 0 || (normalizedName.includes('stock inward') && String(item?.hsn || '') === '9999')) continue;
        const unitCostRaw = Number(item?.rate ?? item?.unit_cost ?? item?.unitPrice ?? item?.price ?? 0);
        const unitCost = Number.isFinite(unitCostRaw) && unitCostRaw >= 0 ? unitCostRaw : 0;
        const existing = inventoryLines.get(normalizedName) || { name: itemName, hsn: String(item?.hsn || ''), unit: String(item?.unit || 'PCS'), quantity: 0, totalCost: 0 };
        existing.quantity += quantity;
        existing.totalCost += unitCost * quantity;
        inventoryLines.set(normalizedName, existing);
      }
      for (const [normalizedName, line] of inventoryLines) {
        const averageCost = line.quantity > 0 ? line.totalCost / line.quantity : 0;
        const itemRes = await client.query(
          `INSERT INTO inventory_items (id,user_mobile,item_name,normalized_name,hsn,unit,quantity_on_hand,average_cost,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT (user_mobile,normalized_name) DO UPDATE SET
             quantity_on_hand=inventory_items.quantity_on_hand+EXCLUDED.quantity_on_hand,
             average_cost=CASE WHEN inventory_items.quantity_on_hand+EXCLUDED.quantity_on_hand>0
               THEN ((inventory_items.quantity_on_hand*inventory_items.average_cost)+(EXCLUDED.quantity_on_hand*EXCLUDED.average_cost))/(inventory_items.quantity_on_hand+EXCLUDED.quantity_on_hand)
               ELSE EXCLUDED.average_cost END,
             item_name=EXCLUDED.item_name, hsn=COALESCE(NULLIF(EXCLUDED.hsn,''),inventory_items.hsn), unit=EXCLUDED.unit, updated_at=NOW()
           RETURNING id`,
          [`INVITEM-${crypto.randomUUID()}`,userMobile,line.name,normalizedName,line.hsn,line.unit,line.quantity,averageCost]
        );
        await client.query(
          `INSERT INTO inventory_movements (id,user_mobile,inventory_item_id,source_type,source_id,quantity_delta,unit_cost,created_at)
           VALUES ($1,$2,$3,'PURCHASE',$4,$5,$6,NOW())`,
          [`INVMOVE-${crypto.randomUUID()}`,userMobile,itemRes.rows[0].id,id,line.quantity,averageCost]
        );
      }
      await client.query(
        `INSERT INTO audit_edit_logs (log_id, table_name, record_id, action_type, user_id_context, timestamp_marker, delta_diff_payload)
         VALUES ($1,'purchases',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`, id, userMobile, JSON.stringify({ supplier_name: cleanSupName, supplier_invoice_no: cleanInvNo, grand_total: safeGrandTotal, paid_amount: effectivePaid })]
      );
      if (cleanSupName) await ensurePartyRecord({ userMobile, partyName: cleanSupName, gstin: supplier_gstin, state: supplier_state, stateCode: supplier_state_code, type: 'SUPPLIER', balanceDelta: -unpaidBalance, db: client, strict: true });
      await client.query('COMMIT');
      res.status(201).json(committedPurchase);
    } catch (err: any) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to save purchase and accounting entries.' });
    } finally {
      if (client) client.release();
    }
  });

  // Delete a purchase with its journal/bank/stock effects in one transaction.
  app.delete('/api/purchases/:id', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM purchases WHERE id=$1 AND user_mobile=$2 FOR UPDATE', [req.params.id, userMobile]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Purchase not found.' }); }
      const purchase = found.rows[0];
      const movements = await client.query(`SELECT inventory_item_id, SUM(quantity_delta) AS delta FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2 GROUP BY inventory_item_id`, [userMobile, purchase.id]);
      for (const movement of movements.rows) {
        const delta = Number(movement.delta || 0);
        const current = await client.query('SELECT quantity_on_hand FROM inventory_items WHERE id=$1 AND user_mobile=$2 FOR UPDATE', [movement.inventory_item_id, userMobile]);
        if (current.rows.length && Number(current.rows[0].quantity_on_hand || 0) - delta < -0.0001) {
          throw new Error('This purchase cannot be deleted because its stock has already been consumed. Adjust the related sales/stock records first.');
        }
        await client.query(`UPDATE inventory_items SET quantity_on_hand=GREATEST(0,quantity_on_hand-$1), updated_at=NOW() WHERE id=$2 AND user_mobile=$3`, [delta, movement.inventory_item_id, userMobile]);
      }
      await client.query('DELETE FROM inventory_movements WHERE user_mobile=$1 AND source_id=$2', [userMobile, purchase.id]);
      await client.query('DELETE FROM journal_entries WHERE user_mobile=$1 AND id=$2', [userMobile, `JE-${purchase.id}`]);
      await client.query(`DELETE FROM bank_statement_records WHERE user_mobile=$1 AND id=$2 AND record_source='APP_ENTRY'`, [userMobile, `BRS-PUR-${purchase.id}`]);
      const unpaid = Math.max(0, Number(purchase.grand_total || 0) - Number(purchase.paid_amount || 0));
      if (unpaid > 0 && purchase.supplier_name) {
        await client.query(`UPDATE parties SET current_balance=COALESCE(current_balance,0)+$1 WHERE user_mobile=$2 AND (id=$3 OR LOWER(TRIM(name))=LOWER(TRIM($4)))`, [unpaid, userMobile, purchase.supplier_id || '', purchase.supplier_name]);
      }
      await client.query(`INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload) VALUES ($1,'purchases',$2,'DELETE',$3,NOW(),$4)`, [`AEL-${crypto.randomUUID()}`, purchase.id, userMobile, JSON.stringify({ supplier_invoice_no: purchase.supplier_invoice_no, grand_total: purchase.grand_total })]);
      await client.query('DELETE FROM purchases WHERE id=$1 AND user_mobile=$2', [purchase.id, userMobile]);
      await client.query('COMMIT');
      res.json({ success: true, message: 'Purchase and linked accounting/stock entries were deleted atomically.' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(409).json({ error: err.message || 'Unable to delete purchase safely.' });
    } finally { client.release(); }
  });

  // Batch purchase registration with duplicate detection & permanent ledger sync
  app.post('/api/purchases/batch', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const bills = req.body?.bills;
    if (!Array.isArray(bills) || bills.length === 0) return res.status(400).json({ error: 'No bills provided in batch.' });
    if (bills.length > 100) return res.status(400).json({ error: 'Import at most 100 matched bills per batch.' });
    const client = await pool.connect();
    const inserted: any[] = [];
    const duplicates: any[] = [];
    try {
      await client.query('BEGIN');
      for (const bill of bills) {
        const cleanInvNo = String(bill?.supplier_invoice_no || '').trim();
        const cleanSupName = String(bill?.supplier_name || 'Direct Supplier').trim();
        const cleanDate = String(bill?.date || getFormattedDate()).trim();
        const gstin = String(bill?.supplier_gstin || 'URP').trim();
        if (!cleanInvNo) throw new Error('Each bill must include a supplier invoice number.');
        const portalRes = await client.query(
          `SELECT * FROM gstr2b_portal_cache WHERE user_mobile=$1
           AND UPPER(TRIM(supplier_gstin))=UPPER(TRIM($2))
           AND UPPER(TRIM(invoice_number))=UPPER(TRIM($3)) ORDER BY created_at DESC LIMIT 1`,
          [userMobile, gstin, cleanInvNo]
        );
        const portal = portalRes.rows[0];
        if (!portal) throw new Error(`Invoice ${cleanInvNo} is not present in imported GSTR-2B records and cannot be imported as verified ITC.`);
        const taxable = Number(portal.taxable_value || 0);
        const cgst = Number(portal.cgst_amount ?? portal.cgst ?? 0);
        const sgst = Number(portal.sgst_amount ?? portal.sgst ?? 0);
        const igst = Number(portal.igst_amount ?? portal.igst ?? 0);
        const total = Number(portal.total_value || 0);
        if (![taxable, cgst, sgst, igst, total].every((n) => Number.isFinite(n) && n >= 0) || Math.abs(total - (taxable + cgst + sgst + igst)) > 1.01) {
          throw new Error(`Invoice ${cleanInvNo} has invalid or unbalanced GSTR-2B amounts.`);
        }
        const existing = await client.query(
          `SELECT id FROM purchases WHERE user_mobile=$1 AND UPPER(TRIM(supplier_invoice_no))=UPPER(TRIM($2))
           AND UPPER(TRIM(supplier_name))=UPPER(TRIM($3)) AND date=$4 AND ABS(grand_total-$5)<0.5 LIMIT 1`,
          [userMobile, cleanInvNo, cleanSupName, cleanDate, total]
        );
        if (existing.rows.length) {
          duplicates.push({ bill: cleanInvNo, supplier: cleanSupName, id: existing.rows[0].id });
          continue;
        }
        const id = 'PUR-' + crypto.randomUUID();
        const paid = Math.min(total, Math.max(0, Number(bill.paid_amount ?? total)));
        if (!Number.isFinite(paid)) throw new Error(`Invoice ${cleanInvNo} has an invalid paid amount.`);
        const due = Math.max(0, total - paid);
        const mode = String(bill.payment_mode || 'CASH').toUpperCase();
        const isBank = ['BANK','BANK/CHECK','CHEQUE','CHECK','UPI','ONLINE'].includes(mode) || mode.includes('BANK') || mode.includes('UPI');
        const purchase = await client.query(
          `INSERT INTO purchases (id,user_mobile,invoice_classification,supplier_invoice_no,date,due_date,supplier_id,supplier_name,supplier_gstin,supplier_state,supplier_state_code,items,sub_total,cgst_total,sgst_total,igst_total,grand_total,payment_status,paid_amount,payment_mode,notes,created_by_cashier,created_at,updated_at,gstr2b_verified)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW(),TRUE) RETURNING *`,
          [id,userMobile,bill.invoice_classification || 'B2B',cleanInvNo,cleanDate,bill.due_date || cleanDate,bill.supplier_id || 'DIRECT_VENDOR',String(portal.supplier_name || cleanSupName),gstin,bill.supplier_state ?? null,bill.supplier_state_code ?? null,JSON.stringify(bill.items || []),taxable,cgst,sgst,igst,total,due <= 0.009 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',paid,mode,bill.notes || 'GSTR-2B reconciled purchase',getCashierName(req)]
        );
        const permId = 'PPL-' + crypto.randomUUID();
        await client.query(
          `INSERT INTO permanent_purchase_ledger (id,user_mobile,supplier_name,supplier_gstin,invoice_number,invoice_date,taxable_value,cgst,sgst,igst,total_value,verification_source,gstr2b_verified,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GSTR2B_RECONCILED',TRUE,NOW())`,
          [permId,userMobile,String(portal.supplier_name || cleanSupName),gstin,cleanInvNo,String(portal.invoice_date || cleanDate),taxable,cgst,sgst,igst,total]
        );
        const lines: any[] = [{ account: 'Purchase Asset Account', debit: taxable, credit: 0 }];
        if (cgst > 0) lines.push({ account: 'Input Tax Credit - CGST Pool', debit: cgst, credit: 0 });
        if (sgst > 0) lines.push({ account: 'Input Tax Credit - SGST Pool', debit: sgst, credit: 0 });
        if (igst > 0) lines.push({ account: 'Input Tax Credit - IGST Pool', debit: igst, credit: 0 });
        if (due > 0) lines.push({ account: `Creditor: ${cleanSupName}`, debit: 0, credit: due });
        if (paid > 0) lines.push({ account: isBank ? 'Bank Account' : 'Cash Account', debit: 0, credit: paid });
        if (total > taxable + cgst + sgst + igst) lines.push({ account: 'Purchase Rounding / Other Charges', debit: total - taxable - cgst - sgst - igst, credit: 0 });
        else if (total < taxable + cgst + sgst + igst) lines.push({ account: 'Purchase Discount / Rounding', debit: 0, credit: taxable + cgst + sgst + igst - total });
        const debitSum = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const creditSum = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
        if (Math.abs(debitSum - creditSum) > 1.01) throw new Error(`Journal for invoice ${cleanInvNo} is not balanced.`);
        await client.query(
          `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
           VALUES ($1,$2,$3,'PURCHASE',$4,$5,$6,$7,NOW())`,
          [`JE-${id}`,`JV-2B-${permId.slice(-8)}`,cleanDate,cleanInvNo,`GSTR-2B Verified Purchase from ${cleanSupName}`,JSON.stringify(lines),userMobile]
        );
        if (paid > 0 && isBank) await client.query(
          `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
           VALUES ($1,$2,$3,$3,$4,'',$5,0,'UNRECONCILED','APP_ENTRY',NOW())`,
          [`BRS-PUR-${id}`,userMobile,cleanDate,`Purchase payment ${cleanInvNo} - ${cleanSupName}`,paid]
        );
        await client.query(
          `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
           VALUES ($1,'purchases',$2,'INSERT',$3,NOW(),$4)`,
          [`AEL-${crypto.randomUUID()}`,id,userMobile,JSON.stringify({ invoice: cleanInvNo, verifiedAgainstGstr2b: true, total })]
        );
        inserted.push(purchase.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, insertedCount: inserted.length, duplicateCount: duplicates.length, inserted, duplicates });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(409).json({ error: err.message || 'Unable to import matched purchases.' });
    } finally { client.release(); }
  });

  // 7.2 Dedicated Manual Expenses API
  app.get('/api/expenses', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      await applyPermanentExpenses(userMobile);
      const params: any[] = [userMobile];
      let query = 'SELECT * FROM expenses WHERE user_mobile = $1';
      const from = String(req.query.from || '').trim(); const to = String(req.query.to || '').trim();
      if (from) { params.push(from); query += ` AND (CASE WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN date::date ELSE TO_DATE(date, 'DD/MM/YYYY') END) >= $${params.length}::date`; }
      if (to) { params.push(to); query += ` AND (CASE WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN date::date ELSE TO_DATE(date, 'DD/MM/YYYY') END) <= $${params.length}::date`; }
      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);

      const todayStr = getFormattedDate();
      const todayExpenses = result.rows.filter((r: any) => r.date === todayStr);
      const todayTotal = todayExpenses.reduce((sum: number, r: any) => sum + parseFloat(r.amount || '0'), 0);
      const totalAmount = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.amount || '0'), 0);

      // Category breakdown
      const categoryMap: Record<string, { count: number; total: number }> = {};
      result.rows.forEach((r: any) => {
        const cat = r.category || 'General Expense';
        if (!categoryMap[cat]) categoryMap[cat] = { count: 0, total: 0 };
        categoryMap[cat].count += 1;
        categoryMap[cat].total += parseFloat(r.amount || '0');
      });

      const categories = Object.keys(categoryMap).map((cat) => ({
        name: cat,
        count: categoryMap[cat].count,
        amount: categoryMap[cat].total,
      }));

      res.json({
        expenses: result.rows,
        totalAmount,
        todayTotal,
        todayCount: todayExpenses.length,
        categories,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/permanent-expenses', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      await applyPermanentExpenses(userMobile);
      const result = await pool.query(
        `SELECT id,title,description,notes,category,amount,payment_mode,active,start_date,end_date,
           CASE WHEN end_date IS NULL THEN NULL ELSE end_date-start_date+1 END AS duration_days,created_at
         FROM permanent_expenses WHERE user_mobile=$1 ORDER BY active DESC,created_at DESC`,
        [userMobile]
      );
      res.json({ expenses: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to load permanent expenses.' });
    }
  });

  app.post('/api/permanent-expenses', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const notes = String(req.body?.notes || '').trim();
      const category = String(req.body?.category || '').trim();
      const amount = Number(req.body?.amount);
      const durationDays = req.body?.duration_days === null || req.body?.duration_days === undefined || req.body?.duration_days === ''
        ? null
        : Number(req.body.duration_days);
      const paymentMode = String(req.body?.payment_mode || 'CASH').trim().toUpperCase();
      if (!title) return res.status(400).json({ error: 'Expense name is required.' });
      if (!category) return res.status(400).json({ error: 'Expense category is required.' });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Expense amount must be greater than zero.' });
      if (durationDays !== null && ![7, 14].includes(durationDays)) return res.status(400).json({ error: 'Choose a duration of one week, two weeks, or permanent.' });
      if (!['CASH', 'CHEQUE', 'CHECK', 'BANK', 'UPI', 'ONLINE'].includes(paymentMode)) return res.status(400).json({ error: 'Choose a valid payment mode.' });
      const id = `PERM-${crypto.randomUUID()}`;
      const result = await pool.query(
        `INSERT INTO permanent_expenses (id,user_mobile,title,description,notes,category,amount,payment_mode,active,start_date,end_date,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,CURRENT_DATE,CASE WHEN $9::int IS NULL THEN NULL ELSE CURRENT_DATE+($9::int-1) END,NOW())
         RETURNING id,title,description,notes,category,amount,payment_mode,active,start_date,end_date,
           CASE WHEN end_date IS NULL THEN NULL ELSE end_date-start_date+1 END AS duration_days,created_at`,
        [id, userMobile, title, description, notes, category, amount, paymentMode, durationDays]
      );
      await applyPermanentExpenses(userMobile);
      res.status(201).json({ success: true, expense: result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to save permanent expense.' });
    }
  });

  app.put('/api/permanent-expenses/:id', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const notes = String(req.body?.notes || '').trim();
      const category = String(req.body?.category || '').trim();
      const amount = Number(req.body?.amount);
      const durationDays = req.body?.duration_days === null || req.body?.duration_days === undefined || req.body?.duration_days === ''
        ? null
        : Number(req.body.duration_days);
      const paymentMode = String(req.body?.payment_mode || 'CASH').trim().toUpperCase();
      if (!title || !category) return res.status(400).json({ error: 'Expense name and category are required.' });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Expense amount must be greater than zero.' });
      if (durationDays !== null && ![7, 14].includes(durationDays)) return res.status(400).json({ error: 'Choose a duration of one week, two weeks, or permanent.' });
      if (!['CASH', 'CHEQUE', 'CHECK', 'BANK', 'UPI', 'ONLINE'].includes(paymentMode)) return res.status(400).json({ error: 'Choose a valid payment mode.' });
      const result = await pool.query(
        `UPDATE permanent_expenses
         SET title=$1,description=$2,notes=$3,category=$4,amount=$5,payment_mode=$6,active=TRUE,
             start_date=CURRENT_DATE,
           end_date=CASE WHEN $7::int IS NULL THEN NULL ELSE CURRENT_DATE+($7::int-1) END
         WHERE id=$8 AND user_mobile=$9
         RETURNING id,title,description,notes,category,amount,payment_mode,active,start_date,end_date,
           CASE WHEN end_date IS NULL THEN NULL ELSE end_date-start_date+1 END AS duration_days,created_at`,
        [title, description, notes, category, amount, paymentMode, durationDays, req.params.id, userMobile]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Permanent expense not found.' });
      await applyPermanentExpenses(userMobile);
      res.json({ success: true, expense: result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to update permanent expense.' });
    }
  });

  app.delete('/api/permanent-expenses/:id', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query(
        `UPDATE permanent_expenses SET active=FALSE WHERE id=$1 AND user_mobile=$2 RETURNING id`,
        [req.params.id, userMobile]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Permanent expense not found.' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to disable permanent expense.' });
    }
  });

  app.post('/api/expenses', async (req: Request, res: Response) => {
    let client: any = null;
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const { expense_no, date, category, title, amount, payment_mode, paid_to, notes } = req.body || {};
      const numAmount = Number(amount);
      if (!String(title || '').trim()) return res.status(400).json({ error: 'Expense title is required.' });
      if (!Number.isFinite(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Expense amount must be greater than zero.' });
      const expDate = String(date || getFormattedDate());
      const expNo = String(expense_no || `EXP-${Date.now().toString().slice(-6)}`);
      const cat = String(category || 'General Expense');
      const normalizedMode = String(payment_mode || 'CASH').trim().toUpperCase();
      const validModes = ['CASH', 'BANK', 'BANK/CHECK', 'CHEQUE', 'CHECK', 'UPI', 'ONLINE'];
      if (!validModes.includes(normalizedMode) && !normalizedMode.includes('BANK') && !normalizedMode.includes('UPI')) {
        return res.status(400).json({ error: 'Choose a valid Cash or Online/Bank payment mode.' });
      }
      const bankExpense = ['BANK', 'BANK/CHECK', 'CHEQUE', 'CHECK', 'UPI', 'ONLINE'].includes(normalizedMode) || normalizedMode.includes('BANK') || normalizedMode.includes('UPI');
      const id = 'EXP-' + crypto.randomUUID();
      const clientRef = await pool.connect();
      client = clientRef;
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO expenses (id,user_mobile,expense_no,date,category,title,amount,payment_mode,paid_to,notes,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *`,
        [id, userMobile, expNo, expDate, cat, String(title).trim(), numAmount, normalizedMode, paid_to || '', notes || '']
      );
      const expenseLines = [
        { account: `Expense: ${cat}`, debit: numAmount, credit: 0 },
        { account: bankExpense ? 'Bank Account' : 'Cash Account', debit: 0, credit: numAmount },
      ];
      await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,'PAYMENT',$4,$5,$6,$7,NOW())`,
        [`JE-${id}`, `JV-EXP-${id}`, expDate, expNo, `Expense payment: ${String(title).trim()}`, JSON.stringify(expenseLines), userMobile]
      );
      if (bankExpense) {
        await client.query(
          `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
           VALUES ($1,$2,$3,$3,$4,$5,$6,0,'UNRECONCILED','APP_ENTRY',NOW())`,
          [`BRS-EXP-${id}`, userMobile, expDate, `Expense payment ${expNo} - ${String(title).trim()}`, '', numAmount]
        );
      }
      await client.query(
        `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
         VALUES ($1,'expenses',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`, id, userMobile, JSON.stringify({ expense_no: expNo, title, amount: numAmount, payment_mode: normalizedMode })]
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, expense: result.rows[0] });
    } catch (err: any) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to save expense and accounting entries.' });
    } finally {
      if (client) client.release();
    }
  });

  app.delete('/api/expenses/:id', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const delMobile = getUserMobile(req);
      if (!delMobile) return res.status(401).json({ error: 'Login required.' });
      await client.query('BEGIN');
      const deleted = await client.query('DELETE FROM expenses WHERE id=$1 AND user_mobile=$2 RETURNING id', [id, delMobile]);
      if (!deleted.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Expense not found.' }); }
      await client.query('DELETE FROM journal_entries WHERE id=$1 AND user_mobile=$2', [`JE-${id}`, delMobile]);
      await client.query("DELETE FROM bank_statement_records WHERE id=$1 AND user_mobile=$2 AND record_source='APP_ENTRY'", [`BRS-EXP-${id}`, delMobile]);
      await client.query('COMMIT');
      res.json({ success: true, message: 'Expense and its linked ledger entries were deleted.' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message });
    } finally { client.release(); }
  });

  // 7.3 Payment-In & Payment-Out API
  app.get('/api/payments', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const type = req.query.type as string;
      let query = `SELECT * FROM payments WHERE user_mobile = $1`;
      const params: any[] = [userMobile];
      if (type) {
        params.push(type);
        query += ` AND type = $${params.length}`;
      }
      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payments', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const { type = 'PAYMENT_IN', receipt_no, date, party_id, party_name, party_phone, amount, payment_type, payment_ref_no, description } = req.body || {};
      if (!String(party_name || '').trim()) return res.status(400).json({ error: 'Party name is required.' });
      if (!['PAYMENT_IN', 'PAYMENT_OUT'].includes(String(type))) return res.status(400).json({ error: 'Choose Payment In or Payment Out.' });
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      const payDate = String(date || getFormattedDate());
      const recNo = String(receipt_no || `REC-${Date.now().toString().slice(-6)}`);
      const payType = String(payment_type || 'Cash').trim();
      const normalizedMode = payType.toUpperCase();
      const isBank = normalizedMode.includes('BANK') || normalizedMode.includes('ONLINE') || normalizedMode.includes('UPI') || normalizedMode.includes('CHEQUE') || normalizedMode.includes('CHECK');
      const id = (type === 'PAYMENT_OUT' ? 'POUT-' : 'PIN-') + crypto.randomUUID();
      const partyName = String(party_name).trim();
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO payments (id,user_mobile,type,receipt_no,date,party_id,party_name,party_phone,amount,payment_type,payment_ref_no,description,created_by_cashier,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING *`,
        [id,userMobile,type,recNo,payDate,party_id || '',partyName,party_phone || '',numAmount,payType,payment_ref_no || '',description || '',getCashierName(req)]
      );
      const delta = type === 'PAYMENT_IN' ? -numAmount : numAmount;
      await client.query(
        `UPDATE parties SET current_balance=COALESCE(current_balance,0)+$1,updated_at=NOW()
         WHERE user_mobile=$2 AND LOWER(TRIM(name))=LOWER(TRIM($3))`, [delta,userMobile,partyName]
      );
      const lines = type === 'PAYMENT_IN'
        ? [{ account: isBank ? 'Bank Account' : 'Cash Account', debit: numAmount, credit: 0 }, { account: `Debtor: ${partyName}`, debit: 0, credit: numAmount }]
        : [{ account: `Creditor: ${partyName}`, debit: numAmount, credit: 0 }, { account: isBank ? 'Bank Account' : 'Cash Account', debit: 0, credit: numAmount }];
      await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [`JE-${id}`,`JV-PAY-${id}`,payDate,type === 'PAYMENT_IN' ? 'RECEIPT' : 'PAYMENT',recNo,`${type === 'PAYMENT_IN' ? 'Payment received from' : 'Payment made to'} ${partyName}`,JSON.stringify(lines),userMobile]
      );
      if (isBank) await client.query(
        `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'UNRECONCILED','APP_ENTRY',NOW())`,
        [`BRS-PAY-${id}`,userMobile,payDate,`${type === 'PAYMENT_IN' ? 'Receipt from' : 'Payment to'} ${partyName}`,String(payment_ref_no || ''),type === 'PAYMENT_OUT' ? numAmount : 0,type === 'PAYMENT_IN' ? numAmount : 0]
      );
      await client.query(
        `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
         VALUES ($1,'payments',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`,id,userMobile,JSON.stringify({ type, party_name: partyName, amount: numAmount, payment_type: payType })]
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, payment: result.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to save payment and ledger entries.' });
    } finally { client.release(); }
  });

  app.delete('/api/payments/:id', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM payments WHERE id=$1 AND user_mobile=$2 FOR UPDATE', [req.params.id,userMobile]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Payment record not found.' }); }
      const payment = found.rows[0];
      const settlementVoucher = await client.query('SELECT voucher_id FROM payment_vouchers_ledger WHERE voucher_id=$1 AND tenant_mobile_id=$2 LIMIT 1', [payment.id,userMobile]);
      if (settlementVoucher.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This payment is linked to a settlement voucher and invoice allocation. Do not delete it directly; record a reversal transaction instead.' });
      }
      const amount = Number(payment.amount || 0);
      const delta = String(payment.type).toUpperCase() === 'PAYMENT_IN' ? -amount : amount;
      await client.query(
        `UPDATE parties SET current_balance=COALESCE(current_balance,0)-$1,updated_at=NOW()
         WHERE user_mobile=$2 AND LOWER(TRIM(name))=LOWER(TRIM($3))`, [delta,userMobile,payment.party_name]
      );
      await client.query('DELETE FROM journal_entries WHERE id=$1 AND user_mobile=$2', [`JE-${payment.id}`,userMobile]);
      await client.query("DELETE FROM bank_statement_records WHERE id=$1 AND user_mobile=$2 AND record_source='APP_ENTRY'", [`BRS-PAY-${payment.id}`,userMobile]);
      await client.query('DELETE FROM payments WHERE id=$1 AND user_mobile=$2', [payment.id,userMobile]);
      await client.query('COMMIT');
      res.json({ success: true, message: 'Payment and linked ledger entries deleted; party balance was reversed.' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to delete payment.' });
    } finally { client.release(); }
  });

  // =========================================================================
  // 7.4 Dedicated Account Settlement Module (Payment In / Payment Out Matrix)
  // Multi-Tenant, Zero-Leak, Anti-Cache Ledger Verification Engine
  // =========================================================================

  // 1. Debtors Extraction: Customers with active debit outstanding ledger balance (Net Balance Owed > 0)
  app.get('/api/settlements/debtors', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });

      // 1. Fetch parties with positive balance
      const partiesResult = await pool.query(
        `SELECT id, name, phone, gstin, billing_address, state, current_balance, type
         FROM parties
         WHERE user_mobile = $1
         ORDER BY current_balance DESC, name ASC`,
        [userMobile]
      );

      // 2. Fetch invoices with unpaid balance to capture any direct invoice debtors
      const invoicesResult = await pool.query(
        `SELECT party_id, party_name, party_phone, party_gstin, party_state, balance_amount
         FROM invoices
         WHERE user_mobile = $1 AND balance_amount > 0`,
        [userMobile]
      );

      const debtorsMap = new Map<string, {
        id: string;
        name: string;
        phone: string;
        gstin: string;
        address: string;
        current_balance: number;
      }>();

      // Ingest from parties where balance > 0
      for (const p of partiesResult.rows) {
        const bal = parseFloat(p.current_balance || '0');
        if (bal > 0) {
          const cleanPhone = String(p.phone || '').replace(/\D/g, '').slice(-10);
          debtorsMap.set(p.name.trim().toLowerCase(), {
            id: p.id,
            name: p.name.trim(),
            phone: cleanPhone,
            gstin: (p.gstin && p.gstin.trim()) ? p.gstin.trim() : 'URP',
            address: p.billing_address || (p.state ? `${p.state}, India` : 'Registered Customer Address'),
            current_balance: bal,
          });
        }
      }

      // Check invoices with unpaid balance
      for (const inv of invoicesResult.rows) {
        if (!inv.party_name) continue;
        const key = inv.party_name.trim().toLowerCase();
        const invBal = parseFloat(inv.balance_amount || '0');
        if (invBal > 0) {
          if (!debtorsMap.has(key)) {
            const cleanPhone = String(inv.party_phone || '').replace(/\D/g, '').slice(-10);
            debtorsMap.set(key, {
              id: inv.party_id || ('CUST-' + Math.abs(key.split('').reduce((a: number, b: string) => ((a << 5) - a) + b.charCodeAt(0), 0))),
              name: inv.party_name.trim(),
              phone: cleanPhone,
              gstin: (inv.party_gstin && inv.party_gstin.trim()) ? inv.party_gstin.trim() : 'URP',
              address: inv.party_state ? `${inv.party_state}, India` : 'Verified Customer Address',
              current_balance: invBal,
            });
          }
        }
      }

      const debtors = Array.from(debtorsMap.values());
      res.json({ debtors, count: debtors.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Creditors Extraction: Third-party business accounts from whom items were purchased on credit (Liability Owed > 0)
  app.get('/api/settlements/creditors', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });

      // 1. Fetch parties where balance < 0 (credit liability) or type is SUPPLIER
      const partiesResult = await pool.query(
        `SELECT id, name, phone, gstin, billing_address, state, current_balance, type
         FROM parties
         WHERE user_mobile = $1
         ORDER BY current_balance ASC, name ASC`,
        [userMobile]
      );

      // 2. Fetch purchases where payment_status != 'PAID' or (grand_total - paid_amount > 0)
      const purchasesResult = await pool.query(
        `SELECT supplier_id, supplier_name, supplier_gstin, supplier_state, grand_total, paid_amount, payment_status
         FROM purchases
         WHERE user_mobile = $1 AND (grand_total - paid_amount) > 0.01`,
        [userMobile]
      );

      const creditorsMap = new Map<string, {
        id: string;
        name: string;
        phone: string;
        gstin: string;
        address: string;
        current_balance: number;
      }>();

      // Ingest from parties where balance < 0 (liability owed to supplier)
      for (const p of partiesResult.rows) {
        const bal = parseFloat(p.current_balance || '0');
        if (bal < 0 || (p.type === 'SUPPLIER' && bal !== 0)) {
          const liability = Math.abs(bal);
          if (liability > 0) {
            const cleanPhone = String(p.phone || '').replace(/\D/g, '').slice(-10);
            creditorsMap.set(p.name.trim().toLowerCase(), {
              id: p.id,
              name: p.name.trim(),
              phone: cleanPhone,
              gstin: (p.gstin && p.gstin.trim()) ? p.gstin.trim() : 'URP',
              address: p.billing_address || (p.state ? `${p.state}, India` : 'Registered Vendor Premises'),
              current_balance: liability,
            });
          }
        }
      }

      // Check unpaid purchases
      for (const pur of purchasesResult.rows) {
        if (!pur.supplier_name) continue;
        const key = pur.supplier_name.trim().toLowerCase();
        const purDue = Math.max(0, parseFloat(pur.grand_total || '0') - parseFloat(pur.paid_amount || '0'));
        if (purDue > 0) {
          if (!creditorsMap.has(key)) {
            creditorsMap.set(key, {
              id: pur.supplier_id || ('VEND-' + Math.abs(key.split('').reduce((a: number, b: string) => ((a << 5) - a) + b.charCodeAt(0), 0))),
              name: pur.supplier_name.trim(),
              phone: '',
              gstin: (pur.supplier_gstin && pur.supplier_gstin.trim()) ? pur.supplier_gstin.trim() : 'URP',
              address: pur.supplier_state ? `${pur.supplier_state}, India` : 'Registered Vendor Logistics Hub',
              current_balance: purDue,
            });
          }
        }
      }

      const creditors = Array.from(creditorsMap.values());
      res.json({ creditors, count: creditors.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Save Settlement Payment Voucher (Pillars 1, 2, 3, 4)
  // Binds strictly to tenant_mobile_id and performs atomic balance settlement
  app.post('/api/settlements/voucher', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const { voucher_type_direction, party_id, party_name, party_phone, party_gstin, party_address, base_amount_paid, payment_mode, notes, date } = req.body || {};
      if (!['PAYMENT_IN', 'PAYMENT_OUT'].includes(String(voucher_type_direction)) || !String(party_name || '').trim()) {
        return res.status(400).json({ error: 'Voucher direction and party name are required.' });
      }
      const cleanAmount = Number(base_amount_paid);
      if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return res.status(400).json({ error: 'Allocation amount must be greater than zero.' });
      const cleanDirection = voucher_type_direction as 'PAYMENT_IN' | 'PAYMENT_OUT';
      const cleanPhone = String(party_phone || '').replace(/\D/g, '').slice(-10);
      const cleanGstin = String(party_gstin || '').trim() || 'URP';
      const cleanAddress = String(party_address || '').trim() || 'Registered Business Address';
      const cleanMode = payment_mode === 'Bank Ledger' ? 'Bank Ledger' : 'Cash-Drawer';
      const isBank = cleanMode === 'Bank Ledger';
      const voucherDate = String(date || getFormattedDate());
      const voucherId = 'PVL-' + crypto.randomUUID();
      await client.query('BEGIN');

      const partyQuery = await client.query(
        `SELECT id,current_balance FROM parties WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND user_mobile=$2 LIMIT 1 FOR UPDATE`,
        [String(party_name).trim(),userMobile]
      );
      const rawPartyBalance = partyQuery.rows.length ? Number(partyQuery.rows[0].current_balance || 0) : 0;
      const partyBalance = cleanDirection === 'PAYMENT_IN' ? Math.max(0, rawPartyBalance) : Math.max(0, -rawPartyBalance);
      let documentBalance = 0;
      if (cleanDirection === 'PAYMENT_IN') {
        const r = await client.query('SELECT COALESCE(SUM(balance_amount),0) AS due FROM invoices WHERE LOWER(TRIM(party_name))=LOWER(TRIM($1)) AND user_mobile=$2', [String(party_name).trim(),userMobile]);
        documentBalance = Number(r.rows[0]?.due || 0);
      } else {
        const r = await client.query('SELECT COALESCE(SUM(grand_total-paid_amount),0) AS liability FROM purchases WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($1)) AND user_mobile=$2', [String(party_name).trim(),userMobile]);
        documentBalance = Number(r.rows[0]?.liability || 0);
      }
      const netBalanceSnapshot = Math.max(partyBalance, documentBalance);
      const appliedToDue = Math.min(cleanAmount, Math.max(0, netBalanceSnapshot));
      const excess = Math.max(0, cleanAmount - appliedToDue);
      const balanceAfterSettlement = Math.max(0, netBalanceSnapshot - cleanAmount);
      const newPartyBalance = cleanDirection === 'PAYMENT_IN'
        ? (netBalanceSnapshot >= cleanAmount ? balanceAfterSettlement : -(cleanAmount - netBalanceSnapshot))
        : (netBalanceSnapshot >= cleanAmount ? -balanceAfterSettlement : cleanAmount - netBalanceSnapshot);
      const voucherResult = await client.query(
        `INSERT INTO payment_vouchers_ledger (voucher_id,tenant_mobile_id,party_id,party_name,party_phone,party_gstin,party_address,voucher_type_direction,base_amount_paid,net_balance_snapshot,balance_after_settlement,payment_mode,notes,date,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()) RETURNING *`,
        [voucherId,userMobile,party_id || partyQuery.rows[0]?.id || '',String(party_name).trim(),cleanPhone,cleanGstin,cleanAddress,cleanDirection,cleanAmount,netBalanceSnapshot,balanceAfterSettlement,cleanMode,notes || '',voucherDate]
      );

      if (partyQuery.rows.length) {
        await client.query('UPDATE parties SET current_balance=$1,updated_at=NOW() WHERE id=$2 AND user_mobile=$3', [newPartyBalance,partyQuery.rows[0].id,userMobile]);
      } else {
        await ensurePartyRecord({ userMobile, partyName: String(party_name).trim(), phone: cleanPhone, gstin: cleanGstin !== 'URP' ? cleanGstin : '', type: cleanDirection === 'PAYMENT_IN' ? 'CUSTOMER' : 'SUPPLIER', balanceDelta: newPartyBalance, db: client, strict: true });
      }

      if (cleanDirection === 'PAYMENT_IN') {
        let remaining = cleanAmount;
        const unpaid = await client.query('SELECT id,balance_amount,paid_amount FROM invoices WHERE LOWER(TRIM(party_name))=LOWER(TRIM($1)) AND user_mobile=$2 AND balance_amount>0 ORDER BY created_at ASC FOR UPDATE', [String(party_name).trim(),userMobile]);
        for (const inv of unpaid.rows) {
          if (remaining <= 0.001) break;
          const due = Number(inv.balance_amount || 0), applied = Math.min(remaining,due), newBalance = Math.max(0,due-applied), newPaid = Number(inv.paid_amount || 0)+applied;
          await client.query('UPDATE invoices SET balance_amount=$1,paid_amount=$2,payment_status=$3,updated_at=NOW() WHERE id=$4 AND user_mobile=$5', [newBalance,newPaid,newBalance <= 0.01 ? 'PAID' : 'PARTIAL',inv.id,userMobile]);
          remaining -= applied;
        }
      } else {
        let remaining = cleanAmount;
        const unpaid = await client.query('SELECT id,grand_total,paid_amount FROM purchases WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($1)) AND user_mobile=$2 AND (grand_total-paid_amount)>0.01 ORDER BY created_at ASC FOR UPDATE', [String(party_name).trim(),userMobile]);
        for (const pur of unpaid.rows) {
          if (remaining <= 0.001) break;
          const due = Math.max(0,Number(pur.grand_total || 0)-Number(pur.paid_amount || 0)), applied = Math.min(remaining,due), newPaid = Number(pur.paid_amount || 0)+applied;
          await client.query('UPDATE purchases SET paid_amount=$1,payment_status=$2,updated_at=NOW() WHERE id=$3 AND user_mobile=$4', [newPaid,Number(pur.grand_total || 0)-newPaid <= 0.01 ? 'PAID' : 'PARTIAL',pur.id,userMobile]);
          remaining -= applied;
        }
      }

      const recNo = 'REC-' + voucherId.slice(-8);
      await client.query(
        `INSERT INTO payments (id,user_mobile,type,receipt_no,date,party_id,party_name,party_phone,amount,payment_type,payment_ref_no,description,created_by_cashier,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
        [voucherId,userMobile,cleanDirection,recNo,voucherDate,party_id || partyQuery.rows[0]?.id || '',String(party_name).trim(),cleanPhone,cleanAmount,isBank ? 'Bank' : 'Cash',voucherId,notes || `Settlement voucher: ${cleanDirection} (${cleanMode})`,getCashierName(req)]
      );
      const lines = cleanDirection === 'PAYMENT_IN'
        ? [{ account: isBank ? 'Bank Account' : 'Cash Account', debit: cleanAmount, credit: 0 }, { account: `Debtor: ${String(party_name).trim()}`, debit: 0, credit: appliedToDue }, ...(excess > 0 ? [{ account: 'Customer Advance', debit: 0, credit: excess }] : [])]
        : [{ account: `Creditor: ${String(party_name).trim()}`, debit: appliedToDue, credit: 0 }, ...(excess > 0 ? [{ account: 'Supplier Advance', debit: excess, credit: 0 }] : []), { account: isBank ? 'Bank Account' : 'Cash Account', debit: 0, credit: cleanAmount }];
      await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [`JE-${voucherId}`,`JV-SET-${voucherId}`,voucherDate,cleanDirection === 'PAYMENT_IN' ? 'RECEIPT' : 'PAYMENT',recNo,`${cleanDirection === 'PAYMENT_IN' ? 'Customer receipt from' : 'Vendor payment to'} ${String(party_name).trim()}`,JSON.stringify(lines),userMobile]
      );
      if (isBank) await client.query(
        `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,reconciliation_status,record_source,created_at)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'UNRECONCILED','APP_ENTRY',NOW())`,
        [`BRS-SET-${voucherId}`,userMobile,voucherDate,`${cleanDirection === 'PAYMENT_IN' ? 'Receipt from' : 'Payment to'} ${String(party_name).trim()}`,voucherId,cleanDirection === 'PAYMENT_OUT' ? cleanAmount : 0,cleanDirection === 'PAYMENT_IN' ? cleanAmount : 0]
      );
      await client.query(
        `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
         VALUES ($1,'payment_vouchers_ledger',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`,voucherId,userMobile,JSON.stringify({ party_name, voucher_type_direction: cleanDirection, base_amount_paid: cleanAmount, payment_mode: cleanMode, balance_after_settlement: balanceAfterSettlement })]
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, voucher: voucherResult.rows[0], message: `${cleanDirection === 'PAYMENT_IN' ? 'Customer receipt' : 'Vendor payment'} voucher saved successfully.` });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Save settlement voucher error:', err);
      res.status(500).json({ error: err.message || 'Unable to save settlement voucher and ledger entries.' });
    } finally { client.release(); }
  });

  // 4. Query Tenant Settlement Vouchers (Strictly isolated by tenant_mobile_id)
  app.get('/api/settlements/vouchers', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const direction = req.query.direction as string;

      let query = `SELECT * FROM payment_vouchers_ledger WHERE tenant_mobile_id = $1`;
      const params: any[] = [userMobile];

      if (direction) {
        params.push(direction);
        query += ` AND voucher_type_direction = $${params.length}`;
      }

      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Consolidated Accounting Dashboard Analytics Payload (Node 2)
  app.get('/api/accounting/dashboard', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });

      const invoicesRes = await pool.query('SELECT * FROM invoices WHERE user_mobile = $1 ORDER BY created_at DESC', [userMobile]);
      const purchasesRes = await pool.query('SELECT * FROM purchases WHERE user_mobile = $1 ORDER BY created_at DESC', [userMobile]);
      const expensesRes = await pool.query('SELECT * FROM expenses WHERE user_mobile = $1 ORDER BY created_at DESC', [userMobile]);

      const youGetRows = invoicesRes.rows
        .filter((inv: any) => parseFloat(inv.balance_amount || '0') > 0)
        .map((inv: any) => ({
          id: inv.id,
          party_name: inv.party_name,
          date: inv.date,
          amount: parseFloat(inv.balance_amount || inv.grand_total),
          type: 'INVOICE_RECEIVABLE',
          ref_no: inv.invoice_number,
        }));

      const youGiveRows = purchasesRes.rows
        .map((p: any) => {
          const grand = parseFloat(p.grand_total || '0');
          const paid = parseFloat(p.paid_amount || '0');
          const due = grand - paid;
          return {
            id: p.id,
            party_name: p.supplier_name,
            date: p.date,
            amount: due > 0 ? due : grand,
            type: 'SUPPLIER_PAYABLE',
            ref_no: p.supplier_invoice_no,
          };
        });

      const totalSales = invoicesRes.rows.reduce((sum: number, inv: any) => sum + parseFloat(inv.grand_total || '0'), 0);
      const totalReceivables = youGetRows.reduce((a: number, b: any) => a + b.amount, 0);
      const totalPayables = youGiveRows.reduce((a: number, b: any) => a + b.amount, 0);
      const totalExpenses = expensesRes.rows.reduce((sum: number, exp: any) => sum + parseFloat(exp.amount || '0'), 0);

      // Group expenses by category
      const expCategoryMap: Record<string, { count: number; total: number }> = {};
      expensesRes.rows.forEach((exp: any) => {
        const cat = exp.category || 'General';
        if (!expCategoryMap[cat]) expCategoryMap[cat] = { count: 0, total: 0 };
        expCategoryMap[cat].count += 1;
        expCategoryMap[cat].total += parseFloat(exp.amount || '0');
      });

      const expenseAnalytics = Object.keys(expCategoryMap).map((cat) => ({
        category: cat,
        type: 'Operating Expense',
        entriesCount: expCategoryMap[cat].count,
        taxableValue: expCategoryMap[cat].total,
        taxAmount: 0,
        totalAmount: expCategoryMap[cat].total,
        percentage: totalExpenses > 0 ? ((expCategoryMap[cat].total / totalExpenses) * 100).toFixed(1) + '%' : '0%',
      }));

      const trendData = [
        { month: 'Jul', revenue: 0, expenses: 0, netProfit: 0 },
        { month: 'Aug', revenue: 0, expenses: 0, netProfit: 0 },
        { month: 'Sept', revenue: totalSales, expenses: totalExpenses, netProfit: totalSales - totalExpenses },
      ];

      res.json({
        youGetRows,
        youGiveRows,
        trendData,
        expenseAnalytics,
        totalReceivables,
        totalPayables,
        totalSales,
        totalExpenses,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Compliance Suite Endpoints (Node 3)
  // 9.1 e-Way Bills — strictly owner/device scoped; never public and never demo-filled.
  app.get('/api/compliance/eway-bills', async (req: Request, res: Response) => {
    try {
      const owner = await requireOwner(req, res);
      if (!owner) return;
      const result = await pool.query(
        'SELECT * FROM eway_bills WHERE owner_mobile_id = $1 ORDER BY created_at DESC',
        [owner]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Unable to load e-Way Bills.' });
    }
  });

  app.post('/api/compliance/eway-bills', async (req: Request, res: Response) => {
    try {
      const owner = await requireOwner(req, res);
      if (!owner) return;
      const data = req.body || {};
      const docNumber = String(data.doc_number || '').trim();
      const docDate = String(data.doc_date || '').trim();
      if (!docNumber || !/^[A-Za-z0-9\/-]+$/.test(docNumber) || !docDate) {
        return res.status(400).json({ error: 'Valid document number and date are required.' });
      }
      // Idempotency: the same owner cannot save the same document twice.
      const duplicate = await pool.query(
        'SELECT id FROM eway_bills WHERE owner_mobile_id=$1 AND doc_number=$2 AND doc_date=$3 LIMIT 1',
        [owner, docNumber, docDate]
      );
      if (duplicate.rows.length) return res.status(409).json({ error: 'This document is already saved as an e-Way Bill.' });

      const id = 'EWB-' + crypto.randomUUID();
      // This is a local reference, NOT a fabricated government-issued E-Way Bill number.
      const ewbNumber = 'LOCAL-' + id.slice(-12);
      const payloadJson = JSON.stringify(data);
      const result = await pool.query(
        `INSERT INTO eway_bills (
          id, owner_mobile_id, supply_type, sub_supply_type, doc_type, doc_number, doc_date,
          transaction_type, from_gstin, from_legal_name, from_address,
          to_gstin, to_legal_name, to_address, total_taxable_value,
          cgst_value, sgst_value, igst_value, total_invoice_value,
          transporter_id, transporter_name, transport_mode, distance_km,
          vehicle_number, status, payload_json, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'DRAFT',$26,NOW()
        ) RETURNING *`,
        [
          id, owner, data.supply_type || 'OUTWARD', data.sub_supply_type || 'SUPPLY', data.doc_type || 'INV',
          docNumber, docDate, data.transaction_type || 'REGULAR', data.from_gstin || '', data.from_legal_name || '',
          data.from_address || '', data.to_gstin || '', data.to_legal_name || '', data.to_address || '',
          Number(data.total_taxable_value || 0), Number(data.total_cgst_amount || 0), Number(data.total_sgst_amount || 0),
          Number(data.total_igst_amount || 0), Number(data.total_consignment_value || 0), data.transporter_id || '',
          data.transporter_name || '', data.mode_of_transport || 'ROAD', Number(data.approx_distance_km || 0),
          String(data.vehicle_number || '').replace(/\s+/g, ''), payloadJson
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: 'Unable to save e-Way Bill.' });
    }
  });

  // 9.2 Credit and Debit Notes
  app.get('/api/compliance/credit-debit-notes', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query('SELECT * FROM credit_debit_notes WHERE user_mobile=$1 ORDER BY created_at DESC', [userMobile]);
      res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/compliance/credit-debit-notes', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const data = req.body || {};
      if (!['CREDIT','DEBIT'].includes(String(data.type || 'CREDIT'))) return res.status(400).json({ error: 'Choose a Credit Note or Debit Note.' });
      if (!String(data.party_name || '').trim()) return res.status(400).json({ error: 'Party name is required.' });
      const amounts = { subtotal: Number(data.sub_total || 0), cgst: Number(data.cgst_total || 0), sgst: Number(data.sgst_total || 0), igst: Number(data.igst_total || 0), total: Number(data.grand_total || 0) };
      if (Object.values(amounts).some((value) => !Number.isFinite(value) || value < 0)) return res.status(400).json({ error: 'Credit/debit note amounts must be valid non-negative values.' });
      if (Math.abs(amounts.total - (amounts.subtotal + amounts.cgst + amounts.sgst + amounts.igst)) > 1.01) return res.status(400).json({ error: 'Note total does not match taxable value plus GST.' });
      const id = 'CDN-' + crypto.randomUUID();
      const noteNum = `${data.type === 'CREDIT' ? 'CN' : 'DN'}/${new Date().getFullYear()}/${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const noteDate = String(data.date || getFormattedDate());
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO credit_debit_notes (id,user_mobile,note_number,type,date,original_invoice_no,original_invoice_date,party_id,party_name,party_gstin,reason,sub_total,cgst_total,sgst_total,igst_total,grand_total,notes,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW()) RETURNING *`,
        [id,userMobile,noteNum,data.type || 'CREDIT',noteDate,data.original_invoice_no || '',data.original_invoice_date || noteDate,data.party_id || '',String(data.party_name).trim(),data.party_gstin || '',data.reason || 'Correction in Invoice Value / Sales Return',amounts.subtotal,amounts.cgst,amounts.sgst,amounts.igst,amounts.total,data.notes || '']
      );
      const isCreditNote = (data.type || 'CREDIT') === 'CREDIT';
      const jeLines: any[] = isCreditNote
        ? [{ account: 'Sales Return & Discount Account', debit: amounts.subtotal, credit: 0 }, { account: `Debtor: ${String(data.party_name).trim()}`, debit: 0, credit: amounts.total }]
        : [{ account: `Debtor: ${String(data.party_name).trim()}`, debit: amounts.total, credit: 0 }, { account: 'Supplementary Sales Revenue', debit: 0, credit: amounts.subtotal }];
      if (amounts.cgst > 0) jeLines.push({ account: 'Output Tax Liability - CGST', debit: isCreditNote ? amounts.cgst : 0, credit: isCreditNote ? 0 : amounts.cgst });
      if (amounts.sgst > 0) jeLines.push({ account: 'Output Tax Liability - SGST', debit: isCreditNote ? amounts.sgst : 0, credit: isCreditNote ? 0 : amounts.sgst });
      if (amounts.igst > 0) jeLines.push({ account: 'Output Tax Liability - IGST', debit: isCreditNote ? amounts.igst : 0, credit: isCreditNote ? 0 : amounts.igst });
      const debitSum = jeLines.reduce((sum,line)=>sum+Number(line.debit||0),0), creditSum = jeLines.reduce((sum,line)=>sum+Number(line.credit||0),0);
      if (Math.abs(debitSum-creditSum) > 0.05) throw new Error('Credit/debit note journal is not balanced.');
      await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [`JE-${id}`,`JV-${noteNum}`,noteDate,isCreditNote?'CREDIT_NOTE':'DEBIT_NOTE',noteNum,`${isCreditNote?'Credit':'Debit'} Note adjustment for ${String(data.party_name).trim()}`,JSON.stringify(jeLines),userMobile]
      );
      await client.query(
        `UPDATE parties SET current_balance=COALESCE(current_balance,0)+$1,updated_at=NOW()
         WHERE user_mobile=$2 AND LOWER(TRIM(name))=LOWER(TRIM($3))`,
        [isCreditNote ? -amounts.total : amounts.total,userMobile,String(data.party_name).trim()]
      );
      await client.query(
        `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
         VALUES ($1,'credit_debit_notes',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`,id,userMobile,JSON.stringify({ note_number: noteNum, type: data.type, grand_total: amounts.total, party_name: data.party_name })]
      );
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to save credit/debit note and journal.' });
    } finally { client.release(); }
  });

  app.get('/api/compliance/journal-entries', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query('SELECT * FROM journal_entries WHERE user_mobile=$1 ORDER BY created_at DESC', [userMobile]);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/compliance/journal-entries', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const { entry_no, date, voucher_type, voucher_ref_no, narration, lines } = req.body || {};
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) return res.status(400).json({ error: 'A journal entry must contain between 2 and 100 lines.' });
      for (const line of lines) {
        const debit = Number(line?.debit ?? 0), credit = Number(line?.credit ?? 0);
        if (!String(line?.account || '').trim() || !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
          return res.status(400).json({ error: 'Each journal line needs an account and valid non-negative debit or credit (not both).' });
        }
      }
      const totalDebit = lines.reduce((sum: number, line: any) => sum + Number(line.debit || 0), 0);
      const totalCredit = lines.reduce((sum: number, line: any) => sum + Number(line.credit || 0), 0);
      if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.05) return res.status(400).json({ error: `Double Entry violation: Debits ₹${totalDebit.toFixed(2)} must equal credits ₹${totalCredit.toFixed(2)}.` });
      const id = 'JE-' + crypto.randomUUID();
      const entryNum = String(entry_no || `JV-${crypto.randomUUID()}`).trim().slice(0, 64);
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
        [id,entryNum,String(date || getFormattedDate()),String(voucher_type || 'JOURNAL'),String(voucher_ref_no || '').slice(0,64),String(narration || 'General accounting adjustment voucher').slice(0,1000),JSON.stringify(lines),userMobile]
      );
      await client.query(
        `INSERT INTO audit_edit_logs (log_id,table_name,record_id,action_type,user_id_context,timestamp_marker,delta_diff_payload)
         VALUES ($1,'journal_entries',$2,'INSERT',$3,NOW(),$4)`,
        [`AEL-${crypto.randomUUID()}`,id,userMobile,JSON.stringify({ entry_no: entryNum, voucher_type, totalDebit, totalCredit })]
      );
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to save journal entry.' });
    } finally { client.release(); }
  });

  // Helper for Dynamic Final Accounts Engine
  async function computeDynamicAccountingEngine(userMobile?: string) {
    if (!userMobile) throw new Error('Login required.');
    const query = 'SELECT * FROM journal_entries WHERE user_mobile = $1 ORDER BY date ASC, created_at ASC';
    const params = [userMobile];
    const jeRes = await pool.query(query, params);
    const journalEntries = jeRes.rows;

    const accountTotals: Record<string, { debit: number; credit: number; group: string; subGroup: string }> = {};

    function addEntry(accName: string, dr: number, cr: number, grp: string, subGrp: string) {
      if (!accountTotals[accName]) {
        accountTotals[accName] = { debit: 0, credit: 0, group: grp, subGroup: subGrp };
      }
      accountTotals[accName].debit += dr;
      accountTotals[accName].credit += cr;
    }

    // 1. Fetch dynamic opening capital from company_profiles
    let userOpeningCapital = 0;
    try {
      const cpQuery = await pool.query(
        "SELECT opening_capital FROM company_profiles WHERE user_mobile = $1 ORDER BY updated_at DESC LIMIT 1",
        [userMobile]
      );
      if (cpQuery.rows.length > 0 && cpQuery.rows[0].opening_capital !== null && cpQuery.rows[0].opening_capital !== undefined) {
        userOpeningCapital = parseFloat(cpQuery.rows[0].opening_capital) || 0;
      }
    } catch (cpErr: any) {
      console.warn('Opening capital query notice:', cpErr.message);
    }

    if (userOpeningCapital > 0) {
      addEntry("Owner's Capital Account", 0, userOpeningCapital, 'Capital Account', 'CAPITAL');
      addEntry("Cash in Hand (Galla/Drawer)", userOpeningCapital, 0, 'Current Assets', 'CASH_IN_HAND');
    }

    // 2. Process real user journal entries
    for (const entry of journalEntries) {
      const lines = typeof entry.lines === 'string' ? JSON.parse(entry.lines) : (entry.lines || []);
      for (const l of lines) {
        const acc = (l.account || 'General Account').trim();
        const dr = parseFloat(l.debit || '0') || 0;
        const cr = parseFloat(l.credit || '0') || 0;

        let grp = 'Current Assets';
        let subGrp = 'ASSETS';

        if (acc.startsWith('Debtor:') || acc.includes('Debtor') || acc.includes('Receivable')) {
          grp = 'Current Assets';
          subGrp = 'SUNDRY_DEBTORS';
        } else if (acc.startsWith('Creditor:') || acc.includes('Creditor') || acc.includes('Payable') || acc.includes('Vendor')) {
          grp = 'Current Liabilities';
          subGrp = 'SUNDRY_CREDITORS';
        } else if (acc.includes('Cash') || acc.includes('Drawer')) {
          grp = 'Current Assets';
          subGrp = 'CASH_IN_HAND';
        } else if (acc.includes('Bank') || acc.includes('HDFC') || acc.includes('SBI')) {
          grp = 'Bank Accounts';
          subGrp = 'BANK_BALANCE';
        } else if (acc.includes('Output Tax') || acc.includes('GST Liability')) {
          grp = 'Current Liabilities';
          subGrp = 'TAX_LIABILITIES';
        } else if (acc.includes('Input Tax') || acc.includes('ITC Pool')) {
          grp = 'Current Assets';
          subGrp = 'TAX_ASSETS';
        } else if (acc.includes('Revenue') || acc.includes('Sales')) {
          grp = 'Sales Revenue';
          subGrp = 'REVENUE';
        } else if (acc.includes('Purchase Asset') || acc.includes('Raw Material') || acc.includes('Purchases')) {
          grp = 'Direct Expenses';
          subGrp = 'PURCHASES';
        } else if (acc.includes('Sales Return') || acc.includes('Discount')) {
          grp = 'Direct Expenses';
          subGrp = 'SALES_RETURNS';
        } else if (acc.includes('Capital')) {
          grp = 'Capital Account';
          subGrp = 'CAPITAL';
        } else if (acc.includes('Drawing')) {
          grp = 'Capital Account';
          subGrp = 'DRAWINGS';
        } else {
          grp = 'Indirect Expenses';
          subGrp = 'OPERATING_EXPENSES';
        }

        addEntry(acc, dr, cr, grp, subGrp);
      }
    }

    // 3. Ingest actual recorded expenses from expenses table if not already journalized
    try {
      const expRes = await pool.query(
        `SELECT e.* FROM expenses e WHERE e.user_mobile=$1
         AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_mobile=e.user_mobile AND j.voucher_type='PAYMENT' AND j.voucher_ref_no=e.expense_no)`,
        params
      );
      for (const exp of expRes.rows) {
        const amt = parseFloat(exp.amount || '0');
        if (amt > 0) {
          const cat = exp.category || 'General Expense';
          const isDirect = ['Direct', 'Freight', 'Raw Material', 'Cartage', 'Packaging'].some(k => cat.toLowerCase().includes(k.toLowerCase()));
          const grp = isDirect ? 'Direct Expenses' : 'Indirect Expenses';
          const sub = isDirect ? 'PURCHASES' : 'OPERATING_EXPENSES';
          const title = exp.title ? `${grp}: ${exp.title}` : grp;
          addEntry(title, amt, 0, grp, sub);
          const bankExpense = String(exp.payment_mode || '').toUpperCase().includes('BANK') || String(exp.payment_mode || '').toUpperCase().includes('ONLINE') || String(exp.payment_mode || '').toUpperCase().includes('UPI');
          addEntry(bankExpense ? 'Bank Account' : 'Cash in Hand (Galla/Drawer)', 0, amt, bankExpense ? 'Bank Accounts' : 'Current Assets', bankExpense ? 'BANK_BALANCE' : 'CASH_IN_HAND');
        }
      }
    } catch (expErr: any) {
      console.warn('Dynamic expenses calculation notice:', expErr.message);
    }

    // Baseline chart of accounts
    const defaultAccountKeys = [
      { name: 'Cash in Hand (Galla/Drawer)', grp: 'Current Assets', sub: 'CASH_IN_HAND' },
      { name: 'Bank Operating Account (HDFC/Current)', grp: 'Bank Accounts', sub: 'BANK_BALANCE' },
      { name: 'Trade Receivables (Sundry Debtors)', grp: 'Current Assets', sub: 'SUNDRY_DEBTORS' },
      { name: 'Input Tax Credit (ITC Pool - CGST/SGST/IGST)', grp: 'Current Assets', sub: 'TAX_ASSETS' },
      { name: 'Trade Payables (Sundry Creditors)', grp: 'Current Liabilities', sub: 'SUNDRY_CREDITORS' },
      { name: 'Output Tax Liability (GST Payable)', grp: 'Current Liabilities', sub: 'TAX_LIABILITIES' },
      { name: "Owner's Capital Account", grp: 'Capital Account', sub: 'CAPITAL' },
      { name: "Owner's Drawings Account", grp: 'Capital Account', sub: 'DRAWINGS' },
      { name: 'GST Taxable Sales Revenue Account', grp: 'Sales Revenue', sub: 'REVENUE' },
      { name: 'Direct Material Purchases Account', grp: 'Direct Expenses', sub: 'PURCHASES' },
    ];

    for (const def of defaultAccountKeys) {
      if (!accountTotals[def.name]) {
        accountTotals[def.name] = { debit: 0, credit: 0, group: def.grp, subGroup: def.sub };
      }
    }

    const trialBalanceAccounts: Array<{
      code: string;
      name: string;
      group: string;
      debit: number;
      credit: number;
      netBalance: number;
      balanceType: 'Dr' | 'Cr';
    }> = [];

    let idx = 1000;
    let totalDebit = 0;
    let totalCredit = 0;

    for (const [name, val] of Object.entries(accountTotals)) {
      idx++;
      const net = val.debit - val.credit;
      const isDr = net >= 0;
      const absNet = Math.abs(net);

      const drVal = isDr ? absNet : 0;
      const crVal = !isDr ? absNet : 0;

      totalDebit += drVal;
      totalCredit += crVal;

      trialBalanceAccounts.push({
        code: String(idx),
        name,
        group: val.group,
        debit: Number(drVal.toFixed(2)),
        credit: Number(crVal.toFixed(2)),
        netBalance: Number(absNet.toFixed(2)),
        balanceType: isDr ? 'Dr' : 'Cr',
      });
    }

    const tbDifference = Number(Math.abs(totalDebit - totalCredit).toFixed(2));
    const isTbBalanced = tbDifference < 0.05;

    let grossSales = 0;
    let salesReturns = 0;
    let grossPurchases = 0;
    let directExpenses = 0;
    const openingStock = 0.00;
    const closingStock = 0.00;

    for (const acc of trialBalanceAccounts) {
      if (acc.group === 'Sales Revenue') {
        grossSales += acc.credit;
      } else if (acc.group === 'Direct Expenses') {
        if (acc.name.includes('Return')) {
          salesReturns += acc.debit;
        } else {
          grossPurchases += acc.debit;
        }
      }
    }

    const netSales = Number((grossSales - salesReturns).toFixed(2));
    const netPurchases = Number(grossPurchases.toFixed(2));
    const cogs = Number((openingStock + netPurchases + directExpenses - closingStock).toFixed(2));
    const grossProfit = Number((netSales - cogs).toFixed(2));

    let indirectIncomes = 0;
    let operatingExpenses = 0;

    for (const acc of trialBalanceAccounts) {
      if (acc.group === 'Indirect Expenses') {
        operatingExpenses += acc.debit;
      }
    }

    const netProfit = Number((grossProfit + indirectIncomes - operatingExpenses).toFixed(2));

    let openingCapital = 0;
    let drawings = 0;
    let sundryCreditors = 0;
    let taxLiabilities = 0;
    let fixedAssets = 0;
    let sundryDebtors = 0;
    let cashInHand = 0;
    let bankBalance = 0;
    let itcPool = 0;

    for (const acc of trialBalanceAccounts) {
      if (acc.group === 'Capital Account') {
        if (acc.name.includes('Drawing')) {
          drawings += acc.debit;
        } else {
          openingCapital += acc.credit;
        }
      } else if (acc.group === 'Current Liabilities') {
        if (acc.name.includes('Tax') || acc.name.includes('GST')) {
          taxLiabilities += acc.credit;
        } else {
          sundryCreditors += acc.credit;
        }
      } else if (acc.group === 'Current Assets') {
        if (acc.name.includes('Debtor') || acc.name.includes('Receivable')) {
          sundryDebtors += acc.debit;
        } else if (acc.name.includes('Cash') || acc.name.includes('Drawer')) {
          cashInHand += acc.debit;
        } else if (acc.name.includes('Input Tax') || acc.name.includes('ITC')) {
          itcPool += acc.debit;
        }
      } else if (acc.group === 'Bank Accounts') {
        bankBalance += acc.debit;
      }
    }

    const closingCapital = Number((openingCapital + netProfit - drawings).toFixed(2));
    const totalLiabilities = Number((closingCapital + sundryCreditors + taxLiabilities).toFixed(2));
    const totalAssets = Number((fixedAssets + closingStock + sundryDebtors + cashInHand + bankBalance + itcPool).toFixed(2));
    const bsDifference = Number(Math.abs(totalAssets - totalLiabilities).toFixed(2));
    const isBsBalanced = bsDifference < 0.05;

    return {
      trialBalance: {
        accounts: trialBalanceAccounts,
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        difference: tbDifference,
        balanced: isTbBalanced,
        asOfDate: getFormattedDate(),
      },
      tradingAccount: {
        openingStock,
        grossSales,
        salesReturns,
        netSales,
        grossPurchases,
        netPurchases,
        directExpenses,
        closingStock,
        cogs,
        grossProfit,
      },
      profitLoss: {
        period: 'FY 2026-27 (Current Active Accounting Period)',
        grossProfitBroughtForward: grossProfit,
        indirectIncomes,
        operatingExpenses,
        netProfitBeforeTax: netProfit,
        taxProvision: 0.00,
        netProfitAfterTax: netProfit,
      },
      balanceSheet: {
        asOfDate: getFormattedDate(),
        liabilities: {
          openingCapital,
          addNetProfit: netProfit,
          lessDrawings: drawings,
          closingCapital,
          sundryCreditors,
          taxLiabilities,
          totalLiabilities,
        },
        assets: {
          fixedAssets,
          closingStock,
          sundryDebtors,
          cashInHand,
          bankBalance,
          itcPool,
          totalAssets,
        },
        difference: bsDifference,
        balanced: isBsBalanced,
      }
    };
  }

  // 9.4 Trial Balance live generation
  app.get('/api/compliance/trial-balance', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const data = await computeDynamicAccountingEngine(userMobile);
      res.json(data.trialBalance);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.5 Dynamic Profit & Loss Statement Matrix
  app.get('/api/compliance/profit-loss', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const data = await computeDynamicAccountingEngine(userMobile);
      res.json(data.profitLoss);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.6 Schedule-Mapped Corporate Balance Sheet
  app.get('/api/compliance/balance-sheet', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const data = await computeDynamicAccountingEngine(userMobile);
      res.json(data.balanceSheet);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Consolidated Final Accounts API
  app.get('/api/accounting/final-accounts', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const data = await computeDynamicAccountingEngine(userMobile);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.6A Bank statement ingestion: extracted records are isolated to the current owner and are used only by BRS.
  app.post('/api/accounting/brs/upload', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    let extracted: any[] = [];
    try {
      const { rawPdfBase64, records } = req.body || {};
      extracted = Array.isArray(records) ? records : [];
      if (!extracted.length && rawPdfBase64 && ai) {
        const clean = String(rawPdfBase64).replace(/^data:application\/pdf;base64,/, '');
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts: [
            { inlineData: { mimeType: 'application/pdf', data: clean } },
            { text: 'Extract every bank statement transaction exactly as printed. Never invent or calculate missing values. Return JSON array only with statement_date, value_date, description, ref_cheque_no, debit_withdrawal, credit_deposit, balance. Use null for unreadable/missing fields.' }
          ] },
          config: { responseMimeType: 'application/json', responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
            statement_date: { type: Type.STRING }, value_date: { type: Type.STRING }, description: { type: Type.STRING }, ref_cheque_no: { type: Type.STRING },
            debit_withdrawal: { type: Type.NUMBER }, credit_deposit: { type: Type.NUMBER }, balance: { type: Type.NUMBER }
          } } } }
        });
        extracted = response.text ? JSON.parse(response.text) : [];
      }
      if (!extracted.length) return res.status(400).json({ error: 'No bank statement rows could be read. Please upload a clear PDF or enter rows manually.' });
      if (extracted.length > 5000) return res.status(413).json({ error: 'A statement upload is limited to 5,000 rows at a time.' });
      const normalized = [];
      for (let index = 0; index < extracted.length; index++) {
        const row = extracted[index] || {};
        const statementDate = String(row.statement_date || '').trim();
        const description = String(row.description || '').trim();
        const ref = String(row.ref_cheque_no || '').trim();
        if (!statementDate || (!description && !ref)) return res.status(400).json({ error: `Bank statement row ${index + 1} is missing its date or description/reference.` });
        const debit = row.debit_withdrawal == null ? null : Number(row.debit_withdrawal);
        const credit = row.credit_deposit == null ? null : Number(row.credit_deposit);
        const balance = row.balance == null ? null : Number(row.balance);
        if ((debit == null && credit == null) || (debit != null && (!Number.isFinite(debit) || debit < 0)) || (credit != null && (!Number.isFinite(credit) || credit < 0)) || (balance != null && (!Number.isFinite(balance) || balance < 0))) {
          return res.status(400).json({ error: `Bank statement row ${index + 1} has missing or invalid numeric values. Correct it before importing.` });
        }
        if ((debit || 0) > 0 && (credit || 0) > 0) return res.status(400).json({ error: `Bank statement row ${index + 1} cannot have both debit and credit amounts.` });
        normalized.push({ statementDate, valueDate: String(row.value_date || statementDate).trim(), description, ref, debit: debit ?? 0, credit: credit ?? 0, balance });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = [];
        for (const row of normalized) {
          const id = 'BRS-' + crypto.randomUUID();
          const result = await client.query(
            `INSERT INTO bank_statement_records (id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,balance,reconciliation_status,record_source,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNRECONCILED','BANK_STATEMENT',NOW()) RETURNING *`,
            [id,userMobile,row.statementDate,row.valueDate,row.description,row.ref,row.debit,row.credit,row.balance]
          );
          inserted.push(result.rows[0]);
        }
        await client.query('COMMIT');
        res.json({ success: true, count: inserted.length, records: inserted });
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally { client.release(); }
    } catch (err: any) {
      res.status(500).json({ error: 'Bank statement processing failed: ' + err.message });
    }
  });

  app.get('/api/accounting/tax-ledger-balances', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query(`SELECT electronic_cash_balance, electronic_credit_balance, updated_at FROM tax_ledger_opening_balances WHERE user_mobile=$1`, [userMobile]);
      res.json(result.rows[0] || { electronic_cash_balance: 0, electronic_credit_balance: 0, updated_at: null });
    } catch (err: any) { res.status(500).json({ error: err.message || 'Unable to load tax ledger balances.' }); }
  });

  app.put('/api/accounting/tax-ledger-balances', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const cash = Number(req.body?.electronic_cash_balance);
      const credit = Number(req.body?.electronic_credit_balance);
      if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(credit) || credit < 0) return res.status(400).json({ error: 'Balances must be valid non-negative amounts.' });
      const result = await pool.query(`INSERT INTO tax_ledger_opening_balances(user_mobile,electronic_cash_balance,electronic_credit_balance,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(user_mobile) DO UPDATE SET electronic_cash_balance=EXCLUDED.electronic_cash_balance,electronic_credit_balance=EXCLUDED.electronic_credit_balance,updated_at=NOW() RETURNING electronic_cash_balance,electronic_credit_balance,updated_at`, [userMobile, cash, credit]);
      res.json(result.rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message || 'Unable to save tax ledger balances.' }); }
  });

  app.get('/api/accounting/brs/records', async (req: Request, res: Response) => {
    try { const userMobile=getUserMobile(req); if(!userMobile)return res.status(401).json({error:'Login required.'}); const r=await pool.query('SELECT * FROM bank_statement_records WHERE user_mobile=$1 ORDER BY statement_date DESC, created_at DESC',[userMobile]); res.json(r.rows); }
    catch(err:any){res.status(500).json({error:err.message});}
  });

  app.post('/api/accounting/brs/manual-entry', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const b = req.body || {};
      if (!b.statement_date || !String(b.description || '').trim()) return res.status(400).json({ error: 'Date and description are required.' });
      const debit = Number(b.debit_withdrawal || 0);
      const credit = Number(b.credit_deposit || 0);
      const balance = b.balance == null || b.balance === '' ? null : Number(b.balance);
      if (!Number.isFinite(debit) || debit < 0 || !Number.isFinite(credit) || credit < 0 || (balance !== null && (!Number.isFinite(balance) || balance < 0))) return res.status(400).json({ error: 'Enter valid non-negative debit, credit, and balance amounts.' });
      if (debit > 0 && credit > 0) return res.status(400).json({ error: 'Enter either a debit or a credit amount, not both.' });
      if (balance !== null) {
        const latest = await pool.query(`SELECT statement_date,balance FROM bank_statement_records WHERE user_mobile=$1 AND record_source='BANK_STATEMENT' AND balance IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [userMobile]);
        if (latest.rows.length) {
          const prior = latest.rows[0];
          const parseStatementDate = (value: string) => {
            const raw = String(value || '').trim();
            const parts = raw.split(/[\/-]/);
            if (parts.length === 3) {
              const yearFirst = parts[0].length === 4;
              const year = Number(yearFirst ? parts[0] : parts[2]);
              const month = Number(parts[1]);
              const day = Number(yearFirst ? parts[2] : parts[0]);
              const d = new Date(year, month - 1, day);
              return Number.isNaN(d.getTime()) ? 0 : d.getTime();
            }
            const t = Date.parse(raw); return Number.isNaN(t) ? 0 : t;
          };
          const newDateMs = parseStatementDate(String(b.statement_date));
          const priorDateMs = parseStatementDate(String(prior.statement_date));
          if (newDateMs && priorDateMs && newDateMs >= priorDateMs) {
            const expected = Number(prior.balance) - debit + credit;
            if (Math.abs(expected - balance) > 1.00) return res.status(400).json({ error: `Bank balance mismatch. Based on the latest saved balance, the expected balance is ₹${expected.toFixed(2)}.` });
          }
        }
      }
      const id = 'BRS-' + crypto.randomUUID();
      const result = await pool.query(`INSERT INTO bank_statement_records(id,user_mobile,statement_date,value_date,description,ref_cheque_no,debit_withdrawal,credit_deposit,balance,reconciliation_status,record_source,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNRECONCILED','BANK_STATEMENT',NOW()) RETURNING *`, [id, userMobile, String(b.statement_date), String(b.value_date || ''), String(b.description).trim(), String(b.ref_cheque_no || ''), debit, credit, balance]);
      res.status(201).json(result.rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message || 'Unable to add bank entry.' }); }
  });

  // 9.6B BRS reconciliation: use persisted tenant-owned statement rows and persist every result.
  app.post('/api/accounting/brs/reconcile', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const stmtRes = await client.query(
        `SELECT * FROM bank_statement_records
         WHERE user_mobile = $1 AND record_source = 'BANK_STATEMENT'
         ORDER BY statement_date ASC, created_at ASC`,
        [userMobile]
      );
      const stmtList: any[] = stmtRes.rows.filter((row: any) =>
        row?.debit_withdrawal != null && row?.credit_deposit != null
      );
      const jeRes = await client.query(
        `SELECT * FROM journal_entries
         WHERE user_mobile = $1
           AND voucher_type IN ('PAYMENT', 'RECEIPT', 'CONTRA', 'SALES', 'PURCHASE', 'BRS_ADJUSTMENT')
         ORDER BY date ASC, created_at ASC`,
        [userMobile]
      );
      const bookEntries = jeRes.rows.map((row: any) => {
        const lines = typeof row.lines === 'string' ? JSON.parse(row.lines) : (row.lines || []);
        const bankLine = lines.find((line: any) => {
          const account = String(line.account || '').toLowerCase();
          return account.includes('bank') || account.includes('hdfc');
        });
        return {
          id: String(row.id), entry_no: row.entry_no, date: row.date,
          voucher_type: row.voucher_type, ref_no: row.voucher_ref_no,
          narration: row.narration,
          debit: bankLine ? Number(bankLine.debit || 0) : 0,
          credit: bankLine ? Number(bankLine.credit || 0) : 0,
        };
      }).filter((entry: any) => entry.debit > 0 || entry.credit > 0);

      const cleared: any[] = [];
      const unpresentedCheques: any[] = [];
      const unclearedDeposits: any[] = [];
      const missingInBooks: any[] = [];
      const matchedBookIds = new Set<string>();

      function parseDateMs(value: unknown): number {
        const str = String(value || '').trim();
        if (!str) return 0;
        const parts = str.split(/[-/]/);
        if (parts.length === 3) {
          const yearFirst = parts[0].length === 4;
          const year = Number(yearFirst ? parts[0] : parts[2]);
          const month = Number(parts[1]);
          const day = Number(yearFirst ? parts[2] : parts[0]);
          if (!year || month < 1 || month > 12 || day < 1 || day > 31) return 0;
          const date = new Date(year, month - 1, day);
          return Number.isNaN(date.getTime()) ? 0 : date.getTime();
        }
        const parsed = Date.parse(str);
        return Number.isNaN(parsed) ? 0 : parsed;
      }

      for (const stmt of stmtList) {
        const stmtDateMs = parseDateMs(stmt.statement_date || stmt.date);
        const withdrawal = Number(stmt.debit_withdrawal || stmt.withdrawal || 0);
        const deposit = Number(stmt.credit_deposit || stmt.deposit || 0);
        const refNo = String(stmt.ref_cheque_no || stmt.ref_no || '').trim().toLowerCase();
        const candidates = bookEntries.filter((book: any) => {
          if (matchedBookIds.has(book.id)) return false;
          const bookDateMs = parseDateMs(book.date);
          const diffDays = stmtDateMs && bookDateMs ? Math.abs(stmtDateMs - bookDateMs) / 86400000 : Infinity;
          const withdrawalMatch = withdrawal > 0 && Math.abs(withdrawal - book.credit) < 0.05;
          const depositMatch = deposit > 0 && Math.abs(deposit - book.debit) < 0.05;
          const bookRef = String(book.ref_no || '').trim().toLowerCase();
          const refMatch = !!refNo && !!bookRef && (bookRef === refNo || bookRef.includes(refNo) || refNo.includes(bookRef));
          return (withdrawalMatch || depositMatch) && (diffDays <= 5 || refMatch);
        }).sort((a: any, b: any) => {
          const aRef = String(a.ref_no || '').trim().toLowerCase() === refNo && !!refNo ? 0 : 1;
          const bRef = String(b.ref_no || '').trim().toLowerCase() === refNo && !!refNo ? 0 : 1;
          if (aRef !== bRef) return aRef - bRef;
          const aDate = parseDateMs(a.date), bDate = parseDateMs(b.date);
          const aDiff = stmtDateMs && aDate ? Math.abs(stmtDateMs - aDate) : Infinity;
          const bDiff = stmtDateMs && bDate ? Math.abs(stmtDateMs - bDate) : Infinity;
          return aDiff - bDiff;
        });
        // If multiple equally plausible matches exist, do not auto-clear an ambiguous transaction.
        if (candidates.length > 1) {
          const first = candidates[0], second = candidates[1];
          const firstDate = parseDateMs(first.date), secondDate = parseDateMs(second.date);
          const firstDiff = stmtDateMs && firstDate ? Math.abs(stmtDateMs - firstDate) : Infinity;
          const secondDiff = stmtDateMs && secondDate ? Math.abs(stmtDateMs - secondDate) : Infinity;
          const exactRef = (book: any) => !!refNo && String(book.ref_no || '').trim().toLowerCase() === refNo;
          if (exactRef(first) === exactRef(second) && firstDiff === secondDiff) {
            missingInBooks.push({ ...stmt, reconciliation_note: 'Ambiguous match; manual review required.' });
            continue;
          }
        }
        if (candidates.length) {
          const book = candidates[0];
          matchedBookIds.add(book.id);
          cleared.push({ statementItem: stmt, bookItem: book, clearingDate: stmt.statement_date || stmt.date, matchedRef: book.ref_no || refNo });
        } else {
          missingInBooks.push(stmt);
        }
      }

      for (const book of bookEntries) {
        if (!matchedBookIds.has(book.id)) {
          if (book.credit > 0) unpresentedCheques.push(book);
          else if (book.debit > 0) unclearedDeposits.push(book);
        }
      }

      await client.query('BEGIN');
      // Reset only this tenant's prior computed matches, then persist the new deterministic result.
      await client.query(
        `UPDATE bank_statement_records SET reconciliation_status='UNRECONCILED', clearing_date=NULL, matched_journal_entry_id=NULL
         WHERE user_mobile=$1 AND record_source='BANK_STATEMENT'`, [userMobile]
      );
      await client.query(
        `UPDATE journal_entries SET reconciliation_status='UNRECONCILED', reconciled_at=NULL
         WHERE user_mobile=$1 AND voucher_type IN ('PAYMENT','RECEIPT','CONTRA','SALES','PURCHASE','BRS_ADJUSTMENT')`, [userMobile]
      );
      for (const match of cleared) {
        const statementId = String(match.statementItem.id || '');
        if (!statementId) continue;
        await client.query(
          `UPDATE bank_statement_records
           SET reconciliation_status='CLEARED', clearing_date=$1, matched_journal_entry_id=$2
           WHERE id=$3 AND user_mobile=$4 AND record_source='BANK_STATEMENT'`,
          [String(match.clearingDate || '').slice(0, 16), match.bookItem.id, statementId, userMobile]
        );
        await client.query(
          `UPDATE journal_entries SET reconciliation_status='CLEARED', reconciled_at=NOW()
           WHERE id=$1 AND user_mobile=$2`, [match.bookItem.id, userMobile]
        );
      }
      for (const item of missingInBooks) {
        if (item?.id) await client.query(
          `UPDATE bank_statement_records SET reconciliation_status='MISSING_IN_BOOKS'
           WHERE id=$1 AND user_mobile=$2 AND record_source='BANK_STATEMENT'`, [item.id, userMobile]
        );
      }
      await client.query('COMMIT');

      res.json({
        reconciledAt: new Date().toISOString(),
        persisted: true,
        summary: {
          totalStatementRows: stmtList.length, totalBookRows: bookEntries.length,
          clearedCount: cleared.length, unpresentedChequesCount: unpresentedCheques.length,
          unclearedDepositsCount: unclearedDeposits.length, missingInBooksCount: missingInBooks.length,
        },
        buckets: { cleared, unpresentedCheques, unclearedDeposits, missingInBooks },
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to reconcile bank statement.' });
    } finally {
      client.release();
    }
  });

  // Single-click Prompt Button: [+ Create Voucher] for missing bank entry
  app.post('/api/accounting/brs/create-voucher', async (req: Request, res: Response) => {
    try {
      const { date, description, ref_no, amount, type, account_category } = req.body;
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const amt = parseFloat(amount || '0');

      if (amt <= 0) {
        return res.status(400).json({ error: 'Valid transaction amount is required' });
      }

      const jeId = 'JE-BRS-' + crypto.randomUUID();
      const entryNum = `JV-BRS-${crypto.randomUUID()}`;

      // If bank withdrawal (money went out): Debit: Expense/Category, Credit: Bank Operating A/c
      // If bank deposit (money came in): Debit: Bank Operating A/c, Credit: Income/Category
      const isWithdrawal = type === 'WITHDRAWAL' || type === 'PAYMENT';
      const targetAccount = account_category || (isWithdrawal ? 'Bank & Processing Charges' : 'Direct Customer Bank Receipt');

      const jeLines = isWithdrawal
        ? [
            { account: targetAccount, debit: amt, credit: 0 },
            { account: 'Bank Operating Account (HDFC/Current)', debit: 0, credit: amt },
          ]
        : [
            { account: 'Bank Operating Account (HDFC/Current)', debit: amt, credit: 0 },
            { account: targetAccount, debit: 0, credit: amt },
          ];

      const result = await pool.query(
        `INSERT INTO journal_entries (id, entry_no, date, voucher_type, voucher_ref_no, narration, lines, user_mobile, created_at)
         VALUES ($1, $2, $3, 'BRS_ADJUSTMENT', $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
          jeId,
          entryNum,
          date || getFormattedDate(),
          ref_no || `BRS-${Date.now().toString().slice(-4)}`,
          `BRS Reconciled Entry: ${description || 'Bank auto-charge or direct adjustment'}`,
          JSON.stringify(jeLines),
          userMobile,
        ]
      );

      // Immutable Audit Edit Log
      try {
        const logId = 'AEL-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        await pool.query(
          `INSERT INTO audit_edit_logs (log_id, table_name, record_id, action_type, user_id_context, timestamp_marker, delta_diff_payload)
           VALUES ($1, 'journal_entries', $2, 'INSERT', $3, NOW(), $4)`,
          [logId, jeId, userMobile, JSON.stringify({ action: 'BRS_CREATE_VOUCHER', entry_no: entryNum, amount: amt, type, narration: description })]
        );
      } catch (logErr) {
        console.warn('Audit edit log write skipped for BRS voucher:', logErr);
      }

      res.status(201).json({
        success: true,
        message: 'Voucher created. Run BRS reconciliation to match it against the imported bank statement.',
        voucher: result.rows[0],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.7 Forensic Audit Logs
  app.get('/api/compliance/audit-logs', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query('SELECT * FROM audit_edit_logs WHERE user_id_context=$1 ORDER BY timestamp_marker DESC LIMIT 50', [userMobile]);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.8 3-Tier Input Tax Credit (ITC) Compliance Master Grid Matrix (Dynamic from real DB tables)
  app.get('/api/compliance/itc-matrix', async (req: Request, res: Response) => {
    if (!getUserMobile(req)) return res.status(401).json({ error: 'Login required.' });
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];

      // 1. All other ITC from permanent_purchase_ledger (fallback to real purchases)
      const verifiedLedgerFilter = userMobile
        ? "WHERE user_mobile = $1 AND gstr2b_verified = TRUE AND verification_source IN ('GSTR2B_VERIFIED','GSTR2B_RECONCILED')"
        : "WHERE gstr2b_verified = TRUE AND verification_source IN ('GSTR2B_VERIFIED','GSTR2B_RECONCILED')";
      const inputRes = await pool.query(
        `SELECT 
           COALESCE(SUM(cgst), 0) as total_cgst,
           COALESCE(SUM(sgst), 0) as total_sgst,
           COALESCE(SUM(igst), 0) as total_igst,
           COUNT(*) as verified_count
         FROM permanent_purchase_ledger ${verifiedLedgerFilter}`,
        params
      );

      let inputCgst = parseFloat(inputRes.rows[0]?.total_cgst || '0');
      let inputSgst = parseFloat(inputRes.rows[0]?.total_sgst || '0');
      let inputIgst = parseFloat(inputRes.rows[0]?.total_igst || '0');
      const verifiedCount = parseInt(inputRes.rows[0]?.verified_count || '0');

      // Unverified purchase rows are deliberately excluded from eligible ITC.

      // 2. Inward Reverse Charge (RCM) from invoices
      const rcmRes = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN is_inter_state = false THEN rcm_calculated_tax / 2 ELSE 0 END), 0) as rcm_cgst,
           COALESCE(SUM(CASE WHEN is_inter_state = false THEN rcm_calculated_tax / 2 ELSE 0 END), 0) as rcm_sgst,
           COALESCE(SUM(CASE WHEN is_inter_state = true THEN rcm_calculated_tax ELSE 0 END), 0) as rcm_igst
         FROM purchases ${filter ? filter + ' AND (rcm_applicable = true OR is_reverse_charge = true)' : 'WHERE (rcm_applicable = true OR is_reverse_charge = true)'}`,
        params
      );

      const rcmCgst = parseFloat(rcmRes.rows[0]?.rcm_cgst || '0');
      const rcmSgst = parseFloat(rcmRes.rows[0]?.rcm_sgst || '0');
      const rcmIgst = parseFloat(rcmRes.rows[0]?.rcm_igst || '0');

      // 3. Ineligible Tax Logs (Section 17(5))
      const ineligRes = await pool.query(
        `SELECT 
           COALESCE(SUM(amount), 0) as total_blocked
         FROM ineligible_tax_logs ${filter}`,
        params
      );
      const totalBlocked = parseFloat(ineligRes.rows[0]?.total_blocked || '0');

      // RCM liability is not itself available ITC; credits are counted only after eligibility/payment rules are satisfied.
      const availCgst = inputCgst;
      const availSgst = inputSgst;
      const availIgst = inputIgst;
      const totalAvail = availCgst + availSgst + availIgst;

      res.json({
        financialYear: (() => { const now = new Date(); const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return `${startYear}-${String(startYear + 1).slice(-2)}`; })(),
        taxPeriod: 'Current',
        table4A_Available: {
          importOfGoods: null,
          importOfServices: null,
          inwardReverseCharge: { cgst: rcmCgst, sgst: rcmSgst, igst: rcmIgst },
          inwardISD: null,
          allOtherITC: { cgst: inputCgst, sgst: inputSgst, igst: inputIgst, total: inputCgst + inputSgst + inputIgst },
        },
        table4B_Reversed: {
          rule38_42_43: null,
          otherReversals: null,
        },
        table4C_NetITCAvailable: {
          cgst: availCgst,
          sgst: availSgst,
          igst: availIgst,
          total: totalAvail,
        },
        table4D_Ineligible: {
          section17_5_Blocked: { 
            cgst: null, 
            sgst: null, 
            igst: null, 
            total: totalBlocked,
            reason: totalBlocked > 0 ? 'Blocked ITC under Section 17(5)' : 'None' 
          },
          itcReclaimedOthers: null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dynamic ITC Cockpit Data: Input (strictly 100% matched/permanent) vs Output GST vs "You Pay" Net Liability
  app.get('/api/compliance/itc-summary', async (req: Request, res: Response) => {
    if (!getUserMobile(req)) return res.status(401).json({ error: 'Login required.' });
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];
      const verifiedLedgerFilter = userMobile
        ? "WHERE user_mobile = $1 AND gstr2b_verified = TRUE AND verification_source IN ('GSTR2B_VERIFIED','GSTR2B_RECONCILED')"
        : "WHERE gstr2b_verified = TRUE AND verification_source IN ('GSTR2B_VERIFIED','GSTR2B_RECONCILED')";

      // Eligible ITC is restricted to records explicitly promoted after GSTR-2B reconciliation.
      const inputRes = await pool.query(
        `SELECT 
           COALESCE(SUM(cgst), 0) as total_cgst,
           COALESCE(SUM(sgst), 0) as total_sgst,
           COALESCE(SUM(igst), 0) as total_igst,
           COALESCE(SUM(taxable_value), 0) as total_taxable,
           COALESCE(SUM(total_value), 0) as total_value,
           COUNT(*) as verified_count
         FROM permanent_purchase_ledger ${verifiedLedgerFilter}`,
        params
      );

      let inputCgst = parseFloat(inputRes.rows[0]?.total_cgst || '0');
      let inputSgst = parseFloat(inputRes.rows[0]?.total_sgst || '0');
      let inputIgst = parseFloat(inputRes.rows[0]?.total_igst || '0');
      let inputTaxable = parseFloat(inputRes.rows[0]?.total_taxable || '0');
      let inputTotal = parseFloat(inputRes.rows[0]?.total_value || '0');
      let verifiedCount = parseInt(inputRes.rows[0]?.verified_count || '0');

      // No fallback to raw purchases: only records explicitly promoted into the verified ledger count as ITC.

      const totalInputITC = inputCgst + inputSgst + inputIgst;

      // 2. Output GST Liability from all recorded Sales Invoices
      const outputRes = await pool.query(
        `SELECT 
           COALESCE(SUM(cgst_total), 0) as total_cgst,
           COALESCE(SUM(sgst_total), 0) as total_sgst,
           COALESCE(SUM(igst_total), 0) as total_igst,
           COALESCE(SUM(sub_total), 0) as total_taxable,
           COALESCE(SUM(grand_total), 0) as total_sales,
           COUNT(*) as invoice_count
         FROM invoices ${filter}`,
        params
      );

      const outputCgst = parseFloat(outputRes.rows[0]?.total_cgst || '0');
      const outputSgst = parseFloat(outputRes.rows[0]?.total_sgst || '0');
      const outputIgst = parseFloat(outputRes.rows[0]?.total_igst || '0');
      const outputTaxable = parseFloat(outputRes.rows[0]?.total_taxable || '0');
      const totalOutputTax = outputCgst + outputSgst + outputIgst;

      // 3. RCM Liability
      const rcmRes = await pool.query(
        `SELECT COALESCE(SUM(rcm_calculated_tax), 0) as rcm_liability FROM purchases ${filter ? filter + ' AND (is_reverse_charge = true OR rcm_applicable = true)' : 'WHERE (is_reverse_charge = true OR rcm_applicable = true)'}`,
        params
      );
      const rcmLiability = parseFloat(rcmRes.rows[0]?.rcm_liability || '0');

      // 4. Strict Statutory Priority Ordering Loops for GSTR-3B Tax Offset (Section 49, 49A, 49B & Rule 88A)
      // Statutory Rule 1: IGST Credit MUST be utilized FIRST against IGST liability.
      // Any remaining IGST credit can be utilized towards CGST and SGST liability.
      // Statutory Rule 2: CGST Credit pays CGST liability, then remaining IGST liability. (CGST cannot pay SGST!)
      // Statutory Rule 3: SGST Credit pays SGST liability, then remaining IGST liability. (SGST cannot pay CGST!)
      let remInputIgst = inputIgst;
      let remInputCgst = inputCgst;
      let remInputSgst = inputSgst;

      let remOutputIgst = outputIgst;
      let remOutputCgst = outputCgst;
      let remOutputSgst = outputSgst;

      const offsetReport = {
        igst_against_igst: 0,
        igst_against_cgst: 0,
        igst_against_sgst: 0,
        cgst_against_cgst: 0,
        cgst_against_igst: 0,
        sgst_against_sgst: 0,
        sgst_against_igst: 0,
      };

      // Step 1: IGST Credit offsets IGST Liability
      const igstToIgst = Math.min(remInputIgst, remOutputIgst);
      remInputIgst -= igstToIgst;
      remOutputIgst -= igstToIgst;
      offsetReport.igst_against_igst = igstToIgst;

      // Step 2: Remaining IGST Credit offsets CGST Liability, then SGST Liability
      if (remInputIgst > 0 && remOutputCgst > 0) {
        const igstToCgst = Math.min(remInputIgst, remOutputCgst);
        remInputIgst -= igstToCgst;
        remOutputCgst -= igstToCgst;
        offsetReport.igst_against_cgst = igstToCgst;
      }
      if (remInputIgst > 0 && remOutputSgst > 0) {
        const igstToSgst = Math.min(remInputIgst, remOutputSgst);
        remInputIgst -= igstToSgst;
        remOutputSgst -= igstToSgst;
        offsetReport.igst_against_sgst = igstToSgst;
      }

      // Step 3: CGST Credit offsets CGST Liability first, then remaining IGST Liability
      // Statutory restriction: CGST CANNOT pay SGST liability!
      const cgstToCgst = Math.min(remInputCgst, remOutputCgst);
      remInputCgst -= cgstToCgst;
      remOutputCgst -= cgstToCgst;
      offsetReport.cgst_against_cgst = cgstToCgst;

      if (remInputCgst > 0 && remOutputIgst > 0) {
        const cgstToIgst = Math.min(remInputCgst, remOutputIgst);
        remInputCgst -= cgstToIgst;
        remOutputIgst -= cgstToIgst;
        offsetReport.cgst_against_igst = cgstToIgst;
      }

      // Step 4: SGST Credit offsets SGST Liability first, then remaining IGST Liability
      // Statutory restriction: SGST CANNOT pay CGST liability!
      const sgstToSgst = Math.min(remInputSgst, remOutputSgst);
      remInputSgst -= sgstToSgst;
      remOutputSgst -= sgstToSgst;
      offsetReport.sgst_against_sgst = sgstToSgst;

      if (remInputSgst > 0 && remOutputIgst > 0) {
        const sgstToIgst = Math.min(remInputSgst, remOutputIgst);
        remInputSgst -= sgstToIgst;
        remOutputIgst -= sgstToIgst;
        offsetReport.sgst_against_igst = sgstToIgst;
      }

      // Step 5: Net Cash Payable after statutory offsets (RCM must strictly be paid in cash under GST rules)
      const netIgstPayable = remOutputIgst;
      const netCgstPayable = remOutputCgst;
      const netSgstPayable = remOutputSgst;
      const totalYouPay = netIgstPayable + netCgstPayable + netSgstPayable + rcmLiability;
      const itcCarryForward = remInputIgst + remInputCgst + remInputSgst;

      res.json({
        inputITC: {
          cgst: inputCgst,
          sgst: inputSgst,
          igst: inputIgst,
          total: totalInputITC,
          taxableValue: inputTaxable,
          totalValue: inputTotal,
          verifiedBillsCount: verifiedCount,
        },
        outputGST: {
          cgst: outputCgst,
          sgst: outputSgst,
          igst: outputIgst,
          total: totalOutputTax,
          taxableValue: outputTaxable,
          invoicesCount: parseInt(outputRes.rows[0]?.invoice_count || '0'),
        },
        rcmLiability,
        offsetReport,
        netPayable: {
          netIgst: netIgstPayable,
          netCgst: netCgstPayable,
          netSgst: netSgstPayable,
          rcmCharges: rcmLiability,
          totalYouPay: totalYouPay,
          itcCarryForward: itcCarryForward,
          carryForwardBreakdown: {
            igst: remInputIgst,
            cgst: remInputCgst,
            sgst: remInputSgst,
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.9 Forensic Audit Edit Logs (audit_edit_logs)
  app.get('/api/compliance/audit-edit-logs', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const result = await pool.query('SELECT * FROM audit_edit_logs WHERE user_id_context=$1 ORDER BY timestamp_marker DESC LIMIT 100', [userMobile]);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.10 Cash Book Layout Data
  app.get('/api/compliance/cash-book', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];

      const invRes = await pool.query(
        `SELECT id, invoice_number as ref_no, date, party_name as particulars, grand_total as amount, 'RECEIPT' as type FROM invoices ${filter ? filter + ' AND' : 'WHERE'} payment_mode = 'CASH'`,
        params
      );
      const csRes = await pool.query(
        `SELECT id, 'EOD Drawer Cash' as ref_no, date, 'B2C Daily Cash Drawer Count' as particulars, cash_in_hand as amount, 'RECEIPT' as type FROM daily_cash_summaries ${filter ? filter + " AND" : 'WHERE'} COALESCE(counter_sales, '[]'::jsonb) = '[]'::jsonb AND COALESCE(counter_purchases, '[]'::jsonb) = '[]'::jsonb`,
        params
      );
      const expRes = await pool.query(
        `SELECT id, title as ref_no, date, COALESCE(title, category, 'Cash Expense') as particulars, amount, 'PAYMENT' as type FROM expenses ${filter ? filter + " AND" : 'WHERE'} UPPER(COALESCE(payment_mode,'')) = 'CASH'`,
        params
      );

      const counterRes = await pool.query(
        `SELECT id, date, 'Estimated Counter Sale' as particulars, sales_cash as amount, 'RECEIPT' as type, 'CASH' as payment_mode FROM daily_cash_summaries ${filter ? filter + ' AND' : 'WHERE'} COALESCE(sales_cash,0) > 0
         UNION ALL SELECT id, date, 'Estimated Counter Purchase' as particulars, purchases_cash as amount, 'PAYMENT' as type, 'CASH' as payment_mode FROM daily_cash_summaries ${filter ? filter + ' AND' : 'WHERE'} COALESCE(purchases_cash,0) > 0`, params
      );
      const entries = [...invRes.rows, ...csRes.rows, ...expRes.rows, ...counterRes.rows];
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.11 Bank Ledger Book Data
  app.get('/api/compliance/bank-book', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];

      const invRes = await pool.query(
        `SELECT id, invoice_number as ref_no, date, party_name as particulars, grand_total as amount, payment_mode, 'DEPOSIT' as type FROM invoices ${filter ? filter + ' AND' : 'WHERE'} payment_mode IN ('BANK_TRANSFER', 'UPI')`,
        params
      );
      const purRes = await pool.query(
        `SELECT id, supplier_invoice_no as ref_no, date, supplier_name as particulars, grand_total as amount, 'WITHDRAWAL' as type FROM purchases ${filter}`,
        params
      );

      const entries = [...invRes.rows, ...purRes.rows];
      const counterRes = await pool.query(
        `SELECT id, date, 'Estimated Counter Sale (Online)' as particulars, sales_online as amount, 'DEPOSIT' as type, 'UPI' as payment_mode FROM daily_cash_summaries ${filter ? filter + ' AND' : 'WHERE'} COALESCE(sales_online,0) > 0
         UNION ALL SELECT id, date, 'Estimated Counter Purchase (Online)' as particulars, purchases_online as amount, 'WITHDRAWAL' as type, 'UPI' as payment_mode FROM daily_cash_summaries ${filter ? filter + ' AND' : 'WHERE'} COALESCE(purchases_online,0) > 0`, params
      );
      res.json([...entries, ...counterRes.rows]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.12 Temporary Purchase Staging with Duplicate Protection
  app.get('/api/compliance/temporary-purchases', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];
      const result = await pool.query(`SELECT * FROM temporary_purchase_stage ${filter} ORDER BY created_at DESC`, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/compliance/temporary-purchases', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      const { supplier_name, supplier_gstin, invoice_number, invoice_date, taxable_value, cgst, sgst, igst, total_value } = req.body;

      // Duplicate Protection Check
      const dupCheck = await pool.query(
        `SELECT id FROM temporary_purchase_stage WHERE supplier_gstin = $1 AND invoice_number = $2 AND invoice_date = $3 AND total_value = $4
         UNION
         SELECT id FROM permanent_purchase_ledger WHERE supplier_gstin = $1 AND invoice_number = $2 AND invoice_date = $3 AND total_value = $4`,
        [supplier_gstin || 'URP', invoice_number, invoice_date, total_value]
      );

      const isDuplicate = dupCheck.rows.length > 0;
      const id = 'TPS-' + Date.now() + '-' + Math.floor(Math.random() * 100);

      const result = await pool.query(
        `INSERT INTO temporary_purchase_stage (id, user_mobile, supplier_name, supplier_gstin, invoice_number, invoice_date, taxable_value, cgst, sgst, igst, total_value, status, duplicate_blocked, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         RETURNING *`,
        [id, userMobile, supplier_name, supplier_gstin || 'URP', invoice_number, invoice_date, parseFloat(taxable_value || '0'), parseFloat(cgst || '0'), parseFloat(sgst || '0'), parseFloat(igst || '0'), parseFloat(total_value || '0'), isDuplicate ? 'DUPLICATE_BLOCKED' : 'PENDING_MATCH', isDuplicate]
      );

      res.status(201).json({ entry: result.rows[0], isDuplicate });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.13 Promote a staged purchase only after server-side GSTR-2B matching.
  app.post('/api/compliance/shift-to-permanent', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const client = await pool.connect();
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'A staged purchase ID is required.' });
      await client.query('BEGIN');
      const tempRes = await client.query('SELECT * FROM temporary_purchase_stage WHERE id=$1 AND user_mobile=$2 FOR UPDATE', [id, userMobile]);
      if (!tempRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Temporary purchase was not found for this account.' });
      }
      const row = tempRes.rows[0];
      if (row.duplicate_blocked || String(row.status || '').includes('DUPLICATE')) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This staged purchase is marked as a duplicate and cannot be promoted.' });
      }
      const portalRes = await client.query(
        `SELECT * FROM gstr2b_portal_cache WHERE user_mobile=$1
         AND UPPER(TRIM(supplier_gstin))=UPPER(TRIM($2))
         AND UPPER(TRIM(invoice_number))=UPPER(TRIM($3))
         ORDER BY created_at DESC LIMIT 1`,
        [userMobile, row.supplier_gstin || 'URP', row.invoice_number]
      );
      const portal = portalRes.rows[0];
      if (!portal) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This bill has not been found in your imported GSTR-2B data; it cannot be marked verified.' });
      }
      const totalDiff = Math.abs(Number(row.total_value || 0) - Number(portal.total_value || 0));
      const taxableDiff = Math.abs(Number(row.taxable_value || 0) - Number(portal.taxable_value || 0));
      if (totalDiff >= 1 || taxableDiff >= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The purchase does not match GSTR-2B values. Resolve the mismatch before promoting it.' });
      }
      const permId = 'PPL-' + crypto.randomUUID();
      await client.query(
        `INSERT INTO permanent_purchase_ledger (id,user_mobile,supplier_name,supplier_gstin,invoice_number,invoice_date,taxable_value,cgst,sgst,igst,total_value,verification_source,gstr2b_verified,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GSTR2B_VERIFIED',TRUE,NOW())`,
        [permId, userMobile, portal.supplier_name || row.supplier_name, portal.supplier_gstin, portal.invoice_number, portal.invoice_date || row.invoice_date,
          portal.taxable_value, portal.cgst_amount ?? portal.cgst ?? 0, portal.sgst_amount ?? portal.sgst ?? 0, portal.igst_amount ?? portal.igst ?? 0, portal.total_value]
      );
      const jeId = 'JE-' + crypto.randomUUID();
      const cgst = Number(portal.cgst_amount ?? portal.cgst ?? 0), sgst = Number(portal.sgst_amount ?? portal.sgst ?? 0), igst = Number(portal.igst_amount ?? portal.igst ?? 0);
      const taxable = Number(portal.taxable_value || 0), total = Number(portal.total_value || 0);
      const lines: any[] = [{ account: 'Purchase Asset Account', debit: taxable, credit: 0 }];
      if (cgst > 0) lines.push({ account: 'Input Tax Credit - CGST Pool', debit: cgst, credit: 0 });
      if (sgst > 0) lines.push({ account: 'Input Tax Credit - SGST Pool', debit: sgst, credit: 0 });
      if (igst > 0) lines.push({ account: 'Input Tax Credit - IGST Pool', debit: igst, credit: 0 });
      if (total > taxable + cgst + sgst + igst + 0.01 || total < taxable + cgst + sgst + igst - 0.01) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'GSTR-2B totals do not balance; the record was not promoted.' });
      }
      if (total > taxable + cgst + sgst + igst) lines.push({ account: 'Purchase Rounding / Other Charges', debit: total - taxable - cgst - sgst - igst, credit: 0 });
      else if (total < taxable + cgst + sgst + igst) lines.push({ account: 'Purchase Discount / Rounding', debit: 0, credit: taxable + cgst + sgst + igst - total });
      lines.push({ account: `Creditor: ${portal.supplier_name || row.supplier_name || 'Vendor'}`, debit: 0, credit: total });
      await client.query(
        `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
         VALUES ($1,$2,$3,'PURCHASE',$4,$5,$6,$7,NOW())`,
        [jeId, `JV-2B-${permId.slice(-8)}`, portal.invoice_date || row.invoice_date || getFormattedDate(), portal.invoice_number, `GSTR-2B Verified Purchase from ${portal.supplier_name || row.supplier_name}`, JSON.stringify(lines), userMobile]
      );
      await client.query('DELETE FROM temporary_purchase_stage WHERE id=$1 AND user_mobile=$2', [id, userMobile]);
      await client.query('COMMIT');
      res.json({ success: true, permanentId: permId, verifiedAgainstGstr2b: true });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: err.message || 'Unable to promote the verified purchase.' });
    } finally { client.release(); }
  });

  // 9.14 Ineligible Tax Logs (Section 17(5))
  app.post('/api/compliance/ineligible-tax-log', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      const { supplier_name, invoice_number, amount, legal_section, reason_category } = req.body;
      const id = 'ITL-' + Date.now();

      await pool.query(
        `INSERT INTO ineligible_tax_logs (id, user_mobile, supplier_name, invoice_number, amount, legal_section, reason_category, blocked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, userMobile, supplier_name, invoice_number, parseFloat(amount || '0'), legal_section || 'Section 17(5)', reason_category || 'Blocked ITC']
      );

      res.status(201).json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/compliance/ineligible-tax-logs', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];
      const result = await pool.query(`SELECT * FROM ineligible_tax_logs ${filter} ORDER BY blocked_at DESC`, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9.15 RCM Live Liability Summary
  app.get('/api/compliance/rcm-summary', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1 AND rcm_applicable = true' : 'WHERE rcm_applicable = true';
      const params = userMobile ? [userMobile] : [];

      const result = await pool.query(
        `SELECT count(*) as count, COALESCE(SUM(rcm_calculated_tax), 0) as total_rcm_liability, COALESCE(SUM(sub_total), 0) as total_rcm_taxable FROM invoices ${filter}`,
        params
      );

      res.json({
        rcmInvoicesCount: parseInt(result.rows[0]?.count || '0'),
        totalRcmLiability: parseFloat(result.rows[0]?.total_rcm_liability || '0'),
        totalRcmTaxable: parseFloat(result.rows[0]?.total_rcm_taxable || '0'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // COMPONENT 1: INDIVIDUAL IMAGE / PHOTO SCANNER PIPELINE (SERVER-SIDE)
  // =========================================================================
  app.post('/api/compliance/ocr-single-invoice', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      const { imageBase64, fileName } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'No image stream buffer provided.' });
      }

      // Detect MIME type cleanly from data URL or default to image/jpeg
      let mimeType = req.body.mimeType || 'image/jpeg';
      const dataUrlMatch = String(imageBase64).match(/^data:([^;]+);base64,/);
      if (dataUrlMatch && dataUrlMatch[1]) {
        mimeType = dataUrlMatch[1];
      }

      const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '').trim();

      const prompt = `You are a high-precision deterministic OCR extraction engine for Indian GST purchase bills and tax invoices.
Extract the following fields from the invoice image:
1. Supplier Legal / Trade Name (supplier_name): Registered business or seller name on the bill.
2. Supplier GSTIN (supplier_gstin): 15-character GSTIN string, or "URP" if unregistered/missing.
3. Invoice Number (invoice_number): The supplier invoice/bill number.
4. Invoice Date (invoice_date): Date normalized strictly to DD/MM/YYYY.
5. HSN Code (hsn_code): The primary 4 to 8 digit HSN/SAC code if present.
6. Taxable Value (taxable_value): Sub-total taxable amount before GST (number).
7. GST Rate (gst_rate): Overall GST percentage applied e.g. 5, 12, 18, 28 (number).
8. CGST (cgst): Central GST amount (number).
9. SGST (sgst): State GST amount (number).
10. IGST (igst): Integrated GST amount for inter-state purchase (number).
11. Grand Total (grand_total): Final invoice total payable amount including tax (number).
12. Place of Supply (place_of_supply): Destination state/city.
13. Supplier Address (supplier_address): Full or partial address of the supplier.
14. State Name (state_name): State name of the supplier (e.g. Delhi, Maharashtra, Uttar Pradesh).
15. State Code (state_code): 2-digit GST state code (e.g. "07" for Delhi, "27" for Maharashtra, "09" for UP).

Be accurate and extract exact numerical values. If tax breakdown is missing but taxable_value and grand_total exist, calculate the taxes proportionally.`;

      const schemaProperties = {
        supplier_name: { type: Type.STRING },
        supplier_gstin: { type: Type.STRING },
        invoice_number: { type: Type.STRING },
        invoice_date: { type: Type.STRING },
        hsn_code: { type: Type.STRING },
        taxable_value: { type: Type.NUMBER },
        taxable_amount: { type: Type.NUMBER },
        gst_rate: { type: Type.NUMBER },
        cgst: { type: Type.NUMBER },
        sgst: { type: Type.NUMBER },
        igst: { type: Type.NUMBER },
        grand_total: { type: Type.NUMBER },
        total_value: { type: Type.NUMBER },
        place_of_supply: { type: Type.STRING },
        supplier_address: { type: Type.STRING },
        state_name: { type: Type.STRING },
        state_code: { type: Type.STRING },
      };

      const extractedData = await runGeminiVisionOCR(prompt, mimeType, cleanBase64, schemaProperties);

      // Tax & amount derivations
      let numTaxable = extractedData?.taxable_value ?? extractedData?.taxable_amount ?? null;
      if (numTaxable !== null) numTaxable = parseFloat(numTaxable);

      let numGrandTotal = extractedData?.grand_total ?? extractedData?.total_value ?? null;
      if (numGrandTotal !== null) numGrandTotal = parseFloat(numGrandTotal);

      let cgst = extractedData?.cgst !== null && extractedData?.cgst !== undefined ? parseFloat(extractedData.cgst) : null;
      let sgst = extractedData?.sgst !== null && extractedData?.sgst !== undefined ? parseFloat(extractedData.sgst) : null;
      let igst = extractedData?.igst !== null && extractedData?.igst !== undefined ? parseFloat(extractedData.igst) : null;
      let gstRate = extractedData?.gst_rate !== null && extractedData?.gst_rate !== undefined ? parseFloat(extractedData.gst_rate) : null;

      // Calculate missing taxes if totals exist
      if (numTaxable !== null && numGrandTotal !== null && numGrandTotal > numTaxable) {
        const totalTax = Math.round((numGrandTotal - numTaxable) * 100) / 100;
        if (!gstRate && numTaxable > 0) {
          gstRate = Math.round((totalTax / numTaxable) * 100);
        }
        if (cgst === null && sgst === null && igst === null) {
          const isInter = extractedData?.state_name && extractedData?.state_name.toLowerCase() !== 'delhi';
          if (isInter) {
            igst = totalTax;
            cgst = 0;
            sgst = 0;
          } else {
            cgst = Math.round((totalTax / 2) * 100) / 100;
            sgst = Math.round((totalTax / 2) * 100) / 100;
            igst = 0;
          }
        }
      }

      const normalizedData = {
        supplier_name: extractedData?.supplier_name ? String(extractedData.supplier_name).trim() : '',
        supplier_gstin: extractedData?.supplier_gstin && String(extractedData.supplier_gstin).trim().length >= 3 ? String(extractedData.supplier_gstin).trim().toUpperCase() : 'URP',
        invoice_number: extractedData?.invoice_number ? String(extractedData.invoice_number).trim() : `PB-${Date.now().toString().slice(-4)}`,
        invoice_date: extractedData?.invoice_date ? String(extractedData.invoice_date).trim() : new Date().toLocaleDateString('en-GB'),
        hsn_code: extractedData?.hsn_code ? String(extractedData.hsn_code).trim() : '',
        taxable_value: numTaxable || 0,
        taxable_amount: numTaxable || 0,
        gst_rate: gstRate ?? 18,
        cgst: cgst ?? 0,
        sgst: sgst ?? 0,
        igst: igst ?? 0,
        grand_total: numGrandTotal || numTaxable || 0,
        total_value: numGrandTotal || numTaxable || 0,
        place_of_supply: extractedData?.place_of_supply ? String(extractedData.place_of_supply).trim() : '',
        supplier_address: extractedData?.supplier_address ? String(extractedData.supplier_address).trim() : (extractedData?.place_of_supply ? String(extractedData.place_of_supply).trim() : ''),
        state_name: extractedData?.state_name ? String(extractedData.state_name).trim() : 'Delhi',
        state_code: extractedData?.state_code ? String(extractedData.state_code).trim() : '07',
      };

      // Pillar 2: Send extracted page image cleanly to Cloudinary storage path
      const cloudinaryUrl = await uploadImageToCloudinary(cleanBase64, 'gst_purchase_bills');

      // Save small asset link text string inside Neon PostgreSQL parameters
      const stageId = 'TPS-IMG-' + Date.now();
      try {
        await pool.query(
          `INSERT INTO temporary_purchase_stage (
            id, user_mobile, supplier_name, supplier_gstin, invoice_number, invoice_date,
            taxable_value, cgst, sgst, igst, total_value, status, raw_image_url, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING_MATCH', $12, NOW())
          ON CONFLICT (id) DO NOTHING`,
          [
            stageId,
            userMobile,
            normalizedData.supplier_name || '',
            normalizedData.supplier_gstin || 'URP',
            normalizedData.invoice_number || '',
            normalizedData.invoice_date || '',
            normalizedData.taxable_value || 0,
            normalizedData.cgst || 0,
            normalizedData.sgst || 0,
            normalizedData.igst || 0,
            normalizedData.grand_total || 0,
            cloudinaryUrl,
          ]
        );
      } catch (stageErr: any) {
        console.warn('Temporary staging insert warning:', stageErr.message);
      }

      res.status(200).json({
        success: true,
        data: {
          ...normalizedData,
          id: stageId,
          cloudinary_url: cloudinaryUrl,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Emergency Recovery Endpoint: Flush Staging Cache Vectors (Anti-Cache Purge)
  app.post('/api/compliance/flush-staging-cache', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const delRes = await pool.query('DELETE FROM temporary_purchase_stage WHERE user_mobile = $1', [userMobile]);
      res.status(200).json({
        success: true,
        message: 'Staging cache vectors successfully purged. Dynamic states flushed.',
        flushedRows: delRes.rowCount,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // PILLAR 4: GLOBAL "DOWNLOAD ALL DATA" BACKUP FRAMEWORK MODULE
  // =========================================================================
  app.get('/api/backup/download-all', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      if (!userMobile) return res.status(401).json({ error: 'Login required.' });
      const queryParams = [userMobile];
      const filterSql = 'WHERE user_mobile = $1';

      // 1. Fetch from all partition identity tables
      const [
        invoicesRes,
        purchasesRes,
        partiesRes,
        expensesRes,
        paymentsRes,
        cashRes,
        journalRes,
        companyRes,
        settingsRes,
        tempStageRes,
        permPurchaseRes,
        gstr2bRes,
        auditLogsRes
      ] = await Promise.all([
        pool.query(`SELECT * FROM invoices ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM purchases ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM parties ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM expenses ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM payments ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM daily_cash_summaries ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM journal_entries ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM company_profiles ${filterSql} LIMIT 1`, queryParams),
        pool.query(`SELECT * FROM app_settings ${filterSql} LIMIT 1`, queryParams),
        pool.query(`SELECT * FROM temporary_purchase_stage ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM permanent_purchase_ledger ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM gstr2b_portal_cache ${filterSql} ORDER BY created_at DESC`, queryParams),
        pool.query(`SELECT * FROM audit_edit_logs WHERE user_id_context=$1 ORDER BY timestamp_marker DESC LIMIT 200`, queryParams),
      ]);

      const backupArchive = {
        app_name: 'Cotrix GST & Indian Accounting Enterprise',
        backup_version: '2.0.0-ENTERPRISE',
        generated_at: new Date().toISOString(),
        user_mobile: userMobile || 'GUEST_PARTITION',
        metadata: {
          total_invoices: invoicesRes.rows.length,
          total_purchases: purchasesRes.rows.length,
          total_parties: partiesRes.rows.length,
          total_expenses: expensesRes.rows.length,
          total_payments: paymentsRes.rows.length,
        },
        data: {
          company_profile: companyRes.rows[0] || null,
          app_settings: settingsRes.rows[0] || null,
          invoices: invoicesRes.rows,
          purchases: purchasesRes.rows,
          parties: partiesRes.rows,
          expenses: expensesRes.rows,
          payments: paymentsRes.rows,
          daily_cash_summaries: cashRes.rows,
          journal_entries: journalRes.rows,
          temporary_purchase_stage: tempStageRes.rows,
          permanent_purchase_ledger: permPurchaseRes.rows,
          gstr2b_portal_cache: gstr2bRes.rows,
          audit_edit_logs: auditLogsRes.rows,
        },
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `cotrix_complete_backup_${userMobile || ''}_${dateStr}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(JSON.stringify(backupArchive, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate comprehensive data backup: ' + err.message });
    }
  });

  // =========================================================================
  // COMPONENT 2: MULTI-IMAGE / PDF INGESTION & VISION OCR PIPELINE (SERVER-SIDE)
  // =========================================================================
  app.post(['/api/compliance/ocr-purchase-pdf', '/api/compliance/ocr-split-pdf'], async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      const { pages, rawPdfBase64, fileName, images } = req.body;

      let resolvedPages: Array<{ base64: string; mimeType: string; pageIndex: number }> = [];

      // STAGE 1.1: Multi-Page PDF or Single/Multi Image Buffer Resolution
      if (rawPdfBase64 && typeof rawPdfBase64 === 'string') {
        const isImage = rawPdfBase64.startsWith('data:image/') || 
                        (!rawPdfBase64.startsWith('data:application/pdf') && !rawPdfBase64.substring(0, 100).includes('JVBERi0'));
        if (isImage) {
          const match = rawPdfBase64.match(/^data:([^;]+);base64,/);
          const mimeType = match ? match[1] : 'image/jpeg';
          const cleanImg = rawPdfBase64.replace(/^data:[^;]+;base64,/, '').trim();
          resolvedPages.push({
            base64: cleanImg,
            mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
            pageIndex: 1,
          });
        } else {
          try {
            const cleanPdf = rawPdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
            const pdfBytes = Buffer.from(cleanPdf, 'base64');
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const pageCount = pdfDoc.getPageCount();
            for (let p = 0; p < pageCount; p++) {
              const singleDoc = await PDFDocument.create();
              const [copiedPage] = await singleDoc.copyPages(pdfDoc, [p]);
              singleDoc.addPage(copiedPage);
              const singleBytes = await singleDoc.save();
              resolvedPages.push({
                base64: Buffer.from(singleBytes).toString('base64'),
                mimeType: 'application/pdf',
                pageIndex: p + 1,
              });
            }
          } catch (pdfErr: any) {
            console.warn('PDF splitting failed, falling back to direct ingestion:', pdfErr.message);
            const cleanPdf = rawPdfBase64.replace(/^data:[^;]+;base64,/, '').trim();
            resolvedPages.push({
              base64: cleanPdf,
              mimeType: 'application/pdf',
              pageIndex: 1,
            });
          }
        }
      }

      // Support multi-image upload array
      if (Array.isArray(images) && images.length > 0) {
        images.forEach((img: any, idx: number) => {
          const rawStr = typeof img === 'string' ? img : (img.base64 || img.dataUrl || '');
          if (!rawStr) return;
          const match = rawStr.match(/^data:([^;]+);base64,/);
          const mimeType = (typeof img === 'object' && img.mimeType) ? img.mimeType : (match ? match[1] : 'image/jpeg');
          const cleanImg = rawStr.replace(/^data:[^;]+;base64,/, '').trim();
          resolvedPages.push({
            base64: cleanImg,
            mimeType: mimeType.startsWith('image/') ? mimeType : (mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg'),
            pageIndex: resolvedPages.length + 1,
          });
        });
      }

      if (resolvedPages.length === 0 && Array.isArray(pages) && pages.length > 0) {
        resolvedPages = pages.map((p, idx) => ({
          base64: String(p.base64 || '').replace(/^data:[^;]+;base64,/, '').trim(),
          mimeType: p.mimeType || 'image/jpeg',
          pageIndex: p.pageIndex || idx + 1,
        }));
      }

      if (resolvedPages.length === 0) {
        return res.status(400).json({ error: 'No image or PDF page buffers provided in ingestion stream' });
      }

      const extractedInvoices: any[] = [];

      // STAGE 1.2 & 1.3: Sequential Processing with Strict Schema & Failsafe Rules
      for (let i = 0; i < resolvedPages.length; i++) {
        const page = resolvedPages[i];
        const pageIndex = page.pageIndex || i + 1;
        const rawBase64 = page.base64;
        const mimeType = page.mimeType;

        let invoiceData: any = null;

        // Route raw image buffer into Gemini Vision API
        const prompt = `Analyze this purchase invoice or bill with high precision.
Extract the following information:
1. Supplier Legal / Trade Name (supplier_name)
2. Supplier GSTIN (supplier_gstin) - 15 characters, or "URP" if unregistered
3. Supplier Phone Number (supplier_phone)
4. Supplier Address (supplier_address)
5. Supplier State Name (supplier_state)
6. Supplier 2-digit State Code (supplier_state_code) e.g. "07" for Delhi
7. Place of Supply (place_of_supply)
8. Invoice Number (invoice_number)
9. Invoice Date (invoice_date) formatted DD/MM/YYYY
10. HSN / SAC Code (hsn_code)
11. Taxable Value / Sub Total before tax (taxable_value) - number
12. GST Rate percentage e.g. 5, 12, 18, 28 (gst_rate) - number
13. CGST Amount (cgst_amount) - number
14. SGST Amount (sgst_amount) - number
15. IGST Amount (igst_amount) - number
16. Grand Total / Total Invoice Value (total_value) - number
17. Is Inter State supply (is_inter_state) - boolean

Extract precise values from the bill image.`;

        const pdfSchemaProperties = {
          supplier_name: { type: Type.STRING },
          supplier_gstin: { type: Type.STRING },
          supplier_phone: { type: Type.STRING },
          supplier_address: { type: Type.STRING },
          supplier_state: { type: Type.STRING },
          supplier_state_code: { type: Type.STRING },
          place_of_supply: { type: Type.STRING },
          invoice_number: { type: Type.STRING },
          invoice_date: { type: Type.STRING },
          hsn_code: { type: Type.STRING },
          taxable_value: { type: Type.NUMBER },
          gst_rate: { type: Type.NUMBER },
          cgst_amount: { type: Type.NUMBER },
          sgst_amount: { type: Type.NUMBER },
          igst_amount: { type: Type.NUMBER },
          total_value: { type: Type.NUMBER },
          is_inter_state: { type: Type.BOOLEAN },
        };

        invoiceData = await runGeminiVisionOCR(prompt, mimeType, rawBase64, pdfSchemaProperties);

        const cleanInvNum = invoiceData?.invoice_number ? String(invoiceData.invoice_number).trim() : `PB-${Date.now().toString().slice(-4)}-${pageIndex}`;
        const cleanGstin = invoiceData?.supplier_gstin && String(invoiceData.supplier_gstin).trim().length >= 3 ? String(invoiceData.supplier_gstin).trim().toUpperCase() : 'URP';
        const cleanDate = invoiceData?.invoice_date ? String(invoiceData.invoice_date).trim() : new Date().toLocaleDateString('en-GB');
        let taxable = invoiceData?.taxable_value !== null && invoiceData?.taxable_value !== undefined ? parseFloat(invoiceData.taxable_value) : null;
        let total = invoiceData?.total_value !== null && invoiceData?.total_value !== undefined ? parseFloat(invoiceData.total_value) : null;
        let cgst = invoiceData?.cgst_amount !== null && invoiceData?.cgst_amount !== undefined ? parseFloat(invoiceData.cgst_amount) : null;
        let sgst = invoiceData?.sgst_amount !== null && invoiceData?.sgst_amount !== undefined ? parseFloat(invoiceData.sgst_amount) : null;
        let igst = invoiceData?.igst_amount !== null && invoiceData?.igst_amount !== undefined ? parseFloat(invoiceData.igst_amount) : null;
        let gstRate = invoiceData?.gst_rate !== null && invoiceData?.gst_rate !== undefined ? parseFloat(invoiceData.gst_rate) : null;

        // Auto-calculate missing taxes
        if (taxable !== null && total !== null && total > taxable) {
          const totalTax = Math.round((total - taxable) * 100) / 100;
          if (!gstRate && taxable > 0) {
            gstRate = Math.round((totalTax / taxable) * 100);
          }
          if (cgst === null && sgst === null && igst === null) {
            const isInter = invoiceData?.is_inter_state || (invoiceData?.supplier_state && invoiceData.supplier_state.toLowerCase() !== 'delhi');
            if (isInter) {
              igst = totalTax;
              cgst = 0;
              sgst = 0;
            } else {
              cgst = Math.round((totalTax / 2) * 100) / 100;
              sgst = Math.round((totalTax / 2) * 100) / 100;
              igst = 0;
            }
          }
        }

        // Upload single page to Cloudinary if available
        const pageCloudinaryUrl = await uploadImageToCloudinary(rawBase64, 'gst_purchase_bills');
        const stageId = 'TPS-' + Date.now() + '-' + pageIndex + '-' + Math.floor(Math.random() * 1000);

        // Store into temporary_purchase_stage
        try {
          await pool.query(
            `INSERT INTO temporary_purchase_stage (
              id, user_mobile, supplier_name, supplier_gstin, supplier_phone, supplier_address,
              supplier_state, supplier_state_code, place_of_supply, invoice_number, invoice_date,
              hsn_code, taxable_value, gst_rate, cgst, sgst, igst, total_value, status, raw_image_url, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'PENDING_MATCH', $19, NOW()
            ) ON CONFLICT (id) DO NOTHING`,
            [
              stageId,
              userMobile,
              invoiceData?.supplier_name || 'Vendor ' + cleanGstin.slice(0, 8),
              cleanGstin,
              invoiceData?.supplier_phone || '',
              invoiceData?.supplier_address || '',
              invoiceData?.supplier_state ?? null,
              invoiceData?.supplier_state_code ?? null,
              invoiceData?.place_of_supply || 'Delhi',
              cleanInvNum,
              cleanDate,
              invoiceData?.hsn_code || '',
              taxable || 0,
              gstRate ?? 18,
              cgst || 0,
              sgst || 0,
              igst || 0,
              total || taxable || 0,
              pageCloudinaryUrl,
            ]
          );
        } catch (dbErr: any) {
          console.warn('Failed to insert temporary purchase stage:', dbErr.message);
        }

        extractedInvoices.push({
          id: stageId,
          pageIndex,
          supplier_name: invoiceData?.supplier_name || 'Vendor ' + cleanGstin.slice(0, 8),
          supplier_gstin: cleanGstin,
          supplier_phone: invoiceData?.supplier_phone || '',
          supplier_address: invoiceData?.supplier_address || '',
          supplier_state: invoiceData?.supplier_state ?? null,
          supplier_state_code: invoiceData?.supplier_state_code ?? null,
          place_of_supply: invoiceData?.place_of_supply || 'Delhi',
          invoice_number: cleanInvNum,
          invoice_date: cleanDate,
          hsn_code: invoiceData?.hsn_code || '',
          taxable_value: taxable || 0,
          gst_rate: gstRate ?? 18,
          cgst_amount: cgst || 0,
          sgst_amount: sgst || 0,
          igst_amount: igst || 0,
          total_value: total || taxable || 0,
          raw_image_url: pageCloudinaryUrl,
        });
      }

      res.status(200).json({
        success: true,
        count: extractedInvoices.length,
        invoices: extractedInvoices,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // COMPONENT 3: DETERMINISTIC GSTR-2B GOVERNMENT JSON PARSER (ZERO AI)
  // =========================================================================
  app.get('/api/compliance/gstr2b-history', async (req: Request, res: Response) => {
    try { const userMobile=getUserMobile(req); if(!userMobile)return res.status(401).json({error:'Login required.'}); const [portal,staged]=await Promise.all([pool.query('SELECT * FROM gstr2b_portal_cache WHERE user_mobile=$1 ORDER BY created_at DESC',[userMobile]),pool.query("SELECT * FROM temporary_purchase_stage WHERE user_mobile=$1 AND status='PENDING_MATCH' ORDER BY created_at DESC",[userMobile])]); res.json({portal:portal.rows,staged:staged.rows}); }
    catch(err:any){res.status(500).json({error:err.message});}
  });

  app.post(['/api/compliance/gstr2b-upload', '/api/compliance/parse-gstr2b-json'], async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req) || '';
      const { rawJson, records } = req.body;

      let b2bInvoices: any[] = [];

      // Enforce strict native programmatic JSON.parse without AI interaction
      if (rawJson && typeof rawJson === 'string') {
        const parsed = JSON.parse(rawJson);
        const b2bList = parsed.b2b || parsed.data?.b2b || [];
        for (const supp of b2bList) {
          const suppGstin = String(supp.ctin || '').trim().toUpperCase();
          const suppName = String(supp.tradeName || supp.legalName || 'Vendor ' + suppGstin.slice(0, 10)).trim();
          for (const inv of (supp.inv || [])) {
            const invNum = String(inv.inum || '').trim();
            const invDate = String(inv.idt || '').trim();
            const totalVal = parseFloat(inv.val || '0');
            let txVal = 0;
            let cAmt = 0;
            let sAmt = 0;
            let iAmt = 0;

            for (const itm of (inv.itms || [])) {
              const det = itm.itm_det || itm;
              txVal += parseFloat(det.txval || '0');
              cAmt += parseFloat(det.camt || '0');
              sAmt += parseFloat(det.samt || '0');
              iAmt += parseFloat(det.iamt || '0');
            }

            // Never infer tax/taxable values from the grand total. If the invoice is unreadable, keep the value blank/zero for human review.

            b2bInvoices.push({
              supplier_gstin: suppGstin,
              supplier_name: suppName,
              invoice_number: invNum,
              invoice_date: invDate,
              taxable_value: Math.round(txVal * 100) / 100,
              cgst_amount: Math.round(cAmt * 100) / 100,
              sgst_amount: Math.round(sAmt * 100) / 100,
              igst_amount: Math.round(iAmt * 100) / 100,
              total_value: Math.round(totalVal * 100) / 100,
              filing_period: inv.fp || '092026',
            });
          }
        }
      } else if (Array.isArray(records)) {
        b2bInvoices = records;
      }

      // Store in gstr2b_portal_cache
      const inserted: any[] = [];
      for (const rec of b2bInvoices) {
        const id = 'G2B-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        await pool.query(
          `INSERT INTO gstr2b_portal_cache (
            id, user_mobile, supplier_gstin, supplier_name, invoice_number, invoice_date,
            taxable_value, cgst, sgst, igst, cgst_amount, sgst_amount, igst_amount, total_value, filing_period, return_period, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, $9, $10, $11, $12, $12, NOW())`,
          [
            id,
            userMobile,
            rec.supplier_gstin.toUpperCase().trim(),
            rec.supplier_name,
            rec.invoice_number.trim(),
            rec.invoice_date,
            rec.taxable_value || 0,
            rec.cgst_amount || 0,
            rec.sgst_amount || 0,
            rec.igst_amount || 0,
            rec.total_value || 0,
            rec.filing_period || '092026',
          ]
        );
        inserted.push({ id, ...rec });
      }

      res.status(200).json({
        success: true,
        count: inserted.length,
        records: inserted,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // STAGE 3: AUTOMATED RECONCILIATION ALGORITHM MATRIX (4 EXACT BUCKETS)
  // =========================================================================
  app.post('/api/compliance/reconcile-matrix', async (req: Request, res: Response) => {
    try {
      const userMobile = getUserMobile(req);
      const filter = userMobile ? 'WHERE user_mobile = $1' : '';
      const params = userMobile ? [userMobile] : [];

      // 1. Fetch from temporary_purchase_stage and purchases
      const tempPurchases = await pool.query(`SELECT * FROM temporary_purchase_stage ${filter}`, params);
      const confPurchases = await pool.query(`SELECT * FROM purchases ${filter}`, params);
      const portalRecords = await pool.query(`SELECT * FROM gstr2b_portal_cache ${filter}`, params);

      // Books map indexed by sanitized key: (GSTIN_INVOICENO)
      const booksMap = new Map<string, any>();

      tempPurchases.rows.forEach((r: any) => {
        const key = `${String(r.supplier_gstin || '').trim().toUpperCase()}_${String(r.invoice_number || '').trim().toUpperCase()}`;
        booksMap.set(key, { ...r, source: 'TEMP_STAGE' });
      });

      confPurchases.rows.forEach((r: any) => {
        const key = `${String(r.supplier_gstin || '').trim().toUpperCase()}_${String(r.supplier_invoice_no || '').trim().toUpperCase()}`;
        if (!booksMap.has(key)) {
          booksMap.set(key, {
            id: r.id,
            user_mobile: r.user_mobile,
            supplier_name: r.supplier_name,
            supplier_gstin: r.supplier_gstin,
            invoice_number: r.supplier_invoice_no,
            invoice_date: r.date,
            taxable_value: parseFloat(r.sub_total || '0'),
            cgst: parseFloat(r.cgst_total || '0'),
            sgst: parseFloat(r.sgst_total || '0'),
            igst: parseFloat(r.igst_total || '0'),
            total_value: parseFloat(r.grand_total || '0'),
            source: 'CONFIRMED_PURCHASE',
          });
        }
      });

      const matched_ledger: any[] = [];
      const mismatched_ledger: any[] = [];
      const missing_in_books_ledger: any[] = [];
      const matchedKeys = new Set<string>();

      // Loop through portal records
      portalRecords.rows.forEach((portalRec: any) => {
        const key = `${String(portalRec.supplier_gstin || '').trim().toUpperCase()}_${String(portalRec.invoice_number || '').trim().toUpperCase()}`;
        const bookEntry = booksMap.get(key);

        if (bookEntry) {
          matchedKeys.add(key);
          const bookTotal = parseFloat(bookEntry.total_value || '0');
          const portalTotal = parseFloat(portalRec.total_value || '0');
          const bookTaxable = parseFloat(bookEntry.taxable_value || '0');
          const portalTaxable = parseFloat(portalRec.taxable_value || '0');

          const valDiff = Math.abs(bookTotal - portalTotal);
          const taxDiff = Math.abs(bookTaxable - portalTaxable);

          if (valDiff < 1.0 && taxDiff < 1.0) {
            // Match Outcome 1: Matched Ledger (100% alignment)
            matched_ledger.push({
              id: bookEntry.id || portalRec.id,
              key,
              supplier_gstin: portalRec.supplier_gstin,
              supplier_name: portalRec.supplier_name || bookEntry.supplier_name,
              invoice_number: portalRec.invoice_number,
              invoice_date: portalRec.invoice_date || bookEntry.invoice_date,
              taxable_value: portalTaxable,
              cgst_amount: parseFloat(portalRec.cgst_amount || '0'),
              sgst_amount: parseFloat(portalRec.sgst_amount || '0'),
              igst_amount: parseFloat(portalRec.igst_amount || '0'),
              total_value: portalTotal,
              status: 'MATCHED_100',
              tag: '100% Validated',
            });
          } else {
            // Match Outcome 2: Mismatched Ledger (Variances in Taxable or Value)
            mismatched_ledger.push({
              id: bookEntry.id || portalRec.id,
              key,
              supplier_gstin: portalRec.supplier_gstin,
              supplier_name: portalRec.supplier_name || bookEntry.supplier_name,
              invoice_number: portalRec.invoice_number,
              invoice_date: portalRec.invoice_date || bookEntry.invoice_date,
              books_taxable_value: bookTaxable,
              portal_taxable_value: portalTaxable,
              books_total_value: bookTotal,
              portal_total_value: portalTotal,
              variance: Math.round(valDiff * 100) / 100,
              status: 'VALUE_MISMATCH',
              tag: 'Valuation Variance',
            });
          }
        } else {
          // Match Outcome 4: Missing in Books Ledger (Verified in portal, missing in books)
          missing_in_books_ledger.push({
            id: portalRec.id,
            key,
            supplier_gstin: portalRec.supplier_gstin,
            supplier_name: portalRec.supplier_name,
            invoice_number: portalRec.invoice_number,
            invoice_date: portalRec.invoice_date,
            taxable_value: parseFloat(portalRec.taxable_value || '0'),
            cgst_amount: parseFloat(portalRec.cgst_amount || '0'),
            sgst_amount: parseFloat(portalRec.sgst_amount || '0'),
            igst_amount: parseFloat(portalRec.igst_amount || '0'),
            total_value: parseFloat(portalRec.total_value || '0'),
            status: 'MISSING_IN_BOOKS',
            tag: 'In 2B Portal / Missing In Books',
          });
        }
      });

      // Match Outcome 3: Missing in 2B Ledger (In user staging but absent from portal)
      const missing_in_2b_ledger: any[] = [];
      booksMap.forEach((bookEntry, key) => {
        if (!matchedKeys.has(key)) {
          missing_in_2b_ledger.push({
            id: bookEntry.id,
            key,
            supplier_gstin: bookEntry.supplier_gstin,
            supplier_name: bookEntry.supplier_name,
            invoice_number: bookEntry.invoice_number,
            invoice_date: bookEntry.invoice_date,
            taxable_value: parseFloat(bookEntry.taxable_value || '0'),
            cgst_amount: parseFloat(bookEntry.cgst || '0'),
            sgst_amount: parseFloat(bookEntry.sgst || '0'),
            igst_amount: parseFloat(bookEntry.igst || '0'),
            total_value: parseFloat(bookEntry.total_value || '0'),
            status: 'MISSING_IN_2B',
            tag: 'Defective / Awaiting Supplier Filing',
          });
        }
      });

      res.status(200).json({
        success: true,
        matched_ledger,
        mismatched_ledger,
        missing_in_2b_ledger,
        missing_in_books_ledger,
        summary: {
          matchedCount: matched_ledger.length,
          mismatchedCount: mismatched_ledger.length,
          missingIn2bCount: missing_in_2b_ledger.length,
          missingInBooksCount: missing_in_books_ledger.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // SHIFT TO PERMANENT BOOKS BATCH ENDPOINT
  // =========================================================================
  app.post('/api/compliance/shift-to-permanent-batch', async (req: Request, res: Response) => {
    const userMobile = getUserMobile(req);
    if (!userMobile) return res.status(401).json({ error: 'Login required.' });
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No items provided for permanent shift.' });
    if (items.length > 100) return res.status(400).json({ error: 'Promote at most 100 matched purchases per batch.' });
    const client = await pool.connect();
    const shifted: string[] = [];
    try {
      await client.query('BEGIN');
      for (const itm of items) {
        const invNum = String(itm?.invoice_number || '').trim();
        const gstin = String(itm?.supplier_gstin || 'URP').trim();
        if (!invNum) throw new Error('Every item must include an invoice number.');
        const portalRes = await client.query(
          `SELECT * FROM gstr2b_portal_cache WHERE user_mobile=$1
           AND UPPER(TRIM(supplier_gstin))=UPPER(TRIM($2))
           AND UPPER(TRIM(invoice_number))=UPPER(TRIM($3)) ORDER BY created_at DESC LIMIT 1`,
          [userMobile, gstin, invNum]
        );
        const portal = portalRes.rows[0];
        if (!portal) throw new Error(`Invoice ${invNum} is not present in this account's imported GSTR-2B records.`);
        const bookRes = await client.query(
          `SELECT id, supplier_name, supplier_gstin, supplier_invoice_no AS invoice_number, date AS invoice_date,
                  sub_total AS taxable_value, cgst_total AS cgst, sgst_total AS sgst, igst_total AS igst, grand_total AS total_value
           FROM purchases WHERE user_mobile=$1 AND UPPER(TRIM(supplier_gstin))=UPPER(TRIM($2))
             AND UPPER(TRIM(supplier_invoice_no))=UPPER(TRIM($3)) ORDER BY created_at DESC LIMIT 1`,
          [userMobile, gstin, invNum]
        );
        let book = bookRes.rows[0];
        let tempId = '';
        if (!book) {
          const tempRes = await client.query(
            `SELECT id, supplier_name, supplier_gstin, invoice_number, invoice_date, taxable_value, cgst, sgst, igst, total_value, duplicate_blocked, status
             FROM temporary_purchase_stage WHERE user_mobile=$1 AND UPPER(TRIM(supplier_gstin))=UPPER(TRIM($2))
             AND UPPER(TRIM(invoice_number))=UPPER(TRIM($3)) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
            [userMobile, gstin, invNum]
          );
          book = tempRes.rows[0];
          tempId = String(book?.id || '');
        }
        if (!book) throw new Error(`Invoice ${invNum} has no matching purchase/staged record in this account.`);
        if (book.duplicate_blocked || String(book.status || '').includes('DUPLICATE')) throw new Error(`Invoice ${invNum} is flagged as a duplicate.`);
        const bookTotal = Number(book.total_value || 0), portalTotal = Number(portal.total_value || 0);
        const bookTaxable = Number(book.taxable_value || 0), portalTaxable = Number(portal.taxable_value || 0);
        if (Math.abs(bookTotal - portalTotal) >= 1 || Math.abs(bookTaxable - portalTaxable) >= 1) {
          throw new Error(`Invoice ${invNum} does not match GSTR-2B values and was not promoted.`);
        }
        const existing = await client.query(
          `SELECT id FROM permanent_purchase_ledger WHERE user_mobile=$1 AND UPPER(TRIM(supplier_gstin))=UPPER(TRIM($2))
           AND UPPER(TRIM(invoice_number))=UPPER(TRIM($3)) LIMIT 1`, [userMobile, gstin, invNum]
        );
        if (existing.rows.length) {
          if (tempId) await client.query('DELETE FROM temporary_purchase_stage WHERE id=$1 AND user_mobile=$2', [tempId, userMobile]);
          shifted.push(invNum);
          continue;
        }
        const suppName = String(portal.supplier_name || book.supplier_name || 'Vendor').trim();
        const invDate = String(portal.invoice_date || book.invoice_date || getFormattedDate());
        const taxable = portalTaxable;
        const cgst = Number(portal.cgst_amount ?? portal.cgst ?? 0);
        const sgst = Number(portal.sgst_amount ?? portal.sgst ?? 0);
        const igst = Number(portal.igst_amount ?? portal.igst ?? 0);
        const total = portalTotal;
        const taxTotal = taxable + cgst + sgst + igst;
        if (![taxable, cgst, sgst, igst, total].every((n) => Number.isFinite(n) && n >= 0) || Math.abs(total - taxTotal) > 1.01) {
          throw new Error(`Invoice ${invNum} has invalid or unbalanced GSTR-2B amounts.`);
        }
        const permId = 'PPL-' + crypto.randomUUID();
        await client.query(
          `INSERT INTO permanent_purchase_ledger (id,user_mobile,supplier_name,supplier_gstin,invoice_number,invoice_date,taxable_value,cgst,sgst,igst,total_value,verification_source,gstr2b_verified,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GSTR2B_RECONCILED',TRUE,NOW())`,
          [permId, userMobile, suppName, gstin, invNum, invDate, taxable, cgst, sgst, igst, total]
        );
        if (!bookRes.rows.length) {
          const purId = 'PUR-' + crypto.randomUUID();
          const paidAmount = Math.min(total, Math.max(0, Number(itm.paid_amount || 0)));
          const due = Math.max(0, total - paidAmount);
          await client.query(
            `INSERT INTO purchases (id,user_mobile,supplier_invoice_no,date,due_date,supplier_id,supplier_name,supplier_gstin,supplier_state,supplier_state_code,items,sub_total,cgst_total,sgst_total,igst_total,grand_total,payment_status,paid_amount,payment_mode,notes,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$4,'DIRECT_VENDOR',$5,$6,'Delhi','07','[]'::jsonb,$7,$8,$9,$10,$11,$12,$13,'CASH','GSTR-2B reconciled purchase',NOW(),NOW())`,
            [purId, userMobile, invNum, invDate, suppName, gstin, taxable, cgst, sgst, igst, total, due <= 0.009 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID', paidAmount]
          );
          const lines: any[] = [{ account: 'Purchase Asset Account', debit: taxable, credit: 0 }];
          if (cgst > 0) lines.push({ account: 'Input Tax Credit - CGST Pool', debit: cgst, credit: 0 });
          if (sgst > 0) lines.push({ account: 'Input Tax Credit - SGST Pool', debit: sgst, credit: 0 });
          if (igst > 0) lines.push({ account: 'Input Tax Credit - IGST Pool', debit: igst, credit: 0 });
          if (due > 0) lines.push({ account: `Creditor: ${suppName}`, debit: 0, credit: due });
          if (paidAmount > 0) lines.push({ account: 'Cash Account', debit: 0, credit: paidAmount });
          const debitSum = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
          const creditSum = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
          if (Math.abs(debitSum - creditSum) > 1.01) throw new Error(`Journal for invoice ${invNum} is not balanced.`);
          await client.query(
            `INSERT INTO journal_entries (id,entry_no,date,voucher_type,voucher_ref_no,narration,lines,user_mobile,created_at)
             VALUES ($1,$2,$3,'PURCHASE',$4,$5,$6,$7,NOW())`,
            [`JE-${purId}`, `JV-2B-${permId.slice(-8)}`, invDate, invNum, `GSTR-2B Reconciled Purchase from ${suppName}`, JSON.stringify(lines), userMobile]
          );
        }
        if (tempId) await client.query('DELETE FROM temporary_purchase_stage WHERE id=$1 AND user_mobile=$2', [tempId, userMobile]);
        shifted.push(invNum);
      }
      await client.query('COMMIT');
      res.status(200).json({ success: true, shiftedCount: shifted.length, shifted, verifiedAgainstGstr2b: true });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(409).json({ error: err.message || 'Unable to promote matched purchases.' });
    } finally { client.release(); }
  });

  void applyRecurringFees();
  void applyPermanentExpenses();
  const recurringFeeTimer = setInterval(() => {
    void applyRecurringFees();
    void applyPermanentExpenses();
  }, 60 * 60 * 1000);
  recurringFeeTimer.unref?.();
  appInstance = app;
  return app;
}

export default getApp;

const isDirectRun = !process.env.VERCEL;

if (isDirectRun) {
  getApp().then(async (app) => {
    const portArgIndex = process.argv.indexOf('--port');
    const portFromArg = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1]) : null;
    const PORT = portFromArg || (process.env.PORT ? parseInt(process.env.PORT) : 3000);

    // Setup Vite development middleware or serve production dist
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.resolve(__dirname, 'dist')));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Cotrix GST Enterprise Server is live on port ${PORT}`);
      console.log(`PostgreSQL Database Engine: Neon PostgreSQL connected.`);
    });
  }).catch((err) => {
    console.error('Fatal server startup failure:', err);
  });
}
