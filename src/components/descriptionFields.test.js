import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ── A DESCRIPTION HAS TO BE READABLE WITHOUT CLICKING INTO IT ────────────────
// The generated materials lines are written to be read in the field:
//
//   "Pipe Hangers / trapezes — COUNT ON SITE"
//   "3/8\" All-Thread Rod — ORDER FROM EXPERIENCE"
//   "1-3/8\" Pipe Saddles (Insuguard) @ 6ft spacing"
//
// In a single-line <input> they arrived as "COUNT ON SI", "ORDER FROM EXPE",
// "@ 6ft spa". The instruction is the half that gets cut — the part before the
// dash is the item, and the part after it is what the estimator is supposed to
// DO about it. An estimator scrolling a hundred lines will not click into each
// one to find out.
//
// TblArea (an auto-growing textarea) already existed for exactly this, and the
// comment on it in UI.jsx says so: it was added when extracted scope tasks were
// being cut off mid-sentence in the labor tables. It was never carried across
// to the seven description fields in materials, rack parts, HVAC parts,
// rentals and the price book.
//
// SOURCE-LEVEL on purpose. Nothing observable breaks when somebody adds an
// eighth description column with a TblInput: it renders, it accepts typing, it
// saves, every other test passes. The only thing wrong is that the estimator
// cannot read it, and the only place to catch that is here.

const ROOT = new URL('../', import.meta.url).pathname;

function sourceFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue; }
    if (/\.jsx?$/.test(p) && !/\.test\.jsx?$/.test(p)) out.push({ path: p, text: readFileSync(p, 'utf8') });
  }
  return out;
}

const files = sourceFiles();
const rel = p => p.slice(ROOT.length);

// A free-text field bound to .desc / .notes, or to a helper that returns one.
const LONG_TEXT = /value=\{[^}]*(?:\.desc\b|\.notes\b|[Dd]escription\()/;

function bindings(tag) {
  const hits = [];
  for (const { path, text } of files) {
    // [^<] rather than [^>]. These elements carry arrow functions — onChange=
    // {e=>updateItem(...)} — so a character class excluding '>' stops at the
    // arrow and matches nothing. The first version of this did exactly that:
    // it found zero TblArea AND zero TblInput, so "no description is on a
    // single-line input" passed by finding nothing to look at. Caught only by
    // the guard-over-nothing check above it, which is why that check is there.
    const re = new RegExp(`<${tag}\\b[^<]*?/>`, 'g');
    for (const m of text.match(re) || []) {
      if (LONG_TEXT.test(m)) hits.push({ path: rel(path), snippet: m.slice(0, 90) });
    }
  }
  return hits;
}

describe('description and note fields wrap instead of clipping', () => {
  it('finds some at all — a guard over nothing is not a guard', () => {
    expect(bindings('TblArea').length).toBeGreaterThan(5);
  });

  it('none of them is a single-line input', () => {
    const clipped = bindings('TblInput');
    expect(clipped, clipped.map(h => `${h.path}: ${h.snippet}`).join('\n')
      + '\n\nA <TblInput> is a single-line <input>: it clips its value at the width of the '
      + 'cell with no ellipsis and no wrap, so the end of the line is simply gone unless you '
      + 'click into the field and arrow across. Use <TblArea>, which is the same chrome on an '
      + 'auto-growing textarea.').toEqual([]);
  });
});

// ── AND THE COLUMN HAS TO BE WIDE ENOUGH TO WRAP INTO ────────────────────────
// A <textarea> has an intrinsic width of about 20 characters. Dropped into an
// auto-layout table it therefore asks for LESS room than the <input> it
// replaced, and the browser obliges — so the fix on its own can turn a clipped
// line into a two-word-wide ribbon, which is not better.
describe('the description column keeps its share of the table', () => {
  const TABLES = ['steps/Step4_Materials.jsx', 'steps/Step3_Rack.jsx'];

  it.each(TABLES)('%s gives Description an explicit width', name => {
    const f = files.find(x => rel(x.path) === name);
    expect(f, `${name} not found`).toBeTruthy();
    const header = f.text.split('\n').find(l => /h\s*===\s*'Description'/.test(l));
    expect(header, `${name} no longer sizes its Description column explicitly`).toBeTruthy();
    expect(header).toMatch(/width:\s*'\d+%'/);
  });
});
