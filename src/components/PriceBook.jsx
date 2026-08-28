import { useState } from 'react';
import { uid, fmt } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, TblInput, EmptyState } from './UI.jsx';
import {
  BUILTIN_SUPPLIERS, loadCustomSuppliers, displaySuppliers,
  addCustomSupplier, removeCustomSupplier,
} from './suppliers.js';
import { touchShopKey } from '../lib/shopSync.js';

// ── SUPPLIER DEFAULT (global, shared across jobs — same pattern as the price book) ──
const SUPPLIER_DEFAULT_KEY = 'coldgauge_default_supplier_v1';
// Kept as a named export: other modules import SUPPLIERS. The list a shop can
// actually pick from is BUILTIN + whatever they added — see suppliers.js.
export const SUPPLIERS = BUILTIN_SUPPLIERS;

export function loadDefaultSupplier() {
  try {
    return localStorage.getItem(SUPPLIER_DEFAULT_KEY) || 'RE Michel';
  } catch {
    return 'RE Michel';
  }
}

export function saveDefaultSupplier(supplier) {
  try {
    localStorage.setItem(SUPPLIER_DEFAULT_KEY, supplier);
    touchShopKey(localStorage, SUPPLIER_DEFAULT_KEY);
    return true;
  } catch (e) {
    console.warn('Default supplier save failed:', e);
    return false;
  }
}

// ── STORAGE ────────────────────────────────────────────────────────────────────
// Separate localStorage key from jobs — this is shared across ALL jobs and must
// survive "New Job" / job switching untouched.
const PRICEBOOK_KEY = 'coldgauge_pricebook_v1';

export function loadPriceBook() {
  try {
    return JSON.parse(localStorage.getItem(PRICEBOOK_KEY) || '[]');
  } catch {
    return [];
  }
}

export function savePriceBook(entries) {
  try {
    localStorage.setItem(PRICEBOOK_KEY, JSON.stringify(entries));
    touchShopKey(localStorage, PRICEBOOK_KEY);
    return true;
  } catch (e) {
    console.warn('Price book save failed:', e);
    return false;
  }
}

// ── MATCHING ───────────────────────────────────────────────────────────────────
// Returns the best match for a given description/partId, or null if nothing matches.
// Priority: exact part# match > exact description match > fuzzy description substring match.
// This is intentionally conservative — it's used to SUGGEST a fill, never to silently apply one.
export function findPriceMatch(entries, { desc = '', partId = '' }) {
  if (!entries || entries.length === 0) return null;
  const normDesc = desc.trim().toLowerCase();
  const normPartId = partId.trim().toLowerCase();

  if (normPartId) {
    const exactPart = entries.find(e => e.partId && e.partId.trim().toLowerCase() === normPartId);
    if (exactPart) return { entry: exactPart, confidence: 'exact' };
  }

  if (!normDesc) return null;

  const exactDesc = entries.find(e => e.desc && e.desc.trim().toLowerCase() === normDesc);
  if (exactDesc) return { entry: exactDesc, confidence: 'exact' };

  // Fuzzy: description contains the price book entry's description, or vice versa.
  // Require at least 4 characters to avoid noisy matches on very short strings.
  if (normDesc.length >= 4) {
    const fuzzy = entries.find(e => {
      const ed = (e.desc || '').trim().toLowerCase();
      if (ed.length < 4) return false;
      return normDesc.includes(ed) || ed.includes(normDesc);
    });
    if (fuzzy) return { entry: fuzzy, confidence: 'fuzzy' };
  }

  return null;
}

// ── SUPPLIER SWITCHER ──────────────────────────────────────────────────────────
// Drop this wherever the job's supplier matters. Shows the current per-job supplier
// (state.preferredSupplier, falling back to the global default), lets the user pick
// any supplier for THIS job, and optionally save that choice as the new global default.
const ADD_SENTINEL = '__add_supplier__';

export function SupplierSwitcher({ value, onChange, compact = false }) {
  const globalDefault = loadDefaultSupplier();
  const current = value || globalDefault;
  const isGlobalDefault = current === globalDefault;
  const [custom, setCustom] = useState(() => loadCustomSuppliers(localStorage));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  // Built-ins + added + (if the job is priced against a name no longer on the
  // list) that name, so the picker can never render blank on a saved job.
  const options = displaySuppliers(custom, current);

  function handleSelect(supplier) {
    if (supplier === ADD_SENTINEL) { setAdding(true); setErr(''); return; }
    onChange(supplier);
  }

  function commitAdd() {
    const r = addCustomSupplier(localStorage, draft, { custom });
    if (!r.ok) { setErr(r.error); return; }
    setCustom(r.list);
    onChange(r.list[r.list.length - 1]);   // select what you just added
    setDraft(''); setErr(''); setAdding(false);
  }

  function handleRemove(name) {
    const r = removeCustomSupplier(localStorage, name, { custom });
    if (!r.ok) return;
    setCustom(r.list);
    // Don't leave the job pointing at a supplier that is gone from the list.
    if (current === name) onChange(globalDefault);
  }

  const addRow = (
    <div style={{ marginTop: 10 }}>
      <Row style={{ gap: 6 }}>
        <input
          value={draft}
          onChange={e => { setDraft(e.target.value); setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setErr(''); } }}
          placeholder="Supplier name (e.g. Coastal Refrigeration)"
          autoFocus
          style={{
            flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, color: colors.text,
            borderRadius: 6, padding: '8px 10px', fontSize: 12, outline: 'none',
            fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
          }}
        />
        <Btn size="sm" onClick={commitAdd}>Add</Btn>
        <Btn size="sm" variant="surface" onClick={() => { setAdding(false); setErr(''); setDraft(''); }}>Cancel</Btn>
      </Row>
      {err && <div style={{ fontSize: 11, color: colors.yellow, marginTop: 6 }}>{err}</div>}
    </div>
  );

  if (compact) {
    return (
      <div>
        <select
          value={current}
          onChange={e => handleSelect(e.target.value)}
          style={{
            background: colors.surface, border: `1px solid ${colors.border}`, color: colors.text,
            borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer', outline: 'none',
          }}
        >
          {options.map(s => <option key={s} value={s}>{s}</option>)}
          <option value={ADD_SENTINEL}>＋ Add supplier…</option>
        </select>
        {adding && addRow}
      </div>
    );
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <SLabel>Preferred Supplier</SLabel>
        {!isGlobalDefault && (
          <button onClick={() => saveDefaultSupplier(current)} style={{ background: 'transparent', border: `1px solid ${colors.green}`, color: colors.green, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ⭐ Set as Default for All Jobs
          </button>
        )}
      </Row>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {options.map(s => {
          const isCustom = custom.some(c => c === s);
          return (
            <div key={s} style={{ position: 'relative' }}>
              <button
                onClick={() => handleSelect(s)}
                style={{
                  width: '100%', padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: `2px solid ${current === s ? colors.green : colors.border}`,
                  background: current === s ? colors.greenFaint : colors.card2,
                  color: current === s ? colors.green : colors.textDim,
                }}
              >
                {s}{s === globalDefault ? ' ⭐' : ''}
              </button>
              {isCustom && (
                <button
                  onClick={() => handleRemove(s)}
                  title={`Remove ${s}`}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                    border: `1px solid ${colors.border2}`, background: colors.card, color: colors.textDim,
                    fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0,
                  }}
                >×</button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => { setAdding(true); setErr(''); }}
          style={{
            padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
            border: `2px dashed ${colors.border2}`, background: 'transparent', color: colors.textDim,
          }}
        >＋ Add</button>
      </div>
      {adding && addRow}
      <div style={{ fontSize: 11, color: colors.textDim, marginTop: 10 }}>
        ⭐ marks your global default. Picking a different supplier here only changes it for this job.
        Suppliers you add are saved for every job on this device.
      </div>
    </Card>
  );
}


// Drop this next to any description/part# input. Pass the current desc/partId and
// a callback that receives the matched price. Renders nothing if there's no match.
export function PriceMatchChip({ desc, partId, onFill }) {
  const entries = loadPriceBook();
  const match = findPriceMatch(entries, { desc, partId });
  if (!match) return null;

  const isExact = match.confidence === 'exact';
  return (
    <button
      onClick={() => onFill(match.entry.price)}
      title={`${match.entry.desc}${match.entry.partId ? ' · ' + match.entry.partId : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: isExact ? colors.greenFaint : colors.surface,
        border: `1px solid ${isExact ? colors.green : colors.border}`,
        color: isExact ? colors.green : colors.textDim,
        borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700,
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      📖 {fmt(match.entry.price)}
    </button>
  );
}

// ── PRICE BOOK SCREEN ──────────────────────────────────────────────────────────
const CATEGORIES = ['Copper', 'Fittings', 'Insulation', 'Hardware', 'Consumables', 'Rack Parts', 'Equipment', 'Misc'];

export default function PriceBookModal({ onClose }) {
  const [entries, setEntries] = useState(loadPriceBook());
  const [search, setSearch] = useState('');

  function persist(next) {
    setEntries(next);
    savePriceBook(next);
  }

  function addEntry() {
    persist([...entries, { id: uid(), desc: '', partId: '', category: 'Misc', unit: 'ea', price: 0 }]);
  }

  function updateEntry(id, field, value) {
    persist(entries.map(e => e.id === id ? { ...e, [field]: field === 'price' ? parseFloat(value) || 0 : value } : e));
  }

  function removeEntry(id) {
    persist(entries.filter(e => e.id !== id));
  }

  function exportCSV() {
    let csv = 'Category,Description,Part Number,Unit,Price\n';
    entries.forEach(e => { csv += `"${e.category}","${e.desc}","${e.partId}","${e.unit}",${e.price}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'coldgauge_pricebook.csv';
    a.click();
  }

  const filtered = search.trim()
    ? entries.filter(e =>
        (e.desc || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.partId || '').toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  const categories = [...new Set(filtered.map(e => e.category || 'Misc'))];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: colors.green }}>📖 My Price Book</div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>Shared across every job — copy prices in once, tap to fill anywhere</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.border}` }}>
          <Row style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search description or part #..."
              style={{ flex: 1, minWidth: 180 }}
            />
            <Row style={{ gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={addEntry}>+ Add Entry</Btn>
              <Btn variant="surface" size="sm" onClick={exportCSV}>📥 Export CSV</Btn>
            </Row>
          </Row>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {filtered.length === 0 ? (
            <EmptyState
              icon="📖"
              title="Price book is empty"
              subtitle="Add the parts, fittings, and equipment you price often — once they're here, every job can pull from them with one tap"
            />
          ) : (
            categories.map(cat => (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 0', borderBottom: `1px solid ${colors.border}`, marginBottom: 8 }}>{cat}</div>
                {filtered.filter(e => (e.category || 'Misc') === cat).map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.border}40` }}>
                    <select
                      value={e.category || 'Misc'}
                      onChange={ev => updateEntry(e.id, 'category', ev.target.value)}
                      style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textDim, borderRadius: 5, padding: '5px 6px', fontSize: 11, flexShrink: 0, width: 100 }}
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <TblInput value={e.desc} onChange={ev => updateEntry(e.id, 'desc', ev.target.value)} placeholder="Description" style={{ flex: 1 }} />
                    <TblInput value={e.partId} onChange={ev => updateEntry(e.id, 'partId', ev.target.value)} placeholder="Part #" style={{ width: 90, fontFamily: "'DM Mono', monospace", flexShrink: 0 }} />
                    <TblInput value={e.unit} onChange={ev => updateEntry(e.id, 'unit', ev.target.value)} placeholder="ea/ft" style={{ width: 50, textAlign: 'center', flexShrink: 0 }} />
                    <Row style={{ gap: 2, flexShrink: 0 }}>
                      <span style={{ color: colors.textDim, fontSize: 12 }}>$</span>
                      <TblInput type="number" value={e.price || ''} onChange={ev => updateEntry(e.id, 'price', ev.target.value)} placeholder="0.00" style={{ width: 70, textAlign: 'right', fontFamily: "'DM Mono', monospace" }} />
                    </Row>
                    <button onClick={() => removeEntry(e.id)} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>{entries.length} entries · saved automatically</span>
          <Btn variant="green" size="sm" onClick={onClose}>Done</Btn>
        </div>
      </div>
    </div>
  );
}
