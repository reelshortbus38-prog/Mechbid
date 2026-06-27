import { useState, useEffect, useRef } from 'react';
import { useStore, saveJob, loadAllJobs, deleteJob, exportAllJobsJSON, importJobsJSON } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Row } from './UI.jsx';
import Step1_Setup from '../steps/Step1_Setup.jsx';
import Step2_Circuits from '../steps/Step2_Circuits.jsx';
import Step3_Rack from '../steps/Step3_Rack.jsx';
import Step4_Materials from '../steps/Step4_Materials.jsx';
import Step5_Labor from '../steps/Step5_Labor.jsx';
import Step6_Proposal from '../steps/Step6_Proposal.jsx';
import StepHVACEquipment from '../steps/StepHVACEquipment.jsx';
import PriceBookModal, { loadDefaultSupplier } from './PriceBook.jsx';
import FileViewerPanel from './FileViewer.jsx';

// ── STEP DEFINITIONS PER MODE ──────────────────────────────────────────────────
const STEPS_BY_MODE = {
  'Commercial Refrigeration': [
    { id: 'setup',     label: 'Setup',     icon: '📋', desc: 'Job info & documents' },
    { id: 'circuits',  label: 'Circuits',  icon: '⚡', desc: 'New line runs' },
    { id: 'rack',      label: 'Rack',      icon: '🔩', desc: 'Parts & tasks' },
    { id: 'materials', label: 'Materials', icon: '🔧', desc: 'Bid list & supply house' },
    { id: 'labor',     label: 'Labor',     icon: '👷', desc: 'Crew & periods' },
    { id: 'proposal',  label: 'Proposal',  icon: '📄', desc: 'Estimate & bid' },
  ],
  'Commercial HVAC': [
    { id: 'setup',     label: 'Setup',     icon: '📋', desc: 'Job info & documents' },
    { id: 'hvac_equip',label: 'Equipment', icon: '🌀', desc: 'Equipment schedule' },
    { id: 'labor',     label: 'Labor',     icon: '👷', desc: 'Crew & scope' },
    { id: 'proposal',  label: 'Proposal',  icon: '📄', desc: 'Estimate & bid' },
  ],
  'Residential HVAC': [
    { id: 'setup',     label: 'Setup',     icon: '📋', desc: 'Job info & documents' },
    { id: 'materials', label: 'Equipment', icon: '🏠', desc: 'Equipment, lineset & labor' },
    { id: 'proposal',  label: 'Proposal',  icon: '📄', desc: 'Estimate & bid' },
  ],
};

// ── STEP COMPONENTS ────────────────────────────────────────────────────────────
function getStepComponent(stepId, mode, onNext, onBack) {
  switch (stepId) {
    case 'setup':      return <Step1_Setup onNext={onNext} />;
    case 'circuits':   return <Step2_Circuits onNext={onNext} onBack={onBack} />;
    case 'rack':       return <Step3_Rack onNext={onNext} onBack={onBack} />;
    case 'hvac_equip': return <StepHVACEquipment onNext={onNext} onBack={onBack} />;
    case 'materials':  return <Step4_Materials onNext={onNext} onBack={onBack} />;
    case 'labor':      return <Step5_Labor onNext={onNext} onBack={onBack} />;
    case 'proposal':   return <Step6_Proposal onBack={onBack} />;
    default:           return <Step1_Setup onNext={onNext} />;
  }
}

export default function Wizard() {
  const { state, dispatch } = useStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [showJobs, setShowJobs] = useState(false);
  const [showPriceBook, setShowPriceBook] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState('');
  const [jobs, setJobs] = useState({});
  const importInputRef = useRef(null);

  const steps = STEPS_BY_MODE[state.mode] || STEPS_BY_MODE['Commercial Refrigeration'];
  const currentStep = steps[stepIndex] || steps[0];

  // How many items live in each step — shown as a badge on the step tabs so the
  // progress bar doubles as a map of the job (what's populated, where to jump).
  function stepCount(stepId) {
    switch (stepId) {
      case 'circuits':   return (state.circuits || []).length;
      case 'rack':       return (state.rackParts || []).length + (state.rackTasks || []).length;
      case 'hvac_equip': return (state.hvacEquipment || []).length;
      case 'materials':
        if (state.mode === 'Residential HVAC') return (state.resEquipment || []).length + (state.resParts || []).length;
        return (state.lineItems || []).length + (state.supplyItems || []).length;
      case 'labor':      return (state.laborPeriods || []).length + (state.fieldTasks || []).length;
      default:           return 0;
    }
  }

  // Reset to first step when mode changes
  useEffect(() => {
    setStepIndex(0);
  }, [state.mode]);

  // Clamp stepIndex if steps array shrinks
  useEffect(() => {
    if (stepIndex >= steps.length) setStepIndex(steps.length - 1);
  }, [steps.length]);

  useEffect(() => {
    setJobs(loadAllJobs());
  }, [showJobs]);

  // Apply the global default supplier once on first mount, if this is a fresh
  // session that hasn't had a supplier explicitly set yet (covers the very first
  // load before any job/save has happened).
  useEffect(() => {
    if (!state.jobId && !state.preferredSupplier) {
      dispatch({ type: 'SET', key: 'preferredSupplier', value: loadDefaultSupplier() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    const id = saveJob(state);
    if (id) {
      dispatch({ type: 'MERGE', payload: { jobId: id } });
      setSaveIndicator('✅ Saved');
      setTimeout(() => setSaveIndicator(''), 2000);
    }
  }

  function handleLoadJob(job) {
    dispatch({ type: 'LOAD_JOB', data: job.data });
    setShowJobs(false);
    setStepIndex(0);
  }

  function handleNewJob() {
    dispatch({ type: 'RESET' });
    // New jobs start from the current global default supplier, not whatever
    // the previous job happened to be using.
    dispatch({ type: 'SET', key: 'preferredSupplier', value: loadDefaultSupplier() });
    setShowJobs(false);
    setStepIndex(0);
  }

  function handleExportJobs() {
    const blob = new Blob([exportAllJobsJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mechbid-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function handleImportJobs(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const n = importJobsJSON(String(reader.result));
        setJobs(loadAllJobs());
        setSaveIndicator(`✅ Imported ${n} job${n !== 1 ? 's' : ''}`);
        setTimeout(() => setSaveIndicator(''), 2500);
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function goNext() {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  }

  function goBack() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ background: colors.card, borderBottom: `1px solid ${colors.border}`, padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, background: colors.green, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚙️</div>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                MECH<span style={{ color: colors.green }}>BID</span>
              </div>
              <div style={{ fontSize: 9, color: colors.textDim, letterSpacing: '0.05em' }}>REFRIGERATION & HVAC</div>
            </div>
          </div>

          {/* Project name */}
          {state.projName && (
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.projName}
            </div>
          )}

          {/* Actions */}
          <Row style={{ gap: 8, flexShrink: 0 }}>
            <Btn variant="surface" size="sm" onClick={() => setShowPriceBook(true)}>📖 Prices</Btn>
            <Btn variant="surface" size="sm" onClick={() => { setJobs(loadAllJobs()); setShowJobs(true); }}>💾 Jobs</Btn>
            <Btn variant="surface" size="sm" onClick={() => setShowDocs(true)}>📁 Docs</Btn>
            <Btn variant="green" size="sm" onClick={handleSave}>Save</Btn>
            {saveIndicator && <span style={{ fontSize: 11, color: colors.green }}>{saveIndicator}</span>}
          </Row>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', padding: '0 8px' }}>
          {steps.map((s, i) => {
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <button
                key={s.id}
                onClick={() => setStepIndex(i)}
                style={{
                  flex: 1, padding: '12px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: `3px solid ${isActive ? colors.green : isDone ? colors.green + '50' : 'transparent'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  transition: 'all 0.15s', minWidth: 60,
                }}
              >
                <div style={{ position: 'relative', fontSize: 18, opacity: isActive ? 1 : isDone ? 0.7 : 0.35 }}>
                  {s.icon}
                  {stepCount(s.id) > 0 && (
                    <span style={{
                      position: 'absolute', top: -6, right: -12, minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 8, background: colors.green, color: '#000', fontSize: 9, fontWeight: 800,
                      fontFamily: "'DM Mono', monospace", display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}>{stepCount(s.id)}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? colors.green : isDone ? colors.text : colors.textDim,
                  fontFamily: "'Syne', sans-serif",
                }}>{s.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
            {currentStep.icon} {currentStep.label}
          </div>
          <div style={{ fontSize: 12, color: colors.textDim }}>{currentStep.desc}</div>
        </div>
        {getStepComponent(currentStep.id, state.mode, goNext, goBack)}
      </div>

      {/* Price Book modal */}
      {showPriceBook && <PriceBookModal onClose={() => setShowPriceBook(false)} />}

      {/* Docs viewer modal */}
      {showDocs && <FileViewerPanel onClose={() => setShowDocs(false)} />}

      {/* Jobs modal */}
      {showJobs && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowJobs(false)}
        >
          <div
            style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: colors.green }}>💾 Saved Jobs</div>
              <Row style={{ gap: 8 }}>
                <Btn variant="surface" size="sm" onClick={handleExportJobs}>⬇ Backup</Btn>
                <Btn variant="surface" size="sm" onClick={() => importInputRef.current?.click()}>⬆ Restore</Btn>
                <input ref={importInputRef} type="file" accept=".json,application/json" onChange={handleImportJobs} style={{ display: 'none' }} />
                <Btn variant="green" size="sm" onClick={handleNewJob}>+ New Job</Btn>
                <button onClick={() => setShowJobs(false)} style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 22, cursor: 'pointer' }}>×</button>
              </Row>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {Object.values(jobs).length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>No saved jobs yet</div>
              ) : (
                Object.values(jobs)
                  .sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited))
                  .map(job => (
                    <div key={job.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${colors.border}`, gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => handleLoadJob(job)}>
                        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</div>
                        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3 }}>
                          {new Date(job.lastEdited).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {job.data?.mode ? ` · ${job.data.mode}` : ''}
                        </div>
                      </div>
                      <Row style={{ gap: 8, flexShrink: 0 }}>
                        <Btn variant="green" size="sm" onClick={() => handleLoadJob(job)}>Open</Btn>
                        <Btn variant="red" size="sm" onClick={() => { deleteJob(job.id); setJobs(loadAllJobs()); }}>Delete</Btn>
                      </Row>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
