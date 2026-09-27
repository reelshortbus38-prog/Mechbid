import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState, calcFlatJobCost, ootOpts } from '../state/store.js';
import { ootBreakdown } from './outOfTown.js';
import Step5_Labor from '../steps/Step5_Labor.jsx';

// ── "shouldn't it autofill the out of town expenses per day beside the
//     whole crew period" ────────────────────────────────────────────────────
// It was already CHARGING them — ootCost prefers the itemised rates for the
// flat job exactly as it does for a period. What the whole-job card did not do
// was show it, or let anybody correct the nights.
//
// The period editor swaps its "$/day" box for "Hotel nights" once meals, hotel
// or fuel are set, and the itemised card says so in as many words: "the $/day
// boxes on the period cards are now nights." The whole-job card was never
// given that branch, so it read "Out of Town ($/day)  0" over an expense that
// was running underneath it.

const RATES = { mealsPerPersonDay: 60, hotelPerRoomNight: 120, personsPerRoom: 1, fuelPerTruckDay: 100, trucks: 4 };
const CREW = [
  { id: 'a', role: 'Foreman', rate: 100, hrsPerDay: 8 },
  { id: 'b', role: 'Technician', rate: 75, hrsPerDay: 8 },
  { id: 'c', role: 'Helper', rate: 50, hrsPerDay: 8 },
  { id: 'd', role: 'Helper', rate: 50, hrsPerDay: 8 },
];
// The screenshot: 27 weeks, 4 days a week, four men away.
const JOB = {
  ...initialState, laborMode: 'flat', mode: 'Commercial Refrigeration',
  ootRates: RATES, outOfTown: true,
  flatJob: { crew: CREW, weeks: 27, daysPerWeek: 4, ootPerDay: 0 },
};

const screen = state => renderToStaticMarkup(
  <StateProvider initial={state}><Step5_Labor /></StateProvider>,
);

describe('the whole-job card and the itemised rates', () => {
  it('asks for nights, not dollars a day, once the rates are set', () => {
    const html = screen(JOB);
    expect(html, 'the whole-job card still asks for $/day').toMatch(/Hotel nights/);
  });

  it('still asks for dollars a day when nothing is itemised', () => {
    const html = screen({ ...JOB, ootRates: undefined });
    expect(html).toMatch(/Out of Town \(\$\/day\)/);
    expect(html).not.toMatch(/Hotel nights/);
  });

  it('shows what the rates come to, beside the crew', () => {
    const html = screen(JOB);
    expect(html).toMatch(/Meals — 4 away/);
    expect(html).toMatch(/Hotel — 4 rooms/);
    expect(html).toMatch(/Fuel — 4 trucks/);
    expect(html).toMatch(/Out of town — 108 day\(s\)/);
  });
});

// ── THE NIGHTS WERE THE EXPENSIVE HALF ──────────────────────────────────────
// With no nights box on the card, flat.nights stayed undefined — and ootNights
// reads that as "every day is a night".
describe('nights on a whole-job crew', () => {
  const days = calcFlatJobCost(JOB.flatJob, ootOpts(JOB)).days;

  it('is 108 days on this job', () => {
    expect(days).toBe(27 * 4);
  });

  it('defaults to a night for every day, which is what it was charging', () => {
    const b = ootBreakdown({ days, nights: undefined, travelers: 4, rates: RATES });
    expect(b.nights).toBe(108);
    expect(b.hotel).toBe(120 * 4 * 108);
  });

  it('and a crew that drives home on the last day sleeps three', () => {
    // 27 weeks × 3. The card had no way to say so.
    const b = ootBreakdown({ days, nights: 81, travelers: 4, rates: RATES });
    expect(b.hotel).toBe(120 * 4 * 81);
    expect(120 * 4 * 108 - b.hotel).toBe(12960);
  });

  it('takes the number the card now collects', () => {
    const html = screen({ ...JOB, flatJob: { ...JOB.flatJob, nights: 81 } });
    expect(html).toMatch(/81 night\(s\)/);
  });

  it('suggests the day count rather than pre-filling a wrong one', () => {
    // A placeholder says what happens if you leave it; a value typed in on
    // your behalf reads as a number somebody chose.
    const html = screen(JOB);
    expect(html).toMatch(/placeholder="108"/);
  });
});
