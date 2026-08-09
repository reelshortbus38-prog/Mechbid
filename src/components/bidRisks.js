// ── BID RISKS / SCOPE GAPS ───────────────────────────────────────────────────
// The extraction produces a lot of flags. Most are informational ("provide bird
// screen"), but a few CHANGE WHAT THE BID IS — and they arrive buried in the
// same list. Real examples from live sets:
//   • "MAU-01, MAU-02, Paint Booth exhaust fan called out as 'VENDOR PACKAGE'"
//       → someone else buys that equipment; pricing it can lose the job.
//   • "Mini split ACU/CU pairs are listed under Add Alt #3"
//       → 9 systems that do NOT belong in the base bid.
//   • "Owner Furnished / Contractor Installed"
//       → install labor only, no purchase.
// Missing one of these is a five-figure error in either direction, so they get
// pulled out of the flag stream and shown as their own short list.
//
// Pure text classification — no React, no network, unit-tested against the
// actual flag wording the analyzers produced.

// Order matters: the first matching category wins, most cost-specific first.
const RISK_RULES = [
  {
    key: 'furnished',
    label: 'Furnished by others',
    icon: '📦',
    why: 'Someone else buys this — carry install/rigging labor only, not the purchase price.',
    re: /\bowner[-\s]?furnished\b|\bOFCI\b|\bfurnished by (?:the )?owner\b|\bvendor[-\s]?package\b|\bvendor[-\s]?supplied\b|\bfurnished by others\b|\bby others\b|\bnot in contract\b|\bN\.?I\.?C\.?\b|\bproducts installed but not supplied\b/i,
  },
  {
    key: 'alternate',
    label: 'Alternate — not base bid',
    icon: '🔀',
    why: 'Price this separately. Putting an alternate in the base bid inflates your number.',
    re: /\badd(?:itive)?\s*alt(?:ernate)?\s*#?\s*\d*\b|\balternate\s*#?\s*\d+\b|\bbid alternate\b|\bdeduct(?:ive)? alternate\b|\bunder alt\b/i,
  },
  {
    key: 'allowance',
    label: 'Allowance / unit price',
    icon: '💵',
    why: 'A stated dollar or unit-price line — carry it exactly as written, not as a takeoff.',
    re: /\ballowance\b|\bunit price(?:s|d)?\b|\bcash allowance\b/i,
  },
  {
    key: 'byTrade',
    label: 'Split with another trade',
    icon: '🔌',
    why: 'Division of work — confirm who provides and who connects before pricing.',
    re: /\bby (?:div(?:ision)?|section)\s*\d|\bprovided by (?:the )?(?:electrical|plumbing|controls|GC|general)\b|\bwired by\b|\bpower by\b|\bby the controls contractor\b|\bdiv(?:ision)?\s*26\b/i,
  },
  {
    key: 'incomplete',
    label: 'Drawings incomplete / not final',
    icon: '⚠️',
    why: 'Counts will move on the next issue — qualify the bid to this document set.',
    // Separators vary in the wild: "not for construction", "not-for-construction",
    // "progress/not for construction" — match on [-\s/] rather than a space.
    re: /\bnot[-\s/]?for[-\s/]?construction\b|\bprogress[-\s/](?:set|drawings?|print)\b|\bprogress[-\s/]?\/?not\b|\b\d{2}%\s*(?:cd|construction documents|design)\b|\bpermit set\b|\btruncated\b|\bcut off\b|\bpartially garbled\b|\bcould not be extracted\b|\bmay need field verification\b/i,
  },
];

// Classify one flag's text → the risk it represents, or null if it's ordinary.
export function classifyBidRisk(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  for (const rule of RISK_RULES) {
    if (rule.re.test(t)) {
      const { re, ...meta } = rule;
      return meta;
    }
  }
  return null;
}

// Collect the risk-bearing flags out of a job's flag list, grouped by category
// in RISK_RULES order. Each entry keeps the original flag text and source so
// the estimator can trace it back to the document it came from.
// Returns [{ key, label, icon, why, items: [{ text, source }] }].
export function collectBidRisks(flags = []) {
  const byKey = new Map();
  const seen = new Set();
  for (const f of flags) {
    const text = typeof f === 'string' ? f : f?.text;
    const risk = classifyBidRisk(text);
    if (!risk) continue;
    // The same note often repeats across sheets of one set — show it once.
    const dedupeKey = `${risk.key}|${String(text).trim().toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (!byKey.has(risk.key)) byKey.set(risk.key, { ...risk, items: [] });
    byKey.get(risk.key).items.push({ text: String(text), source: (typeof f === 'object' && f?.source) || '' });
  }
  return RISK_RULES.map(r => byKey.get(r.key)).filter(Boolean);
}

// A short qualification line an estimator can drop straight into the printed
// proposal's Exclusions section — turning a detected scope gap into a written
// scope fence instead of an assumption nobody wrote down.
export function riskToExclusion(riskKey) {
  switch (riskKey) {
    case 'furnished': return 'Equipment noted as owner-furnished / vendor-package is excluded from purchase; installation and connection only.';
    case 'alternate': return 'Alternates are excluded from the base bid price and are quoted separately.';
    case 'allowance': return 'Allowance and unit-price items are carried as stated in the bid documents.';
    case 'byTrade': return 'Work assigned to other trades or divisions (electrical power, controls wiring, plumbing connections) is excluded.';
    case 'incomplete': return 'This bid is based on the drawing set issued for bid; revisions or later issues may change quantities and price.';
    default: return '';
  }
}
