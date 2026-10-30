import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  Layers,
  TrendingDown,
  TrendingUp,
  Receipt,
  Scale,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Wallet,
  Download
} from 'lucide-react';
import { Invoice, Purchase } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ItcDashboardProps {
  userMobile?: string;
  invoices?: Invoice[];
  purchases?: Purchase[];
  onClose?: () => void;
}

export const ItcDashboard: React.FC<ItcDashboardProps> = ({
  userMobile = '',
  invoices = [],
  purchases = [],
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState<{
    inputITC: {
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
      taxableValue: number;
      totalValue: number;
      verifiedBillsCount: number;
    };
    outputGST: {
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
      taxableValue: number;
      invoicesCount: number;
    };
    rcmLiability: number;
    netPayable: {
      netIgst: number;
      netCgst: number;
      netSgst: number;
      rcmCharges: number;
      totalYouPay: number;
      itcCarryForward: number;
    };
  }>({
    inputITC: {
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
      taxableValue: 0,
      totalValue: 0,
      verifiedBillsCount: 0,
    },
    outputGST: {
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
      taxableValue: 0,
      invoicesCount: 0,
    },
    rcmLiability: 0,
    netPayable: {
      netIgst: 0,
      netCgst: 0,
      netSgst: 0,
      rcmCharges: 0,
      totalYouPay: 0,
      itcCarryForward: 0,
    },
  });

  const loadItcData = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = userMobile ? { 'x-user-mobile': userMobile } : {};
      const res = await apiFetch('/api/compliance/itc-summary', { headers });
      if (!res.ok) throw new Error('Unable to load ITC data from your account.');
      const payload = await res.json();
      setData(payload);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load ITC data from your account.');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadItcData();
  }, [userMobile]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading ITC data…</div>;
  if (loadError) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"><p className="font-semibold">ITC data is unavailable.</p><p className="mt-1">{loadError}</p><button onClick={loadItcData} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-white font-semibold">Retry</button></div>;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Input Tax Credit (ITC) & GST Liability Cockpit
            </h2>
            <p className="text-xs text-slate-500">
              Input tax credit, output tax liability, and estimated net payable from recorded transactions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={loadItcData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-500 hover:text-slate-800"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* HIGHLIGHTED NET "YOU PAY" BANNER AT GLANCE */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-white to-emerald-50 border border-emerald-500/40 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                Auto-Calculated Final Liability
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Under Section 49 GST Set-Off Rules
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
              You Pay:{' '}
              <span className="text-emerald-700 font-mono">
                {formatCurrency(data.netPayable.totalYouPay)}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Estimated net tax liability based on recorded purchase and sales entries
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {data.netPayable.itcCarryForward > 0 && (
              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-right">
                <div className="text-[10px] text-teal-700 font-bold uppercase">ITC Balance Carried Forward</div>
                <div className="text-base font-black font-mono text-teal-700">
                  {formatCurrency(data.netPayable.itcCarryForward)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4 Net Payable Components Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-200">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block uppercase">Net IGST Payable</span>
            <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">
              {formatCurrency(data.netPayable.netIgst)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block uppercase">Net CGST Payable</span>
            <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">
              {formatCurrency(data.netPayable.netCgst)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block uppercase">Net SGST Payable</span>
            <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">
              {formatCurrency(data.netPayable.netSgst)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-amber-700 font-bold block uppercase">RCM Cash Charges</span>
            <span className="text-base font-black font-mono text-amber-700 mt-0.5 block">
              {formatCurrency(data.netPayable.rcmCharges)}
            </span>
          </div>
        </div>
      </div>

      {/* TABLE 1: INPUT TAX CREDIT (ITC) FROM 100% MATCHED PURCHASES */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm space-y-0">
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Input Tax Credit (ITC Available)
              </h3>
              <p className="text-xs text-slate-500">
                Input tax credit based on recorded purchase ledger data
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            {data.inputITC.verifiedBillsCount} Recorded Bills
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Tax Head</th>
                <th className="py-3 px-4">Legal Reference</th>
                <th className="py-3 px-4 text-right">Taxable Value (₹)</th>
                <th className="py-3 px-4 text-right">Verified ITC Amount (₹)</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              <tr className="hover:bg-slate-50">
                <td className="py-3.5 px-4 font-sans font-bold text-slate-800">
                  Central Tax (CGST)
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  GSTR-3B Table 4(A)(5) Inward
                </td>
                <td className="py-3.5 px-4 text-right text-slate-700">
                  —
                </td>
                <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                  {formatCurrency(data.inputITC.cgst)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Recorded ITC
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3.5 px-4 font-sans font-bold text-slate-800">
                  State / UT Tax (SGST)
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  GSTR-3B Table 4(A)(5) Inward
                </td>
                <td className="py-3.5 px-4 text-right text-slate-700">
                  —
                </td>
                <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                  {formatCurrency(data.inputITC.sgst)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Recorded ITC
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3.5 px-4 font-sans font-bold text-slate-800">
                  Integrated Tax (IGST)
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  Inter-state Inward Supplies
                </td>
                <td className="py-3.5 px-4 text-right text-slate-700">
                  —
                </td>
                <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                  {formatCurrency(data.inputITC.igst)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Recorded ITC
                  </span>
                </td>
              </tr>

              {/* Total Input Row */}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                <td className="py-3.5 px-4 font-sans text-emerald-700 uppercase">
                  Total Input ITC
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  Net Claimable Amount
                </td>
                <td className="py-3.5 px-4 text-right text-slate-800">
                  {formatCurrency(data.inputITC.taxableValue)}
                </td>
                <td className="py-3.5 px-4 text-right text-emerald-700 text-sm font-black">
                  {formatCurrency(data.inputITC.total)}
                </td>
                <td className="py-3.5 px-4 text-center text-emerald-700">
                  Recorded
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 2: OUTPUT GST LIABILITY COLLECTED FROM SALES INVOICES */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm space-y-0">
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                2. Output GST Liability
              </h3>
              <p className="text-xs text-slate-500">
                Total tax collected from sales invoices register
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
            {data.outputGST.invoicesCount} Sales Invoices
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Liability Head</th>
                <th className="py-3 px-4">Source: Sales Invoices</th>
                <th className="py-3 px-4 text-right">Total Sales (₹)</th>
                <th className="py-3 px-4 text-right">Collected GST (₹)</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              <tr className="hover:bg-slate-50">
                <td className="py-3.5 px-4 font-sans font-bold text-slate-800">
                  Output Central Tax (CGST)
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  GSTR-3B Table 3.1(a) Outward
                </td>
                <td className="py-3.5 px-4 text-right text-slate-700">
                  —
                </td>
                <td className="py-3.5 px-4 text-right font-black text-rose-700">
                  {formatCurrency(data.outputGST.cgst)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Output Payable
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3.5 px-4 font-sans font-bold text-slate-800">
                  Output State / UT Tax (SGST)
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  GSTR-3B Table 3.1(a) Outward
                </td>
                <td className="py-3.5 px-4 text-right text-slate-700">
                  —
                </td>
                <td className="py-3.5 px-4 text-right font-black text-rose-700">
                  {formatCurrency(data.outputGST.sgst)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Output Payable
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3.5 px-4 font-sans font-bold text-slate-800">
                  Output Integrated Tax (IGST)
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  Inter-state Outward B2B/B2C
                </td>
                <td className="py-3.5 px-4 text-right text-slate-700">
                  —
                </td>
                <td className="py-3.5 px-4 text-right font-black text-rose-700">
                  {formatCurrency(data.outputGST.igst)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Output Payable
                  </span>
                </td>
              </tr>

              {/* Total Output Row */}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                <td className="py-3.5 px-4 font-sans text-rose-300 uppercase">
                  Total Output Tax
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-sans">
                  Payable to Government
                </td>
                <td className="py-3.5 px-4 text-right text-slate-800">
                  {formatCurrency(data.outputGST.taxableValue)}
                </td>
                <td className="py-3.5 px-4 text-right text-rose-700 text-sm font-black">
                  {formatCurrency(data.outputGST.total)}
                </td>
                <td className="py-3.5 px-4 text-center text-rose-700">
                  Payable
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
