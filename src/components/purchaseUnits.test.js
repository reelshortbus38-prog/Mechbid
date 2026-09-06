import { describe, it, expect } from 'vitest';
import { unitFor, rowUnit, commonUnit, PURCHASE_UNITS } from './purchaseUnits.js';
import { ductPurchase } from './ductwork.js';
import { hydronicValveLines } from './hydronicValves.js';
import { glycolMaterialLines } from './glycolSystem.js';
import { defaultHvacPrice, defaultHvacPriceUnit, defaultHvacPriceFor } from '../state/store.js';

// ── WHAT THE QTY COLUMN MEANS ───────────────────────────────────────────────
// The refrigeration table has always had a Unit column and its generators have
// always filled it. The HVAC table had neither, so a materials list read:
//
//   Galvanized rectangular duct, 24 ga — fabricated        412
//   Spiral round duct, 14" dia                              45
//   S-1 — Supply diffuser · 24x24 face                       3
//
// Pounds, feet, and each — same column, no way to tell. These tests pin the
// answer for every line the app can generate.

describe('the lines this app writes about itself', () => {
  it('reads fabricated rectangular duct as pounds', () => {
    // The one that costs real money to get wrong: sheet metal is bought by
    // weight, and at ~$4.50/lb a 400-lb line read as 400 EACH is a $1,800 item
    // that looks like a $1,800 mistake.
    expect(unitFor('Galvanized rectangular duct, 24 ga — fabricated')).toBe('lb');
  });

  it('reads spiral, flex and wrap the way they are ordered', () => {
    expect(unitFor('Spiral round duct, 14" dia')).toBe('ft');
    expect(unitFor("Flex duct — 25' boxes")).toBe('box');
    expect(unitFor('Duct wrap insulation, 1-1/2" FSK — 100 sq ft rolls')).toBe('roll');
  });

  it('reads takeoff runs as footage', () => {
    expect(unitFor('Ductwork — 20x12 duct (supply)')).toBe('ft');
    expect(unitFor('Ductwork — 14" round duct (return)')).toBe('ft');
    expect(unitFor('Ductwork — SIZE NEEDED')).toBe('ft');
    expect(unitFor('Pipe — 2" CHWS')).toBe('ft');
    expect(unitFor('Pipe — SIZE NEEDED')).toBe('ft');
  });

  it('reads a linear diffuser as feet of device, not each and not sheet metal', () => {
    // Tagged "204x4" like a duct size, which is how it got priced as duct in
    // the first place. Both wrong answers are available here and it takes
    // neither.
    expect(unitFor('Linear slot diffuser or grille — 204x4 face (supply)')).toBe('ft');
  });

  it('reads a percentage allowance as one lot', () => {
    expect(unitFor('Hydronic fittings, joints & hangers — 40% of pipe material (valves NOT included)')).toBe('lot');
    expect(unitFor('Fittings Allowance (8% of copper)')).toBe('lot');
  });

  it('counts air devices and terminal boxes', () => {
    expect(unitFor('S-1 — Supply diffuser · 24x24 face · 8" neck')).toBe('ea');
    expect(unitFor('VAV Box · 8" inlet · Titus DESV')).toBe('ea');
    expect(unitFor('Ball valve, 1-1/4" — branch/main isolation')).toBe('ea');
  });
});

describe('words that look like other words', () => {
  it('does not read a duct smoke detector as duct', () => {
    // The reason the ductwork rule is anchored to the front of the string. A
    // loose \bduct\b would price this by the foot.
    expect(unitFor('Duct smoke detector')).toBe('ea');
  });

  it('does not read duct connections and transitions as duct', () => {
    expect(unitFor('Duct connection / flex / transitions')).toBe('lot');
  });

  it('does not read refrigerant OIL by the pound', () => {
    // POE comes in a jug. "Refrigerant Oil" trips the refrigerant rule unless
    // the oil rule sits above it, which is the only reason it does.
    expect(unitFor('Refrigerant Oil — verify POE grade')).toBe('gal');
    expect(unitFor('Refrigerant — verify type (R-448A / R-407A) & charge by lb')).toBe('lb');
  });

  it('does not read refrigerant LINE insulation by the pound', () => {
    expect(unitFor('Refrigerant line insulation')).toBe('ft');
  });
});

describe('the quick-add chips on the HVAC parts table', () => {
  // These descriptions are fixed strings in StepHVACEquipment. Every one of
  // them is stamped with unitFor() at add time, so this table is what the
  // estimator will actually see.
  const CHIPS = [
    ['Curb adapter', 'ea'],
    ['Roof curb / rails', 'ea'],
    ['Crane / rigging', 'day'],           // a second day doubles it — not "1 ea"
    ['Disconnect & whip', 'ea'],
    ['Programmable / BMS thermostat', 'ea'],
    ['Economizer', 'ea'],
    ['Low-ambient kit', 'ea'],
    ['Hail guards', 'set'],
    ['Condensate trap & drain (PVC)', 'ea'],
    ['Duct smoke detector', 'ea'],
    ['Vibration isolation', 'set'],
    ['Filter rack & filters', 'ea'],
    ['Duct connection / flex / transitions', 'lot'],
    ['Refrigerant (R-410A / R-454B) by lb', 'lb'],
    ['Lineset (split)', 'set'],
    ['Refrigerant line insulation', 'ft'],
  ];
  it.each(CHIPS)('%s is bought by the %s', (desc, unit) => {
    expect(unitFor(desc)).toBe(unit);
  });

  it('only ever produces units the dropdown offers', () => {
    // Otherwise the row's <select> would silently widen itself for a unit
    // nobody chose.
    for (const [desc] of CHIPS) expect(PURCHASE_UNITS).toContain(unitFor(desc));
  });

  it('still gets its default price after the unit gate', () => {
    // addNamed() now asks for the price IN the chip's unit, so a chip whose
    // unit and whose price basis drifted apart would start adding $0 lines
    // instead of loudly failing. This is the alarm for that.
    for (const [desc] of CHIPS) {
      expect(defaultHvacPriceFor(desc, unitFor(desc)), `${desc} lost its default price`)
        .toBe(defaultHvacPrice(desc));
      expect(defaultHvacPrice(desc), `${desc} has no default price at all`).toBeGreaterThan(0);
    }
  });
});

// ── PRICES QUOTED IN ONE UNIT, QUANTITIES MEASURED IN ANOTHER ───────────────
// Both of these were live. Neither showed up as an error; they showed up as a
// line that looked priced.
describe('a default price is only used when it is quoted in the row\'s unit', () => {
  it('does not price a flex-duct TAKEOFF line at the price of a 25-foot box', () => {
    // "Ductwork — 8\" flex duct" carries linear feet. $95 buys 25 of them.
    // Sixty feet was being filled at 60 × $95 = $5,700 — and the Duct →
    // Purchase card then added the three real boxes at $285 beside it.
    const desc = 'Ductwork — 8" flex duct (supply)';
    expect(defaultHvacPrice(desc)).toBe(95);
    expect(defaultHvacPriceUnit(desc)).toBe('box');
    expect(unitFor(desc)).toBe('ft');
    expect(defaultHvacPriceFor(desc, 'ft')).toBe(0);
    // The purchase line the calculator generates DOES get it — that one is
    // counted in boxes.
    expect(defaultHvacPriceFor("Flex duct — 25' boxes", 'box')).toBe(95);
  });

  it('does not price a linear diffuser per each when its quantity is feet', () => {
    // The device is tagged "204x4" and staged at 17 ft, because 204 inches is
    // how long it is. A per-each price against that is one diffuser billed
    // seventeen times.
    const desc = 'Linear slot diffuser or grille — 204x4 face (supply)';
    expect(unitFor(desc)).toBe('ft');
    expect(defaultHvacPriceUnit(desc)).toBe('ft');
    expect(defaultHvacPriceFor(desc, 'ft')).toBeGreaterThan(0);
    // A round ceiling diffuser is still each, and still priced each.
    expect(defaultHvacPriceFor('CD-1 — Ceiling Diffuser · 24x24 face', 'ea')).toBe(55);
  });

  it('leaves duct FOOTAGE lines unpriced, which was always the intent', () => {
    // The Duct → Purchase card prices these. They stay at $0 so the pounds
    // and the feet are never both in the total.
    for (const d of ['Ductwork — 21x13 duct (supply)', 'Ductwork — 14" round duct (return)']) {
      expect(defaultHvacPriceFor(d, unitFor(d))).toBe(0);
    }
  });

  it('fills normally when the units agree', () => {
    expect(defaultHvacPriceFor('Galvanized rectangular duct, 24 ga — fabricated', 'lb')).toBe(4.5);
    expect(defaultHvacPriceFor('Spiral round duct, 14" dia', 'ft')).toBe(9);
    expect(defaultHvacPriceFor('Duct wrap insulation, 1-1/2" FSK — 100 sq ft rolls', 'roll')).toBe(115);
    expect(defaultHvacPriceFor('Pipe — 3/4" HWR', 'ft')).toBe(9);
  });

  it('does not block a fill when the row has no unit to check against', () => {
    // A row from before the field existed still gets its default rather than
    // silently going to zero.
    expect(defaultHvacPriceFor('Curb adapter', '')).toBe(450);
  });
});

describe('rowUnit', () => {
  it('prefers what the row carries over what the description implies', () => {
    // A shop that buys hail guards one at a time changes the dropdown once and
    // the guess never comes back.
    expect(rowUnit({ desc: 'Hail guards', unit: 'ea' })).toBe('ea');
  });

  it('falls back to the description for a row saved before the field existed', () => {
    expect(rowUnit({ desc: 'Galvanized rectangular duct, 22 ga — fabricated' })).toBe('lb');
    expect(rowUnit({ desc: 'Ductwork — 24x12 duct' })).toBe('ft');
  });

  it('treats an empty unit as absent, not as a chosen blank', () => {
    expect(rowUnit({ desc: 'Pipe — 3/4" HWS', unit: '' })).toBe('ft');
    expect(rowUnit({ desc: 'Pipe — 3/4" HWS', unit: '   ' })).toBe('ft');
  });

  it('keeps a unit that is not in the standard list', () => {
    // An import or a shop with its own wording. Rewriting it to the nearest
    // standard unit would be editing somebody's estimate to tidy a dropdown.
    expect(rowUnit({ desc: 'Sealant', unit: 'case' })).toBe('case');
  });
});

describe('commonUnit — what a collapsed section header may claim', () => {
  it('names the unit when every line agrees', () => {
    expect(commonUnit([
      { desc: 'Ductwork — 20x12 duct', unit: 'ft' },
      { desc: 'Ductwork — 18x10 duct', unit: 'ft' },
    ])).toBe('ft');
  });

  it('says nothing when the section is mixed', () => {
    // This is the duct PURCHASE section: pounds, feet, boxes and rolls in one
    // list. Summing them and labelling the total with any one unit would be a
    // number that means nothing.
    expect(commonUnit([
      { desc: 'Galvanized rectangular duct, 24 ga — fabricated', unit: 'lb' },
      { desc: 'Spiral round duct, 14" dia', unit: 'ft' },
      { desc: "Flex duct — 25' boxes", unit: 'box' },
    ])).toBe('');
  });

  it('is empty for no lines at all', () => {
    expect(commonUnit([])).toBe('');
  });
});

// ── THE GENERATORS AGREE WITH THE RESOLVER ──────────────────────────────────
// Every unit these three produce also has to be one the resolver would reach on
// its own, because a job saved before the row carried a unit is read back
// through the resolver. If they ever disagree, an old job and a new one show
// different units for the same line.
describe('generated lines round-trip through unitFor', () => {
  it('duct purchase lines', () => {
    const { lines } = ductPurchase([
      { desc: 'Ductwork — 24x12 duct (supply)', lf: 120 },
      { desc: 'Ductwork — 14" round duct (supply)', lf: 80 },
      { desc: 'Ductwork — 8" flex duct', lf: 60 },
    ], { wastePct: 15, insulate: 'supply' });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(PURCHASE_UNITS).toContain(l.unit);
      expect(unitFor(`${l.desc}${l.notes ? ` (${l.notes})` : ''}`)).toBe(l.unit);
    }
  });

  it('hydronic valve lines', () => {
    const lines = hydronicValveLines({
      terminals: 4, terminalSize: 0.75, terminalMode: 'hosekit', controlValves: 'byOthers',
      pumps: 2, pumpSize: 1.5, branches: [{ dia: 2, count: 2 }], airVents: 3, drains: 2,
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.unit).toBe('ea');
      expect(unitFor(l.desc)).toBe('ea');
    }
  });
});

describe('glycol lines already carried their units and still resolve', () => {
  it('agrees with the resolver on every line it makes', () => {
    const lines = glycolMaterialLines({
      fixtures: 6, pipeBySize: { '1-1/2': 200 }, headerSize: 2, fixtureSize: 0.75,
      charge: { concentrateGal: 40, waterGal: 40 }, insulate: true,
    });
    for (const l of lines) {
      if (!l.unit) continue;
      expect(PURCHASE_UNITS).toContain(l.unit);
    }
  });
});
