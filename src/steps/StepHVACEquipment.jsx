import { useState } from 'react';
import { useStore, uid, fmt, defaultHvacPrice } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, TblInput, EmptyState } from '../components/UI.jsx';
import { searchSupplier } from '../api/ai.js';
import { PriceMatchChip, SupplierSwitcher, loadPriceBook, savePriceBook, findPriceMatch } from '../components/PriceBook.jsx';
import { parseDuctDesc, ductPurchase } from '../components/ductwork.js';
import { isHydronicService, pipeDescSize } from '../components/pipePricing.js';
import { hydronicValveLines, countHydronicEquipment } from '../components/hydronicValves.js';
import { groupHvacParts, partGroupOf } from '../components/partGroups.js';
import ChargeAdderCalc from '../components/ChargeCalc.jsx';

const HVAC_EQUIP_TYPES = [
  'Rooftop Unit (RTU)',
  'Split System — Condenser',
  'Split System — Air Handler',
  'Packaged Heat Pump',
  'Mini Split — Condenser',
  'Mini Split — Head Unit',
  'Air Handling Unit (AHU)',
  'Fan Coil Unit (FCU)',
  'VAV Box',
  'Heat Recovery Ventilator (HRV)',
  'Energy Recovery Ventilator (ERV)',
  'Chiller',
  'Boiler',
  'Cooling Tower',
  'Exhaust Fan',
  'Roof Hood / Gravity Vent',
  'Make-Up Air Unit (MAU)',
  // ── Terminal heat ──
  // A school set is full of these: unit heaters over entries, cabinet heaters
  // in vestibules, fin-tube along glass. With no type to land on, all of them
  // pooled into "Other" — 32 of 40 units on one live read.
  'Unit Heater',
  'Cabinet Unit Heater (CUH)',
  'Baseboard / Fin-Tube Heater',
  'Duct Heater',
  // ── Data center / central plant ──
  'Chiller — Water-Cooled',
  'Chiller — Air-Cooled',
  'CRAC Unit (DX)',
  'CRAH Unit (Chilled Water)',
  'Coolant Distribution Unit (CDU)',
  'Rear-Door Heat Exchanger',
  'Chilled Water Pump',
  'Condenser Water Pump',
  'Pump — Circulator / Inline',
  'Dry Cooler / Fluid Cooler',
  'Air Handling Unit — Computer Room',
  'Other',
];

// R-134a and the low-GWP chiller refrigerants (R-513A/R-1233zd/R-514A) are the
// ones on data-center chiller schedules; the split-system gases stay for comfort HVAC.
const REFRIGERANTS = ['R-410A', 'R-32', 'R-454B', 'R-407C', 'R-22 (existing)', 'R-134a', 'R-513A', 'R-1233zd(E)', 'R-514A', 'R-123 (legacy)', 'Other'];

// A schedule-heavy job imports 100+ units. Past this count the flat card list
// switches to collapsible per-type groups (AHUs together, roof fans together…),
// each with a count, priced tally, and cost subtotal on the header. Cards keep
// their tag order within a group and sort by tag so AHU-E-01…AHU-M-12 read in
// sequence.
const EQUIP_GROUP_THRESHOLD = 5;
function groupEquipmentByType(equipment) {
  const buckets = new Map();
  for (const e of equipment) {
    const t = e.type || 'Other';
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t).push(e);
  }
  // Fixed dropdown order first (RTUs before fans before pumps), unknowns last.
  const rank = t => { const i = HVAC_EQUIP_TYPES.indexOf(t); return i === -1 ? HVAC_EQUIP_TYPES.length : i; };
  return [...buckets.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([type, units]) => ({
      type,
      units: [...units].sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || ''), undefined, { numeric: true })),
    }));
}

const TASK_TYPES = [
  'New Installation',
  'Replacement',
  'Retrofit / Upgrade',
  'Startup & Commissioning',
  'Controls / BMS Wiring',
  'Ductwork Connection',
  'Electrical Rough-In',
  'Crane / Rigging',
  'Curb Adapter',
  'Disconnect / Decommission',
  'Other',
];

// ── EQUIPMENT CARD ─────────────────────────────────────────────────────────────
function EquipmentCard({ equip, onUpdate, onRemove, supplier, startCollapsed = false }) {
  // Inside a type group (a 175-unit school set) cards start collapsed — the
  // header row carries tag/type/cost, tap to edit. Flat lists open as before.
  const [expanded, setExpanded] = useState(!startCollapsed);

  return (
    <Card style={{ marginBottom: 12 }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🌀</span>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700 }}>
              {equip.tag ? `[${equip.tag}] ` : ''}{equip.type || 'HVAC Unit'}
            </div>
            {equip.tons && (
              <span style={{ fontSize: 10, background: colors.surface, color: colors.textDim, padding: '2px 8px', borderRadius: 4, fontFamily: "'DM Mono', monospace" }}>
                {equip.tons}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
            {[equip.brand, equip.model].filter(Boolean).join(' · ') || 'No brand/model set'}
            {equip.cost > 0 ? ` · ${fmt(equip.cost)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {equip.cost > 0 && (
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: colors.green }}>{fmt(equip.cost)}</span>
          )}
          <span style={{ color: colors.textDim }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <>
          <div style={{ height: 1, background: colors.border, margin: '14px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {/* Equipment Tag */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Equipment Tag / ID</div>
              <Input value={equip.tag || ''} onChange={e => onUpdate('tag', e.target.value)} placeholder="AHU-1, RTU-3..." />
            </div>

            {/* Type */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Equipment Type</div>
              <Select value={equip.type} onChange={e => onUpdate('type', e.target.value)}>
                {HVAC_EQUIP_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </div>

            {/* Capacity */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Capacity (Tons / BTU / CFM)</div>
              <Input value={equip.tons || ''} onChange={e => onUpdate('tons', e.target.value)} placeholder="5T or 60,000 BTU or 2000 CFM" />
            </div>

            {/* Brand */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Brand</div>
              <Input value={equip.brand || ''} onChange={e => onUpdate('brand', e.target.value)} placeholder="Carrier, Trane, Daikin..." />
            </div>

            {/* Model */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Model #</div>
              <Input value={equip.model || ''} onChange={e => onUpdate('model', e.target.value)} placeholder="Model number" />
            </div>

            {/* Refrigerant */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Refrigerant</div>
              <Select value={equip.refrigerant || 'R-410A'} onChange={e => onUpdate('refrigerant', e.target.value)}>
                {REFRIGERANTS.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>

            {/* MCA */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>MCA (Amps)</div>
              <Input type="number" value={equip.mca || ''} onChange={e => onUpdate('mca', e.target.value)} placeholder="0" />
            </div>

            {/* MOP */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>MOP / Breaker (Amps)</div>
              <Input type="number" value={equip.mop || ''} onChange={e => onUpdate('mop', e.target.value)} placeholder="0" />
            </div>

            {/* Voltage */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Voltage</div>
              <Select value={equip.voltage || ''} onChange={e => onUpdate('voltage', e.target.value)}>
                <option value="">Select</option>
                <option>208/230V 1-Phase</option>
                <option>208/230V 3-Phase</option>
                <option>460V 3-Phase</option>
                <option>115V 1-Phase</option>
                <option>277/480V 3-Phase</option>
              </Select>
            </div>

            {/* Location */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Location / Zone</div>
              <Input value={equip.location || ''} onChange={e => onUpdate('location', e.target.value)} placeholder="Roof Zone A, Suite 102..." />
            </div>
          </div>

          {/* Cost */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Equipment Cost</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: colors.textDim }}>$</span>
                <Input type="number" value={equip.cost || ''} onChange={e => onUpdate('cost', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                {!equip.cost && (
                  <PriceMatchChip
                    desc={[equip.type, equip.brand, equip.model].filter(Boolean).join(' ')}
                    onFill={price => onUpdate('cost', price)}
                  />
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Install Task</div>
              <Select value={equip.task || 'New Installation'} onChange={e => onUpdate('task', e.target.value)}>
                {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Notes</div>
            <Input value={equip.notes || ''} onChange={e => onUpdate('notes', e.target.value)} placeholder="Crane required, existing curb, controls scope..." />
          </div>

          {/* Actions */}
          <Row style={{ justifyContent: 'space-between' }}>
            <Btn variant="blue" size="sm" onClick={() => searchSupplier(`${equip.type} ${equip.tons || ''} ${equip.brand || ''} ${equip.model || ''}`.trim(), supplier)}>
              🔍 Search {supplier}
            </Btn>
            <Btn variant="red" size="sm" onClick={onRemove}>Remove</Btn>
          </Row>
        </>
      )}
    </Card>
  );
}

// ── MISC PARTS ─────────────────────────────────────────────────────────────────
// Above this many lines the flat list becomes a scroll marathon (a real school
// set lands ~100), so it switches to collapsible sections with subtotals.
const GROUPED_THRESHOLD = 8;

function MiscParts() {
  const { state, dispatch } = useStore();
  const supplier = state.preferredSupplier || 'RE Michel';
  const parts = state.hvacParts || [];
  // Per-section expand/collapse. Unset = default: small sections open, big
  // ones collapsed — the header's count/footage/subtotal still tells the story.
  const [openGroups, setOpenGroups] = useState({});

  function addPart() {
    dispatch({ type: 'SET', key: 'hvacParts', value: [...parts, { id: uid(), desc: '', qty: 1, unitCost: 0, total: 0 }] });
  }

  // Empty the materials table so a re-read can rebuild it cleanly.
  //
  // Needed because a job analyzed under an older build carries lines whose
  // DESCRIPTIONS no longer match what the app produces now — every improvement
  // to how a size or service is written leaves the old wording stranded, and a
  // re-read adds its lines beside them instead of replacing them. Accepting a
  // read now clears that file's previous lines automatically, but only for
  // lines recorded since; anything older has no source on it and cannot be
  // told apart from a line typed by hand.
  //
  // So this clears everything and says so, rather than guessing which lines
  // were the app's. Blunt beats clever when the alternative is silently
  // deleting someone's own work.
  function clearTakeoff() {
    if (!parts.length) return;
    if (!confirm(
      `Remove ALL ${parts.length} line(s) from this materials table?\n\n`
      + `This includes any you added or priced by hand — there is no way to tell those from lines an older version of the app produced.\n\n`
      + `Re-run Analyze on the Setup step afterwards to rebuild the takeoff.`
    )) return;
    dispatch({ type: 'SET', key: 'hvacParts', value: [] });
  }

  function updatePart(id, field, value) {
    dispatch({ type: 'SET', key: 'hvacParts', value: parts.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: field === 'qty' || field === 'unitCost' ? parseFloat(value) || 0 : value };
      updated.total = (updated.qty || 0) * (updated.unitCost || 0);
      return updated;
    })});
    // Same learning loop as the refrigeration materials table: a unit cost
    // typed here goes into the price book, so the next job autofills it.
    if (field === 'unitCost') {
      const it = parts.find(p => p.id === id);
      const price = parseFloat(value) || 0;
      if (it && price > 0 && it.desc) {
        const book = loadPriceBook();
        const norm = it.desc.trim().toLowerCase();
        const existing = book.find(e => (e.desc || '').trim().toLowerCase() === norm);
        if (existing) {
          if (existing.price !== price) savePriceBook(book.map(e => e === existing ? { ...e, price } : e));
        } else {
          savePriceBook([...book, { id: uid(), desc: it.desc, partId: '', category: 'HVAC', unit: 'ea', price }]);
        }
      }
    }
  }

  const partsTotal = parts.reduce((s, p) => s + (p.total || 0), 0);

  // Common commercial-HVAC install items that are easy to leave off a bid —
  // one tap adds the line so the estimator just fills qty/cost.
  const COMMON = [
    'Curb adapter', 'Roof curb / rails', 'Crane / rigging', 'Disconnect & whip',
    'Programmable / BMS thermostat', 'Economizer', 'Low-ambient kit', 'Hail guards',
    'Condensate trap & drain (PVC)', 'Duct smoke detector', 'Vibration isolation',
    'Filter rack & filters', 'Duct connection / flex / transitions',
    'Refrigerant (R-410A / R-454B) by lb', 'Lineset (split)', 'Refrigerant line insulation',
  ];
  const addNamed = desc => {
    const uc = defaultHvacPrice(desc);
    dispatch({ type: 'SET', key: 'hvacParts', value: [...parts, { id: uid(), desc, qty: 1, unitCost: uc, total: uc }] });
  };

  // Backfill ballpark prices onto any line still at $0 — the takeoff's air
  // devices land unpriced, and one tap gets a close number on all of them.
  // Duct FOOTAGE lines are left alone (priced by the Duct calculator); their
  // generated purchase lines and everything else get a default.
  function fillDefaults() {
    let filled = 0;
    const next = parts.map(p => {
      if ((p.unitCost || 0) > 0) return p;
      const uc = defaultHvacPrice(p.desc);
      if (!uc) return p;
      filled++;
      return { ...p, unitCost: uc, total: (p.qty || 0) * uc };
    });
    if (filled) dispatch({ type: 'SET', key: 'hvacParts', value: next });
  }
  const unpricedCount = parts.filter(p => (p.unitCost || 0) === 0 && defaultHvacPrice(p.desc) > 0).length;

  // One row, used by both the flat list and the grouped sections. Tighter
  // padding than the old rows — on a 100-line table that alone halves the scroll.
  const renderPartRow = (p, i) => (
    <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 10px', borderBottom: `1px solid ${colors.border}`, background: i % 2 === 0 ? 'transparent' : colors.surface + '30' }}>
      <TblInput value={p.desc} onChange={e => updatePart(p.id, 'desc', e.target.value)} placeholder="Description" style={{ flex: 1 }} />
      {!p.unitCost && <PriceMatchChip desc={p.desc} onFill={price => updatePart(p.id, 'unitCost', price)} />}
      <TblInput type="number" value={p.qty} onChange={e => updatePart(p.id, 'qty', e.target.value)} placeholder="Qty" style={{ width: 45, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
      <TblInput type="number" value={p.unitCost || ''} onChange={e => updatePart(p.id, 'unitCost', e.target.value)} placeholder="$" style={{ width: 70, textAlign: 'right', fontFamily: "'DM Mono', monospace" }} />
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colors.green, minWidth: 60, textAlign: 'right' }}>{fmt(p.total)}</span>
      <button onClick={() => searchSupplier(p.desc, supplier)} style={{ background: colors.blue, border: 'none', color: '#fff', borderRadius: 5, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>🔍</button>
      <button onClick={() => dispatch({ type: 'SET', key: 'hvacParts', value: parts.filter(x => x.id !== p.id) })} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
    </div>
  );

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <SLabel>Parts & Misc Materials</SLabel>
        <Row style={{ gap: 8 }}>
          {unpricedCount > 0 && <Btn variant="green" size="sm" onClick={fillDefaults}>💲 Fill default prices ({unpricedCount})</Btn>}
          {parts.length > 0 && <Btn variant="ghost" size="sm" onClick={clearTakeoff}>🧹 Clear takeoff lines</Btn>}
          <Btn variant="ghost" size="sm" onClick={addPart}>+ Add Part</Btn>
        </Row>
      </Row>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {COMMON.map(c => (
          <button key={c} onClick={() => addNamed(c)} style={{ padding: '5px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textDim }}>+ {c}</button>
        ))}
      </div>
      {parts.length === 0 ? (
        <Card><EmptyState icon="🔧" title="No parts yet" subtitle="Add thermostats, controls, refrigerant, filters, curb adapters, etc." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {parts.length <= GROUPED_THRESHOLD
            ? parts.map((p, i) => renderPartRow(p, i))
            : groupHvacParts(parts).map(g => {
              const open = openGroups[g.key] ?? (g.count <= 6);
              return (
                <div key={g.key}>
                  <div
                    onClick={() => setOpenGroups({ ...openGroups, [g.key]: !open })}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', userSelect: 'none', background: colors.surface, borderBottom: `1px solid ${colors.border}` }}
                  >
                    <span style={{ fontSize: 13 }}>{g.icon}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 700 }}>{g.label}</span>
                    <span style={{ fontSize: 11, color: colors.textDim, fontFamily: "'DM Mono', monospace" }}>
                      {g.count} line{g.count === 1 ? '' : 's'}{g.qtyUnit && g.qtySum > 0 ? ` · ${g.qtySum.toLocaleString()} ${g.qtyUnit}` : ''}
                    </span>
                    {/* Where the pricing work remains, at a glance — green when done */}
                    <span style={{ fontSize: 10, color: g.pricedCount === g.count ? colors.green : colors.yellow, fontFamily: "'DM Mono', monospace" }}>
                      {g.pricedCount}/{g.count} priced
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colors.green }}>{fmt(g.subtotal)}</span>
                    <span style={{ color: colors.textDim, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
                  </div>
                  {open && g.parts.map((p, i) => renderPartRow(p, i))}
                </div>
              );
            })}
          <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: colors.textDim }}>Parts Total</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmt(partsTotal)}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── HYDRONIC FITTINGS ALLOWANCE ────────────────────────────────────────────────
// Pipe footage is not the cost of piping. Every branch off a main is a tee, every
// turn an ell, every unit a pair of adapters and a hanger — and a hydronic layout
// is nearly all branches. One live sheet dropped 43 separate 3/4" runs to fin
// tube off a single main, so the fitting count there is larger than the footage
// suggests by a wide margin.
//
// Same shape as the refrigeration side's fittings allowance: a percentage of the
// pipe material, generated as one visible lot line rather than folded invisibly
// into the pipe rate, so it can be seen, edited, or deleted outright by a shop
// that itemizes instead.
//
// VALVES ARE NOT IN IT. Balancing, isolation and control valves on a hydronic
// job are big enough to price individually, and burying them in a percentage
// would both understate them and hide them.
export const DEFAULT_HYDRONIC_FITTINGS_PCT = 40;

function HydronicFittingsCalculator() {
  const { state, dispatch } = useStore();
  const parts = state.hvacParts || [];
  const pct = Number(state.rates?.hydronicFittingsPct ?? DEFAULT_HYDRONIC_FITTINGS_PCT);
  const [added, setAdded] = useState(false);

  // Hydronic pipe only. Refrigerant lines carry their own fittings treatment on
  // the refrigeration side, and pricing them twice is exactly the kind of quiet
  // double-count this app exists to remove.
  const pipeLines = parts.filter(p =>
    !p.dgen && partGroupOf(p) === 'pipe' && isHydronicService(p.desc));
  if (pipeLines.length === 0) return null;

  const pipeTotal = pipeLines.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unitCost) || 0), 0);
  const allowance = Math.round(pipeTotal * pct / 100);
  const unpriced = pipeLines.filter(p => !(Number(p.unitCost) > 0));

  function addAllowance() {
    const line = {
      id: uid(), dgen: true, gen: 'hydronic',
      desc: `Hydronic fittings, joints & hangers — ${pct}% of pipe material (valves NOT included)`,
      qty: 1, unitCost: allowance, total: allowance,
    };
    dispatch({ type: 'SET', key: 'hvacParts',
      value: [...parts.filter(p => !(p.dgen && p.gen === 'hydronic')), line] });
    setAdded(true);
  }

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>🔩 Hydronic Fittings Allowance</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 10 }}>
        Footage alone under-buys piping — every branch is a tee, every turn an ell, every unit a pair of
        adapters and a hanger. This adds a percentage of the <strong>hydronic pipe material</strong> as one
        lot line covering <strong>fittings, solder/braze and hangers</strong>. Branch-heavy layouts (lots of
        short drops to fin tube or coils) run higher than this; long straight mains run lower.
        <br />
        <strong style={{ color: colors.yellow }}>Valves are not included</strong> — balancing, isolation and
        control valves are worth pricing individually.
      </div>

      {unpriced.length > 0 && (
        <div style={{ fontSize: 11, color: colors.yellow, marginBottom: 10 }}>
          ⚠ {unpriced.length} pipe line{unpriced.length > 1 ? 's have' : ' has'} no price yet — the allowance is a
          percentage of priced pipe, so price those first or this number will be short.
        </div>
      )}

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Fittings %</span>
          <Input type="number" value={pct}
            onChange={e => { dispatch({ type: 'SET_RATES_MISC', key: 'hydronicFittingsPct', value: parseFloat(e.target.value) || 0 }); setAdded(false); }}
            style={{ width: 60, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div style={{ fontSize: 12, color: colors.textDim }}>
          {pipeLines.length} hydronic line(s) · {fmt(pipeTotal)} of pipe → <strong style={{ color: colors.green }}>{fmt(allowance)}</strong>
        </div>
      </Row>

      <Btn variant={added ? 'ghost' : 'green'} size="sm" onClick={addAllowance} disabled={!(allowance > 0)}>
        {added ? '✓ Added — click again to update' : `Add ${fmt(allowance)} fittings allowance`}
      </Btn>
    </Card>
  );
}

// ── HYDRONIC VALVES & SPECIALTIES ──────────────────────────────────────────────
// Counts key off the equipment already read from the plans — one connection
// package per terminal unit, a strainer and check per pump, isolation at the
// branches. Everything stays editable, because the plans do not always say how
// many high points a system has.
function HydronicValveCalculator() {
  const { state, dispatch } = useStore();
  const parts = state.hvacParts || [];
  const equipment = state.hvacEquipment || [];
  const counted = countHydronicEquipment(equipment);

  const pipeLines = parts.filter(p => !p.dgen && partGroupOf(p) === 'pipe' && isHydronicService(p.desc));
  const [terminals, setTerminals] = useState(counted.terminals);
  const [pumps, setPumps] = useState(counted.pumps);
  const [terminalSize, setTerminalSize] = useState(0.75);
  const [terminalMode, setTerminalMode] = useState('hosekit');
  const [controlValves, setControlValves] = useState('byOthers');
  const [pumpSize, setPumpSize] = useState(1.5);
  const [airVents, setAirVents] = useState(0);
  const [drains, setDrains] = useState(0);
  const [added, setAdded] = useState(false);

  // Mains and branches worth isolating — the sizes the takeoff actually found,
  // two valves each (supply and return) as a starting count.
  const branchSizes = [...new Set(pipeLines.map(p => pipeDescSize(p.desc)).filter(d => d >= 1.25))].sort((a, b) => a - b);
  const [branchCounts, setBranchCounts] = useState({});
  const branches = branchSizes.map(dia => ({ dia, count: branchCounts[dia] ?? 2 }));

  if (pipeLines.length === 0 && counted.terminals === 0) return null;

  const lines = hydronicValveLines({
    terminals: Number(terminals) || 0, terminalSize, terminalMode, controlValves,
    pumps: Number(pumps) || 0, pumpSize, branches,
    airVents: Number(airVents) || 0, drains: Number(drains) || 0,
  });
  const total = lines.reduce((s, l) => s + l.qty * l.defaultPrice, 0);

  function addValves() {
    const book = loadPriceBook();
    const newLines = lines.map(l => {
      const match = findPriceMatch(book, { desc: l.desc });
      const unitCost = match ? Number(match.entry.price) || 0 : (l.defaultPrice || 0);
      return {
        id: uid(), dgen: true, gen: 'valves',
        desc: l.desc, qty: l.qty, unitCost, total: l.qty * unitCost,
        notes: [l.notes, match ? '' : 'default price is a PLACEHOLDER — correct it once and the price book remembers'].filter(Boolean).join(' · '),
      };
    });
    dispatch({ type: 'SET', key: 'hvacParts',
      value: [...parts.filter(p => !(p.dgen && p.gen === 'valves')), ...newLines] });
    setAdded(true);
  }

  const num = (v, set) => (
    <Input type="number" value={v} onChange={e => { set(e.target.value); setAdded(false); }}
      style={{ width: 64, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
  );

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>🔧 Hydronic Valves & Specialties</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 12 }}>
        Valves are what make a hydronic system one you can balance, isolate and service — and they are the part a
        percentage allowance hides worst. Counts start from the equipment read off the plans and stay editable.
        <br />
        <strong style={{ color: colors.yellow }}>Every price here is a placeholder.</strong> Unlike the copper table,
        nobody has quoted these — correct one and the price book remembers it for good.
      </div>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Terminal units</span>
          {num(terminals, setTerminals)}
          <Select value={terminalSize} onChange={e => { setTerminalSize(Number(e.target.value)); setAdded(false); }} style={{ width: 80 }}>
            <option value={0.5}>1/2"</option><option value={0.75}>3/4"</option><option value={1}>1"</option>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Select value={terminalMode} onChange={e => { setTerminalMode(e.target.value); setAdded(false); }} style={{ width: 220 }}>
            <option value="hosekit">Hose kits (one assembly per unit)</option>
            <option value="valves">Loose valves (ball + balancing + P/T)</option>
          </Select>
        </div>
      </Row>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Control valves</span>
          <Select value={controlValves} onChange={e => { setControlValves(e.target.value); setAdded(false); }} style={{ width: 240 }}>
            <option value="byOthers">Furnished by controls — we install</option>
            <option value="ours">We furnish and install</option>
            <option value="none">Not in our scope at all</option>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Pumps</span>
          {num(pumps, setPumps)}
          <Select value={pumpSize} onChange={e => { setPumpSize(Number(e.target.value)); setAdded(false); }} style={{ width: 90 }}>
            {[1, 1.25, 1.5, 2, 2.5, 3, 4].map(d => <option key={d} value={d}>{d === 1.25 ? '1-1/4"' : d === 1.5 ? '1-1/2"' : d === 2.5 ? '2-1/2"' : `${d}"`}</option>)}
          </Select>
        </div>
      </Row>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Air vents (high points)</span>{num(airVents, setAirVents)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Drain valves (low points)</span>{num(drains, setDrains)}
        </div>
      </Row>

      {branchSizes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Branch / main isolation valves — count per size</div>
          <Row style={{ gap: 10, flexWrap: 'wrap' }}>
            {branchSizes.map(dia => (
              <div key={dia} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, color: colors.textDim, fontFamily: "'DM Mono', monospace" }}>
                  {dia === 1.25 ? '1-1/4"' : dia === 1.5 ? '1-1/2"' : dia === 2.5 ? '2-1/2"' : `${dia}"`}
                </span>
                <Input type="number" value={branchCounts[dia] ?? 2}
                  onChange={e => { setBranchCounts({ ...branchCounts, [dia]: parseInt(e.target.value, 10) || 0 }); setAdded(false); }}
                  style={{ width: 52, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
              </div>
            ))}
          </Row>
        </div>
      )}

      {lines.length > 0 && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          {lines.map((l, i) => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', fontSize: 12, borderBottom: i < lines.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{l.desc}</div>
                {l.notes && <div style={{ fontSize: 10, color: colors.textDim }}>{l.notes}</div>}
              </div>
              <div style={{ whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>
                {l.qty} × {fmt(l.defaultPrice)} = <strong style={{ color: colors.green }}>{fmt(l.qty * l.defaultPrice)}</strong>
              </div>
            </div>
          ))}
        </div>
      )}

      <Btn variant={added ? 'ghost' : 'green'} size="sm" onClick={addValves} disabled={!lines.length}>
        {added ? '✓ Added — click again to update' : `Add ${lines.length} valve line(s) — ${fmt(total)}`}
      </Btn>
    </Card>
  );
}

// ── DUCT PURCHASE CALCULATOR ───────────────────────────────────────────────────
// Duct isn't bought the way it's measured. The takeoff is in feet per size,
// but rectangular sheet metal is custom-fabricated and priced BY THE POUND,
// spiral comes in 10' joints, flex in 25' boxes, and wrap insulation by the
// ~100 sq ft roll. This card reads the "Ductwork — …" lines above (their Qty
// column = linear feet scaled off the plan), shows the conversion live, and
// one button adds the purchase lines — priced from the price book when it
// knows the item, industry-ballpark defaults otherwise (always editable, and
// edits are remembered).
function DuctCalculator() {
  const { state, dispatch } = useStore();
  const parts = state.hvacParts || [];
  const [wastePct, setWastePct] = useState(15);
  const [insulate, setInsulate] = useState('supply');
  const [added, setAdded] = useState(false);

  // Route through the classifier, not parseDuctDesc directly — a condensate
  // line labeled "round duct (drain)" parses as duct but is PIPING, and
  // converting it here would price drain pipe as pounds of sheet metal.
  const ductLines = parts.filter(p => !p.dgen && ['duct-rect', 'duct-round'].includes(partGroupOf(p)));
  if (ductLines.length === 0) return null;

  const runs = ductLines.map(p => ({ desc: p.desc, lf: Number(p.qty) || 0 }));
  const { lines } = ductPurchase(runs, { wastePct: Number(wastePct) || 0, insulate });
  const missingFootage = ductLines.filter(p => !(Number(p.qty) > 0));

  function addPurchaseLines() {
    const book = loadPriceBook();
    const newLines = lines.map(l => {
      const match = findPriceMatch(book, { desc: l.desc });
      const unitCost = match ? Number(match.entry.price) || 0 : (l.defaultPrice || 0);
      return {
        id: uid(), desc: `${l.desc}${l.notes ? ` (${l.notes})` : ''}`,
        qty: l.qty, unitCost, total: l.qty * unitCost, dgen: true, gen: 'duct',
      };
    });
    // Regenerating replaces the previously generated purchase lines, so
    // changing footage or options never stacks duplicates. Scoped to THIS
    // generator's lines — the hydronic fittings allowance is also `dgen`, and
    // wiping it here would make the two calculators delete each other's work.
    // Lines saved before `gen` existed were all duct, so they count as duct.
    dispatch({ type: 'SET', key: 'hvacParts',
      value: [...parts.filter(p => !(p.dgen && (p.gen || 'duct') === 'duct')), ...newLines] });
    setAdded(true);
  }

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>📐 Duct → Purchase Units</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 10 }}>
        Enter each Ductwork line's <strong>linear feet</strong> in its Qty box above (scale it off the plan), then convert here.
        Rectangular sheet metal is bought <strong>by the pound</strong> (fabricated — gauge set by duct size per SMACNA),
        spiral in 10' joints, flex in 25' boxes, wrap insulation by the roll. Leave the $ on the footage lines at 0 —
        the price belongs on the purchase lines this adds.
      </div>

      {missingFootage.length > 0 && (
        <div style={{ fontSize: 11, color: colors.yellow, marginBottom: 10 }}>
          ⚠ {missingFootage.length} duct line{missingFootage.length > 1 ? 's' : ''} still ha{missingFootage.length > 1 ? 've' : 's'} no footage entered — {missingFootage.map(p => (p.desc.match(/[\d"x×]+\s*(?:round|duct)?/i) || [p.desc])[0].trim()).join(', ')}
        </div>
      )}

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Waste/seams %</span>
          <Input type="number" value={wastePct} onChange={e => { setWastePct(e.target.value); setAdded(false); }} style={{ width: 60, textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Insulate</span>
          <Select value={insulate} onChange={e => { setInsulate(e.target.value); setAdded(false); }} style={{ width: 200 }}>
            <option value="supply">Supply + OA duct (typical)</option>
            <option value="all">All duct</option>
            <option value="none">None</option>
          </Select>
        </div>
      </Row>

      {lines.length === 0 ? (
        <div style={{ fontSize: 12, color: colors.textDim }}>Nothing to convert yet — enter footage on the duct lines above.</div>
      ) : (
        <>
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            {lines.map((l, i) => (
              <div key={l.desc} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: i < lines.length - 1 ? `1px solid ${colors.border}` : 'none', fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{l.desc}</div>
                  {l.notes && <div style={{ fontSize: 10, color: colors.textDim }}>{l.notes}</div>}
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, whiteSpace: 'nowrap' }}>{l.qty.toLocaleString()} {l.unit}</span>
              </div>
            ))}
          </div>
          <Row style={{ gap: 10, alignItems: 'center' }}>
            <Btn variant="green" size="sm" onClick={addPurchaseLines}>↓ Add purchase lines to Parts</Btn>
            {added && <span style={{ fontSize: 11, color: colors.green }}>✓ Added — prices came from your price book where known, industry ballpark otherwise. Edit any $ and MechBid remembers it.</span>}
          </Row>
        </>
      )}
    </Card>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function StepHVACEquipment({ onNext, onBack }) {
  const { state, dispatch } = useStore();
  const [supplierSearch, setSupplierSearch] = useState('');
  const [openEquipGroups, setOpenEquipGroups] = useState({}); // per-type expand state (grouped view)
  const supplier = state.preferredSupplier || 'RE Michel';

  const equipment = state.hvacEquipment || [];
  const parts = state.hvacParts || [];

  function addEquipment() {
    dispatch({
      type: 'SET', key: 'hvacEquipment', value: [...equipment, {
        id: uid(), type: 'Rooftop Unit (RTU)', tag: '', tons: '', brand: '', model: '',
        refrigerant: 'R-410A', mca: '', mop: '', voltage: '', location: '',
        cost: 0, task: 'New Installation', notes: '',
      }]
    });
  }

  function updateEquipment(id, field, value) {
    dispatch({
      type: 'SET', key: 'hvacEquipment', value: equipment.map(e =>
        e.id === id ? { ...e, [field]: field === 'cost' || field === 'mca' || field === 'mop' ? parseFloat(value) || 0 : value } : e
      )
    });
  }

  function removeEquipment(id) {
    dispatch({ type: 'SET', key: 'hvacEquipment', value: equipment.filter(e => e.id !== id) });
  }

  const equipTotal = equipment.reduce((s, e) => s + (e.cost || 0), 0);
  const partsTotal = parts.reduce((s, p) => s + (p.total || 0), 0);
  const markupPct = state.markupPct || 20;
  const markupBase = equipTotal + partsTotal;
  const markupAmt = markupBase * (markupPct / 100);

  // Equipment schedule summary for the header
  const unitCount = equipment.length;
  const totalTons = equipment.reduce((s, e) => {
    const match = String(e.tons || '').match(/[\d.]+/);
    return s + (match ? parseFloat(match[0]) : 0);
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary stats */}
      {equipment.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Units on Schedule', value: unitCount, color: colors.text },
            { label: 'Total Capacity', value: totalTons > 0 ? `${totalTons}T` : '—', color: colors.text },
            { label: 'Equipment Cost', value: fmt(equipTotal), color: colors.green },
          ].map(s => (
            <div key={s.label} style={{ background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier search */}
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <SLabel style={{ margin: 0 }}>🔍 Equipment Lookup</SLabel>
          <SupplierSwitcher compact value={supplier} onChange={s => dispatch({ type: 'SET', key: 'preferredSupplier', value: s })} />
        </Row>
        <Row style={{ gap: 8 }}>
          <Input
            value={supplierSearch}
            onChange={e => setSupplierSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchSupplier(supplierSearch, supplier)}
            placeholder={`Search ${supplier} for RTU, split system, AHU, part #...`}
            style={{ flex: 1 }}
          />
          <Btn variant="green" size="sm" onClick={() => searchSupplier(supplierSearch, supplier)}>Search</Btn>
        </Row>
      </Card>

      {/* Equipment schedule */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <SLabel>Equipment Schedule</SLabel>
            <div style={{ fontSize: 12, color: colors.textDim }}>Add each HVAC unit — RTUs, split systems, AHUs, fan coils</div>
          </div>
          <Btn variant="green" size="sm" onClick={addEquipment}>+ Add Unit</Btn>
        </Row>

        {equipment.length === 0 ? (
          <Card>
            <EmptyState
              icon="🌀"
              title="No equipment on schedule yet"
              subtitle="Add each HVAC unit to be installed or replaced — RTUs, split systems, AHUs, VAV boxes"
            />
          </Card>
        ) : equipment.length <= EQUIP_GROUP_THRESHOLD ? (
          equipment.map(e => (
            <EquipmentCard
              key={e.id}
              equip={e}
              onUpdate={(field, value) => updateEquipment(e.id, field, value)}
              onRemove={() => removeEquipment(e.id)}
              supplier={supplier}
            />
          ))
        ) : (
          groupEquipmentByType(equipment).map(g => {
            const open = openEquipGroups[g.type] ?? false;
            const priced = g.units.filter(u => (u.cost || 0) > 0).length;
            const subtotal = g.units.reduce((s, u) => s + (u.cost || 0), 0);
            return (
              <div key={g.type} style={{ marginBottom: 10 }}>
                <div
                  onClick={() => setOpenEquipGroups({ ...openEquipGroups, [g.type]: !open })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', userSelect: 'none', background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10 }}
                >
                  <span style={{ fontSize: 15 }}>🌀</span>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700 }}>{g.type}</span>
                  <span style={{ fontSize: 11, color: colors.textDim, fontFamily: "'DM Mono', monospace" }}>× {g.units.length}</span>
                  <span style={{ fontSize: 10, color: priced === g.units.length ? colors.green : colors.yellow, fontFamily: "'DM Mono', monospace" }}>
                    {priced}/{g.units.length} priced
                  </span>
                  <span style={{ flex: 1 }} />
                  {subtotal > 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colors.green }}>{fmt(subtotal)}</span>}
                  <span style={{ color: colors.textDim, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
                </div>
                {open && (
                  <div style={{ paddingLeft: 10, marginTop: 8 }}>
                    {g.units.map(e => (
                      <EquipmentCard
                        key={e.id}
                        equip={e}
                        onUpdate={(field, value) => updateEquipment(e.id, field, value)}
                        onRemove={() => removeEquipment(e.id)}
                        supplier={supplier}
                        startCollapsed
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Misc parts */}
      <MiscParts />

      {/* Duct footage → pounds / joints / rolls (only shows when duct lines exist) */}
      <DuctCalculator />
      <HydronicFittingsCalculator />
      <HydronicValveCalculator />

      {/* Split-system charge adder — run once per split/mini-split; each Add
          appends its own line to the parts table above. */}
      <ChargeAdderCalc
        onAdd={line => dispatch({ type: 'SET', key: 'hvacParts', value: [...parts, { id: uid(), ...line }] })}
      />

      {/* Markup summary */}
      {(equipTotal + partsTotal) > 0 && (
        <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <SLabel>Equipment Summary</SLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: colors.textDim }}>Markup %</span>
              <Input
                type="number"
                value={markupPct}
                onChange={e => dispatch({ type: 'SET', key: 'markupPct', value: parseFloat(e.target.value) || 20 })}
                style={{ width: 65, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}
              />
            </div>
          </Row>
          {[
            { label: 'Equipment Cost', value: fmt(equipTotal), color: colors.text },
            { label: 'Parts & Materials', value: fmt(partsTotal), color: colors.text },
            { label: `Markup (${markupPct}%)`, value: fmt(markupAmt), color: colors.green },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 13, color: colors.textDim }}>{row.label}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: row.color }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${colors.green}`, marginTop: 6 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>Equipment + Markup</span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(markupBase + markupAmt)}</span>
          </div>
        </Card>
      )}

      <Row style={{ justifyContent: 'space-between' }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Labor →</Btn>
      </Row>
    </div>
  );
}
