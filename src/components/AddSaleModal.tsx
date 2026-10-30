import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  ChevronDown,
  Settings as SettingsIcon,
  Check,
  Building2,
  Phone,
  User,
  ArrowLeft,
  DollarSign,
  FileText,
  Paperclip,
  ChevronRight,
  Info,
  Layers,
  Percent,
} from 'lucide-react';
import { AppSettings, Party, InvoiceItem, Invoice, CompanyProfile } from '../types';
import { Language } from '../utils/translations';
import { formatCurrency } from '../utils/formatters';
import { GST_STATES } from './ManualPurchaseEntryModal';
import { playSuccessTone, triggerHaptic } from '../utils/feedback';

export const ITEM_UNITS = [
  { code: 'BAG', label: 'BAGS (Bag)' },
  { code: 'BTL', label: 'BOTTLES (Btl)' },
  { code: 'BOX', label: 'BOX (Box)' },
  { code: 'BDL', label: 'BUNDLES (Bdl)' },
  { code: 'CAN', label: 'CANS (Can)' },
  { code: 'CTN', label: 'CARTONS (Ctn)' },
  { code: 'MTQ', label: 'CUBIC METER (Mtq)' },
  { code: 'DAY', label: 'DAY (Day)' },
  { code: 'DZN', label: 'DOZENS (Dzn)' },
  { code: 'HUR', label: 'HOUR (Hur)' },
  { code: 'KGS', label: 'KILOGRAMS (Kgs)' },
  { code: 'KMT', label: 'KILOMETER (Kmt)' },
  { code: 'LTR', label: 'LITRE (Ltr)' },
  { code: 'MTR', label: 'METERS (Mtr)' },
  { code: 'ML', label: 'MILLILITRE (Ml)' },
  { code: 'NOS', label: 'NUMBERS (Nos)' },
  { code: 'PAC', label: 'PACKS (Pac)' },
  { code: 'PRS', label: 'PAIRS (Prs)' },
  { code: 'PCS', label: 'PIECES (Pcs)' },
  { code: 'QTL', label: 'QUINTAL (Qtl)' },
  { code: 'ROL', label: 'ROLLS (Rol)' },
  { code: 'SER', label: 'SERVICE (Ser)' },
  { code: 'SET', label: 'SET (Set)' },
  { code: 'SQF', label: 'SQUARE FEET (Sqf)' },
  { code: 'SQM', label: 'SQUARE METERS (Sqm)' },
  { code: 'TBS', label: 'TABLETS (Tbs)' },
  { code: 'TON', label: 'TON / Metric Ton (Ton)' },
  { code: 'UNT', label: 'UNIT (Unt)' },
];

// Common GST rate choices. These are selectable per bill/item; 17% and 20% are not standard GST slabs, so they are intentionally not presented as GST rates.
const GST_RATE_VALUES = [0, 0.25, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
export const TAX_RATES = [
  { label: 'None', rate: 0, isIgst: false },
  { label: 'Exempted', rate: 0, isIgst: false },
  ...GST_RATE_VALUES.flatMap((rate) => [
    { label: `GST@${rate}%`, rate, isIgst: false },
    { label: `IGST@${rate}%`, rate, isIgst: true },
  ]),
];

interface AddSaleModalProps {
  isOpen: boolean;
  settings: AppSettings;
  language: Language;
  parties: Party[];
  company?: CompanyProfile | null;
  currentUser?: any;
  invoicesCount?: number;
  onClose: () => void;
  onSubmitSale: (saleData: any) => Promise<void>;
}

export const AddSaleModal: React.FC<AddSaleModalProps> = ({
  isOpen,
  settings,
  language,
  parties,
  company,
  currentUser,
  invoicesCount = 0,
  onClose,
  onSubmitSale,
}) => {
  // Client's home-state registry code permanently recorded as State Code: "09", State Name: "Uttar Pradesh"
  const HOME_STATE = { code: '09', name: 'Uttar Pradesh' };
  const supplierState = HOME_STATE;

  // Derive default prefix logic:
  // "COT" followed by "-" then first 3 characters of supplier business name or login name then "-"
  const defaultPrefixString = useMemo(() => {
    let namePart = 'a';
    if (company?.trade_name || company?.name) {
      const clean = (company.trade_name || company.name).replace(/[^a-zA-Z0-9]/g, '');
      if (clean.length > 0) namePart = clean.substring(0, 3).toLowerCase();
    } else if (currentUser?.name) {
      const clean = currentUser.name.replace(/[^a-zA-Z0-9]/g, '');
      if (clean.length > 0) namePart = clean.substring(0, 3).toLowerCase();
    }
    return `cot-${namePart}-`;
  }, [company, currentUser]);

  // Prefix and sequence are remembered separately for every account
  const storageUser = currentUser?.mobile || 'guest';
  const prefixKey = `cotrix_invoice_prefix_${storageUser}`;
  const seqKey = `cotrix_invoice_seq_${storageUser}`;

  // Load saved prefix from localStorage or use default
  const [activePrefix, setActivePrefix] = useState<string>(() => {
    return localStorage.getItem(prefixKey) || defaultPrefixString;
  });

  // Invoice Sequence Number
  const [seqNumber, setSeqNumber] = useState<number>(() => {
    const savedSeq = localStorage.getItem(seqKey);
    if (savedSeq) {
      const n = parseInt(savedSeq, 10);
      if (!isNaN(n)) return n;
    }
    return Math.max(1, invoicesCount + 1);
  });

  // Top Sale Type Toggle: Credit vs Cash
  const [saleType, setSaleType] = useState<'CREDIT' | 'CASH'>('CASH');

  // Prefix selector dropdown state
  const [isPrefixMenuOpen, setIsPrefixMenuOpen] = useState(false);
  const [isAddPrefixModalOpen, setIsAddPrefixModalOpen] = useState(false);
  const [newPrefixInput, setNewPrefixInput] = useState('');

  // Date
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  });

  // Customer Details - ZERO-STATE DETERMINISTIC (No fake initial names or phones)
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerPincode, setCustomerPincode] = useState<string>('');
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [showPartySuggestions, setShowPartySuggestions] = useState(false);

  // RCM (Reverse Charge Mechanism) State - Empty by default, no phantom values
  const [isRcmActive, setIsRcmActive] = useState<boolean>(false);
  const [rcmRate, setRcmRate] = useState<string>('');

  // Standalone Tax Determination & Override Control State (Part 2 requirement)
  const [taxRoutingMode, setTaxRoutingMode] = useState<'AUTO' | 'INTRA' | 'INTER'>('AUTO');

  // Items in the sale (Zero-State Blank)
  const [items, setItems] = useState<InvoiceItem[]>([]);

  // Direct manual total fallback if no items are added
  const [directTotalAmount, setDirectTotalAmount] = useState<string>('');
  const [directPurchaseCost, setDirectPurchaseCost] = useState<string>('');

  // "Add Items to Sale" drawer / modal state
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  // Form states inside Item Drawer
  const [drawerItemName, setDrawerItemName] = useState('');
  const [drawerHsn, setDrawerHsn] = useState('');
  const [drawerPurchaseRate, setDrawerPurchaseRate] = useState<string>('');
  const [drawerQty, setDrawerQty] = useState<number>(1);
  const [drawerUnit, setDrawerUnit] = useState<string>('PIECES (Pcs)');
  const [drawerRate, setDrawerRate] = useState<number>(0);
  const [drawerRateType, setDrawerRateType] = useState<'WITHOUT_TAX' | 'WITH_TAX'>('WITHOUT_TAX');
  const [drawerDiscount, setDrawerDiscount] = useState<number>(0);
  const [drawerTaxRate, setDrawerTaxRate] = useState<number>(18);
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isTaxSelectorOpen, setIsTaxSelectorOpen] = useState(false);

  // Payment Details
  const [isReceivedChecked, setIsReceivedChecked] = useState<boolean>(false);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CHEQUE' | 'BANK'>('CASH');
  const [isPaymentTypeModalOpen, setIsPaymentTypeModalOpen] = useState(false);
  const [paymentRefNo, setPaymentRefNo] = useState<string>('');

  // State of Supply (Inter-state vs Intra-state) - default to client's registered home-base profile state (09-Uttar Pradesh)
  const [stateOfSupply, setStateOfSupply] = useState<string>(() => `${HOME_STATE.code}-${HOME_STATE.name}`);
  const [isStateModalOpen, setIsStateModalOpen] = useState(false);

  // Description / Notes & Terms
  const [description, setDescription] = useState<string>('');
  const [termsAndConditions, setTermsAndConditions] = useState<string>(
    '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if bill is not paid on due date.'
  );
  const [showTerms, setShowTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Full computed invoice number string e.g. "cot-a-1"
  const fullInvoiceNumber = useMemo(() => {
    if (activePrefix === 'NONE' || !activePrefix) {
      return String(seqNumber);
    }
    return `${activePrefix}${seqNumber}`;
  }, [activePrefix, seqNumber]);

  // Strict POS & Tax Determination State Engine
  const isInterState = useMemo(() => {
    if (taxRoutingMode === 'INTRA') return false;
    if (taxRoutingMode === 'INTER') return true;
    const supplyCode = stateOfSupply.substring(0, 2);
    return supplyCode !== HOME_STATE.code;
  }, [taxRoutingMode, stateOfSupply]);

  // Auto-calculate Subtotal, Taxes, and Grand Total with RCM Support
  const { subTotal, totalCgst, totalSgst, totalIgst, grandTotal, rcmTaxAmount } = useMemo(() => {
    let sub = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (items.length === 0) {
      const direct = parseFloat(directTotalAmount) || 0;
      sub = direct;
      if (direct > 0 && !isRcmActive) {
        const base = Math.round((direct / 1.18) * 100) / 100;
        const tax = Math.round((direct - base) * 100) / 100;
        sub = base;
        if (isInterState) {
          igst = tax;
        } else {
          cgst = Math.round((tax / 2) * 100) / 100;
          sgst = Math.round((tax / 2) * 100) / 100;
        }
      }
    } else {
      items.forEach((item) => {
        sub += item.taxable;
        if (!isRcmActive) {
          const gstRate = item.gstRate || 18;
          const itemTax = (item.taxable * gstRate) / 100;
          if (isInterState) {
            igst += itemTax;
          } else {
            cgst += itemTax / 2;
            sgst += itemTax / 2;
          }
        }
      });
    }

    const roundedSub = Math.round(sub * 100) / 100;

    if (isRcmActive) {
      const parsedRate = parseFloat(rcmRate) || 0;
      const rcmTax = Math.round(((roundedSub * parsedRate) / 100) * 100) / 100;
      return {
        subTotal: roundedSub,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        rcmTaxAmount: rcmTax,
        grandTotal: roundedSub,
      };
    }

    const roundedCgst = Math.round(cgst * 100) / 100;
    const roundedSgst = Math.round(sgst * 100) / 100;
    const roundedIgst = Math.round(igst * 100) / 100;
    const total = Math.round(roundedSub + roundedCgst + roundedSgst + roundedIgst);

    return {
      subTotal: roundedSub,
      totalCgst: roundedCgst,
      totalSgst: roundedSgst,
      totalIgst: roundedIgst,
      rcmTaxAmount: 0,
      grandTotal: total,
    };
  }, [items, directTotalAmount, isInterState, isRcmActive, rcmRate]);

  // Balance Due calculation
  const numericReceived = useMemo(() => {
    if (!isReceivedChecked) return 0;
    const val = parseFloat(receivedAmount);
    return isNaN(val) ? 0 : val;
  }, [isReceivedChecked, receivedAmount]);

  const balanceDue = useMemo(() => {
    const bal = grandTotal - numericReceived;
    return Math.max(0, Math.round(bal * 100) / 100);
  }, [grandTotal, numericReceived]);

  // Party Selection Handler
  const handleSelectParty = (p: Party) => {
    setCustomerName(p.name);
    setCustomerPhone(p.phone || '');
    setCustomerGstin(p.gstin || '');
    setCustomerAddress(p.billing_address || '');
    setCustomerPincode(p.pincode || '');
    setSelectedPartyId(p.id);
    if (p.state_code && p.state) {
      setStateOfSupply(`${p.state_code}-${p.state}`);
    }
    setShowPartySuggestions(false);
  };

  // Add Item Drawer Logic
  const handleOpenAddItemDrawer = () => {
    setDrawerItemName('');
    setDrawerHsn('');
    setDrawerPurchaseRate('');
    setDrawerQty(1);
    setDrawerUnit('PIECES (Pcs)');
    setDrawerRate(0);
    setDrawerRateType('WITHOUT_TAX');
    setDrawerDiscount(0);
    setDrawerTaxRate(18);
    setEditingItemIndex(null);
    setIsItemDrawerOpen(true);
  };

  const handleEditItem = (index: number) => {
    const item = items[index];
    setDrawerItemName(item.name);
    setDrawerHsn(item.hsn || '');
    setDrawerPurchaseRate(item.purchase_rate !== undefined ? String(item.purchase_rate) : '');
    setDrawerQty(item.qty);
    setDrawerUnit(item.unit || 'PIECES (Pcs)');
    setDrawerRate(item.rate);
    setDrawerRateType('WITHOUT_TAX');
    setDrawerDiscount(item.discountPercent || 0);
    setDrawerTaxRate(item.gstRate || 18);
    setEditingItemIndex(index);
    setIsItemDrawerOpen(true);
  };

  const handleSaveItemFromDrawer = (openNew: boolean = false) => {
    if (!drawerItemName.trim()) {
      alert('Please enter an item name.');
      return;
    }

    const qty = drawerQty > 0 ? drawerQty : 1;
    let baseRate = drawerRate > 0 ? drawerRate : 0;

    // If rate was entered inclusive of tax, back-calculate base
    if (drawerRateType === 'WITH_TAX') {
      baseRate = baseRate / (1 + drawerTaxRate / 100);
    }

    const gross = qty * baseRate;
    const discAmount = (gross * (drawerDiscount || 0)) / 100;
    const taxable = Math.round((gross - discAmount) * 100) / 100;
    const taxAmt = Math.round(((taxable * drawerTaxRate) / 100) * 100) / 100;
    const total = Math.round((taxable + taxAmt) * 100) / 100;

    const newItem: InvoiceItem = {
      name: drawerItemName.trim(),
      hsn: drawerHsn.trim() || '8517',
      qty,
      unit: drawerUnit,
      rate: Math.round(baseRate * 100) / 100,
      purchase_rate: parseFloat(drawerPurchaseRate) || 0,
      discountPercent: drawerDiscount,
      taxable,
      gstRate: drawerTaxRate,
      cgst: isInterState ? 0 : taxAmt / 2,
      sgst: isInterState ? 0 : taxAmt / 2,
      igst: isInterState ? taxAmt : 0,
      total,
    };

    if (editingItemIndex !== null) {
      const updated = [...items];
      updated[editingItemIndex] = newItem;
      setItems(updated);
    } else {
      setItems([...items, newItem]);
    }

    if (openNew) {
      setDrawerItemName('');
      setDrawerHsn('');
      setDrawerPurchaseRate('');
      setDrawerQty(1);
      setDrawerDiscount(0);
      setEditingItemIndex(null);
    } else {
      setIsItemDrawerOpen(false);
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Add Custom Prefix
  const handleAddNewPrefix = () => {
    if (!newPrefixInput.trim()) return;
    const formatted = newPrefixInput.trim().endsWith('-')
      ? newPrefixInput.trim()
      : `${newPrefixInput.trim()}-`;
    setActivePrefix(formatted);
    localStorage.setItem(prefixKey, formatted);
    setNewPrefixInput('');
    setIsAddPrefixModalOpen(false);
    setIsPrefixMenuOpen(false);
  };

  // Puts every field back to blank so a new bill never starts with the previous bill's data
  const resetFormForNewBill = () => {
    const today = new Date();
    setInvoiceDate(
      `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    );
    setSaleType('CASH');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
    setCustomerAddress('');
    setCustomerPincode('');
    setSelectedPartyId('');
    setShowPartySuggestions(false);
    setIsRcmActive(false);
    setTaxRoutingMode('AUTO');
    setItems([]);
    setDirectTotalAmount('');
    setDirectPurchaseCost('');
    setIsItemDrawerOpen(false);
    setEditingItemIndex(null);
    setIsReceivedChecked(false);
    setReceivedAmount('');
    setPaymentType('CASH');
    setPaymentRefNo('');
    setStateOfSupply(`${HOME_STATE.code}-${HOME_STATE.name}`);
    setDescription('');
    setShowTerms(false);
    setActivePrefix(localStorage.getItem(prefixKey) || defaultPrefixString);
    // Next invoice number for this account
    const savedSeq = parseInt(localStorage.getItem(seqKey) || '0', 10);
    setSeqNumber(Math.max(isNaN(savedSeq) ? 0 : savedSeq, invoicesCount + 1, 1));
  };

  // Every time the form is opened it starts blank
  useEffect(() => {
    if (isOpen) resetFormForNewBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Save Sale & Commit to Database
  const handleSaveInvoice = async (saveAndNew: boolean = false) => {
    if (submitting) return;
    if (!customerName.trim()) {
      alert('Please enter a customer name.');
      return;
    }

    setSubmitting(true);
    try {
      const calculatedPurchaseCost = items.length > 0
        ? items.reduce((sum, it) => sum + ((it.purchase_rate || 0) * (it.qty || 1)), 0)
        : (parseFloat(directPurchaseCost) || 0);

      const invoicePayload = {
        type: saleType === 'CASH' ? 'CASH_MEMO' : 'TAX_INVOICE',
        invoice_number: fullInvoiceNumber,
        date: invoiceDate,
        due_date: invoiceDate,
        party_id: selectedPartyId || 'CASH_CUSTOMER',
        party_name: customerName.trim(),
        party_phone: customerPhone.trim(),
        party_gstin: customerGstin.trim(),
        party_address: customerAddress.trim(),
        party_pincode: customerPincode.trim(),
        party_state: stateOfSupply.split('-')[1] || 'Delhi',
        party_state_code: stateOfSupply.split('-')[0] || '07',
        place_of_supply: stateOfSupply,
        is_inter_state: isInterState,
        is_reverse_charge: false,
        items,
        sub_total: subTotal,
        cgst_total: totalCgst,
        sgst_total: totalSgst,
        igst_total: totalIgst,
        round_off: 0,
        grand_total: grandTotal,
        paid_amount: numericReceived,
        balance_amount: balanceDue,
        payment_mode: paymentType,
        payment_status: balanceDue <= 0 ? 'PAID' : numericReceived > 0 ? 'PARTIAL' : 'UNPAID',
        total_purchase_cost: calculatedPurchaseCost,
        notes: description.trim() || `Payment Ref: ${paymentRefNo}`,
        terms_and_conditions: termsAndConditions,
      };

      await onSubmitSale(invoicePayload);
      triggerHaptic(28);
      playSuccessTone();

      // Auto-increment sequence number for the next bill
      const nextSeq = seqNumber + 1;
      setSeqNumber(nextSeq);
      localStorage.setItem(seqKey, String(nextSeq));

      if (saveAndNew) {
        // Fresh blank form for the next invoice
        resetFormForNewBill();
        setSeqNumber(nextSeq);
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error('Failed saving invoice:', err);
      alert(`Error saving invoice: ${err.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Save as Quotation / Estimate
  const handleSaveQuotation = async () => {
    if (submitting) return;
    if (!customerName.trim()) {
      alert('Please enter a customer name.');
      return;
    }

    setSubmitting(true);
    try {
      const calculatedPurchaseCost = items.length > 0
        ? items.reduce((sum, it) => sum + ((it.purchase_rate || 0) * (it.qty || 1)), 0)
        : (parseFloat(directPurchaseCost) || 0);

      const quotationPayload = {
        quotation_number: fullInvoiceNumber.startsWith('EST-') ? fullInvoiceNumber : `EST-${fullInvoiceNumber}`,
        date: invoiceDate,
        valid_until: invoiceDate,
        party_id: selectedPartyId || 'CASH_CUSTOMER',
        party_name: customerName.trim(),
        party_phone: customerPhone.trim(),
        party_gstin: customerGstin.trim(),
        party_address: customerAddress.trim(),
        party_pincode: customerPincode.trim(),
        party_state: stateOfSupply.split('-')[1] || 'Delhi',
        party_state_code: stateOfSupply.split('-')[0] || '07',
        place_of_supply: stateOfSupply,
        items,
        sub_total: subTotal,
        cgst_total: totalCgst,
        sgst_total: totalSgst,
        igst_total: totalIgst,
        round_off: 0,
        grand_total: grandTotal,
        total_purchase_cost: calculatedPurchaseCost,
        notes: description.trim(),
      };

      const res = await apiFetch('/api/quotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.mobile ? { 'x-user-mobile': currentUser.mobile } : {}),
        },
        body: JSON.stringify(quotationPayload),
      });

      if (res.ok) {
        const createdQuo = await res.json();
        const quoteAsInvoice: any = {
          ...createdQuo,
          id: createdQuo.id || `QUO-${Date.now()}`,
          invoice_number: createdQuo.quotation_number,
          type: 'QUOTATION',
          party_name: createdQuo.party_name || customerName.trim(),
          party_phone: createdQuo.party_phone || customerPhone.trim(),
          party_gstin: createdQuo.party_gstin || customerGstin.trim(),
          party_address: createdQuo.party_address || customerAddress.trim(),
          party_state: createdQuo.party_state || stateOfSupply.split('-')[1],
          party_state_code: createdQuo.party_state_code || stateOfSupply.split('-')[0],
          is_inter_state: isInterState,
          items: createdQuo.items || items,
          sub_total: createdQuo.sub_total || subTotal,
          cgst_total: createdQuo.cgst_total || totalCgst,
          sgst_total: createdQuo.sgst_total || totalSgst,
          igst_total: createdQuo.igst_total || totalIgst,
          grand_total: createdQuo.grand_total || grandTotal,
          paid_amount: 0,
          balance_amount: createdQuo.grand_total || grandTotal,
          date: createdQuo.date || invoiceDate,
          notes: createdQuo.notes || description.trim(),
        };
        await onSubmitSale(quoteAsInvoice);
        triggerHaptic(24);
        onClose();
      } else {
        const err = await res.json();
        alert(`Error saving quotation: ${err.error || 'Failed'}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl min-h-dvh sm:min-h-0 sm:my-4 sm:max-h-[96dvh] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 font-sans border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* 1. TOP HEADER BAR: Back Arrow, Title, Credit/Cash Toggle, Settings        */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Sale</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Credit / Cash Segmented Pill Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-full border border-slate-200/80">
              <button
                type="button"
                onClick={() => setSaleType('CREDIT')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                  saleType === 'CREDIT'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Credit
              </button>
              <button
                type="button"
                onClick={() => setSaleType('CASH')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                  saleType === 'CASH'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cash
              </button>
            </div>

            {/* Quick Settings Icon */}
            <button
              type="button"
              onClick={() => setIsAddPrefixModalOpen(true)}
              title="Invoice Prefix & Number Settings"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>

            {/* Exit Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SCROLLABLE FORM BODY CONTAINER                                            */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/60">
          
          {/* ======================================================================= */}
          {/* 2. ROW 1: INVOICE NUMBER (PREFIX + SEQ) & DATE                         */}
          {/* ======================================================================= */}
          <div className="grid grid-cols-2 gap-3">
            {/* Invoice No. with Dropdown */}
            <div className="relative">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Invoice No.
              </label>
              <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2.5 py-2 shadow-2xs hover:border-blue-500 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                <button
                  type="button"
                  onClick={() => setIsPrefixMenuOpen(!isPrefixMenuOpen)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-800 hover:text-blue-600 cursor-pointer shrink-0 pr-1.5 border-r border-slate-200"
                >
                  <span>{activePrefix === 'NONE' ? 'No Prefix' : activePrefix}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <input
                  type="number"
                  value={seqNumber}
                  onChange={(e) => setSeqNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full pl-2 text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>

              {/* Prefix Selection Dropdown Menu */}
              {isPrefixMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 z-30 py-1 text-xs animate-in fade-in duration-100">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Prefix Selection
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePrefix('NONE');
                      setIsPrefixMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      activePrefix === 'NONE' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>None (Pure Number)</span>
                    {activePrefix === 'NONE' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePrefix(defaultPrefixString);
                      localStorage.setItem(prefixKey, defaultPrefixString);
                      setIsPrefixMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      activePrefix === defaultPrefixString ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>Default: {defaultPrefixString}</span>
                    {activePrefix === defaultPrefixString && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPrefixMenuOpen(false);
                        setIsAddPrefixModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-left text-blue-600 font-bold hover:bg-blue-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Prefix</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Date Field with Calendar Picker */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
              <div className="relative flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-2xs hover:border-blue-500 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                <input
                  type="text"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full text-xs font-semibold text-slate-900 focus:outline-none"
                />
                <Calendar className="w-4 h-4 text-slate-400 shrink-0 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* 3. CUSTOMER DETAILS: Name & Phone Number                                */}
          {/* ======================================================================= */}
          <div className="space-y-3">
            {/* Customer Name */}
            <div className="relative">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Customer <span className="text-blue-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setShowPartySuggestions(true);
                  }}
                  onFocus={() => setShowPartySuggestions(true)}
                  className="w-full bg-white border border-blue-400/80 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                />
              </div>

              {/* Suggestions dropdown from saved parties */}
              {showPartySuggestions && parties.length > 0 && customerName && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-30 max-h-48 overflow-y-auto py-1 text-xs">
                  {parties
                    .filter((p) => p.name.toLowerCase().includes(customerName.toLowerCase()))
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectParty(p)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between border-b border-slate-50 last:border-0 cursor-pointer"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-400">{p.phone} · {p.state || 'Delhi'}</div>
                        </div>
                        <span className="text-[10px] font-semibold text-blue-600">Select</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Phone Number with strict 10-digit guard */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Phone Number (10 digits)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full pl-11 bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                />
              </div>
            </div>

            {/* Customer GSTIN (Permanently Available on Sales & Invoices) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Customer GSTIN (Max 15 characters / For B2B)
              </label>
              <input
                type="text"
                maxLength={15}
                value={customerGstin}
                onChange={(e) => setCustomerGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-mono font-bold uppercase placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
              />
            </div>

            {/* Customer Address (Prints on Invoice) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Customer Address / Billing Address
              </label>
              <textarea
                rows={2}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs resize-none"
              />
            </div>

            {/* Customer Pincode (Prints on Invoice) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Customer Pincode
              </label>
              <input
                type="text"
                maxLength={6}
                value={customerPincode}
                onChange={(e) => setCustomerPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
              />
            </div>

            {/* Master Checkbox: Apply Sales RCM */}
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={isRcmActive}
                  onChange={(e) => setIsRcmActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span>Apply Sales RCM</span>
              </label>

              {isRcmActive && (
                <div className="pt-2 border-t border-slate-100 space-y-2.5 text-xs animate-in fade-in duration-150">
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                    Sales Reverse Charge Active: Tax liability is discharged directly by the recipient. Customer GSTIN and Office Address are required.
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Customer GSTIN <span className="text-blue-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerGstin}
                      onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 uppercase focus:border-blue-600 focus:outline-none"
                      required={isRcmActive}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Office Address <span className="text-blue-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      required={isRcmActive}
                    />
                  </div>

                  {/* RCM Tax Rate (%) input + standard fallback dropdown */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      RCM Tax Rate (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={rcmRate}
                        onChange={(e) => setRcmRate(e.target.value)}
                        className="w-24 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                      <select
                        value={rcmRate}
                        onChange={(e) => setRcmRate(e.target.value)}
                        className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-semibold focus:border-blue-600 focus:outline-none"
                      >
                        <option value="">Custom / Blank</option>
                        <option value="0">0%</option>
                        <option value="1">1%</option>
                        <option value="2">2%</option>
                        <option value="2.5">2.5%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                      </select>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Tax: {formatCurrency(rcmTaxAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================================= */}
          {/* 4. BILLED ITEMS CONTAINER OR ADD ITEMS ACTION                           */}
          {/* ======================================================================= */}
          {items.length > 0 ? (
            <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-2xs">
              {/* Blue Header Banner matching video */}
              <div className="bg-blue-500 px-3 py-2 text-white flex items-center justify-between">
                <span className="text-xs font-bold tracking-wide flex items-center gap-1.5">
                  <span>Billed Items</span>
                  <span className="text-[10px] bg-blue-600 px-1.5 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </span>
                <span className="text-[10px] opacity-90 font-medium">Rate excl. tax</span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <div key={index} className="p-3 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            #{index + 1} {item.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Item Subtotal: {item.qty} × {formatCurrency(item.rate)} ={' '}
                          <span className="font-semibold text-slate-700">
                            {formatCurrency(item.qty * item.rate)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-3 mt-0.5">
                          <span>Discount: {item.discountPercent || 0}%</span>
                          <span>Tax ({isInterState ? 'IGST' : 'GST'}@{item.gstRate}%): {formatCurrency((item.taxable * (item.gstRate || 0)) / 100)}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          {formatCurrency(item.total)}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleEditItem(index)}
                            className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* + Add Items Secondary Action */}
              <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleOpenAddItemDrawer}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 cursor-pointer py-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add More Items</span>
                </button>
              </div>
            </div>
          ) : (
            /* Empty items: Add Items button or Direct Total Amount */
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleOpenAddItemDrawer}
                className="w-full py-3 bg-white border border-blue-500 rounded-xl text-blue-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-50/50 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Items (Optional)</span>
              </button>

              <div className="flex items-center justify-between bg-white border border-slate-300 rounded-xl p-3 shadow-2xs">
                <span className="text-xs font-bold text-slate-700">Total Amount</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-slate-400">₹</span>
                  <IndianAmountInput
                    value={directTotalAmount}
                    onValueChange={setDirectTotalAmount}
                    className="w-28 text-right font-bold text-slate-900 text-sm focus:outline-none border-b border-slate-200 focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Purchasing Amount Box (opens directly below entered total amount) */}
              {parseFloat(directTotalAmount) > 0 && (
                <div className="bg-emerald-50/70 border border-emerald-300/80 rounded-xl p-3 space-y-2 animate-in fade-in duration-150 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">
                        Purchasing Amount
                      </span>
                      <span className="text-[10px] text-emerald-700">
                        How much did you buy this for?
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-emerald-500 shadow-2xs">
                      <span className="text-xs font-bold text-slate-400">₹</span>
                      <IndianAmountInput
                        value={directPurchaseCost}
                        onValueChange={setDirectPurchaseCost}
                        className="w-24 text-right font-mono font-bold text-emerald-950 text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Calculated Profit Margin Badge */}
                  {parseFloat(directPurchaseCost) > 0 && (
                    <div className="pt-2 border-t border-emerald-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Estimated Profit / Margin:</span>
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded ${
                          parseFloat(directTotalAmount) - parseFloat(directPurchaseCost) >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        ₹{(parseFloat(directTotalAmount) - parseFloat(directPurchaseCost)).toFixed(2)}
                        {' '}
                        ({Math.round(((parseFloat(directTotalAmount) - parseFloat(directPurchaseCost)) / parseFloat(directTotalAmount)) * 100)}%)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ======================================================================= */}
          {/* 5. TOTAL AMOUNT, RECEIVED AMOUNT & BALANCE DUE                          */}
          {/* ======================================================================= */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
            {/* Total Amount Row */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">Total Amount</span>
              <span className="text-sm font-bold text-slate-900">
                {formatCurrency(grandTotal)}
              </span>
            </div>

            {/* Received Checkbox & Input */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={isReceivedChecked}
                  onChange={(e) => {
                    setIsReceivedChecked(e.target.checked);
                    if (e.target.checked && !receivedAmount) {
                      setReceivedAmount(String(grandTotal));
                    }
                  }}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span>Received</span>
              </label>

              {isReceivedChecked && (
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 focus-within:border-blue-600">
                  <span className="text-xs font-semibold text-slate-400">₹</span>
                  <IndianAmountInput
                    value={receivedAmount}
                    onValueChange={setReceivedAmount}
                    className="w-24 text-right text-xs font-bold text-slate-900 focus:outline-none bg-transparent"
                  />
                </div>
              )}
            </div>

            {/* Balance Due Display */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-emerald-600">Balance Due</span>
              <span className="text-xs font-bold text-emerald-600">
                {formatCurrency(balanceDue)}
              </span>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* 6. PAYMENT TYPE, STATE OF SUPPLY & TAX BREAKDOWN                        */}
          {/* ======================================================================= */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
            {/* Payment Type Row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Payment Type</span>
              <button
                type="button"
                onClick={() => setIsPaymentTypeModalOpen(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg hover:border-blue-500 cursor-pointer"
              >
                <span>
                  {paymentType === 'CASH'
                    ? '💵 Cash'
                    : paymentType === 'CHEQUE'
                    ? '🧾 Cheque'
                    : '🏦 Bank A/c / UPI'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            {/* If Cheque or Bank -> Reference Number Input */}
            {paymentType !== 'CASH' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-medium text-slate-600">Payment Ref No.</span>
                <input
                  type="text"
                  value={paymentRefNo}
                  onChange={(e) => setPaymentRefNo(e.target.value)}
                  className="w-36 text-right text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-600"
                />
              </div>
            )}

            {/* State of Supply & Tax Routing - COLLAPSED & HIDDEN when RCM is active */}
            {!isRcmActive ? (
              <>
                {/* State of Supply (Triggers Intra-State vs Inter-State Auto Calculation) */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">State of Supply (POS)</span>
                    <span className="text-[10px] text-slate-400">
                      Home Base: 09-Uttar Pradesh • {isInterState ? 'Inter-State [IGST]' : 'Intra-State [CGST + SGST]'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsStateModalOpen(true)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50/60 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 cursor-pointer"
                  >
                    <span>{stateOfSupply}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                </div>

                {/* Standalone Tax Routing Override Control UI (Part 2 requirement) */}
                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                    <span>Tax Engine Routing:</span>
                    <span className="font-mono text-blue-600 font-bold">
                      {isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setTaxRoutingMode('AUTO')}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                        taxRoutingMode === 'AUTO'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Auto POS ({stateOfSupply.substring(0, 2) === '09' ? '09 Intra' : 'Inter'})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxRoutingMode('INTRA')}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                        taxRoutingMode === 'INTRA'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Intra (CGST+SGST)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxRoutingMode('INTER')}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                        taxRoutingMode === 'INTER'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Inter (IGST)
                    </button>
                  </div>
                </div>

                {/* Live Tax Split Summary */}
                <div className="p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Taxable Value:</span>
                    <span className="font-semibold text-slate-800">{formatCurrency(subTotal)}</span>
                  </div>
                  {isInterState ? (
                    <div className="flex justify-between text-blue-700">
                      <span>IGST (Integrated Tax):</span>
                      <span className="font-bold">{formatCurrency(totalIgst)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-emerald-700">
                        <span>CGST (Central Tax):</span>
                        <span className="font-semibold">{formatCurrency(totalCgst)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>SGST (State Tax):</span>
                        <span className="font-semibold">{formatCurrency(totalSgst)}</span>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              /* When RCM is checked: All POS and standard tax fields are collapsed */
              <div className="p-2.5 bg-amber-50 rounded-lg text-xs text-amber-900 space-y-1 border border-amber-200">
                <div className="flex justify-between font-bold">
                  <span>RCM Tax Reverse Charge:</span>
                  <span className="font-mono">{formatCurrency(rcmTaxAmount)} ({rcmRate || '0'}%)</span>
                </div>
                <p className="text-[10px] text-amber-700">
                  Standard POS and multi-layered tax fields collapsed under Section 9(3)/9(4). Tax is payable directly by recipient.
                </p>
              </div>
            )}
          </div>

          {/* ======================================================================= */}
          {/* 7. DESCRIPTION, ATTACHMENTS & TERMS & CONDITIONS                       */}
          {/* ======================================================================= */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description / Note</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white resize-none"
              />
            </div>

            {/* Terms and Conditions Accordion */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowTerms(!showTerms)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 py-1 cursor-pointer"
              >
                <span>Terms & Conditions</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${showTerms ? 'rotate-180' : ''}`}
                />
              </button>
              {showTerms && (
                <textarea
                  rows={2}
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  className="w-full mt-2 bg-slate-50 border border-slate-300 rounded-lg p-2 text-[11px] text-slate-700 focus:outline-none focus:border-blue-600 resize-none font-mono"
                />
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BOTTOM ACTION BUTTONS: Action 1 - Tax Invoice vs Action 2 - Quotation     */}
        {/* ========================================================================= */}
        <div className="p-3 border-t border-slate-200 bg-white grid grid-cols-3 gap-2 shrink-0">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSaveInvoice(true)}
            className="py-2.5 px-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            Save & New
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSaveQuotation}
            className="py-2.5 px-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Quotation: Generates professional estimate/quotation with selection of invoice formats"
          >
            {submitting ? 'Saving...' : 'Quotation'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSaveInvoice(false)}
            className="py-2.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center transition-colors shadow-md shadow-blue-500/25 cursor-pointer disabled:opacity-50"
            title="Tax Invoice: Generates compliant GST Tax Invoice"
          >
            {submitting ? 'Generating...' : 'Tax Invoice'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT ITEMS DRAWER (Matching Video 00:23 - 01:02)           */}
      {/* ========================================================================= */}
      {isItemDrawerOpen && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs">
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsItemDrawerOpen(false)}
                  className="p-1 rounded-full text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-sm font-bold text-slate-900">
                  {editingItemIndex !== null ? 'Edit Item' : 'Add Items to Sale'}
                </h2>
              </div>
              <button
                onClick={() => setIsItemDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
              {/* Item Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Item Name <span className="text-blue-600">*</span>
                </label>
                <input
                  type="text"
                  value={drawerItemName}
                  onChange={(e) => setDrawerItemName(e.target.value)}
                  className="w-full bg-white border border-blue-400 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* Quantity & Unit Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={drawerQty}
                    onChange={(e) => setDrawerQty(parseFloat(e.target.value) || 1)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Unit</label>
                  <button
                    type="button"
                    onClick={() => setIsUnitSelectorOpen(true)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 flex items-center justify-between hover:border-blue-500 cursor-pointer"
                  >
                    <span className="truncate">{drawerUnit}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Rate & Tax Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Rate (Price/Unit)</label>
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-blue-600">
                    <span className="text-xs font-semibold text-slate-400 mr-1">₹</span>
                    <IndianAmountInput
                      value={drawerRate}
                      onValueChange={(value) => setDrawerRate(parseFloat(value) || 0)}
                      className="w-full text-xs font-bold text-slate-900 focus:outline-none bg-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Tax Mode</label>
                  <select
                    value={drawerRateType}
                    onChange={(e) => setDrawerRateType(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="WITHOUT_TAX">Without Tax</option>
                    <option value="WITH_TAX">With Tax</option>
                  </select>
                </div>
              </div>

              {/* HSN / SAC Code & Purchasing Price Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    HSN / SAC Code
                  </label>
                  <input
                    type="text"
                    value={drawerHsn}
                    onChange={(e) => setDrawerHsn(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Purchasing Price / Buy Rate
                  </label>
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-blue-600">
                    <span className="text-xs font-semibold text-slate-400 mr-1">₹</span>
                    <IndianAmountInput
                      value={drawerPurchaseRate}
                      onValueChange={setDrawerPurchaseRate}
                      className="w-full text-xs font-bold text-slate-900 focus:outline-none bg-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Product Profit Margin Indicator */}
              {parseFloat(drawerPurchaseRate) > 0 && drawerRate > 0 && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-900 font-semibold">Estimated Unit Margin / Profit:</span>
                  <span className={drawerRate - parseFloat(drawerPurchaseRate) >= 0 ? "text-emerald-700 font-bold" : "text-rose-600 font-bold"}>
                    ₹{((drawerRate - parseFloat(drawerPurchaseRate)) * drawerQty).toFixed(2)}
                    {' '}
                    ({Math.round(((drawerRate - parseFloat(drawerPurchaseRate)) / drawerRate) * 100)}%)
                  </span>
                </div>
              )}

              {/* Totals & Taxes Card matching video */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                  Totals & Taxes
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Subtotal (Rate x Qty)</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(drawerQty * drawerRate)}
                  </span>
                </div>

                {/* Discount */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Discount (%)</span>
                  <div className="w-24 flex items-center bg-slate-50 border border-slate-300 rounded-lg px-2 py-1">
                    <input
                      type="number"
                      value={drawerDiscount}
                      onChange={(e) => setDrawerDiscount(parseFloat(e.target.value) || 0)}
                      className="w-full text-right text-xs font-bold text-slate-900 focus:outline-none bg-transparent"
                    />
                    <span className="text-xs text-slate-400 ml-1">%</span>
                  </div>
                </div>

                {/* Tax % Dropdown */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Tax %</span>
                  <button
                    type="button"
                    onClick={() => setIsTaxSelectorOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50/60 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 cursor-pointer"
                  >
                    <span>
                      {drawerTaxRate > 0
                        ? `${isInterState ? 'IGST' : 'GST'}@${drawerTaxRate}%`
                        : 'None (0%)'}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                </div>

                {/* Total Calculated Amount */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="font-bold text-slate-800">Total Amount:</span>
                  <span className="font-bold text-sm text-slate-900">
                    {formatCurrency(
                      (drawerQty * drawerRate -
                        (drawerQty * drawerRate * (drawerDiscount || 0)) / 100) *
                        (1 + drawerTaxRate / 100)
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Drawer Bottom Actions */}
            <div className="p-3 border-t border-slate-100 bg-white grid grid-cols-2 gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleSaveItemFromDrawer(true)}
                className="py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs"
              >
                Save & New
              </button>
              <button
                type="button"
                onClick={() => handleSaveItemFromDrawer(false)}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CHANGE ITEM UNIT (Matching Video 00:40)                           */}
      {/* ========================================================================= */}
      {isUnitSelectorOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900">Change Item Unit</h3>
              <button onClick={() => setIsUnitSelectorOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 text-xs">
              {ITEM_UNITS.map((u) => (
                <button
                  key={u.code}
                  type="button"
                  onClick={() => {
                    setDrawerUnit(u.label);
                    setIsUnitSelectorOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-blue-50 cursor-pointer ${
                    drawerUnit === u.label ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>{u.label}</span>
                  {drawerUnit === u.label && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: TAX % SELECTOR (Matching Video 00:57)                             */}
      {/* ========================================================================= */}
      {isTaxSelectorOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900">Tax %</h3>
              <button onClick={() => setIsTaxSelectorOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Adaptive Custom GST Rate Input Box */}
            <div className="p-3 bg-blue-50/50 border-b border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">Custom Rate:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold focus:border-blue-600 focus:outline-none bg-white text-slate-900"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      setDrawerTaxRate(val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setIsTaxSelectorOpen(false);
                    }
                  }}
                />
                <span className="text-xs font-bold text-slate-400">%</span>
                <button
                  type="button"
                  onClick={() => setIsTaxSelectorOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 text-xs">
              {TAX_RATES.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setDrawerTaxRate(t.rate);
                    setIsTaxSelectorOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-blue-50 cursor-pointer ${
                    drawerTaxRate === t.rate ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className="font-mono text-slate-500">{t.rate.toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: PAYMENT TYPE SELECTOR (Matching Video 01:26)                      */}
      {/* ========================================================================= */}
      {isPaymentTypeModalOpen && (
        <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="w-full max-w-xs bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-3 space-y-2 animate-in slide-in-from-bottom-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-bold text-slate-800 px-2 py-1">Payment Type</div>
            <button
              type="button"
              onClick={() => {
                setPaymentType('CASH');
                setIsPaymentTypeModalOpen(false);
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 text-left text-xs font-bold text-slate-800 cursor-pointer"
            >
              <span className="text-base">💵</span>
              <span>Cash</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentType('CHEQUE');
                setIsPaymentTypeModalOpen(false);
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 text-left text-xs font-bold text-slate-800 cursor-pointer"
            >
              <span className="text-base">🧾</span>
              <span>Cheque</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentType('BANK');
                setIsPaymentTypeModalOpen(false);
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 text-left text-xs font-bold text-slate-800 cursor-pointer"
            >
              <span className="text-base">🏦</span>
              <span>Add Bank A/c / Online UPI</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: STATE OF SUPPLY SELECTOR (Matching Video 01:34)                   */}
      {/* ========================================================================= */}
      {isStateModalOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900">Select State Of Supply</h3>
              <button onClick={() => setIsStateModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 text-xs">
              {GST_STATES.map((s) => {
                const combined = `${s.code}-${s.name}`;
                const isSelected = stateOfSupply.startsWith(s.code);
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => {
                      setStateOfSupply(combined);
                      setIsStateModalOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-blue-50 cursor-pointer ${
                      isSelected ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>{s.name}</span>
                    <span className="font-mono text-slate-400">{s.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: ADD CUSTOM PREFIX PROMPT                                         */}
      {/* ========================================================================= */}
      {isAddPrefixModalOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="w-full max-w-xs bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-4 space-y-3 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Create Custom Prefix</h3>
              <button onClick={() => setIsAddPrefixModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Enter the prefix code for your sales invoices:
            </p>
            <input
              type="text"
              value={newPrefixInput}
              onChange={(e) => setNewPrefixInput(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 uppercase"
            />
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsAddPrefixModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewPrefix}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
              >
                Set Prefix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
