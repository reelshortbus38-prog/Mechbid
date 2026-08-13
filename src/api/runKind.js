// ── DUCT vs PIPE ─────────────────────────────────────────────────────────────
// The analyzer sorts linework into ductRuns and pipeRuns, and it gets the sort
// wrong in both directions. From one live set:
//
//   Pipe — 6" EA                      an exhaust-AIR duct filed as pipe
//   Ductwork — 3/4" dia round duct    a refrigerant line filed as duct
//
// Neither is a small error. The two are bought in completely different units:
// sheet metal is fabricated and priced by the POUND, copper by the foot. A 6"
// exhaust duct costed as pipe, or a 3/4" refrigerant line costed as spiral,
// is wrong money in both directions — and neither looks wrong on screen,
// because each lands in a group where its own row reads plausibly.
//
// The service tells you which it is, and the service is nearly always written
// on the label. "EA" is exhaust air; there is no such thing as an exhaust-air
// pipe. "RS"/"RL" are refrigerant suction and liquid; there is no such thing
// as a 3/4" duct.
//
// Only a CONFIDENT signal moves a run. When the label says both, or says
// neither, the analyzer's original call stands — reclassifying on a guess
// would just trade one kind of error for another.
//
// Pure — no React, no network.

// Air services. These are duct, always.
const AIR_RE = /\b(?:SA|RA|EA|OA|MA|TA)\b|\b(?:supply|return|exhaust|outside|relief|transfer|make.?up|ventilation)\s+air\b|\bair\s+(?:duct|distribution)\b/i;

// Piped services. These are pipe, always.
const PIPE_RE = /\b(?:RS|RL|RD|HG|CHWS|CHWR|HWS|HWR|CWS|CWR)\b|\brefrigerant\b|\bsuction\b|\bliquid\s*line\b|\bhot\s*gas\b|\bcondensate\b|\bchilled\s*water\b|\bhot\s*water\b|\bcold\s*water\b|\bsteam\b|\bnatural\s*gas\b|\bcompressed\s*air\b|\bdrain\b|\bvent\b|\bsanitary\b/i;

// Below this, a round "duct" is not a duct — it is a pipe size that landed in
// the wrong bucket. Four inches is the practical floor for round duct; 3/4"
// and 1/2" are copper.
const MIN_ROUND_DUCT_IN = 4;

// Pull a leading diameter out of a size string: '3/4"' → 0.75, '6"' → 6.
export function sizeInches(size) {
  const s = String(size || '').trim();
  const frac = s.match(/^(\d+)?\s*(\d+)\s*\/\s*(\d+)/);
  if (frac) return (frac[1] ? parseFloat(frac[1]) : 0) + parseFloat(frac[2]) / parseFloat(frac[3]);
  const n = s.match(/(\d+(?:\.\d+)?)/);
  return n ? parseFloat(n[1]) : 0;
}

// run: { size, service, notes }. kind: what the analyzer called it.
// Returns { kind, moved, why } — moved is true only when the call changed.
export function classifyRun(run = {}, kind = 'duct') {
  const text = [run.size, run.service, run.notes, run.shape].filter(Boolean).join(' ');
  const air = AIR_RE.test(text);
  const piped = PIPE_RE.test(text);

  // Says both, or says nothing useful — leave the original call alone.
  if (air === piped) {
    // One exception, and it is a size argument rather than a service one: a
    // sub-4" round "duct" cannot be duct whatever the label says.
    if (kind === 'duct' && /round|dia|ø|⌀/i.test(text)) {
      const dia = sizeInches(run.size);
      if (dia > 0 && dia < MIN_ROUND_DUCT_IN) {
        return { kind: 'pipe', moved: true, why: `${run.size} is a pipe size — round duct does not go below ${MIN_ROUND_DUCT_IN}"` };
      }
    }
    return { kind, moved: false };
  }

  const should = air ? 'duct' : 'pipe';
  if (should === kind) return { kind, moved: false };
  return {
    kind: should,
    moved: true,
    why: air
      ? `the label reads as an air service, and there is no such thing as an air pipe`
      : `the label reads as a piped service, and there is no such thing as a duct for it`,
  };
}

// Re-sort a page's runs. ductRuns / pipeRuns as the analyzer returned them.
// Returns the corrected lists plus flags naming every run that moved, because
// a line silently changing which trade it belongs to is exactly the kind of
// thing an estimator needs to see once.
export function reclassifyRuns(ductRuns = [], pipeRuns = [], label = '') {
  const duct = [], pipe = [], flags = [];
  const where = label ? `${label}: ` : '';

  const place = (run, from) => {
    const { kind, moved, why } = classifyRun(run, from);
    (kind === 'duct' ? duct : pipe).push(run);
    if (moved) {
      flags.push({ type: 'warn', source: label || undefined,
        text: `${where}"${run.size || 'a run'}${run.service ? ` ${run.service}` : ''}" was read as ${from} but priced as ${kind} — ${why}. Sheet metal is bought by the pound and pipe by the foot, so check this one.` });
    }
  };

  (ductRuns || []).forEach(r => place(r, 'duct'));
  (pipeRuns || []).forEach(r => place(r, 'pipe'));
  return { ductRuns: duct, pipeRuns: pipe, flags };
}
