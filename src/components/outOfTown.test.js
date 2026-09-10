import { describe, it, expect } from 'vitest';
import {
  newOotRates, ootIsItemised, ootNights, ootRooms, ootBreakdown, ootLines,
} from './outOfTown.js';
import { ootCost, DEFAULT_OOT_BASIS } from '../state/store.js';

const crewOf = n => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, rate: 75 }));

// ── THE THREE MULTIPLIERS ───────────────────────────────────────────────────
// One flat per-day figure with a single crew/person switch could not be right
// about all three at once. Set it per person and the fuel triples on a crew who
// share a truck; set it per crew and the meals are a third of what they are.
describe('ootBreakdown', () => {
  const rates = { mealsPerPersonDay: 60, hotelPerRoomNight: 120, personsPerRoom: 1, fuelPerTruckDay: 40, trucks: 1 };

  it('meals are per person per day', () => {
    expect(ootBreakdown({ days: 5, travelers: 3, rates }).meals).toBe(60 * 3 * 5);
  });

  it('hotel is per ROOM per NIGHT, not per person per day', () => {
    // Five days, four nights — the crew drives home Friday.
    const b = ootBreakdown({ days: 5, nights: 4, travelers: 3, rates });
    expect(b.nights).toBe(4);
    expect(b.hotel).toBe(120 * 3 * 4);
  });

  it('halves the rooms when they double up', () => {
    const b = ootBreakdown({ days: 5, nights: 4, travelers: 4, rates: { ...rates, personsPerRoom: 2 } });
    expect(b.rooms).toBe(2);
    expect(b.hotel).toBe(120 * 2 * 4);
  });

  it('rounds an odd crew UP — three men two to a room is two rooms', () => {
    expect(ootRooms(3, 2)).toBe(2);
    expect(ootRooms(5, 2)).toBe(3);
    expect(ootRooms(0, 2)).toBe(0);
  });

  it('fuel is per TRUCK, not per person', () => {
    // Three men in one truck is one fuel bill. Charged per person it would be
    // three times this.
    const b = ootBreakdown({ days: 5, travelers: 3, rates });
    expect(b.fuel).toBe(40 * 1 * 5);
    expect(ootBreakdown({ days: 5, travelers: 3, rates: { ...rates, trucks: 2 } }).fuel).toBe(40 * 2 * 5);
  });

  it('adds up to the total it reports', () => {
    const b = ootBreakdown({ days: 5, nights: 4, travelers: 3, rates });
    expect(b.total).toBeCloseTo(b.meals + b.hotel + b.fuel, 2);
  });

  it('defaults nights to the days worked when nobody says', () => {
    expect(ootNights(5, undefined)).toBe(5);
    expect(ootNights(5, '')).toBe(5);
    expect(ootNights(5, 4)).toBe(4);
    // Staying over the weekend is a real answer too.
    expect(ootNights(5, 7)).toBe(7);
  });

  it('is nothing with nobody travelling', () => {
    const b = ootBreakdown({ days: 5, travelers: 0, rates });
    expect(b.meals).toBe(0);
    expect(b.hotel).toBe(0);
    // The truck still drives, though.
    expect(b.fuel).toBe(200);
  });
});

describe('ootIsItemised', () => {
  it('is false until somebody puts money in one of the three', () => {
    expect(ootIsItemised(undefined)).toBe(false);
    expect(ootIsItemised(newOotRates())).toBe(false);
    // Trucks and room-sharing are multipliers, not money — they do not turn it on.
    expect(ootIsItemised({ ...newOotRates(), trucks: 3, personsPerRoom: 2 })).toBe(false);
  });

  it('is true once any one of them is set', () => {
    expect(ootIsItemised({ mealsPerPersonDay: 60 })).toBe(true);
    expect(ootIsItemised({ hotelPerRoomNight: 120 })).toBe(true);
    expect(ootIsItemised({ fuelPerTruckDay: 40 })).toBe(true);
  });
});

// ── NOTHING REPRICED WHEN THIS SHIPPED ──────────────────────────────────────
describe('ootCost — the flat rate still works', () => {
  const crew = crewOf(3);

  it('prices a job that has never been itemised exactly as before', () => {
    expect(ootCost(5, 100, crew, { ootBasis: 'crew' })).toBe(500);
    expect(ootCost(5, 100, crew, { ootBasis: 'person' })).toBe(1500);
    expect(DEFAULT_OOT_BASIS).toBe('crew');
  });

  it('ignores empty itemised rates and keeps the flat figure', () => {
    expect(ootCost(5, 100, crew, { ootBasis: 'crew', ootRates: newOotRates() })).toBe(500);
  });

  it('switches to itemised the moment one rate is filled in', () => {
    const rates = { mealsPerPersonDay: 60, hotelPerRoomNight: 0, fuelPerTruckDay: 0, personsPerRoom: 1, trucks: 1 };
    // Flat would have been 500. Meals for three men over five days is 900.
    expect(ootCost(5, 100, crew, { ootBasis: 'crew', ootRates: rates })).toBe(900);
  });

  it('still honours the out-of-town OFF switch', () => {
    const rates = { mealsPerPersonDay: 60 };
    expect(ootCost(5, 100, crew, { outOfTown: false, ootRates: rates })).toBe(0);
  });

  it('is nothing on a period with no days', () => {
    expect(ootCost(0, 100, crew, { ootRates: { mealsPerPersonDay: 60 } })).toBe(0);
  });
});

describe('ootLines', () => {
  it('says what each figure is made of', () => {
    const b = ootBreakdown({
      days: 5, nights: 4, travelers: 4,
      rates: { mealsPerPersonDay: 60, hotelPerRoomNight: 120, personsPerRoom: 2, fuelPerTruckDay: 40, trucks: 2 },
    });
    const lines = ootLines(b);
    expect(lines.map(l => l.key)).toEqual(['meals', 'hotel', 'fuel']);
    expect(lines.find(l => l.key === 'hotel').label).toBe('Hotel — 2 rooms × 4 nights');
    expect(lines.find(l => l.key === 'fuel').label).toBe('Fuel — 2 trucks');
  });

  it('leaves out what nobody is paying for', () => {
    const b = ootBreakdown({ days: 5, travelers: 3, rates: { mealsPerPersonDay: 60 } });
    expect(ootLines(b).map(l => l.key)).toEqual(['meals']);
  });
});

// ── WHAT STOPS APPLYING ONCE IT IS ITEMISED ─────────────────────────────────
describe('the crew-vs-person basis question', () => {
  it('goes away once the rates are itemised', async () => {
    const { ootBasisComparison } = await import('../state/store.js');
    const base = {
      laborPeriods: [{ id: 'p', days: 5, ootPerDay: 100, crew: crewOf(3) }],
      ootBasis: 'crew',
    };
    // On the flat figure it is a real question worth asking.
    expect(ootBasisComparison(base)).not.toBeNull();
    // Itemised, each of the three carries its own multiplier — offering to
    // switch a basis that no longer applies invites a change that does nothing.
    expect(ootBasisComparison({ ...base, ootRates: { mealsPerPersonDay: 60 } })).toBeNull();
  });
});
