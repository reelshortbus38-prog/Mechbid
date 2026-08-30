import { describe, it, expect } from 'vitest';
import bc from './bprCircuit.js';

const { classifyBprRow } = bc;

// Every row below is real: FL_0701_WR_BPR1.xlsx, with the highlight state of
// each line-size cell read off the workbook. The estimator's own count for this
// job is TEN new circuits and ONE riser-only.
// appMarked is the Application cell's own fill, read off the workbook per row.
const ROWS_701 = [
  { id: 'Hdr1-1',  app: 'Deli Cooler',                horizMarked: false, riserMarked: false, appMarked: false, heatExchanger: 'NEW' },
  { id: 'Hdr1-2',  app: 'MD Fresh Meat 18,19,22',     horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr1-3',  app: 'MD Fresh Meat 23-25',        horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr1-5',  app: 'Meat Cooler',                horizMarked: false, riserMarked: false, appMarked: false, heatExchanger: 'NEW' },
  { id: 'Hdr1-6',  app: 'Tray Cooler',                horizMarked: false, riserMarked: false, appMarked: false, heatExchanger: 'NEW' },
  { id: 'Hdr1-9',  app: 'Lunch Meat N83-N85',         horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr1-11', app: 'Dairy Cooler',               horizMarked: false, riserMarked: false, appMarked: false, heatExchanger: 'NEW' },
  { id: 'Hdr1-12', app: 'Dairy Promo N86',            horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr1-15', app: 'Beer Doors 40-43, N87',      horizMarked: false, riserMarked: false, appMarked: true,  heatExchanger: '' },
  { id: 'Hdr2-19', app: 'Deli/Bakery 10-12, N72,N73', horizMarked: false, riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr2-20', app: 'Deli/Cheese N74-N77',        horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr2-21', app: 'HMS Islands N78,N79',        horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr2-22', app: 'Produce/Floral 1,2,N69',     horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr2-24', app: 'MD Produce 5-7',             horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'Hdr2-26', app: 'Produce Doors N70,N71',      horizMarked: false, riserMarked: false, appMarked: true,  heatExchanger: '' },
  { id: 'D-5',     app: 'Frozen Food 50,51',          horizMarked: false, riserMarked: false, appMarked: true,  heatExchanger: '' },
  { id: 'D-12',    app: 'Frozen Food 66,67',          horizMarked: false, riserMarked: false, appMarked: true,  heatExchanger: '' },
  { id: 'D-14',    app: 'Meat Promo N80-N82',         horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'D-15',    app: 'Frozen Ends 52,68',          horizMarked: true,  riserMarked: true,  appMarked: true,  heatExchanger: '' },
  { id: 'D-17',    app: 'Frozen Bakery 14',           horizMarked: false, riserMarked: false, appMarked: true,  heatExchanger: '' },
];

const classify = r => ({ ...r, ...classifyBprRow(r) });

describe('store 701 — the estimator says 10 new and 1 riser-only', () => {
  const out = ROWS_701.map(classify);
  const included = out.filter(r => r.include);

  it('takes eleven circuits, not fifteen', () => {
    expect(included).toHaveLength(11);
  });

  it('ten of them are new runs and one is riser-only', () => {
    expect(included.filter(r => !r.riserOnly)).toHaveLength(10);
    expect(included.filter(r => r.riserOnly)).toHaveLength(1);
  });

  it('the riser-only one is Deli/Bakery — riser marked, horizontals clear', () => {
    expect(included.find(r => r.riserOnly).app).toBe('Deli/Bakery 10-12, N72,N73');
  });

  it('excludes the four coolers whose heat exchanger is new but whose pipe is not', () => {
    const coils = out.filter(r => r.category === 'coilOnly').map(r => r.app);
    expect(coils).toEqual(['Deli Cooler', 'Meat Cooler', 'Tray Cooler', 'Dairy Cooler']);
  });

  it('reports the five rows marked as changed with no new copper', () => {
    // The tech marked the case columns and left the line sizes clean. Three of
    // these carry N-tags — N87, N70/N71 — which are NEW CASES on existing pipe.
    // Not a line run, but a case to set, connect, evacuate and charge, and it
    // must not leave the takeoff without a word.
    const marked = out.filter(r => r.category === 'markedNoCopper').map(r => r.app);
    expect(marked).toEqual([
      'Beer Doors 40-43, N87',
      'Produce Doors N70,N71',
      'Frozen Food 50,51',
      'Frozen Food 66,67',
      'Frozen Bakery 14',
    ]);
  });

  it('every row lands in exactly one category', () => {
    // 10 new + 1 riser-only + 4 coils + 5 marked = 20 rows, none unaccounted.
    const counts = out.reduce((m, r) => ({ ...m, [r.category]: (m[r.category] || 0) + 1 }), {});
    expect(counts).toEqual({ new: 10, riserOnly: 1, coilOnly: 4, markedNoCopper: 5 });
  });

  it('the four dropped ones are exactly the four the scope of work calls new coils', () => {
    // "NEW EVAPORATOR COILS IN TRAY COOLER AND MEAT COOLER" and
    // "NEW EVAPORATOR COILS IN DAIRY AND DELI COOLER" — an independent document
    // agreeing is what makes this a coil count and not a guess.
    const coils = out.filter(r => r.coilOnly).map(r => r.app).sort();
    expect(coils).toEqual(['Dairy Cooler', 'Deli Cooler', 'Meat Cooler', 'Tray Cooler']);
  });

  it('reports the coil rows rather than dropping them silently', () => {
    // They are real work — a coil and the labor to set it. A row that vanishes
    // without a word is how a bid loses scope.
    for (const r of out.filter(r => r.coilOnly)) {
      expect(r.reason).toMatch(/coil, not copper/);
    }
  });
});

describe('what the heat-exchanger column actually means', () => {
  it('a bare NEW is a new coil, not new copper', () => {
    expect(classifyBprRow({ heatExchanger: 'NEW' }).include).toBe(false);
    expect(classifyBprRow({ heatExchanger: 'New Coil' }).include).toBe(false);
  });

  it('but New Piping and New Circuit ARE new copper', () => {
    // Different techs mark new work differently; dropping the text signal
    // entirely would lose the ones that are real.
    expect(classifyBprRow({ heatExchanger: 'New Piping' }).include).toBe(true);
    expect(classifyBprRow({ heatExchanger: 'New Piping Line' }).include).toBe(true);
    expect(classifyBprRow({ heatExchanger: 'New Circuit' }).include).toBe(true);
    expect(classifyBprRow({ heatExchanger: 'New Install' }).include).toBe(true);
  });

  it('EXISTING and blank are neither', () => {
    expect(classifyBprRow({ heatExchanger: 'EXISTING' }).include).toBe(false);
    expect(classifyBprRow({ heatExchanger: 'EXISTING' }).coilOnly).toBeUndefined();
    expect(classifyBprRow({}).include).toBe(false);
    expect(classifyBprRow({}).category).toBe('none');
  });

  it('an unmarked EXISTING row is not reported at all — there is nothing to say', () => {
    expect(classifyBprRow({ heatExchanger: 'EXISTING', appMarked: false }).category).toBe('none');
  });

  it('highlighting beats the text — a marked row is new copper whatever the column says', () => {
    const r = classifyBprRow({ horizMarked: true, heatExchanger: 'NEW' });
    expect(r.include).toBe(true);
    expect(r.reason).toBe('highlighted');
  });
});

describe('riser-only', () => {
  it('is the riser marked with the horizontals clear', () => {
    expect(classifyBprRow({ riserMarked: true, horizMarked: false }).riserOnly).toBe(true);
  });

  it('is NOT riser-only when the horizontal is marked too', () => {
    expect(classifyBprRow({ riserMarked: true, horizMarked: true }).riserOnly).toBe(false);
  });

  it('is not riser-only when only the horizontal is marked', () => {
    const r = classifyBprRow({ horizMarked: true, riserMarked: false });
    expect(r.include).toBe(true);
    expect(r.riserOnly).toBe(false);
  });
});

describe('a new store takes everything', () => {
  it('includes every row without needing a mark', () => {
    const r = classifyBprRow({ allNew: true, heatExchanger: 'EXISTING' });
    expect(r.include).toBe(true);
    expect(r.riserOnly).toBe(false);
  });

  it('does not call anything riser-only on a new store', () => {
    // Nothing is pre-existing, so nothing is a drop off existing pipe.
    expect(classifyBprRow({ allNew: true, riserMarked: true }).riserOnly).toBe(false);
  });
});
