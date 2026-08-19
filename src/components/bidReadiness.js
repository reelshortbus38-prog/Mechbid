import { marginAnalysis } from '../steps/bidTotals.js';
// ── BID READINESS (PRE-FLIGHT) ───────────────────────────────────────────────
// The takeoff can be perfect and the bid still catastrophically wrong, because
// nothing stopped the estimator from printing before the numbers were filled
// in. A real case from a live set: 95 units imported, every one at $0, Equipment
// Cost $0 — print that and you've bid a two-school mechanical package for the
// price of the labor. Nothing in the app said a word.
//
// These are deterministic pre-send checks over the job state. BLOCKERS are
// things that make the printed number wrong (unpriced gear, no labor, duct with
// no footage). WARNINGS are things a competent estimator might do on purpose
// (zero markup on a cost-plus job, no project name yet), so they inform without
// crying wolf. Nothing here ever blocks printing — an estimator sometimes sends
// an intentionally partial number — it just refuses to let it happen silently.
//
// Pure over (state, totals); unit-tested with no React or network.
import { partGroupOf } from './partGroups.js';
import { parseDuctDesc, MIN_DUCT_SIDE } from './ductwork.js';

// duct-unsized counts as duct: those runs carry footage and must not reach a
// bid unpriced just because the app could not read their label.
const isDuctLine = (p) => ['duct-rect', 'duct-round', 'duct-unsized'].includes(partGroupOf(p));
const num = (v) => Number(v) || 0;

// Equipment lists and material lists differ per mode; everything downstream is
// the same, so normalize once here.
function jobLists(state) {
  switch (state.mode) {
    case 'Commercial HVAC':
      return { equip: state.hvacEquipment || [], parts: state.hvacParts || [], equipLabel: 'equipment unit' };
    case 'Residential HVAC':
      return { equip: state.resEquipment || [], parts: state.resParts || [], equipLabel: 'equipment unit' };
    default: // Commercial Refrigeration — materials list, plus contractor-supplied rack parts
      return {
        equip: [],
        parts: [...(state.lineItems || []), ...(state.rackParts || []).filter(p => !p.storeSupplied)],
        equipLabel: 'equipment unit',
      };
  }
}

export function checkBidReadiness(state = {}, totals = {}) {
  const issues = [];
  const { equip, parts } = jobLists(state);

  // 1. Unpriced equipment — the single most expensive mistake available.
  const unpricedEquip = equip.filter(e => num(e.cost) <= 0);
  if (unpricedEquip.length > 0) {
    const tags = unpricedEquip.map(e => e.tag).filter(Boolean).slice(0, 6);
    issues.push({
      key: 'unpricedEquipment', severity: 'blocker',
      title: `${unpricedEquip.length} of ${equip.length} equipment units have no cost`,
      detail: `They contribute $0 to the bid${tags.length ? ` — e.g. ${tags.join(', ')}` : ''}. Price them on the Equipment step, or delete the ones that aren't in your scope.`,
      count: unpricedEquip.length,
    });
  }

  // 2. Duct lines with no footage — you'll buy this metal; at qty 0 it costs
  //    nothing in the bid and converts to nothing in the purchase units.
  const ductNoFootage = parts.filter(p => isDuctLine(p) && !p.dgen && num(p.qty) <= 0);
  if (ductNoFootage.length > 0) {
    issues.push({
      key: 'ductNoFootage', severity: 'blocker',
      title: `${ductNoFootage.length} duct line${ductNoFootage.length === 1 ? '' : 's'} still have no footage`,
      detail: 'Measure the run lengths on the sheet (open a flag for that page and use Measure) and enter them in the Qty box, then re-run Duct → Purchase Units. Until then this ductwork is free in your bid.',
      count: ductNoFootage.length,
    });
  }

  // 2b. Duct lines with real footage but an UNUSABLE size. The nastiest
  //     failure in the app: "32x0 SA duct" shows 80 ft on screen, passes the
  //     no-footage check above, and then converts to zero pounds of steel
  //     because a rectangle with a zero side matches no purchase branch. On a
  //     live set three misread trunks were 140 of 272 total feet — over half
  //     the ductwork, bought for free, with full quantities displayed
  //     throughout. Footage alone is not evidence that duct got priced.
  const ductBadSize = parts.filter(p => {
    if (!isDuctLine(p) || p.dgen || num(p.qty) <= 0) return false;
    const d = parseDuctDesc(p.desc);
    if (!d) return true;
    if (d.kind === 'rect') return !(d.w >= MIN_DUCT_SIDE && d.h >= MIN_DUCT_SIDE);
    if (d.kind === 'round') return !(d.dia > 0);
    return false;
  });
  if (ductBadSize.length > 0) {
    const names = ductBadSize.slice(0, 3).map(p => `"${p.desc}"`);
    issues.push({
      key: 'ductBadSize', severity: 'blocker',
      title: `${ductBadSize.length} duct line${ductBadSize.length === 1 ? '' : 's'} have footage but no usable size`,
      detail: `${names.join(', ')}${ductBadSize.length > names.length ? ' and others' : ''} — either a side reads 0 or impossibly narrow (a lost digit), or the label could not be read at all. Every one converts to NO metal no matter how many feet are shown, so the footage on screen is not money in the bid. Read the size off the sheet and type it in, or delete the line and take it off by hand.`,
      count: ductBadSize.length,
    });
  }

  // 3. Priced-at-zero material lines that DO have a quantity — a real counted
  //    item nobody costed. (Duct footage lines are excluded: they're priced by
  //    the purchase-unit conversion, not per foot.)
  const unpricedParts = parts.filter(p => num(p.qty) > 0 && num(p.unitCost) <= 0 && num(p.total) <= 0 && !isDuctLine(p));
  if (unpricedParts.length > 0) {
    issues.push({
      key: 'unpricedParts', severity: 'blocker',
      title: `${unpricedParts.length} material line${unpricedParts.length === 1 ? '' : 's'} have a quantity but no price`,
      detail: 'Use “Fill default prices” for a ballpark, or price them from the supply house. Counted items at $0 quietly shrink the bid.',
      count: unpricedParts.length,
    });
  }

  // 4. No labor at all. Every one of these jobs is installed by somebody.
  const labor = num(totals.laborTotal) + num(totals.rackLaborTotal) + num(totals.fieldTasksTotal);
  if (labor <= 0) {
    issues.push({
      key: 'noLabor', severity: 'blocker',
      title: 'No labor in the bid',
      detail: 'Set the crew and periods on the Labor step. A materials-only number is not a bid.',
      count: 0,
    });
  }

  // 5. Selling at cost. Legitimate on a cost-plus or T&M job, so: warning.
  if (num(totals.markupAmt) <= 0 && num(totals.markupBase) > 0) {
    issues.push({
      key: 'noMarkup', severity: 'warn',
      title: 'Markup is zero — this bid sells material and equipment at cost',
      detail: 'Intentional on a cost-plus job. Otherwise set a markup on this step.',
      count: 0,
    });
  }

  // 5b. The markup lands on materials only, so on a labour-heavy job the number
  // the estimator set is not the number the bid earns. Whether that is wrong
  // depends on whether their crew rates already carry overhead and profit —
  // which the app cannot know — so this states the gap and does not judge it.
  const margin = marginAnalysis(state, totals);
  if (margin && margin.statedMarkupPct > 0 && margin.unmarkedSharePct >= 40
      && margin.effectiveMarginPct < margin.statedAsMarginPct - 3) {
    issues.push({
      key: 'effectiveMargin', severity: 'warn',
      title: `Bid earns ${margin.effectiveMarginPct}% — the markup is set to ${margin.statedMarkupPct}%`,
      detail: `Markup lands on materials only, and ${margin.unmarkedSharePct}% of this job's cost is labor and `
        + `subs, which carry none. Gross profit is ${Math.round(margin.grossProfit).toLocaleString()} on a `
        + `${Math.round(margin.cost).toLocaleString()} job. That is correct IF your crew rates already include `
        + 'overhead and profit — if they are burdened cost, this bid is thin.',
      count: 0,
    });
  }

  // 6. The proposal prints a header; an untitled one looks unfinished.
  if (!String(state.projName || '').trim()) {
    issues.push({
      key: 'noProjectName', severity: 'warn',
      title: 'No project name',
      detail: 'The printed proposal will just say “Project”. Set it on the Setup step.',
      count: 0,
    });
  }

  // Sheets the vision budget never reached. Every other blocker here is about
  // a number being wrong; this one is about a number being ABSENT — scope from
  // an unread drawing cannot show up as an unpriced line, because there is no
  // line. It is the only failure on this list that a careful estimator cannot
  // catch by reviewing the takeoff, so it has to stop the bid.
  const unread = (state.flags || [])
    .map(f => String(f?.text || ''))
    .filter(t => /drawing sheet\(s\) were not read/.test(t));
  if (unread.length) {
    const pages = [...new Set(unread.flatMap(t => (t.match(/\bp\d+/g) || [])))];
    issues.push({
      key: 'unreadSheets', severity: 'blocker',
      title: `${pages.length} drawing sheet${pages.length === 1 ? '' : 's'} were never read`,
      detail: `Nothing from ${pages.join(', ')} is in this takeoff — not the equipment, not the duct, not the keynotes. Upload those sheets on their own and merge the result before bidding.`,
    });
  }

  const blockers = issues.filter(i => i.severity === 'blocker');
  const warnings = issues.filter(i => i.severity === 'warn');
  return { issues, blockers, warnings, ready: blockers.length === 0 };
}
