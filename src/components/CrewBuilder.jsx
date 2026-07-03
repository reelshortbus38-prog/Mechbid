import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn, Input, Row, SLabel } from './UI.jsx';
import { uid } from '../state/store.js';

const DEFAULT_ROLES = [
  { role: 'Technician', rate: 75 },
  { role: 'Helper', rate: 50 },
  { role: 'Foreman', rate: 100 },
  { role: 'Apprentice', rate: 40 },
];

export default function CrewBuilder({ crew, onChange, compact = false }) {
  const [customRole, setCustomRole] = useState('');
  const [customRate, setCustomRate] = useState('');

  function addMember(role, rate) {
    onChange([...crew, { id: uid(), role, rate: parseFloat(rate) || 0, hrsPerDay: 8 }]);
  }

  function removeMember(id) {
    onChange(crew.filter(m => m.id !== id));
  }

  function updateMember(id, field, value) {
    onChange(crew.map(m => m.id === id ? { ...m, [field]: (field === 'rate' || field === 'hrsPerDay') ? parseFloat(value) || 0 : value } : m));
  }

  const crewRate = crew.reduce((s, m) => s + (parseFloat(m.rate) || 0), 0);

  return (
    <div>
      {/* Quick add buttons */}
      <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {DEFAULT_ROLES.map(r => (
          <Btn key={r.role} variant="surface" size="sm" onClick={() => addMember(r.role, r.rate)}>
            + {r.role}
          </Btn>
        ))}
      </Row>

      {/* Custom role */}
      <Row style={{ marginBottom: 12 }}>
        <Input
          value={customRole}
          onChange={e => setCustomRole(e.target.value)}
          placeholder="Custom role..."
          style={{ flex: 1 }}
        />
        <Input
          type="number"
          value={customRate}
          onChange={e => setCustomRate(e.target.value)}
          placeholder="Rate/hr"
          style={{ width: 90 }}
        />
        <Btn
          variant="ghost"
          size="sm"
          onClick={() => { if (customRole) { addMember(customRole, customRate); setCustomRole(''); setCustomRate(''); } }}
        >
          + Add
        </Btn>
      </Row>

      {/* Crew list */}
      {crew.length === 0 ? (
        <div style={{ fontSize: 12, color: colors.textDim, padding: '12px 0' }}>No crew added yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {crew.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 7, padding: '8px 12px',
            }}>
              <input
                value={m.role}
                onChange={e => updateMember(m.id, 'role', e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: colors.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: colors.textDim }}>$</span>
                <input
                  type="number"
                  value={m.rate}
                  onChange={e => updateMember(m.id, 'rate', e.target.value)}
                  style={{ width: 60, textAlign: 'right', background: 'transparent', border: 'none', color: colors.text, fontSize: 13, fontFamily: "'DM Mono', monospace", outline: 'none' }}
                />
                <span style={{ fontSize: 11, color: colors.textDim }}>/hr</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <input
                  type="number"
                  value={m.hrsPerDay ?? 8}
                  onChange={e => updateMember(m.id, 'hrsPerDay', e.target.value)}
                  style={{ width: 34, textAlign: 'right', background: 'transparent', border: 'none', color: colors.text, fontSize: 13, fontFamily: "'DM Mono', monospace", outline: 'none' }}
                />
                <span style={{ fontSize: 11, color: colors.textDim }}>hrs/day</span>
              </div>
              <button
                onClick={() => removeMember(m.id)}
                style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Crew rate badge */}
      {crew.length > 0 && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: colors.greenGlow, border: `1px solid ${colors.green}40`,
          borderRadius: 8, padding: '8px 14px',
        }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Crew Rate</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: colors.green }}>
            ${crewRate.toLocaleString()}/hr
          </span>
          <span style={{ fontSize: 11, color: colors.textDim }}>× {crew.length} people</span>
        </div>
      )}
    </div>
  );
}
