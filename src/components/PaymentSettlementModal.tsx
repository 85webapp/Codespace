import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  FileText,
  MapPin,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Landmark,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { AppSettings, User as UserType } from '../types';
import { formatCurrency } from '../utils/formatters';

export type VoucherTypeDirection = 'PAYMENT_IN' | 'PAYMENT_OUT';
export type PaymentMode = 'Cash-Drawer' | 'Bank Ledger';

export interface SettlementEntity {
  id: string;
  name: string;
  phone: string;
  gstin: string;
  address: string;
  current_balance: number;
}

export interface PaymentVoucherRecord {
  voucher_id: string;
  tenant_mobile_id: string;
  party_id?: string;
  party_name: string;
  party_phone?: string;
  party_gstin?: string;
  party_address?: string;
  voucher_type_direction: VoucherTypeDirection;
  base_amount_paid: number;
  net_balance_snapshot: number;
  balance_after_settlement: number;
  payment_mode: PaymentMode;
  notes?: string;
  date: string;
  created_at: string;
}

interface PaymentSettlementModalProps {
  isOpen: boolean;
  initialDirection?: VoucherTypeDirection;
  currentUser: UserType | null;
  settings: AppSettings;
  onClose: () => void;
  onSettlementSaved?: () => void;
}

export const PaymentSettlementModal: React.FC<PaymentSettlementModalProps> = ({
  isOpen,
  initialDirection = 'PAYMENT_IN',
  currentUser,
  settings,
  onClose,
  onSettlementSaved,
}) => {
  // Active Direction: strictly 'PAYMENT_IN' or 'PAYMENT_OUT'
  const [direction, setDirection] = useState<VoucherTypeDirection>(initialDirection);

  // Entities loaded from Neon PostgreSQL
  const [debtors, setDebtors] = useState<SettlementEntity[]>([]);
  const [creditors, setCreditors] = useState<SettlementEntity[]>([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState<boolean>(false);

  // Search & Autocomplete Overlay State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);

  // Selected Entity Locked Metadata Fields (Pillars 1 & 2)
  const [selectedEntity, setSelectedEntity] = useState<SettlementEntity | null>(null);

  // Variable Ingestion Payment Tracker Fields
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash-Drawer');
  const [voucherNotes, setVoucherNotes] = useState<string>('');
  const [voucherDate, setVoucherDate] = useState<string>(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  });

  // Submission & Feedback UI State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastVoucherResult, setLastVoucherResult] = useState<PaymentVoucherRecord | null>(null);

  // User auth token header context (Pillar 3: Multi-Device Partition Isolation Key Validation)
  const authHeaders: Record<string, string> = useMemo(() => {
    const headers: Record<string, string> = {};
    if (currentUser?.mobile) {
      headers['x-user-mobile'] = currentUser.mobile;
    }
    return headers;
  }, [currentUser?.mobile]);

  // =========================================================================
  // PILLAR 3: CRITICAL ANTI-CACHE FLUSHING HOOK (The 0% Data Mirror Glitch Fix)
  // Forcefully flushes transient component state arrays, wipes all inputs
  // to absolute blank empty null condition state BEFORE fresh entry loads.
  // =========================================================================
  const executeAntiCacheStatePurge = () => {
    setSearchQuery('');
    setSelectedEntity(null);
    setAmountPaidInput('');
    setPaymentMode('Cash-Drawer');
    setVoucherNotes('');
    setIsDropdownOpen(false);
    setErrorMessage(null);
    // keep date updated to fresh date
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    setVoucherDate(`${day}/${month}/${year}`);
  };

  // Fetch verified active debtors / creditors on mount or direction toggle
  const fetchSettlementEntities = async () => {
    setIsLoadingEntities(true);
    try {
      if (direction === 'PAYMENT_IN') {
        const res = await apiFetch('/api/settlements/debtors', { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setDebtors(data.debtors || []);
        }
      } else {
        const res = await apiFetch('/api/settlements/creditors', { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setCreditors(data.creditors || []);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load settlement entities:', err.message);
    } finally {
      setIsLoadingEntities(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchSettlementEntities();
  }, [isOpen, direction, currentUser?.mobile]);

  // Click outside listener for the instant autocomplete overlay
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Direction Switch Handler (purges all inputs)
  const handleDirectionSwitch = (newDir: VoucherTypeDirection) => {
    if (newDir !== direction) {
      executeAntiCacheStatePurge();
      setSuccessMessage(null);
      setLastVoucherResult(null);
      setDirection(newDir);
    }
  };

  // Character Filter Logic with Strict Regex Routing
  const activeEntitiesList = direction === 'PAYMENT_IN' ? debtors : creditors;

  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) {
      return activeEntitiesList;
    }
    try {
      const escaped = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      return activeEntitiesList.filter(
        (entity) => regex.test(entity.name) || regex.test(entity.phone) || regex.test(entity.gstin)
      );
    } catch {
      return activeEntitiesList.filter((entity) =>
        entity.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
  }, [activeEntitiesList, searchQuery]);

  // Selection Handler: Dynamically locks and allocates metadata fields
  const handleSelectEntity = (entity: SettlementEntity) => {
    setSelectedEntity(entity);
    setSearchQuery(entity.name);
    setIsDropdownOpen(false);
    setErrorMessage(null);
  };

  // Dynamic Real-Time Balance Reduction Calculation
  const totalDueAmount = selectedEntity ? selectedEntity.current_balance : 0;
  const parsedAllocationAmount = parseFloat(amountPaidInput || '0');
  const validAllocation = !isNaN(parsedAllocationAmount) && parsedAllocationAmount > 0;
  const remainingBalanceAfterSettlement = Math.max(
    0,
    totalDueAmount - (validAllocation ? parsedAllocationAmount : 0)
  );

  // =========================================================================
  // SUBMIT HANDLER: [Confirm and Save Payment Voucher]
  // =========================================================================
  const handleConfirmAndSaveVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedEntity) {
      setErrorMessage(
        direction === 'PAYMENT_IN'
          ? 'Please search and select a customer holding an active due balance.'
          : 'Please search and select a vendor holding an active credit liability.'
      );
      return;
    }

    if (!validAllocation) {
      setErrorMessage('Please enter a valid allocation payment amount greater than ₹0.00.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiFetch('/api/settlements/voucher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          voucher_type_direction: direction,
          party_id: selectedEntity.id,
          party_name: selectedEntity.name,
          party_phone: selectedEntity.phone,
          party_gstin: selectedEntity.gstin,
          party_address: selectedEntity.address,
          base_amount_paid: parsedAllocationAmount,
          payment_mode: paymentMode,
          notes: voucherNotes.trim(),
          date: voucherDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to confirm payment voucher');
      }

      // Record successful voucher snapshot
      setLastVoucherResult(data.voucher);
      setSuccessMessage(
        direction === 'PAYMENT_IN'
          ? `✓ Customer Receipt #${data.voucher.voucher_id} confirmed and saved! ₹${parsedAllocationAmount.toLocaleString(
              'en-IN'
            )} received.`
          : `✓ Vendor Payment #${data.voucher.voucher_id} confirmed and saved! ₹${parsedAllocationAmount.toLocaleString(
              'en-IN'
            )} paid.`
      );

      // Trigger parent callback
      if (onSettlementSaved) {
        onSettlementSaved();
      }

      // Re-fetch updated ledger list to reflect fresh balance reduction in database
      await fetchSettlementEntities();

      // =====================================================================
      // PILLAR 3: ABSOLUTE ANTI-CACHE FLUSHING EXECUTION
      // The precise millisecond the operator saves, purge staging variables,
      // wipe interactive form input contents to an absolute blank empty null
      // condition state BEFORE a fresh voucher entry loads.
      // =====================================================================
      executeAntiCacheStatePurge();
    } catch (err: any) {
      setErrorMessage(err.message || 'System was unable to commit payment voucher.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 font-sans">
      {/* Premium White Canvas Container */}
      <div
        className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* HEADER BAR: Pure White Background with Corporate Blue Accents     */}
        {/* ================================================================= */}
        <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                direction === 'PAYMENT_IN'
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
              }`}
            >
              {direction === 'PAYMENT_IN' ? (
                <ArrowDownLeft className="w-5 h-5" />
              ) : (
                <ArrowUpRight className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {direction === 'PAYMENT_IN'
                  ? 'Payment In (Customer Receipts)'
                  : 'Payment Out (Vendor Payments)'}
              </h2>
              <p className="text-xs text-slate-500">
                Multi-Tenant Account Settlement & Balance Reduction Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Direction Switcher Tabs (Strict White Base & Blue Accents) */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 p-1.5 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleDirectionSwitch('PAYMENT_IN')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              direction === 'PAYMENT_IN'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Payment In (Customer Receipt)</span>
          </button>

          <button
            type="button"
            onClick={() => handleDirectionSwitch('PAYMENT_OUT')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              direction === 'PAYMENT_OUT'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Payment Out (Vendor Payment)</span>
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs flex items-center gap-2 shrink-0 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 font-medium shrink-0 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* ================================================================= */}
        {/* SCROLLABLE FORM BODY CANVAS                                       */}
        {/* ================================================================= */}
        <div className="p-6 overflow-y-auto space-y-4">
          <form onSubmit={handleConfirmAndSaveVoucher} className="space-y-4">
            
            {/* =============================================================== */}
            {/* 1. HIGH-PRIORITY SMART AUTOCOMPLETE SEARCH LOOKUP               */}
            {/* =============================================================== */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  {direction === 'PAYMENT_IN' ? 'Enter Customer Name' : 'Enter Vendor / Supplier Name'}
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  {isLoadingEntities
                    ? 'Syncing active accounts...'
                    : `${activeEntitiesList.length} active account${activeEntitiesList.length === 1 ? '' : 's'} with balance`}
                </span>
              </label>

              <div className="relative">
                <input
                  ref={inputSearchRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                    if (selectedEntity && e.target.value !== selectedEntity.name) {
                      setSelectedEntity(null);
                    }
                  }}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-400 placeholder:font-normal"
                  autoComplete="off"
                  required
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Instant Dropdown Panel Overlay */}
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-50 divide-y divide-slate-100 animate-in fade-in duration-100">
                  {filteredEntities.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      {activeEntitiesList.length === 0
                        ? `No ${direction === 'PAYMENT_IN' ? 'debtor customers' : 'creditor vendors'} with active balance found.`
                        : `No matching records found for "${searchQuery}".`}
                    </div>
                  ) : (
                    filteredEntities.map((entity) => (
                      <div
                        key={entity.id}
                        onClick={() => handleSelectEntity(entity)}
                        className="p-3 hover:bg-blue-50/70 transition-colors cursor-pointer flex items-center justify-between group text-xs"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 truncate">
                            {entity.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            {entity.phone && <span>Mob: +91 {entity.phone}</span>}
                            <span>•</span>
                            <span className="font-mono">GSTIN: {entity.gstin}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono font-bold text-blue-600">
                            {formatCurrency(entity.current_balance, settings.currency)}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">
                            {direction === 'PAYMENT_IN' ? 'Due Receivable' : 'Credit Liability'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* =============================================================== */}
            {/* 2. AUTOMATED CONDITIONAL FORM ALLOCATION BLOCK (LOCKED METADATA) */}
            {/* =============================================================== */}
            {selectedEntity ? (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Verified Account Ledger Snapshot</span>
                  </div>
                  {/* Current Total Outstanding Due Balance: Rendered in bold context text */}
                  <div className="text-right">
                    <span className="text-xs text-slate-500 font-semibold mr-1.5">
                      {direction === 'PAYMENT_IN' ? 'Total Amount Due:' : 'Total Outstanding Credit Liability Owed:'}
                    </span>
                    <span className="text-sm font-black font-mono text-blue-700 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 shadow-2xs">
                      {formatCurrency(selectedEntity.current_balance, settings.currency)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  {/* Verified Customer Mobile Number (Max 10-digit text string) */}
                  <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-200">
                    <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-slate-500">Mobile:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedEntity.phone ? `+91 ${selectedEntity.phone}` : 'Unregistered Mobile'}
                    </span>
                  </div>

                  {/* Registered GSTIN (Forced output 'URP' if unregistered) */}
                  <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-200">
                    <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-slate-500">GSTIN:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedEntity.gstin || 'URP'}
                    </span>
                  </div>

                  {/* Complete Registered Business Address parameter logs */}
                  <div className="sm:col-span-2 flex items-start gap-1.5 bg-white p-2 rounded-lg border border-slate-200">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span className="text-slate-500">Address:</span>
                    <span className="font-medium text-slate-800 truncate">
                      {selectedEntity.address || 'Registered Business Address on File'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-xs text-center">
                Select an entity above to automatically allocate and lock metadata registers.
              </div>
            )}

            {/* =============================================================== */}
            {/* 3. VARIABLE INGESTION PAYMENT TRACKER FIELD                     */}
            {/* =============================================================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Editable Decimal Currency Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>
                    {direction === 'PAYMENT_IN' ? 'Amount Received / Payment In' : 'Amount Paid / Payment Out'} *
                  </span>
                  {selectedEntity && (
                    <button
                      type="button"
                      onClick={() => setAmountPaidInput(String(selectedEntity.current_balance))}
                      className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                    >
                      Settle Full Amount
                    </button>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    ₹
                  </span>
                  <IndianAmountInput
                    step="any"
                    min="0.01"
                    value={amountPaidInput}
                    onValueChange={setAmountPaidInput}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-base font-bold focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-300"
                    required
                  />
                </div>
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Voucher Transaction Date
                </label>
                <input
                  type="text"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-mono focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>
            </div>

            {/* Payment Mode Selection: [Cash-Drawer, Bank Ledger] */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-blue-600" />
                Payment Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMode('Cash-Drawer')}
                  className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMode === 'Cash-Drawer'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <span>Cash-Drawer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('Bank Ledger')}
                  className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMode === 'Bank Ledger'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Landmark className="w-4 h-4 text-blue-600" />
                  <span>Bank Ledger</span>
                </button>
              </div>
            </div>

            {/* Optional Narration / Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Settlement Narration / Notes (Optional)
              </label>
              <input
                type="text"
                value={voucherNotes}
                onChange={(e) => setVoucherNotes(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* =============================================================== */}
            {/* 4. REAL-TIME BALANCE REDUCTION CALCULATION BANNER               */}
            {/* =============================================================== */}
            {selectedEntity && (
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-900 text-xs flex items-center justify-between animate-in fade-in">
                <div>
                  <div className="text-[11px] font-semibold text-emerald-700">
                    {direction === 'PAYMENT_IN'
                      ? 'Remaining Balance Due After Settlement:'
                      : 'Remaining Credit Liability After Settlement:'}
                  </div>
                  <div className="text-base font-black font-mono text-emerald-800 mt-0.5">
                    {formatCurrency(remainingBalanceAfterSettlement, settings.currency)}
                  </div>
                </div>

                <div className="text-right text-[11px] text-emerald-700">
                  {validAllocation && parsedAllocationAmount >= totalDueAmount ? (
                    <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-1 rounded-md border border-emerald-300">
                      100% Fully Cleared
                    </span>
                  ) : (
                    <span>
                      Allocation: <strong>{formatCurrency(parsedAllocationAmount || 0, settings.currency)}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* ACTION BUTTON: [Confirm and Save Payment Voucher]                */}
            {/* =============================================================== */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !selectedEntity || !validAllocation}
                className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Committing to Neon DB...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>[Confirm and Save Payment Voucher]</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
