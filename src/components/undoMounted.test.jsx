import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import Step4_Materials from '../steps/Step4_Materials.jsx';
import StepHVACEquipment from '../steps/StepHVACEquipment.jsx';

// ── A BUTTON NOBODY CAN REACH IS NOT A BUTTON ───────────────────────────────
// Three times in this session a check has passed over something that was not
// wired up: the case-top switch where the test matched the checkbox while the
// generator ignored it, the support count short-circuited behind a source
// grep, and the running total that was mounted nowhere at all.
//
// So this does not grep for <UndoDelete />. It renders each screen, with a row
// already on the trail, and looks for the button on the page.
//
// "For the undo button can you make sure it's also on both hvac sides."

const row = (id, desc) => ({ id, desc, qty: 3, unit: 'ea', unitCost: 20, total: 60 });
const trail = key => ({ [key]: [{ item: row('gone', 'the row I deleted'), index: 0 }] });

const screen = (Step, state) => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={state}><Step /></StateProvider>
  </AuthProvider>,
);

describe('the undo bar is on the screen it belongs to', () => {
  it('refrigeration materials', () => {
    const html = screen(Step4_Materials, {
      ...initialState, mode: 'Commercial Refrigeration', deletedItems: trail('lineItems'),
    });
    expect(html).toMatch(/↩ Undo/);
    expect(html).toMatch(/the row I deleted/);
  });

  it('commercial HVAC parts', () => {
    const html = screen(StepHVACEquipment, {
      ...initialState, mode: 'Commercial HVAC', deletedItems: trail('hvacParts'),
    });
    expect(html, 'no undo on the commercial HVAC side').toMatch(/↩ Undo/);
    expect(html).toMatch(/the row I deleted/);
  });

  it('residential HVAC parts', () => {
    const html = screen(Step4_Materials, {
      ...initialState, mode: 'Residential HVAC', deletedItems: trail('resParts'),
    });
    expect(html, 'no undo on the residential side').toMatch(/↩ Undo/);
    expect(html).toMatch(/the row I deleted/);
  });
});

describe('it stays out of the way when there is nothing to undo', () => {
  it('shows no bar on a clean refrigeration list', () => {
    const html = screen(Step4_Materials, { ...initialState, mode: 'Commercial Refrigeration' });
    expect(html).not.toMatch(/↩ Undo/);
  });

  it('shows no bar on a clean HVAC list', () => {
    const html = screen(StepHVACEquipment, { ...initialState, mode: 'Commercial HVAC' });
    expect(html).not.toMatch(/↩ Undo/);
  });

  // Each screen reads its OWN list. A refrigeration trail must not surface an
  // undo button on the HVAC parts list, offering to restore a row that does
  // not belong there.
  it('does not show one list’s trail on another list’s screen', () => {
    const html = screen(StepHVACEquipment, {
      ...initialState, mode: 'Commercial HVAC', deletedItems: trail('lineItems'),
    });
    expect(html).not.toMatch(/↩ Undo/);
  });
});
