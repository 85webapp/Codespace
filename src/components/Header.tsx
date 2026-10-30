import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  Bell,
  ShieldCheck,
  Database,
  Building2,
  LogIn,
  User,
  Shield,
  Globe,
  Coins,
  Clock,
  Check,
  ChevronDown,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CompanyProfile, DbStatus, ClosureStatus, User as UserType, AppSettings } from '../types';
import { translations, Language } from '../utils/translations';

interface HeaderProps {
  company: CompanyProfile | null;
  dbStatus: DbStatus | null;
  closureStatus: ClosureStatus | null;
  currentUser: UserType | null;
  language: Language;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  company,
  dbStatus,
  closureStatus,
  currentUser,
  language,
  settings,
  onUpdateSettings,
  onOpenSettings,
  onOpenNotifications,
  onOpenProfile,
  onOpenLogin,
}) => {
  const t = translations[language] || translations.en;

  const hasOutstandingAlert = closureStatus?.isAlertActive || closureStatus?.previousDayOutstanding;
  const configuredBusinessName = company?.trade_name?.trim() || company?.name?.trim() || '';
  const legalName = configuredBusinessName && !/^admin$/i.test(configuredBusinessName) ? configuredBusinessName : 'Cotrix GST';
  const businessInitials = legalName.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase() || '').join('') || 'CG';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3 transition-colors shadow-2xs">
      <div className="flex items-center justify-between gap-1 sm:gap-2 max-w-7xl mx-auto min-w-0">
        
        {/* Top Left: Brand Profile Identity Block with Active Legal Name & Logo */}
        <div 
          onClick={onOpenProfile}
          title="Click to view & edit Legal Business Profile"
          className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 cursor-pointer group p-1 -m-1 rounded-xl hover:bg-slate-50 transition-colors"
        >
          {/* Logo Node */}
          <div className="relative shrink-0">
            <div
              className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl overflow-hidden border border-blue-200 bg-blue-50 flex items-center justify-center shadow-xs group-hover:border-blue-500 transition-all"
            >
              {company?.logo_base64 ? (
                <img
                  src={company.logo_base64}
                  alt="Company Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-blue-600 font-extrabold tracking-tighter text-[11px] sm:text-xs">
                  <span>{businessInitials}</span>
                </div>
              )}
            </div>
          </div>

          {/* Active User Legal Name & Verification Badge */}
          <div className="flex flex-col min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs sm:text-base text-slate-900 tracking-tight truncate max-w-[105px] sm:max-w-md group-hover:text-blue-600 transition-colors">
                {legalName || 'Setup Legal Entity Name'}
              </span>
              
              {company?.gstin ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 font-mono">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span className="hidden sm:inline">GSTIN:</span> {company.gstin}
                </span>
              ) : null}
            </div>

            {/* Sub-bar: DB status & Store Closing Ticker Badge */}
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dbStatus?.connected ? 'bg-blue-400' : 'bg-slate-300'} opacity-75`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus?.connected ? 'bg-blue-600' : 'bg-slate-400'}`}></span>
                </span>
                <span className="font-medium text-slate-600">
                  {dbStatus?.connected ? 'Neon PostgreSQL' : 'Offline'}
                </span>
              </div>

              {/* Store Closing Notification Ticker Badge */}
              <span className="text-slate-300">•</span>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNotifications();
                }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full font-mono text-[10px] font-semibold transition-colors ${
                  settings?.notifications_enabled
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Closing: {settings?.closing_alarm_time || '21:30'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Right: Global Tool Controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          
          {/* Notifications / Alarm Button */}
          <button
            onClick={onOpenNotifications}
            title={hasOutstandingAlert ? "Daily store report outstanding!" : "Store Closure Reminder & Settings"}
            className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer relative ${
              hasOutstandingAlert
                ? 'bg-blue-50 border-blue-400 text-blue-600 ring-2 ring-blue-400/20'
                : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50/50'
            }`}
          >
            <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            {hasOutstandingAlert && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white"></span>
            )}
          </button>

          {/* Clean business avatar; account details remain available in Settings. */}
          <button
            onClick={currentUser ? onOpenProfile : onOpenLogin}
            title={currentUser ? 'Open account and business profile' : 'Log in'}
            aria-label={currentUser ? 'Open account and business profile' : 'Log in'}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] sm:text-[11px] font-black tracking-tight cursor-pointer transition-colors"
          >
            {currentUser ? businessInitials : <LogIn className="w-4 h-4" />}
          </button>

          {/* Settings: opens the full settings panel directly */}
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="p-1.5 sm:p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>

      </div>
    </header>
  );
};
