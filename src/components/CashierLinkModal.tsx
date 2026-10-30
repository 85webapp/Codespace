import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, RefreshCw, Check, ShieldCheck, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CashierLinkModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const r = await apiFetch('/api/cashier/link', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to generate cashier link');
      setLink(d.link || '');
    } catch (e: any) {
      setError(e.message || 'Unable to generate cashier link');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLink('');
      setError('');
      setCopied(false);
      generate();
    }
  }, [isOpen]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Please highlight and copy the link text.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold border border-blue-100">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900">Cashier Access Link</h2>
              <p className="text-xs text-slate-500">Provide secure billing access to store cashiers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900">
            <div className="font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Two-Factor Owner Clearance Guard
            </div>
            <p className="mt-1 text-slate-600 leading-relaxed">
              Sharing this link does not grant immediate login. The cashier must send a clearance request with their name and 5-digit code, which you approve under <strong>Grant Permissions</strong>.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Cashier Terminal Link</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                placeholder={loading ? 'Generating secure link...' : 'No link generated'}
                className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-mono bg-slate-50 text-slate-800"
              />
              <button
                type="button"
                disabled={!link}
                onClick={copy}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-40 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="w-full rounded-xl border border-blue-200 bg-white hover:bg-blue-50/50 text-blue-700 font-bold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
            <span>Generate New Link (Rotates URL)</span>
          </button>

          <p className="text-[11px] text-slate-400">
            Generating a new link automatically invalidates previously shared links.
          </p>
        </div>
      </div>
    </div>
  );
};
