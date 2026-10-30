import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useMemo, useState } from 'react';
import { X, FileText, Plus, CheckCircle2, ArrowDownRight, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { AppSettings, User as UserType } from '../types';
import { Language } from '../utils/translations';
import { formatCurrency } from '../utils/formatters';

interface NotificationModalProps {
  isOpen: boolean;
  settings?: AppSettings;
  language?: Language;
  currentUser?: UserType | null;
  onClose: () => void;
  onReportSaved?: () => void;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => Promise<void>;
  onTriggerManualAlarm?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  settings,
  currentUser,
  onClose,
  onReportSaved,
}) => {

  type CounterEntry = { id: string; amount: string; gstRate: string };
  const makeEntry = (): CounterEntry => ({ id: `${Date.now()}-${Math.random()}`, amount: '', gstRate: '5' });
  const [salesEntries, setSalesEntries] = useState<CounterEntry[]>([]);
  const [purchaseEntries, setPurchaseEntries] = useState<CounterEntry[]>([]);
  const [salesExpanded, setSalesExpanded] = useState(false);
  const [purchasesExpanded, setPurchasesExpanded] = useState(false);
  const [salesCashPercentage, setSalesCashPercentage] = useState('50');
  const [salesOnlinePercentage, setSalesOnlinePercentage] = useState('50');
  const [purchaseCashPercentage, setPurchaseCashPercentage] = useState('50');
  const [purchaseOnlinePercentage, setPurchaseOnlinePercentage] = useState('50');
  const percentageOptions = Array.from({ length: 21 }, (_, index) => index * 5);
  const updateSalesCashPercentage = (value: string) => { setSalesCashPercentage(value); setSalesOnlinePercentage(String(100 - Number(value))); };
  const updateSalesOnlinePercentage = (value: string) => { setSalesOnlinePercentage(value); setSalesCashPercentage(String(100 - Number(value))); };
  const updatePurchaseCashPercentage = (value: string) => { setPurchaseCashPercentage(value); setPurchaseOnlinePercentage(String(100 - Number(value))); };
  const updatePurchaseOnlinePercentage = (value: string) => { setPurchaseOnlinePercentage(value); setPurchaseCashPercentage(String(100 - Number(value))); };
  // Notes / Draw
  const [reportNotes, setReportNotes] = useState<string>('');

  // 3. Write Expense (Inline Form & List)
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState<boolean>(false);
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('General Store');
  const [expensePaymentMode, setExpensePaymentMode] = useState<string>('CASH');
  const [recordedExpenses, setRecordedExpenses] = useState<Array<{
    id: string;
    title: string;
    amount: number;
    category: string;
    mode: string;
  }>>([]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Helper date formatter DD/MM/YYYY
  const getTodayFormatted = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const sumEntries = (entries: CounterEntry[]) => entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
  const salesTotal = useMemo(() => sumEntries(salesEntries), [salesEntries]);
  const purchaseTotal = useMemo(() => sumEntries(purchaseEntries), [purchaseEntries]);
  const splitAmount = (total: number, percentage: string) => Math.round((total * Number(percentage || 0) / 100) * 100) / 100;
  const salesCash = splitAmount(salesTotal, salesCashPercentage);
  const salesOnline = Math.round((salesTotal - salesCash) * 100) / 100;
  const purchaseCash = splitAmount(purchaseTotal, purchaseCashPercentage);
  const purchaseOnline = Math.round((purchaseTotal - purchaseCash) * 100) / 100;

  const saveDailySummaryValues = async () => {
    const payload = {
      date: getTodayFormatted(),
      b2c_unbilled_sales: salesTotal,
      notes: reportNotes.trim() || 'Daily report',
      counter_sales: salesEntries.map(({ amount, gstRate }) => ({ amount: Number(amount) || 0, gst_rate: Number(gstRate) })),
      counter_purchases: purchaseEntries.map(({ amount, gstRate }) => ({ amount: Number(amount) || 0, gst_rate: Number(gstRate) })),
      sales_cash: salesCash, sales_online: salesOnline,
      purchases_cash: purchaseCash, purchases_online: purchaseOnline,
      payment_split_mode: 'percentage', cash_percentage: Number(salesCashPercentage),
    };
    const res = await apiFetch('/api/daily-cash-summaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Could not save daily report.');
    }
    return true;
  };

  // "Add / Write Expense" Action
  // Saving an expense also saves the B2C sales and cash-in-hand values entered above.
  const handleAddExpense = async () => {
    if (!expenseTitle.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      alert('Please enter expense title and amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Post the expense into accounts database
      const expRes = await apiFetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}),
        },
        body: JSON.stringify({
          title: expenseTitle.trim(),
          amount: parseFloat(expenseAmount),
          category: expenseCategory,
          payment_mode: expensePaymentMode,
          date: getTodayFormatted(),
          notes: 'Logged during Daily Store Report',
        }),
      });

      if (expRes.ok) {
        const savedExp = await expRes.json();
        setRecordedExpenses((prev) => [
          ...prev,
          {
            id: savedExp.expense?.id || 'EXP-' + Date.now(),
            title: expenseTitle.trim(),
            amount: parseFloat(expenseAmount),
            category: expenseCategory,
            mode: expensePaymentMode,
          },
        ]);


        // Reset expense form
        setExpenseTitle('');
        setExpenseAmount('');
        setIsExpenseFormOpen(false);

        setSuccessMsg('Expense and daily values saved.');
        setTimeout(() => setSuccessMsg(null), 3000);

        if (onReportSaved) onReportSaved();
      } else {
        const errData = await expRes.json();
        alert(`Error recording expense: ${errData.error || 'Server error'}`);
      }
    } catch (err: any) {
      console.error('Error saving expense:', err);
      alert('Failed to save expense. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Full Daily Report Final Submission
  const handleSubmitFullReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const ok = await saveDailySummaryValues();
      if (ok) {
        setSuccessMsg('Daily report saved.');
        if (onReportSaved) onReportSaved();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        alert('Could not save daily report. Please try again.');
      }
    } catch (err) {
      console.error('Error submitting daily report:', err);
      alert(err instanceof Error ? err.message : 'Failed to submit report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-full overflow-y-auto bg-white text-slate-800 animate-in fade-in duration-150">
      <div
        className="mx-auto min-h-[100dvh] w-full max-w-5xl bg-white flex flex-col text-slate-800 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header: Crisp White Theme with Blue Accent */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-4 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Daily Report
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Date: {getTodayFormatted()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-5">
          
          {/* Success Banner */}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Single Focused Option: Write a Daily Report */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Write a Daily Report
              </span>
            </div>

            <form onSubmit={handleSubmitFullReport} className="space-y-4">
              
              {/* Counter Sales */}
              <section className="rounded-xl border border-blue-100 bg-white p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-bold text-slate-900">Counter Sales</h3><p className="text-xs text-slate-500">Unbilled sales · {formatCurrency(salesTotal)}</p></div>
                  <button type="button" onClick={() => { setSalesEntries((rows) => [...rows, makeEntry()]); setSalesExpanded(true); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"><Plus className="h-4 w-4"/> Add Sale</button>
                </div>
                {salesEntries.length > 0 && <div className="space-y-2">
                  {!salesExpanded && <button type="button" onClick={() => setSalesExpanded(true)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 p-2.5 text-xs font-semibold text-slate-700">{salesEntries.length} sale slab(s) · {formatCurrency(salesTotal)} <ChevronDown className="h-4 w-4"/></button>}
                  {salesExpanded && <>{salesEntries.map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(84px,112px)_36px] gap-2 items-end">
                    <label className="text-[11px] font-semibold text-slate-600">Total amount (₹)<IndianAmountInput min="0" step="0.01" value={row.amount} onValueChange={(value) => setSalesEntries((rows) => rows.map((item) => item.id === row.id ? {...item, amount:value} : item))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900" placeholder="0.00"/></label>
                    <label className="text-[11px] font-semibold text-slate-600">GST rate<select value={row.gstRate} onChange={(e) => setSalesEntries((rows) => rows.map((item) => item.id === row.id ? {...item, gstRate:e.target.value} : item))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900">{['0','0.25','1.5','3','5','12','18','28'].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
                    <button type="button" aria-label="Remove sale row" onClick={() => setSalesEntries((rows) => rows.filter((item) => item.id !== row.id))} className="mb-0.5 rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/></button>
                  </div>)}<div className="flex justify-end"><button type="button" onClick={() => setSalesExpanded(false)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Next <ChevronUp className="h-4 w-4"/></button></div></>}
                </div>}
                <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 space-y-3">
                  <h4 className="text-xs font-bold text-blue-900">Sales Payment Split · {formatCurrency(salesTotal)}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-slate-700">Cash (%)<select value={salesCashPercentage} onChange={(e) => updateSalesCashPercentage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">{percentageOptions.map((value) => <option key={value} value={String(value)}>{value}%</option>)}</select></label>
                    <label className="block text-xs font-semibold text-slate-700">Online (%)<select value={salesOnlinePercentage} onChange={(e) => updateSalesOnlinePercentage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">{percentageOptions.map((value) => <option key={value} value={String(value)}>{value}%</option>)}</select></label>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-700"><span>Cash: <b>{formatCurrency(salesCash)}</b></span><span>Online: <b>{formatCurrency(salesOnline)}</b></span></div>
                </div>
              </section>

              {/* Counter Purchases */}
              <section className="rounded-xl border border-blue-100 bg-white p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-bold text-slate-900">Counter Purchases</h3><p className="text-xs text-slate-500">Unbilled purchases · {formatCurrency(purchaseTotal)}</p></div>
                  <button type="button" onClick={() => { setPurchaseEntries((rows) => [...rows, makeEntry()]); setPurchasesExpanded(true); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"><Plus className="h-4 w-4"/> Add Purchase</button>
                </div>
                {purchaseEntries.length > 0 && <div className="space-y-2">
                  {!purchasesExpanded && <button type="button" onClick={() => setPurchasesExpanded(true)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 p-2.5 text-xs font-semibold text-slate-700">{purchaseEntries.length} purchase slab(s) · {formatCurrency(purchaseTotal)} <ChevronDown className="h-4 w-4"/></button>}
                  {purchasesExpanded && <>{purchaseEntries.map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(84px,112px)_36px] gap-2 items-end">
                    <label className="text-[11px] font-semibold text-slate-600">Total amount (₹)<IndianAmountInput min="0" step="0.01" value={row.amount} onValueChange={(value) => setPurchaseEntries((rows) => rows.map((item) => item.id === row.id ? {...item, amount:value} : item))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900" placeholder="0.00"/></label>
                    <label className="text-[11px] font-semibold text-slate-600">GST rate<select value={row.gstRate} onChange={(e) => setPurchaseEntries((rows) => rows.map((item) => item.id === row.id ? {...item, gstRate:e.target.value} : item))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900">{['0','0.25','1.5','3','5','12','18','28'].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
                    <button type="button" aria-label="Remove purchase row" onClick={() => setPurchaseEntries((rows) => rows.filter((item) => item.id !== row.id))} className="mb-0.5 rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/></button>
                  </div>)}<div className="flex justify-end"><button type="button" onClick={() => setPurchasesExpanded(false)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Next <ChevronUp className="h-4 w-4"/></button></div></>}
                </div>}
                <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 space-y-3">
                  <h4 className="text-xs font-bold text-blue-900">Purchase Payment Split · {formatCurrency(purchaseTotal)}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-slate-700">Cash (%)<select value={purchaseCashPercentage} onChange={(e) => updatePurchaseCashPercentage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">{percentageOptions.map((value) => <option key={value} value={String(value)}>{value}%</option>)}</select></label>
                    <label className="block text-xs font-semibold text-slate-700">Online (%)<select value={purchaseOnlinePercentage} onChange={(e) => updatePurchaseOnlinePercentage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">{percentageOptions.map((value) => <option key={value} value={String(value)}>{value}%</option>)}</select></label>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-700"><span>Cash: <b>{formatCurrency(purchaseCash)}</b></span><span>Online: <b>{formatCurrency(purchaseOnline)}</b></span></div>
                </div>
              </section>

              {/* Option 3: Write Expense */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-rose-500" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Write Expense</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsExpenseFormOpen(!isExpenseFormOpen)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isExpenseFormOpen ? 'Close Form' : '+ Add Expense'}</span>
                  </button>
                </div>

                {/* Inline Expense Entry Box */}
                {isExpenseFormOpen && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs animate-in fade-in duration-150">
                    <div className="text-[11px] font-bold text-slate-700">Add New Expense Item:</div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold mb-0.5 block">Description / Item</label>
                        <input
                          type="text"
                          value={expenseTitle}
                          onChange={(e) => setExpenseTitle(e.target.value)}
                          className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold mb-0.5 block">Amount (₹)</label>
                        <IndianAmountInput
                          step="any"
                          min="0"
                          value={expenseAmount}
                          onValueChange={setExpenseAmount}
                          className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold mb-0.5 block">Category</label>
                        <select
                          value={expenseCategory}
                          onChange={(e) => setExpenseCategory(e.target.value)}
                          className="w-full bg-white px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-800 focus:outline-none"
                        >
                          <option value="General Store">General Store</option>
                          <option value="Tea & Refreshments">Tea & Refreshments</option>
                          <option value="Travel & Fuel">Travel & Fuel</option>
                          <option value="Electricity & Rent">Electricity & Rent</option>
                          <option value="Salary & Wages">Salary & Wages</option>
                          <option value="Personal Draw">Personal Draw</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold mb-0.5 block">Payment Mode</label>
                        <select
                          value={expensePaymentMode}
                          onChange={(e) => setExpensePaymentMode(e.target.value)}
                          className="w-full bg-white px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-800 focus:outline-none"
                        >
                          <option value="CASH">Cash Drawer</option>
                          <option value="UPI">UPI / Online</option>
                          <option value="BANK">Bank Transfer</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span />
                      <button
                        type="button"
                        onClick={handleAddExpense}
                        disabled={isSubmitting}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? 'Saving...' : 'Add Expense'}
                      </button>
                    </div>
                  </div>
                )}

                {/* List of recorded expenses during this session */}
                {recordedExpenses.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Added Today ({recordedExpenses.length})
                    </span>
                    <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                      {recordedExpenses.map((exp, idx) => (
                        <div key={idx} className="py-1.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-slate-800">{exp.title}</span>
                            <span className="text-[10px] text-slate-400 ml-2">({exp.category})</span>
                          </div>
                          <span className="font-mono font-bold text-rose-600">
                            - {formatCurrency(exp.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs"
                />
              </div>

              {/* Save Daily Report CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save'}</span>
                </button>
              </div>

            </form>
          </div>

        </div>
      </div>
    </div>
  );
};
