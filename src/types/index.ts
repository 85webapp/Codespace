export interface CompanyProfile {
  id: string;
  name: string;
  trade_name: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  phone2?: string;
  address: string;
  city: string;
  state: string;
  state_code: string;
  pincode: string;
  business_type?: string;
  business_category?: string;
  business_description?: string;
  signature_base64?: string;
  card_theme?: string;
  show_gstin_on_card?: boolean;
  show_type_on_card?: boolean;
  show_category_on_card?: boolean;
  books_beginning_date?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch_name?: string;
  upi_id?: string;
  terms_and_conditions?: string;
  signature_title?: string;
  logo_base64?: string;
  opening_capital?: number | string;
  updated_at?: string;
}

export interface AppSettings {
  id: string;
  language: 'en' | 'hi';
  currency: string;
  decimal_places: number;
  date_format: string;
  show_compliance_warnings: boolean;
  notifications_enabled: boolean;
  closing_alarm_time: string; // e.g. "21:30"
  eway_sync_threshold?: number;
  financial_year?: string;
  updated_at?: string;
}

export interface DailyCashSummary {
  id: string;
  user_mobile?: string;
  date: string;
  b2c_unbilled_sales: number | string;
  cash_in_hand: number | string;
  personal_expenses: number | string;
  total_recorded_sales: number | string;
  notes?: string;
  created_at?: string;
}

export interface Party {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  billing_address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  pincode?: string;
  opening_balance: number | string;
  current_balance: number | string;
  balance_numeric?: number;
  created_at?: string;
}

export interface InvoiceItem {
  name: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  purchase_rate?: number;
  discountPercent?: number;
  taxable: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface Invoice {
  id: string;
  type: 'TAX_INVOICE' | 'CASH_MEMO' | 'BILL_OF_SUPPLY';
  invoice_classification?: 'B2B' | 'B2C' | 'B2G';
  invoice_number: string;
  date: string;
  due_date?: string;
  party_id: string;
  party_name: string;
  party_gstin?: string;
  party_phone?: string;
  party_address?: string;
  party_pincode?: string;
  party_state: string;
  party_state_code: string;
  place_of_supply: string;
  is_inter_state: boolean;
  is_reverse_charge: boolean;
  items: InvoiceItem[];
  sub_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  round_off: number;
  grand_total: number;
  paid_amount: number;
  balance_amount: number;
  payment_mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CREDIT';
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
  total_purchase_cost?: number;
  notes?: string;
  created_at?: string;
}

export interface Purchase {
  id: string;
  invoice_classification?: 'B2B' | 'B2C' | 'B2G';
  supplier_invoice_no: string;
  date: string;
  due_date?: string;
  supplier_id: string;
  supplier_name: string;
  supplier_gstin?: string;
  supplier_state: string;
  supplier_state_code: string;
  items: InvoiceItem[];
  sub_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  grand_total: number;
  payment_status: 'PAID' | 'UNPAID';
  paid_amount: number;
  notes?: string;
  raw_image_url?: string;
  created_at?: string;
}

export interface Quotation {
  id: string;
  user_mobile?: string;
  quotation_number: string;
  date: string;
  valid_until?: string;
  party_id?: string;
  party_name: string;
  party_gstin?: string;
  party_phone?: string;
  party_state?: string;
  party_state_code?: string;
  place_of_supply?: string;
  items: InvoiceItem[];
  sub_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  round_off: number;
  grand_total: number;
  notes?: string;
  status: 'OPEN' | 'CONVERTED' | 'EXPIRED';
  converted_invoice_id?: string;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  user_context: string;
  action: string;
  entity: string;
  entity_id: string;
  payload: any;
  ip_address?: string;
  created_at: string;
}

export interface DbStatus {
  connected: boolean;
  provider?: string;
  region?: string;
  timestamp?: string;
  version?: string;
  tablesCount?: number;
  latencyMs?: number;
  error?: string;
}

export interface ClosureStatus {
  todayDate: string;
  yesterdayDate: string;
  isTodaySubmitted: boolean;
  isYesterdaySubmitted: boolean;
  isAlertActive: boolean;
  previousDayOutstanding: boolean;
  alarmTime: string;
  isPastAlarmTime: boolean;
}

export interface User {
  id?: string;
  name: string;
  mobile: string;
  role: 'CUSTOMER' | 'ADMIN' | 'CASHIER';
}

export interface CustomerAdmin {
  id: string;
  name: string;
  mobile: string;
  createdAt: string;
  businessDetails: {
    tradeName: string;
    gstin: string;
    phone: string;
    email: string;
    address: string;
    pincode: string;
    state: string;
    businessType: string;
    businessCategory: string;
    booksBeginningDate: string;
  };
  accountDetails: {
    totalInvoicesCount: number;
    totalInvoicesValue: number;
    todayInvoicesCount: number;
    todayInvoicesValue: number;
    isAlarmOn: boolean;
    isTodayClosureFiled: boolean;
    hasUnfiledAlarmAlert: boolean;
  };
  caCompliance: {
    gstr1_filed: boolean;
    gstr3b_filed: boolean;
    audit_completed: boolean;
    notes: string;
  };
  isRedAlert: boolean;
}

export interface ExpenseItem {
  id?: string;
  name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Expense {
  id: string;
  expense_no: string;
  date: string;
  category: string;
  title?: string;
  amount?: number;
  total_amount?: number;
  payment_mode?: string;
  payment_type?: 'CASH' | 'CHEQUE' | 'BANK' | string;
  paid_to?: string;
  category_type?: 'Indirect Expense' | 'Direct Expense';
  items?: ExpenseItem[];
  payment_ref_no?: string;
  notes?: string;
  created_at?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  type: 'Indirect Expense' | 'Direct Expense';
  amount?: number;
}

export interface CashierHandshakeRequest {
  id: string;
  request_id: string;
  owner_mobile_id: string;
  handshake_code_five_digit: string;
  permission_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  compare_price?: number;
  media: string[];
  variants?: string[] | { name: string; options: string[] }[];
  is_published: boolean;
  stock?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  variant?: string;
  image?: string;
}

export interface OrderAddress {
  street?: string;
  building_number?: string;
  landmark?: string;
  line1: string;
  line2?: string;
  pincode?: string;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string;
  address: OrderAddress;
  items: OrderItem[];
  payment_method: 'COD' | 'ONLINE';
  payment_status?: string;
  payment_reference?: string;
  payment_verified_at?: string | null;
  payment_sub_option?: 'QR_CODE' | 'UPI_ID' | 'PHONE' | null;
  subtotal: number;
  cod_fee: number;
  grand_total: number;
  status: string;
  created_at: string;
}

export interface AdminPaymentSettings {
  qr_code_url: string;
  phone_number: string;
  upi_id: string;
}

export interface CustomerWalletTransaction {
  id: string;
  type: string;
  amount: number;
  notes?: string;
  date: string;
}

export interface CustomerWallet {
  customer_mobile: string;
  payment_in: number;
  payment_out: number;
  due_balance: number;
  monthly_fee: number;
  statusColor: 'RED' | 'BLUE' | 'GREEN';
  transactions: CustomerWalletTransaction[];
}


