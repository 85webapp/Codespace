import React, { useState } from 'react';
import { ArrowLeft, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  PrintSettings,
  RegularSettings,
  ThermalSettings,
  DEFAULT_PRINT_SETTINGS,
  loadPrintSettings,
  savePrintSettings,
} from '../utils/printSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userMobile?: string;
}

const COLORS = ['#2563eb', '#059669', '#0d9488', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#334155'];

const THEMES: { value: string; label: string }[] = [
  { value: 'STANDARD', label: 'Standard (all options apply)' },
  { value: 'TALLY', label: 'Tally Theme' },
  { value: 'GST_THEME_1', label: 'GST Theme 1' },
  { value: 'MODERN_ELITE', label: 'Modern Elite' },
  { value: 'LANDSCAPE_1', label: 'Landscape 1' },
  { value: 'GST_THEME_2', label: 'GST Theme 2' },
];

const Section: React.FC<{ title: string }> = ({ title }) => (
  <div className="px-4 py-2 bg-sky-100 text-sky-900 text-xs font-bold uppercase tracking-wide">{title}</div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-white">
    <span className="text-sm text-slate-700 flex-1 min-w-0">{label}</span>
    <div className="shrink-0">{children}</div>
  </div>
);

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${value ? 'bg-blue-600' : 'bg-slate-300'}`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`}
    />
  </button>
);

const Select: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }> = ({
  value,
  options,
  onChange,
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="text-sm text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-1.5 max-w-[190px] cursor-pointer"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const Stepper: React.FC<{ value: number; min?: number; max?: number; onChange: (v: number) => void }> = ({
  value,
  min = 0,
  max = 20,
  onChange,
}) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, value - 1))}
      className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 cursor-pointer"
    >
      <Minus className="w-3.5 h-3.5" />
    </button>
    <span className="w-6 text-center text-sm font-bold text-slate-800">{value}</span>
    <button
      type="button"
      onClick={() => onChange(Math.min(max, value + 1))}
      className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 cursor-pointer"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

const TextArea: React.FC<{ label: string; value: string; placeholder: string; onChange: (v: string) => void }> = ({
  label,
  value,
  placeholder,
  onChange,
}) => (
  <div className="px-4 py-3 border-b border-slate-100 bg-white">
    <div className="text-sm text-slate-700 mb-1.5">{label}</div>
    <textarea
      value={value}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
    />
  </div>
);

export const InvoicePrintSettings: React.FC<Props> = ({ isOpen, onClose, userMobile }) => {
  const [ps, setPs] = useState<PrintSettings>(() => loadPrintSettings(userMobile));
  const [tab, setTab] = useState<'regular' | 'thermal'>('regular');

  if (!isOpen) return null;

  const update = (next: PrintSettings) => {
    setPs(next);
    savePrintSettings(next, userMobile);
  };
  // Make Regular and Thermal "default" mutually exclusive
  const setReg = (patch: Partial<RegularSettings>) => {
    const next = { ...ps, regular: { ...ps.regular, ...patch } };
    if (patch.isDefault) next.thermal = { ...next.thermal, isDefault: false };
    update(next);
  };
  const setTh = (patch: Partial<ThermalSettings>) => {
    const next = { ...ps, thermal: { ...ps.thermal, ...patch } };
    if (patch.isDefault) next.regular = { ...next.regular, isDefault: false };
    update(next);
  };

  const resetTab = () => {
    if (!window.confirm(`Reset all ${tab === 'regular' ? 'Regular' : 'Thermal'} print settings to default?`)) return;
    update({ ...ps, [tab]: DEFAULT_PRINT_SETTINGS[tab] } as PrintSettings);
  };

  const r = ps.regular;
  const t = ps.thermal;
  const sizeOpts = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ];
  const nameSizeOpts = [...sizeOpts, { value: 'xlarge', label: 'Extra Large' }];
  const formatOpts = [
    { value: 'indian', label: 'Indian (1,00,00,000)' },
    { value: 'international', label: 'International (10,000,000)' },
  ];

  /** Rows that exist in both tabs, wired to whichever tab is active */
  const shared = (o: RegularSettings | ThermalSettings, set: (p: any) => void, thermalTab: boolean) => (
    <>
      <Section title="Print Company Info / Header" />
      <Row label="Print Company Name">
        <Toggle value={o.showCompanyName} onChange={(v) => set({ showCompanyName: v })} />
      </Row>
      <Row label="Company Name Text Size">
        <Select value={o.companyNameSize} options={nameSizeOpts} onChange={(v) => set({ companyNameSize: v })} />
      </Row>
      <Row label="Company Logo">
        <Toggle value={o.showLogo} onChange={(v) => set({ showLogo: v })} />
      </Row>
      <Row label="Address">
        <Toggle value={o.showAddress} onChange={(v) => set({ showAddress: v })} />
      </Row>
      <Row label="Email">
        <Toggle value={o.showEmail} onChange={(v) => set({ showEmail: v })} />
      </Row>
      <Row label="Phone Number">
        <Toggle value={o.showPhone} onChange={(v) => set({ showPhone: v })} />
      </Row>
      <Row label="GSTIN on Sale">
        <Toggle value={o.showGstin} onChange={(v) => set({ showGstin: v })} />
      </Row>

      <Section title="Item Table" />
      <Row label="S.No">
        <Toggle value={o.showSno} onChange={(v) => set({ showSno: v })} />
      </Row>
      <Row label="HSN/SAC Code">
        <Toggle value={o.showHsn} onChange={(v) => set({ showHsn: v })} />
      </Row>
      <Row label="Units of Measurement">
        <Toggle value={o.showUnit} onChange={(v) => set({ showUnit: v })} />
      </Row>

      <Section title="Totals & Taxes" />
      <Row label="Total Item Quantity">
        <Toggle value={o.showTotalQty} onChange={(v) => set({ showTotalQty: v })} />
      </Row>
      <Row label="Amount with Decimal (e.g. 0.00)">
        <Toggle value={o.amountDecimals} onChange={(v) => set({ amountDecimals: v })} />
      </Row>
      <Row label="Received Amount">
        <Toggle value={o.showReceived} onChange={(v) => set({ showReceived: v })} />
      </Row>
      <Row label="Balance Amount">
        <Toggle value={o.showBalance} onChange={(v) => set({ showBalance: v })} />
      </Row>
      <Row label="Tax Details">
        <Toggle value={o.showTaxDetails} onChange={(v) => set({ showTaxDetails: v })} />
      </Row>
      <Row label="Amount Grouping (commas)">
        <Toggle value={o.amountGrouping} onChange={(v) => set({ amountGrouping: v })} />
      </Row>
      <Row label="Amount / Words Format">
        <Select value={o.numberFormat} options={formatOpts} onChange={(v) => set({ numberFormat: v })} />
      </Row>
      <Row label="Amount in Words">
        <Toggle value={o.showAmountInWords} onChange={(v) => set({ showAmountInWords: v })} />
      </Row>
      <Row label="You Saved (discount)">
        <Toggle value={o.showYouSaved} onChange={(v) => set({ showYouSaved: v })} />
      </Row>
      {!thermalTab && null}

      <Section title="Footer" />
      <Row label="Print Description / Notes">
        <Toggle value={o.showDescription} onChange={(v) => set({ showDescription: v })} />
      </Row>
      <Row label="Terms & Conditions">
        <Toggle value={o.showTerms} onChange={(v) => set({ showTerms: v })} />
      </Row>
      <TextArea
        label="Set Terms & Conditions (leave empty to use the one from Business Profile)"
        value={o.customTerms}
        placeholder="e.g. Goods once sold will not be taken back"
        onChange={(v) => set({ customTerms: v })}
      />
      <Row label="Bank Details">
        <Toggle value={o.showBank} onChange={(v) => set({ showBank: v })} />
      </Row>
      <Row label="Print Signature">
        <Toggle value={o.showSignature} onChange={(v) => set({ showSignature: v })} />
      </Row>
      <div className="px-4 py-3 border-b border-slate-100 bg-white">
        <div className="text-sm text-slate-700 mb-1.5">Set Custom Signature Text</div>
        <input
          value={o.customSignatureText}
          placeholder="Authorized Signatory"
          onChange={(e) => set({ customSignatureText: e.target.value })}
          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
        />
      </div>
      <Row label="Payment Mode">
        <Toggle value={o.showPaymentMode} onChange={(v) => set({ showPaymentMode: v })} />
      </Row>
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col text-slate-800">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-3 bg-sky-100 border-b border-sky-200 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-sky-200 cursor-pointer" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-base flex-1">Invoice Print</h2>
        <button
          onClick={resetTab}
          className="flex items-center gap-1 text-xs font-semibold text-slate-600 px-2 py-1.5 rounded-lg hover:bg-sky-200 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      {/* Regular / Thermal tabs */}
      <div className="p-3 bg-white border-b border-slate-200 shrink-0">
        <div className="grid grid-cols-2 rounded-lg overflow-hidden border border-sky-700">
          {(['regular', 'thermal'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`py-2 text-sm font-bold cursor-pointer ${tab === k ? 'bg-sky-700 text-white' : 'bg-white text-sky-700'}`}
            >
              {k === 'regular' ? 'Regular' : 'Thermal'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {tab === 'regular' ? (
          <>
            <Row label="Make Regular Printer Default">
              <Toggle value={r.isDefault} onChange={(v) => setReg({ isDefault: v })} />
            </Row>

            <Section title="Themes" />
            <Row label="Change Theme">
              <Select value={r.theme} options={THEMES} onChange={(v) => setReg({ theme: v })} />
            </Row>
            <div className="px-4 py-3 border-b border-slate-100 bg-white">
              <div className="text-sm text-slate-700 mb-2">Colour</div>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setReg({ color: c })}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full cursor-pointer ${
                      r.color === c ? 'ring-2 ring-offset-2 ring-slate-800' : 'opacity-80'
                    }`}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <Row label="Print Text Size">
              <Select value={r.textSize} options={sizeOpts} onChange={(v) => setReg({ textSize: v as any })} />
            </Row>
            <Row label="Page Size">
              <Select
                value={r.pageSize}
                options={[
                  { value: 'A4', label: 'A4 (210 × 297 mm)' },
                  { value: 'A5', label: 'A5 (148 × 210 mm)' },
                  { value: 'LETTER', label: 'Letter (8.5 × 11 in)' },
                ]}
                onChange={(v) => setReg({ pageSize: v as any })}
              />
            </Row>
            <Row label="Orientation">
              <Select
                value={r.orientation}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
                onChange={(v) => setReg({ orientation: v as any })}
              />
            </Row>
            <Row label="Number of Copies">
              <Stepper value={r.copies} min={1} max={5} onChange={(v) => setReg({ copies: v })} />
            </Row>
            <Row label="Extra Space on Top of PDF (mm)">
              <Stepper value={r.extraTopMm} min={0} max={60} onChange={(v) => setReg({ extraTopMm: v })} />
            </Row>
            <Row label="Print Original / Duplicate / Triplicate">
              <Toggle value={r.showOriginalDuplicate} onChange={(v) => setReg({ showOriginalDuplicate: v })} />
            </Row>
            <Row label="Minimum Rows in Item Table">
              <Stepper value={r.minRows} min={0} max={30} onChange={(v) => setReg({ minRows: v })} />
            </Row>

            {shared(r, setReg, false)}

            <Section title="More Footer Options" />
            <Row label="Print Received By Details">
              <Toggle value={r.showReceivedBy} onChange={(v) => setReg({ showReceivedBy: v })} />
            </Row>
            <Row label="Print Delivered By Details">
              <Toggle value={r.showDeliveredBy} onChange={(v) => setReg({ showDeliveredBy: v })} />
            </Row>
            <Row label="Print Page Numbers (PDF)">
              <Toggle value={r.showPageNumbers} onChange={(v) => setReg({ showPageNumbers: v })} />
            </Row>
          </>
        ) : (
          <>
            <Row label="Make Thermal Printer Default">
              <Toggle value={t.isDefault} onChange={(v) => setTh({ isDefault: v })} />
            </Row>

            <Section title="Thermal Printer Settings" />
            <div className="px-4 py-3 text-xs text-slate-500 bg-white border-b border-slate-100">
              The printer itself (USB / Bluetooth / network) is chosen in your phone or computer print window after you
              tap Print.
            </div>
            <Row label="Thermal Printer Page Size">
              <Select
                value={t.pageWidth}
                options={[
                  { value: '58', label: '2 inch (58mm)' },
                  { value: '80', label: '3 inch (80mm)' },
                ]}
                onChange={(v) => setTh({ pageWidth: v as any })}
              />
            </Row>
            <Row label="Extra Lines at Print End">
              <Stepper value={t.extraLines} min={0} max={10} onChange={(v) => setTh({ extraLines: v })} />
            </Row>
            <Row label="Number of Copies">
              <Stepper value={t.copies} min={1} max={5} onChange={(v) => setTh({ copies: v })} />
            </Row>
            <Row label="Use Text Styling (Bold, etc.)">
              <Toggle value={t.textStyling} onChange={(v) => setTh({ textStyling: v })} />
            </Row>

            {shared(t, setTh, true)}
          </>
        )}
      </div>
    </div>
  );
};
