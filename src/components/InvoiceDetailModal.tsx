import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  Share2,
  FileJson,
  Settings as SettingsIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  QrCode,
  Copy,
  Receipt,
  FileText,
  Smartphone,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import {
  buildPdf,
  buildPngBlob,
  downloadBlob,
  downloadPdf,
  downloadJson,
  shareFile,
  sharePdf,
  shareJson,
} from '../utils/pdfShare';
import { Invoice, CompanyProfile, AppSettings } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { numberToIndianWords } from '../utils/numberToWords';
import { InvoiceSheet } from './InvoiceSheet';
import { loadPrintSettings, pageWidthPx, thermalWidthPx } from '../utils/printSettings';


/** Scales a fixed-width page (A4 / thermal) down to fit narrow phone screens. The PDF/print is NOT scaled. */
const FitToWidth: React.FC<{ designWidth: number; children: React.ReactNode }> = ({ designWidth, children }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [innerH, setInnerH] = useState(0);

  useEffect(() => {
    const measure = () => {
      const parent = outerRef.current?.parentElement;
      if (parent) {
        const avail = parent.clientWidth - 8;
        setScale(Math.min(1, avail / designWidth));
      }
      if (innerRef.current) setInnerH(innerRef.current.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' && innerRef.current ? new ResizeObserver(measure) : null;
    if (ro && innerRef.current) ro.observe(innerRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [designWidth]);

  return (
    <div
      ref={outerRef}
      className="invoice-fit-outer shadow-md"
      style={{ width: designWidth * scale, height: innerH ? innerH * scale : undefined }}
    >
      <div
        ref={innerRef}
        className="invoice-fit-inner"
        style={{ width: designWidth, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
};

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  company: CompanyProfile | null;
  settings: AppSettings;
  onClose: () => void;
}

export type InvoiceTheme =
  | 'STANDARD'
  | 'TALLY'
  | 'LANDSCAPE_1'
  | 'LANDSCAPE_2'
  | 'GST_THEME_1'
  | 'MODERN_ELITE'
  | 'GST_THEME_2'
  | 'GST_THEME_3'
  | 'THERMAL_80MM';

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  company,
  settings,
  onClose,
}) => {
  // Print settings chosen in Settings > Invoice Print (re-read every time an invoice is opened)
  const [ps] = useState(() => loadPrintSettings());
  const validThemes = ['STANDARD', 'TALLY', 'GST_THEME_1', 'MODERN_ELITE', 'LANDSCAPE_1', 'GST_THEME_2'];
  const [activeTheme, setActiveTheme] = useState<InvoiceTheme>(
    (validThemes.includes(ps.regular.theme) ? ps.regular.theme : 'STANDARD') as InvoiceTheme
  );
  const [selectedColor, setSelectedColor] = useState<string>(ps.regular.color || '#2563eb');
  const [showPrintChooser, setShowPrintChooser] = useState(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  // Last generated PDF, reused so a 2nd tap on Share is instant (browsers need a fresh tap for the share sheet)
  const pdfCache = useRef<{ key: string; blob: Blob } | null>(null);

  if (!invoice) return null;

  const isQuotation = (invoice.type as unknown as string) === 'QUOTATION' || invoice.invoice_number.startsWith('EST-') || invoice.invoice_number.startsWith('QUO-');

  // Fallback to local storage if user recently drew/updated signature or logo
  const signatureToDisplay = company?.signature_base64 || null;
  const logoToDisplay = company?.logo_base64 || null;

  // Complete seller business address with pincode
  const sellerAddressLine = [
    company?.address,
    company?.city,
    company?.state,
    company?.pincode ? `PIN - ${company.pincode}` : '',
  ].filter(Boolean).join(', ');

  // Complete buyer customer address with pincode
  const buyerAddressLine = [
    invoice.party_address,
    invoice.party_pincode ? `PIN - ${invoice.party_pincode}` : '',
  ].filter(Boolean).join(', ');

  const colors = [
    '#2563eb', // Blue
    '#059669', // Emerald
    '#0d9488', // Teal
    '#7c3aed', // Purple
    '#db2777', // Pink
    '#dc2626', // Red
    '#ea580c', // Orange
    '#334155', // Slate
  ];

  const flash = (msg: string | null, ms = 3000) => {
    setStatusNotice(msg);
    if (msg) setTimeout(() => setStatusNotice((cur) => (cur === msg ? null : cur)), ms);
  };

  const docLabel = isQuotation ? 'Quotation' : 'Tax-Invoice';
  const pdfFileName = `${docLabel}-${String(invoice.invoice_number).replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
  const isThermal = activeTheme === 'THERMAL_80MM';
  const isLandscape =
    activeTheme === 'LANDSCAPE_1' ||
    activeTheme === 'LANDSCAPE_2' ||
    (activeTheme === 'STANDARD' && ps.regular.orientation === 'landscape');
  const regularWidthPx = pageWidthPx(ps.regular.pageSize, ps.regular.orientation);

  // Builds (or re-uses) the PDF of the invoice exactly as currently displayed (layout + print settings)
  const getPdfBlob = async (): Promise<Blob> => {
    const el = document.getElementById('printable-invoice');
    if (!el) throw new Error('Invoice is not visible');
    const key = `${invoice.id}|${activeTheme}|${selectedColor}|${JSON.stringify(ps)}|${JSON.stringify(invoice)}|${JSON.stringify(company)}`;
    if (pdfCache.current?.key === key) return pdfCache.current.blob;
    const sheetRegular = activeTheme === 'STANDARD';
    const blob = await buildPdf({
      element: el,
      fileName: pdfFileName,
      thermal: isThermal,
      thermalWidthMm: Number(ps.thermal.pageWidth),
      orientation: isLandscape ? 'landscape' : 'portrait',
      pageSize: sheetRegular || !isThermal ? (ps.regular.pageSize.toLowerCase() as 'a4' | 'a5' | 'letter') : 'a4',
      pageNumbers: sheetRegular && ps.regular.showPageNumbers,
    });
    pdfCache.current = { key, blob };
    return blob;
  };

  // Real browser/system print. @page is set so the paper size matches the chosen printer type.
  const runPrint = (kind: 'regular' | 'thermal') => {
    try {
      const style = document.createElement('style');
      style.setAttribute('data-print-page', '1');
      const pageWidth = ps.regular.pageSize === 'A5' ? '148mm' : ps.regular.pageSize === 'LETTER' ? '216mm' : '210mm';
      const thermalWidth = `${ps.thermal.pageWidth}mm`;
      style.textContent = kind === 'thermal'
        ? `@page { size: ${ps.thermal.pageWidth}mm auto; margin: 0; } :root { --cotrix-thermal-width: ${thermalWidth}; }`
        : `@page { size: ${ps.regular.pageSize === 'LETTER' ? 'letter' : ps.regular.pageSize} ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; } :root { --cotrix-page-width: ${isLandscape ? (ps.regular.pageSize === 'A5' ? '210mm' : '279mm') : pageWidth}; }`;
      document.head.appendChild(style);
      const cleanup = () => {
        style.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
    } catch (e) {
      console.error('Print failed:', e);
    }
  };

  // Print button -> Thermal or Regular. If one printer type is marked default in Settings it is used directly.
  const startPrint = (kind: 'regular' | 'thermal') => {
    setShowPrintChooser(false);
    if (kind === 'thermal') {
      setActiveTheme('THERMAL_80MM');
    } else if (activeTheme === 'THERMAL_80MM') {
      setActiveTheme((validThemes.includes(ps.regular.theme) ? ps.regular.theme : 'STANDARD') as InvoiceTheme);
    }
    // pass the chosen kind explicitly: this closure still holds the layout from before the switch
    setTimeout(() => runPrint(kind), 350);
  };

  const handlePrintClick = () => {
    if (ps.regular.isDefault && !ps.thermal.isDefault) return startPrint('regular');
    if (ps.thermal.isDefault && !ps.regular.isDefault) return startPrint('thermal');
    setShowPrintChooser(true);
  };

  // Download PDF (html2pdf.js) - saved to the device immediately
  const handleDownloadHighResPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setStatusNotice('Generating PDF document...');
    try {
      const blob = await getPdfBlob();
      downloadPdf(blob, pdfFileName);
      flash('\u2713 PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF export failed:', err);
      flash('PDF could not be created. Please try again.', 4000);
    } finally {
      setIsExporting(false);
    }
  };

  // Share PDF using the native share sheet when supported, otherwise download it.
  const handleShareBinaryAsset = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setStatusNotice('Preparing PDF to share...');
    try {
      const blob = await getPdfBlob();
      const label = isQuotation ? 'Quotation' : 'Invoice';
      const text =
        `${label} ${invoice.invoice_number}\n` +
        `${company?.trade_name ? `From: ${company.trade_name}\n` : ''}` +
        `To: ${invoice.party_name}\n` +
        `Date: ${formatDate(invoice.date)}\n` +
        `Total: ${formatCurrency(invoice.grand_total, settings.currency)}\n\n` +
        'Please find the attached document.';
      await sharePdf({
        blob,
        fileName: pdfFileName,
        title: `${label} ${invoice.invoice_number}`,
        text,
        onStatus: (m) => flash(m, 4000),
      });
    } catch (err) {
      console.error('Share failed:', err);
      flash('Could not prepare the PDF. Please try again.', 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleInvoiceImage = async (share: boolean) => {
    if (isExporting) return;
    setIsExporting(true);
    setStatusNotice(share ? 'Preparing invoice image to share...' : 'Preparing invoice image...');
    try {
      const el = document.getElementById('printable-invoice');
      if (!el) throw new Error('Invoice is not visible');
      const blob = await buildPngBlob(el, regularWidthPx);
      const baseName = `${isQuotation ? 'Quotation' : 'Invoice'}-${String(invoice.invoice_number).replace(/[\\/:*?"<>|]+/g, '-')}`;
      if (share) {
        await shareFile({
          blob,
          fileName: `${baseName}.png`,
          title: `${isQuotation ? 'Quotation' : 'Invoice'} ${invoice.invoice_number}`,
          text: `${isQuotation ? 'Quotation' : 'Invoice'} ${invoice.invoice_number} - ${formatCurrency(invoice.grand_total, settings.currency)}`,
          mimeType: 'image/png', extension: '.png', onStatus: (m) => flash(m, 4000),
        });
      } else {
        downloadBlob(blob, `${baseName}.png`);
        flash('Invoice image download started. For very long or multi-page documents, use Download PDF for the complete paginated document.');
      }
    } catch (err) {
      console.error('Invoice image export failed:', err);
      flash('Invoice image could not be created. Please use Download PDF or try again.', 4000);
    } finally { setIsExporting(false); }
  };

  const handleInvoiceJson = async (share: boolean) => {
    if (isExporting) return;
    setIsExporting(true);
    setStatusNotice(share ? 'Preparing invoice JSON to share...' : 'Preparing invoice JSON...');
    try {
      const payload = { invoice, company: company || null, documentType: isQuotation ? 'QUOTATION' : 'INVOICE' };
      const fileName = `${isQuotation ? 'Quotation' : 'Invoice'}-${String(invoice.invoice_number).replace(/[\\/:*?"<>|]+/g, '-')}.json`;
      if (share) {
        await shareJson(payload, fileName, `${isQuotation ? 'Quotation' : 'Invoice'} ${invoice.invoice_number}`, 'Invoice data export', (message) => flash(message, 4000));
      } else {
        downloadJson(payload, fileName);
        flash('Invoice JSON download started.');
      }
    } catch (err) {
      console.error('Invoice JSON export failed:', err);
      flash('Invoice JSON could not be exported. Please try again.', 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const amountInWords = numberToIndianWords(invoice.grand_total);

  // Use stored item-level taxes when present; calculate from taxable value/rate for legacy rows.
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const itemTax = (it: (typeof items)[number]) => {
    const stored = Number(it.cgst || 0) + Number(it.sgst || 0) + Number(it.igst || 0);
    return stored > 0 ? stored : Number(it.taxable || 0) * Number(it.gstRate || 0) / 100;
  };
  const taxRows = Object.values(items.reduce<Record<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number }>>((acc, it) => {
    const hsn = String(it.hsn || '').trim() || '—';
    const rate = Number(it.gstRate || 0);
    const key = `${hsn}|${rate}`;
    if (!acc[key]) acc[key] = { hsn, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
    const rowTax = itemTax(it);
    acc[key].taxable += Number(it.taxable || 0);
    acc[key].totalTax += rowTax;
    const stored = Number(it.cgst || 0) + Number(it.sgst || 0) + Number(it.igst || 0);
    if (stored > 0) { acc[key].cgst += Number(it.cgst || 0); acc[key].sgst += Number(it.sgst || 0); acc[key].igst += Number(it.igst || 0); }
    else if (invoice.is_inter_state) acc[key].igst += rowTax;
    else { acc[key].cgst += rowTax / 2; acc[key].sgst += rowTax / 2; }
    return acc;
  }, {}));
  const itemTaxTotal = items.reduce((sum, it) => sum + itemTax(it), 0);
  const invoiceTaxTotal = Number(invoice.cgst_total || 0) + Number(invoice.sgst_total || 0) + Number(invoice.igst_total || 0);
  const totalTax = itemTaxTotal || invoiceTaxTotal;
  const cgstTotal = Number(invoice.cgst_total || 0) || (!invoice.is_inter_state && itemTaxTotal ? Number(items.reduce((s, it) => s + Number(it.cgst || 0), 0)) || itemTaxTotal / 2 : 0);
  const sgstTotal = Number(invoice.sgst_total || 0) || (!invoice.is_inter_state && itemTaxTotal ? Number(items.reduce((s, it) => s + Number(it.sgst || 0), 0)) || itemTaxTotal / 2 : 0);
  const igstTotal = Number(invoice.igst_total || 0) || (invoice.is_inter_state && itemTaxTotal ? Number(items.reduce((s, it) => s + Number(it.igst || 0), 0)) || itemTaxTotal : 0);
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      {statusNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-70 bg-slate-900/95 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-2xl border border-slate-700 backdrop-blur-md animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          {statusNotice}
        </div>
      )}
      <div
        className="w-full max-w-4xl min-h-dvh sm:min-h-0 sm:max-h-[96dvh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden text-slate-800 font-sans border border-slate-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* TOP TOOLBAR: Back / Close, Title, Print, Thermal, Share, Settings         */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Preview</span>
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {invoice.invoice_number}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintClick}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print (Thermal or Regular printer)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              onClick={handleDownloadHighResPdf}
              disabled={isExporting}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Download High-Resolution PDF Asset"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              onClick={handleShareBinaryAsset}
              disabled={isExporting}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Share High-Res Invoice Render"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* THEMES HORIZONTAL CAROUSEL TABS (Matching Video 01:43 - 02:10)            */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/70 overflow-x-auto shrink-0 scrollbar-none text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Theme:
          </span>

          <button
            onClick={() => setActiveTheme('STANDARD')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'STANDARD'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Standard
          </button>

          <button
            onClick={() => setActiveTheme('TALLY')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'TALLY'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Tally Theme
          </button>

          <button
            onClick={() => setActiveTheme('GST_THEME_1')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'GST_THEME_1'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            GST Theme 1
          </button>

          <button
            onClick={() => setActiveTheme('MODERN_ELITE')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'MODERN_ELITE'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Modern Elite
          </button>

          <button
            onClick={() => setActiveTheme('LANDSCAPE_1')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'LANDSCAPE_1'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Landscape 1
          </button>

          <button
            onClick={() => setActiveTheme('GST_THEME_2')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'GST_THEME_2'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            GST Theme 2
          </button>

          <button
            onClick={() => setActiveTheme('THERMAL_80MM')}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              activeTheme === 'THERMAL_80MM'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Thermal
          </button>
        </div>

        {/* Color Palette Swatches (When GST Theme 1 is active, matching video at 02:01) */}
        {(activeTheme === 'GST_THEME_1' || activeTheme === 'STANDARD') && (
          <div className="flex items-center gap-2 px-6 py-2 bg-slate-100/60 border-b border-slate-200 shrink-0">
            <span className="text-[11px] font-semibold text-slate-500 mr-2">Color Palette:</span>
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                  selectedColor === c ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-80 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* INVOICE CANVAS RENDERING AREA (SCROLLABLE & PRINTABLE)                     */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-auto p-3 sm:p-8 bg-slate-100 flex justify-center items-start">
          
          {/* STANDARD (Regular) layout - driven by Settings > Invoice Print > Regular */}
          {activeTheme === 'STANDARD' && (
            <FitToWidth designWidth={regularWidthPx}>
              <InvoiceSheet
                mode="regular"
                invoice={invoice}
                company={company}
                isQuotation={isQuotation}
                regular={ps.regular}
                thermal={ps.thermal}
                color={selectedColor}
                logo={logoToDisplay}
                signature={signatureToDisplay}
              />
            </FitToWidth>
          )}

          {/* ======================================================================= */}
          {/* 1. TALLY THEME (Classic Accounting Grid matching video 01:43 - 01:53)    */}
          {/* ======================================================================= */}
          {activeTheme === 'TALLY' && (
            <div
              id="printable-invoice"
              className="w-full max-w-2xl bg-white border-2 border-slate-800 p-6 shadow-sm text-black text-xs font-sans print:border-none print:shadow-none print:p-0"
            >
              {/* Header Title */}
              <div className="text-center font-black text-lg sm:text-xl uppercase tracking-wider pb-2 border-b-2 border-slate-800">
                {isQuotation ? 'Quotation / Estimate' : 'Tax Invoice'}
              </div>

              {/* Company & Invoice Meta Grid */}
              <div className="grid grid-cols-12 border-b-2 border-slate-800">
                {/* Left: LOGO & Company info */}
                <div className="col-span-7 p-3 border-r-2 border-slate-800 flex items-start gap-3">
                  <div className="w-14 h-14 bg-slate-100 border border-slate-300 rounded flex items-center justify-center font-bold text-black text-xs shrink-0">
                    {logoToDisplay ? (
                      <img src={logoToDisplay} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      'LOGO'
                    )}
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-black">
                      {company?.trade_name || company?.name || 'My Company'}
                    </h3>
                    <div className="text-[11px] text-black mt-0.5">
                      {company?.phone ? <>Phone: <span className="font-semibold text-black">{company.phone}</span></> : null}
                    </div>
                    {company?.gstin && (
                      <div className="text-[10px] font-mono text-black">
                        GSTIN: <strong>{company.gstin}</strong>
                      </div>
                    )}
                    {sellerAddressLine && (
                      <div className="text-[10px] text-black max-w-xs mt-0.5">
                        {sellerAddressLine}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Invoice Details */}
                <div className="col-span-5 p-3 space-y-1 text-[11px]">
                  <div className="font-bold text-black pb-1 border-b border-slate-200">
                    {isQuotation ? 'Quotation Details:' : 'Invoice Details:'}
                  </div>
                  <div>
                    <span className="text-black">{isQuotation ? 'Quotation No.:' : 'Invoice No.:'}</span>{' '}
                    <strong className="font-mono text-black">{invoice.invoice_number}</strong>
                  </div>
                  <div>
                    <span className="text-black">Date:</span>{' '}
                    <strong className="text-black">{invoice.date}</strong>
                  </div>
                  <div>
                    <span className="text-black">Place of Supply:</span>{' '}
                    <strong className="text-black">{invoice.place_of_supply}</strong>
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="p-3 border-b-2 border-slate-800 bg-slate-50/40">
                <div className="font-bold text-[11px] text-black uppercase tracking-wider mb-0.5">
                  Bill To:
                </div>
                <div className="font-black text-sm text-black">{invoice.party_name}</div>
                {invoice.party_phone && (
                  <div className="text-[11px] text-black mt-0.5">
                    Contact No: <strong>{invoice.party_phone}</strong>
                  </div>
                )}
                {invoice.party_gstin && (
                  <div className="text-[11px] font-mono text-black">
                    GSTIN: <strong>{invoice.party_gstin}</strong>
                  </div>
                )}
                {buyerAddressLine && (
                  <div className="text-[11px] text-black mt-0.5">
                    Address: <span>{buyerAddressLine}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="border-b-2 border-slate-800 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-800 bg-slate-100/80 text-[11px] font-bold text-black">
                      <th className="p-2 border-r border-slate-800 w-8 text-center">#</th>
                      <th className="p-2 border-r border-slate-800">Item Name</th>
                      <th className="p-2 border-r border-slate-800 text-center w-16">HSN/SAC</th>
                      <th className="p-2 border-r border-slate-800 text-center w-12">Qty</th>
                      <th className="p-2 border-r border-slate-800 text-right w-20">Price/Unit (₹)</th>
                      <th className="p-2 border-r border-slate-800 text-right w-20">Discount (%)</th>
                      <th className="p-2 border-r border-slate-800 text-right w-24">GST (₹)</th>
                      <th className="p-2 text-right w-24">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 text-[11px]">
                    {items.map((it, idx) => {
                      const taxAmt = itemTax(it);
                      return (
                        <tr key={idx} className="align-top">
                          <td className="p-2 border-r border-slate-800 text-center font-mono">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-800 font-semibold">{it.name}</td>
                          <td className="p-2 border-r border-slate-800 text-center font-mono text-black">{String(it.hsn || '').trim() || '—'}</td>
                          <td className="p-2 border-r border-slate-800 text-center font-mono">{it.qty}</td>
                          <td className="p-2 border-r border-slate-800 text-right font-mono">{formatCurrency(it.rate)}</td>
                          <td className="p-2 border-r border-slate-800 text-right font-mono">{Number(it.discountPercent || 0)}%<div className="text-[9px]">{formatCurrency(Number(it.rate || 0) * Number(it.qty || 0) * Number(it.discountPercent || 0) / 100)}</div></td>
                          <td className="p-2 border-r border-slate-800 text-right font-mono text-black">
                            {formatCurrency(taxAmt)}
                            <div className="text-[9px] text-black">({it.gstRate}%)</div>
                          </td>
                          <td className="p-2 text-right font-bold font-mono">{formatCurrency(it.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-800 font-bold bg-slate-50 text-[11px]">
                      <td colSpan={3} className="p-2 border-r border-slate-800 text-right">Total</td>
                      <td className="p-2 border-r border-slate-800 text-center font-mono">{totalQty}</td>
                      <td className="p-2 border-r border-slate-800 text-right font-mono">-</td>
                      <td className="p-2 border-r border-slate-800 text-right font-mono">-</td>
                      <td className="p-2 border-r border-slate-800 text-right font-mono">
                        {formatCurrency(totalTax)}
                      </td>
                      <td className="p-2 text-right font-mono">{formatCurrency(invoice.grand_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Tax Summary & Totals Split Matrix */}
              <div className="grid grid-cols-12 border-b-2 border-slate-800">
                {/* Left: Tax Summary Table matching video */}
                <div className="col-span-7 border-r-2 border-slate-800 p-2 space-y-2">
                  <div className="font-bold text-[10px] text-black uppercase tracking-wider">
                    Tax Summary:
                  </div>
                  <table className="w-full text-[10px] border border-slate-800 text-center">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-800 font-bold">
                        <th className="p-1 border-r border-slate-800">HSN/SAC</th>
                        <th className="p-1 border-r border-slate-800">Taxable Amt (₹)</th>
                        {invoice.is_inter_state ? (
                          <>
                            <th className="p-1 border-r border-slate-800">IGST Rate</th>
                            <th className="p-1 border-r border-slate-800">IGST Amt (₹)</th>
                          </>
                        ) : (
                          <>
                            <th className="p-1 border-r border-slate-800">CGST</th>
                            <th className="p-1 border-r border-slate-800">SGST</th>
                          </>
                        )}
                        <th className="p-1">Total Tax (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300 font-mono">
                      {taxRows.map((row) => (
                        <tr key={`${row.hsn}|${row.rate}`}>
                          <td className="p-1 border-r border-slate-800">{row.hsn}</td>
                          <td className="p-1 border-r border-slate-800">{formatCurrency(row.taxable)}</td>
                          {invoice.is_inter_state ? (
                            <><td className="p-1 border-r border-slate-800">{row.rate}%</td><td className="p-1 border-r border-slate-800">{formatCurrency(row.igst)}</td></>
                          ) : (
                            <><td className="p-1 border-r border-slate-800">{formatCurrency(row.cgst)}</td><td className="p-1 border-r border-slate-800">{formatCurrency(row.sgst)}</td></>
                          )}
                          <td className="p-1 font-bold">{formatCurrency(row.totalTax)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-800 font-bold"><td className="p-1 text-right" colSpan={invoice.is_inter_state ? 4 : 4}>Total</td><td className="p-1">{formatCurrency(totalTax)}</td></tr>
                    </tbody>
                  </table>

                  {/* Amount in words */}
                  <div className="pt-2 text-[10px] leading-tight">
                    <span className="text-black font-semibold block">Invoice Amount in Words:</span>
                    <strong className="text-black capitalize">{amountInWords}</strong>
                  </div>
                </div>

                {/* Right: Subtotal, Received, Balance */}
                <div className="col-span-5 p-3 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-black">
                    <span>Sub Total:</span>
                    <span>{formatCurrency(invoice.sub_total)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-black pt-1 border-t border-slate-200">
                    <span>Total Amount:</span>
                    <span className="text-sm">{formatCurrency(invoice.grand_total)}</span>
                  </div>
                  <div className="flex justify-between text-black">
                    <span>Received:</span>
                    <span>{formatCurrency(invoice.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-black pt-1 border-t border-slate-200">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(invoice.balance_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom: Signatory & Notes */}
              <div className="p-4 grid grid-cols-2 gap-4 items-end">
                <div className="text-[10px] text-black space-y-1">
                  {invoice.notes && (
                    <div>
                      <span className="font-semibold text-black">Note:</span> {invoice.notes}
                    </div>
                  )}
                  <div className="text-[9px] text-black">
                    This is a computer generated invoice and does not require physical stamp.
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-block text-center border-2 border-dashed border-slate-400 p-2.5 rounded-lg min-w-[170px] bg-white">
                    <div className="text-[10px] font-bold text-black">For {company?.trade_name || company?.name || 'My Company'}:</div>
                    {signatureToDisplay ? (
                      <img
                        src={signatureToDisplay}
                        alt="Authorized Signature"
                        className="h-12 max-w-[150px] object-contain mx-auto my-1"
                      />
                    ) : (
                      <div className="h-10 flex items-center justify-center text-[10px] text-black italic">
                        (Authorized Signatory)
                      </div>
                    )}
                    <div className="text-[10px] font-bold text-black border-t border-slate-300 pt-1">
                      {company?.signature_title || 'Authorized Signatory'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================================= */}
          {/* 2. GST THEME 1 (Modern Color-accented Header matching video 02:01)        */}
          {/* ======================================================================= */}
          {activeTheme === 'GST_THEME_1' && (
            <div
              id="printable-invoice"
              className="w-full max-w-2xl bg-white rounded-xl border border-slate-300 shadow-sm text-slate-900 text-xs font-sans overflow-hidden print:border-none print:shadow-none"
            >
              {/* Colored Top Header Banner */}
              <div
                style={{ backgroundColor: selectedColor }}
                className="text-white p-5 flex items-center justify-between"
              >
                <div>
                  <h1 className="text-xl font-black tracking-tight uppercase">
                    {isQuotation ? 'Quotation' : 'Tax Invoice'}
                  </h1>
                  <p className="text-xs opacity-90 mt-0.5">
                    {isQuotation ? 'Estimate / Quotation Copy' : 'Original For Recipient'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold opacity-90">
                    {isQuotation ? 'Quotation' : 'Invoice'} #{invoice.invoice_number}
                  </div>
                  <div className="text-xs opacity-80">Date: {invoice.date}</div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Company & Bill To Row */}
                <div className="grid grid-cols-2 gap-6 pb-6 border-b border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Sold By:
                    </span>
                    <h3 className="font-bold text-sm text-slate-900">
                      {company?.trade_name || company?.name || 'My Company'}
                    </h3>
                    {company?.phone && <div className="text-slate-600 text-[11px] mt-0.5">Phone: {company.phone}</div>}
                    {company?.gstin && (
                      <div className="text-slate-600 text-[11px] font-mono">GSTIN: {company.gstin}</div>
                    )}
                    {sellerAddressLine && (
                      <div className="text-slate-600 text-[11px] mt-0.5 max-w-xs">{sellerAddressLine}</div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Billed To:
                    </span>
                    <h3 className="font-bold text-sm text-slate-900">{invoice.party_name}</h3>
                    {invoice.party_phone && <div className="text-slate-600 text-[11px] mt-0.5">Phone: {invoice.party_phone}</div>}
                    {invoice.party_gstin && <div className="text-slate-600 text-[11px] font-mono">GSTIN: {invoice.party_gstin}</div>}
                    {buyerAddressLine && <div className="text-slate-600 text-[11px] mt-0.5">Address: {buyerAddressLine}</div>}
                    <div className="text-slate-600 text-[11px]">Place of Supply: {invoice.place_of_supply}</div>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr style={{ backgroundColor: `${selectedColor}15` }} className="font-bold text-slate-800 border-b border-slate-200">
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">Item Name</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Price</th>
                      <th className="p-2.5 text-right">Discount (%)</th>
                      <th className="p-2.5 text-right">GST</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-semibold text-slate-900">{it.name}</td>
                        <td className="p-2.5 text-center font-mono">{it.qty}</td>
                        <td className="p-2.5 text-right font-mono">{formatCurrency(it.rate)}</td>
                        <td className="p-2.5 text-right font-mono">{Number(it.discountPercent || 0)}%<div className="text-[10px]">{formatCurrency(Number(it.rate || 0) * Number(it.qty || 0) * Number(it.discountPercent || 0) / 100)}</div></td>
                        <td className="p-2.5 text-right font-mono text-slate-600">
                          {formatCurrency(itemTax(it))}
                        </td>
                        <td className="p-2.5 text-right font-bold font-mono text-slate-900">{formatCurrency(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals & Tax Split Card */}
                <div className="flex justify-end pt-4 border-t border-slate-200">
                  <div className="w-64 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(invoice.sub_total)}</span>
                    </div>
                    {invoice.is_inter_state ? (
                      <div className="flex justify-between text-slate-700">
                        <span>IGST:</span>
                        <span>{formatCurrency(igstTotal)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-slate-700">
                          <span>CGST:</span>
                          <span>{formatCurrency(cgstTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-700">
                          <span>SGST:</span>
                          <span>{formatCurrency(sgstTotal)}</span>
                        </div>
                      </>
                    )}
                    <div
                      style={{ color: selectedColor }}
                      className="flex justify-between font-black text-sm pt-2 border-t border-slate-200"
                    >
                      <span>Grand Total:</span>
                      <span>{formatCurrency(invoice.grand_total)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Received:</span>
                      <span>{formatCurrency(invoice.paid_amount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-600">
                      <span>Balance Due:</span>
                      <span>{formatCurrency(invoice.balance_amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Signature & Notes */}
                <div className="flex justify-between items-end pt-4 border-t border-slate-200">
                  <div className="text-[10px] text-slate-500 space-y-1">
                    {invoice.notes && (
                      <div><span className="font-semibold text-slate-700">Note:</span> {invoice.notes}</div>
                    )}
                    <div className="text-[9px] text-slate-400">This is a computer generated document.</div>
                  </div>
                  <div className="text-center border-2 border-dashed border-slate-300 p-2.5 rounded-lg min-w-[170px] bg-white">
                    <div className="text-[10px] font-bold text-slate-500">For {company?.trade_name || company?.name || 'My Company'}:</div>
                    {signatureToDisplay ? (
                      <img src={signatureToDisplay} alt="Authorized Signature" className="h-10 max-w-[140px] object-contain mx-auto my-1" />
                    ) : (
                      <div className="h-8 flex items-center justify-center text-[10px] text-slate-400 italic">(Authorized Signatory)</div>
                    )}
                    <div className="text-[9px] font-bold text-slate-800 border-t border-slate-200 pt-1">
                      {company?.signature_title || 'Authorized Signatory'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================================= */}
          {/* 3. MODERN ELITE THEME (Minimalist corporate matching video 02:04)         */}
          {/* ======================================================================= */}
          {activeTheme === 'MODERN_ELITE' && (
            <div
              id="printable-invoice"
              className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-slate-900 text-xs font-sans print:border-none print:shadow-none"
            >
              <div className="flex justify-between items-start pb-6 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    {company?.trade_name || company?.name || (isQuotation ? 'Quotation' : 'Tax Invoice')}
                  </h2>
                  {company?.phone && <div className="text-slate-500 text-[11px] mt-0.5">Phone: {company.phone}</div>}
                  {company?.gstin && <div className="text-slate-500 text-[11px] font-mono">GSTIN: {company.gstin}</div>}
                  {sellerAddressLine && <div className="text-slate-500 text-[11px] mt-0.5 max-w-xs">{sellerAddressLine}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-slate-400 uppercase">{isQuotation ? 'QUOTATION' : 'INVOICE'}</div>
                  <div className="text-base font-black text-blue-600 font-mono mt-0.5">{invoice.invoice_number}</div>
                  <div className="text-[11px] text-slate-500">{invoice.date}</div>
                </div>
              </div>

              <div className="py-6 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Customer
                </span>
                <div className="text-sm font-bold text-slate-800">{invoice.party_name}</div>
                <div className="text-slate-500">{invoice.party_phone} · {invoice.place_of_supply}</div>
                {invoice.party_gstin && <div className="text-slate-600 text-[11px] font-mono mt-0.5">GSTIN: {invoice.party_gstin}</div>}
                {buyerAddressLine && <div className="text-slate-600 text-[11px] mt-0.5">Address: {buyerAddressLine}</div>}
              </div>

              <div className="py-6 space-y-4">
                <div className="font-bold text-xs text-slate-400 uppercase tracking-wider">Billed Line Items</div>
                {items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <div className="font-bold text-slate-900">{it.name}</div>
                      <div className="text-[11px] text-slate-400">{it.qty} × {formatCurrency(it.rate)} · Discount {Number(it.discountPercent || 0)}% · GST {it.gstRate}%</div>
                    </div>
                    <div className="font-bold text-sm text-slate-900 font-mono">{formatCurrency(it.total)}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-100">
                <div className="text-left space-y-2">
                  <div className="text-[10px] text-slate-400">Computer Generated {isQuotation ? 'Quotation' : 'Tax Invoice'}</div>
                  <div className="border border-dashed border-slate-300 p-2 rounded-lg text-center min-w-[150px]">
                    <div className="text-[9px] font-bold text-slate-500">For {company?.trade_name || company?.name || 'Company'}:</div>
                    {signatureToDisplay ? (
                      <img src={signatureToDisplay} alt="Signature" className="h-10 max-w-[130px] object-contain mx-auto my-1" />
                    ) : (
                      <div className="h-8"></div>
                    )}
                    <div className="text-[9px] font-bold text-slate-700 border-t border-slate-200 pt-0.5">
                      {company?.signature_title || 'Authorized Signatory'}
                    </div>
                  </div>
                </div>

                <div className="w-56 space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(invoice.sub_total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Tax:</span>
                    <span>{formatCurrency(totalTax)}</span>
                  </div>
                  <div className="flex justify-between font-black text-base text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total:</span>
                    <span>{formatCurrency(invoice.grand_total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* THERMAL layout - driven by Settings > Invoice Print > Thermal */}
          {activeTheme === 'THERMAL_80MM' && (
            <FitToWidth designWidth={thermalWidthPx(ps.thermal.pageWidth)}>
              <InvoiceSheet
                mode="thermal"
                invoice={invoice}
                company={company}
                isQuotation={isQuotation}
                regular={ps.regular}
                thermal={ps.thermal}
                color={selectedColor}
                logo={logoToDisplay}
                signature={signatureToDisplay}
              />
            </FitToWidth>
          )}

          {/* ======================================================================= */}
          {/* 5. LANDSCAPE THEME 1 & 2                                                */}
          {/* ======================================================================= */}
          {(activeTheme === 'LANDSCAPE_1' || activeTheme === 'LANDSCAPE_2' || activeTheme === 'GST_THEME_2' || activeTheme === 'GST_THEME_3') && (
            <div
              id="printable-invoice"
              className="w-full max-w-3xl bg-white border border-slate-300 p-6 shadow-sm text-slate-900 text-xs font-sans print:border-none print:shadow-none"
            >
              <div className="flex justify-between items-start pb-4 border-b-2 border-slate-900">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{company?.trade_name || company?.name || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}</h2>
                  {company?.phone && <p className="text-slate-600 text-[11px]">Phone: {company.phone}</p>}
                  {company?.gstin && <p className="text-slate-600 text-[11px] font-mono">GSTIN: {company.gstin}</p>}
                  {sellerAddressLine && <p className="text-slate-600 text-[11px] max-w-sm mt-0.5">{sellerAddressLine}</p>}
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-500 uppercase">{isQuotation ? 'QUOTATION NO' : 'INVOICE NO'}</div>
                  <div className="text-base font-black text-slate-900 font-mono">{invoice.invoice_number}</div>
                  <div className="text-slate-500">{invoice.date}</div>
                </div>
              </div>

              <div className="py-4 grid grid-cols-2 gap-4 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Customer Details:</span>
                  <div className="font-bold text-sm text-slate-900">{invoice.party_name}</div>
                  {invoice.party_phone && <div className="text-slate-600">{invoice.party_phone}</div>}
                  {invoice.party_gstin && <div className="text-slate-600 font-mono mt-0.5">GSTIN: {invoice.party_gstin}</div>}
                  {buyerAddressLine && <div className="text-slate-600 mt-0.5">Address: {buyerAddressLine}</div>}
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Supply Location:</span>
                  <div className="font-semibold text-slate-800">{invoice.place_of_supply}</div>
                </div>
              </div>

              <table className="w-full text-left my-4 divide-y divide-slate-200">
                <thead>
                  <tr className="bg-slate-100 font-bold text-slate-800">
                    <th className="p-2">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Discount (%)</th>
                    <th className="p-2 text-right">GST</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-sans font-semibold text-slate-900">{it.name}</td>
                      <td className="p-2 text-center">{it.qty}</td>
                      <td className="p-2 text-right">{formatCurrency(it.rate)}</td>
                      <td className="p-2 text-right">{Number(it.discountPercent || 0)}%<div className="text-[10px]">{formatCurrency(Number(it.rate || 0) * Number(it.qty || 0) * Number(it.discountPercent || 0) / 100)}</div></td>
                      <td className="p-2 text-right">{formatCurrency(itemTax(it))}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{formatCurrency(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between items-end pt-4 border-t-2 border-slate-900">
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-600 capitalize">
                    Amount in words: <strong className="text-slate-900">{amountInWords}</strong>
                  </div>
                  <div className="border border-dashed border-slate-300 p-2 rounded-lg text-center min-w-[150px] inline-block">
                    <div className="text-[9px] font-bold text-slate-500">For {company?.trade_name || company?.name || 'Company'}:</div>
                    {signatureToDisplay ? (
                      <img src={signatureToDisplay} alt="Signature" className="h-10 max-w-[130px] object-contain mx-auto my-1" />
                    ) : (
                      <div className="h-8"></div>
                    )}
                    <div className="text-[9px] font-bold text-slate-700 border-t border-slate-200 pt-0.5">
                      {company?.signature_title || 'Authorized Signatory'}
                    </div>
                  </div>
                </div>

                <div className="text-right space-y-1 font-mono">
                  <div className="text-slate-600">Subtotal: {formatCurrency(invoice.sub_total)}</div>
                  <div className="text-slate-600">Tax: {formatCurrency(totalTax)}</div>
                  <div className="text-base font-black text-slate-900 pt-1 border-t border-slate-300">
                    Grand Total: {formatCurrency(invoice.grand_total)}
                  </div>
                  <div className="text-emerald-700 font-bold">Balance: {formatCurrency(invoice.balance_amount)}</div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ========================================================================= */}
        {/* BOTTOM ACTION BAR                                                         */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-3.5 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <button
              onClick={() => startPrint('thermal')}
              className="col-span-2 sm:col-auto justify-center px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              title="Print 80mm POS Thermal Receipt"
            >
              <Smartphone className="w-4 h-4 text-slate-600" />
              <span>Thermal Receipt</span>
            </button>
            <button
              onClick={handleDownloadHighResPdf}
              disabled={isExporting}
              className="justify-center px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Download standard high-res A4 PDF"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-indigo-600" />}
              <span>Download PDF</span>
            </button>
            <button
              onClick={handleShareBinaryAsset}
              disabled={isExporting}
              className="justify-center px-3.5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Share PDF or Image"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4 text-emerald-600" />}
              <span>Share PDF</span>
            </button>
            <button type="button" onClick={() => handleInvoiceImage(false)} disabled={isExporting} className="justify-center px-3.5 py-2.5 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50" title="Save invoice as PNG image">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}<span>Save as Image</span>
            </button>
            <button type="button" onClick={() => handleInvoiceImage(true)} disabled={isExporting} className="justify-center px-3.5 py-2.5 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50" title="Share invoice as PNG image">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}<span>Share Image</span>
            </button>
            <button type="button" onClick={() => handleInvoiceJson(false)} disabled={isExporting} className="justify-center px-3.5 py-2.5 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50" title="Download invoice data as JSON">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}<span>Download JSON</span>
            </button>
            <button type="button" onClick={() => handleInvoiceJson(true)} disabled={isExporting} className="justify-center px-3.5 py-2.5 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50" title="Share invoice data as JSON">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}<span>Share JSON</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handlePrintClick}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-500/25 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isQuotation ? 'Print Quotation' : 'Print Invoice'}</span>
            </button>
          </div>
        </div>
      </div>

      {showPrintChooser && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/60 p-3"
          onClick={() => setShowPrintChooser(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-bold text-slate-900 text-sm mb-1">Print with which printer?</div>
            <button
              onClick={() => startPrint('thermal')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left cursor-pointer"
            >
              <Receipt className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-bold text-sm text-slate-900">Thermal Printer</div>
                <div className="text-xs text-slate-500">Receipt roll ({ps.thermal.pageWidth === '58' ? '2 inch / 58mm' : '3 inch / 80mm'})</div>
              </div>
            </button>
            <button
              onClick={() => startPrint('regular')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left cursor-pointer"
            >
              <Printer className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-bold text-sm text-slate-900">Regular Printer</div>
                <div className="text-xs text-slate-500">Normal paper ({ps.regular.pageSize === 'LETTER' ? 'Letter' : ps.regular.pageSize})</div>
              </div>
            </button>
            <button
              onClick={() => setShowPrintChooser(false)}
              className="w-full py-2 text-xs font-bold text-slate-500 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
