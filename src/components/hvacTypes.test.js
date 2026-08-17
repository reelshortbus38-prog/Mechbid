import { describe, it, expect } from 'vitest';
import { mapHvacType } from './hvacTypes.js';

// The data-center / central-plant tags are the subtle part — CRAC vs CRAH must
// not collapse into the generic condenser/split rules, and pump variants must
// route right. These guard that mapping against a future edit reordering rules.
describe('mapHvacType — data center / central plant', () => {
  it('separates CRAC (DX) from CRAH (chilled water)', () => {
    expect(mapHvacType('CRAC-1')).toBe('CRAC Unit (DX)');
    expect(mapHvacType('CRAH-4 (chilled water)')).toBe('CRAH Unit (Chilled Water)');
    // CRAC must NOT fall through to the generic /ac-/ condenser rule
    expect(mapHvacType('CRAC-2')).not.toBe('Split System — Condenser');
  });

  it('maps chillers by heat-rejection type when stated', () => {
    expect(mapHvacType('Water-Cooled Chiller CH-1')).toBe('Chiller — Water-Cooled');
    expect(mapHvacType('Air-Cooled Chiller')).toBe('Chiller — Air-Cooled');
    expect(mapHvacType('CH-3')).toBe('Chiller'); // unqualified stays generic
  });

  it('routes pumps and heat-rejection gear', () => {
    expect(mapHvacType('CHWP-1')).toBe('Chilled Water Pump');
    expect(mapHvacType('Condenser Water Pump')).toBe('Condenser Water Pump');
    expect(mapHvacType('CT-2')).toBe('Cooling Tower');
    expect(mapHvacType('Dry Cooler')).toBe('Dry Cooler / Fluid Cooler');
    expect(mapHvacType('CDU-5')).toBe('Coolant Distribution Unit (CDU)');
    expect(mapHvacType('RDHx rear-door')).toBe('Rear-Door Heat Exchanger');
  });

  it('still maps the comfort-HVAC tags', () => {
    expect(mapHvacType('RTU-1')).toBe('Rooftop Unit (RTU)');
    expect(mapHvacType('AHU-2')).toBe('Air Handling Unit (AHU)');
    expect(mapHvacType('VAV-12')).toBe('VAV Box');
    expect(mapHvacType('EF-3')).toBe('Exhaust Fan');
    expect(mapHvacType('something odd')).toBe('Other');
  });

  it('gives roof hoods their own type — a school set carries 40+', () => {
    expect(mapHvacType('RH-D-01')).toBe('Roof Hood / Gravity Vent');
    expect(mapHvacType('Roof Hood')).toBe('Roof Hood / Gravity Vent');
    expect(mapHvacType('Gravity ventilator')).toBe('Roof Hood / Gravity Vent');
    expect(mapHvacType('Intake hood, Area C')).toBe('Roof Hood / Gravity Vent');
    expect(mapHvacType('Relief hood')).toBe('Roof Hood / Gravity Vent');
    // Kitchen grease hoods are NOT roof hoods — different scope entirely
    expect(mapHvacType('Kitchen hood KH-1')).toBe('Other');
    expect(mapHvacType('Type I grease hood')).toBe('Other');
    // and the RH- rule must not swallow HRVs or anything containing "rh"
    expect(mapHvacType('HRV-2')).toBe('Heat Recovery Ventilator (HRV)');
  });
});

// ── TERMINAL HEAT ────────────────────────────────────────────────────────────
// A live school read put 32 of 40 units into "Other". The dropdown had no
// heater type at all, so unit heaters over entries, cabinet heaters in
// vestibules and fin-tube along glass had nowhere to land.

describe('terminal heat gets a type instead of Other', () => {
  it('maps unit heaters, however the prefix is written', () => {
    for (const t of ['UH-1', 'EUH-3', 'GUH-2', 'unit heater', 'ELECTRIC UNIT HEATER'])
      expect(mapHvacType(t), t).toBe('Unit Heater');
  });

  it('maps cabinet heaters and force-flows', () => {
    for (const t of ['CUH-4', 'FF-1', 'force flow', 'cabinet unit heater'])
      expect(mapHvacType(t), t).toBe('Cabinet Unit Heater (CUH)');
  });

  it('maps baseboard and fin-tube', () => {
    for (const t of ['BH-2', 'FTR-1', 'FH-3', 'fin tube radiation', 'baseboard heater'])
      expect(mapHvacType(t), t).toBe('Baseboard / Fin-Tube Heater');
  });

  it('stops counting baseboard heaters as boilers', () => {
    // BH- used to hit the boiler rule. B- still does, which is correct.
    expect(mapHvacType('BH-1')).not.toBe('Boiler');
    expect(mapHvacType('B-1')).toBe('Boiler');
    expect(mapHvacType('boiler')).toBe('Boiler');
  });

  it('does not steal AHU, which shares the letters', () => {
    expect(mapHvacType('AHU-1')).toBe('Air Handling Unit (AHU)');
    expect(mapHvacType('AHU')).toBe('Air Handling Unit (AHU)');
  });
});

describe('AC condensing units', () => {
  it('recognizes ACU and ACCU, not just AC and CU', () => {
    // A sheet's own summary named "an AC condensing unit (ACU-C-02)" while the
    // app filed it under Other.
    for (const t of ['ACU-C-02', 'ACCU-1', 'AC-3', 'CU-2'])
      expect(mapHvacType(t), t).toBe('Split System — Condenser');
  });

  it('leaves the air-cooled chiller prefix alone', () => {
    expect(mapHvacType('ACCH-1')).toBe('Chiller — Air-Cooled');
  });
});

describe('a bare pump tag is not a chilled water pump', () => {
  it('reads an untagged pump as a circulator', () => {
    // A hydronic sheet tagged 20 radiant-panel circulators "P10 0.5 GPM" and
    // every one came back as central-plant chilled water.
    for (const t of ['P-1', 'P10', 'pump', 'circulator', 'inline pump'])
      expect(mapHvacType(t), t).toBe('Pump — Circulator / Inline');
  });

  it('still reads the named plant pumps correctly', () => {
    expect(mapHvacType('CHWP-1')).toBe('Chilled Water Pump');
    expect(mapHvacType('CWP-2')).toBe('Condenser Water Pump');
  });
});
