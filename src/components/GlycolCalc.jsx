import { useState } from 'react';
import { useStore, uid, fmt } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row } from '../components/UI.jsx';
import { pipeMaterialPrice } from './pipePricing.js';
import {
  glycolMaterialLines, systemVolumeGal, glycolCharge, checkMix, pgFreezePoint,
} from './glycolSystem.js';

// ── SECONDARY GLYCOL LOOP CALCULATOR ─────────────────────────────────────────
// A secondary system's materials do not come out of the circuit table the way a
// DX job's copper does — there is no suction or liquid line per case. What
// there IS: a header out to the floor and back, insulation on every foot of it,
// a valve set at each case, and several hundred gallons of fluid that no
// copper-and-fittings takeoff has anywhere to put.
//
// Fixture count seeds from the medium-temp circuits already entered, because on
// a secondary job that is exactly what a circuit is — one case or walk-in coil
// hanging off the loop.

const SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const label = d => (d === 0.5 ? '1/2"' : d === 0.75 ? '3/4"' : d === 1.25 ? '1-1/4"' : d === 1.5 ? '1-1/2"' : d === 2.5 ? '2-1/2"' : `${d}"`);

export default function GlycolCalc() {
  const { state, dispatch } = useStore();
  const items = state.lineItems || [];
  const circuits = state.circuits || [];
  const medTemp = circuits.filter(c => (c.tempType || 'medium') === 'medium').length;

  const [runs, setRuns] = useState([{ dia: 3, ft: 0 }, { dia: 2, ft: 0 }, { dia: 1, ft: 0 }, { dia: 0.75, ft: 0 }]);
  const [material, setMaterial] = useState('copper');
  const [pct, setPct] = useState(32);
  const [protectTo, setProtectTo] = useState(15);
  const [coilGal, setCoilGal] = useState(0);
  const [tankGal, setTankGal] = useState(0);
  const [fixtures, setFixtures] = useState(medTemp);
  const [fixtureSize, setFixtureSize] = useState(0.75);
  const [added, setAdded] = useState(false);

  const sized = runs.filter(r => Number(r.ft) > 0);
  const headerSize = sized.length ? Math.max(...sized.map(r => Number(r.dia))) : 2;
  const vol = systemVolumeGal(sized, { material, coilGal: Number(coilGal) || 0, tankGal: Number(tankGal) || 0 });
  const charge = glycolCharge(vol.totalGal, pct);
  const mix = checkMix(pct, protectTo);

  const lines = glycolMaterialLines({
    runs: sized, material, pct,
    coilGal: Number(coilGal) || 0, tankGal: Number(tankGal) || 0,
    fixtures: Number(fixtures) || 0, fixtureSize, headerSize,
  }).map(l => {
    // Copper is priced by the shared table — the one scaled off the estimator's
    // own 3/4" quote — rather than a second number that could drift from it.
    if (l.priceFromCopperTable) {
      const hit = pipeMaterialPrice(l.priceFromCopperTable);
      return { ...l, defaultPrice: hit ? hit.pricePerFt : 0 };
    }
    return l;
  });
  const total = lines.reduce((s, l) => s + l.qty * (l.defaultPrice || 0), 0);

  const setRun = (i, field, v) => {
    setRuns(runs.map((r, j) => (j === i ? { ...r, [field]: field === 'dia' ? Number(v) : v } : r)));
    setAdded(false);
  };

  function addLines() {
    const newItems = lines.map(l => ({
      id: uid(), gen: 'glycol', section: l.section,
      desc: l.desc, qty: l.qty, unit: l.unit,
      unitCost: l.defaultPrice || 0, total: l.qty * (l.defaultPrice || 0),
      notes: [l.notes, 'default price is a PLACEHOLDER — correct it once and the price book remembers'].filter(Boolean).join(' · '),
    }));
    dispatch({ type: 'SET', key: 'lineItems', value: [...items.filter(p => p.gen !== 'glycol'), ...newItems] });
    setAdded(true);
  }

  const num = (v, set, w = 70) => (
    <Input type="number" value={v} onChange={e => { set(e.target.value); setAdded(false); }}
      style={{ width: w, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
  );

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>🧊 Secondary Glycol Loop</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 12 }}>
        A secondary loop has no suction or liquid line per case, so none of it comes out of the circuit table.
        What it does have: header out and back, <strong>insulation on every foot</strong>, a valve set at each case,
        and <strong>several hundred gallons of fluid</strong> that a copper takeoff has nowhere to put.
        <br />
        <strong style={{ color: colors.yellow }}>Prices here are placeholders</strong> except the copper, which uses
        the same table as the HVAC side. Correct one and the price book keeps it.
      </div>

      {/* ── Pipe runs ── */}
      <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Pipe runs — supply + return, as taken off</div>
      <div style={{ marginBottom: 12 }}>
        {runs.map((r, i) => (
          <Row key={i} style={{ gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <Select value={r.dia} onChange={e => setRun(i, 'dia', e.target.value)} style={{ width: 100 }}>
              {SIZES.map(d => <option key={d} value={d}>{label(d)}</option>)}
            </Select>
            <Input type="number" value={r.ft} onChange={e => setRun(i, 'ft', e.target.value)}
              placeholder="ft" style={{ width: 90, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
            <span style={{ fontSize: 11, color: colors.textDim }}>ft</span>
            {runs.length > 1 && (
              <button onClick={() => { setRuns(runs.filter((_, j) => j !== i)); setAdded(false); }}
                style={{ background: 'transparent', border: 'none', color: colors.red, cursor: 'pointer', fontSize: 14 }}>×</button>
            )}
          </Row>
        ))}
        <Btn variant="ghost" size="sm" onClick={() => { setRuns([...runs, { dia: 1, ft: 0 }]); setAdded(false); }}>+ Add size</Btn>
      </div>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Material</span>
          <Select value={material} onChange={e => { setMaterial(e.target.value); setAdded(false); }} style={{ width: 150 }}>
            <option value="copper">Type L copper</option>
            <option value="pvc80">Schedule 80 PVC</option>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Coils + barrel hold</span>{num(coilGal, setCoilGal)}
          <span style={{ fontSize: 11, color: colors.textDim }}>gal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Tank</span>{num(tankGal, setTankGal)}
          <span style={{ fontSize: 11, color: colors.textDim }}>gal</span>
        </div>
      </Row>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Glycol %</span>{num(pct, setPct, 60)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Protect to</span>{num(protectTo, setProtectTo, 60)}
          <span style={{ fontSize: 11, color: colors.textDim }}>°F</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Cases / walk-in coils</span>{num(fixtures, setFixtures)}
          <Select value={fixtureSize} onChange={e => { setFixtureSize(Number(e.target.value)); setAdded(false); }} style={{ width: 84 }}>
            {[0.5, 0.75, 1].map(d => <option key={d} value={d}>{label(d)}</option>)}
          </Select>
        </div>
      </Row>

      {medTemp > 0 && Number(fixtures) !== medTemp && (
        <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>
          {medTemp} medium-temp circuit(s) entered —{' '}
          <button onClick={() => { setFixtures(medTemp); setAdded(false); }}
            style={{ background: 'transparent', border: 'none', color: colors.blue, cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
            use that count
          </button>
        </div>
      )}

      {/* ── Mix check ── */}
      {mix && (
        <div style={{ fontSize: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8,
          background: mix.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${(mix.ok ? colors.green : colors.red)}40`,
          color: mix.ok ? colors.textDim : colors.red }}>
          {pct}% propylene glycol freezes at <strong>{pgFreezePoint(pct)}°F</strong> —{' '}
          {mix.ok
            ? <>clears {protectTo}°F by {mix.margin}°F. Over-mixing costs twice: more glycol, and more pump horsepower for the same load.</>
            : <><strong>SHORT of {protectTo}°F by {Math.abs(mix.margin)}°F.</strong> Raise the concentration.</>}
          <br />
          <span style={{ fontSize: 11 }}>Burst protection is a lower, separate curve — read it off the drum rather than assuming it.</span>
        </div>
      )}

      {vol.totalGal > 0 && (
        <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 10, fontFamily: "'DM Mono', monospace" }}>
          System holds ~{vol.totalGal} gal ({vol.pipeGal} pipe · {vol.coilGal} coils · {vol.tankGal} tank) →{' '}
          <strong style={{ color: colors.green }}>{charge.concentrateGal} gal</strong> concentrate +{' '}
          <strong style={{ color: colors.green }}>{charge.waterGal} gal</strong> demineralized water
        </div>
      )}

      {lines.length > 0 && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          {lines.map((l, i) => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', fontSize: 12,
              borderBottom: i < lines.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{l.desc}</div>
                {l.notes && <div style={{ fontSize: 10, color: colors.textDim }}>{l.notes}</div>}
              </div>
              <div style={{ whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>
                {l.qty} {l.unit} × {fmt(l.defaultPrice || 0)} ={' '}
                <strong style={{ color: colors.green }}>{fmt(l.qty * (l.defaultPrice || 0))}</strong>
              </div>
            </div>
          ))}
        </div>
      )}

      <Btn variant={added ? 'ghost' : 'green'} size="sm" onClick={addLines} disabled={!lines.length}>
        {added ? '✓ Added — click again to update' : `Add ${lines.length} glycol line(s) — ${fmt(total)}`}
      </Btn>
    </Card>
  );
}
