import React from 'react';
import { Home, BarChart3, Menu, Plus, UserPlus, Truck, ShoppingBag } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface BottomNavigationProps {
  activeNode: 1 | 2 | 3 | 4;
  language: Language;
  isCashierMode?: boolean;
  onSelectNode: (node: 1 | 2 | 3 | 4) => void;
  onOpenEWayBill?: () => void;
  onAddNewSale: () => void;
  onAddNewParty: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeNode,
  language,
  isCashierMode = false,
  onSelectNode,
  onAddNewSale,
  onAddNewParty,
  onOpenEWayBill,
}) => {
  const t = translations[language] || translations.en;

  return (
    <>
      {/* Floating Action Buttons based on active Node */}
      {/* Node 1: Floating Widget Component: + Add New Sale (Pure Typography, Camera Icon Removed) */}
      {activeNode === 1 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 animate-in fade-in zoom-in duration-200">
          <button
            onClick={onAddNewSale}
            className="flex items-center justify-center px-7 py-3.5 rounded-full bg-blue-600 text-white font-bold text-sm sm:text-base tracking-wide shadow-xl shadow-blue-600/35 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all cursor-pointer ring-2 ring-blue-400/40"
          >
            + Add New Sale
          </button>
        </div>
      )}

      {/* If Node 2 is active: Floating action control: + Add New Party */}
      {activeNode === 2 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 animate-in fade-in zoom-in duration-200">
          <button
            onClick={onAddNewParty}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 text-white font-bold text-sm tracking-wide shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all cursor-pointer ring-2 ring-blue-400/40"
          >
            <UserPlus className="w-4 h-4 text-white" />
            <span>+ Add New Party</span>
          </button>
        </div>
      )}

      {/* Direct E-Way Bill shortcut so the module is reachable on small screens too. */}
      {!isCashierMode && onOpenEWayBill && (
        <button
          onClick={onOpenEWayBill}
          aria-label="Open E-Way Bill"
          className="fixed right-4 bottom-20 z-40 w-12 h-12 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all"
        >
          <Truck className="w-5 h-5" />
        </button>
      )}

      {/* Bottom Three-Node Layout Matrix Shell Router */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xl px-4 py-2 transition-colors shadow-lg">
        <div className={`max-w-2xl mx-auto grid gap-2 ${isCashierMode ? 'grid-cols-2' : 'grid-cols-4'}`}>
          
          {/* Node 1: Home Panel Viewport */}
          <button
            onClick={() => onSelectNode(1)}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeNode === 1
                ? 'text-blue-600 font-bold bg-blue-50'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold tracking-tight">HOME</span>
          </button>

          {/* Node 2: Ledger Performance Dashboard Viewport */}
          {!isCashierMode && <button
            onClick={() => {
              if (isCashierMode) {
                alert('The Cashier Blind-Screen Security Shield is Active: Primary dashboard trends and ledger summaries are restricted.');
                return;
              }
              onSelectNode(2);
            }}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeNode === 2
                ? 'text-blue-600 font-bold bg-blue-50'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <BarChart3 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold tracking-tight">DASHBOARD</span>
          </button>

          }
          {/* Node 4: Customer Storefront */}
          <button
            onClick={() => onSelectNode(4)}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeNode === 4
                ? 'text-blue-600 font-bold bg-blue-50'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold tracking-tight">SHOP</span>
          </button>

          {/* Node 3: Master Menu Viewport - strictly labeled Menu */}
          {!isCashierMode && <button
            onClick={() => {
              if (isCashierMode) {
                alert('The Cashier Blind-Screen Security Shield is Active: Accounting reports and audit ledgers are restricted.');
                return;
              }
              onSelectNode(3);
            }}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeNode === 3
                ? 'text-blue-600 font-bold bg-blue-50'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <Menu className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold tracking-tight">Menu</span>
          </button>}

        </div>
      </nav>
    </>
  );
};
