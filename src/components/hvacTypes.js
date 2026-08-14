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
  // ACU / ACCU are the same animal as CU — a live sheet's own summary named
  // "an AC condensing unit (ACU-C-02)" while the app filed it under Other,
  // because the old pattern demanded a word break straight after "ac".
  if (/condens|^cu\b|\bcu-|^ac{1,2}u?\b|\bac{1,2}u?-/.test(s)) return 'Split System — Condenser';
  if (/split/.test(s)) return 'Split System — Air Handler';
  if (/chiller|^ch\b|\bch-/.test(s)) return 'Chiller';
  // ── Terminal heat ──
  // Checked BEFORE the boiler rule, which used to claim the BH- prefix. BH is
  // baseboard heater on every set that uses it (B- is the boiler), so a school's
  // fin-tube was being counted as boilers.
  if (/cabinet\s*(unit\s*)?heater|force[-\s]?flow|^cuh\b|\bcuh-|^ff\b|\bff-/.test(s)) return 'Cabinet Unit Heater (CUH)';
  if (/baseboard|fin[-\s]?tube|finned[-\s]?tube|radiation|^ftr\b|\bftr-|^bh\b|\bbh-|^fh\b|\bfh-/.test(s)) return 'Baseboard / Fin-Tube Heater';
  if (/duct\s*heater|reheat\s*coil|^dh\b|\bdh-|^hc\b|\bhc-/.test(s)) return 'Duct Heater';
  // UH / EUH / GUH. The \b guards keep this off AHU — "ahu-1" has no "uh-"
  // substring and no word break before its "uh" — but the AHU rule runs first
  // regardless.
  if (/unit\s*heater|^e?uh\b|\be?uh-|^guh\b|\bguh-/.test(s)) return 'Unit Heater';
  if (/boiler|^b-\d/.test(s)) return 'Boiler';
  if (/erv/.test(s)) return 'Energy Recovery Ventilator (ERV)';
  if (/hrv/.test(s)) return 'Heat Recovery Ventilator (HRV)';
  if (/mau|make.?up/.test(s)) return 'Make-Up Air Unit (MAU)';
  // Roof hoods (RH- series: intake/relief/exhaust/gravity hoods). A school set
  // carries 40+, and without their own type they all pool into "Other". Kitchen
  // hoods (Type I/II grease hoods, KH-) are a different animal — checked first
  // so they never land in the roof-hood bucket.
  if (/kitchen\s*hood|grease\s*hood|type\s*[i1l]{1,2}\s*hood|\bkh-/.test(s)) return 'Other';
  if (/roof\s*hood|gravity\s*(hood|vent(ilator)?)|(intake|relief)\s*hood|^rh\b|\brh-/.test(s)) return 'Roof Hood / Gravity Vent';
  if (/exhaust|^ef\b|\bef-|^tf\b|\btf-/.test(s)) return 'Exhaust Fan';
  if (/\bpump\b|^p-?\d/.test(s)) return 'Chilled Water Pump'; // generic pump default
  return 'Other';
}
