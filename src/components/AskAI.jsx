import { useState, useRef, useEffect } from 'react';
import { useStore } from '../state/store.js';
import { chatWithAI } from '../api/ai.js';
import { colors } from '../styles/theme.js';

// Compact, current snapshot of the job so the assistant can answer questions
// about THIS bid ("did I miss anything?", "what's my circuit count?") instead
// of only general HVAC/refrigeration knowledge. Kept short on purpose — it's
// prepended to every turn, so it stays a summary, not a data dump.
function jobContext(state) {
  if (!state) return 'No job loaded yet.';
  const lines = [];
  lines.push(`Job type: ${state.mode || 'unset'}${state.systemType ? ` (${state.systemType})` : ''}`);
  if (state.projName) lines.push(`Project: ${state.projName}`);
  const dates = [
    state.preconDate && `pre-con ${state.preconDate}`,
    state.rcStartDate && `RC night start ${state.rcStartDate}`,
    state.jobLength && `length ${state.jobLength}`,
  ].filter(Boolean);
  if (dates.length) lines.push(`Key dates: ${dates.join(' · ')}`);
  const counts = [
    (state.circuits || []).length && `${state.circuits.length} circuit(s)`,
    (state.fieldTasks || []).length && `${state.fieldTasks.length} field task(s)`,
    (state.rackParts || []).length && `${state.rackParts.length} rack part(s)`,
    (state.supplyItems || []).length && `${state.supplyItems.length} supply item(s)`,
    (state.hvacEquipment || []).length && `${state.hvacEquipment.length} HVAC unit(s)`,
    (state.rcSchedule || []).length && `${state.rcSchedule.length} schedule note(s)`,
  ].filter(Boolean);
  if (counts.length) lines.push(`Takeoff so far: ${counts.join(', ')}`);
  if ((state.flags || []).length) {
    const warns = state.flags.filter(f => f.type === 'warn' || f.type === 'error').slice(0, 6).map(f => f.text);
    if (warns.length) lines.push(`Open flags: ${warns.join(' | ')}`);
  }
  lines.push(`Markup ${state.markupPct || 0}%, materials tax ${state.materialsTaxPct || 0}%, bond ${state.bondPct || 0}%, permit $${state.permitFee || 0}.`);
  return lines.join('\n');
}

const SYSTEM = `You are the MechBid Assistant — an expert commercial refrigeration and HVAC estimator helping a contractor build an accurate bid inside the MechBid app.

You know refrigeration deeply (racks, circuits, suction/liquid sizing, CO2 transcritical, case moves, RCC) and HVAC (RTUs, AHUs, VAVs, ductwork, hydronic/radiant, CFM). Help with:
- Estimating questions (pipe sizing, labor, what a scope item means, what's typically excluded)
- Questions about the current bid (use the JOB CONTEXT provided)
- How to use MechBid (uploading prints/schedules, the wizard steps, key dates, calibration)

Be concise and practical — a working estimator's answer, not an essay. Use the job context when the question is about their bid. If you don't know something specific to their job, say so rather than inventing numbers. Never fabricate prices, part numbers, or code citations; if a real lookup is needed, say what to verify.`;

export default function AskAI() {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: 'assistant', content: "Hey — I'm your MechBid estimating assistant. Ask me about refrigeration or HVAC, this bid, or how to use the app." },
  ]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      // Prepend a fresh job snapshot to the latest user turn so the assistant
      // always sees the current state without bloating every prior message.
      const apiMsgs = next
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map((m, i, arr) =>
          (m.role === 'user' && i === arr.length - 1)
            ? { role: 'user', content: `JOB CONTEXT:\n${jobContext(state)}\n\nQUESTION:\n${m.content}` }
            : m
        );
      const reply = await chatWithAI(apiMsgs, SYSTEM);
      setMsgs(m => [...m, { role: 'assistant', content: reply || "Sorry — I didn't get a response. Try again." }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: `⚠️ ${e.message}. (The assistant needs the OpenRouter API key configured on the server.)` }]);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask the MechBid assistant"
        style={{
          position: 'fixed', bottom: 22, right: 22, zIndex: 1000,
          width: 56, height: 56, borderRadius: '50%', cursor: 'pointer',
          background: colors.green, border: 'none', color: '#062b12',
          fontSize: 24, boxShadow: '0 6px 22px rgba(34,197,94,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >💬</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 22, right: 22, zIndex: 1000,
      width: 'min(400px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 80px))',
      display: 'flex', flexDirection: 'column',
      background: colors.card, border: `1px solid ${colors.border2}`,
      borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.55)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, background: colors.card2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>💬</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: colors.text }}>MechBid Assistant</span>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '88%',
            background: m.role === 'user' ? colors.green : colors.card2,
            color: m.role === 'user' ? '#062b12' : colors.text,
            border: m.role === 'user' ? 'none' : `1px solid ${colors.border}`,
            borderRadius: 10, padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{m.content}</div>
        ))}
        {busy && (
          <div style={{ alignSelf: 'flex-start', color: colors.textDim, fontSize: 13, padding: '6px 12px' }}>Thinking…</div>
        )}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${colors.border}`, background: colors.card2 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about this bid, refrigeration/HVAC, or the app…"
            rows={2}
            style={{
              flex: 1, resize: 'none', background: colors.surface, color: colors.text,
              border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px',
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none',
            }}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            style={{
              background: busy || !input.trim() ? colors.border2 : colors.green,
              color: busy || !input.trim() ? colors.textDim : '#062b12',
              border: 'none', borderRadius: 8, padding: '10px 14px', cursor: busy || !input.trim() ? 'default' : 'pointer',
              fontWeight: 700, fontSize: 13,
            }}
          >Send</button>
        </div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 6 }}>Enter to send · Shift+Enter for a new line · answers can be wrong — verify prices & code</div>
      </div>
    </div>
  );
}
