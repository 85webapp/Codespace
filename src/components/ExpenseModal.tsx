import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Wallet,
  DollarSign,
  CreditCard,
  Search,
  Filter,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Coffee,
  Fuel,
  Home,
  Users,
  Truck,
  Layers,
  Utensils,
  Wrench,
  FileText,
  Repeat,
} from 'lucide-react';
import { AppSettings, Expense } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { playSuccessTone, triggerHaptic } from '../utils/feedback';

export const EXPENSE_CATEGORIES = [
  { name: 'food', icon: Utensils },
  { name: 'Manufacturing Expense', icon: Wrench },
  { name: 'Petrol', icon: Fuel },
  { name: 'Rent', icon: Home },
  { name: 'Salary', icon: Users },
  { name: 'Tea', icon: Coffee },
  { name: 'Transport', icon: Truck },
  { name: 'Office Expense', icon: FileText },
  { name: 'Miscellaneous', icon: Layers },
];

export const PAYMENT_MODES = [
  { id: 'Cash', label: 'Cash' },
  { id: 'Cheque', label: 'Cheque' },
  { id: 'Bank', label: 'Online / Bank' },
];

interface ExpenseModalProps {
  isOpen: boolean;
  settings: AppSettings;
  language: string;
  onClose: () => void;
  onExpenseAdded?: () => void;
  userMobile?: string;
  initialAddOpen?: boolean;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  settings,
  onClose,
  onExpenseAdded,
  userMobile = '',
  initialAddOpen = false,
}) => {
  // View tabs: 'categories' | 'items' (matching video 00:08 - 00:09)
  const [activeTab, setActiveTab] = useState<'categories' | 'items'>('categories');
  const [isAddFormOpen, setIsAddFormOpen] = useState(initialAddOpen);
  const [isPermanentFormOpen, setIsPermanentFormOpen] = useState(false);
  const [permanentTitle, setPermanentTitle] = useState('');
  const [permanentAmount, setPermanentAmount] = useState('');
  const [permanentCategory, setPermanentCategory] = useState('Rent');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Live Expenses Data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [permanentExpenses, setPermanentExpenses] = useState<Array<{ id: string; title: string; category: string; amount: string | number; active: boolean }>>([]);
  const [overallTotal, setOverallTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual Form State - STRICT MANUAL ENTRY ONLY, NO AI, ALL ENGLISH, BLUE THEME
  const [formCategory, setFormCategory] = useState<string>('food');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(() => new Date().toLocaleDateString('en-GB'));
  const [formPaymentMode, setFormPaymentMode] = useState<string>('Cash');
  const [formNote, setFormNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch expenses from database
  const loadExpenses = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = userMobile ? { 'x-user-mobile': userMobile } : {};
      const res = await apiFetch('/api/expenses', { headers });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses || []);
        setOverallTotal(data.totalAmount || 0);
      }
    } catch (err: any) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPermanentExpenses = async () => {
    try {
      const res = await apiFetch('/api/permanent-expenses');
      if (res.ok) {
        const data = await res.json();
        setPermanentExpenses(data.expenses || []);
      }
    } catch (err) {
      console.error('Failed to load permanent expenses:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadExpenses();
      loadPermanentExpenses();
    }
  }, [isOpen, userMobile]);

  const handleSavePermanentExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(permanentAmount);
    if (!permanentTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Enter an expense name and a valid amount.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/permanent-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: permanentTitle.trim(), amount, category: permanentCategory }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save permanent expense.');
      setPermanentTitle('');
      setPermanentAmount('');
      setIsPermanentFormOpen(false);
      await Promise.all([loadExpenses(), loadPermanentExpenses()]);
      onExpenseAdded?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save permanent expense.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisablePermanentExpense = async (id: string) => {
    if (!window.confirm('Stop posting this permanent expense? Existing entries will remain.')) return;
    try {
      const res = await apiFetch(`/api/permanent-expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadPermanentExpenses();
        onExpenseAdded?.();
      }
    } catch (err) {
      console.error('Failed to disable permanent expense:', err);
    }
  };

  // Handle Manual Form Submission
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(formAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Please enter a valid expense amount.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(userMobile ? { 'x-user-mobile': userMobile } : {}),
      };

      const payload = {
        expense_no: `EXP-${Date.now().toString().slice(-4)}`,
        date: formDate,
        category: formCategory,
        title: formTitle.trim() || formCategory,
        amount: numAmount,
        payment_mode: formPaymentMode.toUpperCase(),
        notes: formNote.trim(),
      };

      const res = await apiFetch('/api/expenses', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        triggerHaptic(28);
        playSuccessTone();
        setFormTitle('');
        setFormAmount('');
        setFormNote('');
        setIsAddFormOpen(false);
        await loadExpenses();
        if (onExpenseAdded) onExpenseAdded();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to save expense.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Delete this expense?')) return;
    triggerHaptic(24);
    try {
      const res = await apiFetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        headers: userMobile ? { 'x-user-mobile': userMobile } : {},
      });
      if (res.ok) {
        await loadExpenses();
        if (onExpenseAdded) onExpenseAdded();
      }
    } catch (err: any) {
      console.error('Delete expense error:', err);
    }
  };

  // Filtered Expense list
  const filteredExpenses = expenses.filter((exp) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = (exp.title || '').toLowerCase().includes(query);
      const matchCat = (exp.category || '').toLowerCase().includes(query);
      if (!matchTitle && !matchCat) return false;
    }
    return true;
  });

  // Calculate Category Totals matching video 00:09
  const categoryStats = EXPENSE_CATEGORIES.map((cat) => {
    const matching = expenses.filter((e) => (e.category || '').toLowerCase() === cat.name.toLowerCase());
    const total = matching.reduce((sum, e) => sum + parseFloat(String(e.amount || '0')), 0);
    return {
      ...cat,
      total,
      count: matching.length,
    };
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div 
        className="w-full max-w-2xl h-[92dvh] flex flex-col rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Top Header Bar (Matching Video 00:08) */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-white shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
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

        {/* Two Tabs: Categories & Items (Matching Video 00:08) */}
        <div className="flex bg-white border-b border-slate-200 px-4 shrink-0">
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'categories'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'items'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Items
          </button>
        </div>

        {/* Total Summary Row (Matching Video 00:09) */}
        <div className="flex items-center justify-between gap-2 py-2 px-4 text-xs shrink-0">
          <span className="text-slate-500 font-medium">Total: <b className="font-mono text-blue-600">{formatCurrency(overallTotal, settings.currency)}</b></span>
          <button type="button" onClick={() => { setErrorMsg(null); setIsPermanentFormOpen(true); }} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 font-semibold text-emerald-800 hover:bg-emerald-100">
            <Repeat className="h-3.5 w-3.5" />
            <span>Add Permanent Expense</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-28 space-y-2">

          {permanentExpenses.some((expense) => expense.active) && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <h2 className="flex items-center gap-2 text-xs font-bold text-emerald-900"><Repeat className="h-4 w-4" /> Permanent Expenses</h2>
              {permanentExpenses.filter((expense) => expense.active).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">{expense.title}</p>
                    <p className="text-[10px] text-slate-500">{expense.category} · daily</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{formatCurrency(expense.amount, settings.currency)}</span>
                    <button type="button" aria-label={`Stop ${expense.title}`} onClick={() => handleDisablePermanentExpense(expense.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </section>
          )}
          
          {/* TAB 1: CATEGORIES (Exact list from video 00:09) */}
          {activeTab === 'categories' && (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden">
              {categoryStats.map((cat, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setFormCategory(cat.name);
                    setIsAddFormOpen(true);
                  }}
                  className="py-3.5 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-semibold text-slate-800">{cat.name}</span>
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {formatCurrency(cat.total, settings.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: ITEMS */}
          {activeTab === 'items' && (
            <div className="space-y-2">
              {filteredExpenses.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs shadow-2xs">
                  No itemized expenses recorded yet. Click "+ Add Expenses" below to create one.
                </div>
              ) : (
                filteredExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900">{exp.title || exp.category}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {exp.date} • {exp.category} • {exp.payment_mode || 'Cash'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {formatCurrency(exp.amount, settings.currency)}
                      </div>
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>

        {/* Floating Action Button: + Add Expenses (Centered, Blue Theme) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setIsAddFormOpen(true)}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/35 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expenses</span>
          </button>
        </div>

        {/* Modal: Add Expense Form (Pure English, Blue Theme) */}
        {isAddFormOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 font-sans">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">Record New Expense</h3>
                <button
                  onClick={() => setIsAddFormOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Expense Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Description / Item</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Amount (₹) *</label>
                    <IndianAmountInput
                      min="0.01"
                      required
                      value={formAmount}
                      onValueChange={setFormAmount}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Date</label>
                    <input
                      type="text"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_MODES.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setFormPaymentMode(pm.id)}
                        className={`py-2 rounded-xl font-bold text-xs border transition-colors cursor-pointer ${
                          formPaymentMode === pm.id
                            ? 'border-blue-600 bg-blue-50 text-blue-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Note (Optional)</label>
                  <input
                    type="text"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddFormOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isPermanentFormOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs">
            <form onSubmit={handleSavePermanentExpense} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Repeat className="h-4 w-4 text-emerald-700" /> Add Permanent Expense</h3>
                <button type="button" aria-label="Close permanent expense form" onClick={() => setIsPermanentFormOpen(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">×</button>
              </div>
              {errorMsg && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{errorMsg}</p>}
              <label className="block text-xs font-semibold text-slate-700">Expense Name
                <input required maxLength={128} value={permanentTitle} onChange={(e) => setPermanentTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">Amount
                <IndianAmountInput required min="0.01" value={permanentAmount} onValueChange={setPermanentAmount} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">Category
                <select value={permanentCategory} onChange={(e) => setPermanentCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
                  {EXPENSE_CATEGORIES.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
                </select>
              </label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setIsPermanentFormOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Permanent Expense'}</button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
