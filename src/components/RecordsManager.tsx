import React from 'react';
import { apiFetch } from '../utils/api';
import { CalendarDays, Search, Trash2, Pencil, RefreshCw, CheckSquare, Square, ArrowLeft } from 'lucide-react';

type RecordType = 'sales' | 'purchases' | 'expenses';
type ManagedRecord = { id: string; date: string; title: string; amount: number | string; [key: string]: any };
const typeLabels: Record<RecordType, string> = { sales: 'Sales / Invoices', purchases: 'Purchases', expenses: 'Expenses' };

export const RecordsManager: React.FC<{ mode: 'delete' | 'edit'; onBack?: () => void }> = ({ mode, onBack }) => {
  const [type, setType] = React.useState<RecordType>('sales');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [appliedFrom, setAppliedFrom] = React.useState('');
  const [appliedTo, setAppliedTo] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [appliedQuery, setAppliedQuery] = React.useState('');
  const [records, setRecords] = React.useState<ManagedRecord[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [editing, setEditing] = React.useState<ManagedRecord | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDate, setEditDate] = React.useState('');
  const [editFields, setEditFields] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true); setNotice('');
    try {
      const params = new URLSearchParams({ type, from: appliedFrom, to: appliedTo, q: appliedQuery });
      const response = await apiFetch(`/api/records/manage?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load records.');
      setRecords(Array.isArray(payload.records) ? payload.records : []);
      setSelected([]);
    } catch (e: any) { setNotice(e.message || 'Unable to load records.'); }
    finally { setLoading(false); }
  }, [type, appliedFrom, appliedTo, appliedQuery]);
  React.useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allSelected = records.length > 0 && records.every(r => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? [] : records.map(r => r.id));

  const deleteRecords = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} selected ${type} record(s)? Linked accounting and stock entries will be reversed where supported. This cannot be undone.`)) return;
    setBusy(true); setNotice('');
    try {
      const response = await apiFetch('/api/records/manage/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ids }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Bulk delete failed.');
      const failures = (payload.results || []).filter((r: any) => !r.success);
      setNotice(`${payload.deleted || 0} deleted; ${payload.failed || 0} failed.${failures.length ? ` ${failures.slice(0, 3).map((f: any) => `${f.id}: ${f.error}`).join(' | ')}` : ''}`);
      await load();
    } catch (e: any) { setNotice(e.message || 'Bulk delete failed.'); }
    finally { setBusy(false); }
  };

  const bulkDelete = async () => deleteRecords(selected);
  const beginEdit = (record: ManagedRecord) => {
    setEditing(record);
    setEditTitle(String(record.title || ''));
    const raw=String(record.date || '');
    setEditDate(/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0,10) : raw.includes('/') ? raw.split('/').reverse().join('-') : raw.slice(0,10));
    const fields = type === 'sales'
      ? ['party_name','party_phone','party_gstin','party_address','due_date','notes']
      : type === 'purchases'
        ? ['supplier_name','supplier_gstin','supplier_phone','notes']
        : ['expense_no','category','title','paid_to','notes'];
    setEditFields(Object.fromEntries(fields.map(key => [key, String(record[key] ?? '')])));
  };
  const saveEdit = async () => {
    if (!editing) return;
    const key = type === 'sales' ? 'invoice_number' : type === 'purchases' ? 'supplier_invoice_no' : 'expense_no';
    setBusy(true); setNotice('');
    try {
      const response = await apiFetch(`/api/records/manage/${type}/${encodeURIComponent(editing.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: editDate, ...editFields, [key]: editTitle }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update record.');
      setEditing(null); setNotice('Record updated successfully. Monetary, GST and item values are protected from unsafe direct changes.'); await load();
    } catch (e: any) { setNotice(e.message || 'Unable to update record.'); }
    finally { setBusy(false); }
  };

  return <section className="min-h-full space-y-4 bg-white" aria-label={mode === 'delete' ? 'Delete Records' : 'Edit Records'}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><div><h3 className="text-xl font-black text-slate-900">{mode === 'delete' ? 'Delete Records' : 'Edit Records'}</h3><p className="mt-1 text-sm text-slate-500">Search and filter sales, purchases and expenses. Up to 500 matching records are shown.</p></div>{onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/> Back</button>}</div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <select aria-label="Record type" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" value={type} onChange={e => setType(e.target.value as RecordType)}>{Object.entries(typeLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
      <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-2"><CalendarDays className="h-4 w-4 text-slate-400"/><input aria-label="From date" className="w-full min-w-0 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600" type="date" value={from} onChange={e => setFrom(e.target.value)}/></label>
      <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-2"><CalendarDays className="h-4 w-4 text-slate-400"/><input aria-label="To date" className="w-full min-w-0 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600" type="date" value={to} onChange={e => setTo(e.target.value)}/></label>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3"><Search className="h-4 w-4 shrink-0 text-slate-400"/><input className="w-full py-2 text-sm outline-none" placeholder="Search number, party or title" value={query} onChange={e => setQuery(e.target.value)} /></label><button type="button" onClick={() => { setAppliedFrom(from); setAppliedTo(to); setAppliedQuery(query.trim()); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Apply Filter</button><button type="button" onClick={() => void load()} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50" title="Refresh" aria-label="Refresh records"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/></button></div>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{records.length} record(s){mode === 'delete' ? ` · ${selected.length} selected` : ''}</span>{mode === 'delete' && <button type="button" disabled={!selected.length || busy} onClick={() => void bulkDelete()} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/> Delete selected</button>}</div>
    {notice && <div role="status" className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">{notice}</div>}
    <div className="max-h-[65dvh] overflow-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr>{mode === 'delete' && <th className="p-2"><button type="button" onClick={toggleAll} aria-label="Select all records">{allSelected ? <CheckSquare className="h-4 w-4"/> : <Square className="h-4 w-4"/>}</button></th>}<th className="p-2">Date</th><th className="p-2">Record</th><th className="p-2 text-right">Amount</th>{mode === 'edit' && <th className="p-2">Edit</th>}{mode === 'delete' && <th className="p-2">Delete</th>}</tr></thead><tbody>{records.map(r => <tr key={r.id} className="border-t border-slate-100">{mode === 'delete' && <td className="p-2"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`}/></td>}<td className="whitespace-nowrap p-2">{String(r.date || '').slice(0,10)}</td><td className="max-w-36 truncate p-2" title={r.title}>{r.title || r.id}</td><td className="whitespace-nowrap p-2 text-right">₹{Number(r.amount || 0).toLocaleString('en-IN',{maximumFractionDigits:2})}</td>{mode === 'edit' && <td className="p-2"><button type="button" onClick={() => beginEdit(r)} className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50" aria-label={`Edit ${r.title}`}><Pencil className="h-3.5 w-3.5"/></button></td>}{mode === 'delete' && <td className="p-2"><button type="button" disabled={busy} onClick={() => void deleteRecords([r.id])} className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50" aria-label={`Delete ${r.title}`}><Trash2 className="h-3.5 w-3.5"/></button></td>}</tr>)}{!records.length && <tr><td colSpan={mode === 'delete' ? 5 : 4} className="p-5 text-center text-slate-400">{loading ? 'Loading…' : 'No records found.'}</td></tr>}</tbody></table></div>
    {mode === 'edit' && editing && <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><h4 className="font-black text-slate-900">Edit record</h4><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">Cancel</button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Date<input type="date" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm" value={editDate} onChange={e => setEditDate(e.target.value)}/></label><label className="text-xs font-semibold text-slate-600">{type === 'sales' ? 'Invoice number' : type === 'purchases' ? 'Supplier invoice number' : 'Expense number'}<input className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm" value={editTitle} onChange={e => setEditTitle(e.target.value)}/></label>{(type === 'sales' ? [['party_name','Customer / party name'],['party_phone','Party phone'],['party_gstin','Customer GSTIN'],['party_address','Customer address'],['due_date','Due date'],['notes','Notes']] : type === 'purchases' ? [['supplier_name','Supplier name'],['supplier_gstin','Supplier GSTIN'],['supplier_phone','Supplier mobile'],['notes','Notes']] : [['category','Category'],['title','Expense title'],['paid_to','Paid to'],['notes','Notes']]).map(([key,label]) => <label key={key} className="text-xs font-semibold text-slate-600">{label}<input type={key === 'due_date' ? 'date' : 'text'} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm" value={editFields[key] || ''} onChange={e => setEditFields(prev => ({...prev,[key]:e.target.value}))}/></label>)}</div><p className="mt-3 text-xs text-slate-500">GST, totals and item quantities are protected to avoid corrupting linked accounting and stock records.</p><div className="mt-4 flex justify-end"><button disabled={busy} onClick={() => void saveEdit()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckSquare className="h-4 w-4"/> Save changes</button></div></section>}
  </section>;
};
