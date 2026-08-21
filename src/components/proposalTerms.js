// ── TWO DIFFERENT DISCLAIMERS, POINTING OPPOSITE WAYS ────────────────────────
// The app printed ONE, and it was the wrong one. It said the estimate "may have
// been generated with the assistance of automated extraction", that "the
// contractor/recipient is responsible for verifying all takeoff", and that "the
// preparer is not liable" — and it printed that on the proposal handed to a
// general contractor.
//
// That is the TOOL disclaiming to the ESTIMATOR, stapled to the estimator's own
// bid. Three things go wrong at once. It tells a GC the bid was machine-made.
// It tells the owner to verify a takeoff the contractor is responsible for. And
// a proposal that disclaims its own numbers is a weak offer — the whole purpose
// of the document is to stand behind a price for a stated period.
//
// So the two are separated by who is being warned:
//
//   ESTIMATOR_WARNING     screen only, never printed. The tool telling the
//                         estimator to check the extraction before sending.
//                         The same ground the app's Terms of Service covers.
//
//   PROPOSAL_TERMS        printed. The contractor's own conditions of bid —
//                         basis, access, changes, payment, acceptance. What a
//                         mechanical proposal actually carries.
//
// THESE ARE NOT LEGAL ADVICE. They are the ordinary conditions a mechanical
// proposal carries, written plainly, and they are EDITABLE and shop-level for
// exactly that reason. Payment terms, retainage and change-order language are
// commercial positions that belong to the company and should be reviewed by the
// company's own counsel before they go out.
//
// Pure — no React.

// Screen only. This is the tool talking to the person using it.
export const ESTIMATOR_WARNING =
  'Before you send this: quantities, sizes and scope on this bid may have come from automated extraction '
  + 'of the drawings, and prices may still be app defaults rather than your own. Check the takeoff against '
  + 'the final construction documents, and check anything still marked as a placeholder. This warning is '
  + 'for you and is not printed on the proposal.';

// Printed. The contractor's own conditions of bid.
export const DEFAULT_PROPOSAL_TERMS = [
  'This proposal is based on the drawings, specifications and addenda listed above. Work shown on documents '
  + 'issued after the date of this proposal, or on documents not listed, is not included.',
  'Pricing assumes normal working hours, Monday through Friday, and continuous uninterrupted access to the '
  + 'work areas. Premium time, phased or after-hours work, and remobilization are not included unless stated.',
  'Work areas are to be clear and accessible, with adequate laydown space and access for equipment and '
  + 'material handling at the time our work is scheduled.',
  'No extra work will be performed without prior written authorization. Changes in scope, quantity or '
  + 'schedule will be submitted as a change order for approval before proceeding.',
  'Progress billing monthly on work completed and materials stored. Payment net 30 days. Retainage per the '
  + 'terms of the executed contract.',
  'This proposal is not a contract until accepted in writing by both parties.',
];

// The documents a bid stands on. A proposal that does not say what it was
// priced from cannot defend itself when a revision turns up.
export function basisOfBid({ drawings = [], specSection = '', addenda = [], dated = '' } = {}) {
  const parts = [];
  const dwg = drawings.filter(d => String(d || '').trim());
  if (dwg.length) parts.push(`Drawings: ${dwg.join(', ')}`);
  if (String(specSection || '').trim()) parts.push(`Specification: ${specSection.trim()}`);
  const add = addenda.filter(a => String(a || '').trim());
  parts.push(add.length ? `Addenda acknowledged: ${add.join(', ')}` : 'Addenda acknowledged: none');
  if (String(dated || '').trim()) parts.push(`Dated: ${dated.trim()}`);
  return parts;
}

// A bid with no documents named is defensible only by memory. Worth saying once
// on the way out, and only when it is actually missing.
export function basisComplete(basis = {}) {
  const dwg = (basis.drawings || []).filter(d => String(d || '').trim());
  return dwg.length > 0;
}
