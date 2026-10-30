import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, CheckCircle2, AlertCircle, ChevronLeft } from 'lucide-react';
import { User as UserType } from '../types';

type AuthView = 'login' | 'register' | 'forgot' | 'admin';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'user-login' | 'user-register' | 'admin-login' | 'forgot-password';
  onClose: () => void;
  onLoginSuccess: (user: UserType) => void;
  onAdminLoginSuccess?: (admin: UserType) => void;
}

const MODE_TO_VIEW: Record<string, AuthView> = {
  'user-login': 'login',
  'user-register': 'register',
  'admin-login': 'admin',
  'forgot-password': 'forgot',
};

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1';
const primaryBtn =
  'w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors cursor-pointer disabled:opacity-50';


const PasswordField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}> = ({ label, value, onChange, autoComplete }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 10);

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'user-login',
  onClose,
  onLoginSuccess,
  onAdminLoginSuccess,
}) => {
  const [view, setView] = useState<AuthView>(MODE_TO_VIEW[initialMode] || 'login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Login
  const [loginMobile, setLoginMobile] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regName, setRegName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // Forgot password
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');

  // Admin
  const [adminMobile, setAdminMobile] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const resetForgot = () => {
    setForgotMobile('');
    setForgotCode('');
    setCodeVerified(false);
    setNewPassword('');
    setNewConfirm('');
  };

  // Open on the requested screen with clean fields every time
  useEffect(() => {
    if (!isOpen) return;
    setView(MODE_TO_VIEW[initialMode] || 'login');
    clearMessages();
    setLoginMobile('');
    setLoginPassword('');
    setRegName('');
    setRegMobile('');
    setRegPassword('');
    setRegConfirm('');
    resetForgot();
    setAdminMobile('');
    setAdminPassword('');
  }, [isOpen, initialMode]);

  const goTo = (next: AuthView) => {
    clearMessages();
    setView(next);
  };

  const postJson = async (url: string, body: any) => {
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  };

  // ---------------- Login ----------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    if (loginMobile.length !== 10) return setError('Please enter a valid 10-digit mobile number.');
    if (!loginPassword.trim()) return setError('Please enter your password.');

    setLoading(true);
    try {
      const data = await postJson('/api/auth/login', {
        mobile: loginMobile,
        password: loginPassword.trim(),
      });
      onLoginSuccess(data.user);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Register ----------------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    if (!regName.trim()) return setError('Please enter your full name.');
    if (regMobile.length !== 10) return setError('Please enter a valid 10-digit mobile number.');
    if (regPassword.trim().length < 8 || !/[A-Za-z]/.test(regPassword) || !/\d/.test(regPassword)) return setError('Password must be at least 8 characters and contain letters and numbers.');
    if (regPassword !== regConfirm) return setError('Password and Confirm Password do not match.');

    setLoading(true);
    try {
      await postJson('/api/auth/register', {
        name: regName.trim(),
        mobile: regMobile,
        password: regPassword.trim(),
      });
      // Go to Login with the mobile number filled in
      setLoginMobile(regMobile);
      setLoginPassword('');
      setRegName('');
      setRegMobile('');
      setRegPassword('');
      setRegConfirm('');
      setView('login');
      setNotice('Registered successfully. Please login with your password.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Forgot password ----------------
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    if (forgotMobile.length !== 10) return setError('Please enter your registered 10-digit mobile number.');
    setLoading(true);
    try { await postJson('/api/auth/password-reset-request', { mobile: forgotMobile }); setCodeVerified(true); }
    catch (err: any) { setCodeVerified(false); setError(err.message); }
    finally { setLoading(false); }
  };

  // ---------------- Admin ----------------
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    if (!adminMobile.trim() || !adminPassword.trim()) {
      return setError('Please enter mobile number and password.');
    }

    setLoading(true);
    try {
      const data = await postJson('/api/admin/login', {
        mobile: adminMobile.trim(),
        password: adminPassword.trim(),
      });
      if (onAdminLoginSuccess) {
        onAdminLoginSuccess({
          name: data.admin?.name || 'Account Owner',
          mobile: data.admin?.userId || adminMobile.trim(),
          role: 'ADMIN',
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const title =
    view === 'register'
      ? 'Register'
      : view === 'forgot'
      ? 'Forgot Password'
      : view === 'admin'
      ? 'Admin Panel Login'
      : 'Login';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {(view === 'forgot' || view === 'admin') && (
              <button
                type="button"
                onClick={() => goTo('login')}
                className="p-1 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Back to login"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">{title}</h2>
              <p className="text-xs text-slate-500">Cotrix Tax &amp; Compliance Group</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Login / Register tabs */}
          {(view === 'login' || view === 'register') && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
              {(['login', 'register'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => goTo(t)}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    view === t ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t === 'login' ? 'Login' : 'Register'}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {/* LOGIN */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelClass}>Mobile Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={loginMobile}
                  onChange={(e) => setLoginMobile(digitsOnly(e.target.value))}
                  className={inputClass}
                />
              </div>
              <PasswordField
                label="Password"
                value={loginPassword}
                onChange={setLoginPassword}
                autoComplete="current-password"
              />
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? 'Please wait...' : 'Login'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForgot();
                  setForgotMobile(loginMobile);
                  goTo('forgot');
                }}
                className="w-full text-center text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </form>
          )}

          {/* REGISTER */}
          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className={labelClass}>Full Name</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Mobile Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={regMobile}
                  onChange={(e) => setRegMobile(digitsOnly(e.target.value))}
                  className={inputClass}
                />
              </div>
              <PasswordField
                label="Password"
                value={regPassword}
                onChange={setRegPassword}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirm Password"
                value={regConfirm}
                onChange={setRegConfirm}
                autoComplete="new-password"
              />
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? 'Please wait...' : 'Register'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD */}
          {view === 'forgot' && !codeVerified && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs leading-relaxed">Forgot password is handled by the administrator. There is no master reset code.</div>
              <div><label className={labelClass}>Registered Mobile Number</label><input type="tel" inputMode="numeric" value={forgotMobile} onChange={(e)=>setForgotMobile(digitsOnly(e.target.value))} className={inputClass} placeholder="10-digit mobile" /></div>
              <button type="submit" disabled={loading} className={primaryBtn}>{loading ? 'Sending request...' : 'Send Reset Request'}</button>
            </form>
          )}
          {view === 'forgot' && codeVerified && (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
              <div className="font-bold text-slate-900">Request Sent</div>
              <p className="text-xs text-slate-500 leading-relaxed">Your reset request has been sent to the administrator. Keep this screen closed and wait for the administrator to reset your password.</p>
              <button type="button" onClick={()=>goTo('login')} className={primaryBtn}>Back to Login</button>
            </div>
          )}

          {/* ADMIN LOGIN (no registration) */}
          {view === 'admin' && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className={labelClass}>Mobile Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={adminMobile}
                  onChange={(e) => setAdminMobile(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  className={inputClass}
                />
              </div>
              <PasswordField
                label="Password"
                value={adminPassword}
                onChange={setAdminPassword}
                autoComplete="off"
              />
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? 'Please wait...' : 'Login'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
