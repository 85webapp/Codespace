import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Download, FileJson, Plus,
  Search, Truck, X, CheckCircle2, AlertCircle, MapPin, Package, CalendarDays, Share2, Loader2,
} from 'lucide-react';
import { buildDetailsPdfBlob, downloadDetailsPdf, downloadJson, shareJson, sharePdf, showToast } from '../utils/pdfShare';

const STATE_CODES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],['25','Daman & Diu'],['26','Dadra & Nagar Haveli and Daman & Diu'],['27','Maharashtra'],['28','Andhra Pradesh'],['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman & Nicobar Islands'],['36','Telangana'],['37','Andhra Pradesh'],['38','Ladakh'],['97','Other Territory']
] as const;
const TAX_RATES = ['0','0.1','0.25','1','1.5','3','5','12','18','28'];
const QTY_UNITS = ['BAG','BAL','BDL','BKL','BOU','BOX','BTL','BUN','CAN','CBM','CCM','CMS','CTN','DOZ','DRM','GGR','GMS','GRS','GYD','KGS','KLR','KME','LTR','MTR','MLT','NOS','PAC','PCS','PRS','QTL','ROL','SET','SQF','SQM','SQY','TBS','TGM','THD','TON','TUB','UNT','YDS'];
const SUB_SUPPLY: Record<string, { code: string; label: string }[]> = {
  O: [{code:'1',label:'Supply'},{code:'2',label:'Export'},{code:'3',label:'Job Work'},{code:'4',label:'SKD/CKD/Lots'},{code:'5',label:'Recipient Not Known'},{code:'6',label:'For Own Use'},{code:'7',label:'Exhibition or Fairs'},{code:'8',label:'Line Sales'},{code:'9',label:'Others'}],
  I: [{code:'1',label:'Supply'},{code:'2',label:'Import'},{code:'3',label:'Job Work Returns'},{code:'4',label:'Sales Return'},{code:'5',label:'For Own Use'},{code:'6',label:'Exhibition or Fairs'},{code:'7',label:'Line Sales'},{code:'8',label:'Others'}],
};

interface PartyForm {
  gstin: string;
  legalName: string;
  tradeName: string;
  addr1: string;
  addr2: string;
  city: string;
  pincode: string;
  stateCode: string;
}
interface ItemForm {
  productName: string;
  productDesc: string;
  hsnCode: string;
  quantity: string;
  qtyUnit: string;
  taxableAmount: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  cessRate: string;
}
interface EWayBill {
  id: string;
  createdAt: string;
  status: 'ACTIVE';
  ewbNumber: string;
  supplyType: 'O' | 'I';
  subSupplyType: string;
  docType: 'INV' | 'CHL' | 'BIL' | 'BOE' | 'OTH';
  docNumber: string;
  docDate: string;
  from: PartyForm;
  to: PartyForm;
  items: ItemForm[];
  transMode: '1' | '2' | '3' | '4';
  transDistance: string;
  transporterId: string;
  transporterName: string;
  transDocNo: string;
  transDocDate: string;
  vehicleNo: string;
  vehicleType: 'R' | 'O';
}

const today = () => new Date().toISOString().slice(0, 10);
const initialParty = (): PartyForm => ({ gstin: '', legalName: '', tradeName: '', addr1: '', addr2: '', city: '', pincode: '', stateCode: '09' });
const initialItem = (): ItemForm => ({ productName: '', productDesc: '', hsnCode: '', quantity: '1', qtyUnit: 'NOS', taxableAmount: '', cgstRate: '0', sgstRate: '0', igstRate: '0', cessRate: '0' });
const initialForm = () => ({
  supplyType: 'O' as 'O' | 'I', subSupplyType: '1', docType: 'INV' as EWayBill['docType'], docNumber: '', docDate: today(),
  from: initialParty(), to: initialParty(), items: [initialItem()],
  transMode: '1' as EWayBill['transMode'], transDistance: '', transporterId: '', transporterName: '', transDocNo: '', transDocDate: '', vehicleNo: '', vehicleType: 'R' as EWayBill['vehicleType'],
});

const cleanUpper = (v: string) => v.toUpperCase().replace(/\s+/g, '');
const docLabel = (v: EWayBill['docType']) => ({ INV: 'Tax Invoice', CHL: 'Delivery Challan', BIL: 'Bill of Supply', BOE: 'Bill of Entry', OTH: 'Others' }[v]);
const calcItem = (i: ItemForm) => {
  const taxable = Number(i.taxableAmount) || 0;
  const cgst = taxable * (Number(i.cgstRate) || 0) / 100;
  const sgst = taxable * (Number(i.sgstRate) || 0) / 100;
  const igst = taxable * (Number(i.igstRate) || 0) / 100;
  const cess = taxable * (Number(i.cessRate) || 0) / 100;
  return { taxable, cgst, sgst, igst, cess };
};

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return <label className="block text-xs font-semibold text-slate-700">
    <span className="mb-1.5 flex items-center gap-1">{label}{required && <b className="text-red-500">*</b>}</span>
    {children}
    {hint && <span className="mt-1 block text-[10px] font-normal text-slate-400">{hint}</span>}
  </label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${props.className || ''}`} />; }
function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <div className="relative"><select {...props} className={`w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${props.className || ''}`}>{children}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 w-4 h-4 text-slate-400" /></div>; }

export const EWayBillPanel: React.FC<{ onBack?: () => void; companyGstin?: string; companyName?: string }> = ({ onBack, companyGstin, companyName }) => {
  const [bills, setBills] = useState<EWayBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(true);
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState<EWayBill | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [exportBusy, setExportBusy] = useState<'pdf' | 'json' | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await apiFetch('/api/compliance/eway-bills');
        const rows = await r.json();
        if (!r.ok) throw new Error(rows.error || 'Unable to load e-Way Bills.');
        const mapped = (Array.isArray(rows) ? rows : []).map((row: any) => {
          try { return row.payload_json ? { ...JSON.parse(row.payload_json), id: row.id, createdAt: row.created_at, status: row.status === 'DRAFT' ? 'ACTIVE' : row.status, ewbNumber: row.ewb_number || `LOCAL-${String(row.id).slice(-12)}` } : null; } catch { return null; }
        }).filter(Boolean) as EWayBill[];
        if (active) setBills(mapped);
      } catch (e: any) { if (active) setErrors([e.message || 'Unable to load saved e-Way Bills.']); }
      finally { if (active) setLoadingBills(false); }
    })();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => bills.filter(b => `${b.ewbNumber} ${b.docNumber} ${b.to.legalName} ${b.to.gstin} ${b.vehicleNo}`.toLowerCase().includes(search.toLowerCase())), [bills, search]);
  const totals = useMemo(() => form.items.reduce((a, i) => { const x = calcItem(i); return { taxable: a.taxable + x.taxable, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, igst: a.igst + x.igst, cess: a.cess + x.cess }; }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 }), [form.items]);

  const updateParty = (side: 'from' | 'to', key: keyof PartyForm, value: string) => setForm(f => ({ ...f, [side]: { ...f[side], [key]: key === 'gstin' ? cleanUpper(value) : value } }));
  const updateItem = (idx: number, key: keyof ItemForm, value: string) => setForm(f => ({ ...f, items: f.items.map((x, i) => i === idx ? { ...x, [key]: value } : x) }));

  const validateStep = (target: number) => {
    const e: string[] = [];
    if (target >= 2) {
      if (!form.docNumber.trim()) e.push('Document Number is required.');
      if (!/^[A-Za-z0-9\\/-]+$/.test(form.docNumber.trim())) e.push('Document Number may contain only letters, numbers, / and -.');
      if (!form.docDate) e.push('Document Date is required.');
      const partiesToCheck: [string, PartyForm][] = [['Supplier From', form.from], ['Recipient To', form.to]];
      for (const [name, p] of partiesToCheck) {
        if (!p.legalName.trim()) e.push(`${name}: Legal Name is required.`);
        if (!p.addr1.trim()) e.push(`${name}: Address Line 1 is required.`);
        if (!p.city.trim()) e.push(`${name}: City is required.`);
        if (!/^\d{6}$/.test(p.pincode)) e.push(`${name}: Pincode must be 6 digits.`);
        if (!p.stateCode) e.push(`${name}: State is required.`);
        if (p.gstin && p.gstin !== 'URP' && !/^[0-9A-Z]{15}$/.test(p.gstin)) e.push(`${name}: GSTIN must be 15 characters or URP.`);
      }
    }
    if (target >= 3) {
      if (!form.items.length) e.push('At least one item is required.');
      form.items.forEach((i, idx) => {
        if (!i.hsnCode.trim()) e.push(`Item ${idx + 1}: HSN code is required.`);
        if (!(Number(i.quantity) > 0)) e.push(`Item ${idx + 1}: Quantity must be greater than 0.`);
        if (i.taxableAmount === '' || !(Number(i.taxableAmount) >= 0)) e.push(`Item ${idx + 1}: Taxable value is required.`);
      });
      if (!(Number(form.transDistance) >= 0)) e.push('Distance in KM is required.');
      if (form.transMode === '1' && !form.vehicleNo.trim()) e.push('Vehicle Number is required for Road transport.');
      if (form.vehicleNo && !/^[A-Z0-9-]{4,20}$/.test(form.vehicleNo)) e.push('Vehicle Number must be uppercase and contain no spaces.');
    }
    setErrors(e); return e.length === 0;
  };

  const next = () => { if (validateStep(step + 1)) { setErrors([]); setStep(s => Math.min(3, s + 1)); } };
  const save = async () => {
    if (!validateStep(3)) return;
    try {
      const totalsNow = form.items.reduce((a, i) => { const x = calcItem(i); return { taxable: a.taxable + x.taxable, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, igst: a.igst + x.igst, cess: a.cess + x.cess }; }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });
      const payload = {
        ...form, vehicleNo: cleanUpper(form.vehicleNo), supply_type: form.supplyType === 'O' ? 'OUTWARD' : 'INWARD',
        sub_supply_type: form.subSupplyType, doc_type: form.docType, doc_number: form.docNumber.trim(), doc_date: form.docDate,
        from_gstin: form.from.gstin || 'URP', from_legal_name: form.from.legalName, from_address: [form.from.addr1, form.from.addr2, form.from.city].filter(Boolean).join(', '),
        to_gstin: form.to.gstin || 'URP', to_legal_name: form.to.legalName, to_address: [form.to.addr1, form.to.addr2, form.to.city].filter(Boolean).join(', '),
        total_taxable_value: totalsNow.taxable, total_cgst_amount: totalsNow.cgst, total_sgst_amount: totalsNow.sgst, total_igst_amount: totalsNow.igst, total_consignment_value: totalsNow.taxable + totalsNow.cgst + totalsNow.sgst + totalsNow.igst + totalsNow.cess,
        mode_of_transport: form.transMode, approx_distance_km: Number(form.transDistance || 0), transporter_id: form.transporterId, transporter_name: form.transporterName, vehicle_number: cleanUpper(form.vehicleNo),
      };
      const r = await apiFetch('/api/compliance/eway-bills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const row = await r.json();
      if (!r.ok) throw new Error(row.error || 'Unable to save E-Way Bill.');
      const bill: EWayBill = { ...form, vehicleNo: cleanUpper(form.vehicleNo), id: row.id, createdAt: row.created_at, status: 'ACTIVE', ewbNumber: row.ewb_number || `LOCAL-${String(row.id).slice(-12)}` };
      setBills(prev => [bill, ...prev]); setSelected(bill); setWizardOpen(false); setStep(1); setForm(initialForm()); setErrors([]);
    } catch (e: any) { setErrors([e.message || 'Unable to save E-Way Bill.']); }
  };

  const buildExportJson = (b: EWayBill) => {
    const itemList = b.items.map(i => ({ productName: i.productName, productDesc: i.productDesc, hsnCode: i.hsnCode, quantity: Number(i.quantity), qtyUnit: i.qtyUnit, taxableAmount: Number(i.taxableAmount), cgstRate: Number(i.cgstRate), sgstRate: Number(i.sgstRate), igstRate: Number(i.igstRate), cessRate: Number(i.cessRate), cessNonadvol: 0 }));
    const sums = b.items.reduce((a, i) => { const x = calcItem(i); return { taxable: a.taxable + x.taxable, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, igst: a.igst + x.igst, cess: a.cess + x.cess }; }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });
    const payload = {
      supplyType: b.supplyType, subSupplyType: b.subSupplyType, subSupplyDesc: '', docType: b.docType, docNo: b.docNumber, docDate: b.docDate.split('-').reverse().join('/'),
      fromGstin: b.from.gstin || 'URP', fromTrdName: b.from.tradeName || b.from.legalName, fromAddr1: b.from.addr1, fromAddr2: b.from.addr2, fromPlace: b.from.city, fromPincode: Number(b.from.pincode), actFromStateCode: Number(b.from.stateCode), fromStateCode: Number(b.from.stateCode),
      toGstin: b.to.gstin || 'URP', toTrdName: b.to.tradeName || b.to.legalName, toAddr1: b.to.addr1, toAddr2: b.to.addr2, toPlace: b.to.city, toPincode: Number(b.to.pincode), actToStateCode: Number(b.to.stateCode), toStateCode: Number(b.to.stateCode),
      transactionType: 1, otherValue: 0, totalValue: Number(sums.taxable.toFixed(2)), cgstValue: Number(sums.cgst.toFixed(2)), sgstValue: Number(sums.sgst.toFixed(2)), igstValue: Number(sums.igst.toFixed(2)), cessValue: Number(sums.cess.toFixed(2)), totInvValue: Number((sums.taxable + sums.cgst + sums.sgst + sums.igst + sums.cess).toFixed(2)), itemList,
      transMode: Number(b.transMode), transDistance: Number(b.transDistance), transporterId: b.transporterId || undefined, transporterName: b.transporterName || undefined, transDocNo: b.transDocNo || undefined, transDocDate: b.transDocDate ? b.transDocDate.split('-').reverse().join('/') : undefined, vehicleNo: b.vehicleNo || undefined, vehicleType: b.vehicleType,
    };
    return payload;
  };

  const handleExportJson = async (b: EWayBill, share: boolean) => {
    if (exportBusy) return;
    setExportBusy('json');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const payload = buildExportJson(b);
      const fileName = `EWB_${b.docNumber || b.id}.json`;
      if (share) await shareJson(payload, fileName, `E-Way Bill ${b.ewbNumber || b.docNumber}`, `E-Way Bill data for document ${b.docNumber}.`);
      else { downloadJson(payload, fileName); showToast('E-Way Bill JSON download started.'); }
    } catch (error) {
      console.error('E-Way Bill JSON export failed:', error);
      showToast('E-Way Bill JSON export failed. Please try again.');
    } finally { setExportBusy(null); }
  };

  const handleExportPdf = async (b: EWayBill, share = false) => {
    if (exportBusy) return;
    setExportBusy('pdf');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const selectedTotals = b.items.reduce((a, i) => { const x = calcItem(i); return { taxable: a.taxable + x.taxable, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, igst: a.igst + x.igst, cess: a.cess + x.cess }; }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });
    const rows: [string, string][] = [['E-Way Bill No.', b.ewbNumber], ['Document', `${docLabel(b.docType)} / ${b.docNumber}`], ['Document Date', b.docDate], ['Supplier', b.from.legalName], ['Recipient', b.to.legalName], ['Recipient GSTIN', b.to.gstin || 'URP'], ['Total Taxable Value', `₹${selectedTotals.taxable.toFixed(2)}`], ['Transport Mode', ({'1':'Road','2':'Rail','3':'Air','4':'Ship'} as any)[b.transMode]], ['Distance', `${b.transDistance} KM`], ['Vehicle', b.vehicleNo || '-']];
      const fileName = `EWB_${b.ewbNumber}.pdf`;
      if (share) {
        const blob = await buildDetailsPdfBlob('E-Way Bill', rows);
        await sharePdf({ blob, fileName, title: `E-Way Bill ${b.ewbNumber}`, text: `E-Way Bill for document ${b.docNumber}.` });
      } else {
        await downloadDetailsPdf('E-Way Bill', rows, fileName);
        showToast('E-Way Bill PDF download started.');
      }
    } catch (error) {
      console.error('E-Way Bill PDF export failed:', error);
      showToast('E-Way Bill PDF export failed. Please try again.');
    } finally { setExportBusy(null); }
  };

  const exportJson = (b: EWayBill) => { void handleExportJson(b, false); };
  const downloadPdf = (b: EWayBill) => { void handleExportPdf(b); };

  const downloadFormJson = () => {
    const draft: EWayBill = { ...form, id: 'draft', createdAt: new Date().toISOString(), status: 'ACTIVE', ewbNumber: '' };
    void handleExportJson(draft, false);
  };

  const closeWizard = () => { setWizardOpen(false); setStep(1); setErrors([]); setForm(initialForm()); };

  return <div className="relative min-h-[calc(100dvh-120px)] bg-slate-50 -m-3 sm:-m-6 p-4 sm:p-6 pb-28">
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200"><ArrowLeft className="w-5 h-5" /></button>}
          <div><div className="flex items-center gap-2"><Truck className="w-5 h-5 text-blue-600" /><h1 className="text-xl font-black text-slate-900">E-Way Bills</h1></div><p className="text-xs text-slate-500 mt-1">Create, manage and export your saved e-Way Bill records.</p></div>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bill, document, GSTIN..." className="pl-9" /></div>
          <button onClick={() => { const f = initialForm(); f.from.gstin = companyGstin || ''; f.from.legalName = companyName || ''; setForm(f); setStep(1); setErrors([]); setWizardOpen(true); }} className="shrink-0 hidden sm:flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2.5 font-bold text-xs shadow-md hover:bg-blue-700 active:scale-95 transition"><Plus className="w-4 h-4" /> New E-Way Bill</button>
        </div>
      </div>
      {loadingBills && <div className="mb-4 rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs font-bold text-blue-700">Loading saved E-Way Bills...</div>}
      {exportBusy && <div role="status" aria-live="polite" className="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-700"><Loader2 className="h-4 w-4 animate-spin" /> Preparing {exportBusy.toUpperCase()} export…</div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] text-slate-500">Total Bills</p><p className="text-2xl font-black mt-1">{bills.length}</p></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] text-slate-500">Active</p><p className="text-2xl font-black text-emerald-600 mt-1">{bills.length}</p></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] text-slate-500">Storage</p><p className="text-sm font-bold text-slate-700 mt-2">Local device storage</p></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? <div className="py-20 text-center"><Truck className="w-10 h-10 mx-auto text-slate-300" /><h3 className="font-bold text-slate-800 mt-3">No e-Way Bills yet</h3><p className="text-xs text-slate-500 mt-1">Use the blue Add E-Way Bill button to create your first record.</p></div> : <div className="divide-y divide-slate-100">{filtered.map(b => <button key={b.id} onClick={() => setSelected(b)} className="w-full text-left p-4 hover:bg-blue-50/40 transition flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><FileJson className="w-5 h-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-sm text-slate-900">{b.ewbNumber}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">ACTIVE</span></div><div className="text-xs text-slate-500 mt-1">{docLabel(b.docType)} • {b.docNumber} • {b.docDate}</div></div><div className="sm:text-right"><div className="font-bold text-sm text-slate-800">{b.to.legalName || 'Recipient not named'}</div><div className="text-[11px] text-slate-500">{b.vehicleNo || 'No vehicle'} • {b.transDistance || 0} KM</div></div><ChevronRight className="w-4 h-4 text-slate-300" /></button>)}</div>}
      </div>
    </div>

    {/* Floating Action Button: Centered, elevated above bottom navigation */}
    <div className="fixed bottom-24 sm:bottom-10 left-1/2 -translate-x-1/2 z-40 animate-in fade-in zoom-in duration-200">
      <button
        onClick={() => { const f = initialForm(); f.from.gstin = companyGstin || ''; f.from.legalName = companyName || ''; setForm(f); setStep(1); setErrors([]); setWizardOpen(true); }}
        className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-blue-600 text-white font-bold text-sm sm:text-base tracking-wide shadow-xl shadow-blue-600/35 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all cursor-pointer ring-2 ring-blue-400/40 whitespace-nowrap"
      >
        <Plus className="w-5 h-5" />
        <span>+ Add E-Way Bill</span>
      </button>
    </div>

    {wizardOpen && <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5"><div className="bg-white w-full sm:max-w-6xl max-h-[96dvh] sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-200 flex items-center justify-between"><div><h2 className="text-lg font-black">Add E-Way Bill</h2><p className="text-[11px] text-slate-500">3-step streamlined entry • date pre-filled automatically</p></div><button onClick={closeWizard} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
      <div className="px-5 sm:px-7 py-3 border-b border-slate-100"><div className="flex items-center max-w-xl mx-auto">{[1,2,3].map((n, i) => <React.Fragment key={n}><div className={`flex items-center gap-2 ${step >= n ? 'text-blue-600' : 'text-slate-400'}`}><span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step >= n ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{n}</span><span className="hidden sm:block text-xs font-bold">{n === 1 ? 'Document & Supply' : n === 2 ? 'From & To' : 'Items & Transport'}</span></div>{i < 2 && <div className={`h-px flex-1 mx-3 ${step > n ? 'bg-blue-500' : 'bg-slate-200'}`} />}</React.Fragment>)}</div></div>
      {errors.length > 0 && <div className="mx-5 sm:mx-7 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs"><div className="font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Please fix these fields</div><ul className="mt-1 list-disc pl-5">{errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      <div className="overflow-y-auto flex-1 p-5 sm:p-7">
        {step === 1 && <div className="max-w-4xl mx-auto space-y-5"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Field label="Supply Type" required><Select value={form.supplyType} onChange={e => setForm(f => ({ ...f, supplyType: e.target.value as any, subSupplyType: SUB_SUPPLY[e.target.value][0].code }))}><option value="O">Outward</option><option value="I">Inward</option></Select></Field><Field label="Sub Supply Type" required><Select value={form.subSupplyType} onChange={e => setForm(f => ({ ...f, subSupplyType: e.target.value }))}>{SUB_SUPPLY[form.supplyType].map(x => <option key={x.code} value={x.code}>{x.code} - {x.label}</option>)}</Select></Field><Field label="Document Type" required><Select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value as any }))}><option value="INV">Tax Invoice</option><option value="CHL">Delivery Challan</option><option value="BIL">Bill of Supply</option><option value="BOE">Bill of Entry</option><option value="OTH">Others</option></Select></Field></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Document Number" required hint="Allowed: letters, numbers, / and -"><Input value={form.docNumber} onChange={e => setForm(f => ({ ...f, docNumber: e.target.value }))} placeholder="e.g. INV/2026/001" /></Field><Field label="Document Date" required><Input type="date" value={form.docDate} onChange={e => setForm(f => ({ ...f, docDate: e.target.value }))} /><span className="text-[10px] text-blue-600 flex items-center gap-1 mt-1"><CalendarDays className="w-3 h-3" /> Defaults to today</span></Field></div><div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800"><b>Tip:</b> Use the drop-downs wherever possible. This reduces typing and keeps the record aligned with e-Way Bill master values.</div></div>}

        {step === 2 && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-6xl mx-auto"><PartyCard title="Supplier From" party={form.from} onChange={(k,v) => updateParty('from', k, v)} /><PartyCard title="Recipient To" party={form.to} onChange={(k,v) => updateParty('to', k, v)} /></div>}

        {step === 3 && <div className="max-w-6xl mx-auto space-y-6"><section><div className="flex items-center justify-between mb-3"><div><h3 className="font-black text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-blue-600" /> Item Tax Details</h3><p className="text-[10px] text-slate-500">Add multiple items; tax amounts are calculated from taxable value × selected rate.</p></div><button onClick={() => setForm(f => ({ ...f, items: [...f.items, initialItem()] }))} className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100"><Plus className="w-4 h-4 inline mr-1" /> Add Item</button></div><div className="overflow-x-auto border border-slate-200 rounded-2xl"><table className="w-full min-w-[1050px] text-xs"><thead className="bg-slate-50"><tr>{['Product','HSN','Qty','Unit','Taxable ₹','CGST %','SGST %','IGST %','Cess %',''].map(h => <th key={h} className="px-2 py-2.5 text-left font-bold text-slate-500">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{form.items.map((item, idx) => <tr key={idx}><td className="p-2"><Input value={item.productName} onChange={e => updateItem(idx,'productName',e.target.value)} placeholder="Item name" /></td><td className="p-2"><Input value={item.hsnCode} onChange={e => updateItem(idx,'hsnCode',e.target.value.replace(/\D/g,''))} inputMode="numeric" maxLength={8} placeholder="HSN" /></td><td className="p-2"><Input value={item.quantity} onChange={e => updateItem(idx,'quantity',e.target.value)} type="number" min="0" /></td><td className="p-2"><Select value={item.qtyUnit} onChange={e => updateItem(idx,'qtyUnit',e.target.value)}>{QTY_UNITS.map(x => <option key={x}>{x}</option>)}</Select></td><td className="p-2"><IndianAmountInput value={item.taxableAmount} onValueChange={value => updateItem(idx,'taxableAmount',value)} min="0" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs" /></td>{(['cgstRate','sgstRate','igstRate','cessRate'] as const).map(k => <td className="p-2" key={k}><Select value={item[k]} onChange={e => updateItem(idx,k,e.target.value)}>{TAX_RATES.map(x => <option key={x} value={x}>{x}%</option>)}</Select></td>)}<td className="p-2"><button disabled={form.items.length === 1} onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30"><X className="w-4 h-4" /></button></td></tr>)}</tbody><tfoot className="bg-slate-50 font-black"><tr><td colSpan={4} className="p-3 text-right">Totals</td><td className="p-3">₹{totals.taxable.toFixed(2)}</td><td>₹{totals.cgst.toFixed(2)}</td><td>₹{totals.sgst.toFixed(2)}</td><td>₹{totals.igst.toFixed(2)}</td><td>₹{totals.cess.toFixed(2)}</td><td /></tr></tfoot></table></div></section>
          <section><h3 className="font-black text-slate-900 flex items-center gap-2 mb-3"><Truck className="w-4 h-4 text-blue-600" /> Transportation Details</h3><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><Field label="Transport Mode" required><Select value={form.transMode} onChange={e => setForm(f => ({ ...f, transMode: e.target.value as any }))}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></Select></Field><Field label="Distance in KM" required><Input type="number" min="0" max="9999" value={form.transDistance} onChange={e => setForm(f => ({ ...f, transDistance: e.target.value }))} placeholder="e.g. 120" /></Field><Field label="Transporter ID"><Input maxLength={15} value={form.transporterId} onChange={e => setForm(f => ({ ...f, transporterId: cleanUpper(e.target.value) }))} placeholder="GSTIN / enrolment no." /></Field><Field label="Transporter Name"><Input value={form.transporterName} onChange={e => setForm(f => ({ ...f, transporterName: e.target.value }))} /></Field><Field label="Transport Document No."><Input maxLength={15} value={form.transDocNo} onChange={e => setForm(f => ({ ...f, transDocNo: e.target.value }))} /></Field><Field label="Transport Document Date"><Input type="date" value={form.transDocDate} onChange={e => setForm(f => ({ ...f, transDocDate: e.target.value }))} /></Field><Field label="Vehicle Number" required={form.transMode === '1'} hint="Spaces are removed automatically"><Input maxLength={20} value={form.vehicleNo} onChange={e => setForm(f => ({ ...f, vehicleNo: cleanUpper(e.target.value) }))} placeholder="UP16CT4321" /></Field><Field label="Vehicle Type" required><Select value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value as any }))}><option value="R">Regular</option><option value="O">Over-Dimensional Cargo</option></Select></Field></div></section>
        </div>}
      </div>
      <div className="px-5 sm:px-7 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3"><button onClick={() => step === 1 ? closeWizard() : setStep(s => s - 1)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> {step === 1 ? 'Cancel' : 'Back'}</button><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={downloadFormJson} className="px-4 py-2.5 rounded-xl border border-blue-200 bg-white text-blue-700 text-xs font-black hover:bg-blue-50 inline-flex items-center gap-2"><FileJson className="w-4 h-4" /> Download JSON</button>{step < 3 ? <button onClick={next} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 inline-flex items-center gap-1">Next <ChevronRight className="w-4 h-4" /></button> : <button onClick={save} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Save E-Way Bill</button>}</div></div>
    </div></div>}

    {selected && <div className="fixed inset-0 z-50 bg-slate-950/35" onClick={() => setSelected(null)}><aside onClick={e => e.stopPropagation()} className="absolute right-0 top-0 h-full w-full sm:w-[430px] bg-white shadow-2xl flex flex-col"><div className="p-5 border-b border-slate-200 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase text-blue-600">E-Way Bill</p><h2 className="font-black text-lg">{selected.ewbNumber}</h2></div><button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button></div><div className="p-5 overflow-y-auto flex-1 space-y-4"><div className="rounded-2xl bg-slate-50 p-4"><div className="flex justify-between"><span className="text-xs text-slate-500">Status</span><span className="text-xs font-bold text-emerald-600">ACTIVE</span></div><div className="mt-3 text-sm font-bold">{docLabel(selected.docType)} • {selected.docNumber}</div><div className="text-xs text-slate-500 mt-1">{selected.docDate}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><Detail label="Supply" value={selected.supplyType === 'O' ? 'Outward' : 'Inward'} /><Detail label="Sub Type" value={selected.subSupplyType} /><Detail label="From" value={selected.from.legalName} /><Detail label="To" value={selected.to.legalName} /><Detail label="GSTIN" value={selected.to.gstin || 'URP'} /><Detail label="Vehicle" value={selected.vehicleNo || '-'} /><Detail label="Distance" value={`${selected.transDistance} KM`} /><Detail label="Items" value={String(selected.items.length)} /></div><div className="border-t border-slate-100 pt-4"><h3 className="font-black text-sm mb-2">Actions</h3><div className="grid grid-cols-1 gap-2"><button onClick={() => exportJson(selected)} className="rounded-xl bg-blue-600 text-white px-4 py-3 text-xs font-black flex items-center justify-center gap-2 hover:bg-blue-700"><FileJson className="w-4 h-4" /> Export JSON (NIC schema)</button><button onClick={() => downloadPdf(selected)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black flex items-center justify-center gap-2 hover:bg-slate-50"><Download className="w-4 h-4" /> Download PDF</button></div></div></div></aside></div>}
  </div>;
};

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-100 p-3"><div className="text-[10px] text-slate-400">{label}</div><div className="font-bold text-slate-700 mt-1 break-words">{value || '-'}</div></div>; }
function PartyCard({ title, party, onChange }: { title: string; party: PartyForm; onChange: (key: keyof PartyForm, value: string) => void }) {
  return <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 bg-white shadow-sm"><div className="flex items-center gap-2 mb-4"><MapPin className="w-4 h-4 text-blue-600" /><h3 className="font-black">{title}</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="GSTIN / URP" hint="Enter URP when GSTIN is not available"><Input value={party.gstin} onChange={e => onChange('gstin', e.target.value)} maxLength={15} placeholder="15-char GSTIN or URP" /></Field><Field label="State" required><Select value={party.stateCode} onChange={e => onChange('stateCode', e.target.value)}>{STATE_CODES.map(([c,n]) => <option key={c} value={c}>{c} - {n}</option>)}</Select></Field><Field label="Legal Name" required><Input value={party.legalName} onChange={e => onChange('legalName', e.target.value)} /></Field><Field label="Trade Name"><Input value={party.tradeName} onChange={e => onChange('tradeName', e.target.value)} /></Field><Field label="Address Line 1" required><Input value={party.addr1} onChange={e => onChange('addr1', e.target.value)} /></Field><Field label="Address Line 2"><Input value={party.addr2} onChange={e => onChange('addr2', e.target.value)} /></Field><Field label="City" required><Input value={party.city} onChange={e => onChange('city', e.target.value)} /></Field><Field label="6-digit Pincode" required><Input value={party.pincode} onChange={e => onChange('pincode', e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} /></Field></div></section>;
}
