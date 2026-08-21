import { describe, it, expect } from 'vitest';
import {
  COMPANY_DEFAULT_KEYS, CREW_KEY, captureCompanyDefaults, companyDefaultPatch,
  hasCompanyDefaults, companyCrew, describeCompanyDefaults,
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
