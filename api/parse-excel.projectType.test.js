import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const handler = require('./parse-excel.js');

// A remodel BPR highlights only the new circuits' pipe cells; the parser filters
// to those. A new store runs EVERY circuit and the legend isn't highlighted, so
// projectType:'new' must take all circuits instead of dropping the unmarked ones.
async function buildKwrs() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rack A');
  const circ = (r, id, run, sh, lh, highlight) => {
    const row = ws.getRow(r);
    row.getCell(1).value = id; row.getCell(7).value = 'Case ' + id; row.getCell(9).value = 20;
    row.getCell(21).value = run; row.getCell(23).value = sh; row.getCell(25).value = lh;
    if (highlight) for (const c of [23, 25]) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } };
    row.commit();
  };
  circ(14, 'A1', 100, '7/8', '1/2', true);    // highlighted — new on a remodel
  circ(15, 'A2', 120, '1-1/8', '5/8', false); // unmarked — existing on remodel, new on new-store
  circ(16, 'A3', 80, '7/8', '3/8', false);    // unmarked
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

function invoke(b64, projectType) {
  return new Promise(async (resolve) => {
    const res = { status: () => ({ json: resolve }), json: resolve };
    await handler({ method: 'POST', body: { fileData: b64, fileName: 'FL_test_KWRS.xlsx', projectType } }, res);
  });
}

describe('parse-excel new-store vs remodel circuit filtering', () => {
  it('remodel keeps only highlighted circuits', async () => {
    const out = await invoke(await buildKwrs(), 'remodel');
    expect((out.circuits || []).map(c => c.circuitId)).toEqual(['A1']);
  });

  it('new store takes every circuit — highlighting or not', async () => {
    const out = await invoke(await buildKwrs(), 'new');
    expect((out.circuits || []).map(c => c.circuitId).sort()).toEqual(['A1', 'A2', 'A3']);
    // every new-store circuit is a full run, not riser-only
    expect((out.circuits || []).every(c => !c.isRiserOnly)).toBe(true);
  });

  it('defaults to remodel when projectType is omitted', async () => {
    const out = await invoke(await buildKwrs(), undefined);
    expect((out.circuits || []).map(c => c.circuitId)).toEqual(['A1']);
  });
});
