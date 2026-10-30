// Invoice print settings (Regular + Thermal). Saved per user on this device and applied to every
// invoice preview, PDF download, share and print.

export type TextSize = 'small' | 'medium' | 'large';
export type CompanyNameSize = 'small' | 'medium' | 'large' | 'xlarge';
export type PageSize = 'A4' | 'A5' | 'LETTER';
export type Orientation = 'portrait' | 'landscape';
export type NumberFormat = 'indian' | 'international';

/** Options shared by the Regular and the Thermal layout */
export interface SheetOptions {
  copies: number;
  // Company header
  showCompanyName: boolean;
  companyNameSize: CompanyNameSize;
  showLogo: boolean;
  showAddress: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showGstin: boolean;
  // Item table
  showSno: boolean;
  showHsn: boolean;
  showUnit: boolean;
  // Totals & taxes
  showTotalQty: boolean;
  amountDecimals: boolean;
  showReceived: boolean;
  showBalance: boolean;
  showTaxDetails: boolean;
  amountGrouping: boolean;
  numberFormat: NumberFormat;
  showAmountInWords: boolean;
  showYouSaved: boolean;
  // Footer
  showDescription: boolean;
  showTerms: boolean;
  customTerms: string;
  showBank: boolean;
  showSignature: boolean;
  customSignatureText: string;
  showPaymentMode: boolean;
}

export interface RegularSettings extends SheetOptions {
  isDefault: boolean;
  theme: string; // 'STANDARD' or one of the older themes
  color: string;
  textSize: TextSize;
  pageSize: PageSize;
  orientation: Orientation;
  extraTopMm: number;
  showOriginalDuplicate: boolean;
  minRows: number;
  showReceivedBy: boolean;
  showDeliveredBy: boolean;
  showPageNumbers: boolean;
}

export interface ThermalSettings extends SheetOptions {
  isDefault: boolean;
  pageWidth: '58' | '80'; // mm
  extraLines: number;
  textStyling: boolean;
}

export interface PrintSettings {
  regular: RegularSettings;
  thermal: ThermalSettings;
}

const baseOptions: SheetOptions = {
  copies: 1,
  showCompanyName: true,
  companyNameSize: 'large',
  showLogo: true,
  showAddress: true,
  showEmail: true,
  showPhone: true,
  showGstin: true,
  showSno: true,
  showHsn: true,
  showUnit: true,
  showTotalQty: true,
  amountDecimals: true,
  showReceived: true,
  showBalance: true,
  showTaxDetails: true,
  amountGrouping: true,
  numberFormat: 'indian',
  showAmountInWords: true,
  showYouSaved: true,
  showDescription: true,
  showTerms: true,
  customTerms: '',
  showBank: true,
  showSignature: true,
  customSignatureText: '',
  showPaymentMode: false,
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  regular: {
    ...baseOptions,
    isDefault: false,
    theme: 'STANDARD',
    color: '#2563eb',
    textSize: 'medium',
    pageSize: 'A4',
    orientation: 'portrait',
    extraTopMm: 0,
    showOriginalDuplicate: false,
    minRows: 0,
    showReceivedBy: false,
    showDeliveredBy: false,
    showPageNumbers: true,
  },
  thermal: {
    ...baseOptions,
    isDefault: false,
    pageWidth: '80',
    extraLines: 2,
    textStyling: true,
    showEmail: false,
    showTaxDetails: false,
    showBank: false,
  },
};

export const getCurrentMobile = (): string => {
  try {
    const raw = localStorage.getItem('cotrix_user');
    return raw ? JSON.parse(raw)?.mobile || '' : '';
  } catch {
    return '';
  }
};

const storageKey = (mobile?: string) => `cotrix_print_settings_${(mobile ?? getCurrentMobile()) || 'guest'}`;

const merge = (saved: any): PrintSettings => ({
  regular: { ...DEFAULT_PRINT_SETTINGS.regular, ...(saved?.regular || {}) },
  thermal: { ...DEFAULT_PRINT_SETTINGS.thermal, ...(saved?.thermal || {}) },
});

export function loadPrintSettings(mobile?: string): PrintSettings {
  try {
    const raw = localStorage.getItem(storageKey(mobile));
    return merge(raw ? JSON.parse(raw) : {});
  } catch {
    return merge({});
  }
}

export function savePrintSettings(ps: PrintSettings, mobile?: string) {
  try {
    localStorage.setItem(storageKey(mobile), JSON.stringify(ps));
  } catch {
    /* storage full / blocked - settings just won't persist */
  }
}

/** Page width in CSS px for the PDF/preview (96 dpi) */
export function pageWidthPx(size: PageSize, orientation: Orientation): number {
  const portrait = size === 'A5' ? 559 : size === 'LETTER' ? 816 : 794;
  const landscape = size === 'A5' ? 794 : size === 'LETTER' ? 1056 : 1123;
  return orientation === 'landscape' ? landscape : portrait;
}

export const textSizePx = (s: TextSize) => (s === 'small' ? 10 : s === 'large' ? 14 : 12);
export const companyNameEm = (s: CompanyNameSize) =>
  s === 'small' ? 1.0 : s === 'medium' ? 1.25 : s === 'large' ? 1.5 : 1.9;
export const thermalWidthPx = (mm: '58' | '80') => (mm === '58' ? 219 : 302);
