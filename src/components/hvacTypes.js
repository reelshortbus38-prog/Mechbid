// ── HVAC EQUIPMENT TAG → TYPE MAPPING ────────────────────────────────────────────
// Maps a free-text equipment type OR a bare tag (AHU-1, CRAC-3, CHWP-2…) onto
// the HVAC equipment dropdown. Plan sheets give a tag prefix, not a spelled-out
// type, so the prefix is usually all there is to go on. Data-center / central-
// plant tags are matched FIRST because some overlap the generic comfort rules.
export function mapHvacType(t) {
  const s = String(t || '').toLowerCase();
  // ── Data-center / central-plant tags first ──
  if (/crah/.test(s)) return 'CRAH Unit (Chilled Water)';
  if (/crac/.test(s)) return 'CRAC Unit (DX)';
  if (/\bcdu\b|coolant distribution/.test(s)) return 'Coolant Distribution Unit (CDU)';
  if (/rear.?door|rdhx/.test(s)) return 'Rear-Door Heat Exchanger';
  if (/dry\s*cooler|fluid\s*cooler/.test(s)) return 'Dry Cooler / Fluid Cooler';
  if (/cooling\s*tower|^ct\b|\bct-/.test(s)) return 'Cooling Tower';
  if (/chwp|chilled\s*water\s*pump|chw.?pump/.test(s)) return 'Chilled Water Pump';
  if (/cwp|cdwp|condenser\s*water\s*pump|cond.*pump/.test(s)) return 'Condenser Water Pump';
  if (/air.?cooled.*chill|chill.*air.?cooled|\bacch\b/.test(s)) return 'Chiller — Air-Cooled';
  if (/water.?cooled.*chill|chill.*water.?cooled|\bwcch\b/.test(s)) return 'Chiller — Water-Cooled';
  // ── Comfort-HVAC tags ──
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
  if (/\bpump\b|^p-?\d/.test(s)) return 'Chilled Water Pump'; // generic pump default
  return 'Other';
}
