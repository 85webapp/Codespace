import { apiFetch } from '../utils/api';
import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  Ban,
  RefreshCw,
  Smartphone,
  Trash2,
  Clock,
  UserCheck,
  AlertCircle,
  Link2,
} from 'lucide-react';
import { User as UserType } from '../types';

interface Props {
  isOpen: boolean;
  currentUser: UserType | null;
  onClose: () => void;
  onOpenCashierLink?: () => void;
}

export const GrantPermission: React.FC<Props> = ({
  isOpen,
  currentUser,
  onClose,
  onOpenCashierLink,
}) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const notify = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/cashier-handshake/pending');
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `Unable to load cashier permissions (HTTP ${r.status}).`);
      setRequests(Array.isArray(d.requests) ? d.requests : []);
      setDevices(Array.isArray(d.devices) ? d.devices : []);
      setActionNotice(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to load cashier permissions. Please try again.';
      setActionNotice(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      load();
      const i = setInterval(load, 2500);
      return () => clearInterval(i);
    }
  }, [isOpen, currentUser?.mobile]);

  const decision = async (id: string, dec: 'APPROVED' | 'REJECTED', name: string) => {
    setProcessingId(id);
    try {
      const res = await apiFetch('/api/cashier-handshake/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, decision: dec }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Operation failed');

      notify(
        dec === 'APPROVED'
          ? `Cashier access approved for "${name}". Terminal is now unlocked and live.`
          : `Cashier request canceled for "${name}". Device session permanently revoked and blocked.`
      );
      await load();
    } catch (e: any) {
      notify(e.message || 'Operation failed');
    } finally {
      setProcessingId(null);
    }
  };

  const removeDevice = async (id: string, name: string) => {
    if (!window.confirm(`Revoke all cashier billing access for "${name}"?`)) return;
    setProcessingId(id);
    try {
      const res = await apiFetch(`/api/cashier/devices/${encodeURIComponent(id)}/remove`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Revocation failed');
      notify(`Cashier device access for "${name}" has been permanently revoked.`);
      await load();
    } catch (e: any) {
      notify(e.message || 'Revocation failed');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isOpen) return null;

  const activeDevices = devices.filter((d) => !d.revoked);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92dvh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold border border-blue-100">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Grant Permissions &amp; Cashier Management
              </h2>
              <p className="text-xs text-slate-500">
                Live authorization center for store cashier devices and terminal access
              </p>
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

        {/* Action feedback banner */}
        {actionNotice && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          
          {/* Section 1: Pending Cashier Connection Requests */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900">
                  Pending Cashier Connection Requests
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                  {requests.length}
                </span>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Refresh requests"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                <span className="text-[11px] font-semibold">Refresh</span>
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 bg-slate-50/50">
                No cashiers currently awaiting clearance. Share your Cashier Link to invite staff.
              </div>
            ) : (
              <div className="space-y-2.5">
                {requests.map((r) => (
                  <div
                    key={r.request_id}
                    className="p-4 rounded-2xl border border-amber-200 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <span>{r.cashier_name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/70 text-amber-900">
                          Pending Approval
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
                        <span>Unique Code:</span>
                        <span className="font-mono font-black text-sm px-2 py-0.5 rounded bg-white border border-amber-300 text-blue-700 tracking-wider">
                          {r.handshake_code_five_digit}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          • {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={processingId === r.request_id}
                        onClick={() => decision(r.request_id, 'REJECTED', r.cashier_name)}
                        className="px-3.5 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Cancel / Deactivate</span>
                      </button>
                      <button
                        type="button"
                        disabled={processingId === r.request_id}
                        onClick={() => decision(r.request_id, 'APPROVED', r.cashier_name)}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept &amp; Unlock</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Active & Allowed Cashiers */}
          <section className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Active &amp; Allowed Cashiers
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  {activeDevices.length}
                </span>
              </div>

              {onOpenCashierLink && (
                <button
                  type="button"
                  onClick={onOpenCashierLink}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Get Link</span>
                </button>
              )}
            </div>

            {activeDevices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 bg-slate-50/50">
                No active cashier terminals yet. Approved devices will appear here with live sync status.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeDevices.map((d) => (
                  <div
                    key={d.device_id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 font-bold">
                        <Smartphone className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <span>{d.cashier_name}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active &amp; Allowed
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Approved: {new Date(d.approved_at).toLocaleDateString()} • Last active:{' '}
                          {d.last_used_at ? new Date(d.last_used_at).toLocaleTimeString() : 'Active session'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={processingId === d.device_id}
                      onClick={() => removeDevice(d.device_id, d.cashier_name)}
                      className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke Access</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Changes apply in real-time across all cashier devices.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
