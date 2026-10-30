import { IndianAmountInput } from './IndianAmountInput';
import { downloadUrlAsBlob } from '../utils/pdfShare';
import { apiFetch } from '../utils/api';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Camera,
  Upload,
  FileText,
  History,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Search,
  Receipt,
  Calendar,
  Building2,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Purchase, CompanyProfile } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { GST_STATES } from './ManualPurchaseEntryModal';
import { playSuccessTone, triggerHaptic } from '../utils/feedback';

interface QuickPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  userMobile?: string;
  company?: CompanyProfile | null;
  purchases: Purchase[];
  onPurchaseCreated: (purchase: Purchase) => void;
  initialMode?: 'NONE' | 'CAMERA' | 'FILE' | 'MANUAL';
}

export interface ExtractedPageInvoice {
  pageIndex: number;
  supplier_name: string;
  supplier_gstin: string;
  supplier_address: string;
  supplier_state: string;
  supplier_state_code: string;
  invoice_number: string;
  supplier_invoice_no?: string;
  date: string;
  due_date: string;
  invoice_classification: 'B2B' | 'B2C' | 'B2G';
  taxable_value: number;
  gst_rate: number;
  custom_gst_rate?: string;
  tax_type?: 'CGST_SGST' | 'IGST';
  cgst: number;
  sgst: number;
  igst: number;
  grand_total: number;
  payment_status: 'PAID' | 'UNPAID';
  paid_amount?: number;
  payment_mode?: 'CASH' | 'BANK/CHECK';
  notes: string;
  raw_image_url?: string;
  isSaved?: boolean;
}

export const QuickPurchaseModal: React.FC<QuickPurchaseModalProps> = ({
  isOpen,
  onClose,
  userMobile = '',
  company,
  purchases = [],
  onPurchaseCreated,
  initialMode = 'NONE',
}) => {
  // Resolve client's registered business home state code from metadata
  const registeredHomeStateCode = useMemo(() => {
    if (company?.state_code) return String(company.state_code).padStart(2, '0');
    if (company?.gstin && company.gstin.length >= 2) return company.gstin.slice(0, 2);
    if (company?.state) {
      const matched = GST_STATES.find(
        (s) => s.name.toLowerCase() === company.state?.toLowerCase()
      );
      if (matched) return matched.code;
    }
    return '07'; // Default Delhi
  }, [company]);

  // View state: 'ENTRY' or 'HISTORY'
  const [currentView, setCurrentView] = useState<'ENTRY' | 'HISTORY'>('ENTRY');
  const [entryMode, setEntryMode] = useState<'NONE' | 'CAMERA' | 'FILE' | 'MANUAL'>('NONE');

  // Multi-Page Horizontal Slider Navigation State (PILLAR 3)
  const [multiPages, setMultiPages] = useState<ExtractedPageInvoice[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Two-Step Form Progression (40% -> 60%)
  const [currentFormStep, setCurrentFormStep] = useState<1 | 2>(1);

  // Camera capture
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [photoStage, setPhotoStage] = useState<'CAPTURE' | 'PREVIEW' | 'FORM'>('CAPTURE');
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // File upload
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [fileStage, setFileStage] = useState<'IDLE' | 'PREVIEW' | 'FORM'>('IDLE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search filter for History
  const [historySearch, setHistorySearch] = useState('');
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);

  const BLANK_PURCHASE_FORM: ExtractedPageInvoice = {
    pageIndex: 1,
    supplier_invoice_no: '',
    invoice_number: '',
    date: new Date().toLocaleDateString('en-GB'),
    due_date: new Date().toLocaleDateString('en-GB'),
    supplier_name: '',
    supplier_gstin: '',
    supplier_address: '',
    supplier_state: 'Delhi',
    supplier_state_code: '07',
    invoice_classification: 'B2B',
    taxable_value: 0,
    gst_rate: 18,
    custom_gst_rate: '',
    cgst: 0,
    sgst: 0,
    igst: 0,
    grand_total: 0,
    payment_status: 'PAID',
    paid_amount: 0,
    payment_mode: 'CASH',
    notes: '',
  };

  // 15-Field Form State (Zero-State Blank)
  const [formData, setFormData] = useState<ExtractedPageInvoice>(BLANK_PURCHASE_FORM);
  const [extractingOcr, setExtractingOcr] = useState(false);
  const [capturedPhotoBase64, setCapturedPhotoBase64] = useState<string | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dynamic Cache-Buster Cleanup Hook
  const flushAllPurchaseStates = () => {
    setFormData(BLANK_PURCHASE_FORM);
    setMultiPages([]);
    setActivePageIndex(0);
    setCurrentFormStep(1);
    setCapturedPhotoUrl(null);
    setCapturedPhotoBase64(null);
    setUploadedFileName('');
    setUploadedFileBase64(null);
    setPhotoStage('CAPTURE');
    setFileStage('IDLE');
    setStatusMessage(null);
    setExtractingOcr(false);
  };

  // Mandatory cache-buster reset every time modal opens
  useEffect(() => {
    if (isOpen) {
      flushAllPurchaseStates();
      setCurrentView('ENTRY');
      setEntryMode('NONE');
    }
  }, [isOpen]);

  // Profile-driven state tax recomputation with automatic default and operator manual authority
  const recomputeTaxes = (
    taxableVal: number,
    rateVal: number,
    stCode: string,
    overrideTaxType?: 'CGST_SGST' | 'IGST'
  ) => {
    // If override explicitly provided by operator, honor it; otherwise auto-match checker:
    // supplier state code === registeredHomeStateCode -> Intra-State (CGST + SGST), else Inter-State (IGST)
    const isInter = overrideTaxType
      ? overrideTaxType === 'IGST'
      : stCode !== registeredHomeStateCode;
    const computedTaxType: 'CGST_SGST' | 'IGST' = isInter ? 'IGST' : 'CGST_SGST';

    const totalGst = (taxableVal * rateVal) / 100;
    const cgstVal = isInter ? 0 : totalGst / 2;
    const sgstVal = isInter ? 0 : totalGst / 2;
    const igstVal = isInter ? totalGst : 0;
    const total = taxableVal + totalGst;

    return {
      tax_type: computedTaxType,
      cgst: Math.round(cgstVal * 100) / 100,
      sgst: Math.round(sgstVal * 100) / 100,
      igst: Math.round(igstVal * 100) / 100,
      grand_total: Math.round(total * 100) / 100,
    };
  };

  // Tax type selector engine toggle handler (operator authority)
  const handleTaxTypeChange = (newType: 'CGST_SGST' | 'IGST') => {
    const taxes = recomputeTaxes(formData.taxable_value, formData.gst_rate, formData.supplier_state_code, newType);
    const updated = {
      ...formData,
      ...taxes,
    };
    setFormData(updated);

    if (multiPages.length > 0) {
      setMultiPages((prev) => {
        const next = [...prev];
        next[activePageIndex] = updated;
        return next;
      });
    }
  };

  // Auto tax recomputation on field change
  const handleTaxableChange = (taxableVal: number, rateVal: number) => {
    const taxes = recomputeTaxes(taxableVal, rateVal, formData.supplier_state_code, formData.tax_type);
    const updated = {
      ...formData,
      taxable_value: taxableVal,
      gst_rate: rateVal,
      ...taxes,
    };
    setFormData(updated);

    // If in multi-page mode, update active page
    if (multiPages.length > 0) {
      setMultiPages((prev) => {
        const next = [...prev];
        next[activePageIndex] = updated;
        return next;
      });
    }
  };

  // Static slabs + dynamic custom rate
  const staticSlabs = [0, 0.25, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

  const handleSelectStaticSlab = (slab: number) => {
    handleTaxableChange(formData.taxable_value, slab);
  };

  const handleCustomRateInput = (val: string) => {
    const num = parseFloat(val);
    const updatedRate = !isNaN(num) && num >= 0 ? num : 0;
    const taxes = recomputeTaxes(formData.taxable_value, updatedRate, formData.supplier_state_code, formData.tax_type);
    const updated = {
      ...formData,
      gst_rate: updatedRate,
      custom_gst_rate: val,
      ...taxes,
    };
    setFormData(updated);

    if (multiPages.length > 0) {
      setMultiPages((prev) => {
        const next = [...prev];
        next[activePageIndex] = updated;
        return next;
      });
    }
  };

  // State selection change - automatic matching checker routine:
  // If supplier state code matches registered business profile -> Intra-State, else Inter-State
  const handleStateSelect = (selectedStateName: string) => {
    const matched = GST_STATES.find((s) => s.name === selectedStateName);
    const newCode = matched ? matched.code : formData.supplier_state_code;
    const defaultTaxType: 'CGST_SGST' | 'IGST' = newCode === registeredHomeStateCode ? 'CGST_SGST' : 'IGST';
    const taxes = recomputeTaxes(formData.taxable_value, formData.gst_rate, newCode, defaultTaxType);
    const updated = {
      ...formData,
      supplier_state: selectedStateName,
      supplier_state_code: newCode,
      ...taxes,
    };
    setFormData(updated);

    if (multiPages.length > 0) {
      setMultiPages((prev) => {
        const next = [...prev];
        next[activePageIndex] = updated;
        return next;
      });
    }
  };

  // Camera input change
  const handlePhotoCaptured = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      flushAllPurchaseStates();
      setCapturedPhotoUrl(URL.createObjectURL(file));
      setPhotoStage('PREVIEW');

      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhotoBase64(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Camera OK Clicked -> Execute Real Vision OCR
  const handlePhotoConfirmOk = async () => {
    setPhotoStage('FORM');
    if (!capturedPhotoBase64) return;

    setExtractingOcr(true);
    setStatusMessage({ type: 'success', text: 'Scanning invoice document with Gemini Vision OCR...' });
    try {
      const res = await apiFetch('/api/compliance/ocr-single-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-mobile': userMobile },
        body: JSON.stringify({
          imageBase64: capturedPhotoBase64,
          mimeType: 'image/jpeg',
          fileName: 'camera_bill.jpg',
        }),
      });

      if (res.ok) {
        const payload = await res.json();
        const ocr = payload.data || {};
        const taxVal = ocr.taxable_value !== undefined && ocr.taxable_value !== null ? ocr.taxable_value : (ocr.taxable_amount || 0);
        const stateCode = ocr.state_code || '07';
        const rate = 18;
        const taxes = recomputeTaxes(taxVal, rate, stateCode);

        const newRec: ExtractedPageInvoice = {
          pageIndex: 1,
          supplier_name: ocr.supplier_name || '',
          supplier_gstin: ocr.supplier_gstin || 'URP',
          supplier_invoice_no: ocr.invoice_number || `PB-${Date.now().toString().slice(-4)}`,
          invoice_number: ocr.invoice_number || `PB-${Date.now().toString().slice(-4)}`,
          date: ocr.invoice_date || formData.date,
          due_date: ocr.invoice_date || formData.due_date,
          supplier_address: ocr.place_of_supply || '',
          supplier_state: ocr.state_name || 'Delhi',
          supplier_state_code: stateCode,
          invoice_classification: 'B2B',
          taxable_value: taxVal,
          gst_rate: rate,
          ...taxes,
          grand_total: ocr.grand_total || taxes.grand_total,
          payment_status: 'PAID',
          notes: 'Camera Scanned Purchase Receipt',
          raw_image_url: ocr.cloudinary_url,
        };

        setFormData(newRec);
        setMultiPages([newRec]);
        setActivePageIndex(0);
        setStatusMessage({ type: 'success', text: 'OCR extracted successfully. Verify or edit values.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'OCR could not process image. Please enter details manually.' });
    } finally {
      setExtractingOcr(false);
    }
  };

  // File upload change
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      flushAllPurchaseStates();
      setUploadedFileName(file.name);
      setFileStage('PREVIEW');

      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedFileBase64(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // File OK Clicked -> Execute Real Vision OCR / Multi-Page PDF Splitting
  const handleFileConfirmOk = async () => {
    setFileStage('FORM');
    if (!uploadedFileBase64) return;

    setExtractingOcr(true);
    setStatusMessage({ type: 'success', text: 'Analyzing document with Gemini Vision Engine...' });

    const isPdf = uploadedFileName.toLowerCase().endsWith('.pdf') || (uploadedFileBase64 && uploadedFileBase64.startsWith('data:application/pdf'));

    try {
      if (isPdf) {
        // Multi-Page PDF Ingestion Pipeline (PILLAR 3)
        const res = await apiFetch('/api/compliance/ocr-split-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-mobile': userMobile },
          body: JSON.stringify({
            rawPdfBase64: uploadedFileBase64,
            fileName: uploadedFileName,
          }),
        });

        if (res.ok) {
          const payload = await res.json();
          const invoices = payload.invoices || [];

          if (invoices.length > 0) {
            const mappedPages: ExtractedPageInvoice[] = invoices.map((inv: any, idx: number) => {
              const taxVal = inv.taxable_value !== undefined && inv.taxable_value !== null ? parseFloat(inv.taxable_value) : 0;
              const rate = parseFloat(inv.gst_rate || '18');
              const stCode = inv.supplier_state_code || '07';
              const taxes = recomputeTaxes(taxVal, rate, stCode);

              return {
                pageIndex: idx + 1,
                supplier_name: inv.supplier_name || '',
                supplier_gstin: inv.supplier_gstin || 'URP',
                supplier_invoice_no: inv.invoice_number || `PB-P${idx + 1}-${Date.now().toString().slice(-4)}`,
                invoice_number: inv.invoice_number || `PB-P${idx + 1}-${Date.now().toString().slice(-4)}`,
                date: inv.invoice_date || new Date().toLocaleDateString('en-GB'),
                due_date: inv.invoice_date || new Date().toLocaleDateString('en-GB'),
                supplier_address: inv.supplier_address || '',
                supplier_state: inv.supplier_state || 'Delhi',
                supplier_state_code: stCode,
                invoice_classification: 'B2B',
                taxable_value: taxVal,
                gst_rate: rate,
                ...taxes,
                grand_total: inv.total_value || taxes.grand_total,
                payment_status: 'PAID',
                notes: `Extracted Page ${idx + 1}`,
                raw_image_url: inv.raw_image_url,
                isSaved: false,
              };
            });

            setMultiPages(mappedPages);
            setActivePageIndex(0);
            setFormData(mappedPages[0]);
            setStatusMessage({
              type: 'success',
              text: `PDF successfully split! ${mappedPages.length} pages isolated into Horizontal Blue Slider.`,
            });
            return;
          }
        }
      }

      // Single Image OCR Fallback
      const res = await apiFetch('/api/compliance/ocr-single-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-mobile': userMobile },
        body: JSON.stringify({
          imageBase64: uploadedFileBase64,
          mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
          fileName: uploadedFileName,
        }),
      });

      if (res.ok) {
        const payload = await res.json();
        const ocr = payload.data || {};
        const taxVal = ocr.taxable_value !== undefined && ocr.taxable_value !== null ? ocr.taxable_value : (ocr.taxable_amount || 0);
        const stateCode = ocr.state_code || '07';
        const rate = 18;
        const taxes = recomputeTaxes(taxVal, rate, stateCode);

        const newRec: ExtractedPageInvoice = {
          pageIndex: 1,
          supplier_name: ocr.supplier_name || '',
          supplier_gstin: ocr.supplier_gstin || 'URP',
          supplier_invoice_no: ocr.invoice_number || `PB-${Date.now().toString().slice(-4)}`,
          invoice_number: ocr.invoice_number || `PB-${Date.now().toString().slice(-4)}`,
          date: ocr.invoice_date || formData.date,
          due_date: ocr.invoice_date || formData.due_date,
          supplier_address: ocr.place_of_supply || '',
          supplier_state: ocr.state_name || 'Delhi',
          supplier_state_code: stateCode,
          invoice_classification: 'B2B',
          taxable_value: taxVal,
          gst_rate: rate,
          ...taxes,
          grand_total: ocr.grand_total || taxes.grand_total,
          payment_status: 'PAID',
          notes: 'Uploaded Purchase Receipt',
          raw_image_url: ocr.cloudinary_url,
        };

        setFormData(newRec);
        setMultiPages([newRec]);
        setActivePageIndex(0);
        setStatusMessage({ type: 'success', text: 'Document extracted successfully into form.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'OCR scan failed. Please enter details manually.' });
    } finally {
      setExtractingOcr(false);
    }
  };

  // Switch Active Page via Horizontal Slider (PILLAR 3)
  const handleSelectPage = (index: number) => {
    setActivePageIndex(index);
    setCurrentFormStep(1);
    if (multiPages[index]) {
      setFormData(multiPages[index]);
    }
  };

  // Save Purchase Entry into Neon DB directly (Progressive Automation Hook)
  const handleSavePurchase = async () => {
    if (!formData.supplier_name.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter supplier / party name.' });
      return;
    }
    const invNo = (formData.supplier_invoice_no || '').trim() || formData.invoice_number.trim();
    if (!invNo) {
      setStatusMessage({ type: 'error', text: 'Please enter invoice number.' });
      return;
    }
    if (formData.taxable_value <= 0 && formData.grand_total <= 0) {
      setStatusMessage({ type: 'error', text: 'Total bill amount must be greater than 0.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      // Upload scanned bills directly to the tenant-scoped Cloudinary folder when configured.
      // OCR still uses the local base64 image; only the final saved record stores the URL.
      let storedImageUrl = formData.raw_image_url || '';
      const documentBase64 = capturedPhotoBase64 || uploadedFileBase64 || null;
      if (!storedImageUrl && documentBase64) {
        try {
          const signRes = await apiFetch('/api/cloudinary/signature', { method: 'POST', body: JSON.stringify({ purpose: 'purchase-bills' }) });
          if (signRes.ok) {
            const sign = await signRes.json();
            const upload = new FormData();
            upload.append('file', documentBase64);
            upload.append('api_key', sign.api_key);
            upload.append('timestamp', String(sign.timestamp));
            upload.append('folder', sign.folder);
            upload.append('signature', sign.signature);
            const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(sign.cloud_name)}/image/upload`, { method: 'POST', body: upload });
            const uploaded = await uploadRes.json();
            if (!uploadRes.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || 'Cloudinary upload failed.');
            storedImageUrl = uploaded.secure_url;
          }
        } catch (uploadError) {
          console.warn('Direct Cloudinary upload unavailable; server-side upload fallback will be used.', uploadError);
        }
      }
      const payload = {
        invoice_classification: formData.invoice_classification || 'B2B',
        supplier_invoice_no: invNo,
        date: formData.date.trim(),
        due_date: formData.due_date.trim(),
        supplier_id: 'DIRECT_VENDOR',
        supplier_name: formData.supplier_name.trim(),
        supplier_gstin: formData.supplier_gstin.trim() || 'URP',
        supplier_state: formData.supplier_state,
        supplier_state_code: formData.supplier_state_code,
        sub_total: formData.taxable_value,
        cgst_total: formData.cgst,
        sgst_total: formData.sgst,
        igst_total: formData.igst,
        grand_total: formData.grand_total,
        payment_status: formData.payment_status,
        paid_amount: formData.payment_status === 'PAID' ? formData.grand_total : Math.min(formData.grand_total, Math.max(0, Number(formData.paid_amount) || 0)),
        payment_mode: formData.payment_mode || 'CASH',
        notes: formData.notes,
        raw_image_url: storedImageUrl,
        raw_image_base64: storedImageUrl ? null : documentBase64,
        items: [
          {
            name: `${formData.invoice_classification} Inventory Stock`,
            hsn: '9999',
            qty: 1,
            unit: 'PCS',
            rate: formData.taxable_value,
            taxable: formData.taxable_value,
            gstRate: formData.gst_rate,
            cgst: formData.cgst,
            sgst: formData.sgst,
            igst: formData.igst,
            total: formData.grand_total,
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
        const saved = await res.json();
        triggerHaptic(28);
        onPurchaseCreated(saved);

        // Mark this page as saved in multi-page matrix
        if (multiPages.length > 0) {
          const updatedPages = [...multiPages];
          updatedPages[activePageIndex] = { ...updatedPages[activePageIndex], isSaved: true };
          setMultiPages(updatedPages);

          // Progressive Automation Hook:
          // If there is a next page, automatically increment index +1 and load next page values!
          if (activePageIndex + 1 < multiPages.length) {
            const nextIdx = activePageIndex + 1;
            setActivePageIndex(nextIdx);
            setFormData(updatedPages[nextIdx]);
            setCurrentFormStep(1);
            setStatusMessage({
              type: 'success',
              text: `Page ${activePageIndex + 1} saved! Auto-navigated to Page ${nextIdx + 1}.`,
            });
            return;
          }
        }

        setStatusMessage({
          type: 'success',
          text: `Purchase bill #${saved.supplier_invoice_no} (${saved.supplier_name}) committed successfully!`,
        });
        playSuccessTone();

        setTimeout(() => {
          setCurrentView('HISTORY');
          setEntryMode('NONE');
        }, 1000);
      } else {
        const err = await res.json();
        setStatusMessage({
          type: 'error',
          text: err.error || 'Failed to save purchase bill.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: 'Network or server error: ' + err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter history
  const filteredHistory = purchases.filter((p) => {
    const q = historySearch.toLowerCase();
    return (
      p.supplier_name?.toLowerCase().includes(q) ||
      p.supplier_invoice_no?.toLowerCase().includes(q) ||
      p.supplier_gstin?.toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-5xl my-4 bg-white rounded-3xl border border-blue-200 shadow-2xl overflow-hidden flex flex-col max-h-[94dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
              <Receipt className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Purchase Invoice Scanner & Voucher
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  White & Blue Framework
                </span>
              </div>
              <p className="text-xs text-slate-500">
                OCR Bill Parsing, Multi-Page Blue Slider & 2-Step Form Progressive Save
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher: Entry vs History */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setCurrentView('ENTRY');
                  setEntryMode('NONE');
                  flushAllPurchaseStates();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentView === 'ENTRY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                + New Entry
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('HISTORY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentView === 'HISTORY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                History ({purchases.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Toast / Feedback */}
        {statusMessage && (
          <div
            className={`mx-6 mt-3 p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-xs opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* Modal Body Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-white">
          
          {/* ========================================================================= */}
          {/* VIEW 1: PURCHASE HISTORY LIST                                            */}
          {/* ========================================================================= */}
          {currentView === 'HISTORY' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input aria-label="Search purchases"
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="space-y-2.5">
                {filteredHistory.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 text-xs">
                    No purchase bills found in history. Click '+ New Entry' to record a purchase bill.
                  </div>
                ) : (
                  filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 transition-all flex items-center justify-between gap-4 shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 truncate">
                            {item.supplier_name}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 font-bold border border-blue-200">
                            #{item.supplier_invoice_no}
                          </span>
                          {item.invoice_classification && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.invoice_classification}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                          <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Bill Date: <strong className="text-slate-700">{item.date}</strong></span>
                          {item.supplier_gstin && (
                            <>
                              <span>•</span>
                              <span>{item.supplier_gstin}</span>
                            </>
                          )}
                          {item.raw_image_url && (
                            <>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const receiptUrl = item.raw_image_url;
                                  const receiptId = String(item.id || item.supplier_invoice_no || 'document');
                                  if (!receiptUrl || receiptBusyId) return;
                                  const ext = receiptUrl.split('?')[0].split('.').pop() || 'file';
                                  const receiptFileName = `Receipt_${item.supplier_invoice_no || item.id || 'document'}.${ext}`;
                                  setReceiptBusyId(receiptId);
                                  void downloadUrlAsBlob(receiptUrl, receiptFileName)
                                    .catch(() => window.alert('Receipt document could not be downloaded. Please try again.'))
                                    .finally(() => setReceiptBusyId(null));
                                }}
                                disabled={!!receiptBusyId}
                                className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                              >
                                {receiptBusyId === String(item.id || item.supplier_invoice_no || 'document') && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>{receiptBusyId === String(item.id || item.supplier_invoice_no || 'document') ? 'Preparing download…' : 'Download Receipt Document'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base sm:text-lg font-black font-mono text-slate-900">
                          {formatCurrency(item.grand_total)}
                        </div>
                        <span className={`text-[10px] font-bold block uppercase ${
                          item.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {item.payment_status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VIEW 2: INGESTION CHOICE & SCANNER PIPELINE                               */
            /* ========================================================================= */
            <div className="space-y-5">
              {/* Top Choice Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Capture Photo */}
                <button
                  type="button"
                  onClick={() => {
                    flushAllPurchaseStates();
                    setEntryMode('CAMERA');
                    setPhotoStage('CAPTURE');
                    cameraInputRef.current?.click();
                  }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer group flex items-start gap-4 ${
                    entryMode === 'CAMERA'
                      ? 'bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                      Take Live Photo
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Capture physical paper receipt using device camera with instant OCR
                    </div>
                  </div>
                </button>

                {/* 2. Upload File / PDF */}
                <button
                  type="button"
                  onClick={() => {
                    flushAllPurchaseStates();
                    setEntryMode('FILE');
                    setFileStage('IDLE');
                    fileInputRef.current?.click();
                  }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer group flex items-start gap-4 ${
                    entryMode === 'FILE'
                      ? 'bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                      Upload File / Multi-Page PDF
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Upload single image or multi-page consolidated PDF with horizontal page slider
                    </div>
                  </div>
                </button>
              </div>

              {/* Hidden Inputs */}
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/*,image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCaptured}
              />
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.bmp"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* CAMERA PREVIEW: RETRY AND OK */}
              {entryMode === 'CAMERA' && photoStage === 'PREVIEW' && capturedPhotoUrl && (
                <div className="p-5 rounded-2xl bg-white border border-blue-200 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">Captured Bill Photo</span>
                    <span className="text-[11px] text-blue-600 font-bold">Ready for scan</span>
                  </div>
                  <div className="max-h-64 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center border border-slate-200 p-2">
                    <img src={capturedPhotoUrl} alt="Bill Preview" className="max-h-60 object-contain rounded-lg" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        setCapturedPhotoUrl(null);
                        cameraInputRef.current?.click();
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retake
                    </button>
                    <button
                      onClick={handlePhotoConfirmOk}
                      className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20"
                    >
                      <Check className="w-3.5 h-3.5" /> OK - Load Form
                    </button>
                  </div>
                </div>
              )}

              {/* FILE PREVIEW: RETRY AND OK */}
              {entryMode === 'FILE' && fileStage === 'PREVIEW' && (
                <div className="p-5 rounded-2xl bg-white border border-blue-200 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">Selected File: {uploadedFileName}</span>
                    <span className="text-[11px] text-blue-600 font-bold">PDF / Image</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Click OK to split multi-page PDF into independent page buffers and extract supplier fields.
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Change File
                    </button>
                    <button
                      onClick={handleFileConfirmOk}
                      className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20"
                    >
                      <Check className="w-3.5 h-3.5" /> OK - Execute OCR Pipeline
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* PILLAR 3: HORIZONTAL BLUE SLIDER FRAMEWORK FOR MULTI-PAGE DOCUMENTS      */}
              {/* ========================================================================= */}
              {multiPages.length > 1 && (
                <div className="p-4 rounded-2xl bg-white border border-blue-200 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Multi-Page Document Slider ({multiPages.length} Pages Extracted)</span>
                    </div>
                    <span className="text-[11px] text-blue-600 font-bold font-mono">
                      Editing Page {activePageIndex + 1} of {multiPages.length}
                    </span>
                  </div>

                  {/* Horizontal row setup composed exclusively of Blue Numbered Circles (1, 2, 3...) */}
                  <div className="flex items-center gap-3 overflow-x-auto py-2 px-1">
                    {multiPages.map((page, idx) => {
                      const isActive = idx === activePageIndex;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectPage(idx)}
                          title={`Page ${idx + 1}${page.isSaved ? ' (Saved)' : ''}`}
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all cursor-pointer shrink-0 select-none ${
                            isActive
                              ? 'border-[3px] border-emerald-500 ring-4 ring-emerald-500/35 bg-white text-emerald-700 shadow-md font-black scale-105'
                              : page.isSaved
                              ? 'border-2 border-blue-600 bg-blue-600 text-white shadow-xs hover:bg-blue-700'
                              : 'border-2 border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-2xs'
                          }`}
                        >
                          {page.isSaved && !isActive ? '✓' : idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* EDITABLE FORM CONTAINER (PRE-FILLED SPLIT-VIEW + 2-STEP PROGRESSION)      */}
              {/* ========================================================================= */}
              {((entryMode === 'CAMERA' && photoStage === 'FORM') ||
                (entryMode === 'FILE' && fileStage === 'FORM')) && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  
                  {/* LEFT COLUMN: CRISP ORIGINAL RECEIPT DOCUMENT (SPLIT-VIEW) */}
                  <div className="lg:col-span-5 p-4 rounded-2xl bg-white border border-slate-200 space-y-3 sticky top-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-blue-600" />
                        <span>Original Receipt Image</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (entryMode === 'CAMERA') {
                            cameraInputRef.current?.click();
                          } else {
                            fileInputRef.current?.click();
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Replace
                      </button>
                    </div>

                    <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center max-h-[460px] p-2">
                      {capturedPhotoUrl ? (
                        <img
                          src={capturedPhotoUrl}
                          alt="Captured Receipt"
                          className="max-h-[440px] w-full object-contain rounded-lg"
                        />
                      ) : uploadedFileBase64 && uploadedFileBase64.startsWith('data:image') ? (
                        <img
                          src={uploadedFileBase64}
                          alt="Uploaded Receipt"
                          className="max-h-[440px] w-full object-contain rounded-lg"
                        />
                      ) : (
                        <div className="py-20 text-center text-slate-500 text-xs">
                          <FileText className="w-10 h-10 text-blue-600 mx-auto mb-2 opacity-80" />
                          <div className="text-slate-800 font-bold">{uploadedFileName || 'Document Staged'}</div>
                          <span className="text-[10px] text-blue-600 font-bold">
                            {multiPages.length > 0 ? `Viewing Page ${activePageIndex + 1} of ${multiPages.length}` : 'Vector Extracted'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: 2-STEP PURCHASE FORM */}
                  <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-2xs">
                    
                    {/* Step Navigator Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setCurrentFormStep(1)}
                          className={`font-bold cursor-pointer flex items-center gap-1 ${
                            currentFormStep === 1 ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            currentFormStep === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>1</span>
                          <span>Supplier (40%)</span>
                        </button>

                        <span className="text-slate-300">→</span>

                        <button
                          type="button"
                          onClick={() => setCurrentFormStep(2)}
                          className={`font-bold cursor-pointer flex items-center gap-1 ${
                            currentFormStep === 2 ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            currentFormStep === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>2</span>
                          <span>Rates & Tax (60%)</span>
                        </button>
                      </div>

                      {currentFormStep === 2 && (
                        <button
                          type="button"
                          onClick={() => setCurrentFormStep(1)}
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Back to Step 1</span>
                        </button>
                      )}
                    </div>

                    {/* STEP 1: INITIAL 40% FORM FIELDS */}
                    {currentFormStep === 1 && (
                      <div className="space-y-3.5 text-xs animate-in fade-in duration-150">
                        {/* Supplier Name */}
                        <div>
                          <label className="text-slate-700 font-bold block mb-1">
                            Supplier / Party Name <span className="text-blue-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.supplier_name}
                            onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:border-blue-600 focus:outline-none"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Invoice Classification (MANDATORY REQUIREMENT) */}
                          <div>
                            <label className="text-slate-700 font-bold block mb-1">
                              Invoice Classification <span className="text-blue-600">*</span>
                            </label>
                            <select
                              value={formData.invoice_classification}
                              onChange={(e) => setFormData({ ...formData, invoice_classification: e.target.value as any })}
                              className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-blue-50/30 text-blue-900 font-extrabold focus:border-blue-600 focus:outline-none cursor-pointer"
                            >
                              <option value="B2B">B2B (Registered Business)</option>
                              <option value="B2C">B2C (Retail / Consumer)</option>
                              <option value="B2G">B2G (Government Entity)</option>
                            </select>
                          </div>

                          {/* Supplier GSTIN */}
                          <div>
                            <label className="text-slate-700 font-bold block mb-1">Supplier GSTIN</label>
                            <input
                              type="text"
                              maxLength={15}
                              value={formData.supplier_gstin}
                              onChange={(e) => setFormData({ ...formData, supplier_gstin: e.target.value.toUpperCase() })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono font-bold focus:border-blue-600 focus:outline-none uppercase"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Invoice Number */}
                          <div>
                            <label className="text-slate-700 font-bold block mb-1">
                              Supplier Invoice No. <span className="text-blue-600">*</span>
                            </label>
                            <input
                              type="text"
                              value={formData.supplier_invoice_no || formData.invoice_number}
                              onChange={(e) => setFormData({
                                ...formData,
                                supplier_invoice_no: e.target.value,
                                invoice_number: e.target.value,
                              })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono font-bold focus:border-blue-600 focus:outline-none"
                              required
                            />
                          </div>

                          {/* Voucher Date */}
                          <div>
                            <label className="text-slate-700 font-bold block mb-1">Voucher Date</label>
                            <input
                              type="text"
                              value={formData.date}
                              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono focus:border-blue-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* State & Profile Match */}
                        <div>
                          <label className="text-slate-700 font-bold block mb-1">Supplier State Location</label>
                          <select
                            value={formData.supplier_state}
                            onChange={(e) => handleStateSelect(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
                          >
                            {GST_STATES.map((st) => (
                              <option key={st.code} value={st.name}>
                                {st.code} - {st.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Next Button */}
                        <div className="pt-3 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setCurrentFormStep(2)}
                            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-blue-600/20"
                          >
                            <span>Next: Items & Tax (60%)</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* STEP 2: REMAINING 60% FORM FIELDS */}
                    {currentFormStep === 2 && (
                      <div className="space-y-4 text-xs animate-in fade-in duration-150">
                        {/* Profile-Linked Default State Tax Routing Model with Interactive Selector Engine Toggle */}
                        <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="font-extrabold text-blue-900 flex items-center gap-1.5">
                              <span>Tax Selection Routing:</span>
                              <span className="font-bold text-blue-700">
                                {(formData.tax_type || (formData.supplier_state_code === registeredHomeStateCode ? 'CGST_SGST' : 'IGST')) === 'CGST_SGST'
                                  ? 'Intra-State (CGST + SGST)'
                                  : 'Inter-State (IGST)'}
                              </span>
                            </div>
                            <p className="text-[11px] text-blue-700/80 mt-0.5">
                              Supplier State: <strong>{formData.supplier_state || 'Delhi'} ({formData.supplier_state_code || '07'})</strong> | Registered Profile: <strong>Code {registeredHomeStateCode}</strong>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleTaxTypeChange('CGST_SGST')}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                (formData.tax_type || (formData.supplier_state_code === registeredHomeStateCode ? 'CGST_SGST' : 'IGST')) === 'CGST_SGST'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Intra-State (CGST+SGST)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTaxTypeChange('IGST')}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                (formData.tax_type || (formData.supplier_state_code === registeredHomeStateCode ? 'CGST_SGST' : 'IGST')) === 'IGST'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Inter-State (IGST)
                            </button>
                          </div>
                        </div>

                        {/* Taxable Value */}
                        <div>
                          <label className="text-slate-700 font-bold block mb-1">
                            Taxable Goods Value (₹) <span className="text-blue-600">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                            <IndianAmountInput
                              step="0.01"
                              value={formData.taxable_value || ''}
                              onValueChange={(value) => handleTaxableChange(parseFloat(value || '0'), formData.gst_rate)}
                              className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono text-base font-extrabold focus:border-blue-600 focus:outline-none"
                              required
                            />
                          </div>
                        </div>

                        {/* Adaptive Percentage Selector Block */}
                        <div className="space-y-1.5">
                          <label className="text-slate-700 font-bold block">
                            GST Tax Rate (%): Static Slabs & Custom Manual Box
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            {staticSlabs.map((slab) => (
                              <button
                                key={slab}
                                type="button"
                                onClick={() => handleSelectStaticSlab(slab)}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                  formData.gst_rate === slab && !formData.custom_gst_rate
                                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-500/20'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {slab}%
                              </button>
                            ))}

                            <div className="flex items-center gap-1 ml-2">
                              <span className="text-slate-500 font-bold text-xs">Custom:</span>
                              <div className="relative w-24">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={formData.custom_gst_rate || ''}
                                  onChange={(e) => handleCustomRateInput(e.target.value)}
                                  className="w-full px-2.5 py-1.5 pr-6 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-blue-600 focus:outline-none"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Tax Matrix Display */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500 block text-[11px]">CGST</span>
                            <span className="font-mono font-bold text-slate-800">{formatCurrency(formData.cgst)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[11px]">SGST</span>
                            <span className="font-mono font-bold text-slate-800">{formatCurrency(formData.sgst)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[11px]">IGST</span>
                            <span className="font-mono font-bold text-slate-800">{formatCurrency(formData.igst)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-blue-600 block text-[11px] font-extrabold">Grand Total</span>
                            <span className="font-mono font-black text-blue-700 text-sm">{formatCurrency(formData.grand_total)}</span>
                          </div>
                        </div>

                        {/* Payment Status, Payment Mode, and Notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-slate-700 font-bold block mb-1">Payment Status</label>
                            <select
                              value={formData.payment_status}
                              onChange={(e) => { const next = e.target.value as 'PAID' | 'UNPAID'; setFormData({ ...formData, payment_status: next, paid_amount: next === 'PAID' ? formData.grand_total : 0 }); }}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
                            >
                              <option value="PAID">Paid</option>
                              <option value="UNPAID">Unpaid / Partially Paid</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-slate-700 font-bold block mb-1">Notes</label>
                            <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:outline-none" />
                          </div>
                          {formData.payment_status === 'UNPAID' && <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><label className="text-slate-700 font-bold block mb-1">Paid Amount (₹)</label><IndianAmountInput min="0" max={formData.grand_total} step="0.01" value={formData.paid_amount ?? 0} onValueChange={value=>setFormData({...formData,paid_amount:Math.max(0,Number(value)||0)})} className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"/><label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={Number(formData.paid_amount||0)>=formData.grand_total&&formData.grand_total>0} onChange={e=>setFormData({...formData,payment_status:e.target.checked?'PAID':'UNPAID',paid_amount:e.target.checked?formData.grand_total:0})}/> Mark the full bill amount as paid</label><p className="mt-1 text-xs text-slate-600">Remaining payable: {formatCurrency(Math.max(0,formData.grand_total-Math.min(formData.grand_total,Number(formData.paid_amount||0))))}</p></div>}
                          {(formData.payment_status === 'PAID' || Number(formData.paid_amount || 0) > 0) && <div className="sm:col-span-2"><label className="text-slate-700 font-bold block mb-2">Payment Mode <span className="text-rose-600">*</span></label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setFormData({...formData,payment_mode:'CASH'})} className={`py-2 rounded-lg border text-sm font-bold ${(formData.payment_mode || 'CASH')==='CASH'?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-700'}`}>Cash</button><button type="button" onClick={()=>setFormData({...formData,payment_mode:'BANK/CHECK'})} className={`py-2 rounded-lg border text-sm font-bold ${formData.payment_mode==='BANK/CHECK'?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-700'}`}>Bank / Check</button></div>{formData.payment_mode==='BANK/CHECK'&&<p className="mt-1 text-xs text-blue-700">Paid amounts are routed to the Bank Ledger and BRS.</p>}</div>}
                        </div>

                        {/* Bottom Actions: Save Purchase Entry */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setCurrentFormStep(1)}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            ← Back to Step 1
                          </button>

                          <button
                            type="button"
                            onClick={handleSavePurchase}
                            disabled={saving}
                            className="px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/25 active:scale-95 transition-all"
                          >
                            <Save className="w-4 h-4" />
                            <span>{saving ? 'Saving...' : '[Save Purchase Entry]'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                  </div>

                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
