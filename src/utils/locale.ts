// Global locale state (language, currency, date format, financial year).
// Kept outside React so helpers like formatCurrency can use the active values.

export type AppLanguage = 'en' | 'hi';

export interface LocaleState {
  language: AppLanguage;
  currency: string;
  dateFormat: string;
}

const state: LocaleState = {
  language: 'en',
  currency: '₹',
  dateFormat: 'DD/MM/YYYY',
};

const listeners = new Set<() => void>();

export function getLocale(): LocaleState {
  return state;
}

export function getCurrencySymbol(): string {
  return state.currency || '₹';
}

export function setLocale(partial: Partial<LocaleState>) {
  let changed = false;
  (Object.keys(partial) as (keyof LocaleState)[]).forEach((k) => {
    const v = partial[k];
    if (v !== undefined && state[k] !== v) {
      (state as any)[k] = v;
      changed = true;
    }
  });
  if (changed) listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const CURRENCY_OPTIONS = [
  { value: '₹', label: '₹ INR - Indian Rupee' },
  { value: '$', label: '$ USD - US Dollar' },
  { value: '€', label: '€ EUR - Euro' },
  { value: '£', label: '£ GBP - British Pound' },
  { value: 'AED', label: 'AED - UAE Dirham' },
];

export const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY - Indian Standard' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY - US Standard' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD - ISO Standard' },
  { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY - e.g. 29-Sep-2026' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY - European Standard' },
];

// Indian financial year runs April to March. Returns e.g. "2026-27" for Oct 2026.
export function getFinancialYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function getFinancialYearOptions(now = new Date()): { current: string; previous: string } {
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    current: getFinancialYearLabel(startYear),
    previous: getFinancialYearLabel(startYear - 1),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Converts a stored DD/MM/YYYY date to the user's chosen display format.
export function reformatDmy(dd: string, mm: string, yyyy: string, format = state.dateFormat): string {
  switch (format) {
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'DD-MMM-YYYY': {
      const m = MONTHS[parseInt(mm, 10) - 1];
      return m ? `${dd}-${m}-${yyyy}` : `${dd}/${mm}/${yyyy}`;
    }
    case 'DD.MM.YYYY':
      return `${dd}.${mm}.${yyyy}`;
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}
