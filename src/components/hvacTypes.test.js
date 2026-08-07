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
