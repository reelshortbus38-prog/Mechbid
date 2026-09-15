import { describe, it, expect } from 'vitest';
import {
  COMPANY_DEFAULT_KEYS, CREW_KEY, captureCompanyDefaults, companyDefaultPatch,
  hasCompanyDefaults, companyCrew, describeCompanyDefaults,
  unitsOwnership, ownershipNote, COMPANY_RATE_KEYS,
} from './companyDefaults.js';
import { initialState } from './store.js';

const SHOP = {
  laborRateBasis: 'billing', laborCostRatio: 0.6,
  markupPct: 28, subMarkupPct: 10,
  materialsTaxPct: 5.3, bondPct: 1.5,
  ootBasis: 'person', outOfTown: true,
  preferredSupplier: 'Bond',
};
const CREW = [
  { id: 'x1', role: 'Foreman', rate: 118, hrsPerDay: 10 },
  { id: 'x2', role: 'Technician', rate: 95, hrsPerDay: 10 },
  { id: 'x3', role: 'Helper', rate: 62, hrsPerDay: 10, travels: false },
];

describe('what belongs to the shop', () => {
  it('captures the settings a company sets once', () => {
    const d = captureCompanyDefaults(SHOP, []);
    expect(d.markupPct).toBe(28);
    expect(d.laborCostRatio).toBe(0.6);
    expect(d.bondPct).toBe(1.5);
  });

  it('does NOT capture anything about this particular job', () => {
    const d = captureCompanyDefaults({ ...SHOP, projName: 'Store 412', circuits: [{}], lineItems: [{}], flatJob: {} }, []);
    for (const k of ['projName', 'circuits', 'lineItems', 'flatJob', 'laborPeriods']) {
      expect(d[k]).toBeUndefined();
    }
  });

  it('keeps roles and rates but not crew ids — a new job mints its own', () => {
    const d = captureCompanyDefaults(SHOP, CREW);
    expect(d[CREW_KEY]).toHaveLength(3);
    expect(d[CREW_KEY][0]).toEqual({ role: 'Foreman', rate: 118, hrsPerDay: 10, travels: true });
    expect(d[CREW_KEY][0].id).toBeUndefined();
  });

  it('remembers who does not travel', () => {
    expect(captureCompanyDefaults(SHOP, CREW)[CREW_KEY][2].travels).toBe(false);
  });

  it('skips blank settings rather than storing empties that would wipe a default', () => {
    const d = captureCompanyDefaults({ markupPct: 28, bondPct: '', equipMarkupPct: '' }, []);
    expect(d.markupPct).toBe(28);
    expect('bondPct' in d).toBe(false);
    expect('equipMarkupPct' in d).toBe(false);
  });

  it('ignores unnamed crew rows', () => {
    expect(captureCompanyDefaults(SHOP, [{ role: '', rate: 50 }])[CREW_KEY]).toBeUndefined();
  });

  it('captures a zero markup, which is a real choice and not a blank', () => {
    expect(captureCompanyDefaults({ markupPct: 0 }, []).markupPct).toBe(0);
  });
});

describe('seeding a new job', () => {
  it('produces a patch of exactly the stored settings', () => {
    const patch = companyDefaultPatch(captureCompanyDefaults(SHOP, CREW));
    expect(patch.markupPct).toBe(28);
    expect(patch.ootBasis).toBe('person');
    // The crew is seeded separately, into whichever labor mode the job uses.
    expect(patch[CREW_KEY]).toBeUndefined();
  });

  it('is empty for a shop that has saved nothing', () => {
    expect(companyDefaultPatch({})).toEqual({});
    expect(hasCompanyDefaults({})).toBe(false);
  });

  it('mints a fresh id for every seeded crew member', () => {
    let n = 0;
    const crew = companyCrew(captureCompanyDefaults(SHOP, CREW), () => `id${n++}`);
    expect(crew.map(m => m.id)).toEqual(['id0', 'id1', 'id2']);
    expect(new Set(crew.map(m => m.id)).size).toBe(3);
  });

  it('carries rate and hours onto the seeded crew', () => {
    const crew = companyCrew(captureCompanyDefaults(SHOP, CREW));
    expect(crew[1]).toMatchObject({ role: 'Technician', rate: 95, hrsPerDay: 10 });
  });

  it('only writes the travels flag when it is false, so nothing changes by default', () => {
    const crew = companyCrew(captureCompanyDefaults(SHOP, CREW));
    expect('travels' in crew[0]).toBe(false);
    expect(crew[2].travels).toBe(false);
  });

  it('every key it seeds is a real field on a job', () => {
    // A typo here would silently write a setting nothing reads.
    for (const k of COMPANY_DEFAULT_KEYS) expect(k in initialState).toBe(true);
  });
});

describe('showing the shop what it has stored', () => {
  it('describes the crew, the basis and the money settings in plain words', () => {
    const d = captureCompanyDefaults(SHOP, CREW);
    const lines = describeCompanyDefaults(d).join(' · ');
    expect(lines).toMatch(/3-man standard crew/);
    expect(lines).toMatch(/Foreman \$118/);
    expect(lines).toMatch(/billing rates \(cost ≈ 60%\)/);
    expect(lines).toMatch(/28% markup/);
    expect(lines).toMatch(/per diem per person/);
  });

  it('says burdened cost when that is the basis', () => {
    const d = captureCompanyDefaults({ laborRateBasis: 'cost' }, []);
    expect(describeCompanyDefaults(d).join(' ')).toMatch(/burdened cost/);
  });

  it('leaves out a tax or bond of zero rather than printing 0%', () => {
    const d = captureCompanyDefaults({ markupPct: 20, materialsTaxPct: 0, bondPct: 0 }, []);
    const lines = describeCompanyDefaults(d).join(' ');
    expect(lines).not.toMatch(/0% tax/);
    expect(lines).not.toMatch(/0% bond/);
  });

  it('says nothing about an empty profile', () => {
    expect(describeCompanyDefaults({})).toEqual([]);
  });
});

// ── THE APP IS A PRODUCT, NOT ONE ESTIMATOR'S TOOL ───────────────────────────
// "I want it ready for other people to send bids out. Me changing it for
// myself isn't gonna help people in the future."
//
// Which makes the DEFAULTS the product surface. Every number a shop cannot
// store is one they retype on every bid, or — worse — one they never notice
// came from nobody and send out as their own.

describe('numbers a shop must be able to store once', () => {
  it('lets a shop keep its own night premium', () => {
    // This lived only on individual labor PERIODS, hardcoded at 1.5x the
    // moment one was created. A shop whose premium is 1.15 could not store it,
    // and on a grocery remodel nights are most of the hours on the job.
    expect(COMPANY_DEFAULT_KEYS).toContain('nightPremium');
    const d = captureCompanyDefaults({ ...SHOP, nightPremium: 1.15 }, CREW);
    expect(d.nightPremium).toBe(1.15);
    expect(companyDefaultPatch(d).nightPremium).toBe(1.15);
  });

  it('lets a shop keep its consumables burn rate', () => {
    // Nitrogen, rod, tips, abrasives. A fact about how a shop works, not
    // about the job in front of it.
    expect(COMPANY_DEFAULT_KEYS).toContain('consumablesPct');
    expect(captureCompanyDefaults({ consumablesPct: 3.5 }, []).consumablesPct).toBe(3.5);
  });

  it('lets a shop keep how it bids', () => {
    // Most bid the same way every time. The ones that do should not choose on
    // every job, and a shop that always bids lump sum should never meet the
    // double-count at all.
    expect(COMPANY_DEFAULT_KEYS).toContain('bidMethod');
    expect(captureCompanyDefaults({ bidMethod: 'lumpSum' }, []).bidMethod).toBe('lumpSum');
  });

  it('lets a shop keep how many go on a circuit', () => {
    expect(COMPANY_DEFAULT_KEYS).toContain('circuitCrewSize');
    expect(captureCompanyDefaults({ circuitCrewSize: 3 }, []).circuitCrewSize).toBe(3);
  });

  it('covers every labor number that reaches a bid', () => {
    // The check that stops the next one being forgotten: if a labor setting is
    // in the job state and NOT here, every shop retypes it forever.
    for (const k of ['laborUnits', 'nightPremium', 'circuitCrewSize', 'bidMethod', 'consumablesPct', 'laborRateBasis', 'laborCostRatio']) {
      expect(COMPANY_DEFAULT_KEYS, k).toContain(k);
    }
  });

  // The basis is a property of where the shop's numbers CAME FROM, so it has
  // to follow the shop. A shop that re-answers "what were my units measured
  // on?" per job would eventually answer it wrong, and the wrong answer here
  // is the double-count.
  it('lets a shop keep what its labor units were measured on', () => {
    expect(COMPANY_DEFAULT_KEYS).toContain('unitsBasis');
    expect(COMPANY_DEFAULT_KEYS).toContain('conditionPct');
    const out = captureCompanyDefaults({ unitsBasis: 'closed', conditionPct: { live: 18 } }, []);
    expect(out.unitsBasis).toBe('closed');
    expect(out.conditionPct).toEqual({ live: 18 });
  });

  it('seeds them into a new job, and says so on the settings card', () => {
    const patch = companyDefaultPatch({ unitsBasis: 'live', conditionPct: { live: 18 } }, {});
    expect(patch.unitsBasis).toBe('live');
    expect(patch.conditionPct).toEqual({ live: 18 });
    expect(describeCompanyDefaults({ unitsBasis: 'live' }).join(' '))
      .toMatch(/measured on live-store remodel work/i);
  });

  // The job's OWN conditions are not a shop fact — the next store may be live
  // when the last one was not — so they must not ride the profile.
  it('does not carry this job\'s conditions to the next job', () => {
    expect(COMPANY_DEFAULT_KEYS).not.toContain('jobConditions');
    expect(captureCompanyDefaults({ jobConditions: 'live' }, []).jobConditions).toBeUndefined();
  });

  it('ships a night premium in the job state for periods to seed from', () => {
    expect(initialState.nightPremium).toBe(1.5);
  });
});

describe('a shop that has never saved its numbers', () => {
  it('is recognisable, so the app can say the rates are not theirs', () => {
    // Until this is true, the crew rates, night premium and labor units on
    // screen came from the app. Fine to build a bid against, wrong to send a
    // bid out on, and only the estimator can tell the difference.
    expect(hasCompanyDefaults({})).toBe(false);
    expect(hasCompanyDefaults({ name: 'Acme Refrigeration', phone: '555-0100' })).toBe(false);
  });

  it('stops saying so the moment a shop saves anything of its own', () => {
    expect(hasCompanyDefaults({ markupPct: 28 })).toBe(true);
    expect(hasCompanyDefaults({ [CREW_KEY]: CREW })).toBe(true);
    expect(hasCompanyDefaults({ nightPremium: 1.15 })).toBe(true);
  });
});

// ── THE PART OF `rates` THE SHOP OWNS ───────────────────────────────────────
// state.rates was left out of the profile entirely, and it is three different
// kinds of thing wearing one name: market prices, the shop's practice, and one
// chain's spec. Splitting them is the point.
describe('rates: practice travels, prices do not', () => {
  const job = {
    rates: {
      cu: { '7/8': 9.4 }, insul: { medSuction: { '7/8': 2.1 } },
      hpPipeMultiplier: 2.0, hangerSpacingFt: 6,
      wasteFactor: 15, fittingsMode: 'percentage', fittingsMarkupPct: 30,
      hydronicFittingsPct: 35, ductAccessoryPct: 12,
    },
  };

  it('keeps what the shop decides', () => {
    const { rates } = captureCompanyDefaults(job, []);
    expect(rates.wasteFactor).toBe(15);
    expect(rates.fittingsMarkupPct).toBe(30);
    expect(rates.hydronicFittingsPct).toBe(35);
    expect(rates.ductAccessoryPct).toBe(12);
  });

  it('refuses to carry a copper price into next month’s bid', () => {
    // Copper belongs to the day, not the shop. It moved by a factor of three
    // the last time this app's table was refreshed, so seeding a new job with
    // whatever the last one was priced at is worse than the generic table.
    const { rates } = captureCompanyDefaults(job, []);
    expect(rates.cu).toBeUndefined();
    expect(rates.insul).toBeUndefined();
    expect(rates.hpPipeMultiplier).toBeUndefined();
  });

  it('leaves a chain’s spec with the job', () => {
    // 6 ft hanger spacing is the Food Lion standard, not this shop's rule.
    expect(captureCompanyDefaults(job, []).rates.hangerSpacingFt).toBeUndefined();
  });

  it('MERGES onto the app’s table rather than replacing it', () => {
    // The trap. A shop that stored only a waste factor must not arrive at a new
    // job with an empty copper price list.
    const profile = captureCompanyDefaults(job, []);
    const base = { cu: { '7/8': 9.9 }, hangerSpacingFt: 6, wasteFactor: 10 };
    const patch = companyDefaultPatch(profile, base);
    expect(patch.rates.cu).toEqual({ '7/8': 9.9 });   // today's price, not last month's
    expect(patch.rates.hangerSpacingFt).toBe(6);
    expect(patch.rates.wasteFactor).toBe(15);          // the shop's practice wins
  });

  it('seeds no rates at all when the shop has stored none', () => {
    expect(companyDefaultPatch({}, { cu: { '7/8': 9.9 } }).rates).toBeUndefined();
  });
});

describe('the residential man-hour rate', () => {
  it('is captured off whichever job set it', () => {
    const d = captureCompanyDefaults({ manHoursJob: { hours: 16, rate: 95 } }, []);
    expect(d.manHoursRate).toBe(95);
  });

  it('seeds the rate and never the hours', () => {
    // The rate is the shop's; the hours are always this job's.
    const patch = companyDefaultPatch({ manHoursRate: 95 });
    expect(patch.manHoursJob).toEqual({ hours: 0, rate: 95 });
  });

  it('is not captured from a job that never set one', () => {
    expect(captureCompanyDefaults({ manHoursJob: { hours: 0, rate: 0 } }, []).manHoursRate).toBeUndefined();
    expect(captureCompanyDefaults({}, []).manHoursRate).toBeUndefined();
  });
});

// ── IS THIS MY NUMBER YET? ──────────────────────────────────────────────────
// "Unconfirmed" has been true of nearly every labor unit for months, so it has
// stopped being read. This question is narrower, changes as the shop works, and
// points at something to do.
describe('unitsOwnership', () => {
  const shipped = { perFtMed: 0.075, perCase: 1.5, rtuSetCrew: 2 };

  it('counts a unit the shop changed as theirs', () => {
    const r = unitsOwnership({ laborUnits: { perFtMed: 0.09 } }, shipped);
    expect(r).toEqual({ mine: 1, total: 3, still: 2 });
  });

  it('does NOT count a unit merely re-typed at the shipped value', () => {
    // Typing the number the app already assumed tells us nothing new, and
    // counting it would overstate how much of this is really theirs.
    expect(unitsOwnership({ laborUnits: { perFtMed: 0.075 } }, shipped).mine).toBe(0);
  });

  it('is all-shipped for a shop that has stored nothing', () => {
    expect(unitsOwnership({}, shipped)).toEqual({ mine: 0, total: 3, still: 3 });
  });

  it('is all-mine when every one has been set', () => {
    const units = { perFtMed: 0.09, perCase: 2, rtuSetCrew: 3 };
    expect(unitsOwnership({ laborUnits: units }, shipped)).toEqual({ mine: 3, total: 3, still: 0 });
  });

  it('is empty rather than broken with nothing to compare', () => {
    expect(unitsOwnership()).toEqual({ mine: 0, total: 0, still: 0 });
  });
});

describe('ownershipNote', () => {
  const shipped = { perFtMed: 0.075, perCase: 1.5, rtuSetCrew: 2 };

  it('says plainly when none of them are the shop’s', () => {
    const note = ownershipNote({}, shipped);
    expect(note).toMatch(/All 3 labor units are still the ones this app shipped/);
    expect(note).toMatch(/a starting point, not your numbers/);
  });

  it('counts the split once they start setting them', () => {
    expect(ownershipNote({ laborUnits: { perFtMed: 0.09 } }, shipped))
      .toBe('1 of 3 labor units are yours; 2 are still the ones this app shipped.');
  });

  it('stops nagging once they are all set', () => {
    const units = { perFtMed: 0.09, perCase: 2, rtuSetCrew: 3 };
    expect(ownershipNote({ laborUnits: units }, shipped)).toBe('All 3 labor units are yours.');
  });

  it('says nothing when there is nothing to count', () => {
    expect(ownershipNote({}, {})).toBe(null);
  });
});
