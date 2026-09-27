import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState, calcFlatJobCost, ootOpts } from '../state/store.js';
import { ootBreakdown, defaultNights, ootNights } from './outOfTown.js';
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

  // ── THE PANEL AND THE PRICE HAVE TO AGREE ───────────────────────────────
  // The cost is computed by calcFlatJobCost and the panel by its own
  // ootBreakdown call. Dropping the week length from ONE of them leaves the
  // bid charging 81 nights while the card says 108, and every check above
  // still passed when that happened — they read the days, the labels and a
  // nights figure that had been set by hand.
  it('shows the same nights the bid is charging', () => {
    const html = screen(JOB);
    expect(html, 'the panel is showing a night per day while the cost charges one fewer per week')
      .toMatch(/Out of town — 108 day\(s\), 81 night\(s\)/);
    expect(html).toMatch(/Hotel — 4 rooms × 81 nights/);
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

  // ── "Well with 4 days a week that would be 3 nights a week" ─────────────
  // The first fix gave the card a nights box and left the default at a night
  // per day, which is 108 on this job. He corrected the rule itself: you drive
  // up the first morning and home the last evening, so every week away is one
  // night short of its days.
  it('sleeps one fewer night than it works days, each week', () => {
    const b = ootBreakdown({ days, nights: undefined, travelers: 4, rates: RATES, daysPerWeek: 4 });
    expect(b.nights).toBe(81);          // 27 weeks × 3
    expect(b.hotel).toBe(120 * 4 * 81);
  });

  it('is $12,960 less than a night for every day', () => {
    const was = ootBreakdown({ days, nights: 108, travelers: 4, rates: RATES }).hotel;
    const now = ootBreakdown({ days, nights: undefined, travelers: 4, rates: RATES, daysPerWeek: 4 }).hotel;
    expect(was - now).toBe(12960);
  });

  it('takes the number the card now collects', () => {
    const html = screen({ ...JOB, flatJob: { ...JOB.flatJob, nights: 81 } });
    expect(html).toMatch(/81 night\(s\)/);
  });

  it('suggests the nights rather than pre-filling them', () => {
    // A placeholder says what happens if you leave it alone; a value typed in
    // on your behalf reads as a number somebody chose.
    const html = screen(JOB);
    expect(html).toMatch(/placeholder="81"/);
    expect(html, 'the placeholder is back to a night per day').not.toMatch(/placeholder="108"/);
  });

  it('says on the line that it assumed the drive home', () => {
    // The assumption is the whole difference between 81 and 108, so it has to
    // be visible on a job where somebody DOES stay over the weekend.
    expect(screen(JOB)).toMatch(/drive home — set nights if you stay over/);
  });

  it('stops saying it once somebody has set the nights', () => {
    expect(screen({ ...JOB, flatJob: { ...JOB.flatJob, nights: 108 } }))
      .not.toMatch(/drive home — set nights/);
  });
});

describe('the nights rule itself', () => {
  it('is one fewer night per week worked', () => {
    expect(defaultNights(4, 4)).toBe(3);
    expect(defaultNights(5, 5)).toBe(4);
    expect(defaultNights(6, 6)).toBe(5);
    expect(defaultNights(108, 4)).toBe(81);
    expect(defaultNights(135, 5)).toBe(108);
  });

  it('counts a part week as a week', () => {
    // Six days on a four-day week is a full week and a two-day one: two drives
    // home, two nights fewer.
    expect(defaultNights(6, 4)).toBe(4);
  });

  // ── WITHOUT A WEEK LENGTH IT DOES NOT INVENT ONE ─────────────────────────
  // A period carrying total days and no week length cannot be divided into
  // weeks, and assuming five would be exactly the made-up rule this replaces.
  it('falls back to a night per day when nobody said how long a week is', () => {
    expect(defaultNights(108, undefined)).toBe(108);
    expect(defaultNights(108, 0)).toBe(108);
    expect(defaultNights(108, 1)).toBe(108);
  });

  it('gives a one-day trip no nights', () => {
    expect(defaultNights(1, 4)).toBe(0);
    expect(defaultNights(0, 4)).toBe(0);
  });

  it('is overridden the moment somebody types a number', () => {
    // A crew that drives up Sunday night sleeps a night per day, and the box
    // is there to say so.
    expect(ootNights(108, 108, 4)).toBe(108);
    expect(ootNights(108, 0, 4)).toBe(0);
    expect(ootNights(108, '', 4)).toBe(81);
  });
});
