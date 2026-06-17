import { useState, useRef } from 'react';
import { useStore, uid } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Flag, EmptyState, Spinner } from '../components/UI.jsx';
import {
  callClaudeVision, parseAIJson, parseDocFile, parseExcelFile,
  fileToBase64, imageToJpeg, analyzeScopeDoc, isRCTask
} from '../api/ai.js';
import ReviewExtraction from '../components/ReviewExtraction.jsx';

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
    if (n.match(/\.(jpe?g|png|gif|webp|heic)$/)) return 'image';
    return 'other';
  }

  function handleFiles(files) {
    const arr = Array.from(files);
    const newMeta = arr.map(f => {
      const id = uid();
      fileObjects.current[id] = f; // store File in ref
      return { id, name: f.name, size: f.size, type: detectType(f), mode: state.mode };
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
    let projName = '';
    let projAddr = '';

    function pushPending(kind, sourceType, fileName, data) {
      pending.push({ id: uid(), kind, sourceType, fileName, data, status: sourceType === 'excel' ? 'accepted' : 'pending' });
    }

    for (const fileMeta of modeFiles) {
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

        if (fileMeta.type === 'image') {
          sourceType = 'vision';
          const b64 = await imageToJpeg(file);
          const raw = await callClaudeVision(b64, fileMeta.name);
          if (raw) parsed = parseAIJson(raw);
          newResults.push(`🖼️ ${fileMeta.name}: Analyzed (AI read photo — review carefully)`);

        } else if (fileMeta.type === 'excel' || fileMeta.type === 'xls') {
          sourceType = 'excel';
          const b64 = await fileToBase64(file);
          const res = await parseExcelFile(b64, fileMeta.name);
          (res.circuits || []).forEach(c => {
            if (c.circuitId) pushPending('circuit', 'excel', fileMeta.name, c);
          });
          if (res.storeName && !projName) projName = res.storeName;
          newResults.push(`📊 ${fileMeta.name}: ${res.circuits?.length || 0} circuit(s) found [${res.format || 'excel'}]`);
          if (res.warning) flags.push({ type: 'warn', text: res.warning, source: fileMeta.name });
          if (res.summary) newResults.push(`   → ${res.summary}`);

        } else if (fileMeta.type === 'scope') {
          sourceType = 'doctext';
          const b64 = await fileToBase64(file);
          const docRes = await parseDocFile(b64, fileMeta.name);
          if (!docRes.text) throw new Error('Could not extract text from document');
          parsed = await analyzeScopeDoc(docRes.text, fileMeta.name);
          newResults.push(`📝 ${fileMeta.name}: Scope of work analyzed`);
        }

        if (parsed) {
          // Project info — staged too, since AI can misread store names/addresses
          if (parsed.storeName || parsed.address) {
            let sName = (parsed.storeName || '').replace(/NON\s*/gi, '').trim();
            const chainMatch = sName.match(/food\s*lion|publix|kroger|harris\s*teeter|winn.?dixie|aldi|walmart/i);
            if (chainMatch) sName = chainMatch[0];
            const num = parsed.storeNumber?.padStart(4, '0') || '';
            const candidateName = sName ? sName + (num ? ' #' + num : '') : '';
            if (candidateName || parsed.address) {
              pushPending('projectInfo', sourceType, fileMeta.name, {
                projName: candidateName, projAddr: parsed.address || '',
              });
            }
          }

          // Circuits
          (parsed.circuits || []).forEach(c => {
            if (c.circuitId) pushPending('circuit', sourceType, fileMeta.name, c);
          });

          // Field tasks (RC filtered)
          (parsed.fieldTasks || []).forEach(t => {
            if (t.desc && isRCTask(t.desc)) {
              pushPending('fieldTask', sourceType, fileMeta.name, { desc: t.desc, men: 1, hrs: 0, notes: t.notes || '', crewAssignment: {} });
            }
          });

          // Rack tasks
          (parsed.rackTasks || []).forEach(t => {
            if (t.desc) pushPending('rackTask', sourceType, fileMeta.name, { desc: t.desc, hrs: 0, notes: t.notes || '', crewAssignment: {} });
          });

          // Parts → rack parts
          (parsed.parts || []).forEach(p => {
            if (p.description) {
              pushPending('part', sourceType, fileMeta.name, {
                partId: p.partId || '', desc: p.description, qty: p.qty || 0, unit: 'ea', storeSupplied: true, unitCost: 0, total: 0,
              });
            }
          });

          // Flags — these are informational, not bid data, so they pass through directly
          (parsed.flags || []).forEach(f => flags.push({ ...f, source: fileMeta.name }));
          if (parsed.nightWorkRequired) {
            flags.push({ type: 'warn', text: `NIGHT WORK REQUIRED: ${parsed.nightWorkDetails || 'See scope doc'}`, source: fileMeta.name });
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

    // Flags are low-risk (informational) — merge immediately.
    // Everything else waits in pendingReview until the user confirms it.
    dispatch({ type: 'MERGE', payload: {
      extractionResults: [...state.extractionResults, ...newResults],
      flags: [...state.flags, ...flags],
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
    let projName = '';
    let projAddr = '';

    acceptedItems.forEach(item => {
      if (item.kind === 'circuit' && item.data.circuitId) {
        if (!newCircuits.find(x => x.circuitId === item.data.circuitId) && !state.circuits.find(x => x.circuitId === item.data.circuitId)) {
          newCircuits.push({ id: uid(), ...item.data });
        }
      } else if (item.kind === 'fieldTask') {
        if (!newFieldTasks.find(x => x.desc === item.data.desc) && !(state.fieldTasks || []).find(x => x.desc === item.data.desc)) {
          newFieldTasks.push({ id: uid(), ...item.data });
        }
      } else if (item.kind === 'rackTask') {
        if (!newRackTasks.find(x => x.desc === item.data.desc) && !state.rackTasks.find(x => x.desc === item.data.desc)) {
          newRackTasks.push({ id: uid(), ...item.data });
        }
      } else if (item.kind === 'part') {
        if (!newRackParts.find(x => x.partId === item.data.partId) && !state.rackParts.find(x => x.partId === item.data.partId)) {
          newRackParts.push({ id: uid(), ...item.data });
        }
      } else if (item.kind === 'projectInfo') {
        if (item.data.projName && !projName) projName = item.data.projName;
        if (item.data.projAddr && !projAddr) projAddr = item.data.projAddr;
      }
    });

    dispatch({ type: 'MERGE', payload: {
      circuits: [...state.circuits, ...newCircuits],
      rackTasks: [...state.rackTasks, ...newRackTasks],
      fieldTasks: [...(state.fieldTasks || []), ...newFieldTasks],
      rackParts: [...state.rackParts, ...newRackParts],
      ...(projName && !state.projName ? { projName } : {}),
      ...(projAddr && !state.projAddr ? { projAddr } : {}),
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
      </div>

      {/* File list */}
      {modeFiles.length > 0 && (
        <Card>
          <SLabel>Uploaded Files</SLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modeFiles.map(f => {
              const status = fileStatuses[f.id] || 'ready';
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: colors.surface, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 18 }}>
                    {{ excel: '📊', xls: '📊', scope: '📝', pdf: '📄', image: '🖼️' }[f.type] || '📄'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>
                      {(f.size / 1024).toFixed(0)}KB ·{' '}
                      {status === 'done' ? <span style={{ color: colors.green }}>✅ Analyzed</span> :
                       status === 'error' ? <span style={{ color: colors.red }}>❌ Error</span> :
                       status === 'analyzing' ? <span style={{ color: colors.yellow }}>⏳ Analyzing...</span> :
                       <span>Ready</span>}
                    </div>
                  </div>
                  <button onClick={() => removeFile(f.id)} style={{ background: 'transparent', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              );
            })}
          </div>
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

      {/* Next */}
      <Btn variant="green" onClick={onNext} style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: 15 }}>
        Next: {state.mode === 'Residential HVAC' ? 'Equipment & Materials' : 'Circuits'} →
      </Btn>
    </div>
  );
}
