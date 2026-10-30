import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Search,
  Calendar,
  Filter,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Scale,
  BookOpen,
  ShieldAlert,
  Layers,
  History,
  CheckCircle2,
  Plus,
  Building2,
  FileText,
  User,
  ShoppingBag,
  CreditCard,
  Download,
  Share2,
  Loader2,
  Upload,
} from 'lucide-react';
import { Invoice, Purchase, Party, AppSettings, CompanyProfile } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { runReportExport, REPORT_TITLES, REPORT_ROOT_ID, downloadJson, shareJson, showToast } from '../utils/pdfShare';

interface ReportsHubProps {
  onBack: () => void;
  invoices: Invoice[];
  purchases: Purchase[];
  parties: Party[];
  settings: AppSettings;
  company?: CompanyProfile | null;
  userMobile?: string;
  onReportChange?: (reportId: string | null) => void;
}

const ReportsHubInner: React.FC<ReportsHubProps> = ({
  onBack,
  invoices,
  purchases,
  parties,
  settings,
  company,
  userMobile = '',
  onReportChange,
}) => {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  useEffect(() => {
    onReportChange?.(selectedReport);
  }, [selectedReport]);
  const [dateFilter, setDateFilter] = useState<'this_month' | 'today' | 'all'>('this_month');
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [brsRows, setBrsRows] = useState<any[]>([]);
  const [brsBusy, setBrsBusy] = useState(false);
  const [brsMessage, setBrsMessage] = useState('');
  const brsFileRef = React.useRef<HTMLInputElement>(null);
  const [brsManual, setBrsManual] = useState({ statement_date: new Date().toLocaleDateString('en-GB'), description: '', ref_cheque_no: '', debit_withdrawal: '', credit_deposit: '', balance: '' });
  const [taxLedgerBalances, setTaxLedgerBalances] = useState({ electronic_cash_balance: 0, electronic_credit_balance: 0 });
  const [taxLedgerDraft, setTaxLedgerDraft] = useState({ electronic_cash_balance: '0', electronic_credit_balance: '0' });
  const [taxLedgerSummary, setTaxLedgerSummary] = useState<any>(null);
  const [taxLedgerEditing, setTaxLedgerEditing] = useState(false);
  const [taxLedgerBusy, setTaxLedgerBusy] = useState(false);
  const [taxLedgerLoading, setTaxLedgerLoading] = useState(false);
  const [taxLedgerLoaded, setTaxLedgerLoaded] = useState(false);
  const [taxLedgerMessage, setTaxLedgerMessage] = useState('');

  // Dynamic state for real Journal Entries and Expenses
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [actualExpenses, setActualExpenses] = useState<any[]>([]);

  React.useEffect(() => {
    if (!userMobile) return;
    apiFetch('/api/accounting/brs/records').then(r => r.ok ? r.json() : []).then(d => setBrsRows(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userMobile]);

  React.useEffect(() => {
    if (selectedReport !== 'tax_ledger' || !userMobile) return;
    let cancelled = false;
    setTaxLedgerLoading(true);
    setTaxLedgerLoaded(false);
    setTaxLedgerMessage('');
    const headers: Record<string, string> = { 'x-user-mobile': userMobile };
    Promise.all([
      apiFetch('/api/accounting/tax-ledger-balances', { headers }).then(async (r) => { if (!r.ok) throw new Error('Unable to load tax ledger balances.'); return r.json(); }),
      apiFetch('/api/compliance/itc-summary', { headers }).then(async (r) => { if (!r.ok) throw new Error('Unable to load tax summary.'); return r.json(); }),
    ]).then(([balances, summary]) => {
      if (cancelled) return;
      const next = { electronic_cash_balance: Number(balances.electronic_cash_balance || 0), electronic_credit_balance: Number(balances.electronic_credit_balance || 0) };
      setTaxLedgerBalances(next);
      setTaxLedgerDraft({ electronic_cash_balance: String(next.electronic_cash_balance), electronic_credit_balance: String(next.electronic_credit_balance) });
      setTaxLedgerSummary(summary);
      setTaxLedgerLoaded(true);
    }).catch((error) => { if (!cancelled) setTaxLedgerMessage(error.message || 'Unable to load tax ledger data.'); }).finally(() => { if (!cancelled) setTaxLedgerLoading(false); });
    return () => { cancelled = true; };
  }, [selectedReport, userMobile]);

  const saveTaxLedgerBalances = async () => {
    const cash = Number(taxLedgerDraft.electronic_cash_balance);
    const credit = Number(taxLedgerDraft.electronic_credit_balance);
    if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(credit) || credit < 0) { setTaxLedgerMessage('Enter valid non-negative opening balances.'); return; }
    setTaxLedgerBusy(true); setTaxLedgerMessage('');
    try {
      const res = await apiFetch('/api/accounting/tax-ledger-balances', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(userMobile ? { 'x-user-mobile': userMobile } : {}) }, body: JSON.stringify({ electronic_cash_balance: cash, electronic_credit_balance: credit }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Unable to save opening balances.');
      const next = { electronic_cash_balance: Number(data.electronic_cash_balance || 0), electronic_credit_balance: Number(data.electronic_credit_balance || 0) };
      setTaxLedgerBalances(next); setTaxLedgerDraft({ electronic_cash_balance: String(next.electronic_cash_balance), electronic_credit_balance: String(next.electronic_credit_balance) }); setTaxLedgerLoaded(true); setTaxLedgerEditing(false); setTaxLedgerMessage('Opening balances saved.');
    } catch (error: any) { setTaxLedgerMessage(error.message || 'Unable to save opening balances.'); } finally { setTaxLedgerBusy(false); }
  };

  React.useEffect(() => {
    const headers: Record<string, string> = userMobile ? { 'x-user-mobile': userMobile } : {};
    apiFetch('/api/expenses', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.expenses)) {
          setActualExpenses(data.expenses);
        }
      })
      .catch(() => {});

    apiFetch('/api/compliance/journal-entries')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setJournalEntries(data);
        }
      })
      .catch(() => {});
  }, [userMobile]);

  const [isAddJournalOpen, setIsAddJournalOpen] = useState(false);
  const [newJvDebit, setNewJvDebit] = useState('');
  const [newJvCredit, setNewJvCredit] = useState('');
  const [newJvAmount, setNewJvAmount] = useState('');
  const [newJvNarration, setNewJvNarration] = useState('');

  // Dynamic expense splits based on real records
  const directExpenses = actualExpenses
    .filter((e) => ['Direct', 'Freight', 'Raw Material', 'Cartage', 'Packaging'].some((k) => (e.category || '').toLowerCase().includes(k.toLowerCase())))
    .reduce((s, e) => s + parseFloat(String(e.amount || '0')), 0);

  const indirectExpenses = actualExpenses
    .filter((e) => !['Direct', 'Freight', 'Raw Material', 'Cartage', 'Packaging'].some((k) => (e.category || '').toLowerCase().includes(k.toLowerCase())))
    .reduce((s, e) => s + parseFloat(String(e.amount || '0')), 0);

  const totalActualExpenses = directExpenses + indirectExpenses;
  const dynamicCapital = company?.opening_capital ? parseFloat(String(company.opening_capital)) : 0.00;

  // BRS local reconciliation toggles
  const [brsReconciledIds, setBrsReconciledIds] = useState<Record<string, boolean>>({});

  // Calculations
  const totalSalesVal = invoices.reduce((s, i) => s + parseFloat(String(i.grand_total || '0')), 0);
  const totalPurchasesVal = purchases.reduce((s, p) => s + parseFloat(String(p.grand_total || '0')), 0);
  const totalBalanceDue = invoices.reduce((s, i) => s + parseFloat(String(i.balance_amount || '0')), 0);
  const purchaseBalanceDue = purchases.reduce((s, p) => s + Math.max(0, parseFloat(String(p.grand_total || '0')) - parseFloat(String((p as any).paid_amount || '0'))), 0);

  // -------------------------------------------------------------
  // REPORT 1: Sale Report (Video 00:04)
  // -------------------------------------------------------------
  if (selectedReport === 'sale_report') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedReport(null)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Sale Report</h1>
          </div>
          <div className="flex items-center gap-2">
            
            
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
            <Calendar className="w-4 h-4" />
            <span>This Month</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">01/09/2026 TO 30/09/2026</span>
        </div>

        {/* Summary Metrics (Exact video 00:04) */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">No of Txns</div>
            <div className="text-base sm:text-lg font-bold font-mono text-slate-900 mt-0.5">
              {invoices.length}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Total Sale</div>
            <div className="text-base sm:text-lg font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(totalSalesVal, settings.currency)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Balance Due</div>
            <div className="text-base sm:text-lg font-bold font-mono text-emerald-600 mt-0.5">
              {formatCurrency(totalBalanceDue, settings.currency)}
            </div>
          </div>
        </div>

        {/* Invoices List */}
        <div className="mt-3 space-y-2">
          {invoices.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              No sales recorded for this period.
            </div>
          ) : (
            invoices.map((inv) => (
              <div key={inv.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{inv.party_name}</div>
                    <div className="text-xs font-mono font-bold text-slate-800 mt-1">
                      {formatCurrency(inv.grand_total, settings.currency)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-500 font-mono text-[11px]">
                      SALE {inv.invoice_number}
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5">{inv.date}</div>
                    <div className="text-slate-600 font-mono text-[11px] mt-1">
                      Balance: {formatCurrency(inv.balance_amount || 0, settings.currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 2: Purchase Report (Video 00:09)
  // -------------------------------------------------------------
  if (selectedReport === 'purchase_report') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedReport(null)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Purchase Report</h1>
          </div>
          <div className="flex items-center gap-2">
            
            
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
            <Calendar className="w-4 h-4" />
            <span>This Month</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">01/09/2026 TO 30/09/2026</span>
        </div>

        {/* 3 Summary Cards */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">No of Txns</div>
            <div className="text-base sm:text-lg font-bold font-mono text-slate-900 mt-0.5">
              {purchases.length}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Total Purchase</div>
            <div className="text-base sm:text-lg font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(totalPurchasesVal, settings.currency)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Balance Due</div>
            <div className="text-base sm:text-lg font-bold font-mono text-emerald-600 mt-0.5">
              {formatCurrency(purchaseBalanceDue, settings.currency)}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {purchases.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              No purchases recorded for this period.
            </div>
          ) : (
            purchases.map((pur) => (
              <div key={pur.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{pur.supplier_name}</div>
                    <div className="text-xs font-mono font-bold text-slate-800 mt-1">
                      {formatCurrency(pur.grand_total, settings.currency)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-500 font-mono text-[11px]">
                      PURCHASE #{pur.supplier_invoice_no}
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5">{pur.date}</div>
                    <div className="text-slate-600 font-mono text-[11px] mt-1">
                      Balance: {formatCurrency(pur.grand_total, settings.currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 3: Day Book (Video 00:12)
  // -------------------------------------------------------------
  if (selectedReport === 'day_book') {
    const dayRows = [
      ...invoices.map((inv) => ({
        id: inv.id,
        type: 'Sale',
        title: inv.party_name,
        date: inv.date,
        total: parseFloat(String(inv.grand_total || '0')),
        moneyIn: parseFloat(String(inv.paid_amount || inv.grand_total || '0')),
        moneyOut: 0,
      })),
      ...purchases.map((pur) => ({
        id: pur.id,
        type: 'Purchase',
        title: pur.supplier_name,
        date: pur.date,
        total: parseFloat(String(pur.grand_total || '0')),
        moneyIn: 0,
        moneyOut: parseFloat(String(pur.grand_total || '0')),
      })),
    ];

    const totalMoneyIn = dayRows.reduce((s, r) => s + r.moneyIn, 0);
    const totalMoneyOut = dayRows.reduce((s, r) => s + r.moneyOut, 0);
    const totalCombined = dayRows.reduce((s, r) => s + r.total, 0);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedReport(null)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Day Book</h1>
          </div>
          <div className="flex items-center gap-2">
            
            
          </div>
        </div>

        {/* 3 Metric cards matching Video 00:12 */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Total</div>
            <div className="text-sm sm:text-base font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(totalCombined, settings.currency)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Money In</div>
            <div className="text-sm sm:text-base font-bold font-mono text-emerald-600 mt-0.5">
              {formatCurrency(totalMoneyIn, settings.currency)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">Money Out</div>
            <div className="text-sm sm:text-base font-bold font-mono text-rose-600 mt-0.5">
              {formatCurrency(totalMoneyOut, settings.currency)}
            </div>
          </div>
        </div>

        {/* List of day book items */}
        <div className="mt-3 space-y-2">
          {dayRows.map((r, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
              <div className="flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-slate-900 text-sm block">{r.type}</span>
                  <span className="text-slate-500 text-[11px]">{r.title} • {r.date}</span>
                </div>
                <div className="text-right">
                  {r.moneyIn > 0 && (
                    <div className="font-mono font-bold text-emerald-600">
                      Money In: {formatCurrency(r.moneyIn, settings.currency)}
                    </div>
                  )}
                  {r.moneyOut > 0 && (
                    <div className="font-mono font-bold text-rose-600">
                      Money Out: {formatCurrency(r.moneyOut, settings.currency)}
                    </div>
                  )}
                  <div className="text-slate-400 text-[10px] font-mono mt-0.5">
                    Total: {formatCurrency(r.total, settings.currency)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 4: All Transactions (Video 00:18)
  // -------------------------------------------------------------
  if (selectedReport === 'all_transactions') {
    const txns = [
      ...invoices.map((i) => ({
        party: i.party_name,
        date: i.date,
        type: `Sale: ${i.invoice_number}`,
        amount: parseFloat(String(i.grand_total || '0')),
        balance: parseFloat(String(i.balance_amount || '0')),
      })),
      ...purchases.map((p) => ({
        party: p.supplier_name,
        date: p.date,
        type: 'Purchase',
        amount: parseFloat(String(p.grand_total || '0')),
        balance: parseFloat(String(p.grand_total || '0')),
      })),
    ];

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedReport(null)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">All Transactions</h1>
          </div>
          
        </div>

        <div className="mt-3 space-y-2">
          {txns.map((t, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex justify-between items-center text-xs">
              <div>
                <div className="font-bold text-slate-900 text-sm">{t.party}</div>
                <div className="text-slate-400 text-[10px] mt-0.5">{t.date} • {t.type}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-slate-900">
                  Total: {formatCurrency(t.amount, settings.currency)}
                </div>
                <div className="font-mono text-slate-500 text-[10px]">
                  Balance: {formatCurrency(t.balance, settings.currency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 5: Bill Wise Profit (Requested by User)
  // -------------------------------------------------------------
  if (selectedReport === 'bill_wise_profit') {
    const profitRows = invoices.map((inv) => {
      const saleVal = parseFloat(String(inv.grand_total || '0'));
      // Estimated purchase cost ~ 65% of sale or from items
      const estimatedCost = saleVal * 0.65;
      const grossProfit = saleVal - estimatedCost;
      const margin = saleVal > 0 ? ((grossProfit / saleVal) * 100).toFixed(1) : '0';
      return {
        invoiceNo: inv.invoice_number,
        party: inv.party_name,
        date: inv.date,
        saleVal,
        estimatedCost,
        grossProfit,
        margin,
      };
    });

    const totalProfit = profitRows.reduce((s, r) => s + r.grossProfit, 0);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Bill Wise Profit</h1>
          </div>
          
        </div>

        {/* Total Profit Card */}
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs text-emerald-800 font-semibold">Total Estimated Gross Profit</div>
          <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
            {formatCurrency(totalProfit, settings.currency)}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {profitRows.map((r, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-900 text-sm block">#{r.invoiceNo} - {r.party}</span>
                <span className="text-slate-400 text-[10px]">
                  Sale: {formatCurrency(r.saleVal, settings.currency)} | Cost: {formatCurrency(r.estimatedCost, settings.currency)}
                </span>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-emerald-600 text-sm">
                  +{formatCurrency(r.grossProfit, settings.currency)}
                </div>
                <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded inline-block mt-0.5">
                  {r.margin}% Margin
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 6: Profit & Loss Report (Video 00:23 - 00:25)
  // -------------------------------------------------------------
  if (selectedReport === 'profit_and_loss') {
    const saleVal = totalSalesVal;
    const purVal = totalPurchasesVal;
    const grossProfit = Math.max(0, saleVal - purVal - directExpenses);
    const netProfit = Math.max(0, grossProfit - indirectExpenses);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Profit And Loss Report</h1>
          </div>
          
        </div>

        {/* 2 Top Cards: Gross Profit & Net Profit (Video 00:23) */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium">Gross Profit</div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-600 mt-1">
              ₹ {grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium">Net Profit</div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-600 mt-1">
              ₹ {netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Detailed Breakdown matching Video 00:23 */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden text-xs">
          <div className="p-3 flex justify-between font-bold text-slate-900 bg-slate-50/50">
            <span>Particulars</span>
            <span>Amount</span>
          </div>
          <div className="p-3 flex justify-between text-slate-700">
            <span>Sale (+)</span>
            <span className="font-mono font-bold text-emerald-600">₹ {saleVal.toFixed(2)}</span>
          </div>
          <div className="p-3 flex justify-between text-slate-700">
            <span>Purchase (-)</span>
            <span className="font-mono font-bold text-rose-600">₹ {purVal.toFixed(2)}</span>
          </div>
          <div className="p-3 flex justify-between text-slate-700">
            <span>Direct Expenses (-)</span>
            <span className="font-mono text-rose-600">₹ {directExpenses.toFixed(2)}</span>
          </div>
          <div className="p-3 flex justify-between font-bold text-slate-900 bg-emerald-50/50">
            <span>Gross Profit</span>
            <span className="font-mono text-emerald-700">₹ {grossProfit.toFixed(2)}</span>
          </div>
          <div className="p-3 flex justify-between text-slate-700">
            <span>Indirect Expenses (-)</span>
            <span className="font-mono text-rose-600">₹ {indirectExpenses.toFixed(2)}</span>
          </div>
          <div className="p-3 flex justify-between font-extrabold text-slate-900 bg-emerald-100/60">
            <span>Net Profit</span>
            <span className="font-mono text-emerald-800">₹ {netProfit.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 7: Cashflow (Video 00:31)
  // -------------------------------------------------------------
  if (selectedReport === 'cashflow') {
    const cashLedgerRows = journalEntries.flatMap((row: any) => {
      const lines = typeof row.lines === 'string' ? JSON.parse(row.lines || '[]') : (row.lines || []);
      return lines.filter((line: any) => String(line.account || '').toLowerCase().includes('cash account')).map((line: any) => ({
        id: `${row.id}-${line.account}`,
        date: row.date || '',
        narration: row.narration || row.voucher_ref_no || 'Cash ledger entry',
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      }));
    });
    const cashInTotal = cashLedgerRows.reduce((sum: number, row: any) => sum + row.debit, 0);
    const cashOutTotal = cashLedgerRows.reduce((sum: number, row: any) => sum + row.credit, 0);
    const closingCash = cashInTotal - cashOutTotal;

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Cashflow Report</h1>
          </div>
        </div>

        {/* 4 Cards matching video 00:31 */}
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs">
            <div className="text-[10px] text-slate-500 font-medium">Closing Cash</div>
            <div className="text-xs sm:text-sm font-bold font-mono text-emerald-600 mt-0.5">₹ {closingCash.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs">
            <div className="text-[10px] text-slate-500 font-medium">Opening Cash</div>
            <div className="text-xs sm:text-sm font-bold font-mono text-slate-700 mt-0.5">Not configured</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs">
            <div className="text-[10px] text-slate-500 font-medium">Money In</div>
            <div className="text-xs sm:text-sm font-bold font-mono text-emerald-600 mt-0.5">₹ {cashInTotal.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs">
            <div className="text-[10px] text-slate-500 font-medium">Money Out</div>
            <div className="text-xs sm:text-sm font-bold font-mono text-rose-600 mt-0.5">₹ {cashOutTotal.toFixed(2)}</div>
          </div>
        </div>

        {/* Transactions list from the recorded cash ledger */}
        <div className="mt-4 space-y-2">
          {!cashLedgerRows.length ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No cash ledger entries have been recorded yet.</div> : cashLedgerRows.map((entry: any) => {
            const inflow = entry.debit >= entry.credit;
            const amount = Math.abs(entry.debit - entry.credit);
            return <div key={entry.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex justify-between items-center gap-3 text-xs"><div><span className="font-bold text-slate-900 block">{entry.narration}</span><span className="text-[11px] text-slate-500 font-mono">{entry.date} • Cash Ledger</span></div><div className={`font-mono font-bold whitespace-nowrap ${inflow ? 'text-emerald-700' : 'text-rose-700'}`}>{inflow ? '+' : '−'} {formatCurrency(amount, settings.currency)}</div></div>;
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 8: Balance Sheet (Requested by User)
  // -------------------------------------------------------------
  if (selectedReport === 'balance_sheet') {
    const sundryDebtors = totalBalanceDue;
    const sundryCreditors = purchaseBalanceDue;
    const cashAndBank = journalEntries.reduce((total: number, row: any) => { const lines = typeof row.lines === 'string' ? JSON.parse(row.lines || '[]') : (row.lines || []); return total + lines.filter((line: any) => { const account = String(line.account || '').toLowerCase(); return account.includes('cash account') || account.includes('bank account'); }).reduce((sum: number, line: any) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0); }, 0);
    const capital = dynamicCapital;
    const totalAssets = capital + (cashAndBank > 0 ? cashAndBank : 0) + sundryDebtors;
    const totalLiabilities = capital + sundryCreditors;

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Balance Sheet</h1>
          </div>
          
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Liabilities */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">Liabilities</h3>
            <div className="flex justify-between text-xs text-slate-700">
              <span>Capital Account</span>
              <span className="font-mono font-bold">₹ {capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-700">
              <span>Sundry Creditors (Suppliers)</span>
              <span className="font-mono font-bold">₹ {sundryCreditors.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between text-xs font-extrabold text-slate-900">
              <span>Total Liabilities</span>
              <span className="font-mono">₹ {totalLiabilities.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Assets */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">Assets</h3>
            <div className="flex justify-between text-xs text-slate-700">
              <span>Sundry Debtors (Receivables)</span>
              <span className="font-mono font-bold text-emerald-600">₹ {sundryDebtors.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-700">
              <span>Cash & Bank Balance</span>
              <span className="font-mono font-bold text-emerald-600">
                ₹ {Math.max(0, cashAndBank).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between text-xs font-extrabold text-slate-900">
              <span>Total Assets</span>
              <span className="font-mono">₹ {totalAssets.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 9: Trial Balance (Requested by User)
  // -------------------------------------------------------------
  if (selectedReport === 'trial_balance') {
    const capital = dynamicCapital;
    const cashInHand = Math.max(0, totalSalesVal - totalPurchasesVal - totalActualExpenses);
    const trialRows = [
      { account: 'Sales Revenue Account', debit: 0, credit: totalSalesVal },
      { account: 'Purchase Account', debit: totalPurchasesVal, credit: 0 },
      { account: 'Sundry Debtors (Receivables)', debit: totalBalanceDue, credit: 0 },
      { account: 'Sundry Creditors (Payables)', debit: 0, credit: purchaseBalanceDue },
      { account: 'Cash In Hand (Drawer)', debit: cashInHand, credit: 0 },
      { account: "Owner's Capital Account", debit: 0, credit: capital },
      ...(directExpenses > 0 ? [{ account: 'Direct Material Purchases Account', debit: directExpenses, credit: 0 }] : []),
      ...(indirectExpenses > 0 ? [{ account: 'Indirect Operating Expenses Account', debit: indirectExpenses, credit: 0 }] : []),
    ];
    const totalDebit = trialRows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = trialRows.reduce((s, r) => s + r.credit, 0);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Trial Balance</h1>
          </div>
          
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden text-xs">
          <div className="p-3 bg-slate-50 flex justify-between font-bold text-slate-900">
            <span className="w-1/2">Particulars</span>
            <span className="w-1/4 text-right">Debit (₹)</span>
            <span className="w-1/4 text-right">Credit (₹)</span>
          </div>
          {trialRows.map((r, i) => (
            <div key={i} className="p-3 flex justify-between text-slate-700">
              <span className="w-1/2 font-medium">{r.account}</span>
              <span className="w-1/4 text-right font-mono">{r.debit > 0 ? r.debit.toFixed(2) : '-'}</span>
              <span className="w-1/4 text-right font-mono">{r.credit > 0 ? r.credit.toFixed(2) : '-'}</span>
            </div>
          ))}
          <div className="p-3 bg-blue-50/50 flex justify-between font-extrabold text-slate-900 border-t-2 border-slate-300">
            <span className="w-1/2">Total</span>
            <span className="w-1/4 text-right font-mono text-blue-600">₹ {totalDebit.toFixed(2)}</span>
            <span className="w-1/4 text-right font-mono text-blue-600">₹ {totalCredit.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 10: Party Statement (Video 00:37)
  // -------------------------------------------------------------
  if (selectedReport === 'party_statement') {
    const currentParty = parties.find((p) => p.id === selectedPartyId) || parties[0];
    const partyTxns = invoices.filter((i) => i.party_name === currentParty?.name);

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Party Statement</h1>
          </div>
        </div>

        {/* Party Selector Dropdown matching Video 00:37 */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Select Party
          </label>
          <select
            value={selectedPartyId || (currentParty?.id || '')}
            onChange={(e) => setSelectedPartyId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
          >
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {currentParty && (
          <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex justify-between text-xs">
            <div>
              <div className="text-slate-500">Total Billed</div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                ₹ {partyTxns.reduce((s, i) => s + parseFloat(String(i.grand_total || '0')), 0).toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-500">Closing Balance</div>
              <div className="text-base font-bold font-mono text-emerald-600 mt-0.5">
                ₹ {parseFloat(String(currentParty.current_balance || '0')).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Transactions for Party */}
        <div className="mt-3 space-y-2">
          {partyTxns.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              No transactions found for this party.
            </div>
          ) : (
            partyTxns.map((inv) => (
              <div key={inv.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-slate-900 block">Sale #{inv.invoice_number}</span>
                  <span className="text-[11px] text-slate-400">{inv.date}</span>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-900">₹ {parseFloat(String(inv.grand_total || '0')).toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 font-mono">Balance: ₹ {parseFloat(String(inv.balance_amount || '0')).toFixed(2)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 11: All Parties Report (Video 00:49)
  // -------------------------------------------------------------
  if (selectedReport === 'all_parties_report') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Party Report</h1>
          </div>
          
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden text-xs">
          <div className="p-3 bg-slate-50 flex justify-between font-bold text-slate-500 text-[11px] uppercase tracking-wider">
            <span>Party Name</span>
            <span>Balance</span>
          </div>
          {parties.map((p) => (
            <div key={p.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
              <div>
                <span className="font-bold text-slate-900 block">{p.name}</span>
                <span className="text-[11px] text-slate-400 font-mono">{p.phone || 'No Phone'} • {p.type || 'CUSTOMER'}</span>
              </div>
              <div className="text-right font-mono font-bold text-emerald-600">
                ₹ {parseFloat(String(p.current_balance || '0')).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 12: Sale / Purchase by Party (Video 00:56)
  // -------------------------------------------------------------
  if (selectedReport === 'sale_purchase_by_party') {
    const partyBreakdown = parties.map((p) => {
      const pSales = invoices
        .filter((i) => i.party_name === p.name)
        .reduce((s, i) => s + parseFloat(String(i.grand_total || '0')), 0);
      const pPurchases = purchases
        .filter((pur) => pur.supplier_name === p.name)
        .reduce((s, pur) => s + parseFloat(String(pur.grand_total || '0')), 0);
      return {
        name: p.name,
        sale: pSales,
        purchase: pPurchases,
      };
    });

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Sale/Purchase by Party</h1>
          </div>
        </div>

        {/* 2 Summary Cards (Video 00:56) */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium">Total Sale Amount</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-1">₹ {totalSalesVal.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium">Total Purchase Amount</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-1">₹ {totalPurchasesVal.toFixed(2)}</div>
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden text-xs">
          <div className="p-3 bg-slate-50 flex justify-between font-bold text-slate-700">
            <span className="w-1/3">Party Name</span>
            <span className="w-1/3 text-right">Sale</span>
            <span className="w-1/3 text-right">Purchase</span>
          </div>
          {partyBreakdown.map((b, i) => (
            <div key={i} className="p-3 flex justify-between items-center text-slate-800">
              <span className="w-1/3 font-semibold truncate">{b.name}</span>
              <span className="w-1/3 text-right font-mono text-emerald-600">₹ {b.sale.toFixed(2)}</span>
              <span className="w-1/3 text-right font-mono text-rose-600">₹ {b.purchase.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REPORT 13: GST Report & GST Rate Report (Video 01:44 & 01:49)
  // -------------------------------------------------------------
  if (selectedReport === 'gst_report') {
    const totalGstOut = invoices.reduce(
      (s, i) => s + parseFloat(String(i.cgst_total || 0)) + parseFloat(String(i.sgst_total || 0)) + parseFloat(String(i.igst_total || 0)),
      0
    );
    const totalGstIn = purchases.reduce(
      (s, p) => s + parseFloat(String(p.cgst_total || 0)) + parseFloat(String(p.sgst_total || 0)) + parseFloat(String(p.igst_total || 0)),
      0
    );

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">GST Report</h1>
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden text-xs">
          <div className="p-3 bg-slate-50 flex justify-between font-bold text-slate-700">
            <span>Party Name</span>
            <span>Sale Tax</span>
            <span>Purchase Tax</span>
          </div>
          {invoices.map((inv) => {
            const tax = parseFloat(String(inv.cgst_total || 0)) + parseFloat(String(inv.sgst_total || 0)) + parseFloat(String(inv.igst_total || 0));
            return <div key={`sale-${inv.id}`} className="p-3 flex justify-between items-center gap-2 text-slate-800"><span className="font-semibold">{inv.party_name || 'Customer'} <span className="text-[10px] text-slate-500">(Sale)</span></span><span className="font-mono text-emerald-700">{formatCurrency(tax, settings.currency)}</span><span className="font-mono text-slate-400">—</span></div>;
          })}
          {purchases.map((purchase) => {
            const tax = parseFloat(String(purchase.cgst_total || 0)) + parseFloat(String(purchase.sgst_total || 0)) + parseFloat(String(purchase.igst_total || 0));
            return <div key={`purchase-${purchase.id}`} className="p-3 flex justify-between items-center gap-2 text-slate-800"><span className="font-semibold">{purchase.supplier_name || 'Supplier'} <span className="text-[10px] text-slate-500">(Purchase)</span></span><span className="font-mono text-slate-400">—</span><span className="font-mono text-blue-700">{formatCurrency(tax, settings.currency)}</span></div>;
          })}
          <div className="p-3 bg-blue-50/50 flex justify-between font-bold text-slate-900 border-t border-slate-200">
            <span>Total Tax</span>
            <span className="font-mono text-blue-600">₹ {totalGstOut.toFixed(2)}</span>
            <span className="font-mono text-slate-500">₹ {totalGstIn.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SPECIAL ACCOUNT 1: RCM (Reverse Charge Mechanism Account)
  // -------------------------------------------------------------
  if (selectedReport === 'rcm_account') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">RCM (Reverse Charge) Account</h1>
          </div>
        </div>

        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            Section 9(3) / 9(4) Reverse Charge Mechanism
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Inward supplies from unregistered persons or notified goods/services where the recipient is liable to pay tax directly. Self-invoice generated & ITC credited after cash discharge.
          </p>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700">RCM Inward Register</span>
            <span className="text-[11px] text-blue-600 font-semibold cursor-pointer">+ Self-Invoice</span>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {invoices.filter((inv) => inv.is_reverse_charge).length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">No RCM Records Found</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  No inward supplies under Section 9(3)/9(4) Reverse Charge have been recorded. Real entries added by you will appear here.
                </p>
              </div>
            ) : (
              invoices
                .filter((inv) => inv.is_reverse_charge)
                .map((inv) => (
                  <div key={inv.id} className="py-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-900">{inv.party_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Invoice #{inv.invoice_number} • {inv.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-900">{formatCurrency(inv.grand_total, settings.currency)}</div>
                      <div className="text-[10px] text-amber-700 font-mono">RCM Tax Liability Active</div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SPECIAL ACCOUNT 2: Tax Ledger Account
  // -------------------------------------------------------------
  if (selectedReport === 'tax_ledger') {
    const output = taxLedgerSummary?.outputGST || {};
    const input = taxLedgerSummary?.inputITC || {};
    const net = taxLedgerSummary?.netPayable || {};
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3"><button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700"><ArrowLeft className="w-5 h-5" /></button><h1 className="text-base sm:text-lg font-bold text-slate-900">Tax Ledger Accounts</h1></div>
          <button onClick={() => setTaxLedgerEditing(v => !v)} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">{taxLedgerEditing ? 'Cancel' : 'Add Balance / Update Balance'}</button>
        </div>
        {taxLedgerMessage && <div role="status" className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">{taxLedgerMessage}</div>}
        {taxLedgerLoading && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading tax ledger balances and tax summary…</div>}
        {taxLedgerEditing && <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4"><h2 className="font-bold text-slate-900 mb-3">Opening Balances</h2><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Electronic Cash Ledger (₹)<IndianAmountInput min="0" step="0.01" value={taxLedgerDraft.electronic_cash_balance} onValueChange={value=>setTaxLedgerDraft(v=>({...v,electronic_cash_balance:value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label><label className="text-sm font-medium text-slate-700">Electronic Credit Ledger (ITC) (₹)<IndianAmountInput min="0" step="0.01" value={taxLedgerDraft.electronic_credit_balance} onValueChange={value=>setTaxLedgerDraft(v=>({...v,electronic_credit_balance:value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label></div><button onClick={saveTaxLedgerBalances} disabled={taxLedgerBusy} className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50">{taxLedgerBusy ? 'Saving…' : 'Save Opening Balances'}</button></div>}
        {taxLedgerLoaded && <><div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500 font-medium">Electronic Cash Ledger</div><div className="text-xl font-bold font-mono text-emerald-700 mt-1">{formatCurrency(taxLedgerBalances.electronic_cash_balance)}</div><div className="text-xs text-slate-500 mt-1">User-entered opening balance</div></div><div className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500 font-medium">Electronic Credit Ledger (ITC)</div><div className="text-xl font-bold font-mono text-blue-700 mt-1">{formatCurrency(taxLedgerBalances.electronic_credit_balance)}</div><div className="text-xs text-slate-500 mt-1">User-entered opening balance</div></div></div>
        <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-sm"><h2 className="font-bold text-slate-900 border-b border-slate-100 pb-2">Output vs Input Tax Summary</h2><div className="flex justify-between gap-3 py-1"><span>CGST Output Liability</span><strong className="font-mono text-rose-600">{formatCurrency(output.cgst || 0)}</strong></div><div className="flex justify-between gap-3 py-1"><span>SGST Output Liability</span><strong className="font-mono text-rose-600">{formatCurrency(output.sgst || 0)}</strong></div><div className="flex justify-between gap-3 py-1"><span>IGST Output Liability</span><strong className="font-mono text-rose-600">{formatCurrency(output.igst || 0)}</strong></div><div className="flex justify-between gap-3 py-1"><span>CGST ITC Available</span><strong className="font-mono text-emerald-700">{formatCurrency(input.cgst || 0)}</strong></div><div className="flex justify-between gap-3 py-1"><span>SGST ITC Available</span><strong className="font-mono text-emerald-700">{formatCurrency(input.sgst || 0)}</strong></div><div className="flex justify-between gap-3 py-1"><span>IGST ITC Available</span><strong className="font-mono text-emerald-700">{formatCurrency(input.igst || 0)}</strong></div><div className="pt-2 border-t border-slate-200 flex justify-between gap-3 font-extrabold text-slate-900"><span>Net Tax Payable After Set-Off</span><strong className="font-mono text-emerald-700">{formatCurrency(net.totalYouPay || 0)}</strong></div></div></>}
      </div>
    );
  }

  // -------------------------------------------------------------
  // SPECIAL ACCOUNT 3: BRS (Bank Reconciliation Statement)
  // -------------------------------------------------------------
  if (selectedReport === 'brs_statement') {
    const asBank = brsRows.filter((r:any)=>r.record_source !== 'APP_ENTRY' && r.credit_deposit != null && r.debit_withdrawal != null).reduce((sum,r)=>sum + Number(r.credit_deposit) - Number(r.debit_withdrawal),0);
    const asBook = journalEntries.reduce((sum,row)=>{ const lines=typeof row.lines==='string'?JSON.parse(row.lines||'[]'):(row.lines||[]); const b=lines.find((l:any)=>String(l.account||'').toLowerCase().includes('bank')); return sum + Number(b?.debit||0)-Number(b?.credit||0); },0);
    const difference = asBook - asBank;
    const uploadBank = async (file: File) => {
      setBrsBusy(true); setBrsMessage('Reading bank statement…');
      try { const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file);}); const res=await apiFetch('/api/accounting/brs/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rawPdfBase64:base64})}); const d=await res.json(); if(!res.ok)throw new Error(d.error||'Unable to read bank statement'); setBrsRows(prev=>[...d.records,...prev]); setBrsMessage(`${d.count} bank statement entries imported.`); } catch(e:any){setBrsMessage(e.message||'Bank statement could not be read.')} finally{setBrsBusy(false);}
    };
    const reconcile = async () => { setBrsBusy(true); setBrsMessage('Reconciling book and bank entries…'); try { const res=await apiFetch('/api/accounting/brs/reconcile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bankStatements:brsRows.filter((row:any)=>row.record_source !== 'APP_ENTRY')})}); const d=await res.json(); if(!res.ok)throw new Error(d.error||'Reconciliation failed'); setBrsMessage(`Reconciled: ${d.summary.clearedCount} cleared, ${d.summary.missingInBooksCount} missing in books, ${d.summary.unpresentedChequesCount} unpresented, ${d.summary.unclearedDepositsCount} uncleared.`); } catch(e:any){setBrsMessage(e.message||'Reconciliation failed.')} finally{setBrsBusy(false);} };
    const addManual = async () => { if(!brsManual.description) return setBrsMessage('Description is required.'); setBrsBusy(true); try { const res=await apiFetch('/api/accounting/brs/manual-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(brsManual)}); const d=await res.json(); if(!res.ok)throw new Error(d.error||'Unable to add entry'); setBrsRows(prev=>[d,...prev]); setBrsManual({...brsManual,description:'',ref_cheque_no:'',debit_withdrawal:'',credit_deposit:'',balance:''}); setBrsMessage('Manual bank entry added.'); } catch(e:any){setBrsMessage(e.message||'Unable to add entry')} finally{setBrsBusy(false);} };
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3"><button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer"><ArrowLeft className="w-5 h-5"/></button><h1 className="text-base sm:text-lg font-bold text-slate-900">BRS (Bank Reconciliation)</h1></div>
          <div className="flex gap-2"><input ref={brsFileRef} type="file" accept="application/pdf,.csv,.json" className="hidden" onChange={e=>e.target.files?.[0]&&uploadBank(e.target.files[0])}/><button onClick={()=>brsFileRef.current?.click()} disabled={brsBusy} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold flex gap-1.5 items-center"><Upload className="w-4 h-4"/> Upload Bank Statement</button><button onClick={reconcile} disabled={brsBusy||!brsRows.length} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold flex gap-1.5 items-center"><CheckCircle2 className="w-4 h-4"/> Reconcile</button></div>
        </div>
        {brsMessage && <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800">{brsMessage}</div>}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="bg-white rounded-xl border p-3"><div className="text-[11px] text-slate-500">As per Books</div><div className="font-bold font-mono">₹ {asBook.toLocaleString('en-IN',{maximumFractionDigits:2})}</div></div><div className="bg-white rounded-xl border p-3"><div className="text-[11px] text-slate-500">As per Bank</div><div className="font-bold font-mono text-blue-600">₹ {asBank.toLocaleString('en-IN',{maximumFractionDigits:2})}</div></div><div className="bg-white rounded-xl border p-3"><div className="text-[11px] text-slate-500">Difference</div><div className={`font-bold font-mono ${Math.abs(difference)<0.01?'text-emerald-600':'text-rose-600'}`}>₹ {difference.toLocaleString('en-IN',{maximumFractionDigits:2})}</div></div></div>
        <div className="mt-3 bg-white rounded-xl border p-4"><h3 className="font-bold text-sm mb-3">Add Bank Entry Manually</h3><div className="grid sm:grid-cols-4 gap-2"><input aria-label="Statement date" className="p-2.5 border rounded-lg text-xs" value={brsManual.statement_date} onChange={e=>setBrsManual({...brsManual,statement_date:e.target.value})} placeholder="Date"/><input aria-label="Description" className="p-2.5 border rounded-lg text-xs sm:col-span-2" value={brsManual.description} onChange={e=>setBrsManual({...brsManual,description:e.target.value})} placeholder="Description"/><input aria-label="Cheque or reference number" className="p-2.5 border rounded-lg text-xs" value={brsManual.ref_cheque_no} onChange={e=>setBrsManual({...brsManual,ref_cheque_no:e.target.value})} placeholder="Cheque / Reference No."/><IndianAmountInput aria-label="Debit or withdrawal" min="0" step="0.01" className="p-2.5 border rounded-lg text-xs" value={brsManual.debit_withdrawal} onValueChange={value=>setBrsManual({...brsManual,debit_withdrawal:value})} placeholder="Debit / Withdrawal"/><IndianAmountInput aria-label="Credit or deposit" min="0" step="0.01" className="p-2.5 border rounded-lg text-xs" value={brsManual.credit_deposit} onValueChange={value=>setBrsManual({...brsManual,credit_deposit:value})} placeholder="Credit / Deposit"/><IndianAmountInput aria-label="Closing balance" step="0.01" className="p-2.5 border rounded-lg text-xs" value={brsManual.balance} onValueChange={value=>setBrsManual({...brsManual,balance:value})} placeholder="Statement Balance (Optional)"/><button onClick={addManual} disabled={brsBusy} className="p-2.5 rounded-lg bg-blue-600 text-white text-xs font-bold">Add Entry</button></div></div>
        <div className="mt-3 bg-white rounded-xl border overflow-hidden"><div className="px-4 py-3 border-b font-bold text-sm">Bank Reconciliation Entries ({brsRows.length})</div>{!brsRows.length?<div className="p-8 text-center text-sm text-slate-400">No bank statement data uploaded or entered yet.</div>:<div className="overflow-auto"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Description</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th><th className="p-3 text-right">Balance</th><th className="p-3 text-left">Source</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{brsRows.map(r=><tr key={r.id} className="border-t"><td className="p-3">{r.statement_date}</td><td className="p-3 min-w-[240px]">{r.description}</td><td className="p-3 text-right">{r.debit_withdrawal==null?'—':'₹ '+Number(r.debit_withdrawal).toLocaleString('en-IN')}</td><td className="p-3 text-right">{r.credit_deposit==null?'—':'₹ '+Number(r.credit_deposit).toLocaleString('en-IN')}</td><td className="p-3 text-right">{r.balance==null?'—':'₹ '+Number(r.balance).toLocaleString('en-IN')}</td><td className="p-3">{r.record_source==='APP_ENTRY'?'App Ledger':'Bank Statement'}</td><td className="p-3">{r.reconciliation_status||'UNRECONCILED'}</td></tr>)}</tbody></table></div>}</div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SPECIAL ACCOUNT 4: Audit Log
  // -------------------------------------------------------------
  if (selectedReport === 'audit_log') {
    const auditEvents = [
      ...invoices.map((inv) => ({
        id: `LOG-INV-${inv.id}`,
        time: inv.date || '',
        action: 'CREATE_INVOICE',
        doc: inv.invoice_number,
        user: userMobile || 'Operator',
        details: `Invoice for ₹${parseFloat(String(inv.grand_total || '0')).toFixed(2)} to ${inv.party_name || 'Customer'}`,
      })),
      ...purchases.map((pur) => ({
        id: `LOG-PUR-${pur.id}`,
        time: pur.date || '',
        action: 'RECORD_PURCHASE',
        doc: pur.supplier_invoice_no || pur.id,
        user: userMobile || 'Operator',
        details: `Purchase bill of ₹${parseFloat(String(pur.grand_total || '0')).toFixed(2)} from ${pur.supplier_name || 'Supplier'}`,
      })),
      ...actualExpenses.map((exp) => ({
        id: `LOG-EXP-${exp.id}`,
        time: exp.date || '',
        action: 'POST_EXPENSE',
        doc: exp.expense_no,
        user: userMobile || 'Operator',
        details: `Expense of ₹${parseFloat(String(exp.amount || '0')).toFixed(2)} for ${exp.title || 'Overhead'}`,
      })),
    ];

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Audit Log</h1>
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden text-xs">
          {auditEvents.map((log) => (
            <div key={log.id} className="p-3 hover:bg-slate-50 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold text-slate-900 text-sm block">{log.action}</span>
                  <span className="text-[11px] text-slate-500 font-mono">Doc: {log.doc} • User: {log.user}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{log.time}</span>
              </div>
              <p className="mt-1 text-slate-600 text-xs">{log.details}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SPECIAL ACCOUNT 5: Journal Ledger (General Journal)
  // -------------------------------------------------------------
  if (selectedReport === 'journal_ledger') {
    const handleAddJournal = (e: React.FormEvent) => {
      e.preventDefault();
      const amt = parseFloat(newJvAmount);
      if (!newJvDebit || !newJvCredit || isNaN(amt) || amt <= 0) {
        alert('Please fill Debit, Credit and a valid amount.');
        return;
      }
      setJournalEntries([
        {
          id: `JV-${Date.now()}`,
          entry_no: `JV/2026/00${journalEntries.length + 1}`,
          date: new Date().toLocaleDateString('en-GB'),
          debit_account: newJvDebit.trim(),
          credit_account: newJvCredit.trim(),
          narration: newJvNarration.trim() || 'Journal adjustment voucher',
          debit: amt,
          credit: amt,
        },
        ...journalEntries,
      ]);
      setNewJvDebit('');
      setNewJvCredit('');
      setNewJvAmount('');
      setNewJvNarration('');
      setIsAddJournalOpen(false);
    };

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Journal Ledger</h1>
          </div>
          <button
            onClick={() => setIsAddJournalOpen(true)}
            className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Entry</span>
          </button>
        </div>

        {/* Modal: Add Journal Entry */}
        {isAddJournalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3.5 text-xs">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="font-bold text-sm text-slate-900">Create Journal Voucher (JV)</h3>
                <button onClick={() => setIsAddJournalOpen(false)} className="text-slate-400 hover:text-slate-800 text-base font-bold">
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddJournal} className="space-y-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Debit Account (Dr.)</label>
                  <input
                    type="text"
                    required
                    value={newJvDebit}
                    onChange={(e) => setNewJvDebit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Credit Account (Cr.)</label>
                  <input
                    type="text"
                    required
                    value={newJvCredit}
                    onChange={(e) => setNewJvCredit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Amount (₹)</label>
                  <IndianAmountInput
                    step="any"
                    required
                    value={newJvAmount}
                    onValueChange={setNewJvAmount}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Narration</label>
                  <textarea
                    rows={2}
                    value={newJvNarration}
                    onChange={(e) => setNewJvNarration(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddJournalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
                  >
                    Post Journal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {journalEntries.map((je) => (
            <div key={je.id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                <span className="font-bold text-blue-600 font-mono">{je.entry_no}</span>
                <span className="text-slate-400 font-mono text-[10px]">{je.date}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-slate-800">
                  <span>Dr. {je.debit_account}</span>
                  <span className="font-mono font-bold">₹ {je.debit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 pl-4">
                  <span>To {je.credit_account}</span>
                  <span className="font-mono font-bold">₹ {je.credit.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-50">
                "{je.narration}"
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN REPORTS INDEX (Filtered strictly to blue-circled items from video!)
  // =========================================================================
  const transactionReports = [
    { id: 'sale_report', title: 'Sale Report', icon: FileText, tag: '' },
    { id: 'purchase_report', title: 'Purchase Report', icon: ShoppingBag, tag: '' },
    { id: 'day_book', title: 'Day Book', icon: BookOpen, tag: '' },
    { id: 'all_transactions', title: 'All Transactions', icon: History, tag: '' },
    { id: 'bill_wise_profit', title: 'Bill Wise Profit', icon: TrendingUp, tag: 'PROFIT' },
    { id: 'profit_and_loss', title: 'Profit & Loss', icon: TrendingUp, tag: '' },
    { id: 'cashflow', title: 'Cashflow', icon: DollarSign, tag: '' },
    { id: 'balance_sheet', title: 'Balance Sheet', icon: Scale, tag: '' },
    { id: 'trial_balance', title: 'Trial Balance', icon: Layers, tag: '' },
  ];

  const partyReports = [
    { id: 'party_statement', title: 'Party Statement', icon: User },
    { id: 'party_wise_profit', title: 'Party Wise Profit & Loss', icon: TrendingUp },
    { id: 'all_parties_report', title: 'All Parties Report', icon: User },
    { id: 'sale_purchase_by_party', title: 'Sale/Purchase by Party', icon: ShoppingBag },
  ];

  const taxReports = [
    { id: 'gst_report', title: 'GST Report', icon: ShieldAlert },
    { id: 'tax_ledger', title: 'Tax Ledger Account', icon: BookOpen },
    { id: 'rcm_account', title: 'RCM (Reverse Charge) Account', icon: ShieldAlert },
  ];

  const accountsLedgers = [
    { id: 'brs_statement', title: 'BRS Bank Reconciliation Statement', icon: CheckCircle2 },
    { id: 'journal_ledger', title: 'Journal Ledger (General Journal)', icon: BookOpen },
    { id: 'audit_log', title: 'Audit Log & Change Tracking', icon: History },
  ];

  return (
    <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 font-sans">
      {/* Top Header matching Video 00:01 */}
      <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-lg font-bold text-slate-900">Reports</h1>
        </div>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400" />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* GROUP 1: Transaction (Blue circled at 01:37) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
          <div className="px-4 py-2.5 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Transaction
          </div>
          {transactionReports.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedReport(item.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-semibold text-xs sm:text-sm text-slate-900">{item.title}</span>
                {item.tag && (
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {item.tag}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          ))}
        </div>

        {/* GROUP 2: Party Reports (Blue circled at 01:38) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
          <div className="px-4 py-2.5 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Party Reports
          </div>
          {partyReports.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedReport(item.id === 'party_wise_profit' ? 'bill_wise_profit' : item.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <span className="font-semibold text-xs sm:text-sm text-slate-900">{item.title}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          ))}
        </div>

        {/* GROUP 3: Taxes (Blue circled at 02:00 + user special accounts) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
          <div className="px-4 py-2.5 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Taxes & Statutory Ledgers
          </div>
          {taxReports.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedReport(item.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <span className="font-semibold text-xs sm:text-sm text-slate-900">{item.title}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          ))}
        </div>

        {/* GROUP 4: Special Accounts & Ledgers requested by user */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
          <div className="px-4 py-2.5 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Banking, Journals & Audit
          </div>
          {accountsLedgers.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedReport(item.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <span className="font-semibold text-xs sm:text-sm text-slate-900">{item.title}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


/** Wraps every report with JSON export and the preserved PDF / Share actions. */
export const ReportsHub: React.FC<ReportsHubProps> = (props) => {
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [jsonBusy, setJsonBusy] = useState<'download' | 'share' | null>(null);
  const companyName = props.company?.trade_name || props.company?.name;

  const run = async (mode: 'download' | 'share') => {
    if (busy) return;
    setBusy(mode);
    try {
      await runReportExport(mode, current, companyName);
    } finally {
      setBusy(null);
    }
  };

  const exportReportJson = async (mode: 'download' | 'share') => {
    if (jsonBusy || busy) return;
    setJsonBusy(mode);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const root = document.getElementById(REPORT_ROOT_ID);
      const tables = root ? Array.from(root.querySelectorAll('table')) : [];
      const data = tables.flatMap((table) => {
        const trs = Array.from(table.querySelectorAll('tr'));
        const headers = Array.from(trs[0]?.querySelectorAll('th,td') || []).map((cell, i) => (cell.textContent || '').trim() || `Column ${i + 1}`);
        return trs.slice(1).map((tr) => Object.fromEntries(Array.from(tr.querySelectorAll('th,td')).map((cell, i) => [headers[i] || `Column ${i + 1}`, (cell.textContent || '').trim()]))).filter((row) => Object.values(row).some(Boolean));
      });
      const toTypedValue = (value: string): string | number | boolean | null => {
        const text = value.trim();
        if (!text) return null;
        if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
        const numeric = text.replace(/[₹$€£,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
        if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(numeric)) {
          const parsed = Number(numeric);
          if (Number.isFinite(parsed)) return parsed;
        }
        return text;
      };
      const columns = Array.from(new Set(data.flatMap((row) => Object.keys(row))));
      const records = data.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toTypedValue(String(value ?? ''))])));
      const reportTitle = REPORT_TITLES[current || ''] || current || 'Report';
      const reportData = {
        report: reportTitle,
        reportId: current,
        generatedAt: new Date().toISOString(),
        company: props.company ? { name: props.company.trade_name || props.company.name || null, gstin: props.company.gstin || null } : null,
        source: 'currently displayed report table',
        columns,
        records,
        recordCount: records.length,
        note: records.length ? undefined : 'No table records were available in the displayed report. Summary-only report content is not represented as structured rows.',
      };
      const fileName = `${reportTitle.replace(/[^a-z0-9_-]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      if (mode === 'share') {
        await shareJson(reportData, fileName, reportTitle, `Structured data export for ${reportTitle}.`);
      } else {
        downloadJson(reportData, fileName);
        showToast('JSON download started. Check your Downloads folder.');
      }
    } catch (error) {
      console.error('Report JSON export failed:', error);
      showToast('JSON could not be exported. Please try again.');
    } finally {
      setJsonBusy(null);
    }
  };

  return (
    <>
      <div id="report-export-root">
        <ReportsHubInner {...props} onReportChange={(id) => { setCurrent(id); props.onReportChange?.(id); }} />
      </div>
      {current && (
        <div className="fixed z-40 right-3 top-20 sm:right-6 flex items-center gap-2">
          <button type="button" disabled={!!jsonBusy || !!busy} onClick={() => void exportReportJson('download')} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-lg hover:bg-blue-50 disabled:opacity-60">
            {jsonBusy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{jsonBusy === 'download' ? 'Preparing…' : 'Download JSON'}
          </button>
          <button type="button" disabled={!!jsonBusy || !!busy} onClick={() => void exportReportJson('share')} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-lg hover:bg-blue-50 disabled:opacity-60">
            {jsonBusy === 'share' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}{jsonBusy === 'share' ? 'Preparing…' : 'Share JSON'}
          </button>
        </div>
      )}
      {current && (
        <div
          data-pdf-ignore="true"
          className="fixed z-40 right-3 bottom-20 sm:bottom-6 sm:right-6 flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-xl p-1.5"
        >
          <button
            onClick={() => run('download')}
            disabled={!!busy}
            title={`Download ${REPORT_TITLES[current] || 'report'} as PDF`}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Download PDF</span>
          </button>
          <button
            onClick={() => run('share')}
            disabled={!!busy}
            title="Share PDF via WhatsApp, Telegram, Gmail, Drive and more"
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {busy === 'share' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            <span>Share</span>
          </button>
        </div>
      )}
    </>
  );
};
