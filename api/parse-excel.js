const ExcelJS = require('exceljs');

const CYAN = 'FF00FFFF';
const YELLOW = 'FFFFFF00';

function sizeToFraction(val) {
  if (val === null || val === undefined || val === 0) return '';
  const map = {
    0.25: '1/4"', 0.375: '3/8"', 0.5: '1/2"', 0.625: '5/8"',
    0.75: '3/4"', 0.875: '7/8"', 1.0: '1"', 1.125: '1-1/8"',
    1.25: '1-1/4"', 1.375: '1-3/8"', 1.5: '1-1/2"', 1.625: '1-5/8"',
    2.125: '2-1/8"'
  };
  const f = parseFloat(val);
  return map[Math.round(f * 1000) / 1000] || `${val}"`;
}

function getCellColor(cell) {
  try {
    const fill = cell.fill;
    if (!fill || fill.type !== 'pattern') return null;
    const fg = fill.fgColor;
    if (!fg) return null;
    if (fg.argb) return fg.argb;
    return null;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Get base64 Excel data from request
    const { fileData, fileName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No file data provided' });

    const buffer = Buffer.from(fileData, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const circuits = [];
    const storeName = [];
    let storeNo = '';
    let refrigerant = '';

    workbook.eachSheet((worksheet, sheetId) => {
      const sheetName = worksheet.name;
      if (!sheetName.startsWith('Rack')) return;
      const rack = sheetName.replace('Rack ', '');

      // Get store info from first sheet
      if (sheetId === 1) {
        worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
          if (rowNum > 10) return;
          row.eachCell((cell) => {
            const v = String(cell.value || '');
            if (v.includes('Store No')) {
              const next = row.getCell(cell.col + 1);
              if (next.value) storeNo = String(next.value);
            }
            if (v.includes('Customer')) {
              const next = row.getCell(cell.col + 1);
              if (next.value) storeName.push(String(next.value));
            }
          });
        });
      }

      const RUN_COL = 21;
      const SUC_H_COL = 23;
      const SUC_R_COL = 24;
      const LIQ_COL = 25;
      const EVAP_COL = 6;
      const APP_COL = 5;
      const HEADER_ROW = 13;

      worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum <= HEADER_ROW) return;

        const circCell = row.getCell(1);
        const circId = String(circCell.value || '').trim();
        if (!circId || !circId.startsWith(rack)) return;

        // Check for highlighting on first 6 cells
        let highlighted = false;
        let colorType = null;

        for (let c = 1; c <= 6; c++) {
          const color = getCellColor(row.getCell(c));
          if (color === CYAN) { highlighted = true; colorType = 'new'; break; }
          if (color === YELLOW) { highlighted = true; colorType = 'yellow'; break; }
        }

        if (!highlighted) return;

        const run = parseFloat(row.getCell(RUN_COL).value) || 0;
        const sh = sizeToFraction(row.getCell(SUC_H_COL).value);
        const sr = sizeToFraction(row.getCell(SUC_R_COL).value);
        const lh = sizeToFraction(row.getCell(LIQ_COL).value);
        const evap = parseFloat(String(row.getCell(EVAP_COL).value || '').replace('+', '')) || 0;
        const app = String(row.getCell(APP_COL).value || '');
        const tempType = evap < 0 ? 'low' : 'medium';
        const isRiserOnly = run === 0 && sr !== '';

        circuits.push({
          circuitId: circId,
          rack,
          runLength: run,
          riserLength: 20,
          sucHoriz: sh,
          sucRiser: sr,
          liqHoriz: lh,
          tempType,
          application: app,
          isRiserOnly,
          colorType,
          notes: colorType === 'yellow' ? 'Yellow highlight — verify work type' : ''
        });
      });
    });

    return res.status(200).json({
      circuits,
      storeName: storeName[0] || '',
      storeNumber: storeNo,
      refrigerant,
      summary: `${circuits.length} highlighted circuit(s) found across ${[...new Set(circuits.map(c => c.rack))].length} rack(s)`
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
