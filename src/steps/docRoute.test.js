import { describe, it, expect } from 'vitest';
import {
  isHvacTrade, isResidentialTrade, routeTextDoc, equipmentKey, partsKey,
  mapResType, toResEquipment, RES_EQUIP_TYPES,
  REFRIGERATION, COMMERCIAL_HVAC, RESIDENTIAL_HVAC,
} from './docRoute.js';
import { initialState } from '../state/store.js';

describe('which trade a mode belongs to', () => {
  it('reads both HVAC modes as HVAC', () => {
    expect(isHvacTrade(COMMERCIAL_HVAC)).toBe(true);
    expect(isHvacTrade(RESIDENTIAL_HVAC)).toBe(true);
    expect(isHvacTrade(REFRIGERATION)).toBe(false);
  });

  it('separates residential from commercial HVAC', () => {
    // Both are HVAC for PROMPT selection and different for DESTINATION.
    expect(isResidentialTrade(RESIDENTIAL_HVAC)).toBe(true);
    expect(isResidentialTrade(COMMERCIAL_HVAC)).toBe(false);
    expect(isResidentialTrade(REFRIGERATION)).toBe(false);
  });

  it('does not crash on a missing mode', () => {
    expect(isHvacTrade(undefined)).toBe(false);
    expect(isResidentialTrade(null)).toBe(false);
  });
});

describe('routing a text document to the right reader', () => {
  it('sends refrigeration scope text to the refrigeration readers', () => {
    expect(routeTextDoc({ mode: REFRIGERATION })).toBe('scopeDoc');
    expect(routeTextDoc({ mode: REFRIGERATION, isFlatScope: true })).toBe('flatScope');
  });

  it('sends HVAC scope text to the HVAC spec reader, not the RC one', () => {
    // The refrigeration readers would hunt for circuits and RC nights that a
    // Division 23 spec does not contain, and come back empty — which looks
    // exactly like "this job has no scope".
    expect(routeTextDoc({ mode: COMMERCIAL_HVAC })).toBe('hvacSpec');
    expect(routeTextDoc({ mode: RESIDENTIAL_HVAC })).toBe('hvacSpec');
  });

  it('keeps the flat-scope shape from overriding the trade', () => {
    // A flat numbered list in an HVAC job is still HVAC scope.
    expect(routeTextDoc({ mode: COMMERCIAL_HVAC, isFlatScope: true })).toBe('hvacSpec');
  });

  it('gives a bid invitation letter its own reader in EITHER trade', () => {
    // Contacts, due date, bid categories, who-supplies-what. None of it is
    // trade-specific, and the spec reader would find none of it.
    for (const m of [REFRIGERATION, COMMERCIAL_HVAC, RESIDENTIAL_HVAC]) {
      expect(routeTextDoc({ mode: m, isBidLetter: true })).toBe('bidLetter');
      expect(routeTextDoc({ mode: m, isBidLetter: true, isFlatScope: true })).toBe('bidLetter');
    }
  });
});

describe('where an extraction lands', () => {
  it('keeps commercial work in the commercial stores', () => {
    expect(equipmentKey(COMMERCIAL_HVAC)).toBe('hvacEquipment');
    expect(partsKey(COMMERCIAL_HVAC)).toBe('hvacParts');
  });

  it('sends residential work to the stores the residential page reads', () => {
    // This is the bug: Step4's ResidentialEquipment reads resEquipment /
    // resParts and nothing else. Units filed under hvacEquipment were counted
    // in the upload log and then invisible on every screen after it.
    expect(equipmentKey(RESIDENTIAL_HVAC)).toBe('resEquipment');
    expect(partsKey(RESIDENTIAL_HVAC)).toBe('resParts');
  });

  it('only ever names a store the reducer actually has', () => {
    // A typo here would not throw. It would create a new key nobody reads, and
    // the extraction would go quiet again in exactly the way this fixes.
    for (const m of [REFRIGERATION, COMMERCIAL_HVAC, RESIDENTIAL_HVAC]) {
      expect(initialState).toHaveProperty(equipmentKey(m));
      expect(initialState).toHaveProperty(partsKey(m));
      expect(Array.isArray(initialState[equipmentKey(m)])).toBe(true);
      expect(Array.isArray(initialState[partsKey(m)])).toBe(true);
    }
  });
});

describe('mapping a read type onto the residential dropdown', () => {
  it('only ever returns a type the dropdown actually offers', () => {
    const seen = ['HP-1', 'AHU-2', 'CU-1', 'ductless mini split', 'gas furnace',
      'RTU-3', 'ERV-1', 'electric heat', 'AC-1', 'something unreadable'];
    for (const s of seen) expect(RES_EQUIP_TYPES).toContain(mapResType(s));
  });

  it('reads the tags a residential job actually carries', () => {
    expect(mapResType('HP-1')).toBe('Heat Pump');
    expect(mapResType('Ductless mini-split')).toBe('Mini Split');
    expect(mapResType('Gas furnace, 80% AFUE')).toBe('Gas Furnace');
    expect(mapResType('AHU-1')).toBe('Air Handler');
    expect(mapResType('CU-1')).toBe('Condenser');
    expect(mapResType('ERV-1')).toBe('ERV/HRV');
  });

  it('never lands a house on a commercial-only type', () => {
    // mapHvacType would answer "VAV Box" / "Cooling Tower" / "CRAC Unit".
    // There is no such row in a residential quote.
    for (const s of ['VAV-12', 'CT-1', 'CRAC-3', 'CHWP-2']) {
      expect(RES_EQUIP_TYPES).toContain(mapResType(s));
    }
  });

  it('calls a PACKAGED heat pump a package unit, not a heat pump', () => {
    // Residentially those are two different boxes at two different prices: a
    // split heat pump is a condenser plus an air handler, a packaged one is a
    // single cabinet. "Package" wins over "heat pump" for that reason.
    expect(mapResType('Packaged heat pump')).toBe('Package Unit');
  });

  it('falls back to the same default the manual Add button uses', () => {
    expect(mapResType('')).toBe('Heat Pump');
    expect(mapResType(undefined)).toBe('Heat Pump');
  });
});

describe('rewriting a commercial extraction for the residential table', () => {
  const e = { tag: 'HP-1', type: 'Air-source heat pump', model: 'XR15', size: '3 ton', cfm: 1200, electrical: '208/1', notes: 'attic' };
  const r = toResEquipment(e);

  it('maps onto the residential type list', () => {
    expect(r.type).toBe('Heat Pump');
    expect(RES_EQUIP_TYPES).toContain(r.type);
  });

  it('keeps the model and size together, the way the model field reads', () => {
    expect(r.model).toBe('XR15 3 ton');
  });

  it('drops nothing — the columns residential has no room for ride in notes', () => {
    // A tag, a voltage and a CFM that vanish are three things the estimator
    // has to go back to the drawing for.
    for (const bit of ['HP-1', '1200 CFM', '208/1', 'attic']) {
      expect(r.notes).toContain(bit);
    }
  });

  it('leaves cost at zero rather than inventing one', () => {
    expect(r.cost).toBe(0);
  });

  it('survives an empty read', () => {
    expect(() => toResEquipment()).not.toThrow();
    expect(toResEquipment().cost).toBe(0);
  });
});
