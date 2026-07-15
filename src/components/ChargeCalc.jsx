import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row } from './UI.jsx';
import { loadPriceBook, findPriceMatch } from './PriceBook.jsx';
import { CHARGE_OZ_PER_FT, CHARGE_REFRIGERANTS, estimateChargeAdder } from './refrigerant.js';

// ── SPLIT-SYSTEM CHARGE ADDER CALCULATOR ───────────────────────────────────────
// The residential/commercial-split version of the refrigerant question: the
// condenser's factory charge covers a standard lineset (usually 15 ft), and
// anything past that adds oz per foot of liquid line. Shared by the
// Residential HVAC page (pre-filled from the job's lineset fields) and the
// Commercial HVAC Equipment step (one row per split system, run it per unit).
//
// onAdd(line) receives { desc, qty (lbs), unitCost, total } — the caller
// appends it to its own parts list (resParts / hvacParts).
export default function ChargeAdderCalc({ defaultLiqSize = '3/8', defaultLengthFt = 0, onAdd }) {
  const [liqSize, setLiqSize] = useState(defaultLiqSize || '3/8');
  const [lengthFt, setLengthFt] = useState(defaultLengthFt || '');
  const [includedFt, setIncludedFt] = useState(15);
  const [refrigerant, setRefrigerant] = useState('R-410A');
  const [systems, setSystems] = useState(1);
  const [added, setAdded] = useState(false);

  const est = estimateChargeAdder({ liqSize, linesetFt: lengthFt, includedFt, refrigerant, systems });

  function addLine() {
    const desc = `${refrigerant.replace(' (service)', '')} charge adder — ${est.addOz} oz (${est.extraFt} ft over factory charge${systems > 1 ? `, ${systems} systems` : ''})`;
    const match = findPriceMatch(loadPriceBook(), { desc: `${refrigerant} refrigerant per lb` });
    const unitCost = match ? Number(match.entry.price) || 0 : (CHARGE_REFRIGERANTS[refrigerant]?.price || 0);
    const qty = Math.max(est.addLbs, 0.5); // never bill under half a pound — you open the jug either way
    onAdd({ desc, qty, unitCost, total: Math.round(qty * unitCost * 100) / 100 });
    setAdded(true);
  }

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>🧊 Refrigerant Charge Adder</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 12 }}>
        The condenser's factory charge covers a standard lineset (usually 15 ft). Past that, add refrigerant
        per foot of <strong>liquid line</strong> — the oz/ft comes from the line size (nameplate style: "add {est.ozPerFt || '0.6'} oz/ft over {includedFt} ft").
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Refrigerant</div>
          <Select value={refrigerant} onChange={e => { setRefrigerant(e.target.value); setAdded(false); }}>
            {Object.keys(CHARGE_REFRIGERANTS).map(r => <option key={r}>{r}</option>)}
          </Select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Liquid Line Size</div>
          <Select value={liqSize} onChange={e => { setLiqSize(e.target.value); setAdded(false); }}>
            {Object.keys(CHARGE_OZ_PER_FT).map(s => <option key={s} value={s}>{s}"</option>)}
          </Select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Lineset Length (ft)</div>
          <Input type="number" value={lengthFt} onChange={e => { setLengthFt(e.target.value); setAdded(false); }} placeholder="ft" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Factory Charge Covers (ft)</div>
          <Input type="number" value={includedFt} onChange={e => { setIncludedFt(e.target.value); setAdded(false); }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}># of Systems</div>
          <Input type="number" value={systems} onChange={e => { setSystems(e.target.value); setAdded(false); }} />
        </div>
      </div>

      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ fontSize: 13 }}>
          {est.extraFt > 0 ? (
            <>Add <strong style={{ color: colors.green }}>{est.addOz} oz ({est.addLbs} lbs)</strong> — {est.extraFt} ft over the factory charge × {est.ozPerFt} oz/ft</>
          ) : (
            <span style={{ color: colors.textDim }}>Lineset within the factory charge — no adder needed{Number(lengthFt) ? '' : ' (enter the lineset length)'}</span>
          )}
        </div>
        {est.extraFt > 0 && onAdd && (
          <Row style={{ gap: 10, alignItems: 'center' }}>
            <Btn variant="green" size="sm" onClick={addLine}>↓ Add to Parts</Btn>
            {added && <span style={{ fontSize: 11, color: colors.green }}>✓ Added — edit the $/lb once and MechBid remembers it</span>}
          </Row>
        )}
      </Row>
    </Card>
  );
}
