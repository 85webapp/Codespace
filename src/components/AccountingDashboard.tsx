import { IndianAmountInput } from './IndianAmountInput';
import React, { useState } from 'react';
import {
  ArrowLeft,
  Search,
  Filter,
  MoreVertical,
  Plus,
  UserPlus,
  ChevronRight,
  TrendingUp,
  FileText,
  CheckCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Settings,
  Pencil,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { AppSettings, CompanyProfile, Invoice, Purchase, Party, User as UserType } from '../types';
import { translations, Language } from '../utils/translations';
import { formatCurrency, formatDate } from '../utils/formatters';
import { PaymentSettlementModal } from './PaymentSettlementModal';

interface AccountingDashboardProps {
  settings: AppSettings;
  language: Language;
  currentUser?: UserType | null;
  company?: CompanyProfile | null;
  invoices?: Invoice[];
  purchases?: Purchase[];
  parties?: Party[];
  youGetRows: Array<{
    id: string;
    party_name: string;
    date: string;
    amount: number;
    type: string;
    ref_no?: string;
  }>;
  youGiveRows: Array<{
    id: string;
    party_name: string;
    date: string;
    amount: number;
    type: string;
    ref_no?: string;
  }>;
  totalReceivables: number;
  totalPayables: number;
  trendData: Array<{ month: string; revenue: number; expenses: number; netProfit: number }>;
  expenseAnalytics: Array<{
    category: string;
    type: string;
    entriesCount: number;
    taxableValue: number;
    taxAmount: number;
    totalAmount: number;
    percentage: string;
  }>;
  onAddNewParty: () => void;
  onOpenReports?: () => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
  onOpenNotifications?: () => void;
  onOpenExpenseModal?: (initialAddOpen?: boolean) => void;
  onRefreshData?: () => void;
}

export const AccountingDashboard: React.FC<AccountingDashboardProps> = ({
  settings,
  language,
  currentUser,
  company,
  invoices = [],
  purchases = [],
  parties = [],
  youGetRows,
  youGiveRows,
  totalReceivables,
  totalPayables,
  trendData,
  expenseAnalytics,
  onAddNewParty,
  onOpenReports,
  onOpenProfile,
  onOpenSettings,
  onOpenNotifications,
  onOpenExpenseModal,
  onRefreshData,
}) => {
  const t = translations[language] || translations.en;

  // View state: 'dashboard' | 'parties_get' | 'parties_give' | 'expenses'
  const [viewState, setViewState] = useState<'dashboard' | 'parties_get' | 'parties_give' | 'expenses'>('dashboard');

  // Parties search & filter state
  const [partySearch, setPartySearch] = useState('');

  // Settlement Modal State
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [settlementDirection, setSettlementDirection] = useState<'PAYMENT_IN' | 'PAYMENT_OUT'>('PAYMENT_IN');

  // Expenses Tab: 'categories' | 'items'
  const [expenseTab, setExpenseTab] = useState<'categories' | 'items'>('categories');
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [newExpenseCategory, setNewExpenseCategory] = useState('Manufacturing Expense');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');

  // Sample or live expenses
  const [expenseCategories, setExpenseCategories] = useState([
    { name: 'Manufacturing Expense', amount: 0.0 },
    { name: 'Petrol', amount: 0.0 },
    { name: 'Rent', amount: 0.0 },
    { name: 'Salary', amount: 0.0 },
    { name: 'Tea', amount: 0.0 },
    { name: 'Transport', amount: 0.0 },
  ]);

  const totalExpenseVal = expenseCategories.reduce((sum, c) => sum + c.amount, 0);

  // Sales total for current month (100% Zero-State Blank when no invoices)
  const totalSalesVal = invoices.length > 0 
    ? invoices.reduce((sum, i) => sum + parseFloat(String(i.grand_total || '0')), 0) 
    : 0;

  const displayReceivables = totalReceivables || 0;
  const displayPayables = totalPayables || 0;

  // Filter parties based on search - strictly pristine blank if no parties created
  const filteredGetParties = parties
    .filter((p) => parseFloat(String(p.current_balance || '0')) >= 0 || p.type === 'CUSTOMER')
    .filter((p) => p.name.toLowerCase().includes(partySearch.toLowerCase()));

  const filteredGiveParties = parties
    .filter((p) => parseFloat(String(p.current_balance || '0')) < 0 || p.type === 'SUPPLIER')
    .filter((p) => p.name.toLowerCase().includes(partySearch.toLowerCase()));

  // ==========================================
  // VIEW 1: ALL PARTIES (Matching Video 00:02 - 00:08)
  // ==========================================
  if (viewState === 'parties_get' || viewState === 'parties_give') {
    const isGet = viewState === 'parties_get';
    const partyList = isGet ? filteredGetParties : filteredGiveParties;

    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 relative font-sans">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewState('dashboard')}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              {isGet ? "You'll Get (Debtors)" : "You'll Give (Creditors)"}
            </h1>
          </div>
          <button
            onClick={() => {
              setSettlementDirection(isGet ? 'PAYMENT_IN' : 'PAYMENT_OUT');
              setIsSettlementOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isGet ? 'Payment-In' : 'Payment-Out'}</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-blue-500 shrink-0" />
            <input aria-label="Search parties"
              type="text"
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
              className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
            />
          </div>
          <button className="p-1 text-blue-500 hover:text-blue-600">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Parties List */}
        <div className="mt-3 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-xs overflow-hidden">
          {partyList.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-20 h-20 mx-auto rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
                <Search className="w-9 h-9 text-blue-400" />
              </div>
              <div className="text-base font-bold text-slate-800">Party not found!</div>
            </div>
          ) : (
            partyList.map((p) => {
              const bal = Math.abs(parseFloat(String(p.current_balance || '0')));
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSettlementDirection(isGet ? 'PAYMENT_IN' : 'PAYMENT_OUT');
                    setIsSettlementOpen(true);
                  }}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">{p.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {p.created_at ? formatDate(p.created_at, settings.date_format) : 'Active Party'} • Click to Settle
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${isGet ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(bal, settings.currency)}
                    </div>
                    <div className={`text-[10px] font-semibold ${isGet ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isGet ? "You'll Get" : "You'll Give"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Action Buttons: Settle & Add Party */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
          <button
            onClick={() => {
              setSettlementDirection(isGet ? 'PAYMENT_IN' : 'PAYMENT_OUT');
              setIsSettlementOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isGet ? 'Record Payment-In' : 'Record Payment-Out'}</span>
          </button>
          <button
            onClick={onAddNewParty}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Party</span>
          </button>
        </div>

      </div>
    );
  }

  // ==========================================
  // VIEW 2: EXPENSES (Matching Video 00:10 - 00:14)
  // ==========================================
  if (viewState === 'expenses') {
    return (
      <div className="bg-slate-50 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 relative font-sans">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200 bg-white -mx-4 -mt-4 px-4 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewState('dashboard')}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">Expense</h1>
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

        {/* Total Summary */}
        <div className="flex justify-end py-2 px-1 text-xs">
          <span className="text-slate-500 mr-2">Total:</span>
          <span className="font-bold font-mono text-blue-600">
            {formatCurrency(totalExpenseVal, settings.currency)}
          </span>
        </div>

        {/* Categories List */}
        {expenseTab === 'categories' ? (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-xs overflow-hidden">
            {expenseCategories.map((cat, idx) => (
              <div
                key={idx}
                className="py-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <span className="text-xs font-semibold text-slate-800">{cat.name}</span>
                <span className="text-xs font-mono font-bold text-slate-700">
                  {formatCurrency(cat.amount, settings.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs shadow-xs">
            No itemized expenses recorded yet. Click "Add Expenses" below to create one.
          </div>
        )}

        {/* Floating Red Button: Add Expenses */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => {
              if (onOpenExpenseModal) {
                onOpenExpenseModal(true);
              } else {
                setIsAddExpenseModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expenses</span>
          </button>
        </div>

        {/* Quick Add Expense Modal */}
        {isAddExpenseModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
              <h3 className="font-bold text-sm text-slate-900">Record New Expense</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-600 font-semibold block mb-1">Expense Category</label>
                  <select
                    value={newExpenseCategory}
                    onChange={(e) => setNewExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800"
                  >
                    {expenseCategories.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-600 font-semibold block mb-1">Amount (₹)</label>
                  <IndianAmountInput
                    value={newExpenseAmount}
                    onValueChange={setNewExpenseAmount}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const amt = parseFloat(newExpenseAmount) || 0;
                    setExpenseCategories(expenseCategories.map((c) => c.name === newExpenseCategory ? { ...c, amount: c.amount + amt } : c));
                    setIsAddExpenseModalOpen(false);
                    setNewExpenseAmount('');
                  }}
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs"
                >
                  Save Expense
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ==========================================
  // VIEW 3: MAIN DASHBOARD (Exact video match 00:00 - 00:01)
  // ==========================================
  return (
    <div className="bg-slate-100/80 min-h-dvh text-slate-800 -mx-3 -my-3 sm:-mx-6 sm:-my-6 p-4 pb-28 space-y-3 font-sans">
      
      {/* 1. Header Bar: Circle Icon, Company Name with Pencil, Bell & Gear */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-3 px-4 border border-slate-200 shadow-xs">
        <div 
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 cursor-pointer group min-w-0"
        >
          {/* Shop / Building Circle Icon */}
          <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-bold text-sm sm:text-base text-slate-800 group-hover:text-blue-600 transition-colors truncate">
              {company?.trade_name || company?.name || 'Enter Company Name'}
            </span>
            <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
          </div>
        </div>

        {/* Right Settings & Bell Trigger Icons */}
        <div className="flex items-center gap-2 shrink-0">
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

      {/* 2. Reports Royal Blue Card Container */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white p-4 shadow-md relative overflow-hidden flex items-center justify-between">
        <div className="space-y-1.5 relative z-10 max-w-xs">
          <h2 className="font-extrabold text-sm sm:text-base tracking-tight">Cotrix Tax &amp; Compliance Group Reports</h2>
          <p className="text-[11px] text-blue-100 leading-tight">
            View more than <strong className="text-white">10 reports</strong> and gain full control of your business!
          </p>
          <div className="pt-1.5">
            <button
              onClick={onOpenReports}
              className="px-4 py-1.5 rounded-full bg-white text-blue-700 font-bold text-xs shadow-sm hover:bg-blue-50 transition-all cursor-pointer"
            >
              See Reports
            </button>
          </div>
        </div>

        {/* Illustration: Cute Clipboard Document */}
        <div className="relative shrink-0 pr-2">
          <div className="w-16 h-20 bg-blue-500/40 rounded-xl border border-white/20 p-2 flex flex-col justify-between shadow-inner">
            <div className="w-6 h-1.5 bg-white/60 rounded-full mx-auto"></div>
            <div className="space-y-1">
              <div className="w-full h-1 bg-white/40 rounded"></div>
              <div className="w-3/4 h-1 bg-white/40 rounded"></div>
            </div>
            <div className="flex items-center justify-between">
              <CheckCircle className="w-4 h-4 text-emerald-300" />
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Two Split Balance Cards: You'll Get & You'll Give (Matching Video 00:01) */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* Card A: You'll Get */}
        <div
          onClick={() => setViewState('parties_get')}
          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <div className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft className="w-3 h-3 stroke-[3]" />
              </div>
              <span>You'll Get</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
          </div>

          <div className="text-xl sm:text-2xl font-black font-mono text-slate-800 mt-2.5">
            {formatCurrency(displayReceivables, settings.currency, 2)}
          </div>
        </div>

        {/* Card B: You'll Give */}
        <div
          onClick={() => setViewState('parties_give')}
          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <div className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <ArrowUpRight className="w-3 h-3 stroke-[3]" />
              </div>
              <span>You'll Give</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </div>

          <div className="text-xl sm:text-2xl font-black font-mono text-slate-800 mt-2.5">
            {formatCurrency(displayPayables, settings.currency, 2)}
          </div>
        </div>

      </div>

      {/* 4. Your Sale Overview (Sept) Card with SVG Line Graph (Matching Video 00:01) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs sm:text-sm text-slate-800">Your Sale Overview (Sept)</h3>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>

        {/* Sale Metric Box */}
        <div className="text-center pt-1">
          <div className="text-[11px] text-slate-500 font-medium">Total Sale</div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-500 mt-0.5">
            {formatCurrency(totalSalesVal, settings.currency, 2)}
          </div>
          {totalSalesVal > 0 ? (
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-600 mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>Active Billing This Month</span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-1">
              No sales billed yet this month
            </div>
          )}
        </div>

        {/* Responsive Vector Line Graph with baseline */}
        <div className="pt-2">
          <svg viewBox="0 0 500 130" className="w-full h-28 overflow-visible">
            {/* Horizontal baseline */}
            <line x1="20" y1="100" x2="480" y2="100" stroke="#f1f5f9" strokeWidth="1.5" />

            {/* Cyan/Blue Growth Line */}
            <path
              d={totalSalesVal > 0 ? "M 40,100 L 240,100 L 460,40" : "M 40,100 L 240,100 L 460,100"}
              fill="none"
              stroke={totalSalesVal > 0 ? "#38bdf8" : "#cbd5e1"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Point circles */}
            <circle cx="40" cy="100" r="3" fill={totalSalesVal > 0 ? "#38bdf8" : "#cbd5e1"} />
            <circle cx="240" cy="100" r="3" fill={totalSalesVal > 0 ? "#38bdf8" : "#cbd5e1"} />
            <circle cx="460" cy={totalSalesVal > 0 ? 40 : 100} r="3" fill={totalSalesVal > 0 ? "#38bdf8" : "#cbd5e1"} />

            {/* Month labels along bottom baseline */}
            <text x="40" y="122" fill="#94a3b8" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
              Jul
            </text>
            <text x="240" y="122" fill="#94a3b8" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
              Aug
            </text>
            <text x="460" y="122" fill="#94a3b8" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
              Sept
            </text>
          </svg>
        </div>
      </div>

      {/* 5. Expenses (Sept) Card (Matching Video 00:01) */}
      <div 
        onClick={() => setViewState('expenses')}
        className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-slate-300 transition-all cursor-pointer group space-y-1.5"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs sm:text-sm text-slate-800">Expenses (Sept)</h3>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
        </div>
        <div className="text-xl sm:text-2xl font-black font-mono text-slate-800">
          {formatCurrency(totalExpenseVal, settings.currency, 2)}
        </div>
      </div>

      {/* 6. Expenses Section Row Listing (Matching Video 00:01) */}
      <div 
        onClick={() => setViewState('expenses')}
        className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-slate-300 transition-all cursor-pointer group space-y-3"
      >
        <div className="text-xs font-bold text-slate-600">Expenses</div>
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-slate-800 font-medium">Manufacturing Expense</span>
          <span className="font-mono font-bold text-slate-700">
            {formatCurrency(0.00, settings.currency, 2)}
          </span>
        </div>
      </div>

      {/* Account Settlement Module (Payment In / Payment Out Matrix) */}
      <PaymentSettlementModal
        isOpen={isSettlementOpen}
        initialDirection={settlementDirection}
        currentUser={currentUser || null}
        settings={settings}
        onClose={() => setIsSettlementOpen(false)}
        onSettlementSaved={() => {
          if (onRefreshData) onRefreshData();
        }}
      />

    </div>
  );
};
