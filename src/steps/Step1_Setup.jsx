import { useState, useRef } from 'react';
import { useStore, uid } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, Flag, EmptyState, Spinner } from '../components/UI.jsx';
import {
  parseAIJson, parseDocFile, parseExcelFile,
  fileToBase64, analyzeImageDoc, analyzeScopeDoc, isRCTask, analyzeRedlinePdf,
  looksLikeBidLetter, analyzeBidLetter, looksLikeFlatScopeDoc, analyzeFlatScopeDoc,
  emailFileToText, analyzeHvacPlanImage, analyzeHvacPlanPdf, analyzeHvacSpecText,
  analyzeHvacPlanImagesCombined
} from '../api/ai.js';
import ReviewExtraction from '../components/ReviewExtraction.jsx';
import { SupplierSwitcher, loadPriceBook, findPriceMatch } from '../components/PriceBook.jsx';
import { FileList } from '../components/FileViewer.jsx';
import JobInfo from '../components/JobInfo.jsx';
import { maxWeekNumber, schedDateLabel, scanScheduleDate, scanScheduleTime, scanRcFirstCaseNight, firstCaseMoveNight, extractRcSchedule, scheduleCrossCheck, PRECON_RE, PRECON_FALLBACK_RE, RCC_RE } from '../components/scheduleDates.js';
import { extractRackWorkSections, extractPartsList, normalizeDesc, isCO2Content } from '../components/scopeText.js';

const MODES = ['Commercial Refrigeration', 'Commercial HVAC', 'Residential HVAC'];
const MODE_ICONS = { 'Commercial Refrigeration': '❄️', 'Commercial HVAC': '🌀', 'Residential HVAC': '🏠' };
const MODE_DESC = {
  'Commercial Refrigeration': 'Grocery & retail refrigeration — circuits, rack work, case moves',
  'Commercial HVAC': 'RTUs, AHUs, split systems — equipment and labor',
  'Residential HVAC': 'Home systems — quick quote with equipment and lineset',
};

export default function Step1_Setup({ onNext }) {
  const { state, dispatch } = useStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [fileStatuses, setFileStatuses] = useState({}); // id -> 'ready'|'analyzing'|'done'|'error'
  const [results, setResults] = useState([]);
  const [pendingReview, setPendingReview] = useState(null); // null = no review screen showing; array = items to review
  const fileRef = useRef();

  // Store actual File objects in a ref (not React state) to prevent serialization issues
  const fileObjects = useRef({}); // id -> File

  function setField(key, value) {
    dispatch({ type: 'SET', key, value });
  }

  function detectType(f) {
    const n = f.name.toLowerCase();
    if (n.match(/\.(xlsx?)$/)) return 'excel';
    if (n.match(/\.(xls)$/)) return 'xls';
    if (n.match(/\.(docx?)$/)) return 'scope';
    if (n.match(/\.(doc)$/)) return 'scope';
    if (n.match(/\.(pdf)$/)) return 'pdf';
    if (n.match(/\.(eml)$/)) return 'email';
    if (n.match(/\.(jpe?g|png|gif|webp|heic)$/)) return 'image';
    if (n.match(/\.(dwf|dwfx|dwg|dxf|rvt)$/)) return 'cad';
    return 'other';
  }

  function handleFiles(files) {
    const arr = Array.from(files);
    const newMeta = arr.map(f => {
      const id = uid();
      fileObjects.current[id] = f; // store File in ref
      const type = detectType(f);
      // Generate a blob URL for every file type so it can be handed off to
      // the native app on iOS (Pages for .docx, Numbers for .xlsx, etc.)
      // via a download anchor click in the file viewer.
      const previewUrl = URL.createObjectURL(f);
      return { id, name: f.name, size: f.size, type, mode: state.mode, previewUrl };
    });
    // Add to state (metadata only, no File object)
    dispatch({ type: 'SET', key: 'uploadedFiles', value: [...state.uploadedFiles, ...newMeta] });
    // Set statuses
    const newStatuses = {};
    newMeta.forEach(m => { newStatuses[m.id] = 'ready'; });
    setFileStatuses(prev => ({ ...prev, ...newStatuses }));
  }

  function removeFile(id) {
    delete fileObjects.current[id];
    dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.filter(f => f.id !== id) });
    setFileStatuses(prev => { const s = { ...prev }; delete s[id]; return s; });
  }

  // ── ANALYZE: builds a list of pending items for human review.
  // NOTHING here touches circuits/rackTasks/fieldTasks/rackParts/projName directly anymore.
  async function analyzeAll() {
    const modeFiles = state.uploadedFiles.filter(f => f.mode === state.mode && fileStatuses[f.id] !== 'done');
    if (modeFiles.length === 0 && !emailText.trim()) return;

    setAnalyzing(true);
    const newResults = [];
    const flags = [];
    const pending = []; // { id, kind, sourceType, fileName, data, status }
    const equipmentImports = []; // HVAC equipment parsed from a schedule
    let keyDates = null;         // pre-con / completion / job length from an ERF
    let rcNightStart = '';       // night-work start date from a schedule
    let preconFromDoc = '';      // pre-con date scanned from a schedule doc
    let preconTimeFromDoc = '';  // pre-con meeting time ("1:00 pm") from the doc
    let rccFromDoc = '';         // final store RCC date scanned from the schedule
    let rcNightSchedule = [];    // deterministic RC case-move nights (grouped)
    let aiDatedTasks = [];       // the AI's dated RC tasks, kept for cross-check
    let jobLengthFromDoc = '';   // total job length inferred by the AI
    // Provenance per key date: a DETERMINISTIC read (regex/grouped-schedule
    // scan of the document text) is authoritative and OVERWRITES a stored
    // value on re-upload — otherwise an early AI guess is cemented forever
    // (store 1086 kept showing the AI's Jun 11 after the scanner learned the
    // real Jun 3). AI-sourced dates still only fill blanks.
    let rcStartDet = false, preconDet = false, rccDet = false, jobLenDet = false;
    let projName = '';
    let projAddr = '';

    // Map a free-text equipment type from a schedule onto the HVAC type dropdown.
    // Maps a free-text type OR a bare equipment tag (AHU-1, EF-3, CU-1…) onto the
    // HVAC type dropdown. Plan sheets give a tag, not a spelled-out type, so the
    // tag prefix is often all we have to go on.
    function mapHvacType(t) {
      const s = String(t || '').toLowerCase();
      if (/rtu|rooftop/.test(s)) return 'Rooftop Unit (RTU)';
      if (/ahu|air handl/.test(s)) return 'Air Handling Unit (AHU)';
      if (/fcu|fan coil/.test(s)) return 'Fan Coil Unit (FCU)';
      if (/vav/.test(s)) return 'VAV Box';
      if (/mini.?split/.test(s)) return 'Mini Split — Condenser';
      if (/ashp|air.?source|heat pump|^hp\b|\bhp-/.test(s)) return 'Packaged Heat Pump';
      if (/condens|^cu\b|\bcu-|^ac\b|\bac-/.test(s)) return 'Split System — Condenser';
      if (/split/.test(s)) return 'Split System — Air Handler';
      if (/chiller|^ch\b|\bch-/.test(s)) return 'Chiller';
      if (/boiler|^b-\d|^bh\b|\bbh-/.test(s)) return 'Boiler';
      if (/erv/.test(s)) return 'Energy Recovery Ventilator (ERV)';
      if (/hrv/.test(s)) return 'Heat Recovery Ventilator (HRV)';
      if (/mau|make.?up/.test(s)) return 'Make-Up Air Unit (MAU)';
      if (/exhaust|^ef\b|\bef-|^tf\b|\btf-/.test(s)) return 'Exhaust Fan';
      return 'Other';
    }

    function pushPending(kind, sourceType, fileName, data) {
      pending.push({ id: uid(), kind, sourceType, fileName, data, status: sourceType === 'excel' ? 'accepted' : 'pending' });
    }

    // HVAC takeoff lines merge ACROSS files in the same batch: users shoot ONE
    // plan sheet in sections (left half, right half…), so the same device type
    // appears in several screenshots, each with that section's partial count.
    // Same description = same item, and the quantities SUM — the per-file
    // tally goes into the notes so an overlap between shots (the same diffuser
    // visible in two screenshots) is easy to spot and trim on review.
    let hvacSumFlagged = false;
    function pushHvacPart(fileName, data) {
      const key = normalizeDesc(data.desc);
      const existing = pending.find(p => p.kind === 'hvacPart' && normalizeDesc(p.data.desc) === key);
      const qty = Number(data.qty) || 0;
      if (existing) {
        const prev = Number(existing.data.qty) || 0;
        existing.data.qty = prev + qty;
        if (qty > 0) {
          // Start the tally with the first file's count the first time a
          // second file adds on — from then on each file appends its share.
          if (!/counted per screenshot/.test(existing.data.notes || '')) {
            existing.data.notes = [existing.data.notes, `counted per screenshot: ${existing.fileName}: ${prev}`].filter(Boolean).join(' · ');
          }
          existing.data.notes += `, ${fileName}: ${qty}`;
        }
        if (!hvacSumFlagged) {
          hvacSumFlagged = true;
          flags.push({ type: 'warn', text: 'Counts for repeated takeoff items were SUMMED across your screenshots (treated as different sections of one sheet). If any shots overlap, trim the double-counted qty on the review screen — each card lists the per-screenshot tally.', source: 'System' });
        }
        return;
      }
      pushPending('hvacPart', 'vision', fileName, data);
    }

    // Fold an HVAC mechanical-plan extraction into the same channels the rest of
    // the wizard uses: equipment units go to the Equipment step (via
    // equipmentImports), and air devices + duct/pipe runs become reviewable
    // takeoff notes (sizes/CFM the estimator prices up — we don't auto-price
    // them, since duct/pipe LENGTH is scaled off the sheet, not labeled).
    function handleHvacResult(hv, fileMeta) {
      if (!hv) { newResults.push(`🌀 ${fileMeta.name}: No HVAC takeoff could be read`); return; }
      const drawing = [hv.drawingNumber, hv.drawingTitle].filter(Boolean).join(' — ');
      if (hv.projectName && !projName) projName = hv.projectName;

      (hv.equipment || []).forEach(e => {
        // Same-batch dedupe by tag: three screenshots of one sheet must not
        // produce three RTU-1s. (The merge below already dedupes against
        // units previously added to the Equipment step.)
        const tag = (e.tag || '').trim().toUpperCase();
        if (tag && equipmentImports.some(x => (x.tag || '').trim().toUpperCase() === tag)) return;
        equipmentImports.push({
          id: uid(), tag: e.tag || '', type: mapHvacType(e.type || e.tag),
          tons: '', brand: '', model: '', refrigerant: 'R-410A', mca: '', mop: '',
          voltage: '', location: '', cost: 0, task: 'New Installation',
          notes: [e.type, e.notes].filter(Boolean).join(' · '),
        });
      });

      // Air devices and duct/pipe runs are MATERIALS, not notes — they stage
      // as reviewable HVAC material lines that land in the Equipment step's
      // parts table on accept (with price-book autofill). Diffusers/grilles
      // carry their counted qty; duct and pipe stage at qty 0 because plans
      // scale length off the drawing — the estimator enters footage/pounds.
      (hv.airDevices || []).forEach(d => {
        const desc = [`${d.tag ? d.tag + ' — ' : ''}${d.deviceType || 'Air device'}`, d.faceSize ? `${d.faceSize} face` : '', d.neckSize ? `${d.neckSize} neck` : '']
          .filter(Boolean).join(' · ');
        pushHvacPart(fileMeta.name, {
          desc, qty: Number(d.qty) || 1, unitCost: 0,
          notes: [d.cfm ? `${d.cfm} CFM` : '', drawing].filter(Boolean).join(' · '),
        });
      });
      (hv.ductRuns || []).forEach(r => {
        const label = r.shape === 'round' ? `${r.size} round duct` : `${r.size} duct`;
        // Sanity check the read: no real rectangular duct has a 1"–3" side.
        // "19x1" is the AI dropping a digit off "19x17" — flag it loudly so
        // the misread gets fixed before footage (and pounds) ride on it.
        const dims = String(r.size || '').match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
        const suspect = dims && Math.min(parseFloat(dims[1]), parseFloat(dims[2])) <= 3;
        if (suspect) {
          flags.push({ type: 'warn', text: `Duct size "${r.size}" looks misread (a ${Math.min(parseFloat(dims[1]), parseFloat(dims[2]))}" side isn't a real duct dimension — likely a dropped digit, e.g. 19x1 for 19x17). Verify on the plan and fix or delete the line.`, source: fileMeta.name });
        }
        // AI-estimated footage (measured against on-sheet references like
        // grid spacing or diffuser sizes) pre-fills qty as a BUDGET number —
        // clearly labeled so the estimator verifies it before it prices.
        const estLf = Math.max(0, Math.round(Number(r.estLengthFt) || 0));
        pushHvacPart(fileMeta.name, {
          desc: `Ductwork — ${label}${r.service ? ` (${r.service})` : ''}`,
          qty: estLf, unitCost: 0,
          notes: [
            suspect ? '⚠ SIZE LOOKS MISREAD — verify on plan' : '',
            estLf ? `~${estLf} LF is an AI ESTIMATE${r.lengthBasis ? ` (measured against: ${r.lengthBasis})` : ''} — verify by scaling the plan before pricing` : 'enter footage or lbs — plans scale length off the drawing',
            r.notes, drawing,
          ].filter(Boolean).join(' · '),
        });
      });
      (hv.pipeRuns || []).forEach(r => {
        pushHvacPart(fileMeta.name, {
          desc: `Pipe — ${r.size}${r.service ? ` ${r.service}` : ''}`,
          qty: 0, unitCost: 0,
          notes: ['enter footage', r.notes, drawing].filter(Boolean).join(' · '),
        });
      });
      (hv.hydronicZones || []).forEach(z => {
        const spec = [z.room, z.loadMBH ? `${z.loadMBH} MBH` : '', z.area ? `${z.area} sq ft` : '', z.loops ? `${z.loops} loop(s)` : '']
          .filter(Boolean).join(' · ');
        pushPending('note', 'vision', fileMeta.name, {
          desc: `${z.zone || 'Zone'}${spec ? ' — ' + spec : ''}`.trim(),
          notes: [drawing, z.notes].filter(Boolean).join(' — '), rawDesc: z.zone || 'zone',
        });
      });

      const totalCfm = (hv.airDevices || []).reduce((s, d) => s + (Number(d.cfm) || 0) * (Number(d.qty) || 1), 0);
      const totalMbh = (hv.hydronicZones || []).reduce((s, z) => s + (Number(z.loadMBH) || 0), 0);
      const bits = [
        `${(hv.equipment || []).length} unit(s)`,
        `${(hv.airDevices || []).length} air device type(s)`,
        totalCfm ? `${totalCfm.toLocaleString()} CFM total` : '',
        `${(hv.ductRuns || []).length} duct size(s)`,
        (hv.pipeRuns || []).length ? `${hv.pipeRuns.length} pipe run(s)` : '',
        (hv.hydronicZones || []).length ? `${hv.hydronicZones.length} heating zone(s)${totalMbh ? ` / ${Math.round(totalMbh)} MBH` : ''}` : '',
      ].filter(Boolean).join(' · ');
      flags.push({ type: 'info', text: `HVAC takeoff${drawing ? ` [${drawing}]` : ''}: ${bits}`, source: fileMeta.name });
      (hv.flags || []).forEach(f => flags.push({ ...f, source: fileMeta.name }));
      newResults.push(`🌀 ${fileMeta.name}: HVAC plan read — ${bits} (review on the Equipment step & Review screen)`);
      if (hv.summary) newResults.push(`   → ${hv.summary}`);
    }

    // Multiple screenshots in an HVAC batch are almost always SECTIONS of one
    // plan sheet, possibly overlapping. Analyzed one at a time, the model
    // can't know an area appears in two shots — so they go to the model
    // TOGETHER in a single request, where it can recognize the shared regions
    // and count each device once. If the combined read fails, fall back to
    // per-file passes (client sums counts and keeps the per-screenshot tally).
    const hvacGroupIds = new Set();
    if (/hvac/i.test(state.mode || '')) {
      const groupEntries = modeFiles
        .filter(f => f.type === 'image')
        .map(f => ({ meta: f, file: fileObjects.current[f.id] }))
        .filter(x => x.file);
      if (groupEntries.length > 1) {
        groupEntries.forEach(x => { hvacGroupIds.add(x.meta.id); });
        setFileStatuses(prev => ({ ...prev, ...Object.fromEntries(groupEntries.map(x => [x.meta.id, 'analyzing'])) }));
        const names = groupEntries.map(x => x.meta.name).join(' + ');
        let hv = null;
        try {
          hv = await analyzeHvacPlanImagesCombined(groupEntries.map(x => ({ file: x.file, name: x.meta.name })));
        } catch { /* fall back below */ }
        if (hv) {
          handleHvacResult(hv, { name: names });
          setFileStatuses(prev => ({ ...prev, ...Object.fromEntries(groupEntries.map(x => [x.meta.id, 'done'])) }));
        } else {
          // Combined read failed both attempts — release the files to the
          // normal per-file loop below so the batch still produces a takeoff.
          groupEntries.forEach(x => hvacGroupIds.delete(x.meta.id));
          newResults.push(`⚠ Reading the ${groupEntries.length} screenshots together failed — analyzing each separately. Same-item counts will be SUMMED; if the shots overlap, trim the double-count on the review screen.`);
        }
      }
    }

    for (const fileMeta of modeFiles) {
      if (hvacGroupIds.has(fileMeta.id)) continue;
      setFileStatuses(prev => ({ ...prev, [fileMeta.id]: 'analyzing' }));

      // Get actual File object from ref
      const file = fileObjects.current[fileMeta.id];
      if (!file) {
        newResults.push(`❌ ${fileMeta.name}: File not found — please re-upload`);
        setFileStatuses(prev => ({ ...prev, [fileMeta.id]: 'error' }));
        continue;
      }

      try {
        let parsed = null;
        // sourceType tracks HOW the data was obtained, so the review screen can show
        // appropriate confidence: 'vision' (photo, least reliable), 'doctext' (AI read
        // extracted document text, medium reliability), 'excel' (parsed cells directly,
        // most reliable — these auto-accept but are still visible for review).
        let sourceType = 'doctext';
        // Rack work + parts already read deterministically from this file's text
        // (normalized descs) — AI results matching these are skipped as duplicates.
        const detRackDescs = new Set();
        const detPartDescs = new Set();

        // HVAC jobs upload mechanical plan sheets (ductwork/piping plans,
        // equipment schedules), not refrigeration redlines/BPRs — route those to
        // the HVAC vision extractor, which reads equipment tags, air devices
        // (CFM), and duct/pipe sizes instead of circuits.
        const isHvacMode = /hvac/i.test(fileMeta.mode || state.mode || '');

        if (isHvacMode && (fileMeta.type === 'image' || fileMeta.type === 'pdf')) {
          sourceType = 'vision';
          const hv = fileMeta.type === 'pdf'
            ? await analyzeHvacPlanPdf(file, fileMeta.name)
            : await analyzeHvacPlanImage(file, fileMeta.name);
          handleHvacResult(hv, fileMeta);
          parsed = null; // handled in-place; skip the refrigeration mapping below

          // If the read came back EMPTY because the analysis pass timed out
          // (not because the sheet genuinely has nothing), leave the file in
          // 'error' so the next Analyze click retries it — 'done' files are
          // filtered out of re-analysis and "hit Analyze again" would be a
          // dead end otherwise.
          const gotNothing = !hv || (
            !(hv.equipment || []).length && !(hv.airDevices || []).length &&
            !(hv.ductRuns || []).length && !(hv.pipeRuns || []).length &&
            !(hv.hydronicZones || []).length
          );
          const analysisFailed = !hv || (hv.flags || []).some(f => /could not be analyzed/i.test(f.text || ''));
          if (gotNothing && analysisFailed) {
            newResults.push(`   ⚠ ${fileMeta.name}: analysis timed out — hit Analyze again to retry this file`);
            setFileStatuses(prev => ({ ...prev, [fileMeta.id]: 'error' }));
            continue;
          }

        } else if (fileMeta.type === 'image') {
          sourceType = 'vision';
          // Full image + overlapping high-res tiles, merged — so small schedule
          // cells / callout text on a dense photo survive the model's downscale.
          parsed = await analyzeImageDoc(file, fileMeta.name);
          const cCount = parsed?.circuits?.length || 0;
          const tCount = parsed?.fieldTasks?.length || 0;
          newResults.push(`🖼️ ${fileMeta.name}: Analyzed photo — ${cCount} circuit(s), ${tCount} field task(s) (AI read photo — review carefully)`);

        } else if (fileMeta.type === 'pdf') {
          // PDFs with no text-extractable schedule (redlines, blueprints, scanned
          // plans) are rendered page-by-page to images and read via vision, the
          // same approach as a photo upload. The redline-specific prompt avoids
          // inventing circuit lengths/sizes that aren't actually on the page —
          // these documents are field tasks/scope, not priced circuit data.
          sourceType = 'vision';
          parsed = await analyzeRedlinePdf(file, fileMeta.name);
          const taskCount = parsed?.fieldTasks?.length || 0;
          newResults.push(`📐 ${fileMeta.name}: Analyzed as redline/plan — ${taskCount} field task(s) found (AI read scanned pages — review carefully)`);

        } else if (fileMeta.type === 'excel' || fileMeta.type === 'xls') {
          sourceType = 'excel';
          const b64 = await fileToBase64(file);
          const res = await parseExcelFile(b64, fileMeta.name);

          if (res.format === 'parts-order-form') {
            // These are typically store/GC-supplied parts (Food Lion supplies
            // case ends, rack parts, etc.) — not priced line items for the RC's
            // bid. Surfaced as a flag so the contractor can see what work is
            // implied (which cases, what kind of rack work) without it
            // silently becoming a cost line or duplicating parts already
            // listed elsewhere (e.g. a scope-of-work doc repeating the same
            // rack parts list).
            const pof = res.partsOrderForm || {};
            const itemLines = (pof.items || []).map(i => [i.qty ? `${i.qty}×` : '', i.description, i.partNumber ? `(${i.partNumber})` : '', i.whereUsed ? `— used on: ${i.whereUsed}` : ''].filter(Boolean).join(' ')).join(' | ');
            flags.push({
              type: 'info',
              text: `${pof.formType === 'case ends' ? 'Case ends' : pof.formType === 'rack parts' ? 'Rack parts' : 'Parts'} order form (likely store/GC-supplied, not RC-priced): ${itemLines || 'see file'}${pof.summary ? ' — ' + pof.summary : ''}`,
              source: fileMeta.name,
            });
            newResults.push(`📋 ${fileMeta.name}: Parts order form — ${pof.items?.length || 0} item(s) found, added as a reference flag (not priced)`);
          } else if (res.keyDates) {
            // Equipment Request Form → pre-con / completion / job length.
            keyDates = res.keyDates;
            const parts = [];
            if (res.keyDates.preconDate) parts.push(`pre-con ${res.keyDates.preconDate}`);
            if (res.keyDates.jobLengthWeeks) parts.push(`~${res.keyDates.jobLengthWeeks} week job`);
            newResults.push(`📅 ${fileMeta.name}: Key dates found — ${parts.join(' · ') || 'see ERF'}`);
          } else if (res.equipment?.length) {
            // HVAC equipment schedule — map units onto the Equipment step.
            res.equipment.forEach(e => equipmentImports.push({
              id: uid(), tag: e.tag || '', type: mapHvacType(e.type),
              tons: e.tons || e.cfm || '', brand: e.brand || '', model: e.model || '',
              refrigerant: 'R-410A', mca: '', mop: '', voltage: '', location: '',
              cost: 0, task: e.isNew === false ? 'Replacement' : 'New Installation',
              notes: e.notes || '',
            }));
            if (res.storeName && !projName) projName = res.storeName;
            newResults.push(`🌀 ${fileMeta.name}: ${res.equipment.length} HVAC unit(s) found — added to Equipment (review on the Equipment step)`);
            if (res.summary) newResults.push(`   → ${res.summary}`);
          } else {
            // Only circuits with a readable ID can populate the Circuits step.
            // Count what's actually usable (not every row that looked circuit-ish)
            // and flag any dropped for a missing ID, so "N found" never disagrees
            // with what shows up. A dropped circuit usually means the legend's
            // circuit-ID column wasn't recognized for that format.
            const usable = (res.circuits || []).filter(c => c.circuitId);
            usable.forEach(c => pushPending('circuit', 'excel', fileMeta.name, c));
            if (res.storeName && !projName) projName = res.storeName;
            const foundCount = res.circuits?.length || 0;
            const dropped = foundCount - usable.length;
            newResults.push(`📊 ${fileMeta.name}: ${usable.length} circuit(s) found [${res.format || 'excel'}]`);
            if (dropped > 0) {
              flags.push({ type: 'warn', text: `${fileMeta.name}: ${dropped} row${dropped !== 1 ? 's' : ''} looked like a circuit but had no readable circuit ID, so ${dropped !== 1 ? 'they were' : 'it was'} skipped. The legend's circuit-ID column may be in a layout MechBid doesn't recognize yet — send the file so it can be added.`, source: fileMeta.name });
            }
            if (res.warning) flags.push({ type: 'warn', text: res.warning, source: fileMeta.name });
            if (res.summary) newResults.push(`   → ${res.summary}`);
          }

        } else if (fileMeta.type === 'email') {
          // Saved bid emails (.eml). Parse the body client-side, then route
          // through the same content detection as scope docs — a bid email is
          // usually a bid-invitation letter, but occasionally carries scope text.
          sourceType = 'doctext';
          const text = await emailFileToText(file);
          if (!text || text.trim().length < 20) throw new Error('Could not read email body — try pasting the text instead');
          { const p = scanScheduleDate(text, PRECON_RE) || scanScheduleDate(text, PRECON_FALLBACK_RE); if (p && !preconFromDoc) { preconFromDoc = p; preconDet = true; }
            const pt = scanScheduleTime(text, PRECON_RE) || scanScheduleTime(text, PRECON_FALLBACK_RE); if (pt && !preconTimeFromDoc) preconTimeFromDoc = pt;
            const n = scanRcFirstCaseNight(text); if (n) { rcNightStart = n; rcStartDet = true; }
            const rcc = scanScheduleDate(text, RCC_RE); if (rcc && !rccFromDoc) { rccFromDoc = rcc; rccDet = true; }
            const wk = maxWeekNumber(text); if (wk && !jobLengthFromDoc) { jobLengthFromDoc = `${wk} weeks`; jobLenDet = true; }
            const nights = extractRcSchedule(text); if (nights.length && !rcNightSchedule.length) rcNightSchedule = nights; }
          if (looksLikeBidLetter(text)) {
            parsed = await analyzeBidLetter(text, fileMeta.name);
            newResults.push(`✉️ ${fileMeta.name}: Bid email analyzed — ${parsed?.contacts?.length || 0} contact(s), ${parsed?.flags?.length || 0} flag(s)`);
          } else if (looksLikeFlatScopeDoc(text)) {
            parsed = await analyzeFlatScopeDoc(text, fileMeta.name);
            newResults.push(`✉️ ${fileMeta.name}: Email scope analyzed — ${parsed?.fieldTasks?.length || 0} field task(s)`);
          } else {
            parsed = await analyzeScopeDoc(text, fileMeta.name);
            newResults.push(`✉️ ${fileMeta.name}: Email analyzed — ${parsed?.fieldTasks?.length || 0} field task(s)`);
          }

        } else if (fileMeta.type === 'cad') {
          // Native CAD/viewer formats (.dwf/.dwg/.rvt) wrap the drawing in
          // proprietary binary streams no browser can read — the plan room
          // that issued them always has a PDF export of the same sheets,
          // and that's the readable version.
          flags.push({
            type: 'warn',
            text: `${fileMeta.name} is a CAD/viewer format MechBid can't read directly. Get the PDF export of the same sheet (plan rooms and GCs always have one — or open it in a free viewer like Autodesk Design Review and print to PDF), then upload that.`,
            source: fileMeta.name,
          });
          newResults.push(`📐 ${fileMeta.name}: CAD format — upload the PDF export of this sheet instead`);

        } else if (fileMeta.type === 'scope') {
          sourceType = 'doctext';
          const b64 = await fileToBase64(file);
          const docRes = await parseDocFile(b64, fileMeta.name);
          if (!docRes.text) throw new Error('Could not extract text from document');

          // Deterministic key dates straight from the schedule text — the
          // "MOBILIZE & PRE-CON MEETING" and "NIGHT WORK BEGINS" lines carry
          // their own date headers, so this is exact (not guessed from tasks).
          { const p = scanScheduleDate(docRes.text, PRECON_RE) || scanScheduleDate(docRes.text, PRECON_FALLBACK_RE); if (p && !preconFromDoc) { preconFromDoc = p; preconDet = true; }
            const pt = scanScheduleTime(docRes.text, PRECON_RE) || scanScheduleTime(docRes.text, PRECON_FALLBACK_RE); if (pt && !preconTimeFromDoc) preconTimeFromDoc = pt;
            const wk = maxWeekNumber(docRes.text); if (wk && !jobLengthFromDoc) { jobLengthFromDoc = `${wk} weeks`; jobLenDet = true; }
            // RC schedule / RC start / RCC are refrigeration concepts — an HVAC
            // job's construction schedule has no RC work to look for.
            if (!isHvacMode) {
              const nights = extractRcSchedule(docRes.text); if (nights.length && !rcNightSchedule.length) rcNightSchedule = nights;
              // RC start: prefer the grouped schedule's first case-move night
              // (handles every known format), then the raw-text scan, then the AI.
              const n = firstCaseMoveNight(nights) || scanRcFirstCaseNight(docRes.text); if (n) { rcNightStart = n; rcStartDet = true; }
              const rcc = scanScheduleDate(docRes.text, RCC_RE); if (rcc && !rccFromDoc) { rccFromDoc = rcc; rccDet = true; }
            }}

          // Deterministic rack-work sections ("RACK A" heading + task lines) and
          // PARTS LIST ("QTY - DESC" lines) — rigid enough to read exactly from
          // the text. AI extraction over a long chunked doc has dropped most of
          // these in practice (store 47: 1 of 13 parts survived, rack work
          // misfiled as notes), so the direct read is authoritative and the AI's
          // matching items are skipped as duplicates below.
          // Rack-work sections and the rack parts list are refrigeration-only.
          if (!isHvacMode) {
            const rackSections = extractRackWorkSections(docRes.text);
            rackSections.forEach(sec => sec.tasks.forEach(t => {
              detRackDescs.add(normalizeDesc(t));
              pushPending('rackTask', sourceType, fileMeta.name, {
                desc: t, rack: sec.rack, hrs: 0, notes: 'From scope doc rack work section',
                crewAssignment: {}, rawDesc: t,
              });
            }));
            const detParts = extractPartsList(docRes.text);
            detParts.forEach(p => {
              detPartDescs.add(normalizeDesc(p.desc));
              pushPending('part', sourceType, fileMeta.name, {
                partId: '', desc: p.desc, qty: p.qty, unit: 'ea', storeSupplied: true, unitCost: 0, total: 0,
              });
            });
            if (rackSections.length || detParts.length) {
              const taskCount = rackSections.reduce((s, r) => s + r.tasks.length, 0);
              newResults.push(`🔩 ${fileMeta.name}: read directly — ${taskCount ? `${taskCount} rack work item(s) on rack ${rackSections.map(r => r.rack).join(', ')}` : ''}${taskCount && detParts.length ? ', ' : ''}${detParts.length ? `${detParts.length} part(s) from the parts list` : ''}`);
            }
          }

          // Legacy .doc fell back to the crude raw-text reader (LibreOffice not
          // present in the serverless runtime) — words run together, which hurts
          // extraction. Tell the user, and how to get a clean read.
          if (docRes.method === 'raw-ascii') {
            flags.push({
              type: 'warn',
              text: `${fileMeta.name} was read with a basic text fallback (LibreOffice ${docRes.libreofficeAvailable === false ? 'is not available on the server' : 'unavailable'}), so some text may be run together and extraction may miss items. For a clean read, open it and "Save As" .docx, then re-upload.`,
              source: fileMeta.name,
            });
          }

          // .doc/.docx covers several genuinely different document types —
          // dated construction schedules and bid invitation letters both
          // commonly arrive this way. Detect which one this is from content,
          // not the file extension, and route to the matching prompt. Forcing
          // a bid letter through the schedule prompt mostly returns empty
          // arrays (no dates to find), which looks like a failed extraction
          // rather than "right tool, wrong document."
          if (looksLikeBidLetter(docRes.text)) {
            parsed = await analyzeBidLetter(docRes.text, fileMeta.name);
            const contactCount = parsed?.contacts?.length || 0;
            const flagCount = parsed?.flags?.length || 0;
            newResults.push(`📋 ${fileMeta.name}: Bid invitation letter analyzed — ${contactCount} contact(s), ${flagCount} flag(s) found`);
          } else if (isHvacMode) {
            // HVAC scope/spec text (Walmart CapX scopes, CSI spec sections
            // saved as .doc) — the refrigeration scope analyzers would hunt
            // for RC work that isn't there. Route to the HVAC spec analyzer
            // and fold results through the same channel as plan extractions.
            const hv = await analyzeHvacSpecText(docRes.text, fileMeta.name);
            handleHvacResult(hv, fileMeta);
            newResults.push(`📗 ${fileMeta.name}: HVAC scope/spec analyzed — ${(hv?.equipment || []).length} equipment type(s), ${(hv?.flags || []).length} flag(s)`);
            parsed = null;
          } else if (looksLikeFlatScopeDoc(docRes.text)) {
            parsed = await analyzeFlatScopeDoc(docRes.text, fileMeta.name);
            const fieldCount = parsed?.fieldTasks?.length || 0;
            const rackCount = parsed?.rackTasks?.length || 0;
            const partCount = parsed?.parts?.length || 0;
            newResults.push(`📄 ${fileMeta.name}: Flat scope of work analyzed — ${fieldCount} field task(s), ${rackCount} rack task(s), ${partCount} part(s) found`);
          } else {
            parsed = await analyzeScopeDoc(docRes.text, fileMeta.name);
            const fieldCount = parsed?.fieldTasks?.length || 0;
            const rackCount = parsed?.rackTasks?.length || 0;
            newResults.push(`📝 ${fileMeta.name}: Scope/schedule analyzed — ${fieldCount} field task(s), ${rackCount} rack task(s) found`);
          }
        }

        if (parsed) {
          // Project info — staged too, since AI can misread store names/addresses
          if (parsed.storeName || parsed.address) {
            let sName = (parsed.storeName || '').replace(/NON\s*/gi, '').trim();
            const chainMatch = sName.match(/food\s*lion|publix|kroger|harris\s*teeter|winn.?dixie|aldi|walmart/i);
            if (chainMatch) sName = chainMatch[0];
            // The AI sometimes returns the store number WITH its own "#"
            // ("#0047-A") — strip any leading #/whitespace before we add our
            // own, or the name renders as "Food Lion ##0047-A".
            const num = parsed.storeNumber ? String(parsed.storeNumber).replace(/^[#\s]+/, '').padStart(4, '0') : '';
            // Don't append the store number if the name already contains it
            // (e.g. storeName came back as "Food Lion #0047-A" — appending
            // " #0047-A" again would produce "Food Lion #0047-A #0047-A")
            const nameAlreadyHasNum = num && sName.includes(num);
            // Collapse doubled hashes as a final guard, whatever the source.
            const candidateName = (sName ? sName + (num && !nameAlreadyHasNum ? ' #' + num : '') : '').replace(/#{2,}/g, '#');
            if (candidateName || parsed.address) {
              pushPending('projectInfo', sourceType, fileMeta.name, {
                projName: candidateName, projAddr: parsed.address || '', storeNumber: num,
              });
            }
          }

          // Circuits
          (parsed.circuits || []).forEach(c => {
            if (c.circuitId) pushPending('circuit', sourceType, fileMeta.name, c);
          });

          // Field tasks (RC filtered). Redline extractions may include extra
          // context (circuit reference, location, stated size); schedule-doc
          // extractions carry a date/week instead — fold whichever fields are
          // present into notes so nothing is lost during review. Date is also
          // prefixed onto the description itself, since for a dated schedule
          // (night work windows, case-set sequencing) the timing is often as
          // important as the task text itself. date/circuitRef are ALSO kept
          // as their own fields (not just baked into desc) so that accepted
          // items can populate the dedicated RC Schedule view cleanly.
          // What's a note vs. billable labor:
          //  - Redline callouts (no date) → scope notes (what/where to pipe).
          //  - Any DATED task → schedule note: the construction schedule is used
          //    for timing (total days, start, case-move start, RCC date), not as
          //    labor line items. These feed the RC Schedule view, not Field Work.
          //  - Undated scope-of-work tasks → real Field Work labor.
          const isRedline = parsed.documentType === 'redline_callout';
          const bidAsLineItems = state.taskBidMode === 'lineItems';
          // Key dates — "not every schedule is the same," so the AI reads them
          // from MEANING (pre-con meeting day; the RC's own first case-move
          // night, which is distinct from the GC's general night-work start).
          // The deterministic regex scan above runs first when its markers are
          // present (exact on the Food Lion format); the AI fills in whatever
          // the regex couldn't, and both stay editable downstream as the final
          // safety net. Order of trust: regex marker → AI → crude task heuristic.
          if (!isRedline) {
            if (!preconFromDoc && parsed.preconDate) preconFromDoc = schedDateLabel(parsed.preconDate) || parsed.preconDate;
            if (!preconTimeFromDoc && parsed.preconTime) preconTimeFromDoc = parsed.preconTime;
            if (!rcNightStart && parsed.rcFirstNightDate) rcNightStart = schedDateLabel(parsed.rcFirstNightDate) || parsed.rcFirstNightDate;
            if (!rccFromDoc && parsed.rccDate) rccFromDoc = schedDateLabel(parsed.rccDate) || parsed.rccDate;
            if (!jobLengthFromDoc && parsed.jobLengthWeeks) jobLengthFromDoc = `${parsed.jobLengthWeeks} weeks`;
          }
          // First night-work / case-move dated task = RC night-work start date.
          if (!isRedline && !rcNightStart) {
            for (const t of (parsed.fieldTasks || [])) {
              const nighty = /night/i.test(t.date || '') || /\b(relocat|case\s*move)\b/i.test(t.desc || '');
              if (nighty && t.date) {
                rcNightStart = schedDateLabel(t.date) || '';
                if (rcNightStart) break;
              }
            }
          }
          // A CO₂/transcritical addendum is boilerplate in most Food Lion
          // scope docs now, but an HFC store never does that work — filter its
          // items out so they don't clutter the bid. Gated on the job's system
          // type: only skip CO₂ content when the store is HFC (the default).
          const filterCO2 = !isHvacMode && state.systemType !== 'CO2';
          let co2Skipped = 0;
          // Cradles are used on EVERY refrigeration job, CO₂ or HFC — never
          // drop a cradle/line-support item even if the addendum happens to
          // mention it alongside CO₂ language.
          const CO2_KEEP_RE = /\bcradle/i;
          const isCO2Item = (...parts) => {
            if (!filterCO2) return false;
            const text = parts.filter(Boolean).join(' ');
            if (CO2_KEEP_RE.test(text)) return false;
            return isCO2Content(text);
          };

          (parsed.fieldTasks || []).forEach(t => {
            if (isCO2Item(t.desc, t.notes)) { co2Skipped++; return; }
            // The RC-work filter is refrigeration-only — on an HVAC job every
            // extracted task is potential HVAC scope, there's no RC to filter for.
            if (t.desc && (isHvacMode || isRCTask(t.desc))) {
              const extraContext = [
                t.circuitRef ? `Circuit: ${t.circuitRef}` : '',
                t.location ? `Location: ${t.location}` : '',
                t.statedSize ? `Size: ${t.statedSize}` : '',
              ].filter(Boolean).join(' · ');
              const combinedNotes = [extraContext, t.notes].filter(Boolean).join(' — ');
              if (isRedline) {
                pushPending('note', sourceType, fileMeta.name, {
                  desc: t.desc, circuitRef: t.circuitRef || '', location: t.location || '', notes: combinedNotes, rawDesc: t.desc,
                });
              } else if (t.date) {
                // Dated tasks feed the RC Schedule. When a deterministic RC night
                // schedule was extracted from the doc (complete + grouped by
                // night), the deterministic one is authoritative — but the AI's
                // dated tasks are KEPT for the cross-check below instead of
                // discarded, so a wording the direct read doesn't know becomes
                // a visible warning rather than a silent miss.
                if (rcNightSchedule.length) { aiDatedTasks.push({ date: t.date, desc: t.desc }); return; }
                // HVAC jobs have no RC Schedule — keep the date readable in the
                // note text instead of feeding the refrigeration schedule view.
                if (isHvacMode) {
                  pushPending('note', sourceType, fileMeta.name, {
                    desc: `[${t.date}] ${t.desc}`, circuitRef: '', notes: combinedNotes, rawDesc: t.desc,
                  });
                  return;
                }
                pushPending('note', sourceType, fileMeta.name, {
                  desc: t.desc, date: t.date, circuitRef: t.circuitRef || '', notes: combinedNotes, rawDesc: t.desc,
                });
              } else if (bidAsLineItems) {
                pushPending('fieldTask', sourceType, fileMeta.name, {
                  desc: t.desc, men: 1, hrs: 0, notes: combinedNotes, crewAssignment: {},
                  circuitRef: t.circuitRef || '', rawDesc: t.desc,
                });
              } else {
                // Default: scope task is a note, labor estimated in bulk.
                pushPending('note', sourceType, fileMeta.name, {
                  desc: t.desc, circuitRef: t.circuitRef || '', notes: combinedNotes, rawDesc: t.desc,
                });
              }
            }
          });

          // Rack tasks — dated → schedule note; undated → the Rack step's task
          // list, always. taskBidMode only governs FIELD tasks (their labor can
          // be bulk-estimated from the circuit takeoff); rack labor has no bulk
          // estimator — the Rack step task table is its only source, so sending
          // rack work to notes leaves the rack labor section empty.
          (parsed.rackTasks || []).forEach(t => {
            if (isCO2Item(t.desc, t.notes)) { co2Skipped++; return; }
            if (t.desc) {
              // No Rack step on HVAC jobs — anything the AI called "rack work"
              // on an HVAC document is just a note.
              if (isHvacMode) {
                pushPending('note', sourceType, fileMeta.name, { desc: t.desc, notes: t.notes || '', rawDesc: t.desc });
                return;
              }
              if (detRackDescs.has(normalizeDesc(t.desc))) return; // already read directly from the text
              if (t.date) {
                pushPending('note', sourceType, fileMeta.name, {
                  desc: t.desc, date: t.date, notes: t.notes || '', rawDesc: t.desc,
                });
              } else {
                pushPending('rackTask', sourceType, fileMeta.name, {
                  desc: t.desc, rack: t.rack || '', hrs: 0, notes: t.notes || '', crewAssignment: {}, rawDesc: t.desc,
                });
              }
            }
          });

          // Parts → rack parts (refrigeration only — HVAC jobs have no Rack
          // step, so a parts list on an HVAC doc surfaces as notes instead)
          (parsed.parts || []).forEach(p => {
            if (isCO2Item(p.description)) { co2Skipped++; return; }
            if (p.description) {
              if (isHvacMode) {
                pushPending('note', sourceType, fileMeta.name, { desc: `Part: ${p.qty ? p.qty + ' × ' : ''}${p.description}`, notes: '', rawDesc: p.description });
                return;
              }
              if (detPartDescs.has(normalizeDesc(p.description))) return; // already read directly from the parts list
              pushPending('part', sourceType, fileMeta.name, {
                partId: p.partId || '', desc: p.description, qty: p.qty || 0, unit: 'ea', storeSupplied: true, unitCost: 0, total: 0,
              });
            }
          });

          // Flags — informational, pass through directly. On an HFC job, the
          // CO₂ addendum's own flags (K65, gas cooler, charge tables…) are
          // dropped and rolled into the one summary flag below.
          (parsed.flags || []).forEach(f => {
            if (filterCO2 && isCO2Content(f.text)) { co2Skipped++; return; }
            flags.push({ ...f, source: fileMeta.name });
          });
          if (co2Skipped > 0) {
            flags.push({ type: 'info', text: `Skipped ${co2Skipped} CO₂/transcritical addendum item${co2Skipped > 1 ? 's' : ''} — this scope carries the standard CO₂ addendum, but the job is set to HFC so it wasn't added to your bid. If this IS a CO₂ store, switch the system type on the Materials step and re-analyze.`, source: fileMeta.name });
          }
          if (parsed.nightWorkRequired) {
            flags.push({ type: 'warn', text: `NIGHT WORK REQUIRED: ${parsed.nightWorkDetails || 'See scope doc'}`, source: fileMeta.name });
          }

          // Bid invitation letter content — required bid categories, contacts,
          // and due date are surfaced as flags rather than tracked as their
          // own structured data, since they don't drive pricing the way
          // circuits/tasks/parts do. The supply/exclusion notes that matter
          // most (e.g. "Food Lion supplies the gas and drums") already came
          // through in parsed.flags above — this just adds the remaining
          // reference info from the same document.
          if (parsed.documentType === 'bid_letter') {
            if (parsed.bidCategories?.length) {
              flags.push({ type: 'info', text: `Bid must be broken down by: ${parsed.bidCategories.join(', ')}`, source: fileMeta.name });
            }
            if (parsed.contacts?.length) {
              const contactLines = parsed.contacts.map(c => [c.name, c.role, c.phone, c.email].filter(Boolean).join(' — ')).join(' | ');
              flags.push({ type: 'info', text: `Contacts: ${contactLines}`, source: fileMeta.name });
            }
            if (parsed.dueInfo) {
              flags.push({ type: 'warn', text: `Due: ${parsed.dueInfo}`, source: fileMeta.name });
            }
          }

          if (parsed.summary) newResults.push(`   → ${parsed.summary}`);
        }

        setFileStatuses(prev => ({ ...prev, [fileMeta.id]: 'done' }));

      } catch (err) {
        console.error('File error:', fileMeta.name, err);
        newResults.push(`❌ ${fileMeta.name}: ${err.message}`);
        flags.push({ type: 'error', text: `${fileMeta.name}: ${err.message}`, source: 'System' });
        setFileStatuses(prev => ({ ...prev, [fileMeta.id]: 'error' }));
      }
    }

    // Deterministic RC schedule (grouped by night) — complete and gap-free, so
    // it supersedes the AI's per-task dated notes (which were skipped above when
    // this is present). One review item per night, tasks grouped.
    if (rcNightSchedule.length) {
      rcNightSchedule.forEach(n => pushPending('note', 'doctext', 'schedule', {
        desc: n.tasks.join(' · '), date: n.date, tasks: n.tasks, isNight: n.isNight,
        frozen: n.frozen, week: n.week, scheduleNight: true, rawDesc: n.header,
      }));
      newResults.push(`📅 RC schedule: ${rcNightSchedule.length} case-move night(s) read directly from the schedule`);
    }

    // Cross-check — second opinion on the schedule. The direct read is exact
    // but literal; the AI reads loosely. Any date where the AI saw RC work
    // but the direct read captured nothing becomes a visible warning to
    // verify, instead of a silent miss.
    if (rcNightSchedule.length && aiDatedTasks.length) {
      const missed = scheduleCrossCheck(rcNightSchedule, aiDatedTasks);
      missed.slice(0, 6).forEach(m => flags.push({
        type: 'warn',
        text: `Cross-check: the AI read RC work on ${m.date} that the direct schedule read didn't capture — check that date in the schedule: "${String(m.desc).slice(0, 140)}"`,
        source: 'schedule cross-check',
      }));
      newResults.push(missed.length
        ? `⚠️ Cross-check: AI found RC work on ${missed.length} date(s) the direct read didn't — see Flags`
        : `✅ Cross-check: AI and the direct schedule read agree on RC dates`);
    }

    // Flags are low-risk (informational) — merge immediately.
    // Everything else waits in pendingReview until the user confirms it.
    dispatch({ type: 'MERGE', payload: {
      extractionResults: [...state.extractionResults, ...newResults],
      flags: [...state.flags, ...flags],
      // Key dates — pre-con from the ERF or the schedule's pre-con line, job
      // length from the ERF, RC night-work start from the schedule.
      // DETERMINISTIC reads (regex/grouped-schedule scans, ERF date cells)
      // overwrite what's stored — re-uploading a schedule refreshes the dates
      // even if an earlier AI guess (or older parser) filled them wrong.
      // AI-sourced dates still only fill blanks.
      ...(((keyDates && keyDates.preconDate) || preconFromDoc) && (preconDet || (keyDates && keyDates.preconDate) || !state.preconDate) ? { preconDate: (() => { const d = (keyDates && keyDates.preconDate) || preconFromDoc; return preconTimeFromDoc ? `${d} · ${preconTimeFromDoc}` : d; })() } : {}),
      ...(((keyDates && keyDates.jobLengthWeeks) || jobLengthFromDoc) && (jobLenDet || (keyDates && keyDates.jobLengthWeeks) || !state.jobLength) ? { jobLength: (keyDates && keyDates.jobLengthWeeks) ? `${keyDates.jobLengthWeeks} weeks` : jobLengthFromDoc } : {}),
      ...(rcNightStart && (rcStartDet || !state.rcStartDate) ? { rcStartDate: rcNightStart } : {}),
      ...(rccFromDoc && (rccDet || !state.rccDate) ? { rccDate: rccFromDoc } : {}),
      // HVAC equipment goes straight to the Equipment step (which is itself an
      // editable review list), deduped by tag against what's already there.
      ...(equipmentImports.length ? {
        hvacEquipment: [
          ...(state.hvacEquipment || []),
          ...equipmentImports.filter(e => !e.tag || !(state.hvacEquipment || []).some(x => x.tag && x.tag === e.tag)),
        ],
      } : {}),
    }});

    setResults(newResults);
    setAnalyzing(false);

    if (pending.length > 0) {
      setPendingReview(pending);
    }
  }

  // Called when the user finishes the review screen with their accepted items.
  function handleResolveReview(acceptedItems) {
    const newCircuits = [];
    const newRackTasks = [];
    const newFieldTasks = [];
    const newRackParts = [];
    const newHvacParts = []; // HVAC takeoff → Equipment step materials table
    const newScheduleItems = [];
    const newNotes = []; // redline scope notes → flags
    let projName = '';
    let projAddr = '';
    let storeNumber = '';

    acceptedItems.forEach(item => {
      if (item.kind === 'circuit' && item.data.circuitId) {
        if (!newCircuits.find(x => x.circuitId === item.data.circuitId) && !state.circuits.find(x => x.circuitId === item.data.circuitId)) {
          newCircuits.push({ id: uid(), ...item.data });
        }
      } else if (item.kind === 'fieldTask') {
        if (!newFieldTasks.find(x => x.desc === item.data.desc) && !(state.fieldTasks || []).find(x => x.desc === item.data.desc)) {
          newFieldTasks.push({ id: uid(), ...item.data });
        }
        // Any accepted field task that carries a date goes into the RC
        // Schedule view too — that's the whole point of preserving date as
        // its own field above, rather than only inside the bracketed desc.
        if (item.data.date) {
          newScheduleItems.push({
            id: uid(),
            date: item.data.date,
            desc: item.data.rawDesc || item.data.desc,
            circuitRef: item.data.circuitRef || '',
            notes: item.data.notes || '',
          });
        }
      } else if (item.kind === 'rackTask') {
        // Key on rack + desc: the same task legitimately repeats across racks
        // (store 47 changes the oil separator float on racks A, B, AND C) —
        // desc-only dedupe collapsed those into one.
        const rtKey = d => `${(d.rack || '').toUpperCase()}|${d.desc}`;
        if (!newRackTasks.find(x => rtKey(x) === rtKey(item.data)) && !state.rackTasks.find(x => rtKey(x) === rtKey(item.data))) {
          newRackTasks.push({ id: uid(), ...item.data });
        }
        if (item.data.date) {
          newScheduleItems.push({
            id: uid(),
            date: item.data.date,
            desc: item.data.rawDesc || item.data.desc,
            circuitRef: '',
            notes: item.data.notes || '',
          });
        }
      } else if (item.kind === 'note') {
        if (item.data.date) {
          // Dated schedule note → RC Schedule view (timing reference).
          newScheduleItems.push({
            id: uid(),
            date: item.data.date,
            // Grouped deterministic nights keep their joined-task desc; legacy
            // single-task notes fall back to their raw task text.
            desc: item.data.scheduleNight ? item.data.desc : (item.data.rawDesc || item.data.desc),
            circuitRef: item.data.circuitRef || '',
            notes: item.data.notes || '',
            // Grouped-night fields (absent on legacy items) drive the by-night display.
            ...(item.data.scheduleNight ? { tasks: item.data.tasks, isNight: item.data.isNight, frozen: item.data.frozen, week: item.data.week, header: item.data.rawDesc } : {}),
          });
        } else {
          // Redline scope note → a flag, with circuit prefix for quick reference.
          const text = item.data.circuitRef ? `[${item.data.circuitRef}] ${item.data.desc}` : item.data.desc;
          if (!newNotes.find(f => f.text === text)) {
            newNotes.push({ type: 'note', text, source: item.fileName });
          }
        }
      } else if (item.kind === 'part') {
        // Dedupe by part number when there is one, else by description —
        // extracted parts usually have NO part number, and keying on the empty
        // partId collapsed every part into the first one (store 47: 13 parts
        // in the list, only "CPC SENSORS" survived).
        const partKey = p => p.partId || normalizeDesc(p.desc);
        if (!newRackParts.find(x => partKey(x) === partKey(item.data)) && !state.rackParts.find(x => partKey(x) === partKey(item.data))) {
          newRackParts.push({ id: uid(), ...item.data });
        }
      } else if (item.kind === 'hvacPart') {
        // HVAC takeoff line (air device, duct run, pipe run) → the materials
        // table on the Equipment step. Autofill unit cost from the price book
        // when the user hasn't typed one — same learning loop as refrigeration.
        const hpKey = p => normalizeDesc(p.desc);
        if (item.data.desc && !newHvacParts.find(x => hpKey(x) === hpKey(item.data)) && !(state.hvacParts || []).find(x => hpKey(x) === hpKey(item.data))) {
          const qty = Number(item.data.qty) || 0;
          let unitCost = Number(item.data.unitCost) || 0;
          if (!unitCost) {
            const match = findPriceMatch(loadPriceBook(), { desc: item.data.desc });
            if (match) unitCost = Number(match.entry.price) || 0;
          }
          newHvacParts.push({ id: uid(), desc: item.data.desc, qty, unitCost, total: qty * unitCost, notes: item.data.notes || '' });
        }
      } else if (item.kind === 'projectInfo') {
        if (item.data.projName && !projName) projName = item.data.projName;
        if (item.data.projAddr && !projAddr) projAddr = item.data.projAddr;
        if (item.data.storeNumber && !storeNumber) storeNumber = item.data.storeNumber;
      }
    });

    dispatch({ type: 'MERGE', payload: {
      circuits: [...state.circuits, ...newCircuits],
      rackTasks: [...state.rackTasks, ...newRackTasks],
      fieldTasks: [...(state.fieldTasks || []), ...newFieldTasks],
      rackParts: [...state.rackParts, ...newRackParts],
      hvacParts: [...(state.hvacParts || []), ...newHvacParts],
      rcSchedule: [...(state.rcSchedule || []), ...newScheduleItems],
      flags: [...(state.flags || []), ...newNotes],
      ...(projName && !state.projName ? { projName } : {}),
      ...(projAddr && !state.projAddr ? { projAddr } : {}),
      ...(storeNumber && !state.storeNumber ? { storeNumber } : {}),
    }});

    setPendingReview(null);
  }

  function handleCancelReview() {
    setPendingReview(null);
  }

  // ── If there's a pending review, show that instead of the normal Setup screen ──
  if (pendingReview) {
    return (
      <ReviewExtraction
        pendingItems={pendingReview}
        onResolve={handleResolveReview}
        onCancel={handleCancelReview}
      />
    );
  }

  const modeFiles = state.uploadedFiles.filter(f => f.mode === state.mode);
  const hasFiles = modeFiles.length > 0 || emailText.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Mode selector */}
      <div>
        <SLabel>Job Type</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {MODES.map(m => (
            <div key={m} onClick={() => setField('mode', m)} style={{
              border: `2px solid ${state.mode === m ? colors.green : colors.border}`,
              background: state.mode === m ? colors.greenFaint : colors.card2,
              borderRadius: 10, padding: '14px 12px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{MODE_ICONS[m]}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 700, color: state.mode === m ? colors.green : colors.text }}>{m}</div>
              <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4, lineHeight: 1.4 }}>{MODE_DESC[m]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Project info */}
      <div>
        <SLabel>Project Info</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input value={state.projName} onChange={e => setField('projName', e.target.value)} placeholder="Project / Store Name" />
          <Input value={state.projAddr} onChange={e => setField('projAddr', e.target.value)} placeholder="Address" />
          <Input value={state.projGC} onChange={e => setField('projGC', e.target.value)} placeholder="General Contractor" />
          <Input value={state.projCont} onChange={e => setField('projCont', e.target.value)} placeholder="Contractor" />
          <Input type="date" value={state.projBidDate} onChange={e => setField('projBidDate', e.target.value)} />
        </div>
      </div>

      {/* Supplier */}
      <SupplierSwitcher
        value={state.preferredSupplier}
        onChange={supplier => setField('preferredSupplier', supplier)}
      />

      {/* Upload zone */}
      <div>
        <SLabel>Upload Documents</SLabel>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? colors.green : colors.border}`,
            borderRadius: 12, padding: '30px 20px', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? colors.greenFaint : 'transparent', transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 4 }}>Upload Any Files or Photos</div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.6 }}>
            Excel schedules, BPR sheets, scope docs, blueprints, redlines, bid emails, parts lists
          </div>
          <Btn variant="green" size="sm" style={{ marginTop: 14 }} onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>
            Choose Files
          </Btn>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          🔒 Uploaded documents are processed by third-party AI services (OpenAI / Anthropic) to extract takeoff data. Don't upload anything you're not authorized to share. See the Privacy Policy.
        </div>
      </div>

      {/* File list */}
      {modeFiles.length > 0 && (
        <Card>
          <SLabel>Uploaded Files</SLabel>
          <FileList fileStatuses={fileStatuses} />
        </Card>
      )}

      {/* Email paste */}
      <div>
        <SLabel>Or Paste Bid Email Text</SLabel>
        <textarea
          value={emailText}
          onChange={e => setEmailText(e.target.value)}
          placeholder="Paste bid email or scope text here..."
          style={{ width: '100%', minHeight: 100, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, color: colors.text, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {/* Task handling option */}
      <Card style={{ padding: '12px 16px' }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Scope tasks</div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>
              {state.taskBidMode === 'lineItems'
                ? 'Each task becomes a billable labor line (task-by-task bidding)'
                : 'Tasks are notes; you bid labor in bulk (crew/periods/labor units)'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ k: 'notes', label: 'Notes' }, { k: 'lineItems', label: 'Bid each task' }].map(o => (
              <button key={o.k} onClick={() => dispatch({ type: 'SET', key: 'taskBidMode', value: o.k })}
                style={{ padding: '6px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: `1px solid ${(state.taskBidMode || 'notes') === o.k ? colors.green : colors.border}`,
                  background: (state.taskBidMode || 'notes') === o.k ? colors.green : colors.surface,
                  color: (state.taskBidMode || 'notes') === o.k ? '#000' : colors.textDim }}>
                {o.label}
              </button>
            ))}
          </div>
        </Row>
      </Card>

      {/* Analyze button */}
      <Btn variant="green" onClick={analyzeAll} disabled={analyzing || !hasFiles}
        style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: 15 }}>
        {analyzing ? <><Spinner /> &nbsp;Analyzing...</> : '🔍 Analyze All Documents & Extract Takeoff'}
      </Btn>

      {/* Results */}
      {state.extractionResults.length > 0 && (
        <Card>
          <SLabel>AI Extraction Results</SLabel>
          {state.extractionResults.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: r.startsWith('❌') ? colors.red : colors.text, padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>{r}</div>
          ))}
        </Card>
      )}

      {/* Flags */}
      {state.flags.length > 0 && (
        <div>
          <SLabel>Flags & RC Requirements</SLabel>
          {state.flags.map((f, i) => <Flag key={i} flag={f} />)}
        </div>
      )}

      {/* RC Schedule — dated tasks accepted from schedule documents land here,
          separate from the quick Project Info fields above (which already
          cover name/address/store number) */}
      {state.mode === 'Commercial Refrigeration' && (state.rcSchedule || []).length > 0 && <JobInfo showStoreFields={false} />}

      {/* Next */}
      <Btn variant="green" onClick={onNext} style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: 15 }}>
        Next: {state.mode === 'Residential HVAC' ? 'Equipment & Materials' : state.mode === 'Commercial HVAC' ? 'Equipment' : 'Circuits'} →
      </Btn>
    </div>
  );
}
