import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Building2,
  Pencil,
  QrCode,
  Bell,
  Settings,
  ShoppingBag,
  FileText,
  DollarSign,
  Layers,
  Wallet,
  Landmark,
  CreditCard,
  RefreshCw,
  Database,
  ArrowLeft,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  User,
  Phone,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  Truck,
  FileDiff,
  FileJson,
  Scale,
  TrendingUp,
  ShieldAlert,
  BarChart3,
  FileCheck2,
  Download,
  Share2,
  Loader2,
} from 'lucide-react';
import { CompanyProfile, AppSettings, Invoice, Purchase, Party, User as UserType } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Gstr2bReconciler } from './Gstr2bReconciler';
import { ItcDashboard } from './ItcDashboard';
import { ReportsHub } from './ReportsHub';
import { PaymentSettlementModal } from './PaymentSettlementModal';
import { buildDetailsPdfBlob, downloadJson, downloadPdf, sharePdf, shareJson, showToast } from '../utils/pdfShare';

interface MenuPanelProps {
  company: CompanyProfile | null;
  settings: AppSettings;
  currentUser: UserType | null;
  invoices: Invoice[];
  purchases: Purchase[];
  parties: Party[];
  todayExpensesTotal: number;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onAddNewSale: () => void;
  onSelectInvoiceForView: (invoice: Invoice) => void;
  onOpenManualPurchase: () => void;
  onOpenQuickPurchase: () => void;
  onOpenEWayBill?: () => void;
  onRefreshData?: () => void;
}

export const MenuPanel: React.FC<MenuPanelProps> = ({
  company,
  settings,
  currentUser,
  invoices,
  purchases,
  parties,
  todayExpensesTotal,
  onOpenSettings,
  onOpenNotifications,
  onOpenProfile,
  onAddNewSale,
  onSelectInvoiceForView,
  onOpenManualPurchase,
  onOpenQuickPurchase,
  onOpenEWayBill,
  onRefreshData,
}) => {
  // Navigation active view inside Menu
  // null = root Menu list
  // 'sale_invoice' | 'payment_in' | 'sale_return' | 'purchase_bills' | 'payment_out' | 'purchase_return' | 'expenses' | 'cash_in_hand' | 'reports' | 'ewb' | 'gstr2b' | 'itc'
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [openDailyDate, setOpenDailyDate] = useState<string | null>(null);
  const [activeSubView, setActiveSubView] = useState<string | null>(null);
  const [purchaseExportBusy, setPurchaseExportBusy] = useState<string | null>(null);

  // Accordion open states - strictly collapsed by default per Pillar 1 & Part 2 Item 4
  const [isSaleOpen, setIsSaleOpen] = useState(false);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isAccountingOpen, setIsAccountingOpen] = useState(false);

  // Payments data (Payment-In and Payment-Out)
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Add Payment Modal State
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [paymentFormType, setPaymentFormType] = useState<'PAYMENT_IN' | 'PAYMENT_OUT'>('PAYMENT_IN');
  const [paymentPartyName, setPaymentPartyName] = useState('');
  const [paymentPartyPhone, setPaymentPartyPhone] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentReceiptNo, setPaymentReceiptNo] = useState(() => String(Math.floor(1 + Math.random() * 99)));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toLocaleDateString('en-GB'));
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Expenses local view states (Categories vs Items)
  const [expenseTab, setExpenseTab] = useState<'categories' | 'items'>('categories');
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [isAddExpenseFormOpen, setIsAddExpenseFormOpen] = useState(false);
  const [newExpCategory, setNewExpCategory] = useState('food');
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpDate, setNewExpDate] = useState(() => new Date().toLocaleDateString('en-GB'));
  const [newExpPayType, setNewExpPayType] = useState('Cash');
  const [newExpNote, setNewExpNote] = useState('');
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  // Credit / Debit Notes
  const [creditDebitNotes, setCreditDebitNotes] = useState<any[]>([]);
  const [isAddCreditNoteOpen, setIsAddCreditNoteOpen] = useState(false);
  const [cdnType, setCdnType] = useState<'CREDIT_NOTE' | 'DEBIT_NOTE'>('CREDIT_NOTE');
  const [cdnRefInvoiceNumber, setCdnRefInvoiceNumber] = useState('');
  const [cdnPartyName, setCdnPartyName] = useState('');
  const [cdnAmount, setCdnAmount] = useState('');
  const [cdnReason, setCdnReason] = useState('Goods Damaged / Returned');

  // Quotations / Estimates state
  const [quotations, setQuotations] = useState<any[]>([]);
  const [convertingQuoId, setConvertingQuoId] = useState<string | null>(null);

  // Search queries for lists
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch payments
  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const res = await apiFetch('/api/payments', {
        headers: currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(data || []);
      }
    } catch (e) {
      console.error('Failed to load payments:', e);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Fetch quotations
  const loadQuotations = async () => {
    try {
      const res = await apiFetch('/api/quotations', {
        headers: currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setQuotations(data || []);
      }
    } catch (e) {
      console.error('Failed to load quotations:', e);
    }
  };

  // Convert Quotation to Tax Invoice
  const handleConvertQuotation = async (quoId: string) => {
    setConvertingQuoId(quoId);
    try {
      const res = await apiFetch(`/api/quotations/${quoId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        await loadQuotations();
        if (onRefreshData) onRefreshData();
        if (data.invoice && onSelectInvoiceForView) {
          onSelectInvoiceForView(data.invoice);
        }
      } else {
        const err = await res.json();
        alert(`Conversion failed: ${err.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Error converting quotation: ${e.message}`);
    } finally {
      setConvertingQuoId(null);
    }
  };

  // Fetch expenses
  const loadExpenses = async () => {
    try {
      const res = await apiFetch('/api/expenses', {
        headers: currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setExpensesList(data.expenses || []);
      }
    } catch (e) {
      console.error('Failed to load expenses:', e);
    }
  };

  // Fetch credit/debit notes
  const loadCdn = async () => {
    try {
      const res = await apiFetch('/api/compliance/credit-debit-notes');
      if (res.ok) {
        const data = await res.json();
        setCreditDebitNotes(data || []);
      }
    } catch (e) {
      console.error('Failed to load notes:', e);
    }
  };

  // Fetch saved Daily Reports (one per date)
  const loadDailyReports = async () => {
    try {
      const res = await apiFetch('/api/daily-cash-summaries', {
        headers: currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setDailyReports(data.summaries || []);
      }
    } catch (e) {
      console.error('Failed to load daily reports:', e);
    }
  };

  useEffect(() => {
    loadPayments();
    loadExpenses();
    loadDailyReports();
    loadCdn();
    loadQuotations();
  }, [currentUser]);

  // Reset all transaction entry form modal states when navigating subviews
  useEffect(() => {
    if (activeSubView === 'daily_reports' || activeSubView === 'cash_in_hand') {
      loadDailyReports();
      loadExpenses();
      setOpenDailyDate(null);
    }
    setIsAddPaymentModalOpen(false);
    setIsAddExpenseFormOpen(false);
    setIsAddCreditNoteOpen(false);
  }, [activeSubView]);

  // Handle Save Payment (Payment-In or Payment-Out)
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(paymentAmount);
    if (!paymentPartyName.trim() || isNaN(numAmt) || numAmt <= 0) {
      alert('Please enter party name and a valid amount.');
      return;
    }
    setIsSavingPayment(true);
    try {
      const res = await apiFetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}),
        },
        body: JSON.stringify({
          type: paymentFormType,
          receipt_no: paymentReceiptNo,
          date: paymentDate,
          party_name: paymentPartyName.trim(),
          party_phone: paymentPartyPhone.trim(),
          amount: numAmt,
          payment_type: paymentMode,
          description: paymentDescription.trim(),
        }),
      });
      if (res.ok) {
        setPaymentPartyName('');
        setPaymentPartyPhone('');
        setPaymentAmount('');
        setPaymentDescription('');
        setPaymentReceiptNo(String(Math.floor(1 + Math.random() * 99)));
        setIsAddPaymentModalOpen(false);
        await loadPayments();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      console.error('Save payment error:', err);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Handle Save Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(newExpAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    setIsSavingExpense(true);
    try {
      const res = await apiFetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}),
        },
        body: JSON.stringify({
          expense_no: `EXP-${Date.now().toString().slice(-4)}`,
          date: newExpDate,
          category: newExpCategory,
          title: newExpTitle.trim() || newExpCategory,
          amount: numAmt,
          payment_mode: newExpPayType.toUpperCase(),
          notes: newExpNote.trim(),
        }),
      });
      if (res.ok) {
        setNewExpTitle('');
        setNewExpAmount('');
        setNewExpNote('');
        setIsAddExpenseFormOpen(false);
        await loadExpenses();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      console.error('Save expense error:', err);
    } finally {
      setIsSavingExpense(false);
    }
  };

  // Handle Save Credit/Debit Note
  const handleSaveCdn = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(cdnAmount);
    if (!cdnPartyName.trim() || isNaN(numAmt) || numAmt <= 0) {
      alert('Please enter party name and amount.');
      return;
    }
    try {
      const res = await apiFetch('/api/compliance/credit-debit-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}),
        },
        body: JSON.stringify({
          note_type: cdnType,
          original_doc_type: 'TAX_INVOICE',
          original_doc_number: cdnRefInvoiceNumber.trim(),
          party_name: cdnPartyName.trim(),
          amount: numAmt,
          reason: cdnReason,
          date: new Date().toLocaleDateString('en-GB'),
        }),
      });
      if (res.ok) {
        setCdnRefInvoiceNumber('');
        setCdnPartyName('');
        setCdnAmount('');
        setIsAddCreditNoteOpen(false);
        await loadCdn();
      }
    } catch (err: any) {
      console.error('Save CDN error:', err);
    }
  };

  // Calculations
  const totalSalesVal = invoices.reduce((sum, inv) => sum + parseFloat(String(inv.grand_total || '0')), 0);
  const totalPurchasesVal = purchases.reduce((sum, p) => sum + parseFloat(String(p.grand_total || '0')), 0);
  const totalExpensesVal = expensesList.reduce((sum, e) => sum + parseFloat(String(e.amount || '0')), 0);

  // Cash In-Hand Calculation
  // Cash Sales + Cash Payments-In - Cash Expenses - Cash Purchases - Cash Payments-Out
  const cashSales = invoices
    .filter((inv) => (inv.payment_mode || '').toUpperCase() === 'CASH')
    .reduce((sum, inv) => sum + parseFloat(String(inv.paid_amount || inv.grand_total || '0')), 0);

  const cashPayIns = payments
    .filter((p) => p.type === 'PAYMENT_IN' && (p.payment_type || '').toLowerCase() === 'cash')
    .reduce((sum, p) => sum + parseFloat(String(p.amount || '0')), 0);

  const cashExpenses = expensesList
    .filter((e) => (e.payment_mode || '').toUpperCase() === 'CASH')
    .reduce((sum, e) => sum + parseFloat(String(e.amount || '0')), 0);

  const cashPayOuts = payments
    .filter((p) => p.type === 'PAYMENT_OUT' && (p.payment_type || '').toLowerCase() === 'cash')
    .reduce((sum, p) => sum + parseFloat(String(p.amount || '0')), 0);

  const counterCashSales = dailyReports.reduce((sum, report) => sum + Number(report.sales_cash || 0), 0);
  const counterCashPurchases = dailyReports.reduce((sum, report) => sum + Number(report.purchases_cash || 0), 0);
  const currentCashInHand = Math.max(0, cashSales + cashPayIns + counterCashSales - cashExpenses - cashPayOuts - counterCashPurchases);

  // Categories list matching video
  const defaultCategories = [
    'food',
    'Manufacturing Expense',
    'Petrol',
    'Rent',
    'Salary',
    'Tea',
    'Transport',
  ];

  const categoryTotals = defaultCategories.map((catName) => {
    const matching = expensesList.filter((e) => (e.category || '').toLowerCase() === catName.toLowerCase());
    const total = matching.reduce((sum, e) => sum + parseFloat(String(e.amount || '0')), 0);
    return { name: catName, total, count: matching.length };
  });

  // Company Name
  const companyName = company?.trade_name || company?.name || 'Enter Company Name';

  const renderSubView = () => {
    // =========================================================================
    // SUB-VIEW 1: SALE INVOICE (Matching Video 00:28 - 00:32)
    // =========================================================================
    if (activeSubView === 'sale_invoice') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Sale list</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-slate-600 hover:text-slate-900">
              <Search className="w-5 h-5" />
            </button>
            <button className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold border border-blue-200">
              PDF
            </button>
          </div>
        </div>

        {/* Total Sale Header Bar */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Total Sale</div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-0.5">
            {formatCurrency(totalSalesVal, settings.currency)}
          </div>
        </div>

        {/* Invoices List */}
        <div className="mt-3 space-y-2.5">
          {invoices.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No sales invoices found. Click "+ Add Sale" to create your first bill.
            </div>
          ) : (
            invoices.map((inv) => {
              const bal = parseFloat(String(inv.balance_amount || '0'));
              return (
                <div
                  key={inv.id}
                  onClick={() => onSelectInvoiceForView(inv)}
                  className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:border-blue-400 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{inv.party_name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          inv.payment_status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {inv.payment_status || 'UNPAID'}
                        </span>
                      </div>
                      <div className="text-base font-black font-mono text-slate-900 mt-1">
                        {formatCurrency(inv.grand_total, settings.currency)}
                      </div>
                    </div>

                    <div className="text-right text-xs">
                      <div className="text-slate-500 font-mono text-[11px]">
                        Sale #{inv.invoice_number}
                      </div>
                      <div className="text-slate-400 text-[10px] mt-0.5 font-mono">
                        {formatDate(inv.date, settings.date_format)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-mono">
                      Balance: <strong className="text-slate-800">{formatCurrency(bal, settings.currency)}</strong>
                    </span>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Printer className="w-4 h-4 hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Action Button: Add Sale (Blue Theme) */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={onAddNewSale}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sale</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW: ESTIMATE / QUOTATION
  // =========================================================================
  if (activeSubView === 'quotations') {
    const totalQuoVal = quotations.reduce((sum, q) => sum + parseFloat(String(q.grand_total || '0')), 0);
    const openQuotes = quotations.filter((q) => q.status !== 'CONVERTED');

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Estimate / Quotation</h1>
              <span className="text-[10px] text-slate-500 font-medium">Pro-Forma & Quotes Register</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-200 hover:bg-blue-100"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Total Quotes Summary Card */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex justify-between items-center">
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Quotations ({quotations.length})</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-0.5">
              {formatCurrency(totalQuoVal, settings.currency)}
            </div>
          </div>
          <div className="text-right">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              {openQuotes.length} Open
            </span>
          </div>
        </div>

        {/* Quotations List */}
        <div className="mt-3 space-y-2.5">
          {quotations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-2xs">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-sm text-slate-900">No Quotations Created Yet</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Create quotations for your clients. Easily convert them into a Tax Invoice anytime with one click.
              </p>
              <button
                onClick={onAddNewSale}
                className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create First Quotation</span>
              </button>
            </div>
          ) : (
            quotations.map((quo) => {
              const isConverted = quo.status === 'CONVERTED';
              const isConverting = convertingQuoId === quo.id;

              return (
                <div
                  key={quo.id}
                  className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:border-blue-400 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{quo.party_name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isConverted
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {isConverted ? 'CONVERTED' : 'OPEN ESTIMATE'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {quo.party_phone ? `Phone: ${quo.party_phone} • ` : ''}
                        Date: {quo.date}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        #{quo.quotation_number}
                      </span>
                      <div className="text-base font-black font-mono text-slate-900 mt-1">
                        {formatCurrency(quo.grand_total, settings.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {quo.notes || 'No notes added'}
                    </span>

                    {!isConverted ? (
                      <button
                        onClick={() => handleConvertQuotation(quo.id)}
                        disabled={isConverting}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isConverting ? 'Converting...' : 'Convert to Invoice'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Invoiced (Sale Registered)</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Action Button: + Add Quotation */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={onAddNewSale}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Quotation</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 2: PAYMENT-IN (Matching Video 00:34 - 00:52)
  // =========================================================================
  if (activeSubView === 'payment_in') {
    const payInList = payments.filter((p) => p.type === 'PAYMENT_IN');
    const totalPayIn = payInList.reduce((sum, p) => sum + parseFloat(String(p.amount || '0')), 0);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">All Transactions</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-rose-50 text-rose-600 rounded text-xs font-bold border border-rose-200">
              PDF
            </span>
            <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold border border-emerald-200">
              XLS
            </span>
          </div>
        </div>

        {/* Date Filter & Selector Bar */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>This month</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            01/09/2026 to 30/09/2026
          </div>
        </div>

        {/* Column Header */}
        <div className="mt-3 px-2 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <span>Party Name</span>
          <span>PayIn: {payInList.length}</span>
          <span>Total: {formatCurrency(totalPayIn, settings.currency)}</span>
        </div>

        {/* List of Transactions */}
        <div className="mt-1 space-y-2">
          {payInList.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No Payment-In transactions recorded yet. Click "+ Add Payment-In" below.
            </div>
          ) : (
            payInList.map((pay) => (
              <div
                key={pay.id}
                className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:border-blue-400 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{pay.party_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">{pay.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold font-mono text-sm text-emerald-600">
                      + {formatCurrency(pay.amount, settings.currency)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {pay.payment_type || 'Cash'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Floating Action Button: + Add Payment-In (Blue Theme) */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => {
              setPaymentFormType('PAYMENT_IN');
              setIsAddPaymentModalOpen(true);
            }}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Payment-In</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 3: SALE RETURN / CREDIT NOTE (Video 00:01)
  // =========================================================================
  if (activeSubView === 'sale_return') {
    const saleReturns = creditDebitNotes.filter((n) => n.note_type === 'CREDIT_NOTE');
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Sale Return (Credit Note)</h1>
          </div>
          <button
            onClick={() => {
              setCdnType('CREDIT_NOTE');
              setIsAddCreditNoteOpen(true);
            }}
            className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            + Add Return
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {saleReturns.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No sale return records found. Click "+ Add Return" to record customer return.
            </div>
          ) : (
            saleReturns.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{note.party_name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{note.date} • {note.reason}</div>
                  </div>
                  <div className="font-mono font-bold text-rose-600">
                    - {formatCurrency(note.amount, settings.currency)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const exportPurchaseBill = async (purchase: Purchase, format: 'pdf' | 'json', share: boolean) => {
    const action = `${purchase.id}:${format}:${share ? 'share' : 'download'}`;
    if (purchaseExportBusy) return;
    setPurchaseExportBusy(action);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const base = `Purchase-${String(purchase.supplier_invoice_no || purchase.id).replace(/[\\/:*?"<>|]+/g, '-')}`;
      if (format === 'json') {
        const fileName = `${base}.json`;
        const data = { documentType: 'PURCHASE_BILL', purchase };
        if (share) await shareJson(data, fileName, `Purchase Bill ${purchase.supplier_invoice_no}`, `${purchase.supplier_name} · ${formatCurrency(purchase.grand_total, settings.currency)}`);
        else { downloadJson(data, fileName); showToast('Purchase bill JSON download started.'); }
        return;
      }
      const rows: [string, string][] = [
        ['Invoice Number', String(purchase.supplier_invoice_no || '-')],
        ['Supplier', String(purchase.supplier_name || '-')],
        ['Supplier GSTIN', String(purchase.supplier_gstin || '-')],
        ['Date', String(purchase.date || '-')],
        ['Taxable Amount', formatCurrency(purchase.sub_total, settings.currency)],
        ['CGST', formatCurrency(purchase.cgst_total, settings.currency)],
        ['SGST', formatCurrency(purchase.sgst_total, settings.currency)],
        ['IGST', formatCurrency(purchase.igst_total, settings.currency)],
        ...((Array.isArray(purchase.items) ? purchase.items : []).map((item, index) => [
          `Item ${index + 1}`,
          `${item.name || 'Item'} · Qty ${item.qty || 0} · ${formatCurrency(item.total || item.taxable || 0, settings.currency)}`,
        ] as [string, string])),
        ['Grand Total', formatCurrency(purchase.grand_total, settings.currency)],
      ];
      const fileName = `${base}.pdf`;
      const blob = await buildDetailsPdfBlob('Purchase Bill', rows);
      if (share) await sharePdf({ blob, fileName, title: `Purchase Bill ${purchase.supplier_invoice_no}`, text: `Purchase bill from ${purchase.supplier_name}.` });
      else { downloadPdf(blob, fileName); showToast('Purchase bill PDF download started.'); }
    } catch (error) {
      console.error('Purchase bill export failed:', error);
      showToast('Purchase bill export failed. Please try again.');
    } finally {
      setPurchaseExportBusy(null);
    }
  };

  // =========================================================================
  // SUB-VIEW 4: PURCHASE BILLS (Matching Video 00:56 - 00:59)
  // =========================================================================
  if (activeSubView === 'purchase_bills') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Purchase List</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-slate-600 hover:text-slate-900">
              <Search className="w-5 h-5" />
            </button>
            <span className="px-2 py-1 bg-rose-50 text-rose-600 rounded text-xs font-bold border border-rose-200">
              PDF
            </span>
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Total Purchase</div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-0.5">
            {formatCurrency(totalPurchasesVal, settings.currency)}
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          {purchases.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-2xs">
              <div className="w-20 h-20 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500">
                <ShoppingBag className="w-10 h-10" />
              </div>
              <h3 className="font-bold text-base text-slate-900">No Data Available</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                No purchase details are available. Please try again after making a purchase.
              </p>
            </div>
          ) : (
            purchases.map((pur) => (
              <div
                key={pur.id}
                className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:border-blue-400 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{pur.supplier_name}</div>
                    <div className="text-base font-black font-mono text-slate-900 mt-0.5">
                      {formatCurrency(pur.grand_total, settings.currency)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-500 font-mono text-[11px]">#{pur.supplier_invoice_no}</div>
                    <div className="text-slate-400 text-[10px] font-mono mt-0.5">{pur.date}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  {(['pdf', 'json'] as const).flatMap((format) => (['download', 'share'] as const).map((action) => {
                    const key = `${pur.id}:${format}:${action}`;
                    const label = `${action === 'download' ? 'Download' : 'Share'} ${format.toUpperCase()}`;
                    return <button key={key} type="button" disabled={!!purchaseExportBusy} onClick={() => void exportPurchaseBill(pur, format, action === 'share')} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50" title={`${label} purchase bill`}>
                      {purchaseExportBusy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action === 'share' ? <Share2 className="h-3.5 w-3.5" /> : format === 'json' ? <FileJson className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      {purchaseExportBusy === key ? 'Preparing…' : label}
                    </button>;
                  }))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={onOpenManualPurchase}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Purchase</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 5: PAYMENT - OUT (Matching Video 01:00 - 01:17)
  // =========================================================================
  if (activeSubView === 'payment_out') {
    const payOutList = payments.filter((p) => p.type === 'PAYMENT_OUT');
    const totalPayOut = payOutList.reduce((sum, p) => sum + parseFloat(String(p.amount || '0')), 0);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">All Transactions</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold border border-blue-200">
              PDF
            </span>
            <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold border border-emerald-200">
              XLS
            </span>
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>This month</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            01/09/2026 to 30/09/2026
          </div>
        </div>

        <div className="mt-3 px-2 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <span>Party Name</span>
          <span>PayOut: {payOutList.length}</span>
          <span>Total: {formatCurrency(totalPayOut, settings.currency)}</span>
        </div>

        <div className="mt-1 space-y-2">
          {payOutList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-2xs">
              <div className="w-20 h-20 mx-auto rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <CreditCard className="w-10 h-10" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Add your 1st Payment Out</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Record payment given to your parties & easily link them to purchase bills.
              </p>
            </div>
          ) : (
            payOutList.map((pay) => (
              <div
                key={pay.id}
                className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:border-blue-400 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{pay.party_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">{pay.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold font-mono text-sm text-slate-800">
                      - {formatCurrency(pay.amount, settings.currency)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {pay.payment_type || 'Cash'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => {
              setPaymentFormType('PAYMENT_OUT');
              setIsAddPaymentModalOpen(true);
            }}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Payment-Out</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 6: PURCHASE RETURN / DEBIT NOTE (Video 01:20 - 01:22)
  // =========================================================================
  if (activeSubView === 'purchase_return') {
    const purchaseReturns = creditDebitNotes.filter((n) => n.note_type === 'DEBIT_NOTE');
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Purchase Return</h1>
          </div>
          <button
            onClick={() => {
              setCdnType('DEBIT_NOTE');
              setIsAddCreditNoteOpen(true);
            }}
            className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            + Add Return
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {purchaseReturns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-2xs">
              <div className="w-20 h-20 mx-auto rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                <FileDiff className="w-10 h-10" />
              </div>
              <h3 className="font-bold text-base text-slate-900">No Data Available</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                No data is available for this report. Please try again after making relevant changes.
              </p>
            </div>
          ) : (
            purchaseReturns.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{note.party_name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{note.date} • {note.reason}</div>
                  </div>
                  <div className="font-mono font-bold text-emerald-600">
                    + {formatCurrency(note.amount, settings.currency)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 7: EXPENSES SCREEN (Matching Video 00:08 - 00:09, Blue Theme)
  // =========================================================================
  if (activeSubView === 'expenses') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Expense</h1>
          </div>
          <button className="p-1.5 text-slate-600 hover:text-slate-900">
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* Two Tabs: Categories & Items */}
        <div className="flex bg-white border-b border-slate-200 -mx-4 px-4">
          <button
            onClick={() => setExpenseTab('categories')}
            className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
              expenseTab === 'categories'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setExpenseTab('items')}
            className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
              expenseTab === 'items'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Items
          </button>
        </div>

        {/* Total Summary Row */}
        <div className="flex justify-end py-2.5 px-1 text-xs">
          <span className="text-slate-500 mr-2 font-medium">Total:</span>
          <span className="font-bold font-mono text-blue-600">
            {formatCurrency(totalExpensesVal, settings.currency)}
          </span>
        </div>

        {/* Categories Tab View */}
        {expenseTab === 'categories' ? (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden">
            {categoryTotals.map((cat, idx) => (
              <div
                key={idx}
                className="py-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <span className="text-xs font-semibold text-slate-800">{cat.name}</span>
                <span className="text-xs font-mono font-bold text-slate-800">
                  {formatCurrency(cat.total, settings.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {expensesList.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs shadow-2xs">
                No itemized expenses recorded yet. Click "+ Add Expenses" below to create one.
              </div>
            ) : (
              expensesList.map((exp) => (
                <div key={exp.id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{exp.title || exp.category}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {exp.date} • {exp.category} • {exp.payment_mode || 'Cash'}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-sm text-slate-900">
                      {formatCurrency(exp.amount, settings.currency)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Floating Action Button: + Add Expenses (Blue Theme) */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setIsAddExpenseFormOpen(true)}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expenses</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 8: CASH IN-HAND (Matching Video 00:13 - 00:20)
  // =========================================================================
  if (activeSubView === 'cash_in_hand') {
    // List transactions involving Cash
    const cashTransactions = [
      ...payments
        .filter((p) => (p.payment_type || '').toLowerCase() === 'cash')
        .map((p) => ({
          id: p.id,
          title: p.type === 'PAYMENT_IN' ? `Payment-in - ${p.party_name}` : `Payment-out - ${p.party_name}`,
          date: p.date,
          amount: parseFloat(p.amount || '0'),
          isCredit: p.type === 'PAYMENT_IN',
        })),
      ...dailyReports.flatMap((report) => [
        ...(Number(report.sales_cash || 0) > 0 ? [{ id: `${report.id}-counter-sale`, title: 'Estimated Counter Sale', date: report.date, amount: Number(report.sales_cash), isCredit: true }] : []),
        ...(Number(report.purchases_cash || 0) > 0 ? [{ id: `${report.id}-counter-purchase`, title: 'Estimated Counter Purchase', date: report.date, amount: Number(report.purchases_cash), isCredit: false }] : []),
      ]),
      ...expensesList
        .filter((e) => (e.payment_mode || '').toUpperCase() === 'CASH')
        .map((e) => ({
          id: e.id,
          title: `Cash Expense (${e.category || 'General'})`,
          date: e.date,
          amount: parseFloat(e.amount || '0'),
          isCredit: false,
        })),
    ];

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Cash In-Hand</h1>
          </div>
          <button onClick={onOpenSettings} className="p-1.5 text-slate-600 hover:text-slate-900">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Green/Mint Current Cash Balance Card (Exact Video 00:13) */}
        <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-emerald-800">Current Cash Balance</div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-700">
              {formatCurrency(currentCashInHand, settings.currency)}
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Transaction Details Table Header */}
        <div className="mt-4 px-2 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
          <span>Transaction Details</span>
          <span>Amount</span>
        </div>

        {/* Transaction Rows */}
        <div className="mt-2 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden">
          {cashTransactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No cash transactions logged yet. Payments and cash expenses will appear here.
            </div>
          ) : (
            cashTransactions.map((tx) => (
              <div key={tx.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <div className="font-bold text-xs text-slate-900">{tx.title}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{tx.date}</div>
                </div>
                <div className={`font-mono font-bold text-xs ${tx.isCredit ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {tx.isCredit ? '+ ' : '- '}
                  {formatCurrency(tx.amount, settings.currency)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Actions: Bank Transfer & Adjust Cash */}
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 z-30 max-w-md mx-auto flex gap-3">
          <button
            onClick={() => alert('Bank Transfer feature logged to accounts ledger.')}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-xs text-slate-700 transition-colors"
          >
            Bank Transfer
          </button>
          <button
            onClick={() => {
              setPaymentFormType('PAYMENT_IN');
              setIsAddPaymentModalOpen(true);
            }}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white shadow-xs transition-colors"
          >
            Adjust Cash
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW 9: REPORTS SUITE (Compliance & Core Financials)
  // =========================================================================
  if (activeSubView === 'reports') {
    return (
      <ReportsHub
        onBack={() => setActiveSubView(null)}
        invoices={invoices}
        purchases={purchases}
        parties={parties}
        settings={settings}
        company={company}
        userMobile={currentUser?.mobile || ''}
      />
    );
  }

  // =========================================================================
  // SUB-VIEW: DAILY REPORTS (date-wise history of saved daily reports)
  // =========================================================================
  if (activeSubView === 'daily_reports') {
    const parseDmy = (d: string) => {
      const [dd, mm, yyyy] = (d || '').split('/').map(Number);
      return new Date(yyyy || 0, (mm || 1) - 1, dd || 1).getTime();
    };
    const sortedReports = [...dailyReports].sort((a, b) => parseDmy(b.date) - parseDmy(a.date));

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center gap-3 py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <button
            onClick={() => setActiveSubView(null)}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-lg font-bold text-slate-900">Daily Reports</h1>
        </div>

        <div className="mt-4 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden">
          {sortedReports.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No daily reports saved yet.</div>
          ) : (
            sortedReports.map((r) => {
              const isOpen = openDailyDate === r.date;
              const dayExpenses = expensesList.filter((e) => e.date === r.date);
              return (
                <div key={r.id}>
                  <button
                    onClick={() => setOpenDailyDate(isOpen ? null : r.date)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-sm text-slate-900">{r.date}</span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 bg-slate-50/60 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">B2C Unbilled Sales</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(parseFloat(r.b2c_unbilled_sales || '0'), settings.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Counter Sales (Cash / Online)</span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrency(Number(r.sales_cash || 0), settings.currency)} / {formatCurrency(Number(r.sales_online || 0), settings.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Counter Purchases (Cash / Online)</span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrency(Number(r.purchases_cash || 0), settings.currency)} / {formatCurrency(Number(r.purchases_online || 0), settings.currency)}</span>
                      </div>
                      {Array.isArray(r.counter_sales) && r.counter_sales.length > 0 && (
                        <div className="pt-2 border-t border-slate-200">
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Sales by GST Rate</div>
                          {r.counter_sales.map((entry: any, index: number) => <div key={`sale-${index}`} className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">{Number(entry.gst_rate || 0)}% GST</span><span className="font-mono text-slate-800">{formatCurrency(Number(entry.amount || 0), settings.currency)}</span></div>)}
                        </div>
                      )}
                      {Array.isArray(r.counter_purchases) && r.counter_purchases.length > 0 && (
                        <div className="pt-2 border-t border-slate-200">
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Purchases by GST Rate</div>
                          {r.counter_purchases.map((entry: any, index: number) => <div key={`purchase-${index}`} className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">{Number(entry.gst_rate || 0)}% GST</span><span className="font-mono text-slate-800">{formatCurrency(Number(entry.amount || 0), settings.currency)}</span></div>)}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Cash in Hand</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(parseFloat(r.cash_in_hand || '0'), settings.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Expenses</span>
                        <span className="font-mono font-bold text-rose-600">
                          {formatCurrency(parseFloat(r.personal_expenses || '0'), settings.currency)}
                        </span>
                      </div>

                      {dayExpenses.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 space-y-1.5">
                          {dayExpenses.map((e) => (
                            <div key={e.id} className="flex items-center justify-between">
                              <span className="text-slate-700">{e.title || e.category}</span>
                              <span className="font-mono text-slate-700">
                                {formatCurrency(parseFloat(e.amount || e.total_amount || '0'), settings.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {r.notes && (
                        <div className="pt-2 border-t border-slate-200 text-slate-500">{r.notes}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // E-Way Bill now opens the dedicated full E-Way Bill module from App.
  if (activeSubView === 'ewb') {
    if (onOpenEWayBill) {
      onOpenEWayBill();
      return null;
    }
    setActiveSubView(null);
  }

  // Subview for GSTR-2B
  if (activeSubView === 'gstr2b') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">GSTR-2B Reconciler</h1>
          </div>
        </div>
        <div className="mt-4">
          <Gstr2bReconciler
            onClose={() => setActiveSubView(null)}
            userMobile={currentUser?.mobile || ''}
            existingPurchases={purchases}
            onRefreshData={onRefreshData}
          />
        </div>
      </div>
    );
  }

  // Subview for ITC
  if (activeSubView === 'itc') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSubView(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">ITC Dashboard</h1>
          </div>
        </div>
        <div className="mt-4">
          <ItcDashboard
            purchases={purchases}
            invoices={invoices}
            userMobile={currentUser?.mobile || ''}
            onClose={() => setActiveSubView(null)}
          />
        </div>
      </div>
    );
  }

  return null;
  };

  const subViewContent = renderSubView();

  // =========================================================================
  // MAIN MENU ROOT VIEW (Matching Video 00:00 - 00:07 & 01:23 - 01:28)
  // =========================================================================
  return (
    <div className="font-sans">
      {subViewContent ? (
        subViewContent
      ) : (
        <div className="bg-slate-100/70 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-3 sm:p-4 pb-28 space-y-3 font-sans">
          {/* 1. Header Profile Container (Matching Video 00:00) */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex items-center justify-between">
        <div
          onClick={onOpenProfile}
          className="flex items-center gap-3 cursor-pointer group min-w-0"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-extrabold text-sm shrink-0">
            {company?.trade_name ? company.trade_name.substring(0, 2).toUpperCase() : <Building2 className="w-5 h-5" />}
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors truncate">
              {companyName}
            </span>
            <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
          </div>
        </div>

        {/* Top Right Tool Icons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => alert('Business UPI QR code ready.')}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="QR Code"
          >
            <QrCode className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenNotifications}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. SECTION: My Business (Strictly Blue-Circled Items From Video 01:23 - 01:28) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
        <div className="px-4 py-2.5 bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          My Business
        </div>

        {/* Option 1: Sale (Sales Ledger Lines - Collapsible, Closed by Default) */}
        <div>
          <button
            onClick={() => setIsSaleOpen(!isSaleOpen)}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 text-blue-600 flex items-center justify-center font-bold">
                ₹
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 block">Sales Ledger Lines</span>
              </div>
            </div>
            {isSaleOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isSaleOpen && (
            <div className="bg-slate-50/60 pl-11 pr-4 divide-y divide-slate-100/80 animate-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => setActiveSubView('sale_invoice')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Sale Invoice</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveSubView('quotations')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span>Estimate / Quotation</span>
                  <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.2 rounded border border-amber-200">
                    Estimate
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveSubView('payment_in')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Payment-In</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveSubView('sale_return')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Sale Return (Credit Note)</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}
        </div>

        {/* Option 2: Purchase (Purchase Tracking Registers - Collapsible, Closed by Default) */}
        <div>
          <button
            onClick={() => setIsPurchaseOpen(!isPurchaseOpen)}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
              <div>
                <span className="font-bold text-sm text-slate-900 block">Purchase Register</span>
              </div>
            </div>
            {isPurchaseOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isPurchaseOpen && (
            <div className="bg-slate-50/60 pl-11 pr-4 divide-y divide-slate-100/80 animate-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => setActiveSubView('purchase_bills')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Purchase Bills</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveSubView('payment_out')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Payment - Out</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveSubView('purchase_return')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Purchase Return (Debit Note)</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}
        </div>

        {/* Option 3: Accounting Balances Tables (Strictly Collapsed & Closed by Default) */}
        <div>
          <button
            onClick={() => setIsAccountingOpen(!isAccountingOpen)}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Scale className="w-5 h-5 text-blue-600" />
              <div>
                <span className="font-bold text-sm text-slate-900 block">Accounting Balances</span>
              </div>
            </div>
            {isAccountingOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isAccountingOpen && (
            <div className="bg-slate-50/60 pl-11 pr-4 divide-y divide-slate-100/80 animate-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => setActiveSubView('cash_in_hand')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Cash In-Hand Ledger</span>
                <span className="font-mono text-xs font-bold text-blue-600">
                  {formatCurrency(currentCashInHand, settings.currency)}
                </span>
              </button>

              <button
                onClick={() => setActiveSubView('expenses')}
                className="w-full py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <span>Expenses Record</span>
                <span className="font-mono text-xs font-bold text-blue-600">
                  {formatCurrency(totalExpensesVal, settings.currency)}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reports */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 hover:border-blue-400 transition-all">
        <button
          onClick={() => setActiveSubView('reports')}
          className="w-full flex items-center justify-between text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
              Reports
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
        </button>
      </div>

      {/* e-Way Bill Management */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 hover:border-blue-400 transition-all">
        <button
          onClick={() => { if (onOpenEWayBill) onOpenEWayBill(); else setActiveSubView('ewb'); }}
          className="w-full flex items-center justify-between text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Truck className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
              e-Way Bill Management
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
        </button>
      </div>

      {/* GSTR-2B Auto Reader */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 hover:border-blue-400 transition-all">
        <button
          onClick={() => setActiveSubView('gstr2b')}
          className="w-full flex items-center justify-between text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
              GSTR-2B Auto Reader
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
        </button>
      </div>

      {/* 3TR ITC */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 hover:border-blue-400 transition-all">
        <button
          onClick={() => setActiveSubView('itc')}
          className="w-full flex items-center justify-between text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Scale className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
              3TR ITC
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
        </button>
      </div>

      {/* Daily Reports */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 hover:border-blue-400 transition-all">
        <button
          onClick={() => setActiveSubView('daily_reports')}
          className="w-full flex items-center justify-between text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
              Daily Reports
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
        </button>
      </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* PRODUCTION ACCOUNT SETTLEMENT MODULE (Payment In / Payment Out Matrix)     */}
      {/* ========================================================================= */}
      <PaymentSettlementModal
        isOpen={isAddPaymentModalOpen}
        initialDirection={paymentFormType}
        currentUser={currentUser}
        settings={settings}
        onClose={() => setIsAddPaymentModalOpen(false)}
        onSettlementSaved={async () => {
          await loadPayments();
          if (onRefreshData) onRefreshData();
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL: ADD EXPENSE (Strict Blue Theme & Pure English) */}
      {/* ========================================================================= */}
      {isAddExpenseFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Record New Expense</h3>
              <button
                onClick={() => setIsAddExpenseFormOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Expense Category</label>
                <select
                  value={newExpCategory}
                  onChange={(e) => setNewExpCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  {defaultCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Expense Description / Item</label>
                <input
                  type="text"
                  value={newExpTitle}
                  onChange={(e) => setNewExpTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Amount (₹) *</label>
                  <IndianAmountInput
                    step="any"
                    min="0.01"
                    required
                    value={newExpAmount}
                    onValueChange={setNewExpAmount}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Date</label>
                  <input
                    type="text"
                    value={newExpDate}
                    onChange={(e) => setNewExpDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'Cheque', 'Bank'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewExpPayType(type)}
                      className={`py-2 rounded-xl font-bold text-xs border transition-colors cursor-pointer ${
                        newExpPayType === type
                          ? 'border-blue-600 bg-blue-50 text-blue-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={newExpNote}
                  onChange={(e) => setNewExpNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingExpense ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD CREDIT / DEBIT NOTE */}
      {/* ========================================================================= */}
      {isAddCreditNoteOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {cdnType === 'CREDIT_NOTE' ? 'Add Sale Return (Credit Note)' : 'Add Purchase Return (Debit Note)'}
              </h3>
              <button
                onClick={() => setIsAddCreditNoteOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCdn} className="space-y-3 text-xs">
              {/* Prominent searchable input field text box control explicitly labeled "Enter Reference Sales Invoice Number" */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Enter Reference Sales Invoice Number
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="sales-invoices-list"
                    value={cdnRefInvoiceNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCdnRefInvoiceNumber(val);
                      const matched = invoices.find(
                        (inv) => inv.invoice_number.toLowerCase() === val.trim().toLowerCase()
                      );
                      if (matched) {
                        if (matched.party_name) setCdnPartyName(matched.party_name);
                        if (matched.grand_total) setCdnAmount(String(matched.grand_total));
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <datalist id="sales-invoices-list">
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.invoice_number}>
                        {inv.party_name} • ₹{inv.grand_total} • {inv.date}
                      </option>
                    ))}
                  </datalist>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Linking an invoice auto-fills party details and original invoice totals.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Party Name *</label>
                <input
                  type="text"
                  required
                  value={cdnPartyName}
                  onChange={(e) => setCdnPartyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Amount (₹) *</label>
                <IndianAmountInput
                  step="any"
                  min="0.01"
                  required
                  value={cdnAmount}
                  onValueChange={setCdnAmount}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Reason for Return</label>
                <select
                  value={cdnReason}
                  onChange={(e) => setCdnReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-800"
                >
                  <option value="Goods Damaged / Returned">Goods Damaged / Returned</option>
                  <option value="Deficiency in Services">Deficiency in Services</option>
                  <option value="Correction in Invoice Value">Correction in Invoice Value</option>
                  <option value="Order Cancelled">Order Cancelled</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCreditNoteOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/30"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
