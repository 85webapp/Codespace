import React from 'react';
import {
  LayoutDashboard,
  FileText,
  ShoppingBag,
  BookOpen,
  Layers,
  Settings,
  ShieldCheck,
  Database,
  Building,
  DollarSign,
  Menu,
  Truck,
} from 'lucide-react';
import { CompanyProfile, DbStatus } from '../types';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  company: CompanyProfile | null;
  dbStatus: DbStatus | null;
  isCashierMode?: boolean;
  onOpenSettings: () => void;
  onOpenExpenses?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  company,
  dbStatus,
  isCashierMode = false,
  onOpenSettings,
  onOpenExpenses,
}) => {
  const navItems = isCashierMode
    ? [
        { id: 'overview', label: 'Cashier Terminal', icon: LayoutDashboard },
        { id: 'sales', label: 'Sales & Invoicing', icon: FileText },
        { id: 'purchases', label: 'Purchases & Inward', icon: ShoppingBag },
      ]
    : [
        { id: 'overview', label: 'Dashboard (Overview)', icon: LayoutDashboard },
        { id: 'sales', label: 'Sales & Invoicing', icon: FileText },
        { id: 'purchases', label: 'Purchases & Inward', icon: ShoppingBag },
        { id: 'expenses', label: 'Expenses', icon: DollarSign },
        { id: 'eway', label: 'E-Way Bill', icon: Truck },
        { id: 'accounting', label: 'Accounting & Ledgers', icon: BookOpen },
        { id: 'menu', label: 'Menu', icon: Menu },
      ];

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-slate-200 bg-white p-4 shrink-0 justify-between font-sans">
      <div className="space-y-6">
        
        {/* Company Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-sm shadow-sm">
            {company?.trade_name ? company.trade_name.substring(0, 2).toUpperCase() : 'GST'}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-900 truncate">
              {company?.trade_name || company?.name || 'Business Portal'}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {company?.gstin ? `GSTIN: ${company.gstin}` : 'Unregistered / Regular'}
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'expenses' && onOpenExpenses) {
                    onOpenExpenses();
                  } else {
                    onSelectTab(item.id);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Database Status & Settings footer */}
      <div className="pt-4 border-t border-slate-100 space-y-2">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[11px] font-semibold text-slate-700">Storage</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {dbStatus?.provider || 'PostgreSQL'}
          </span>
        </div>

        {!isCashierMode && <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>App Settings</span>
        </button>}
      </div>
    </aside>
  );
};
