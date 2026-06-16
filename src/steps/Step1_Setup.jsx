import { useState, useRef } from 'react';
import { useStore, uid } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, Col, Flag, EmptyState, Spinner } from '../components/UI.jsx';
import {
  callClaudeVision, parseAIJson, parseDocFile, parseExcelFile,
  fileToBase64, imageToJpeg, analyzeScopeDoc, isRCTask
} from '../api/ai.js';

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
  const fileRef = useRef();

  function setField(key, value) {
    dispatch({ type: 'SET', key, value });
  }

  // ── File handling ───────────────────────────────────────────────────────────
  async function handleFiles(files) {
    const newFiles = Array.from(files).map(f => ({
      id: uid(), file: f, name: f.name, size: f.size,
      type: detectType(f), status: 'ready', mode: state.mode,
    }));
    dispatch({ type: 'SET', key: 'uploadedFiles', value: [...state.uploadedFiles, ...newFiles] });
  }

  function detectType(f) {
    const n = f.name.toLowerCase();
    if (n.match(/\.(xlsx?|xls)$/)) return 'excel';
    if (n.match(/\.(docx?|doc)$/)) return 'scope';
    if (n.match(/\.(pdf)$/)) return 'pdf';
    if (n.match(/\.(jpe?g|png|gif|webp|heic)$/)) return 'image';
    return 'other';
  }

  function removeFile(id) {
    dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.filter(f => f.id !== id) });
  }

  // ── Analysis ────────────────────────────────────────────────────────────────
  async function analyzeAll() {
    const modeFiles = state.uploadedFiles.filter(f => f.mode === state.mode && f.status === 'ready');
    if (modeFiles.length === 0 && !emailText) return;

    setAnalyzing(true);
    const results = [];
    const flags = [...state.flags];
    const newCircuits = [...state.circuits];
    const newRackTasks = [...state.rackTasks];
    const newFieldTasks = [...(state.fieldTasks || [])];
    const newRackParts = [...state.rackParts];
    let jobMemory = { ...state.jobMemory };

    for (const fileObj of modeFiles) {
      dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'analyzing' } : f) });

      try {
        let parsed = null;

        if (fileObj.type === 'image') {
          const b64 = await imageToJpeg(fileObj.file);
          const raw = await callClaudeVision(b64, fileObj.name);
          if (raw) parsed = parseAIJson(raw);

        } else if (fileObj.type === 'excel') {
          const b64 = await fileToBase64(fileObj.file);
          const res = await parseExcelFile(b64, fileObj.name);
          if (res.circuits?.length) {
            res.circuits.forEach(c => {
              if (!newCircuits.find(x => x.circuitId === c.circuitId)) {
                newCircuits.push({ id: uid(), ...c });
              }
            });
          }
          results.push(`📊 ${fileObj.name}: ${res.circuits?.length || 0} circuits [${res.format || 'excel'}]`);
          if (res.warning) flags.push({ type: 'warn', text: res.warning, source: fileObj.name });
          dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'done' } : f) });
          continue;

        } else if (fileObj.type === 'scope') {
          const b64 = await fileToBase64(fileObj.file);
          const docRes = await parseDocFile(b64, fileObj.name);
          if (docRes.text) {
            parsed = await analyzeScopeDoc(docRes.text, fileObj.name);
          }
        }

        if (parsed) {
          // Store name
          if (parsed.storeName && !state.projName) {
            let sName = parsed.storeName.replace(/NON\s*/gi, '').trim();
            const chainMatch = sName.match(/food\s*lion|publix|kroger|harris\s*teeter|winn.?dixie|aldi|walmart/i);
            if (chainMatch) sName = chainMatch[0];
            const num = parsed.storeNumber?.replace(/^0+/, '').padStart(4, '0') || '';
            dispatch({ type: 'SET', key: 'projName', value: sName + (num ? ' #' + num : '') });
          }
          if (parsed.address && !state.projAddr) dispatch({ type: 'SET', key: 'projAddr', value: parsed.address });

          // Circuits
          (parsed.circuits || []).forEach(c => {
            if (c.circuitId && !newCircuits.find(x => x.circuitId === c.circuitId)) {
              newCircuits.push({ id: uid(), ...c });
            }
          });

          // Field tasks
          (parsed.fieldTasks || []).forEach(t => {
            if (t.desc && isRCTask(t.desc) && !newFieldTasks.find(x => x.desc === t.desc)) {
              newFieldTasks.push({ id: uid(), desc: t.desc, men: 1, hrs: 0, notes: t.notes || '', crewAssignment: {} });
            }
          });

          // Rack tasks
          (parsed.rackTasks || []).forEach(t => {
            if (t.desc && !newRackTasks.find(x => x.desc === t.desc)) {
              newRackTasks.push({ id: uid(), desc: t.desc, hrs: 0, notes: t.notes || '', crewAssignment: {} });
            }
          });

          // Parts → rack parts
          (parsed.parts || []).forEach(p => {
            if (p.description && !newRackParts.find(x => x.partId === p.partId && x.desc === p.description)) {
              newRackParts.push({ id: uid(), partId: p.partId || '', desc: p.description, qty: p.qty || 0, unit: 'ea', storeSupplied: true, unitCost: 0, total: 0 });
            }
          });

          // Flags
          (parsed.flags || []).forEach(f => flags.push({ ...f, source: fileObj.name }));
          if (parsed.nightWorkRequired) {
            flags.push({ type: 'warn', text: `NIGHT WORK REQUIRED: ${parsed.nightWorkDetails || ''}`, source: fileObj.name });
          }

          // Job memory
          if (parsed.rcSchedule) jobMemory.schedule = parsed;

          results.push(`✅ ${fileObj.name} (${parsed.documentType || 'Document'}): Analyzed`);
        } else {
          results.push(`📄 ${fileObj.name}: Analyzed`);
        }

        dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'done' } : f) });

      } catch (err) {
        results.push(`❌ ${fileObj.name}: ${err.message}`);
        dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'error' } : f) });
      }
    }

    dispatch({ type: 'MERGE', payload: {
      extractionResults: results,
      flags,
      circuits: newCircuits,
      rackTasks: newRackTasks,
      fieldTasks: newFieldTasks,
      rackParts: newRackParts,
      jobMemory,
    }});
    setAnalyzing(false);
  }

  const [emailText, setEmailText] = useState('');
  const modeFiles = state.uploadedFiles.filter(f => f.mode === state.mode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Mode selector */}
      <div>
        <SLabel>Job Type</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {MODES.map(m => (
            <div
              key={m}
              onClick={() => setField('mode', m)}
              style={{
                border: `2px solid ${state.mode === m ? colors.green : colors.border}`,
                background: state.mode === m ? colors.greenFaint : colors.card2,
                borderRadius: 10, padding: '14px 12px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
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
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
        </div>
      </div>

      {/* File list */}
      {modeFiles.length > 0 && (
        <Card>
          <SLabel>Uploaded Files</SLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modeFiles.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: colors.surface, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 18 }}>
                  {{ excel: '📊', scope: '📝', pdf: '📄', image: '🖼️' }[f.type] || '📄'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>
                    {(f.size / 1024).toFixed(0)}KB · {
                      f.status === 'done' ? '✅ Analyzed' :
                      f.status === 'error' ? '❌ Error' :
                      f.status === 'analyzing' ? '⏳ Analyzing...' : 'Ready'
                    }
                  </div>
                </div>
                <button onClick={() => removeFile(f.id)} style={{ background: 'transparent', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            ))}
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
          style={{
            width: '100%', minHeight: 100, background: colors.surface,
            border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12,
            color: colors.text, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            outline: 'none', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Analyze button */}
      <Btn
        variant="green"
        onClick={analyzeAll}
        disabled={analyzing || (modeFiles.length === 0 && !emailText)}
        style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: 15 }}
      >
        {analyzing ? <><Spinner /> Analyzing...</> : '🔍 Analyze All Documents & Extract Takeoff'}
      </Btn>

      {/* Results */}
      {state.extractionResults.length > 0 && (
        <Card>
          <SLabel>AI Extraction Results</SLabel>
          {state.extractionResults.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: colors.text, padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>{r}</div>
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
