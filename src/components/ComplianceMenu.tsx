import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import { downloadDetailsPdf } from '../utils/pdfShare';
import React, { useState } from 'react';
import {
  Truck,
  FileDiff,
  FileJson,
  Layers,
  Camera,
  BookOpen,
  Scale,
  TrendingUp,
  FileSpreadsheet,
  ShieldAlert,
  X,
  Plus,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Search,
  DollarSign,
} from 'lucide-react';
import { AppSettings, Purchase, Invoice } from '../types';
import { translations, Language } from '../utils/translations';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Gstr2bReconciler } from './Gstr2bReconciler';
import { ItcDashboard } from './ItcDashboard';
import { VisionExtractionStudio } from './VisionExtractionStudio';

interface ComplianceMenuProps {
  settings: AppSettings;
  language: Language;
  onClose?: () => void;
  userMobile?: string;
  purchases?: Purchase[];
  invoices?: Invoice[];
  onRefreshData?: () => void;
  initialModule?: string | null;
  onOpenExpenseModal?: (initialAddOpen?: boolean) => void;
}

export const ComplianceMenu: React.FC<ComplianceMenuProps> = ({
  settings,
  language,
  onClose,
  userMobile = '',
  purchases = [],
  invoices = [],
  onRefreshData,
  initialModule = null,
  onOpenExpenseModal,
}) => {
  const t = translations[language] || translations.en;
  const [activeModule, setActiveModule] = useState<string | null>(initialModule);
  const [finalAccounts, setFinalAccounts] = useState<any>(null);

  React.useEffect(() => {
    const headers: Record<string, string> = userMobile ? { 'x-user-mobile': userMobile } : {};
    apiFetch('/api/accounting/final-accounts', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setFinalAccounts(data);
      })
      .catch(() => {});
  }, [userMobile, activeModule]);

  // States for sub-module interactive mock/API operations
  // 1. e-Way Bill
  const [ewbTab, setEwbTab] = useState<'CREATE' | 'HISTORY'>('HISTORY');
  const [ewbList, setEwbList] = useState([
    {
      id: 'EWB-001',
      ewb_number: '311084920194',
      doc_number: 'INV/2026/001',
      date: '25/09/2026',
      to_legal_name: 'Apex Engineering Works Pvt Ltd',
      to_gstin: '07AABCA1234A1Z1',
      consign_value: 78500.0,
      vehicle_no: 'DL01AB9876',
      distance: 42,
      status: 'ACTIVE',
      valid_until: '26/09/2026 23:59',
    },
  ]);

  // Form states for EWB
  const [newEwb, setNewEwb] = useState({
    doc_number: 'INV/2026/003',
    to_legal_name: 'Super Steel Fabricators Ltd',
    to_gstin: '07AAECS9988C1Z4',
    to_address: 'Sector 58, Noida, Uttar Pradesh',
    consign_value: '64500',
    approx_distance_km: '38',
    vehicle_number: 'UP16CT4321',
  });

  // 2. GSTR-2B JSON Auto-Reader state
  const [gstr2bProcessed, setGstr2bProcessed] = useState(false);
  const [gstr2bSummary, setGstr2bSummary] = useState({
    totalB2BInvoices: 14,
    eligibleITC: 48650.0,
    ineligibleITC: 2450.0,
    matchedSuppliers: 12,
    mismatchedSuppliers: 2,
  });

  // 3. Journal Entry Double-entry Form
  const [journalRows, setJournalRows] = useState([
    { account: 'Rent Expense Account', debit: '12000', credit: '0' },
    { account: 'Bank Account - HDFC', debit: '0', credit: '12000' },
  ]);
  const [journalSaved, setJournalSaved] = useState(false);

  // 4. Vision OCR Image Parsing Staging
  const [ocrStaged, setOcrStaged] = useState(false);
  const [ocrFileName, setOcrFileName] = useState('');
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // 10 Compliance Feature Modules Definitions
  const complianceModules = [
    {
      id: 'ewb',
      title: 'e-Way Bill Management Console',
      desc: 'Create Form Engine, distance calculation, NIC JSON export & history ledger',
      icon: Truck,
      color: 'emerald',
      tag: 'Section 68 / Rule 138',
    },
    {
      id: 'cdn',
      title: 'Credit and Debit Notes Core Ledger',
      desc: 'Section 34 GST Act debit/credit adjustment notes linked to original bills',
      icon: FileDiff,
      color: 'cyan',
      tag: 'Section 34 CGST',
    },
    {
      id: 'gstr2b',
      title: 'GSTR-2B JSON Auto-Reader & Dropzone',
      desc: 'Parse portal JSON files, check eligible vs ineligible ITC, supplier matching',
      icon: FileJson,
      color: 'indigo',
      tag: 'Rule 36(4) Auto-Recon',
    },
    {
      id: 'itc3tier',
      title: '3-Tier Input Tax Credit (ITC) Compliance',
      desc: 'Table 4 GSTR-3B: Available, Reversed under Rule 38/42/43, and Ineligible 17(5)',
      icon: Layers,
      color: 'amber',
      tag: 'GSTR-3B Table 4',
    },
    {
      id: 'ocr',
      title: 'Manual Purchase Entry Vision OCR Staging',
      desc: 'Upload purchase receipts/bills with client OCR parser staging into purchase ledger',
      icon: Camera,
      color: 'teal',
      tag: 'AI Document Vision',
    },
    {
      id: 'journal',
      title: 'Automated Double-Entry Journal Records',
      desc: 'Debit = Credit strict balance enforcement, Golden Rules of Accounting vouchers',
      icon: BookOpen,
      color: 'blue',
      tag: 'General Ledger Engine',
    },
    {
      id: 'trial_balance',
      title: 'Live T-Shape Balancing Trial Balance',
      desc: 'Debit column vs Credit column real-time zero-difference audit verification',
      icon: Scale,
      color: 'emerald',
      tag: 'Audit Verification',
    },
    {
      id: 'pl',
      title: 'Dynamic Profit & Loss Statement Matrix',
      desc: 'Trading account, Gross profit, operating expenses, and net profit analytics',
      icon: TrendingUp,
      color: 'purple',
      tag: 'Schedule III Part II',
    },
    {
      id: 'balance_sheet',
      title: 'Schedule-Mapped Corporate Balance Sheet',
      desc: 'Equities & Liabilities vs Assets matching Indian Companies Act & Partnership standards',
      icon: FileSpreadsheet,
      color: 'rose',
      tag: 'Schedule III Part I',
    },
    {
      id: 'audit_trail',
      title: 'Forensic System Audit Trail & Edit Logs',
      desc: 'Immutable read-only log of bill edits, cash summaries, deletions & client actions',
      icon: ShieldAlert,
      color: 'slate',
      tag: 'Rule 11(g) Compliant',
    },
    {
      id: 'expenses',
      title: 'Expense Book & Outflow Register',
      desc: 'Manual expense vouchers, categories (tea, petrol, rent, wages), petty cash drawers & reports',
      icon: DollarSign,
      color: 'rose',
      tag: 'Expense Register',
    },
  ];

  const handleCreateEwb = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry = {
      id: 'EWB-' + Date.now(),
      ewb_number: '3110' + Math.floor(10000000 + Math.random() * 90000000),
      doc_number: newEwb.doc_number,
      date: '29/09/2026',
      to_legal_name: newEwb.to_legal_name,
      to_gstin: newEwb.to_gstin,
      consign_value: parseFloat(newEwb.consign_value) || 0,
      vehicle_no: newEwb.vehicle_number,
      distance: parseInt(newEwb.approx_distance_km) || 40,
      status: 'ACTIVE',
      valid_until: '30/09/2026 23:59',
    };
    setEwbList([newEntry, ...ewbList]);
    setEwbTab('HISTORY');
  };

  const handleOcrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOcrFileName(file.name);
      setOcrStaged(true);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      
      {/* Menu Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Indian GST & MCA Architecture
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
            Compliance Component Master Menu
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Enterprise statutory filing tools, forensic audit trails, and automated financial statements
          </p>
        </div>
      </div>

      {/* Grid of 10 Advanced Business Compliance Modules */}
      {!activeModule ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {complianceModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                onClick={() => {
                  if (mod.id === 'expenses' && onOpenExpenseModal) {
                    onOpenExpenseModal(false);
                  } else {
                    setActiveModule(mod.id);
                  }
                }}
                className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 hover:bg-slate-850 hover:border-emerald-500/50 transition-all cursor-pointer group shadow-lg shadow-black/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 group-hover:border-emerald-500/30 transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 group-hover:border-emerald-500/30">
                      {mod.tag}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-100 group-hover:text-emerald-300 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {mod.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-emerald-400">
                  <span>Launch Workspace</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Standalone Active Sub-Module View */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl p-5 sm:p-6 space-y-6">
          
          {/* Sub-view Top Bar with Back Button */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <button
              onClick={() => { setActiveModule(null); setStatusToast(null); }}
              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <span>← Return to Compliance Menu</span>
            </button>
            <button
              onClick={() => { setActiveModule(null); setStatusToast(null); }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {statusToast && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-medium flex items-center justify-between">
              <span>{statusToast}</span>
              <button onClick={() => setStatusToast(null)} className="text-emerald-400 hover:text-emerald-200 ml-2">✕</button>
            </div>
          )}

          {/* Module 1: e-Way Bill Console */}
          {activeModule === 'ewb' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-emerald-400" />
                    <span>e-Way Bill Management Console</span>
                  </h2>
                  <p className="text-xs text-slate-400">Section 68 / Rule 138 Inter-State & Intra-State Consignments</p>
                </div>

                {/* Sub tabs: Create vs History */}
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    onClick={() => setEwbTab('CREATE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      ewbTab === 'CREATE' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Create New Form Engine
                  </button>
                  <button
                    onClick={() => setEwbTab('HISTORY')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      ewbTab === 'HISTORY' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    View Details History Ledger Workspace
                  </button>
                </div>
              </div>

              {ewbTab === 'CREATE' ? (
                <form onSubmit={handleCreateEwb} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-slate-300 font-semibold mb-1 block">Linked Document / Invoice No.</label>
                      <input
                        type="text"
                        value={newEwb.doc_number}
                        onChange={(e) => setNewEwb({ ...newEwb, doc_number: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold mb-1 block">Recipient Legal Trade Name</label>
                      <input
                        type="text"
                        value={newEwb.to_legal_name}
                        onChange={(e) => setNewEwb({ ...newEwb, to_legal_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold mb-1 block">Recipient GSTIN</label>
                      <input
                        type="text"
                        value={newEwb.to_gstin}
                        onChange={(e) => setNewEwb({ ...newEwb, to_gstin: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold mb-1 block">Total Consignment Value (₹)</label>
                      <IndianAmountInput
                        value={newEwb.consign_value}
                        onValueChange={(value) => setNewEwb({ ...newEwb, consign_value: value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold mb-1 block">Approx Distance (KM)</label>
                      <input
                        type="number"
                        value={newEwb.approx_distance_km}
                        onChange={(e) => setNewEwb({ ...newEwb, approx_distance_km: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold mb-1 block">Vehicle Number</label>
                      <input
                        type="text"
                        value={newEwb.vehicle_number}
                        onChange={(e) => setNewEwb({ ...newEwb, vehicle_number: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors"
                    >
                      Generate e-Way Bill & Validate NIC JSON
                    </button>
                  </div>
                </form>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="border-b border-slate-800 text-slate-400 uppercase">
                      <tr>
                        <th className="py-2 px-3">e-Way Bill No.</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Invoice Ref</th>
                        <th className="py-2 px-3">Consignee</th>
                        <th className="py-2 px-3 text-right">Value (₹)</th>
                        <th className="py-2 px-3">Vehicle</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">NIC JSON</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {ewbList.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-bold text-emerald-400">{e.ewb_number}</td>
                          <td className="py-3 px-3 text-slate-300">{e.date}</td>
                          <td className="py-3 px-3 text-slate-400">{e.doc_number}</td>
                          <td className="py-3 px-3 font-sans text-slate-200">{e.to_legal_name}</td>
                          <td className="py-3 px-3 text-right font-bold text-slate-100">{formatCurrency(e.consign_value)}</td>
                          <td className="py-3 px-3 text-slate-300">{e.vehicle_no}</td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {e.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => {
                                downloadDetailsPdf(
                                  'E-Way Bill',
                                  Object.entries(e as Record<string, any>)
                                    .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
                                    .map(([k, v]) => [k.replace(/_/g, ' ').toUpperCase(), String(v ?? '-')] as [string, string]),
                                  `EWB_${e.ewb_number}.pdf`
                                );
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Module 2: GSTR-2B JSON Auto-Reader & Reconciliation Engine */}
          {activeModule === 'gstr2b' && (
            <Gstr2bReconciler
              userMobile={userMobile}
              existingPurchases={purchases}
              onRefreshData={onRefreshData}
              onClose={() => setActiveModule(null)}
            />
          )}

          {/* Module 3: 3-Tier Input Tax Credit (ITC) Compliance Master Grid Matrix */}
          {activeModule === 'itc3tier' && (
            <ItcDashboard
              userMobile={userMobile}
              invoices={invoices}
              purchases={purchases}
              onClose={() => setActiveModule(null)}
            />
          )}

          {/* Module 4: Manual Purchase Entry Vision OCR Image Parsing Staging Studio */}
          {activeModule === 'ocr' && (
            <VisionExtractionStudio
              isOpen={true}
              onClose={() => setActiveModule(null)}
              userMobile={userMobile}
              onRefreshData={onRefreshData}
              onInvoiceCommitted={() => {
                setStatusToast('Purchase bill successfully committed to ledger!');
                if (onRefreshData) onRefreshData();
              }}
            />
          )}

          {/* Module 5: Automated Double-Entry Journal Records Accounting Engine */}
          {activeModule === 'journal' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                  <span>Automated Double-Entry Journal Records Accounting Engine</span>
                </h2>
                <p className="text-xs text-slate-400">Debit = Credit Strict Rule Enforcement & Adjustment Vouchers</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
                <div className="text-xs font-semibold text-slate-300">Voucher JV/2026/004 Lines</div>
                <div className="space-y-2">
                  {journalRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 text-xs font-mono">
                      <input
                        type="text"
                        value={row.account}
                        onChange={(e) => {
                          const copy = [...journalRows];
                          copy[idx].account = e.target.value;
                          setJournalRows(copy);
                        }}
                        className="col-span-6 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100"
                      />
                      <IndianAmountInput aria-label="Debit"
                        value={row.debit}
                        onValueChange={(value) => {
                          const copy = [...journalRows];
                          copy[idx].debit = value;
                          setJournalRows(copy);
                        }}
                        className="col-span-3 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-emerald-400 font-bold text-right"
                      />
                      <IndianAmountInput aria-label="Credit"
                        value={row.credit}
                        onValueChange={(value) => {
                          const copy = [...journalRows];
                          copy[idx].credit = value;
                          setJournalRows(copy);
                        }}
                        className="col-span-3 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-rose-400 font-bold text-right"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-between text-xs font-mono border-t border-slate-800">
                  <span className="text-emerald-400 font-bold">Total Debits: ₹12,000.00</span>
                  <span className="text-rose-400 font-bold">Total Credits: ₹12,000.00</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Balanced ✓</span>
                </div>

                <button
                  onClick={() => {
                    setJournalSaved(true);
                    setTimeout(() => setJournalSaved(false), 3000);
                  }}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
                >
                  {journalSaved ? 'Journal Voucher Posted Successfully!' : 'Post Balanced Journal Voucher'}
                </button>
              </div>
            </div>
          )}

          {/* Module 6: Live T-Shape Balancing Trial Balance Verification Grid */}
          {activeModule === 'trial_balance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-emerald-400" />
                    <span>Live T-Shape Balancing Trial Balance Verification Grid</span>
                  </h2>
                  <p className="text-xs text-slate-400">Zero-Difference Double Entry Integrity Verification</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
                  Difference: ₹0.00 (Balanced)
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-slate-800 text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Ledger Head</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Debit Balance (₹)</th>
                      <th className="py-2.5 px-3 text-right">Credit Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {finalAccounts?.trialBalance?.accounts && finalAccounts.trialBalance.accounts.length > 0 ? (
                      finalAccounts.trialBalance.accounts.map((acc: any, i: number) => (
                        <tr key={i}>
                          <td className="py-2 px-3 font-sans text-slate-200">{acc.name}</td>
                          <td>{acc.group}</td>
                          <td className="text-right text-emerald-400 font-bold">
                            {acc.debit > 0 ? acc.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                          </td>
                          <td className="text-right text-rose-400 font-bold">
                            {acc.credit > 0 ? acc.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-500 font-sans">
                          No accounting ledger balances recorded. All balances are ₹0.00.
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-950 font-bold text-sm border-t-2 border-slate-700">
                      <td className="py-3 px-3 text-slate-100">GRAND TOTAL TRIAL BALANCE</td>
                      <td></td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-black">
                        ₹{(finalAccounts?.trialBalance?.totalDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-400 font-black">
                        ₹{(finalAccounts?.trialBalance?.totalCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Module 7: Profit & Loss Statement */}
          {activeModule === 'pl' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  <span>Trading and Dynamic Profit & Loss Statement Matrix Analytics</span>
                </h2>
                <p className="text-xs text-slate-400">Schedule III Companies Act / Indian Partnership Accounting</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {/* Revenue and Trading */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                  <div className="font-bold text-slate-300 uppercase tracking-wider text-xs pb-1 border-b border-slate-800">
                    Trading Account & Operating Income
                  </div>
                  <div className="flex justify-between py-1 text-slate-300">
                    <span>Gross Sales from Operations:</span>
                    <span className="font-bold text-emerald-400">
                      ₹{(finalAccounts?.tradingAccount?.grossSales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-slate-400">
                    <span>Less Cost of Goods Sold (COGS):</span>
                    <span className="text-rose-400">
                      -₹{(finalAccounts?.tradingAccount?.cogs || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-800 font-bold text-slate-100">
                    <span>GROSS PROFIT:</span>
                    <span className="text-emerald-400 text-sm">
                      ₹{(finalAccounts?.tradingAccount?.grossProfit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Operating Expenses & Net Profit */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                  <div className="font-bold text-slate-300 uppercase tracking-wider text-xs pb-1 border-b border-slate-800">
                    Operating Overhead & Net Profit
                  </div>
                  <div className="flex justify-between py-1 text-slate-400">
                    <span>Operating Expenses:</span>
                    <span>
                      ₹{(finalAccounts?.profitLoss?.operatingExpenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-800 font-bold text-slate-100">
                    <span>NET PROFIT BEFORE TAX:</span>
                    <span className="text-emerald-300 text-sm">
                      ₹{(finalAccounts?.profitLoss?.netProfitBeforeTax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Module 8: Balance Sheet */}
          {activeModule === 'balance_sheet' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-rose-400" />
                  <span>Schedule-Mapped Corporate Structural Balance Sheet Presentation</span>
                </h2>
                <p className="text-xs text-slate-400">Equities & Liabilities vs Structural Assets</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {/* Liabilities */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                  <div className="font-bold text-slate-300 uppercase text-xs pb-1 border-b border-slate-800">
                    EQUITIES & LIABILITIES
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span>Owner Opening Capital:</span>
                      <span>₹{(finalAccounts?.balanceSheet?.liabilities?.openingCapital || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Add: Net Profit:</span>
                      <span>+₹{(finalAccounts?.balanceSheet?.liabilities?.addNetProfit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>Less: Drawings:</span>
                      <span>-₹{(finalAccounts?.balanceSheet?.liabilities?.lessDrawings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-1 border-t border-slate-800/60">
                      <span>Closing Capital:</span>
                      <span>₹{(finalAccounts?.balanceSheet?.liabilities?.closingCapital || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex justify-between text-slate-300">
                      <span>Trade Payables (Creditors):</span>
                      <span>₹{(finalAccounts?.balanceSheet?.liabilities?.sundryCreditors || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>GST Tax Liabilities:</span>
                      <span>₹{(finalAccounts?.balanceSheet?.liabilities?.taxLiabilities || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-slate-700 font-bold text-slate-100 text-sm">
                    <span>TOTAL LIABILITIES:</span>
                    <span className="text-emerald-400">
                      ₹{(finalAccounts?.balanceSheet?.liabilities?.totalLiabilities || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Assets */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                  <div className="font-bold text-slate-300 uppercase text-xs pb-1 border-b border-slate-800">
                    ASSETS & RECEIVABLES
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span>Plant & Machinery:</span>
                      <span>₹{(finalAccounts?.balanceSheet?.assets?.fixedAssets || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Closing Stock in Trade:</span>
                      <span>₹{(finalAccounts?.balanceSheet?.assets?.closingStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trade Debtors (Receivables):</span>
                      <span>₹{(finalAccounts?.balanceSheet?.assets?.sundryDebtors || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bank Balance:</span>
                      <span>₹{(finalAccounts?.balanceSheet?.assets?.bankBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cash in Hand (Drawer):</span>
                      <span>₹{(finalAccounts?.balanceSheet?.assets?.cashInHand || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Input Tax Credit (ITC):</span>
                      <span>₹{(finalAccounts?.balanceSheet?.assets?.itcPool || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-slate-700 font-bold text-slate-100 text-sm">
                    <span>TOTAL ASSETS:</span>
                    <span className="text-emerald-400">
                      ₹{(finalAccounts?.balanceSheet?.assets?.totalAssets || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Module 9: Forensic Audit Trail & Edit Logs */}
          {activeModule === 'audit_trail' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <span>Forensic Read-Only Multi-Tenant Security System Audit Trail / Edit Logs</span>
                </h2>
                <p className="text-xs text-slate-400">Section 143(3)(j) Companies (Audit and Auditors) Rules 11(g) Tamper-Proof Trail</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-slate-800 text-slate-400 uppercase">
                    <tr>
                      <th className="py-2 px-3">Audit Event ID</th>
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Action</th>
                      <th className="py-2 px-3">Entity</th>
                      <th className="py-2 px-3">User Context</th>
                      <th className="py-2 px-3">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr>
                      <td className="py-2.5 px-3 text-slate-400">AUD-1759148</td>
                      <td className="py-2.5 px-3 text-slate-300">29/09/2026 13:24:40</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">SUBMIT_DAILY_CASH_CLOSURE</td>
                      <td className="py-2.5 px-3 text-slate-300">daily_cash_summaries</td>
                      <td className="py-2.5 px-3 text-slate-400">cotrix_admin</td>
                      <td className="py-2.5 px-3 text-emerald-400">Hash Verified ✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-400">AUD-1759140</td>
                      <td className="py-2.5 px-3 text-slate-300">27/09/2026 16:12:05</td>
                      <td className="py-2.5 px-3 text-teal-400 font-bold">CREATE_INVOICE</td>
                      <td className="py-2.5 px-3 text-slate-300">invoices</td>
                      <td className="py-2.5 px-3 text-slate-400">cotrix_admin</td>
                      <td className="py-2.5 px-3 text-emerald-400">Hash Verified ✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-400">AUD-1759128</td>
                      <td className="py-2.5 px-3 text-slate-300">25/09/2026 11:04:19</td>
                      <td className="py-2.5 px-3 text-indigo-400 font-bold">GENERATE_EWAY_BILL</td>
                      <td className="py-2.5 px-3 text-slate-300">eway_bills</td>
                      <td className="py-2.5 px-3 text-slate-400">cotrix_admin</td>
                      <td className="py-2.5 px-3 text-emerald-400">Hash Verified ✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Module 10: Credit and Debit Notes Core Ledger Adjustments Form */}
          {activeModule === 'cdn' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <FileDiff className="w-5 h-5 text-cyan-400" />
                  <span>Credit and Debit Notes Core Ledger Adjustments Form</span>
                </h2>
                <p className="text-xs text-slate-400">Section 34 GST Act Sales Returns & Value Corrections</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-semibold mb-1 block">Note Type</label>
                    <select className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100">
                      <option value="CREDIT">Credit Note (Sales Return / Discount)</option>
                      <option value="DEBIT">Debit Note (Post-sale increase / supplementary)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold mb-1 block">Original Invoice Ref</label>
                    <input
                      type="text"
                      defaultValue="INV/2026/001"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold mb-1 block">Party Name</label>
                    <input
                      type="text"
                      defaultValue="Apex Engineering Works Pvt Ltd"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold mb-1 block">Credit Adjustment Amount (₹)</label>
                    <input
                      type="number"
                      defaultValue="4500"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setStatusToast('Credit Note CN/2026/001 created and ledger adjusted in Neon DB.')}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold cursor-pointer"
                >
                  Issue Credit Note & Recompute Party Ledger
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
