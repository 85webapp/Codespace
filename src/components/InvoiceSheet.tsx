import React from 'react';
import { Invoice, CompanyProfile, InvoiceItem } from '../types';
import {
  SheetOptions,
  RegularSettings,
  ThermalSettings,
  textSizePx,
  companyNameEm,
  pageWidthPx,
  thermalWidthPx,
} from '../utils/printSettings';
import { numberToIndianWords, numberToInternationalWords } from '../utils/numberToWords';
import { getCurrencySymbol } from '../utils/locale';

interface InvoiceSheetProps {
  mode: 'regular' | 'thermal';
  invoice: Invoice;
  company: CompanyProfile | null;
  isQuotation: boolean;
  regular: RegularSettings;
  thermal: ThermalSettings;
  color: string;
  logo: string | null;
  signature: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return isNaN(n) ? 0 : n;
};

const indianGroup = (intPart: string) => {
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
};

const makeMoney = (o: SheetOptions) => (value: unknown, withSymbol = true): string => {
  const n = num(value);
  const fixed = Math.abs(n).toFixed(o.amountDecimals ? 2 : 0);
  let [i, d] = fixed.split('.');
  if (o.amountGrouping) {
    i = o.numberFormat === 'indian' ? indianGroup(i) : i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return `${n < 0 ? '-' : ''}${withSymbol ? getCurrencySymbol() : ''}${i}${d ? '.' + d : ''}`;
};

const docTitle = (invoice: Invoice, isQuotation: boolean) => {
  if (isQuotation) return 'Quotation / Estimate';
  if (invoice.type === 'CASH_MEMO') return 'Cash Memo';
  if (invoice.type === 'BILL_OF_SUPPLY') return 'Bill of Supply';
  return 'Tax Invoice';
};

const COPY_LABELS = ['Original for Recipient', 'Duplicate for Transporter', 'Triplicate for Supplier'];

export const InvoiceSheet: React.FC<InvoiceSheetProps> = ({
  mode,
  invoice,
  company,
  isQuotation,
  regular,
  thermal,
  color,
  logo,
  signature,
}) => {
  const o: SheetOptions = mode === 'thermal' ? thermal : regular;
  const money = makeMoney(o);
  const items: InvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : [];
  const totalQty = items.reduce((s, it) => s + num(it.qty), 0);
  const saved = items.reduce((s, it) => s + (num(it.rate) * num(it.qty) * num(it.discountPercent)) / 100, 0);
  const words =
    o.numberFormat === 'international'
      ? numberToInternationalWords(num(invoice.grand_total))
      : numberToIndianWords(num(invoice.grand_total));

  const companyName = company?.trade_name || company?.name || '';
  const addressLine = [company?.address, company?.city, company?.state, company?.pincode ? `PIN - ${company.pincode}` : '']
    .filter(Boolean)
    .join(', ');
  const buyerAddress = [invoice.party_address, invoice.party_pincode ? `PIN - ${invoice.party_pincode}` : '']
    .filter(Boolean)
    .join(', ');
  const terms = (o.customTerms || company?.terms_and_conditions || '').trim();
  const sigText = o.customSignatureText.trim() || company?.signature_title || 'Authorized Signatory';
  const title = docTitle(invoice, isQuotation);
  const itemTax = (it: InvoiceItem): number => {
    const stored = num(it.cgst) + num(it.sgst) + num(it.igst);
    return stored > 0 ? stored : num(it.taxable) * num(it.gstRate) / 100;
  };
  const itemTaxTotals = items.reduce((sum, it) => {
    const rateTax = num(it.taxable) * num(it.gstRate) / 100;
    const storedTax = num(it.cgst) + num(it.sgst) + num(it.igst);
    sum.cgst += num(it.cgst); sum.sgst += num(it.sgst); sum.igst += num(it.igst);
    sum.total += storedTax > 0 ? storedTax : rateTax;
    return sum;
  }, { cgst: 0, sgst: 0, igst: 0, total: 0 });
  const itemTaxPartsAvailable = itemTaxTotals.total > 0;
  const cgst = num(invoice.cgst_total) || (itemTaxPartsAvailable && !invoice.is_inter_state ? itemTaxTotals.cgst || itemTaxTotals.total / 2 : 0);
  const sgst = num(invoice.sgst_total) || (itemTaxPartsAvailable && !invoice.is_inter_state ? itemTaxTotals.sgst || itemTaxTotals.total / 2 : 0);
  const igst = num(invoice.igst_total) || (itemTaxPartsAvailable && invoice.is_inter_state ? itemTaxTotals.igst || itemTaxTotals.total : 0);
  const totalTax = itemTaxTotals.total || (cgst + sgst + igst);
  const hasBank = !!(company?.bank_name || company?.account_number || company?.upi_id);

  // HSN-wise tax summary
  const taxRows = Object.values(
    items.reduce<Record<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>>(
      (acc, it) => {
        const key = `${it.hsn || '-'}|${num(it.gstRate)}`;
        if (!acc[key]) acc[key] = { hsn: it.hsn || '-', rate: num(it.gstRate), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        acc[key].taxable += num(it.taxable);
        const rowTax = num(it.cgst) + num(it.sgst) + num(it.igst);
        if (rowTax > 0) {
          acc[key].cgst += num(it.cgst); acc[key].sgst += num(it.sgst); acc[key].igst += num(it.igst);
        } else {
          const calculated = num(it.taxable) * num(it.gstRate) / 100;
          if (invoice.is_inter_state) acc[key].igst += calculated;
          else { acc[key].cgst += calculated / 2; acc[key].sgst += calculated / 2; }
        }
        return acc;
      },
      {}
    )
  );

  const copies = Math.max(1, Math.min(5, Math.floor(o.copies || 1)));

  /* ------------------------------ REGULAR ------------------------------ */
  const renderRegularCopy = (copyIndex: number) => {
    const label = regular.showOriginalDuplicate ? COPY_LABELS[copyIndex % 3] : '';
    const emptyRows = Math.max(0, regular.minRows - items.length);
    const colCount = 5 + (regular.showSno ? 1 : 0) + (regular.showHsn ? 1 : 0) + 1;
    return (
      <div key={copyIndex} style={{ paddingTop: `${regular.extraTopMm}mm` }}>
        {label && <div className="text-right text-[0.8em] font-bold text-slate-600 mb-1">{label}</div>}
        <div className="border-2 border-slate-800">
          <div
            className="text-center font-black text-[1.3em] uppercase tracking-wider py-1.5 border-b-2 border-slate-800"
            style={{ color }}
          >
            {title}
          </div>

          {/* Company + invoice meta */}
          <div className="grid grid-cols-12 border-b-2 border-slate-800">
            <div className="col-span-7 p-3 border-r-2 border-slate-800 flex items-start gap-3">
              {regular.showLogo && logo && (
                <img src={logo} alt="Logo" className="w-14 h-14 object-contain shrink-0" />
              )}
              <div className="min-w-0">
                {regular.showCompanyName && companyName && (
                  <div className="font-black leading-tight" style={{ fontSize: `${companyNameEm(regular.companyNameSize)}em` }}>
                    {companyName}
                  </div>
                )}
                {regular.showAddress && addressLine && <div className="text-[0.9em] text-slate-600 mt-0.5">{addressLine}</div>}
                {regular.showPhone && company?.phone && (
                  <div className="text-[0.9em] text-slate-600">
                    Phone: <strong className="text-slate-800">{company.phone}</strong>
                  </div>
                )}
                {regular.showEmail && company?.email && (
                  <div className="text-[0.9em] text-slate-600">
                    Email: <strong className="text-slate-800">{company.email}</strong>
                  </div>
                )}
                {regular.showGstin && company?.gstin && (
                  <div className="text-[0.9em] text-slate-600">
                    GSTIN: <strong className="text-slate-800">{company.gstin}</strong>
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-5 p-3 space-y-0.5 text-[0.95em]">
              <div className="font-bold text-slate-800 pb-1 border-b border-slate-200">
                {isQuotation ? 'Quotation Details' : 'Invoice Details'}
              </div>
              <div>
                <span className="text-slate-500">No.:</span> <strong>{invoice.invoice_number}</strong>
              </div>
              <div>
                <span className="text-slate-500">Date:</span> <strong>{invoice.date}</strong>
              </div>
              {invoice.due_date && (
                <div>
                  <span className="text-slate-500">Due Date:</span> <strong>{invoice.due_date}</strong>
                </div>
              )}
              {invoice.place_of_supply && (
                <div>
                  <span className="text-slate-500">Place of Supply:</span> <strong>{invoice.place_of_supply}</strong>
                </div>
              )}
              {regular.showPaymentMode && invoice.payment_mode && (
                <div>
                  <span className="text-slate-500">Payment Mode:</span> <strong>{invoice.payment_mode.replace('_', ' ')}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Bill to */}
          <div className="p-3 border-b-2 border-slate-800 bg-slate-50">
            <div className="font-bold text-[0.85em] text-slate-500 uppercase tracking-wider mb-0.5">Bill To</div>
            <div className="font-black text-[1.1em]">{invoice.party_name}</div>
            {invoice.party_phone && (
              <div className="text-[0.95em] text-slate-600">
                Contact No: <strong>{invoice.party_phone}</strong>
              </div>
            )}
            {invoice.party_gstin && (
              <div className="text-[0.95em] text-slate-600">
                GSTIN: <strong>{invoice.party_gstin}</strong>
              </div>
            )}
            {buyerAddress && <div className="text-[0.95em] text-slate-600">Address: {buyerAddress}</div>}
          </div>

          {/* Items */}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-800 font-bold">
                {regular.showSno && <th className="p-1.5 border-r border-slate-800 w-8 text-center">#</th>}
                <th className="p-1.5 border-r border-slate-800">Item Name</th>
                {regular.showHsn && <th className="p-1.5 border-r border-slate-800 text-center">HSN/SAC</th>}
                <th className="p-1.5 border-r border-slate-800 text-center">Qty</th>
                <th className="p-1.5 border-r border-slate-800 text-right">Price/Unit</th>
                <th className="p-1.5 border-r border-slate-800 text-right">Discount (%)</th>
                <th className="p-1.5 border-r border-slate-800 text-right">GST</th>
                <th className="p-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b border-slate-300 align-top">
                  {regular.showSno && <td className="p-1.5 border-r border-slate-300 text-center">{idx + 1}</td>}
                  <td className="p-1.5 border-r border-slate-300 font-semibold">{it.name}</td>
                  {regular.showHsn && <td className="p-1.5 border-r border-slate-300 text-center">{it.hsn}</td>}
                  <td className="p-1.5 border-r border-slate-300 text-center">
                    {num(it.qty)}
                    {regular.showUnit && it.unit ? ` ${it.unit}` : ''}
                  </td>
                  <td className="p-1.5 border-r border-slate-300 text-right">{money(it.rate)}</td>
                  <td className="p-1.5 border-r border-slate-300 text-right">{num(it.discountPercent)}%<div className="text-[0.8em] text-slate-500">{money(num(it.rate) * num(it.qty) * num(it.discountPercent) / 100)}</div></td>
                  <td className="p-1.5 border-r border-slate-300 text-right">
                    {money(itemTax(it))}
                    <div className="text-[0.8em] text-slate-500">({num(it.gstRate)}%)</div>
                  </td>
                  <td className="p-1.5 text-right font-semibold">{money(it.total)}</td>
                </tr>
              ))}
              {Array.from({ length: emptyRows }).map((_, i) => (
                <tr key={`e${i}`} className="border-b border-slate-200">
                  <td className="p-1.5 border-r border-slate-200" colSpan={1}>&nbsp;</td>
                  {Array.from({ length: colCount - 1 }).map((__, j) => (
                    <td key={j} className="p-1.5 border-r border-slate-200" />
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                <td className="p-1.5 text-right" colSpan={(regular.showSno ? 1 : 0) + 1 + (regular.showHsn ? 1 : 0)}>
                  Total
                </td>
                <td className="p-1.5 text-center">{regular.showTotalQty ? totalQty : ''}</td>
                <td className="p-1.5" />
                <td className="p-1.5" />
                <td className="p-1.5 text-right">{money(totalTax)}</td>
                <td className="p-1.5 text-right">{money(invoice.grand_total)}</td>
              </tr>
            </tbody>
          </table>

          {/* Tax summary / words / notes   |   totals */}
          <div className="grid grid-cols-12 border-t-2 border-slate-800">
            <div className="col-span-7 p-3 border-r-2 border-slate-800 space-y-2">
              {regular.showTaxDetails && taxRows.length > 0 && (
                <table className="w-full text-[0.85em] border border-slate-400 text-center">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="p-1 border-r border-slate-400">HSN/SAC</th>
                      <th className="p-1 border-r border-slate-400">Taxable</th>
                      {invoice.is_inter_state ? (
                        <>
                          <th className="p-1 border-r border-slate-400">IGST %</th>
                          <th className="p-1">IGST Amt</th>
                        </>
                      ) : (
                        <>
                          <th className="p-1 border-r border-slate-400">CGST</th>
                          <th className="p-1">SGST</th>
                        </>
                      )}
                      <th className="p-1 border-l border-slate-400">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxRows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-300">
                        <td className="p-1 border-r border-slate-300">{r.hsn}</td>
                        <td className="p-1 border-r border-slate-300">{money(r.taxable)}</td>
                        {invoice.is_inter_state ? (
                          <>
                            <td className="p-1 border-r border-slate-300">{r.rate}%</td>
                            <td className="p-1">{money(r.igst)}</td>
                          </>
                        ) : (
                          <>
                            <td className="p-1 border-r border-slate-300">
                              {r.rate / 2}% / {money(r.cgst)}
                            </td>
                            <td className="p-1">
                              {r.rate / 2}% / {money(r.sgst)}
                            </td>
                          </>
                        )}
                        <td className="p-1 border-l border-slate-300 font-semibold">{money(r.cgst + r.sgst + r.igst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {regular.showAmountInWords && (
                <div className="text-[0.95em]">
                  <span className="text-slate-500">Amount in words: </span>
                  <strong>{words}</strong>
                </div>
              )}
              {regular.showDescription && invoice.notes && (
                <div className="text-[0.9em]">
                  <div className="font-bold text-slate-600">Description</div>
                  <div className="whitespace-pre-line">{invoice.notes}</div>
                </div>
              )}
              {regular.showBank && hasBank && (
                <div className="text-[0.9em]">
                  <div className="font-bold text-slate-600">Bank Details</div>
                  {company?.bank_name && <div>Bank: {company.bank_name}</div>}
                  {company?.account_number && <div>A/C No: {company.account_number}</div>}
                  {company?.ifsc_code && <div>IFSC: {company.ifsc_code}</div>}
                  {company?.branch_name && <div>Branch: {company.branch_name}</div>}
                  {company?.upi_id && <div>UPI: {company.upi_id}</div>}
                </div>
              )}
              {regular.showTerms && terms && (
                <div className="text-[0.85em]">
                  <div className="font-bold text-slate-600">Terms &amp; Conditions</div>
                  <div className="whitespace-pre-line">{terms}</div>
                </div>
              )}
            </div>

            <div className="col-span-5 p-3 space-y-1 text-[0.95em]">
              <div className="flex justify-between">
                <span className="text-slate-500">Sub Total</span>
                <span>{money(invoice.sub_total)}</span>
              </div>
              {cgst > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">CGST</span>
                  <span>{money(cgst)}</span>
                </div>
              )}
              {sgst > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">SGST</span>
                  <span>{money(sgst)}</span>
                </div>
              )}
              {igst > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">IGST</span>
                  <span>{money(igst)}</span>
                </div>
              )}
              {num(invoice.round_off) !== 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Round Off</span>
                  <span>{money(invoice.round_off)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-[1.1em] border-t-2 border-slate-800 pt-1" style={{ color }}>
                <span>Total</span>
                <span>{money(invoice.grand_total)}</span>
              </div>
              {regular.showYouSaved && saved > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>You Saved</span>
                  <span>{money(saved)}</span>
                </div>
              )}
              {regular.showReceived && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Received</span>
                  <span>{money(invoice.paid_amount)}</span>
                </div>
              )}
              {regular.showBalance && (
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Balance</span>
                  <span>{money(invoice.balance_amount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer: received by / delivered by / signature */}
          <div className="grid grid-cols-12 border-t-2 border-slate-800 min-h-[5em]">
            <div className="col-span-7 p-3 border-r-2 border-slate-800 flex gap-6 text-[0.9em]">
              {regular.showReceivedBy && (
                <div className="flex-1">
                  <div className="font-bold text-slate-600">Received By</div>
                  <div className="mt-6 border-t border-slate-400 pt-0.5 text-slate-500">Name &amp; Sign</div>
                </div>
              )}
              {regular.showDeliveredBy && (
                <div className="flex-1">
                  <div className="font-bold text-slate-600">Delivered By</div>
                  <div className="mt-6 border-t border-slate-400 pt-0.5 text-slate-500">Name &amp; Sign</div>
                </div>
              )}
            </div>
            <div className="col-span-5 p-3 text-center flex flex-col justify-between">
              {companyName && <div className="text-[0.9em] text-slate-600">For {companyName}</div>}
              {regular.showSignature && signature ? (
                <img src={signature} alt="Signature" className="h-10 max-w-[140px] object-contain mx-auto my-1" />
              ) : (
                <div className="h-8" />
              )}
              {regular.showSignature && (
                <div className="border-t border-slate-400 pt-0.5 text-[0.9em] font-bold text-slate-700">{sigText}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ------------------------------ THERMAL ------------------------------ */
  const renderThermalCopy = (copyIndex: number) => {
    const t = thermal;
    const line = <div className="border-t border-dashed border-slate-800 my-1" />;
    return (
      <div key={copyIndex}>
        <div className="text-center space-y-0.5">
          {t.showLogo && logo && <img src={logo} alt="Logo" className="h-10 max-w-[60%] object-contain mx-auto" />}
          {t.showCompanyName && companyName && (
            <div className="font-black leading-tight" style={{ fontSize: `${companyNameEm(t.companyNameSize)}em` }}>
              {companyName}
            </div>
          )}
          {t.showAddress && addressLine && <div className="text-[0.9em]">{addressLine}</div>}
          {t.showPhone && company?.phone && <div className="text-[0.9em]">Ph: {company.phone}</div>}
          {t.showEmail && company?.email && <div className="text-[0.9em]">{company.email}</div>}
          {t.showGstin && company?.gstin && <div className="text-[0.9em]">GSTIN: {company.gstin}</div>}
        </div>
        {line}
        <div className="text-center font-bold uppercase">{title}</div>
        <div className="text-[0.95em]">
          <div className="flex justify-between">
            <span>No: {invoice.invoice_number}</span>
            <span>{invoice.date}</span>
          </div>
          <div>To: {invoice.party_name}</div>
          {invoice.party_phone && <div>Ph: {invoice.party_phone}</div>}
          {invoice.party_gstin && <div>GSTIN: {invoice.party_gstin}</div>}
        </div>
        {line}
        <table className="w-full text-[0.95em]">
          <thead>
            <tr className="font-bold border-b border-dashed border-slate-800">
              {t.showSno && <th className="text-left w-4">#</th>}
              <th className="text-left">Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Disc %</th>
              <th className="text-right">Amt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="align-top">
                {t.showSno && <td>{idx + 1}</td>}
                <td className="pr-1">
                  {it.name}
                  {t.showHsn && it.hsn && <div className="text-[0.8em]">HSN {it.hsn}</div>}
                  {num(it.discountPercent) > 0 && <div className="text-[0.8em]">Discount: {num(it.discountPercent)}% ({money(num(it.rate) * num(it.qty) * num(it.discountPercent) / 100)})</div>}
                </td>
                <td className="text-right whitespace-nowrap">
                  {num(it.qty)}
                  {t.showUnit && it.unit ? ` ${it.unit}` : ''}
                </td>
                <td className="text-right">{money(it.rate, false)}</td>
                <td className="text-right">{num(it.discountPercent)}%</td>
                <td className="text-right">{money(it.total, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {line}
        <div className="space-y-0.5 text-[0.95em]">
          {t.showTotalQty && (
            <div className="flex justify-between">
              <span>Total Qty</span>
              <span>{totalQty}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Sub Total</span>
            <span>{money(invoice.sub_total)}</span>
          </div>
          {cgst > 0 && (
            <div className="flex justify-between">
              <span>CGST</span>
              <span>{money(cgst)}</span>
            </div>
          )}
          {sgst > 0 && (
            <div className="flex justify-between">
              <span>SGST</span>
              <span>{money(sgst)}</span>
            </div>
          )}
          {igst > 0 && (
            <div className="flex justify-between">
              <span>IGST</span>
              <span>{money(igst)}</span>
            </div>
          )}
          {t.showTaxDetails &&
            taxRows.map((r, i) => (
              <div key={i} className="flex justify-between text-[0.85em]">
                <span>
                  GST {r.rate}% on {money(r.taxable)}
                </span>
                <span>{money(r.cgst + r.sgst + r.igst)}</span>
              </div>
            ))}
          <div className="flex justify-between font-black text-[1.15em] border-t border-slate-800 pt-0.5">
            <span>TOTAL</span>
            <span>{money(invoice.grand_total)}</span>
          </div>
          {t.showYouSaved && saved > 0 && (
            <div className="flex justify-between">
              <span>You Saved</span>
              <span>{money(saved)}</span>
            </div>
          )}
          {t.showReceived && (
            <div className="flex justify-between">
              <span>Received</span>
              <span>{money(invoice.paid_amount)}</span>
            </div>
          )}
          {t.showBalance && (
            <div className="flex justify-between font-bold">
              <span>Balance</span>
              <span>{money(invoice.balance_amount)}</span>
            </div>
          )}
          {t.showPaymentMode && invoice.payment_mode && (
            <div className="flex justify-between">
              <span>Payment Mode</span>
              <span>{invoice.payment_mode.replace('_', ' ')}</span>
            </div>
          )}
        </div>
        {t.showAmountInWords && <div className="text-[0.9em] mt-1">{words}</div>}
        {t.showDescription && invoice.notes && <div className="text-[0.9em] mt-1 whitespace-pre-line">{invoice.notes}</div>}
        {t.showTerms && terms && (
          <>
            {line}
            <div className="text-[0.8em] whitespace-pre-line">{terms}</div>
          </>
        )}
        {t.showSignature && (
          <div className="text-center mt-2">
            {signature && <img src={signature} alt="Signature" className="h-8 max-w-[60%] object-contain mx-auto" />}
            <div className="text-[0.85em] font-bold">{sigText}</div>
          </div>
        )}
        <div className="text-center text-[0.9em] mt-1">Thank you! Visit again</div>
        <div style={{ height: `${Math.max(0, t.extraLines) * 1.3}em` }} />
      </div>
    );
  };

  /* -------------------------------- shell ------------------------------- */
  const isThermal = mode === 'thermal';
  const width = isThermal ? thermalWidthPx(thermal.pageWidth) : pageWidthPx(regular.pageSize, regular.orientation);
  const base = isThermal ? (thermal.pageWidth === '58' ? 10 : 11) : textSizePx(regular.textSize);

  return (
    <div
      id="printable-invoice"
      data-sheet-mode={mode}
      className={`bg-white text-slate-900 font-sans ${isThermal && !thermal.textStyling ? '[&_*]:font-normal!' : ''}`}
      style={{
        width: `${width}px`,
        fontSize: `${base}px`,
        padding: isThermal ? '8px 6px' : '16px',
        boxSizing: 'border-box',
      }}
    >
      {Array.from({ length: copies }).map((_, i) => (
        <React.Fragment key={i}>
          {i > 0 && (isThermal ? <div className="border-t-2 border-dashed border-slate-400 my-3" /> : <div className="html2pdf__page-break" />)}
          {isThermal ? renderThermalCopy(i) : renderRegularCopy(i)}
        </React.Fragment>
      ))}
    </div>
  );
};
