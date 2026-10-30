import React from 'react';
import {
  X,
  Globe,
  DollarSign,
  Calendar,
  Briefcase,
  LogIn,
  User,
  LogOut,
  Shield,
  ShieldCheck,
  Building2,
  Clock,
  ChevronRight,
  Sparkles,
  Printer,
  Volume2,
  Vibrate,
} from 'lucide-react';
import { AppSettings, User as UserType } from '../types';
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  getFinancialYearOptions,
} from '../utils/locale';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  currentUser: UserType | null;
  onClose: () => void;
  onSave: (newSettings: Partial<AppSettings>) => Promise<void>;
  onOpenLogin: (mode?: 'user-login' | 'user-register' | 'admin-login') => void;
  onOpenAdminPortal: () => void;
  onOpenAboutUs?: () => void;
  onOpenCashierLink?: () => void;
  onOpenGrantPermission?: () => void;
  onOpenInvoicePrint?: () => void;
  onLogout: () => void;
  onNavigateWorkspace?: (page: 'delete' | 'edit' | 'requests' | 'admin') => void;
}

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  currentUser,
  onClose,
  onSave,
  onOpenLogin,
  onOpenAdminPortal,
  onOpenAboutUs,
  onOpenCashierLink,
  onOpenGrantPermission,
  onOpenInvoicePrint,
  onLogout,
  onNavigateWorkspace,
}) => {

  const fy = getFinancialYearOptions();
  const activeFy = [fy.current, fy.previous].includes(settings.financial_year || '')
    ? (settings.financial_year as string)
    : fy.current;

  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [hapticsEnabled, setHapticsEnabled] = React.useState(true);
  const [primaryHapticsOnly, setPrimaryHapticsOnly] = React.useState(false);

  React.useEffect(() => {
    try {
      const sound = localStorage.getItem('cotrix_sound_enabled');
      const haptics = localStorage.getItem('cotrix_haptics_enabled');
      const primary = localStorage.getItem('cotrix_haptics_primary_only');
      setSoundEnabled(sound === null ? true : sound === 'true');
      setHapticsEnabled(haptics === null ? true : haptics === 'true');
      setPrimaryHapticsOnly(primary === 'true');
    } catch { /* Storage may be disabled in private browsing. */ }
  }, [isOpen]);

  const saveFeedbackPreference = (key: string, value: boolean) => {
    try { localStorage.setItem(key, String(value)); } catch { /* Keep in-memory state usable. */ }
  };

  // Every change applies and saves immediately - no separate save button
  const update = (patch: Partial<AppSettings>) => {
    onSave(patch);
  };

  const openAndClose = (fn?: () => void) => {
    onClose();
    if (fn) fn();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col text-slate-800 max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-white shrink-0">
          <h2 className="text-base font-bold text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Account */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <User className="w-3.5 h-3.5" />
              Account
            </div>
            {currentUser ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate">{currentUser.name?.trim() || 'Name not available'}</div>
                  <div className="text-xs text-slate-500 font-mono">{currentUser.mobile?.trim() || 'Mobile number not available'}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {currentUser.role === 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => openAndClose(onOpenAdminPortal)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                    >
                      Admin Portal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAndClose(() => onOpenLogin('user-login'))}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => openAndClose(() => onOpenLogin('user-register'))}
                  className="px-4 py-2 rounded-xl border border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Register</span>
                </button>
              </div>
            )}
          </div>

          {currentUser && currentUser.role !== 'CASHIER' && (
            <section className="mt-2 border-t border-slate-200 pt-5 space-y-3" aria-label="Record management">
              <div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Record Management</h3><p className="mt-1 text-xs text-slate-500">Manage existing sales, purchases and expenses in dedicated workspaces.</p></div>
              <button type="button" onClick={() => { onClose(); onNavigateWorkspace?.('delete'); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <span><span className="block text-sm font-bold text-slate-900">Delete Records</span><span className="mt-1 block text-xs text-slate-500">Search, filter, select and delete records.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-blue-600" />
              </button>
              <button type="button" onClick={() => { onClose(); onNavigateWorkspace?.('edit'); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <span><span className="block text-sm font-bold text-slate-900">Edit Records</span><span className="mt-1 block text-xs text-slate-500">Search, filter and update record details.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-blue-600" />
              </button>
            </section>
          )}

          {currentUser && currentUser.role !== 'CASHIER' && <button type="button" onClick={() => { onClose(); onNavigateWorkspace?.('requests'); }} className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40"><span><span className="block text-sm font-bold text-slate-900">Cashier Asset Requests</span><span className="mt-1 block text-xs text-slate-500">Review and approve or reject cashier changes.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-blue-600" /></button>}

          {/* Sound and haptic feedback */}
          <section className="rounded-2xl border border-slate-200 p-4 space-y-3" aria-label="Sound and Haptics">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2"><Volume2 className="w-4 h-4 text-blue-600" /> Sound &amp; Haptics</h3>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Master Sound</span><input type="checkbox" checked={soundEnabled} onChange={(e) => { setSoundEnabled(e.target.checked); saveFeedbackPreference('cotrix_sound_enabled', e.target.checked); }} aria-label="Master Sound" /></label>
            <label className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Vibrate className="w-4 h-4 text-blue-600" /> Master Haptic / Vibration</span><input type="checkbox" checked={hapticsEnabled} onChange={(e) => { setHapticsEnabled(e.target.checked); saveFeedbackPreference('cotrix_haptics_enabled', e.target.checked); }} aria-label="Master Haptic and Vibration" /></label>
            <label className={`flex items-center justify-between gap-3 text-sm ${!hapticsEnabled ? 'opacity-50' : ''}`}><span>Primary buttons and navigation only</span><input type="checkbox" disabled={!hapticsEnabled} checked={primaryHapticsOnly} onChange={(e) => { setPrimaryHapticsOnly(e.target.checked); saveFeedbackPreference('cotrix_haptics_primary_only', e.target.checked); }} aria-label="Primary interactions only" /></label>
            <p className="text-xs text-slate-500">Preferences are saved on this device. Browser and device support may vary.</p>
          </section>

          {/* Display Language */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              Display Language
            </label>
            <select
              value={settings.language === 'hi' ? 'hi' : 'en'}
              onChange={(e) => update({ language: e.target.value === 'hi' ? 'hi' : 'en' })}
              className={selectClass}
              aria-label="Display language"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </select>
          </div>

          {/* Active Currency */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-blue-600" />
              Active Currency
            </label>
            <select
              value={settings.currency || '₹'}
              onChange={(e) => update({ currency: e.target.value })}
              className={selectClass}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Standard Date Format */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Standard Date Format
            </label>
            <select
              value={settings.date_format || 'DD/MM/YYYY'}
              onChange={(e) => update({ date_format: e.target.value })}
              className={selectClass}
            >
              {DATE_FORMAT_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Active Financial Year */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-blue-600" />
              Active Financial Year
            </label>
            <select
              value={activeFy}
              onChange={(e) => update({ financial_year: e.target.value })}
              className={selectClass}
            >
              <option value={fy.current}>FY {fy.current}</option>
              <option value={fy.previous}>FY {fy.previous}</option>
            </select>
          </div>

          {/* Store closing reminder */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Store Closing Reminder
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings.notifications_enabled}
                  onChange={(e) => update({ notifications_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Closing Time</span>
              <input
                type="time"
                value={settings.closing_alarm_time || '21:30'}
                onChange={(e) => update({ closing_alarm_time: e.target.value })}
                className="font-mono font-bold text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Invoice Print (Regular + Thermal print settings) */}
          <button
            type="button"
            onClick={() => openAndClose(onOpenInvoicePrint)}
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 flex items-center justify-between text-left transition-all cursor-pointer"
          >
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-600" />
              Invoice Print
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {/* Grant Permission */}
          <button
            type="button"
            onClick={() => openAndClose(onOpenGrantPermission)}
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 flex items-center justify-between text-left transition-all cursor-pointer"
          >
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Grant Permission
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {/* Cashier access is a settings feature, not an About Us feature. */}
          {currentUser && currentUser.role !== 'CASHIER' && onOpenCashierLink && (
            <button type="button" onClick={() => openAndClose(onOpenCashierLink)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40">
              <span><span className="block text-sm font-bold text-slate-900">Cashier Link & Access</span><span className="mt-1 block text-xs text-slate-500">Create and manage cashier access for this business.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-blue-600" />
            </button>
          )}

          {/* About Us */}
          <button
            type="button"
            onClick={() => openAndClose(onOpenAboutUs)}
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 flex items-center justify-between text-left transition-all cursor-pointer"
          >
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              About Us
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>


        </div>
      </div>

    </div>
  );
};
