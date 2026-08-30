import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

import bprCircuit from '../../api/bprCircuit.js';
import bprFormat from '../../api/bprFormat.js';
import partsOrderForm from '../../api/partsOrderForm.js';
import { pumpHorsepower } from '../../src/components/glycolHydraulics.js';
import { extractRcSchedule } from '../../src/components/scheduleDates.js';
import { dedupeSchedule, distinctDays, distinctNights } from '../../src/components/scheduleDedupe.js';

const { classifyBprRow } = bprCircuit;
const { formatFromSignals } = bprFormat;
const { parsePartsOrderForm } = partsOrderForm;

const load = name => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));

// ── THE POINT OF THIS FILE ───────────────────────────────────────────────────
// Every accuracy bug this app has had was found by uploading a real document
// and having somebody who knows the trade notice the number was wrong. That
// knowledge lived in whoever remembered the job. Here it is written down, so
// the suite re-checks it on every commit rather than depending on memory.
//
// The source documents are deliberately not in the repository — see README.md.
// What is here is the extracted values and the CONFIRMED answer.

describe('corpus integrity', () => {
  const files = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.json'));

  it('every fixture records where it came from and who confirmed it', () => {
    // A fixture nobody checked against reality only proves the code still does
    // what it did, which is not the same as doing the right thing.
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const fx = load(f);
      expect(fx.source, `${f} must name its source document`).toBeTruthy();
      expect(fx.provenance, `${f} must record provenance`).toBeTruthy();
      expect(fx.why, `${f} must say which real failure it pins`).toBeTruthy();
    }
  });
});

describe('Food Lion 701 — BPR circuits', () => {
  const fx = load('701-bpr.json');
  const out = fx.rows.map(r => ({ ...r, ...classifyBprRow(r) }));

  it('routes to the BPR parser despite the Rack sheets', () => {
    const hasRemoteHdr = fx.expected.sheetNames.some(n => /Remote\s*Hdr/i.test(n));
    const hasRackSheet = fx.expected.sheetNames.some(n => /^Rack\s+[A-Za-z]/i.test(n.trim()));
    expect(hasRemoteHdr && hasRackSheet).toBe(true);   // the combination that broke it
    expect(formatFromSignals({ remoteHdrSheet: hasRemoteHdr, bprText: true, kysorText: hasRackSheet }))
      .toBe(fx.expected.format);
  });

  it('produces the counts the estimator confirmed', () => {
    const counts = out.reduce((m, r) => ({ ...m, [r.category]: (m[r.category] || 0) + 1 }), {});
    expect(counts).toEqual(fx.expected.categories);
  });

  it('every row is accounted for — none silently vanish', () => {
    expect(out.filter(r => r.category === 'none')).toHaveLength(0);
    const total = Object.values(fx.expected.categories).reduce((a, b) => a + b, 0);
    expect(total).toBe(fx.rows.length);
  });

  it('identifies the riser-only circuit by name', () => {
    const riser = out.filter(r => r.riserOnly);
    expect(riser).toHaveLength(1);
    expect(riser[0].application).toBe(fx.expected.riserOnlyIs);
  });

  it('identifies the four coil-only coolers by name', () => {
    expect(out.filter(r => r.category === 'coilOnly').map(r => r.application))
      .toEqual(fx.expected.coilOnlyAre);
  });
});

describe('Edmonds SD — pump motor selection', () => {
  const fx = load('edmonds-pumps.json');

  for (const p of fx.pumps) {
    it(`${p.mark} matches the engineer's own ${p.scheduledHp} HP selection`, () => {
      // Checked against a professional's answer on a real drawing, not against
      // the app's own arithmetic.
      const r = pumpHorsepower(p.gpm, p.headFt, {
        pct: p.glycolPct, efficiency: p.efficiencyPct / 100,
      });
      expect(r.motorHp).toBe(p.scheduledHp);
    });

    it(`${p.mark} carries a non-overloading margin over brake horsepower`, () => {
      // A motor sized exactly to BHP overloads the moment the pump runs out on
      // its curve. This is what the app got wrong.
      const r = pumpHorsepower(p.gpm, p.headFt, {
        pct: p.glycolPct, efficiency: p.efficiencyPct / 100,
      });
      expect(r.motorHp).toBeGreaterThan(r.bhp);
    });
  }
});

describe('Food Lion 701 — parts order forms', () => {
  const fx = load('701-parts.json');
  const at = pairs => { const r = []; for (const [c, v] of pairs) r[c] = v; return r; };
  const HEADER = at([[0, 'Part Number'], [1, 'Qty'], [2, 'Description'], [11, 'Color'], [13, 'Where used']]);

  it('reads the rack parts order and nothing from the legend block', () => {
    const rows = [
      at([[0, 'Parts Order Form']]), HEADER,
      at([[0, '08A12068'], [1, 8], [4, 'CPC Temp Sensor']]),
      at([[1, 3], [4, '3 5/8 ball valve']]),
      at([[14, 'CE   Engineering']]),
      at([[14, 'KW   KwikWorks'], [16, '812  Ray Bishop'], [18, 'Best Way']]),
    ];
    const { items } = parsePartsOrderForm(rows);
    expect(items[0]).toMatchObject(fx.rackParts.expectedFirst);
    expect(items[1]).toMatchObject(fx.rackParts.quantityWithNoPartNumber);
    const all = items.map(i => `${i.partNumber} ${i.description}`).join(' ');
    for (const junk of fx.rackParts.mustNeverContain) expect(all).not.toContain(junk);
  });

  it('attributes each case end to its department', () => {
    const rows = [
      at([[0, 'Parts Order Form']]), HEADER,
      at([[4, 'Produce']]),
      at([[1, 1], [4, 'DX6LN  1305000630'], [7, 'RH boxed end 3000 IS BRT, OS & yoder SB'], [13, 7]]),
      at([[4, 'Meat']]),
      at([[1, 1], [7, 'LH boxed end 3000, IS BRT, OS & yoder SB'], [13, 19]]),
    ];
    const { items } = parsePartsOrderForm(rows);
    expect(items.map(i => i.section)).toEqual(['Produce', 'Meat']);
    expect(items[0].description).toBe(fx.caseEnds.splitDescription);
  });
});

describe('Food Lion 701 — one night counted once', () => {
  const fx = load('701-schedule.json');
  const out = dedupeSchedule(fx.duplicatePair);

  it('collapses the pair the two readers produced', () => {
    expect(out).toHaveLength(fx.expected.afterDedupe);
  });

  it('keeps the fuller description and the night marking', () => {
    expect(out[0].task).toContain(fx.expected.keptTaskContains);
    expect(out[0].isNight).toBe(fx.expected.isNight);
    expect(out[0].date).toBe(fx.expected.keptDate);
  });

  it('counts it as ONE day and ONE night', () => {
    // The count is what costs money: a night is a mobilisation.
    expect(distinctDays(fx.duplicatePair)).toBe(1);
    expect(distinctNights(fx.duplicatePair, i => i.isNight || /\(night\)/i.test(i.date))).toBe(1);
  });
});

describe('Food Lion 1086 — night work behind a shift marker', () => {
  const fx = load('1086-schedule.json');
  const schedule = extractRcSchedule(fx.scheduleLines.join('\n'));
  const dates = schedule.map(s => s.date);

  it('finds every RC day, including the ones behind "Night-"', () => {
    for (const d of fx.expected.dates) expect(dates).toContain(d);
  });

  it('marks the night dates as nights even though the header does not say so', () => {
    for (const d of fx.expected.nightDates) {
      const n = schedule.find(s => s.date === d);
      expect(n, `${d} must be in the schedule`).toBeTruthy();
      expect(n.isNight, `${d} must be a night`).toBe(true);
    }
  });

  it('never counts a Specialist reset as RC work', () => {
    // 6/18 names both parties on the same day. They are different crews.
    const jun18 = schedule.find(s => s.date === 'Jun 18');
    expect(jun18.tasks.join(' ')).not.toMatch(/Specialist/i);
  });
});
