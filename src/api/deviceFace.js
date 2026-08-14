// ── DEVICE FACE SIZES MASQUERADING AS DUCT SIZES ─────────────────────────────
// A plan sheet writes an air device's FACE in exactly the notation it writes a
// duct size: "24x48". The only thing separating them is what sits in front of
// the number — a type letter and usually a CFM ("O 315 24x48", "J 720 24x12",
// "F 100 10x10") versus nothing at all on a drawn run ("20x18 UP/DN",
// "14x14 DN", "18x12").
//
// The analyzer reads the sheet, not the convention, so it files device faces as
// duct runs and they price as fabricated sheet metal by the pound. One live
// sheet — HVAC PLAN LEVEL 2 AREA B, a school job — carried 126 device callouts
// and every face on it was in duct notation.
//
// The aspect-ratio rule in ductwork.js catches the extreme cases (a 204x4
// linear diffuser is 51:1 and no duct is built past about 8:1). It cannot catch
// "O 315 24x48", because 24x48 is a perfectly ordinary duct size. Nothing about
// the SIZE tells you; only its context on the sheet does.
//
// So this reads the page's TEXT LAYER — the same independent copy of the sheet
// the size recheck uses — and asks one question per size:
//
//   Does this size EVER stand alone on this sheet?
//
// If it does, it is a duct size somewhere and stays duct, even if it also
// appears on device tags. "24x12" is a grille face in "J 580 24x12" and a duct
// size bare on a run, both on the same sheet, and no rule that looks at the
// number alone can separate those two — so this one refuses to try. Only a size
// that appears on device tags and NEVER once on its own gets moved.
//
// That conservatism is the whole design. The failure it prevents is expensive;
// the failure it could cause — stealing a real duct run — is worse, so it is
// made impossible rather than unlikely.
//
// Pure — no pdf.js, no React. Callers pass the page's text and the runs.

// What a device tag looks like immediately before a size. Either a type letter
// (or a two-character type like M1/M2) followed by a CFM, or the bare type
// letter with the CFM omitted, which this sheet does too ("F 22x10 (TYP 2)").
const TAGGED_BEFORE_RE = /(?:^|[\s(])(?:[A-Z]{1,2}\d?)\s+\d{2,4}\s*$|(?:^|[\s(])(?:M[12]|[A-Z])\s*$/;

// A grid bubble is a letter with a number stuck to it — M10, M33, MN.4 — and
// they run in pairs down the margin ("M10 M10 20x18 UP/DN"). Those must never
// read as a device tag, or the duct size that follows a column line gets moved.
//
// This deliberately costs us M1 and M2, which on that same sheet ARE device
// types and are indistinguishable from bubbles M10..M36 by shape alone. That is
// the right trade: every M1/M2 face on the sheet is a linear diffuser at 18:1
// or steeper (60x3, 72x4, 192x4, 312x4), and the aspect rule in ductwork.js
// already takes all of those off the duct path. Losing them here costs nothing
// and keeps a column line from ever stealing a duct run.
const GRID_BUBBLE_RE = /(?:^|\s)[A-Z]{1,2}\d{1,2}(?:\.\d)?\s*$/;

const SIZE_RE = /(\d{1,3})\s*[x×]\s*(\d{1,3})\b/g;

// → Map size → { tagged, alone, typ, types:Set }
export function sizeContexts(pageText = '') {
  const text = String(pageText || '');
  const out = new Map();
  let m;
  SIZE_RE.lastIndex = 0;
  while ((m = SIZE_RE.exec(text))) {
    const size = `${Number(m[1])}x${Number(m[2])}`;
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const rec = out.get(size) || { tagged: 0, alone: 0, typ: 0, types: new Set() };

    // UP / DN / UP-DN after a size is a riser callout — unambiguously duct, and
    // worth trusting over anything in front of it.
    const isRiser = /^\s*(?:UP\/DN|UP|DN)\b/.test(after);
    const tagged = !isRiser && !GRID_BUBBLE_RE.test(before) && TAGGED_BEFORE_RE.test(before);

    if (tagged) {
      rec.tagged++;
      const t = before.match(/(?:^|[\s(])([A-Z]{1,2}\d?)\s+\d{2,4}\s*$|(?:^|[\s(])(M[12]|[A-Z])\s*$/);
      if (t) rec.types.add(t[1] || t[2]);
      const typ = after.match(/^\s*\(TYP\.?\s*(\d+)\)/i);
      rec.typ += typ ? Number(typ[1]) : 1;
    } else {
      rec.alone++;
    }
    out.set(size, rec);
  }
  return out;
}

// Sizes on this sheet that are device faces and nothing else.
export function deviceFaceSizes(pageText = '') {
  const out = new Map();
  for (const [size, rec] of sizeContexts(pageText)) {
    if (rec.tagged > 0 && rec.alone === 0) out.set(size, rec);
  }
  return out;
}

const normSize = s => {
  const m = String(s || '').match(/(\d{1,3})\s*[x×]\s*(\d{1,3})/);
  return m ? `${Number(m[1])}x${Number(m[2])}` : '';
};

// runs: parsed.ductRuns. Returns the runs that survive, the air devices lifted
// out of them, and a flag per move so nothing changes silently.
export function dropDeviceFaces(runs = [], pageText = '', label = '') {
  const faces = deviceFaceSizes(pageText);
  if (!faces.size) return { runs, devices: [], flags: [] };
  const kept = [], devices = [], flags = [];
  const pfx = label ? `${label}: ` : '';

  for (const r of runs) {
    const size = normSize(r?.size);
    const rec = size && r?.shape !== 'round' ? faces.get(size) : null;
    if (!rec) { kept.push(r); continue; }
    const types = [...rec.types].filter(Boolean);
    const type = types.length === 1 ? types[0] : '';
    devices.push({
      tag: type, deviceType: type ? `Type ${type} air device` : 'Air device',
      faceSize: size, neckSize: '', cfm: 0, qty: rec.typ || rec.tagged,
      notes: `lifted out of ductwork — reads as a device face on ${label || 'this sheet'}`,
    });
    flags.push({ type: 'warn', text:
      `${pfx}"${size}" was read as a duct size, but on this sheet it only ever appears as an AIR DEVICE face — ${rec.tagged} tag(s)${type ? ` of type ${type}` : ''} and not once standing alone on a run. It has been moved to air devices (${rec.typ || rec.tagged} ea) so it is not priced as fabricated sheet metal. Confirm the count and the device type against the schedule.` });
  }
  return { runs: kept, devices, flags };
}
