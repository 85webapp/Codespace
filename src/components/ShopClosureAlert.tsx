import { IndianAmountInput } from './IndianAmountInput';
import React, { useState } from 'react';
import { AlertTriangle, Clock, DollarSign, Wallet, ShoppingBag, CheckCircle2, Calculator, Info, Plus } from 'lucide-react';
import { ClosureStatus, AppSettings } from '../types';
import { translations, Language } from '../utils/translations';
import { formatCurrency } from '../utils/formatters';

interface ShopClosureAlertProps {
  closureStatus: ClosureStatus | null;
  settings: AppSettings;
  language: Language;
  todayBilledTotal: number;
  todayExpensesTotal?: number;
  onOpenExpenseModal?: (initialAddOpen?: boolean) => void;
  onSubmitReport: (data: {
    b2c_unbilled_sales: number;
    cash_in_hand: number;
    personal_expenses: number;
    notes?: string;
  }) => Promise<void>;
}

export const ShopClosureAlert: React.FC<ShopClosureAlertProps> = ({
  closureStatus,
  settings,
  language,
  todayBilledTotal,
  todayExpensesTotal = 0,
  onOpenExpenseModal,
  onSubmitReport,
}) => {
  const t = translations[language] || translations.en;

  const [unbilledSales, setUnbilledSales] = useState<string>('');
  const [cashInDrawer, setCashInDrawer] = useState<string>('');
  // Use todayExpensesTotal as default if available, or manual input
  const [personalExpenses, setPersonalExpenses] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedBanner, setSubmittedBanner] = useState(false);

  // Sync todayExpensesTotal if user hasn't typed an override
  const effectiveExpenseTotal = personalExpenses !== '' 
    ? (parseFloat(personalExpenses) || 0) 
    : todayExpensesTotal;

  // If already submitted and not outstanding, show clean badge or collapse
  const isPending = closureStatus?.isAlertActive;
  const isPreviousOutstanding = closureStatus?.previousDayOutstanding;

  const numUnbilled = parseFloat(unbilledSales) || 0;
  const numCash = parseFloat(cashInDrawer) || 0;
  const numExpenses = effectiveExpenseTotal;

  // Calculated cash expectation: Billed cash + Unbilled cash - Expenses drawn
  const expectedCash = todayBilledTotal + numUnbilled - numExpenses;
  const cashVariance = numCash - expectedCash;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmitReport({
        b2c_unbilled_sales: numUnbilled,
        cash_in_hand: numCash,
        personal_expenses: numExpenses,
        notes: notes || 'Store closing cash & retail reconciliation submitted.',
      });
      setSubmittedBanner(true);
      setUnbilledSales('');
      setCashInDrawer('');
      setPersonalExpenses('');
      setNotes('');
      setTimeout(() => setSubmittedBanner(false), 5000);
    } catch (err) {
      console.error('Failed submitting daily closure:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Blue Notification Tag if previous day is outstanding */}
      {isPreviousOutstanding && (
        <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border border-blue-300 bg-blue-50 text-blue-900 shadow-xs">
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600 shrink-0">
            <AlertTriangle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xs sm:text-sm font-semibold">
            {t.previousDayWarning}
          </div>
        </div>
      )}

      {/* Submitted Success Flash */}
      {submittedBanner && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="text-xs sm:text-sm font-medium">
            {t.reportSubmitted}
          </div>
        </div>
      )}

      {/* Persistent White and Blue Container */}
      {isPending && (
        <div className="rounded-2xl border-2 border-blue-500 bg-white shadow-md overflow-hidden">
          
          {/* Header banner */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-blue-100 bg-blue-50/60">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
              </span>
              <h3 className="font-bold text-sm sm:text-base text-blue-900 tracking-tight flex items-center gap-2">
                <span>{t.unfiledClosingAlert}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-widest font-bold">
                  Daily Closing
                </span>
              </h3>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-blue-700 font-mono font-bold">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Target: {closureStatus?.alarmTime || '21:30'}</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4 bg-white">
            <p className="text-xs text-slate-600">
              {t.unfiledAlertDesc}
            </p>

            {/* Shop-Closure Entry Data Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                
                {/* Field 1: Daily Estimated B2C Unbilled Total Sales */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-colors shadow-2xs">
                  <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                      {t.b2cUnbilledSales}
                    </span>
                    <span className="text-[10px] text-blue-600 font-mono font-bold">₹</span>
                  </label>
                  <p className="text-[10px] text-slate-500 mb-2 leading-tight">
                    {t.b2cUnbilledHelp}
                  </p>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                      {settings.currency}
                    </span>
                    <IndianAmountInput
                      step="any"
                      min="0"
                      required
                      value={unbilledSales}
                      onValueChange={setUnbilledSales}
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Field 2: Current Daily Cash-in-Hand Drawer Balance */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-colors shadow-2xs">
                  <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-blue-600" />
                      {t.cashInDrawer}
                    </span>
                    <span className="text-[10px] text-blue-600 font-mono font-bold">Galla</span>
                  </label>
                  <p className="text-[10px] text-slate-500 mb-2 leading-tight">
                    {t.cashInDrawerHelp}
                  </p>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                      {settings.currency}
                    </span>
                    <IndianAmountInput
                      step="any"
                      min="0"
                      required
                      value={cashInDrawer}
                      onValueChange={setCashInDrawer}
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Field 3: Today's Expenses with 'Write Expense' Redirect (White/Blue Theme) */}
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 hover:border-blue-400 transition-colors flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                        Today's Expenses
                      </span>
                      <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">
                        {formatCurrency(numExpenses, settings.currency)} Recorded
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2.5 leading-tight">
                      Record food, petrol, rent, wages or shop expenses directly
                    </p>
                  </div>

                  <div className="space-y-2">
                    {/* Primary Action: Write Expense Button (Clean Blue) */}
                    <button
                      type="button"
                      onClick={() => onOpenExpenseModal && onOpenExpenseModal(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Write Expense</span>
                    </button>

                    {/* Quick amount indicator */}
                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-0.5">
                      <span>Total Expenses Counted:</span>
                      <span className="font-mono font-bold text-blue-700">
                        {formatCurrency(numExpenses, settings.currency)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Real-time Reconciliation Math Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  <span>
                    Billed Today: <strong className="text-slate-900 font-mono">{formatCurrency(todayBilledTotal, settings.currency)}</strong>
                  </span>
                  <span>+</span>
                  <span>
                    Unbilled: <strong className="text-slate-900 font-mono">{formatCurrency(numUnbilled, settings.currency)}</strong>
                  </span>
                  <span>-</span>
                  <span>
                    Personal Draws: <strong className="text-slate-900 font-mono">{formatCurrency(numExpenses, settings.currency)}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-medium">Drawer Discrepancy:</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                    Math.abs(cashVariance) < 1 
                      ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                      : cashVariance > 0 
                        ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {cashVariance >= 0 ? `+${formatCurrency(cashVariance, settings.currency)}` : formatCurrency(cashVariance, settings.currency)}
                    {Math.abs(cashVariance) < 1 ? ' (Balanced)' : cashVariance > 0 ? ' (Surplus)' : ' (Short)'}
                  </span>
                </div>
              </div>

              {/* Submit Action */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Transmitting...' : t.submitClosingReport}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
    </div>
  );
};
