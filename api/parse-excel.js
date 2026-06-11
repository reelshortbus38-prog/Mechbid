const ExcelJS = require('exceljs');

const CYAN = 'FF00FFFF';
const YELLOW = 'FFFFFF00';

function sizeToFraction(val) {
  if(!val || val === 0) return '';
  const map = {
    0.25:'1/4"',0.375:'3/8"',0.5:'1/2"',0.625:'5/8"',
    0.75:'3/4"',0.875:'7/8"',1.0:'1"',1.125:'1-1/8"',
    1.25:'1-1/4"',1.375:'1-3/8"',1.5:'1-1/2"',1.625:'1-5/8"',
    2.125:'2-1/8"'
  };
  const f = parseFloat(val);
  if(isNaN(f)) return String(val);
  return map[Math.round(f*1000)/1000] || f+'"';
}

function getCellColor(cell) {
  try {
    const fill = cell.fill;
    if(!fill || fill.type !== 'pattern') return null;
    const fg = fill.fgColor;
    if(!fg) return null;
    return fg.argb || null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const {fileData, fileName} = req.body;
    if(!fileData) return res.status(400).json({error:'No file data'});

    const buffer = Buffer.from(fileData, 'base64');
    const wb = new ExcelJS.Workbook();

    await Promise.race([
      wb.xlsx.load(buffer),
      new Promise((_,reject) => setTimeout(() => reject(new Error('Timeout loading Excel')), 8000))
    ]);

    const circuits = [];
    let storeName = '';
    let storeNo = '';

    // Column positions for Kysor Warren format
    const COL_CIRC_ID = 1;
    const COL_NOTE = 4;       // Heat Exchanger notes (New Piping Line, etc)
    const COL_APP = 7;        // Application / location description
    const COL_EVAP = 9;       // Evap °F temperature
    const COL_RUN = 21;       // Run Length (ft)
    const COL_VERT_RISER = 22; // Vertical Riser (ft)
    const COL_SUC_H = 23;     // Suction Horizontal size
    const COL_SUC_R = 24;     // Suction Riser size
    const COL_LIQ = 25;       // Liquid Horizontal size

    wb.eachSheet((ws, sheetId) => {
      const sName = ws.name;
      if(!sName.startsWith('Rack')) return;
      const rack = sName.replace('Rack ','');

      // Get store info from first sheet
      if(sheetId === 1) {
        for(let r = 1; r <= 8; r++) {
          const row = ws.getRow(r);
          row.eachCell((cell, colNum) => {
            const v = String(cell.value||'');
            if(v.includes('Store No')) {
              const next = ws.getRow(r).getCell(colNum+1);
              if(next.value) storeNo = String(next.value);
            }
            if(v === 'Food Lion') {
              if(!storeName) storeName = v;
            }
          });
        }
      }

      // Process circuit rows (header on row 13, data starts row 14)
      for(let rowNum = 14; rowNum <= 45; rowNum++) {
        const row = ws.getRow(rowNum);
        const circId = String(row.getCell(COL_CIRC_ID).value||'').trim();
        if(!circId || !circId.startsWith(rack)) continue;

        // Check highlight on first 6 cells
        let highlighted = false;
        let colorType = null;
        for(let c = 1; c <= 6; c++) {
          const color = getCellColor(row.getCell(c));
          if(color === CYAN) { highlighted = true; colorType = 'new'; break; }
          if(color === YELLOW) { highlighted = true; colorType = 'yellow'; break; }
        }
        if(!highlighted) continue;

        const run = parseFloat(row.getCell(COL_RUN).value) || 0;
        const riser = parseFloat(row.getCell(COL_VERT_RISER).value) || 20;
        const sh = sizeToFraction(row.getCell(COL_SUC_H).value);
        const sr = sizeToFraction(row.getCell(COL_SUC_R).value);
        const lh = sizeToFraction(row.getCell(COL_LIQ).value);
        const evap = parseFloat(String(row.getCell(COL_EVAP).value||'').replace('+','')) || 0;
        const app = String(row.getCell(COL_APP).value||'');
        const noteVal = String(row.getCell(COL_NOTE).value||'');
        const tempType = evap < 0 ? 'low' : 'medium';
        const isRiserOnly = run === 0 && sr !== '';

        circuits.push({
          circuitId: circId,
          rack,
          runLength: run,
          riserLength: riser,
          sucHoriz: sh,
          sucRiser: sr,
          liqHoriz: lh,
          tempType,
          application: app,
          isRiserOnly,
          colorType,
          notes: noteVal || (colorType === 'yellow' ? 'Yellow highlight — verify' : '')
        });
      }
    });

    const racks = [...new Set(circuits.map(c=>c.rack))];
    return res.status(200).json({
      circuits,
      storeName: storeName || 'Food Lion',
      storeNumber: storeNo,
      summary: `${circuits.length} highlighted circuit(s) across rack(s): ${racks.join(', ')}`
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
