import { IndianAmountInput } from './IndianAmountInput';
import React, { useState, useEffect } from 'react';
import { X, UserPlus, Building, Phone, Mail, MapPin } from 'lucide-react';
import { AppSettings } from '../types';
import { translations, Language } from '../utils/translations';

interface AddPartyModalProps {
  isOpen: boolean;
  settings: AppSettings;
  language: Language;
  onClose: () => void;
  onSubmitParty: (partyData: any) => Promise<void>;
}

export const AddPartyModal: React.FC<AddPartyModalProps> = ({
  isOpen,
  settings,
  language,
  onClose,
  onSubmitParty,
}) => {
  const t = translations[language] || translations.en;

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [openingBalance, setOpeningBalance] = useState('');
  const [balanceType, setBalanceType] = useState<'YOU_GET' | 'YOU_GIVE'>('YOU_GET');
  const [billingAddress, setBillingAddress] = useState('');
  const [city, setCity] = useState('Delhi');
  const [state, setState] = useState('Delhi');
  const [stateCode, setStateCode] = useState('07');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Every time the form opens it starts blank
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setGstin('');
    setType('CUSTOMER');
    setOpeningBalance('');
    setBalanceType('YOU_GET');
    setBillingAddress('');
    setCity('Delhi');
    setState('Delhi');
    setStateCode('07');
    setFormError(null);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmitParty({
        name,
        contact_person: contactPerson,
        phone,
        email,
        gstin,
        type,
        opening_balance: openingBalance || '0',
        balance_type: type === 'SUPPLIER' ? 'YOU_GIVE' : balanceType,
        billing_address: billingAddress,
        city,
        state,
        state_code: stateCode,
      });
      onClose();
    } catch (err) {
      console.error('Error adding party:', err);
      setFormError(err instanceof Error ? err.message : 'Could not save the party.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">{t.addNewParty}</h2>
              <p className="text-xs text-slate-400">Add Customer or Vendor to Double-Entry Ledger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80dvh] overflow-y-auto">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {formError}
            </div>
          )}
          
          {/* Party Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Party Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('CUSTOMER');
                  setBalanceType('YOU_GET');
                }}
                className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  type === 'CUSTOMER'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                Customer (Debtor - You Get)
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('SUPPLIER');
                  setBalanceType('YOU_GIVE');
                }}
                className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  type === 'SUPPLIER'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                Vendor / Supplier (Creditor - You Give)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Party / Firm Legal Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">GSTIN / Tax ID (Max 15 chars)</label>
              <input
                type="text"
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Phone / Mobile</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Opening Balance (₹)</label>
              <IndianAmountInput
                value={openingBalance}
                onValueChange={setOpeningBalance}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">State & POS Code</label>
              <select
                value={`${stateCode}-${state}`}
                onChange={(e) => {
                  const [code, st] = e.target.value.split('-');
                  setStateCode(code);
                  setState(st);
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
              >
                <option value="07-Delhi">07 - Delhi</option>
                <option value="09-Uttar Pradesh">09 - Uttar Pradesh</option>
                <option value="06-Haryana">06 - Haryana</option>
                <option value="08-Rajasthan">08 - Rajasthan</option>
                <option value="27-Maharashtra">27 - Maharashtra</option>
              </select>
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Add Party to Ledger'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
