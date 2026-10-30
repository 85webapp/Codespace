import { apiFetch } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { LockKeyhole, Building2, Loader2, ShieldCheck, ArrowRight } from 'lucide-react';
import { CashierHandshakeModal } from './CashierHandshakeModal';

export const CashierAccessPage: React.FC = () => {
  const p = new URLSearchParams(window.location.search);
  const owner = p.get('owner') || '';
  const link = p.get('link') || '';
  try { if (owner && link) { sessionStorage.setItem('cotrix_cashier_entry_owner', owner); sessionStorage.setItem('cotrix_cashier_entry_link', link); } } catch {}

  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!owner || !link) {
      setError('Invalid or incomplete cashier access link. Please ask your business manager for a new link.');
      setLoading(false);
      return;
    }

    apiFetch(`/api/cashier/preview?owner=${encodeURIComponent(owner)}&link=${encodeURIComponent(link)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Invalid or revoked cashier access link.');
        setPreview(d);
        if (d.business_name) {
          try {
            sessionStorage.setItem('cotrix_cashier_merchant_name', d.business_name);
          } catch {}
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [owner, link]);

  const businessTitle = preview?.business_name || (owner ? `Merchant (${owner})` : 'Store Billing Terminal');

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          
          {/* Top Hero Header with Legal Profile Identity */}
          <div className="p-6 sm:p-8 bg-gradient-to-br from-blue-50/80 via-white to-blue-50/30 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-5">
            {preview?.logo_url ? (
              <img
                src={preview.logo_url}
                alt="Business Logo"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-blue-200 bg-white shadow-xs shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-blue-500/25 shrink-0">
                <Building2 className="w-8 h-8" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Cashier POS Terminal
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  Secure Link
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 truncate">
                {businessTitle}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Authorized billing and inventory inward data-entry point
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {loading ? (
              <div className="text-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 mx-auto text-blue-600 animate-spin" />
                <p className="text-xs text-slate-500 font-semibold">Connecting to store authorization server...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold">
                {error}
              </div>
            ) : (
              <>
                {/* 4 Allowed Terminal Capabilities preview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sales</div>
                    <div className="font-bold text-sm text-slate-800 mt-1">Issue GST Bill</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Purchases</div>
                    <div className="font-bold text-sm text-slate-800 mt-1">Inward Bills</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Receipts</div>
                    <div className="font-bold text-sm text-slate-800 mt-1">Payment In/Out</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Closing</div>
                    <div className="font-bold text-sm text-slate-800 mt-1">Drawer Cash</div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl border border-blue-200 bg-blue-50/60 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-sm">
                    <LockKeyhole className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      Merchant Approval Required
                    </h2>
                    <p className="text-xs text-slate-600 max-w-md mx-auto mt-1 leading-relaxed">
                      Tap the button below to submit your cashier request. Once approved by <strong>{businessTitle}</strong> in Grant Permissions, your terminal will unlock immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <span>Request Terminal Authorization</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      <CashierHandshakeModal
        isOpen={open && !error && !loading}
        ownerMobile={owner}
        onClose={() => setOpen(false)}
        onApproved={() => {
          try {
            localStorage.setItem('cotrix_cashier_user', JSON.stringify({
              name: sessionStorage.getItem('cotrix_cashier_name') || '',
              mobile: owner,
              role: 'CASHIER',
              profile_picture: sessionStorage.getItem('cotrix_cashier_profile_picture') || '',
            }));
            localStorage.setItem('cotrix_cashier_session_mode', 'CASHIER_RESTRICTED');
          } catch {}
          window.location.href = '/';
        }}
      />
    </div>
  );
};
