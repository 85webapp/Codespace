import React from 'react';
import {
  FileText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  Plus,
  Calculator,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  Lock,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Bell,
  Wallet,
} from 'lucide-react';
import { CompanyProfile, Invoice, Purchase, AppSettings, ClosureStatus, DailyCashSummary } from '../types';
import { translations, Language } from '../utils/translations';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ShopClosureAlert } from './ShopClosureAlert';

interface HomePanelProps {
  company: CompanyProfile | null;
  settings: AppSettings;
  language: Language;
  invoices: Invoice[];
  purchases?: Purchase[];
  latestClosure?: DailyCashSummary | null;
  closureStatus?: ClosureStatus | null;
  totalReceivables?: number;
  totalPayables?: number;
  todayExpensesTotal?: number;
  isCashierMode?: boolean;
  cashierApproved?: boolean;
  ownerMobile?: string;
  onAddNewSale: () => void;
  onSubmitDailyClosure?: (closureData: any) => Promise<void>;
  onSelectInvoiceForView: (invoice: Invoice) => void;
  onNavigateToAccounting?: () => void;
  onOpenQuickPurchase?: () => void;
  onOpenManualPurchase?: () => void;
  onNavigateToCompliance?: () => void;
  onOpenExpenseModal?: (initialAddOpen?: boolean) => void;
  onOpenPaymentSettlement?: (direction: 'PAYMENT_IN' | 'PAYMENT_OUT') => void;
  onOpenDailyReport?: () => void;
  onTriggerCashierHandshake?: () => void;
}

export const HomePanel: React.FC<HomePanelProps> = ({
  company,
  settings,
  language,
  invoices,
  purchases = [],
  latestClosure,
  closureStatus,
  totalReceivables,
  totalPayables,
  todayExpensesTotal = 0,
  isCashierMode = false,
  cashierApproved = true,
  ownerMobile = '',
  onAddNewSale,
  onSubmitDailyClosure,
  onSelectInvoiceForView,
  onNavigateToAccounting,
  onOpenQuickPurchase,
  onOpenManualPurchase,
  onNavigateToCompliance,
  onOpenExpenseModal,
  onOpenPaymentSettlement,
  onOpenDailyReport,
  onTriggerCashierHandshake,
}) => {
  const t = translations[language] || translations.en;

  // Calculate today's billed sales
  const todayStr = closureStatus?.todayDate || new Date().toLocaleDateString('en-GB');
  const todayInvoices = invoices.filter((i) => i.date === todayStr);
  const todayBilledTotal = todayInvoices.reduce(
    (sum, inv) => sum + parseFloat(String(inv.grand_total || '0')),
    0
  );

  // Calculate today's purchases
  const todayPurchases = purchases.filter((p) => p.date === todayStr);
  const todayPurchasesTotal = todayPurchases.reduce(
    (sum, pur) => sum + parseFloat(String(pur.grand_total || '0')),
    0
  );

  const displaySales = isCashierMode ? 0 : todayBilledTotal;
  const displayPurchases = isCashierMode ? 0 : todayPurchasesTotal;

  // Show closure alert whenever alarm is active or unfiled report is outstanding
  const shouldShowClosureAlert = Boolean(
    !isCashierMode &&
    (closureStatus?.isAlertActive ||
    (settings.notifications_enabled && closureStatus?.previousDayOutstanding))
  );

  const handleAction = (callback?: () => void) => {
    if (isCashierMode && !cashierApproved) {
      if (onTriggerCashierHandshake) {
        onTriggerCashierHandshake();
      }
      return;
    }
    if (callback) callback();
  };

  return (
    <div className="space-y-5 pb-28 text-slate-800 font-sans">
      
      {/* ========================================================================= */}
      {/* CASHIER BLIND-SCREEN SHIELD & HANDSHAKE CLEARANCE BANNER                  */}
      {/* ========================================================================= */}
      {isCashierMode && (
        <div className={`p-4 rounded-2xl border transition-all ${
          cashierApproved 
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
            : 'bg-blue-50/70 border-blue-200 text-slate-900'
        } shadow-xs space-y-2`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl border ${
                cashierApproved ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-blue-100 text-blue-700 border-blue-300'
              }`}>
                {cashierApproved ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm sm:text-base">
                    Temporary Cashier Terminal Mode
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    cashierApproved ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                  }`}>
                    {cashierApproved ? '2FA Approved' : 'Lockdown: 2FA Required'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Synchronized with Master Merchant Account: <strong className="font-mono text-slate-900">+91 {ownerMobile || 'Owner'}</strong>
                </div>
              </div>
            </div>

            {!cashierApproved && (
              <button
                type="button"
                onClick={onTriggerCashierHandshake}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer shrink-0"
              >
                Clearance
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded-xl border border-slate-200/80 leading-relaxed">
            <strong>The Cashier Blind-Screen Security Shield is Active:</strong> All internal company turnovers, ledger balances, P&amp;L indices, and financial reports are completely excluded. Every voucher created here saves automatically under the merchant's master account.
          </div>
        </div>
      )}

      {/* 1. Daily Shop-Closure Reminder (Merchant mode only) */}
      {shouldShowClosureAlert && onSubmitDailyClosure && (
        <ShopClosureAlert
          closureStatus={closureStatus || null}
          settings={settings}
          language={language}
          todayBilledTotal={todayBilledTotal}
          todayExpensesTotal={todayExpensesTotal}
          onOpenExpenseModal={onOpenExpenseModal}
          onSubmitReport={onSubmitDailyClosure}
        />
      )}

      {/* 2. Primary Summary Cards: Today Sale & Today Purchase (Hidden / Zeroed in Cashier Mode) */}
      {!isCashierMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Today Sale */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs relative overflow-hidden group hover:border-blue-400 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Today Sale
              </span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-blue-600 mt-3">
              {formatCurrency(displaySales, settings.currency, settings.decimal_places)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Total sales generated today
            </div>
          </div>

          {/* Card 2: Today Purchase */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs relative overflow-hidden group hover:border-blue-400 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Today Purchase
              </span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                <TrendingDown className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-800 mt-3">
              {formatCurrency(displayPurchases, settings.currency, settings.decimal_places)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Total supplier purchases recorded
            </div>
          </div>
        </div>
      ) : (
        /* Cashier Mode Turnover Zero Blind Shield Box */
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-700">Financial Turnover Counters: Locked</div>
              <div className="text-sm font-black font-mono text-slate-400">₹0.00 (Zero Overview Protected)</div>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
            Shield Active
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASHIER MODE: RAW DATA ENTRY OPERATIONS MATRIX (8 Explicit Operations)    */}
      {/* ========================================================================= */}
      {isCashierMode && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Allowed Data-Entry Operations Only</h3>
              <p className="text-[11px] text-slate-500">Authorized voucher and retail book ingestion forms</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              cashierApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {cashierApproved ? 'Unlocked & Active' : '2FA Clearance Required'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Op 1: Create Sales Invoice / Bill */}
            <button
              type="button"
              onClick={() => handleAction(onAddNewSale)}
              className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold mb-2 shadow-xs">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Create Sales Invoice / Bill
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Issue customer GST tax invoice or cash memo
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-blue-100 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 2: Add Purchase Invoice */}
            <button
              type="button"
              onClick={() => handleAction(onOpenManualPurchase)}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-blue-600 flex items-center justify-center font-bold mb-2 shadow-2xs">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Add Purchase Invoice
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Record inward vendor bill &amp; tax voucher
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 3: Payment In */}
            <button
              type="button"
              onClick={() => handleAction(() => onOpenPaymentSettlement && onOpenPaymentSettlement('PAYMENT_IN'))}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-emerald-600 flex items-center justify-center font-bold mb-2 shadow-2xs">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Payment In (Receipt)
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Settle customer payment &amp; credit ledger
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 4: Payment Out */}
            <button
              type="button"
              onClick={() => handleAction(() => onOpenPaymentSettlement && onOpenPaymentSettlement('PAYMENT_OUT'))}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-blue-600 flex items-center justify-center font-bold mb-2 shadow-2xs">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Payment Out (Payout)
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Log supplier vendor settlement voucher
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 5: Credit Note (Sale Return) */}
            <button
              type="button"
              onClick={() => handleAction(onAddNewSale)}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-amber-600 flex items-center justify-center font-bold mb-2 shadow-2xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Credit Note (Sale Return)
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Issue customer returns adjustment
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 6: Debit Note (Purchase Return) */}
            <button
              type="button"
              onClick={() => handleAction(onOpenManualPurchase)}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-rose-600 flex items-center justify-center font-bold mb-2 shadow-2xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Debit Note (Debit Return)
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Log goods returned back to supplier
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 7: Apply RCM Parameters Form */}
            <button
              type="button"
              onClick={() => handleAction(onAddNewSale)}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-purple-600 flex items-center justify-center font-bold mb-2 shadow-2xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Apply RCM Parameters Form
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Reverse Charge Mechanism bill entry
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-600">
                <span>{cashierApproved ? 'Open Form' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            {/* Op 8: Daily Shop-Closing Bell Notification Panel */}
            <button
              type="button"
              onClick={() => handleAction(onOpenDailyReport)}
              className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400 text-left transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold mb-2 shadow-xs">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                  Daily Closing Bell Report
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Log unbilled B2C sales &amp; cash in drawer
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-amber-200 text-[10px] font-bold text-amber-700">
                <span>{cashierApproved ? 'Open Report' : 'Locked (Clearance)'}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Standard Merchant Quick Settlement Action Buttons (When NOT in Cashier Mode) */}
      {!isCashierMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onOpenPaymentSettlement && onOpenPaymentSettlement('PAYMENT_IN')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all flex items-center justify-between text-left group cursor-pointer shadow-2xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Payment-In (Customer Receipt)
                </div>
                <div className="text-[11px] text-slate-500">
                  Settle customer ledger &amp; balance owed
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onOpenPaymentSettlement && onOpenPaymentSettlement('PAYMENT_OUT')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all flex items-center justify-between text-left group cursor-pointer shadow-2xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Payment-Out (Vendor Payment)
                </div>
                <div className="text-[11px] text-slate-500">
                  Settle supplier credit liability owed
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </div>
      )}

      {/* 3. Recent Invoices & Bills Table (Crisp White Card) */}
      {!isCashierMode && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t.recentInvoices}</h2>
                <p className="text-xs text-slate-500">Issued GST Tax Invoices and Retail Cash Memos</p>
              </div>
            </div>

            <button
              onClick={onAddNewSale}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Sale</span>
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              {t.noInvoices}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {invoices.slice(0, 8).map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => onSelectInvoiceForView(inv)}
                  className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-blue-50/40 rounded-xl transition-colors cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                        {inv.party_name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-bold">
                        {inv.invoice_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 font-mono">
                      <span>{formatDate(inv.date, settings.date_format)}</span>
                      <span>•</span>
                      <span className="text-slate-400">{inv.place_of_supply}</span>
                      <span>•</span>
                      <span className={inv.payment_status === 'PAID' ? 'text-blue-600 font-bold' : 'text-slate-600 font-bold'}>
                        {inv.payment_status}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-slate-900">
                      {formatCurrency(inv.grand_total, settings.currency, settings.decimal_places)}
                    </div>
                    <div className="text-[10px] text-slate-400 group-hover:text-blue-600 transition-colors flex items-center justify-end gap-1">
                      <span>View Bill</span>
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
