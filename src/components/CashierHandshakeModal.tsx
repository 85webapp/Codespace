import { apiFetch } from '../utils/api';
import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldAlert, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  ownerMobile: string;
  cashierSessionToken?: string;
  onClose: () => void;
  onApproved: () => void;
}

export const CashierHandshakeModal: React.FC<Props> = ({
  isOpen,
  ownerMobile,
  onClose,
  onApproved,
}) => {
  const [name, setName] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [code, setCode] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const poll = useRef<any>(null);
  const link = new URLSearchParams(window.location.search).get('link') || '';

  const cleanup = () => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = null;
    }
  };

  useEffect(() => () => cleanup(), []);

  const handleClose = () => {
    cleanup();
    setWaiting(false);
    onClose();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Please enter your full name.');
    try {
      const r = await apiFetch('/api/cashier-handshake/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerMobile, link, cashierName: name.trim(), profilePicture }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Request failed');
      setCode(d.code);
      setWaiting(true);

      poll.current = setInterval(async () => {
        try {
          const sr = await apiFetch(
            `/api/cashier-handshake/status?requestId=${encodeURIComponent(d.requestId)}&statusToken=${encodeURIComponent(d.statusToken)}`
          );
          const sd = await sr.json();
          if (sd.permission_status === 'APPROVED') {
            cleanup();
            if (sd.deviceToken) {
              try {
                localStorage.setItem('cotrix_cashier_device_token', sd.deviceToken);
                localStorage.setItem('cotrix_cashier_name', name.trim());
                localStorage.setItem('cotrix_cashier_profile_picture', profilePicture);
              } catch {}
            }
            setTimeout(onApproved, 400);
          } else if (sd.permission_status === 'REJECTED' || sd.permission_status === 'EXPIRED') {
            cleanup();
            setWaiting(false);
            setError(
              sd.permission_status === 'REJECTED'
                ? 'Access Denied: Business owner canceled or rejected this request. Access permanently blocked.'
                : 'Request expired after 30 minutes. Please submit a new request.'
            );
          }
        } catch {
          // ignore network glitch during polling
        }
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Unable to connect to authorization server.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">Cashier Authorization</h2>
              <p className="text-xs text-slate-500">Business owner clearance required</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {waiting ? (
          <div className="text-center py-6 space-y-4">
            <Loader2 className="w-10 h-10 mx-auto text-blue-600 animate-spin" />
            <div>
              <div className="text-xs uppercase text-slate-500 font-bold tracking-wider">
                Clearance Code
              </div>
              <div className="text-3xl font-black font-mono tracking-[0.3em] text-blue-700 mt-1">
                {code}
              </div>
            </div>
            <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
              Show this 5-digit code to the merchant to approve in their <strong>Grant Permissions</strong> panel.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel Request
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="mt-5 space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-slate-700 leading-relaxed">
              Enter your name below. The business owner will review and unlock this terminal from the <strong>Grant Permissions</strong> screen.
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Cashier Staff Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe (Counter 1)"
                className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                autoFocus
              />
              <label className="mt-3 block text-xs font-bold text-slate-700">Profile Picture (Optional)<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) { setProfilePicture(''); return; } if (file.size > 1_000_000) { setError('Choose an image smaller than 1 MB.'); event.target.value=''; return; } const reader = new FileReader(); reader.onload = () => setProfilePicture(String(reader.result || '')); reader.readAsDataURL(file); }} className="mt-1 block w-full rounded-xl border border-slate-300 p-2 text-sm" /></label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                Request Access
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
