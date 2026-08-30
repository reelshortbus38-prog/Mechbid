// ── CHOOSING A CIRCUIT PARSER ────────────────────────────────────────────────
// Split out of parse-excel.js so it can be tested without building a workbook,
// and because the PRIORITY between these signals is the whole of the bug it
// fixes.
//
// A sheet NAMED "Remote Hdr 1" is decisive. That is the Williams & Rowe BPR
// convention and nothing else uses it. The Kysor signal is far weaker — it
// fires on any sheet named "Rack A" — and a W&R BPR workbook CONTAINS rack
// sheets alongside its header sheets.
//
// Store 701's BPR has "Remote Hdr 1", "Remote Hdr 2", "Rack A " and "RACK D".
// Both flags were set, the rule was `isBPR && !isKysor`, so it fell through to
// the Kysor parser — which is looking for a different layout and found nothing.
// Fifteen new circuits, roughly 2,300 feet of run with suction, riser and
// liquid sizes, produced NO takeoff at all and the Circuits step read "No
// circuits yet". Silent, and the copper is most of a refrigeration bid.
//
// The text signals stay as tie-breakers below the sheet name, because they are
// genuinely ambiguous: "suction" appears on every refrigeration sheet ever
// drawn, Kysor's included.
//
// CommonJS, matching the Vercel function that uses it.

function formatFromSignals({
  remoteHdrSheet = false, bprText = false, kysorText = false, hvacText = false,
} = {}) {
  if (remoteHdrSheet) return 'bpr';          // decisive
  if (bprText && !kysorText) return 'bpr';
  if (kysorText) return 'kysor';
  if (hvacText) return 'hvac';
  return 'unknown';
}

module.exports = { formatFromSignals };
