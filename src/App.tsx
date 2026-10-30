import { apiFetch } from './utils/api';
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BottomNavigation } from './components/BottomNavigation';
import { HomePanel } from './components/HomePanel';
import { AccountingDashboard } from './components/AccountingDashboard';
import { MenuPanel } from './components/MenuPanel';
import { SettingsModal } from './components/SettingsModal';
import { NotificationModal } from './components/NotificationModal';
import { AddSaleModal } from './components/AddSaleModal';
import { AddPartyModal } from './components/AddPartyModal';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';
import { BusinessProfileModal } from './components/BusinessProfileModal';
import { AuthModal } from './components/AuthModal';
import { AdminPortalModal } from './components/AdminPortalModal';
import { QuickPurchaseModal } from './components/QuickPurchaseModal';
import { ManualPurchaseEntryModal } from './components/ManualPurchaseEntryModal';
import { ExpenseModal } from './components/ExpenseModal';
import { PaymentSettlementModal } from './components/PaymentSettlementModal';
import { Sidebar } from './components/Sidebar';
import { EWayBillPanel } from './components/EWayBillPanel';
import { AboutUsModal } from './components/AboutUsModal';
import { InvoicePrintSettings } from './components/InvoicePrintSettings';
import { GrantPermission } from './components/GrantPermission';
import { ShopPanel } from './components/ShopPanel';
import { CashierLinkModal } from './components/CashierLinkModal';
import { CashierHandshakeModal } from './components/CashierHandshakeModal';
import { CashierPortalTools, CashierAssetRequests } from './components/CashierPortalTools';
import { RecordsManager } from './components/RecordsManager';
import { setLocale, getFinancialYearOptions } from './utils/locale';
import { triggerHaptic, playSuccessTone } from './utils/feedback';
import {
  CompanyProfile,
  AppSettings,
  DbStatus,
  ClosureStatus,
  DailyCashSummary,
  Party,
  Invoice,
  Purchase,
  User as UserType,
  CustomerAdmin,
} from './types';

const defaultSettings: AppSettings = {
  id: 'DEFAULT',
  language: 'en',
  currency: '₹',
  decimal_places: 2,
  date_format: 'DD/MM/YYYY',
  show_compliance_warnings: true,
  notifications_enabled: false,
  closing_alarm_time: '21:30',
  financial_year: getFinancialYearOptions().current,
};

// Settings are remembered per user (or per device for guests)
const settingsKey = (mobile?: string) => `cotrix_settings_${mobile || 'guest'}`;

const readLocalSettings = (mobile?: string): Partial<AppSettings> => {
  try {
    const raw = localStorage.getItem(settingsKey(mobile));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const normalizeSettings = (raw: Partial<AppSettings>): AppSettings => {
  const fy = getFinancialYearOptions();
  const merged = { ...defaultSettings, ...raw } as AppSettings;
  merged.language = merged.language === 'hi' ? 'hi' : 'en';
  merged.currency = merged.currency || '₹';
  merged.date_format = merged.date_format || 'DD/MM/YYYY';
  if (![fy.current, fy.previous].includes(merged.financial_year || '')) {
    merged.financial_year = fy.current;
  }
  return merged;
};

export default function App() {
  // One delegated listener gives consistent touch feedback across buttons, navigation,
  // switches, radio controls, and select menus without editing every individual view.
  useEffect(() => {
    const handleInteractiveClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest('button, [role="button"], input[type="checkbox"], input[type="radio"], select, [data-haptic]');
      if (!control || (control instanceof HTMLButtonElement && control.disabled)) return;
      triggerHaptic(20);
    };
    document.addEventListener('click', handleInteractiveClick, true);
    return () => {
      document.removeEventListener('click', handleInteractiveClick, true);
    };
  }, []);

  const [activeNode, setActiveNode] = useState<1 | 2 | 3 | 4>(1);
  const [sidebarTab, setSidebarTab] = useState<string>('overview');

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    try {
      if ((localStorage.getItem('cotrix_cashier_session_mode') || sessionStorage.getItem('cotrix_cashier_session_mode')) === 'CASHIER_RESTRICTED') {
        const cashier = localStorage.getItem('cotrix_cashier_user') || sessionStorage.getItem('cotrix_cashier_user');
        return cashier ? JSON.parse(cashier) : { name: '', mobile: '', role: 'CASHIER' };
      }
      const saved = localStorage.getItem('cotrix_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const cashierMode = (localStorage.getItem('cotrix_cashier_session_mode') || sessionStorage.getItem('cotrix_cashier_session_mode')) === 'CASHIER_RESTRICTED';
      const saved = cashierMode ? (localStorage.getItem('cotrix_cashier_user') || sessionStorage.getItem('cotrix_cashier_user')) : localStorage.getItem('cotrix_user');
      const mobile = saved ? JSON.parse(saved)?.mobile : '';
      return normalizeSettings(readLocalSettings(mobile));
    } catch {
      return normalizeSettings({});
    }
  });
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [closureStatus, setClosureStatus] = useState<ClosureStatus | null>(null);
  const [latestClosure, setLatestClosure] = useState<DailyCashSummary | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  
  // Accounting Node 2 Data - STRICTLY starts clean & blank 0
  const [accountingData, setAccountingData] = useState<{
    youGetRows: any[];
    youGiveRows: any[];
    totalReceivables: number;
    totalPayables: number;
    trendData: any[];
    expenseAnalytics: any[];
  }>({
    youGetRows: [],
    youGiveRows: [],
    totalReceivables: 0,
    totalPayables: 0,
    trendData: [],
    expenseAnalytics: [],
  });

  // Modals
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workspacePage, setWorkspacePage] = useState<'delete' | 'edit' | 'requests' | 'admin' | null>(null);
  const [isInvoicePrintOpen, setIsInvoicePrintOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAddSaleOpen, setIsAddSaleOpen] = useState(false);
  const [isAddPartyOpen, setIsAddPartyOpen] = useState(false);
  const [isQuickPurchaseOpen, setIsQuickPurchaseOpen] = useState(false);
  const [isManualPurchaseOpen, setIsManualPurchaseOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseModalInitialAdd, setExpenseModalInitialAdd] = useState(false);
  const [todayExpensesTotal, setTodayExpensesTotal] = useState(0);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<Invoice | null>(null);
  
  // Auth & Admin Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'user-login' | 'user-register' | 'admin-login'>('user-login');
  const [isAdminPortalOpen, setIsAdminPortalOpen] = useState(false);

  // Dedicated Account Settlement Module (Payment In / Payment Out Matrix)
  const [isGlobalSettlementOpen, setIsGlobalSettlementOpen] = useState(false);
  const [globalSettlementDirection, setGlobalSettlementDirection] = useState<'PAYMENT_IN' | 'PAYMENT_OUT'>('PAYMENT_IN');

  // Dual-Tier Token Bypass & Cashier 2FA Handshake States
  type SessionMode = 'STANDARD' | 'CASHIER_RESTRICTED';
  const [sessionMode, setSessionMode] = useState<SessionMode>(() => {
    try {
      const savedMode = localStorage.getItem('cotrix_cashier_session_mode') || sessionStorage.getItem('cotrix_cashier_session_mode');
      return savedMode === 'CASHIER_RESTRICTED' ? 'CASHIER_RESTRICTED' : 'STANDARD';
    } catch {
      return 'STANDARD';
    }
  });
  const isCashierRestricted = String(sessionMode) === 'CASHIER_RESTRICTED';

  const [cashierApproved, setCashierApproved] = useState<boolean>(() => {
    try {
      const savedMode = localStorage.getItem('cotrix_cashier_session_mode') || sessionStorage.getItem('cotrix_cashier_session_mode');
      return savedMode === 'CASHIER_RESTRICTED';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!isCashierRestricted) return;
    apiFetch('/api/cashier/me').then(r => { if (!r.ok) throw new Error('Cashier device revoked'); return r.json(); }).then(() => setCashierApproved(true)).catch(() => { setCashierApproved(false); });
  }, [isCashierRestricted]);

  const [isAboutUsOpen, setIsAboutUsOpen] = useState(false);
  const [isGrantPermissionOpen, setIsGrantPermissionOpen] = useState(false);
  const [isCashierLinkOpen, setIsCashierLinkOpen] = useState(false);
  const [isCashierHandshakeOpen, setIsCashierHandshakeOpen] = useState(false);

  // Android/browser Back should dismiss the top-most overlay or return to the app home
  // before allowing browser navigation to leave the application.
  const backStateRef = useRef({
    isProfileOpen, isSettingsOpen, workspacePage, isInvoicePrintOpen, isNotificationOpen,
    isAddSaleOpen, isAddPartyOpen, isQuickPurchaseOpen, isManualPurchaseOpen,
    isExpenseModalOpen, isAuthOpen, isAdminPortalOpen, isGlobalSettlementOpen,
    isAboutUsOpen, isGrantPermissionOpen, isCashierLinkOpen, isCashierHandshakeOpen,
    activeNode, sidebarTab,
  });
  backStateRef.current = {
    isProfileOpen, isSettingsOpen, workspacePage, isInvoicePrintOpen, isNotificationOpen,
    isAddSaleOpen, isAddPartyOpen, isQuickPurchaseOpen, isManualPurchaseOpen,
    isExpenseModalOpen, isAuthOpen, isAdminPortalOpen, isGlobalSettlementOpen,
    isAboutUsOpen, isGrantPermissionOpen, isCashierLinkOpen, isCashierHandshakeOpen,
    activeNode, sidebarTab,
  };
  const appViewRef = useRef({ activeNode, sidebarTab, workspacePage });
  appViewRef.current = { activeNode, sidebarTab, workspacePage };
  const routeKeyRef = useRef(JSON.stringify(appViewRef.current));
  const exitConfirmedRef = useRef(false);
  useEffect(() => {
    const marker = 'cotrix-app-back';
    const makeEntry = (view = appViewRef.current) => ({ [marker]: true, view });
    try {
      const home = { activeNode: 1 as const, sidebarTab: 'overview', workspacePage: null };
      history.pushState(makeEntry(home), '', location.href);
      history.pushState(makeEntry(home), '', location.href);
    } catch { /* embedded browser */ }
    const handleBack = (event: PopStateEvent) => {
      if (exitConfirmedRef.current) return;
      triggerHaptic(20, 'navigation');
      const s = backStateRef.current;
      let dismissedOverlay = true;
      if (s.isCashierHandshakeOpen) setIsCashierHandshakeOpen(false);
      else if (s.isAuthOpen) setIsAuthOpen(false);
      else if (s.isCashierLinkOpen) setIsCashierLinkOpen(false);
      else if (s.isGrantPermissionOpen) setIsGrantPermissionOpen(false);
      else if (s.isAdminPortalOpen) setIsAdminPortalOpen(false);
      else if (s.isGlobalSettlementOpen) setIsGlobalSettlementOpen(false);
      else if (s.isAddSaleOpen) setIsAddSaleOpen(false);
      else if (s.isAddPartyOpen) setIsAddPartyOpen(false);
      else if (s.isQuickPurchaseOpen) setIsQuickPurchaseOpen(false);
      else if (s.isManualPurchaseOpen) setIsManualPurchaseOpen(false);
      else if (s.isExpenseModalOpen) setIsExpenseModalOpen(false);
      else if (s.isInvoicePrintOpen) setIsInvoicePrintOpen(false);
      else if (s.isNotificationOpen) setIsNotificationOpen(false);
      else if (s.isProfileOpen) setIsProfileOpen(false);
      else if (s.isSettingsOpen) setIsSettingsOpen(false);
      else if (s.isAboutUsOpen) setIsAboutUsOpen(false);
      else dismissedOverlay = false;

      if (dismissedOverlay) {
        try { history.pushState(makeEntry(), '', location.href); } catch { /* embedded browser */ }
        return;
      }

      const targetView = event.state?.[marker] ? event.state.view : null;
      if (targetView) {
        const targetKey = JSON.stringify(targetView);
        if (targetKey !== routeKeyRef.current) {
          routeKeyRef.current = targetKey;
          setActiveNode(targetView.activeNode);
          setSidebarTab(targetView.sidebarTab);
          setWorkspacePage(targetView.workspacePage);
        } else if (targetView.activeNode === 1 && targetView.sidebarTab === 'overview' && !targetView.workspacePage) {
          if (window.confirm('Are you sure you want to exit?')) {
            exitConfirmedRef.current = true;
            history.back();
          }
          else {
            try { history.pushState(makeEntry(targetView), '', location.href); } catch { /* embedded browser */ }
          }
        }
        return;
      }

      const currentView = appViewRef.current;
      if (currentView.activeNode !== 1 || currentView.sidebarTab !== 'overview' || currentView.workspacePage) {
        routeKeyRef.current = JSON.stringify({ activeNode: 1, sidebarTab: 'overview', workspacePage: null });
        setActiveNode(1);
        setSidebarTab('overview');
        setWorkspacePage(null);
        try { history.pushState(makeEntry({ activeNode: 1, sidebarTab: 'overview', workspacePage: null }), '', location.href); } catch { /* embedded browser */ }
      } else if (window.confirm('Are you sure you want to exit?')) {
        exitConfirmedRef.current = true;
        history.back();
      } else {
        try { history.pushState(makeEntry(), '', location.href); } catch { /* embedded browser */ }
      }
    };
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, []);

  useEffect(() => {
    const view = { activeNode, sidebarTab, workspacePage };
    const key = JSON.stringify(view);
    if (key === routeKeyRef.current) return;
    routeKeyRef.current = key;
    try { history.pushState({ 'cotrix-app-back': true, view }, '', location.href); } catch { /* embedded browser */ }
  }, [activeNode, sidebarTab, workspacePage]);

  // Cashier sessions are established only by the /cashier approval flow. There is no bypass URL.
  useEffect(() => {
    if (isCashierRestricted) {
      setCashierApproved(true);
      setActiveNode(1);
      setSidebarTab('overview');
    }
  }, [isCashierRestricted]);

  const executeCashierGuarded = (action: () => void) => {
    if (isCashierRestricted && !cashierApproved) {
      setIsCashierHandshakeOpen(true);
      return;
    }
    action();
  };

  // Keep language, currency and date format in sync with Settings
  useEffect(() => {
    setLocale({
      language: settings.language === 'hi' ? 'hi' : 'en',
      currency: settings.currency || '₹',
      dateFormat: settings.date_format || 'DD/MM/YYYY',
    });
  }, [settings.language, settings.currency, settings.date_format]);

  // Register Service Worker on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
        .catch((err) => console.warn('Service Worker registration skipped:', err));
    }
  }, []);

  // Resilient JSON fetch helper to prevent network startup race condition errors
  const safeFetchJson = async (url: string, headers?: Record<string, string>) => {
    try {
      const res = await apiFetch(url, headers ? { headers } : undefined);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // Fetch data from Neon DB, scoped to currentUser mobile if available
  const loadData = async (userMobileOverride?: string, retryAttempt = 0) => {
    try {
      const activeMobile = userMobileOverride !== undefined 
        ? userMobileOverride 
        : (currentUser?.mobile || '');

      const authHeaders: Record<string, string> = activeMobile 
        ? { 'x-user-mobile': activeMobile }
        : {};

      // 1. DB Health & server readiness check
      const dbData = await safeFetchJson('/api/db/status');
      if (dbData) {
        setDbStatus(dbData);
      } else if (retryAttempt < 3) {
        // If the server was still spinning up when the app mounted, retry gently
        setTimeout(() => loadData(userMobileOverride, retryAttempt + 1), 1000);
        return;
      }

      // Fetch all core datasets concurrently and safely
      const [compData, setData, cData, pData, invData, purData, aData, expData] = await Promise.all([
        safeFetchJson('/api/company', authHeaders),
        safeFetchJson('/api/settings', authHeaders),
        safeFetchJson('/api/daily-cash-summaries', authHeaders),
        safeFetchJson('/api/parties', authHeaders),
        safeFetchJson('/api/invoices', authHeaders),
        safeFetchJson('/api/purchases', authHeaders),
        safeFetchJson('/api/accounting/dashboard', authHeaders),
        safeFetchJson('/api/expenses', authHeaders),
      ]);

      if (compData) setCompany(compData);
      if (setData) setSettings(normalizeSettings({ ...setData, ...readLocalSettings(activeMobile) }));
      if (cData) {
        setClosureStatus(cData.status);
        if (cData.summaries && cData.summaries.length > 0) {
          setLatestClosure(cData.summaries[0]);
        } else {
          setLatestClosure(null);
        }
      }
      if (pData) setParties(pData.parties || []);
      if (invData) setInvoices(invData || []);
      if (purData) setPurchases(purData || []);
      if (aData) setAccountingData(aData);
      if (expData) setTodayExpensesTotal(expData.todayTotal || 0);
    } catch (err) {
      console.warn('Sync notice: app data refresh skipped, will re-sync:', err);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadData();
    const interval = setInterval(() => loadData(), 45000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Validate the server-side owner session on every app startup. localStorage is only a UI hint, never the authority.
  useEffect(() => {
    if (!currentUser || currentUser.role === 'ADMIN' || currentUser.role === 'CASHIER') return;
    apiFetch('/api/auth/me').then(async r => { if (!r.ok) throw new Error('expired'); return r.json(); }).catch(() => {
      setCurrentUser(null);
      try { localStorage.removeItem('cotrix_user'); } catch {}
    });
  }, []);

  // Operational shutdown check loop: check every 30 seconds
  useEffect(() => {
    if (!settings.notifications_enabled) return;

    const checkAlarm = () => {
      const now = new Date();
      const currentH = now.getHours();
      const currentM = now.getMinutes();

      const [targetH, targetM] = (settings.closing_alarm_time || '21:30').split(':').map(Number);

      if (currentH === targetH && currentM === targetM) {
        // The closing reminder is for the previous business day's report, not today's report.
        // Suppress repeats during the same date/time window after the first notification.
        const reminderKey = `cotrix_closing_reminder_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}_${targetH}:${targetM}`;
        let alreadyShown = false;
        try { alreadyShown = localStorage.getItem(reminderKey) === 'shown'; } catch { /* storage may be unavailable */ }
        if (!alreadyShown && closureStatus && (closureStatus.previousDayOutstanding || !closureStatus.isYesterdaySubmitted)) {
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Submit Previous Day Store Report', {
                body: `The previous day's Daily Report is missing. Please submit the report for ${closureStatus.yesterdayDate}.`,
                icon: '/favicon.ico',
              });
            }
          } catch { /* notification permission or browser may be unavailable */ }
          triggerHaptic(25, 'primary');
          playSuccessTone();
          try { localStorage.setItem(reminderKey, 'shown'); } catch { /* storage may be unavailable */ }
        }
      }
    };

    const alarmInterval = setInterval(checkAlarm, 30000);
    return () => clearInterval(alarmInterval);
  }, [settings, closureStatus]);

  // Auth Handlers
  const handleLoginSuccess = (user: UserType) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('cotrix_user', JSON.stringify(user));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    loadData(user.mobile);
  };

  const handleAdminLoginSuccess = (admin: UserType) => {
    setCurrentUser(admin);
    try {
      localStorage.setItem('cotrix_user', JSON.stringify(admin));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    setIsAdminPortalOpen(false);
    void openAdminPortalSecurely();
  };

  const openAdminPortalSecurely = async () => {
    try {
      const response = await apiFetch('/api/admin/session');
      if (response.ok) {
        setIsAdminPortalOpen(true);
        return;
      }
    } catch (error) {
      console.warn('Admin session verification failed:', error);
    }
    setIsAdminPortalOpen(false);
    setAuthMode('admin-login');
    setIsAuthOpen(true);
  };

  const handleLogout = () => {
    const cashierLogout = isCashierRestricted;
    if (!cashierLogout) apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setCurrentUser(null);
    try {
      if (cashierLogout) {
        document.documentElement.classList.remove('cashier-dark');
        sessionStorage.removeItem('cotrix_cashier_user');
        sessionStorage.removeItem('cotrix_cashier_session_mode');
        sessionStorage.removeItem('cotrix_cashier_device_token');
        localStorage.removeItem('cotrix_cashier_user');
        localStorage.removeItem('cotrix_cashier_session_mode');
        localStorage.removeItem('cotrix_cashier_device_token');
        sessionStorage.removeItem('cotrix_cashier_merchant_name');
        sessionStorage.removeItem('cotrix_cashier_name');
        sessionStorage.removeItem('cotrix_cashier_profile_picture');
        sessionStorage.removeItem('cashier_theme');
        sessionStorage.removeItem('cashier_language');
        sessionStorage.removeItem('cashier_sound');
        sessionStorage.removeItem('cashier_haptics');
      } else {
        localStorage.removeItem('cotrix_user');
      }
    } catch (e) {
      console.warn('Session storage error:', e);
    }
    if (cashierLogout) {
      const owner = (() => { try { return sessionStorage.getItem('cotrix_cashier_entry_owner') || ''; } catch { return ''; } })();
      const link = (() => { try { return sessionStorage.getItem('cotrix_cashier_entry_link') || ''; } catch { return ''; } })();
      setSessionMode('STANDARD');
      setCashierApproved(false);
      window.location.href = owner && link ? `/cashier?owner=${encodeURIComponent(owner)}&link=${encodeURIComponent(link)}` : '/cashier';
      return;
    }
    // Reset state to clean blank
    setCompany(null);
    setInvoices([]);
    setPurchases([]);
    setParties([]);
    setAccountingData({
      youGetRows: [],
      youGiveRows: [],
      totalReceivables: 0,
      totalPayables: 0,
      trendData: [],
      expenseAnalytics: [],
    });
    setLatestClosure(null);
    loadData('');
  };

  const handleSelectCustomerToView = (customer: CustomerAdmin) => {
    setIsAdminPortalOpen(false);
    // Customer data is never impersonated from the admin browser.
    setIsAdminPortalOpen(false);
  };

  // Settings Handlers
  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const merged = normalizeSettings({ ...settings, ...newSettings });
    setSettings(merged);
    try {
      localStorage.setItem(settingsKey(currentUser?.mobile), JSON.stringify(merged));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-mobile': currentUser?.mobile || '',
        },
        body: JSON.stringify(merged),
      });
    } catch (err) {
      console.error('Failed saving settings:', err);
    }
  };

  const handleSubmitDailyClosure = async (data: any) => {
    try {
      const res = await apiFetch('/api/daily-cash-summaries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-mobile': currentUser?.mobile || '',
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Failed submitting daily closure:', err);
    }
  };

  const handleCreateSale = async (saleData: any) => {
    try {
      if (saleData.type === 'QUOTATION' || saleData.quotation_number || saleData.invoice_number?.startsWith('EST-') || saleData.invoice_number?.startsWith('QUO-')) {
        setSelectedInvoiceForView(saleData);
        await loadData();
        return;
      }
      const res = await apiFetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-mobile': currentUser?.mobile || '',
        },
        body: JSON.stringify(saleData),
      });
      if (!res.ok) {
        let message = 'Could not save the invoice.';
        try {
          const errData = await res.json();
          if (errData?.error) message = errData.error;
        } catch {
          /* empty body */
        }
        throw new Error(message);
      }
      const newInvoice = await res.json();
      setSelectedInvoiceForView(newInvoice);
      await loadData();
    } catch (err) {
      console.error('Failed creating sale:', err);
      throw err; // lets the form stay open and show the error instead of looking saved
    }
  };

  const handleCreateParty = async (partyData: any) => {
    try {
      const res = await apiFetch('/api/parties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-mobile': currentUser?.mobile || '',
        },
        body: JSON.stringify(partyData),
      });
      if (!res.ok) {
        let message = 'Could not save the party.';
        try {
          const errData = await res.json();
          if (errData?.error) message = errData.error;
        } catch {
          /* empty body */
        }
        throw new Error(message);
      }
      await loadData();
    } catch (err) {
      console.error('Failed creating party:', err);
      throw err; // the form stays open and shows the message
    }
  };

  // Sync sidebar tab with activeNode
  const handleSelectSidebarTab = (tab: string) => {
    setSidebarTab(tab);
    if (tab === 'overview' || tab === 'sales') {
      setActiveNode(1);
    } else if (tab === 'accounting' || tab === 'purchases') {
      setActiveNode(2);
    } else if (tab === 'menu' || tab === 'reports' || tab === 'eway') {
      setActiveNode(3);
    }
  };

  const handleOpenExpenses = (initialAdd = false) => {
    setExpenseModalInitialAdd(initialAdd);
    setIsExpenseModalOpen(true);
  };

  // No account data is rendered before an authenticated owner/admin session exists.
  if (!currentUser) {
    return (
      <div className="min-h-dvh bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6"><div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-black">C</div><h1 className="mt-4 text-2xl font-black text-slate-900">Cotrix</h1><p className="text-sm text-slate-500 mt-1">Sign in to access your accounting data</p></div>
          <AuthModal isOpen={true} initialMode={authMode} onClose={() => {}} onLoginSuccess={handleLoginSuccess} onAdminLoginSuccess={handleAdminLoginSuccess} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600/20 selection:text-blue-700">
      
      {/* Persistent Dual Header Structure (Brand & Global Settings) */}
      {isCashierRestricted ? <CashierPortalTools cashier={currentUser} company={company} onLogout={handleLogout} /> : <Header
        company={company}
        dbStatus={dbStatus}
        closureStatus={closureStatus}
        currentUser={currentUser}
        language={settings.language}
        onOpenSettings={() => { if (isCashierRestricted) { alert('Settings are restricted for cashiers.'); return; } setIsSettingsOpen(true); }}
        onOpenNotifications={() => setIsNotificationOpen(true)}
        onOpenProfile={() => { if (isCashierRestricted) { alert('Profile is restricted for cashiers.'); return; } setIsProfileOpen(true); }}
        onOpenLogin={() => {
          setAuthMode('user-login');
          setIsAuthOpen(true);
        }}
      />}

      {/* Main Body Layout with Desktop Sidebar and Responsive Matrix */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        
        {/* Desktop Sidebar */}
        {!isCashierRestricted && <Sidebar
          currentTab={sidebarTab}
          onSelectTab={(tab) => {
            if (isCashierRestricted && (tab === 'accounting' || tab === 'menu')) {
              alert('The Cashier Blind-Screen Security Shield is Active: Protected merchant areas.');
              return;
            }
            handleSelectSidebarTab(tab);
          }}
          company={company}
          dbStatus={dbStatus}
          isCashierMode={isCashierRestricted}
          onOpenSettings={() => { if (isCashierRestricted) { alert('Settings are restricted for cashiers.'); return; } setIsSettingsOpen(true); }}
          onOpenExpenses={() => executeCashierGuarded(() => handleOpenExpenses(false))}
        />}

        {/* Dynamic Center Viewport mapped to 3-Node Navigation Matrix */}
        <main className="flex-1 p-3 pb-32 sm:p-6 sm:pb-6 max-w-5xl mx-auto w-full min-w-0">
          {sidebarTab === 'eway' && (
            <EWayBillPanel
              companyGstin={company?.gstin}
              companyName={company?.trade_name || company?.name}
            />
          )}

          {sidebarTab !== 'eway' && activeNode === 1 && (
            <HomePanel
              company={company}
              settings={settings}
              language={settings.language}
              invoices={invoices}
              purchases={purchases}
              latestClosure={latestClosure}
              closureStatus={closureStatus}
              totalReceivables={accountingData.totalReceivables}
              totalPayables={accountingData.totalPayables}
              todayExpensesTotal={todayExpensesTotal}
              isCashierMode={isCashierRestricted}
              cashierApproved={cashierApproved}
              ownerMobile={currentUser?.mobile || ''}
              onTriggerCashierHandshake={() => setIsCashierHandshakeOpen(true)}
              onAddNewSale={() => executeCashierGuarded(() => setIsAddSaleOpen(true))}
              onSubmitDailyClosure={handleSubmitDailyClosure}
              onSelectInvoiceForView={(inv) => setSelectedInvoiceForView(inv)}
              onNavigateToAccounting={() => {
                if (isCashierRestricted) {
                  alert('The Cashier Blind-Screen Security Shield is Active: Ledger dashboards are protected.');
                  return;
                }
                setActiveNode(2);
              }}
              onOpenQuickPurchase={() => executeCashierGuarded(() => setIsQuickPurchaseOpen(true))}
              onOpenManualPurchase={() => executeCashierGuarded(() => setIsManualPurchaseOpen(true))}
              onNavigateToCompliance={() => {
                if (isCashierRestricted) {
                  alert('The Cashier Blind-Screen Security Shield is Active: Compliance tools are protected.');
                  return;
                }
                setActiveNode(3);
              }}
              onOpenExpenseModal={(initialAdd) => executeCashierGuarded(() => handleOpenExpenses(initialAdd))}
              onOpenPaymentSettlement={(dir) => {
                executeCashierGuarded(() => {
                  setGlobalSettlementDirection(dir);
                  setIsGlobalSettlementOpen(true);
                });
              }}
              onOpenDailyReport={() => executeCashierGuarded(() => setIsNotificationOpen(true))}
            />
          )}
          {isCashierRestricted && sidebarTab !== 'eway' && activeNode === 1 && <CashierAssetRequests mode="cashier" />}

          {sidebarTab !== 'eway' && activeNode === 2 && (
            <AccountingDashboard
              settings={settings}
              language={settings.language}
              currentUser={currentUser}
              company={company}
              invoices={invoices}
              purchases={purchases}
              parties={parties}
              youGetRows={accountingData.youGetRows}
              youGiveRows={accountingData.youGiveRows}
              totalReceivables={accountingData.totalReceivables}
              totalPayables={accountingData.totalPayables}
              trendData={accountingData.trendData}
              expenseAnalytics={accountingData.expenseAnalytics}
              onAddNewParty={() => setIsAddPartyOpen(true)}
              onOpenReports={() => setActiveNode(3)}
              onOpenProfile={() => { if (isCashierRestricted) { alert('Profile is restricted for cashiers.'); return; } setIsProfileOpen(true); }}
              onOpenSettings={() => { if (isCashierRestricted) { alert('Settings are restricted for cashiers.'); return; } setIsSettingsOpen(true); }}
              onOpenNotifications={() => setIsNotificationOpen(true)}
              onOpenExpenseModal={handleOpenExpenses}
              onRefreshData={loadData}
            />
          )}

          {sidebarTab !== 'eway' && activeNode === 4 && (
            <ShopPanel
              currentUser={currentUser}
              isCashierMode={isCashierRestricted}
              onRequestLogin={() => { setAuthMode('user-login'); setIsAuthOpen(true); }}
            />
          )}

          {sidebarTab !== 'eway' && activeNode === 3 && (
            <MenuPanel
              company={company}
              settings={settings}
              currentUser={currentUser}
              invoices={invoices}
              purchases={purchases}
              parties={parties}
              todayExpensesTotal={todayExpensesTotal}
              onOpenSettings={() => { if (isCashierRestricted) { alert('Settings are restricted for cashiers.'); return; } setIsSettingsOpen(true); }}
              onOpenNotifications={() => setIsNotificationOpen(true)}
              onOpenProfile={() => { if (isCashierRestricted) { alert('Profile is restricted for cashiers.'); return; } setIsProfileOpen(true); }}
              onAddNewSale={() => setIsAddSaleOpen(true)}
              onSelectInvoiceForView={(inv) => setSelectedInvoiceForView(inv)}
              onOpenManualPurchase={() => setIsManualPurchaseOpen(true)}
              onOpenQuickPurchase={() => setIsQuickPurchaseOpen(true)}
              onOpenEWayBill={() => handleSelectSidebarTab('eway')}
              onRefreshData={() => loadData()}
            />
          )}
        </main>

      </div>

      {/* Dynamic Three-Stage Bottom Navigation Matrix */}
      <BottomNavigation
        activeNode={activeNode}
        language={settings.language}
        isCashierMode={isCashierRestricted}
        onSelectNode={(node) => {
          if (isCashierRestricted && node !== 1 && node !== 4) {
            alert('The Cashier Blind-Screen Security Shield is Active: Dashboard and Menu are restricted.');
            return;
          }
          setActiveNode(node);
          if (node === 1) setSidebarTab('overview');
          if (node === 2) setSidebarTab('accounting');
          if (node === 3) setSidebarTab('menu');
          if (node === 4) setSidebarTab('overview');
        }}
        onAddNewSale={() => executeCashierGuarded(() => setIsAddSaleOpen(true))}
        onAddNewParty={() => executeCashierGuarded(() => setIsAddPartyOpen(true))}
      />

      {workspacePage && workspacePage !== 'admin' && (
        <div className="fixed inset-0 z-[120] flex min-h-dvh flex-col overflow-y-auto bg-white text-slate-900">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-8">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Cotrix GST · Workspace</p><h1 className="mt-1 text-xl font-black sm:text-2xl">{workspacePage === 'delete' ? 'Delete Records' : workspacePage === 'edit' ? 'Edit Records' : 'Cashier Asset Requests'}</h1></div>
            <button type="button" onClick={() => setWorkspacePage(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Back to Settings</button>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">
            {workspacePage === 'delete' && <RecordsManager key="delete-records" mode="delete" onBack={() => setWorkspacePage(null)} />}
            {workspacePage === 'edit' && <RecordsManager key="edit-records" mode="edit" onBack={() => setWorkspacePage(null)} />}
            {workspacePage === 'requests' && <CashierAssetRequests mode="owner" />}
          </main>
        </div>
      )}

      {/* Global Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        currentUser={currentUser}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onOpenLogin={(mode) => {
          setAuthMode(mode || 'user-login');
          setIsAuthOpen(true);
        }}
        onOpenAdminPortal={() => { void openAdminPortalSecurely(); }}
        onOpenAboutUs={() => setIsAboutUsOpen(true)}
        onOpenCashierLink={() => setIsCashierLinkOpen(true)}
        onOpenGrantPermission={() => setIsGrantPermissionOpen(true)}
        onOpenInvoicePrint={() => setIsInvoicePrintOpen(true)}
        onLogout={handleLogout}
        onNavigateWorkspace={(page) => { if (page === 'admin') { void openAdminPortalSecurely(); return; } setWorkspacePage(page); }}
      />

      {isInvoicePrintOpen && (
        <InvoicePrintSettings
          isOpen={isInvoicePrintOpen}
          userMobile={currentUser?.mobile}
          onClose={() => setIsInvoicePrintOpen(false)}
        />
      )}

      <GrantPermission
        isOpen={isGrantPermissionOpen}
        currentUser={currentUser}
        onClose={() => setIsGrantPermissionOpen(false)}
        onOpenCashierLink={() => { setIsGrantPermissionOpen(false); setIsCashierLinkOpen(true); }}
      />

      <NotificationModal
        isOpen={isNotificationOpen}
        settings={settings}
        language={settings.language}
        currentUser={currentUser}
        onClose={() => setIsNotificationOpen(false)}
        onReportSaved={() => loadData()}
        onUpdateSettings={handleSaveSettings}
        onTriggerManualAlarm={() => {
          // Trigger blocking alert by setting closure status alert
          if (closureStatus) {
            setClosureStatus({ ...closureStatus, isAlertActive: true });
          } else {
            setClosureStatus({
              todayDate: new Date().toLocaleDateString('en-GB'),
              yesterdayDate: new Date(Date.now() - 86400000).toLocaleDateString('en-GB'),
              isTodaySubmitted: false,
              isYesterdaySubmitted: true,
              isAlertActive: true,
              previousDayOutstanding: false,
              alarmTime: settings.closing_alarm_time || '21:30',
              isPastAlarmTime: true,
            });
          }
          setActiveNode(1);
        }}
      />

      <CashierLinkModal isOpen={isCashierLinkOpen} onClose={() => setIsCashierLinkOpen(false)} />

      <AboutUsModal isOpen={isAboutUsOpen} onClose={() => setIsAboutUsOpen(false)} currentUser={currentUser} onAdminLogin={() => { setAuthMode('admin-login'); setIsAuthOpen(true); }} />

      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onAdminLoginSuccess={handleAdminLoginSuccess}
      />

      <AdminPortalModal
        isOpen={isAdminPortalOpen}
        adminUser={currentUser}
        onClose={() => { setIsAdminPortalOpen(false); setWorkspacePage(null); }}
        onSelectCustomerToView={handleSelectCustomerToView}
      />

      <AddSaleModal
        isOpen={isAddSaleOpen}
        settings={settings}
        language={settings.language}
        parties={parties}
        company={company}
        currentUser={currentUser}
        invoicesCount={invoices.length}
        onClose={() => setIsAddSaleOpen(false)}
        onSubmitSale={handleCreateSale}
      />

      <AddPartyModal
        isOpen={isAddPartyOpen}
        settings={settings}
        language={settings.language}
        onClose={() => setIsAddPartyOpen(false)}
        onSubmitParty={handleCreateParty}
      />

      <QuickPurchaseModal
        isOpen={isQuickPurchaseOpen}
        onClose={() => setIsQuickPurchaseOpen(false)}
        userMobile={currentUser?.mobile || ''}
        purchases={purchases}
        onPurchaseCreated={(newPur) => {
          if (newPur) setPurchases((prev) => [newPur, ...prev.filter((p) => p.id !== newPur.id)]);
          loadData();
        }}
      />

      <ManualPurchaseEntryModal
        isOpen={isManualPurchaseOpen}
        onClose={() => setIsManualPurchaseOpen(false)}
        userMobile={currentUser?.mobile || ''}
        existingPurchases={purchases}
        onPurchaseAdded={(newPur) => {
          if (newPur) setPurchases((prev) => [newPur, ...prev.filter((p) => p.id !== newPur.id)]);
          loadData();
        }}
        homeStateCode={company?.state_code || '07'}
      />

      {selectedInvoiceForView && (
        <InvoiceDetailModal
          key={selectedInvoiceForView.id}
          invoice={selectedInvoiceForView}
          company={company}
          settings={settings}
          onClose={() => setSelectedInvoiceForView(null)}
        />
      )}

      <BusinessProfileModal
        isOpen={isProfileOpen}
        company={company}
        onClose={() => setIsProfileOpen(false)}
        onSave={async (profileData) => {
          try {
            const res = await apiFetch('/api/company', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'x-user-mobile': currentUser?.mobile || '',
              },
              body: JSON.stringify(profileData),
            });
            if (res.ok) {
              const updated = await res.json();
              setCompany(updated);
            }
          } catch (err) {
            console.error('Failed saving profile:', err);
          }
        }}
      />

      {/* Manual Expense Management Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        initialAddOpen={expenseModalInitialAdd}
        settings={settings}
        language={settings.language}
        userMobile={currentUser?.mobile || ''}
        onClose={() => setIsExpenseModalOpen(false)}
        onExpenseAdded={async () => {
          await loadData();
        }}
      />

      {/* Production Payment In & Payment Out Account Settlement Matrix */}
      <PaymentSettlementModal
        isOpen={isGlobalSettlementOpen}
        initialDirection={globalSettlementDirection}
        currentUser={currentUser}
        settings={settings}
        onClose={() => setIsGlobalSettlementOpen(false)}
        onSettlementSaved={async () => {
          await loadData();
        }}
      />

    </div>
  );
}
