import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Building2,
  Phone,
  MapPin,
  FileText,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Save,
  Percent,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Purchase, CompanyProfile } from '../types';
import { formatCurrency } from '../utils/formatters';
import { playSuccessTone, triggerHaptic } from '../utils/feedback';

export const GST_STATES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

interface ManualPurchaseEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userMobile?: string;
  existingPurchases?: Purchase[];
  company?: CompanyProfile | null;
  onPurchaseAdded?: (purchase: Purchase) => void;
  homeStateCode?: string;
}

export const ManualPurchaseEntryModal: React.FC<ManualPurchaseEntryModalProps> = ({
  isOpen,
  onClose,
  userMobile = '',
  existingPurchases = [],
  company,
  onPurchaseAdded,
  homeStateCode = '07',
}) => {
  // Resolve registered business home state code from metadata profile
  const registeredHomeStateCode = useMemo(() => {
    if (company?.state_code) return String(company.state_code).padStart(2, '0');
    if (company?.gstin && company.gstin.length >= 2) return company.gstin.slice(0, 2);
    if (company?.state) {
      const matched = GST_STATES.find(
        (s) => s.name.toLowerCase() === company.state?.toLowerCase()
      );
      if (matched) return matched.code;
    }
    return homeStateCode || '07';
  }, [company, homeStateCode]);

  // Two-Step Form Progression: Step 1 (Primary 40%) -> Step 2 (Remaining 60%)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Form State
  const [supplierName, setSupplierName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [place, setPlace] = useState('New Delhi');
  const [gstin, setGstin] = useState('');
  const [stateName, setStateName] = useState('Delhi');
  const [stateCode, setStateCode] = useState('07');
  const [invoiceClassification, setInvoiceClassification] = useState<'B2B' | 'B2C' | 'B2G'>('B2B');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toLocaleDateString('en-GB'));
  
  // Tax & Financial Values
  const [taxableValue, setTaxableValue] = useState<number | string>('');
  const [gstRate, setGstRate] = useState<number>(18);
  const [customRateInput, setCustomRateInput] = useState<string>('');
  const [isCustomRateActive, setIsCustomRateActive] = useState<boolean>(false);
  const [taxType, setTaxType] = useState<'CGST_SGST' | 'IGST'>('CGST_SGST');
  const [isReverseCharge, setIsReverseCharge] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK/CHECK'>('CASH');
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [notes, setNotes] = useState('');

  // Dynamic Cache-Buster Cleanup Hook: Wipes all states on open
  const flushManualForm = () => {
    setCurrentStep(1);
    setSupplierName('');
    setMobileNumber('');
    setPlace('New Delhi');
    setGstin('');
    setStateName('Delhi');
    setStateCode('07');
    setInvoiceClassification('B2B');
    setInvoiceNumber(`PB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setInvoiceDate(new Date().toLocaleDateString('en-GB'));
    setTaxableValue('');
    setGstRate(18);
    setCustomRateInput('');
    setIsCustomRateActive(false);
    setIsReverseCharge(false);
    
    // Auto-match tax type based on default Delhi vs registered profile
    if ('07' === registeredHomeStateCode) {
      setTaxType('CGST_SGST');
    } else {
      setTaxType('IGST');
    }

    setPaymentStatus('PAID');
    setPaymentMode('CASH');
    setPaidAmountInput('');
    setNotes('');
    setStatusFeedback(null);
  };

  useEffect(() => {
    if (isOpen) {
      flushManualForm();
    }
  }, [isOpen]);

  // Profile-driven intelligent state tax matching
  const autoMatchStateTax = (targetCode: string) => {
    if (targetCode === registeredHomeStateCode) {
      setTaxType('CGST_SGST'); // Intra-State
    } else {
      setTaxType('IGST'); // Inter-State
    }
  };

  // Auto-Detect State from GSTIN when typed (First 2 digits = GST State Code)
  const handleGstinChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setGstin(clean);

    if (clean.length >= 2) {
      const codePrefix = clean.slice(0, 2);
      const matched = GST_STATES.find((s) => s.code === codePrefix);
      if (matched) {
        setStateCode(matched.code);
        setStateName(matched.name);
        autoMatchStateTax(matched.code);
      }
    }
  };

  // State dropdown change
  const handleStateSelect = (selectedStateName: string) => {
    const matched = GST_STATES.find((s) => s.name === selectedStateName);
    if (matched) {
      setStateName(matched.name);
      setStateCode(matched.code);
      autoMatchStateTax(matched.code);
    } else {
      setStateName(selectedStateName);
    }
  };

  // Common GST rate choices + an explicit custom rate for exceptional cases.
  const staticSlabs = [0, 0.25, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

  const handleSelectStaticSlab = (slab: number) => {
    setGstRate(slab);
    setIsCustomRateActive(false);
    setCustomRateInput('');
  };

  const handleCustomRateChange = (val: string) => {
    setCustomRateInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setGstRate(num);
      setIsCustomRateActive(true);
    } else if (val === '') {
      setGstRate(0);
      setIsCustomRateActive(true);
    }
  };

  // Calculations
  const numericTaxable = parseFloat(String(taxableValue)) || 0;
  const activeRate = gstRate || 0;
  const isInterState = taxType === 'IGST';

  const calculatedCgst = isInterState ? 0 : Math.round(((numericTaxable * (activeRate / 2)) / 100) * 100) / 100;
  const calculatedSgst = isInterState ? 0 : Math.round(((numericTaxable * (activeRate / 2)) / 100) * 100) / 100;
  const calculatedIgst = isInterState ? Math.round(((numericTaxable * activeRate) / 100) * 100) / 100 : 0;
  const totalTax = Math.round((calculatedCgst + calculatedSgst + calculatedIgst) * 100) / 100;
  // Under RCM the supplier invoice is not charged this GST; keep it as a separate tax liability.
  const grandTotal = Math.round((numericTaxable + (isReverseCharge ? 0 : totalTax)) * 100) / 100;

  // Status feedback
  const [saving, setSaving] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Check for duplicate invoice numbers
  const isDuplicate = existingPurchases.some(
    (p) =>
      p.supplier_invoice_no?.trim().toUpperCase() === invoiceNumber.trim().toUpperCase() &&
      (p.supplier_name?.trim().toUpperCase() === supplierName.trim().toUpperCase() ||
        (gstin && p.supplier_gstin?.trim().toUpperCase() === gstin.trim().toUpperCase()))
  );

  // Transition Step 1 -> Step 2
  const handleProceedToStep2 = () => {
    if (!supplierName.trim()) {
      setStatusFeedback({
        type: 'error',
        message: 'Please enter Supplier / Party Name to proceed.',
      });
      return;
    }
    if (!invoiceNumber.trim()) {
      setStatusFeedback({
        type: 'error',
        message: 'Please enter Supplier Invoice Number.',
      });
      return;
    }
    setStatusFeedback(null);
    setCurrentStep(2);
  };

  // Save Purchase Entry
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierName.trim()) {
      setStatusFeedback({
        type: 'error',
        message: 'Please provide Supplier / Party Name.',
      });
      return;
    }

    if (numericTaxable <= 0) {
      setStatusFeedback({
        type: 'error',
        message: 'Taxable value must be greater than zero.',
      });
      return;
    }

    setSaving(true);
    setStatusFeedback(null);

    try {
      const payload = {
        invoice_classification: invoiceClassification,
        supplier_invoice_no: invoiceNumber.trim(),
        date: invoiceDate.trim(),
        due_date: invoiceDate.trim(),
        supplier_id: 'DIRECT_VENDOR',
        supplier_name: supplierName.trim(),
        supplier_gstin: gstin.trim() || 'URP',
        supplier_state: stateName,
        supplier_state_code: stateCode,
        sub_total: numericTaxable,
        cgst_total: isReverseCharge ? 0 : calculatedCgst,
        sgst_total: isReverseCharge ? 0 : calculatedSgst,
        igst_total: isReverseCharge ? 0 : calculatedIgst,
        grand_total: grandTotal,
        is_reverse_charge: isReverseCharge,
        rcm_applicable: isReverseCharge,
        rcm_calculated_tax: isReverseCharge ? totalTax : 0,
        rcm_tax_rate: isReverseCharge ? activeRate : 0,
        is_inter_state: isInterState,
        payment_status: paymentStatus,
        paid_amount: paymentStatus === 'PAID' ? grandTotal : Math.min(grandTotal, Math.max(0, Number(paidAmountInput) || 0)),
        payment_mode: paymentMode,
        notes: notes.trim() || `${invoiceClassification} Inward Inventory`,
        items: [
          {
            name: `${invoiceClassification} Goods / Stock Inward`,
            hsn: '9999',
            qty: 1,
            unit: 'PCS',
            rate: numericTaxable,
            taxable: numericTaxable,
            gstRate: activeRate,
            cgst: isReverseCharge ? 0 : calculatedCgst,
            sgst: isReverseCharge ? 0 : calculatedSgst,
            igst: isReverseCharge ? 0 : calculatedIgst,
            total: grandTotal,
          },
        ],
      };

      const res = await apiFetch('/api/purchases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userMobile ? { 'x-user-mobile': userMobile } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedPurchase = await res.json();
        triggerHaptic(28);
        playSuccessTone();
        setStatusFeedback({
          type: 'success',
          message: `Purchase Bill #${savedPurchase.supplier_invoice_no} (${savedPurchase.supplier_name}) committed successfully!`,
        });

        if (onPurchaseAdded) {
          onPurchaseAdded(savedPurchase);
        }

        setTimeout(() => {
          onClose();
          flushManualForm();
        }, 800);
      } else {
        const errJson = await res.json();
        setStatusFeedback({
          type: 'error',
          message: errJson.error || 'Failed to record purchase entry.',
        });
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: `Network error: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl my-6 bg-white rounded-3xl border border-blue-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
              <Calculator className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Manual Purchase Bill Entry
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {currentStep === 1 ? 'Step 1 of 2: Primary (40%)' : 'Step 2 of 2: Items & Tax (60%)'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Direct statutory purchase voucher entry with automatic state tax routing
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Indicator */}
        <div className="flex border-b border-slate-100 bg-slate-50/60 px-6 py-2.5 items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-1.5 font-bold cursor-pointer ${
                currentStep === 1 ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                currentStep === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
              }`}>1</span>
              <span>Primary Details (40%)</span>
            </button>

            <span className="text-slate-300">→</span>

            <button
              onClick={handleProceedToStep2}
              className={`flex items-center gap-1.5 font-bold cursor-pointer ${
                currentStep === 2 ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                currentStep === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
              }`}>2</span>
              <span>Items, Taxes & Ledger (60%)</span>
            </button>
          </div>

          {currentStep === 2 && (
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Step 1</span>
            </button>
          )}
        </div>

        {/* Feedback Banner */}
        {statusFeedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between shrink-0 ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : statusFeedback.type === 'error'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
              )}
              <span>{statusFeedback.message}</span>
            </div>
            <button onClick={() => setStatusFeedback(null)} className="text-xs opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSavePurchase} className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* ========================================================================= */}
          {/* STEP 1: INITIAL 40% PRIMARY FORM FIELDS                                   */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Supplier & Bill Identification
                </span>
                <span className="text-[11px] text-slate-400">Step 1 of 2</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* 1. Supplier Name */}
                <div className="sm:col-span-2">
                  <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                    <span>Supplier / Party Legal Name</span>
                    <span className="text-blue-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all placeholder:text-slate-400"
                    required
                  />
                </div>

                {/* 2. Invoice Classification Dropdown (MANDATORY REQUIREMENT) */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">
                    Invoice Classification <span className="text-blue-600">*</span>
                  </label>
                  <select
                    value={invoiceClassification}
                    onChange={(e) => setInvoiceClassification(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-blue-300 bg-blue-50/30 text-blue-900 font-extrabold focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="B2B">B2B (Registered Business)</option>
                    <option value="B2C">B2C (Retail / Consumer)</option>
                    <option value="B2G">B2G (Government Entity)</option>
                  </select>
                </div>

                {/* 3. Mobile Number */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">Mobile / Phone</label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* 4. Supplier GSTIN */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">
                    Supplier GSTIN (15-digit)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono font-bold focus:border-blue-600 focus:outline-none uppercase placeholder:normal-case"
                  />
                </div>

                {/* 5. Supplier State */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">State / Province</label>
                  <select
                    value={stateName}
                    onChange={(e) => handleStateSelect(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    {GST_STATES.map((st) => (
                      <option key={st.code} value={st.name}>
                        {st.code} - {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Invoice Number */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">
                    Supplier Invoice No. <span className="text-blue-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono font-bold focus:border-blue-600 focus:outline-none"
                    required
                  />
                </div>

                {/* 7. Invoice Date */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">Voucher Date</label>
                  <input
                    type="text"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* 8. Place of Supply */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">Place of Supply</label>
                  <input
                    type="text"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Duplicate Warning */}
              {isDuplicate && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Notice: A purchase bill with this supplier and invoice number already exists.</span>
                </div>
              )}

              {/* Next Step Button (Bottom of 40%) */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Fill initial 40% details and proceed to items & tax rates.
                </span>

                <button
                  type="button"
                  onClick={handleProceedToStep2}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <span>Next: Tax & Rates (60%)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: REMAINING 60% FORM FIELDS (Items, Taxes, Notes & Save)            */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Back to Step 1 Button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>← Back to Step 1 (Supplier Info)</span>
                </button>
                <span className="text-[11px] text-slate-400">Step 2 of 2: Items & Tax (60%)</span>
              </div>

              {/* Tax Routing Mode: Profile-Driven State Tax Matching */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-extrabold text-blue-900 flex items-center gap-1.5">
                    <span>Tax Selection Routing:</span>
                    <span className="font-bold text-blue-700">
                      {stateCode === registeredHomeStateCode ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-700/80 mt-0.5">
                    Supplier State: <strong>{stateName} ({stateCode})</strong> | Registered Profile State: <strong>Code {registeredHomeStateCode}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTaxType('CGST_SGST')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      taxType === 'CGST_SGST'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Intra-State (CGST+SGST)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxType('IGST')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      taxType === 'IGST'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Inter-State (IGST)
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <input type="checkbox" checked={isReverseCharge} onChange={(e) => setIsReverseCharge(e.target.checked)} className="mt-0.5" />
                <span><strong>Reverse Charge Mechanism (RCM)</strong><br />If enabled, GST is recorded as a separate RCM liability and is not added to the supplier invoice total. Calculated RCM tax: {formatCurrency(totalTax)}.</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* 1. Taxable Value */}
                <div className="sm:col-span-2">
                  <label className="text-slate-700 font-bold block mb-1">
                    Taxable Goods Amount (₹) <span className="text-blue-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                      ₹
                    </span>
                    <IndianAmountInput
                      step="0.01"
                      value={taxableValue}
                      onValueChange={setTaxableValue}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono text-base font-extrabold focus:border-blue-600 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* 2. Payment Status */}
                <div>
                  <label className="text-slate-700 font-bold block mb-1">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => { const next = e.target.value as 'PAID' | 'UNPAID'; setPaymentStatus(next); if (next === 'PAID') setPaidAmountInput(String(grandTotal)); else setPaidAmountInput('0'); }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="PAID">Paid</option>
                    <option value="UNPAID">Unpaid / Partially Paid</option>
                  </select>
                </div>
              </div>

              {paymentStatus === 'UNPAID' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <div>
                    <label className="text-slate-700 font-bold block mb-1">Paid Amount (₹)</label>
                    <IndianAmountInput min="0" max={grandTotal} step="0.01" value={paidAmountInput} onValueChange={setPaidAmountInput} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900" />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-5"><input type="checkbox" checked={Number(paidAmountInput) >= grandTotal && grandTotal > 0} onChange={e=>{ if(e.target.checked){setPaidAmountInput(String(grandTotal));setPaymentStatus('PAID');} else {setPaymentStatus('UNPAID');setPaidAmountInput('0');} }} /> Mark the full bill amount as paid</label>
                  <div className="sm:col-span-2 text-xs text-slate-600">Remaining payable: ₹ {Math.max(0, grandTotal - Math.min(grandTotal, Math.max(0, Number(paidAmountInput) || 0))).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>
              )}

              {(paymentStatus === 'PAID' || Number(paidAmountInput) > 0) && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <label className="text-slate-700 font-bold block mb-2">Payment Mode <span className="text-rose-600">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={()=>setPaymentMode('CASH')} className={`py-2.5 rounded-lg border text-sm font-bold ${paymentMode==='CASH'?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-700'}`}>Cash</button>
                    <button type="button" onClick={()=>setPaymentMode('BANK/CHECK')} className={`py-2.5 rounded-lg border text-sm font-bold ${paymentMode==='BANK/CHECK'?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-700'}`}>Bank / Check</button>
                  </div>
                  {paymentMode === 'BANK/CHECK' && <p className="mt-2 text-xs text-blue-700">The paid amount will be recorded in the Bank Ledger and appear in BRS.</p>}
                </div>
              )}

              {/* 3. Adaptive Percentage Selector Block (STATIC SLABS + DYNAMIC CUSTOM INPUT) */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold block text-xs">
                  GST Tax Rate (%): Select Slab or Type Custom Percentage
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  {staticSlabs.map((slab) => (
                    <button
                      key={slab}
                      type="button"
                      onClick={() => handleSelectStaticSlab(slab)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        !isCustomRateActive && gstRate === slab
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 ring-2 ring-blue-500/20'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {slab}%
                    </button>
                  ))}

                  {/* Dynamic Manual Text Input Field directly adjacent to pre-loaded static slabs */}
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-xs font-bold text-slate-500">Custom:</span>
                    <div className="relative w-28">
                      <input
                        type="number"
                        step="0.01"
                        value={customRateInput}
                        onChange={(e) => handleCustomRateChange(e.target.value)}
                        className={`w-full px-3 py-1.5 pr-6 rounded-xl border text-xs font-mono font-bold focus:outline-none transition-all ${
                          isCustomRateActive
                            ? 'border-blue-600 bg-blue-50/50 text-blue-900 ring-2 ring-blue-500/20'
                            : 'border-slate-300 bg-white text-slate-800'
                        }`}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        %
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tax Breakdown Matrix */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">CGST ({isInterState ? '0%' : `${activeRate / 2}%`})</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{formatCurrency(calculatedCgst)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">SGST ({isInterState ? '0%' : `${activeRate / 2}%`})</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{formatCurrency(calculatedSgst)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">IGST ({isInterState ? `${activeRate}%` : '0%'})</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{formatCurrency(calculatedIgst)}</span>
                </div>
                <div className="text-right">
                  <span className="text-blue-600 block font-extrabold uppercase">Grand Total (₹)</span>
                  <span className="font-mono font-black text-blue-700 text-base">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-slate-700 font-bold block mb-1 text-xs">Voucher Notes / Item Description</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Final Submit Button */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  ← Back to Step 1
                </button>

                <button
                  type="submit"
                  disabled={saving || numericTaxable <= 0}
                  className="px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/25 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Committing...' : '[Save Purchase Entry]'}</span>
                </button>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
};
