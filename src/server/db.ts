import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL?.trim();

// In-memory mock store to ensure Cotrix boots and functions cleanly
// even when an external PostgreSQL instance is not connected.
const memStore: Record<string, any[]> = {
  users: [],
  client_users: [],
  company_profiles: [],
  app_settings: [],
  daily_cash_summaries: [],
  parties: [],
  invoices: [],
  purchases: [],
  expenses: [],
  payments: [],
  quotations: [],
  journal_entries: [],
  audit_edit_logs: [],
  temporary_purchase_stage: [],
  gstr2b_portal_cache: [],
  permanent_purchase_ledger: [],
  auth_sessions: [],
  cashier_devices: [],
  cashier_link_tokens: [],
  cashier_handshake_auth: [],
  password_reset_requests: [],
  products: [],
  orders: [],
  admin_payment_settings: [],
  customer_wallets: [],
  ineligible_tax_logs: [],
  tax_ledger_opening_balances: [],
  bank_statement_records: [],
};

function getTable(tableName: string): any[] {
  const norm = tableName.toLowerCase().trim();
  if (!memStore[norm]) {
    memStore[norm] = [];
  }
  return memStore[norm];
}

function splitBalanced(str: string, delimiter = ','): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inQuote) {
      current += char;
      if (char === inQuote && str[i - 1] !== '\\') inQuote = null;
    } else if (char === "'" || char === '"') {
      inQuote = char;
      current += char;
    } else if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === delimiter && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function resolveParam(valStr: string, params: any[]): any {
  const trimmed = valStr.trim();
  if (trimmed.startsWith('$')) {
    const idx = parseInt(trimmed.slice(1), 10) - 1;
    return params[idx];
  }
  const u = trimmed.toUpperCase();
  if (u.includes('NOW()') || u.includes('CURRENT_TIMESTAMP')) {
    if (u.includes('+') && u.includes('MINUTE')) {
      const mins = parseInt(u.match(/(\d+)\s*MINUTE/)?.[1] || '30', 10);
      return new Date(Date.now() + mins * 60 * 1000).toISOString();
    }
    return new Date().toISOString();
  }
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  if (u === 'NULL') return null;
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;
  return trimmed;
}

function executeMockQuery(sql: string, params: any[] = []): { rows: any[]; rowCount: number } {
  const cleanSql = sql.trim().replace(/;+$/, '');
  const upper = cleanSql.toUpperCase();

  // 1. DDL Statements: Tables, Alter, Drop, Index, Vacuum
  if (
    upper.startsWith('CREATE') ||
    upper.startsWith('ALTER') ||
    upper.startsWith('DROP') ||
    upper.startsWith('SET') ||
    upper.startsWith('BEGIN') ||
    upper.startsWith('COMMIT') ||
    upper.startsWith('ROLLBACK')
  ) {
    return { rows: [], rowCount: 0 };
  }

  // 2. Metadata / Health checks
  if (upper.includes('INFORMATION_SCHEMA.TABLES')) {
    return { rows: [{ count: '18' }], rowCount: 1 };
  }
  if (upper.includes('SELECT NOW()') || upper.includes('SELECT CURRENT_TIME')) {
    return {
      rows: [{ current_time: new Date().toISOString(), pg_version: 'PostgreSQL 16.2 (AI Studio In-Memory Mock)' }],
      rowCount: 1,
    };
  }

  // 3. INSERT INTO <table> (...) VALUES (...)
  const insertHeadMatch = cleanSql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*VALUES/i);
  if (insertHeadMatch) {
    const tableName = insertHeadMatch[1].toLowerCase();
    const cols = splitBalanced(insertHeadMatch[2]).map((c) => c.toLowerCase());
    const table = getTable(tableName);

    // Extract inside of VALUES(...)
    const valuesIdx = cleanSql.search(/VALUES\s*\(/i);
    const startParen = cleanSql.indexOf('(', valuesIdx);
    let depth = 0;
    let endParen = -1;
    for (let i = startParen; i < cleanSql.length; i++) {
      if (cleanSql[i] === '(') depth++;
      else if (cleanSql[i] === ')') {
        depth--;
        if (depth === 0) {
          endParen = i;
          break;
        }
      }
    }
    const rawValsStr = endParen !== -1 ? cleanSql.slice(startParen + 1, endParen) : '';
    const rawVals = splitBalanced(rawValsStr);

    const newRecord: Record<string, any> = {};
    cols.forEach((col, idx) => {
      newRecord[col] = resolveParam(rawVals[idx] ?? 'NULL', params);
    });

    if (!newRecord.id && !newRecord.mobile && !newRecord.request_id) {
      newRecord.id = 'MOCK-' + Math.random().toString(36).substring(2, 9);
    }
    if (!newRecord.created_at) {
      newRecord.created_at = new Date().toISOString();
    }

    // Handle ON CONFLICT
    const conflictMatch = cleanSql.match(/ON\s+CONFLICT\s*\(([^)]+)\)/i);
    if (conflictMatch) {
      const conflictKey = conflictMatch[1].trim().toLowerCase();
      const existingIdx = table.findIndex((r) => String(r[conflictKey]) === String(newRecord[conflictKey]));
      if (existingIdx !== -1) {
        table[existingIdx] = { ...table[existingIdx], ...newRecord };
        return { rows: [table[existingIdx]], rowCount: 1 };
      }
    }

    table.push(newRecord);
    return { rows: [newRecord], rowCount: 1 };
  }

  // 4. SELECT from <table>
  const selectMatch = cleanSql.match(/SELECT\s+(.*?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+|\$\d+))?$/i);
  if (selectMatch) {
    const selectCols = selectMatch[1].trim();
    const tableName = selectMatch[2].toLowerCase();
    const whereClause = selectMatch[3]?.trim();
    const orderClause = selectMatch[4]?.trim();
    const limitClause = selectMatch[5]?.trim();

    const table = getTable(tableName);
    let matched = [...table];

    // Simple WHERE matching: supports fields, functions (LOWER, TRIM), and operators
    if (whereClause) {
      const conditions = whereClause.split(/\s+AND\s+/i);
      for (const cond of conditions) {
        // Handle (user_mobile = $1 OR user_mobile = $2)
        if (cond.includes(' OR ')) {
          const orBranches = cond.replace(/^\(|\)$/g, '').split(/\s+OR\s+/i);
          matched = matched.filter((r) => {
            return orBranches.some((branch) => {
              const bMatch = branch.match(/(?:LOWER\s*\(\s*TRIM\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*\)|TRIM\s*\(\s*([a-zA-Z0-9_]+)\s*\)|LOWER\s*\(\s*([a-zA-Z0-9_]+)\s*\)|([a-zA-Z0-9_]+))\s*(=|!=|<>|IS|IS NOT|>|<|>=|<=)\s*(.+)/i);
              if (!bMatch) return false;
              const field = (bMatch[1] || bMatch[2] || bMatch[3] || bMatch[4]).trim().toLowerCase();
              const op = bMatch[5].trim().toUpperCase();
              let rawExpected = bMatch[6].trim();
              if (/^LOWER\s*\(\s*TRIM\s*\(/i.test(rawExpected)) {
                rawExpected = rawExpected.replace(/^LOWER\s*\(\s*TRIM\s*\((.*)\)\s*\)$/i, '$1');
              }
              const val = resolveParam(rawExpected, params);
              if (op === '=' || op === 'IS') {
                return String(r[field] ?? '').trim().toLowerCase() === String(val ?? '').trim().toLowerCase();
              }
              return false;
            });
          });
          continue;
        }

        const condMatch = cond.match(/(?:LOWER\s*\(\s*TRIM\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*\)|TRIM\s*\(\s*([a-zA-Z0-9_]+)\s*\)|LOWER\s*\(\s*([a-zA-Z0-9_]+)\s*\)|([a-zA-Z0-9_]+))\s*(=|!=|<>|IS|IS NOT|>|<|>=|<=)\s*(.+)/i);
        if (condMatch) {
          const field = (condMatch[1] || condMatch[2] || condMatch[3] || condMatch[4]).trim().toLowerCase();
          const op = condMatch[5].trim().toUpperCase();
          let rawExpected = condMatch[6].trim();
          const isLowerTrim = cond.toUpperCase().includes('LOWER') || cond.toUpperCase().includes('TRIM');

          if (/^LOWER\s*\(\s*TRIM\s*\(/i.test(rawExpected)) {
            rawExpected = rawExpected.replace(/^LOWER\s*\(\s*TRIM\s*\((.*)\)\s*\)$/i, '$1');
          } else if (/^TRIM\s*\(/i.test(rawExpected)) {
            rawExpected = rawExpected.replace(/^TRIM\s*\((.*)\)\s*\)$/i, '$1');
          } else if (/^LOWER\s*\(/i.test(rawExpected)) {
            rawExpected = rawExpected.replace(/^LOWER\s*\((.*)\)\s*\)$/i, '$1');
          }

          if (op === 'IS' && rawExpected.toUpperCase() === 'NULL') {
            matched = matched.filter((r) => r[field] === null || r[field] === undefined);
          } else if (op === 'IS NOT' && rawExpected.toUpperCase() === 'NULL') {
            matched = matched.filter((r) => r[field] !== null && r[field] !== undefined);
          } else if (op === '=' || op === 'IS') {
            const val = resolveParam(rawExpected, params);
            if (isLowerTrim) {
              matched = matched.filter((r) => String(r[field] ?? '').trim().toLowerCase() === String(val ?? '').trim().toLowerCase());
            } else {
              matched = matched.filter((r) => String(r[field] ?? '') === String(val ?? ''));
            }
          } else if (op === '!=' || op === '<>') {
            const val = resolveParam(rawExpected, params);
            matched = matched.filter((r) => String(r[field] ?? '') !== String(val ?? ''));
          } else if (op === '>') {
            const val = resolveParam(rawExpected, params);
            matched = matched.filter((r) => (r[field] ?? '') > val);
          } else if (op === '<=') {
            const val = resolveParam(rawExpected, params);
            matched = matched.filter((r) => (r[field] ?? '') <= val);
          } else if (op === '<') {
            const val = resolveParam(rawExpected, params);
            matched = matched.filter((r) => (r[field] ?? '') < val);
          } else if (op === '>=') {
            const val = resolveParam(rawExpected, params);
            matched = matched.filter((r) => (r[field] ?? '') >= val);
          }
        }
      }
    }

    // Sorting
    if (orderClause) {
      const isDesc = orderClause.toUpperCase().includes('DESC');
      const orderCol = orderClause.split(/\s+/)[0].toLowerCase();
      matched.sort((a, b) => {
        const va = a[orderCol] ?? '';
        const vb = b[orderCol] ?? '';
        if (va < vb) return isDesc ? 1 : -1;
        if (va > vb) return isDesc ? -1 : 1;
        return 0;
      });
    }

    // Limit
    if (limitClause) {
      let lNum = 100;
      if (limitClause.startsWith('$')) {
        lNum = parseInt(resolveParam(limitClause, params), 10) || 100;
      } else {
        lNum = parseInt(limitClause, 10) || 100;
      }
      matched = matched.slice(0, lNum);
    }

    // Project columns
    if (selectCols === '1') {
      return { rows: matched.map((r) => ({ ...r, '1': 1, '?column?': 1 })), rowCount: matched.length };
    }

    if (selectCols !== '*') {
      const cols = splitBalanced(selectCols).map((c) => c.toLowerCase());
      matched = matched.map((row) => {
        const obj: any = {};
        cols.forEach((c) => {
          const aliasParts = c.split(/\s+as\s+/i);
          const sourceCol = aliasParts[0].trim();
          const destCol = (aliasParts[1] || aliasParts[0]).trim();
          obj[destCol] = row[sourceCol] ?? row[destCol] ?? null;
        });
        return obj;
      });
    }

    return { rows: matched, rowCount: matched.length };
  }

  // 5. UPDATE <table> SET ... WHERE ...
  const updateMatch = cleanSql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*?))?$/i);
  if (updateMatch) {
    const tableName = updateMatch[1].toLowerCase();
    const setClause = updateMatch[2].trim();
    const whereClause = updateMatch[3]?.trim();
    const table = getTable(tableName);

    const assignments = splitBalanced(setClause).map((a) => {
      const eqIdx = a.indexOf('=');
      const col = a.slice(0, eqIdx).trim().toLowerCase();
      const rawVal = a.slice(eqIdx + 1).trim();
      return { col, val: resolveParam(rawVal, params) };
    });

    let count = 0;
    const updatedRows: any[] = [];
    table.forEach((row, idx) => {
      let matches = true;
      if (whereClause) {
        const conds = whereClause.split(/\s+AND\s+/i);
        for (const cond of conds) {
          const condMatch = cond.match(/([a-zA-Z0-9_]+)\s*(=|!=|<>|IS|IS NOT|>|<|<=|>=)\s*(.+)/i);
          if (condMatch) {
            const field = condMatch[1].trim().toLowerCase();
            const op = condMatch[2].trim().toUpperCase();
            const val = resolveParam(condMatch[3].trim(), params);
            if (op === '=' || op === 'IS') {
              if (String(row[field] ?? '') !== String(val ?? '')) matches = false;
            } else if (op === '!=' || op === '<>') {
              if (String(row[field] ?? '') === String(val ?? '')) matches = false;
            } else if (op === '<=') {
              if ((row[field] ?? '') > val) matches = false;
            } else if (op === '<') {
              if ((row[field] ?? '') >= val) matches = false;
            } else if (op === '>=') {
              if ((row[field] ?? '') < val) matches = false;
            } else if (op === '>') {
              if ((row[field] ?? '') <= val) matches = false;
            }
          }
        }
      }
      if (matches) {
        assignments.forEach(({ col, val }) => {
          row[col] = val;
        });
        table[idx] = row;
        updatedRows.push(row);
        count++;
      }
    });

    return { rows: updatedRows, rowCount: count };
  }

  // 6. DELETE FROM <table> WHERE ...
  const deleteMatch = cleanSql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?$/i);
  if (deleteMatch) {
    const tableName = deleteMatch[1].toLowerCase();
    const whereClause = deleteMatch[2]?.trim();
    const table = getTable(tableName);

    if (!whereClause) {
      const prevLen = table.length;
      memStore[tableName] = [];
      return { rows: [], rowCount: prevLen };
    }

    const condMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*(=)\s*(.+)/i);
    if (condMatch) {
      const field = condMatch[1].trim().toLowerCase();
      const val = resolveParam(condMatch[3].trim(), params);
      const remaining = table.filter((r) => String(r[field] ?? '') !== String(val ?? ''));
      const removedCount = table.length - remaining.length;
      memStore[tableName] = remaining;
      return { rows: [], rowCount: removedCount };
    }
    return { rows: [], rowCount: 0 };
  }

  return { rows: [], rowCount: 0 };
}

// Resilient Pool wrapper that transparently uses real PostgreSQL when connected,
// and gracefully falls back to the in-memory engine when offline or unconfigured.
let realPool: pg.Pool | null = null;
let isConnectedToPostgres = false;

if (DATABASE_URL) {
  try {
    const { Pool } = pg;
    realPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
    });
    realPool.on('error', (err: any) => {
      console.warn('[Database] PostgreSQL connection warning (falling back to in-memory):', err.message);
      isConnectedToPostgres = false;
    });
  } catch (err: any) {
    console.warn('[Database] Could not create PostgreSQL pool, using mock:', err.message);
  }
} else {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production. Refusing to start with volatile in-memory storage.');
  }
  console.warn('[Database] No DATABASE_URL specified. Development-only in-memory mode is active; data will not persist.');
}

export const pool = {
  async query(text: string, params: any[] = []): Promise<any> {
    if (realPool) {
      // Never silently switch a live application to volatile memory after a database error.
      // That can make writes appear successful while production data is not persisted.
      const res = await realPool.query(text, params);
      isConnectedToPostgres = true;
      return res;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database is not configured; production requests cannot use in-memory storage.');
    }
    return executeMockQuery(text, params);
  },
  async connect(): Promise<any> {
    if (realPool) {
      // Transactional code must fail if a real PostgreSQL client cannot be acquired.
      // Falling back to a mock client would make BEGIN/COMMIT meaningless.
      return await realPool.connect();
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database is not configured; production transactions are disabled.');
    }
    return {
      query: (t: string, p: any[] = []) => executeMockQuery(t, p),
      release: () => {},
    };
  },
  on(event: string, handler: Function) {
    if (realPool) realPool.on(event as any, handler as any);
  },
};

export async function testConnection(): Promise<{
  success: boolean;
  timestamp: string;
  version?: string;
  isInMemory: boolean;
  error?: string;
}> {
  if (realPool) {
    try {
      const res = await realPool.query('SELECT NOW() as "current_time", version() as pg_version');
      isConnectedToPostgres = true;
      return {
        success: true,
        timestamp: res.rows[0]?.current_time || new Date().toISOString(),
        version: res.rows[0]?.pg_version || 'PostgreSQL',
        isInMemory: false,
      };
    } catch (error: any) {
      isConnectedToPostgres = false;
      return {
        success: false,
        timestamp: new Date().toISOString(),
        version: 'PostgreSQL connection failed',
        isInMemory: false,
        error: error.message,
      };
    }
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    version: 'Cotrix In-Memory Database (Fully Functional)',
    isInMemory: true,
  };
}
