import { getCurrencySymbol, reformatDmy } from './locale';

export function formatCurrency(
  amount: number | string | undefined | null,
  currency: string = getCurrencySymbol(),
  decimals = 2
): string {
  const val = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0').replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  if (isNaN(val)) return `${currency}0.00`;

  // Indian number formatting with thousands & lakhs
  const parts = val.toFixed(decimals).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1] ? `.${parts[1]}` : '';

  const isNegative = integerPart.startsWith('-');
  if (isNegative) {
    integerPart = integerPart.substring(1);
  }

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  return `${isNegative ? '-' : ''}${currency}${formattedInt}${decimalPart}`;
}

export function formatDate(dateStr: string | undefined, format?: string): string {
  if (!dateStr) return '';
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
  if (m) return reformatDmy(m[1], m[2], m[3], format);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return reformatDmy(
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getFullYear()),
    format
  );
}

/** Format an editable numeric value with Indian digit grouping (e.g. 1,00,000).
 * Keep this string for UI only; parseIndianNumber should be used before arithmetic/API writes.
 */
export function formatIndianNumberInput(value: number | string | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).replace(/,/g, '').trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return String(value);
  const n = Number(normalized);
  if (!Number.isFinite(n)) return '';
  // Preserve user-entered decimal precision (including trailing zeroes) unless a fixed precision is requested.
  const fixed = decimals === undefined ? normalized : n.toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const lastThree = digits.slice(-3);
  const preceding = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${preceding ? `${preceding},` : ''}${lastThree}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/** Parse Indian-grouped editable values safely before calculations or persistence. */
export function parseIndianNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
