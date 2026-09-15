import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState } from '../state/store.js';
import PriceBookModal, { PriceMatchChip } from './PriceBook.jsx';

// ── THE CHIP HAS TO SAY WHOSE PRICE IT IS ───────────────────────────────────
// The book can now hold the same part from several houses. Handing over Bond's
// number on a job buying from Ferguson without saying so is the app inventing
// a price; showing nothing leaves a blank where a real figure exists.

const PRICEBOOK_KEY = 'coldgauge_pricebook_v1';
const noop = () => {};

function withBook(book, fn) {
  const real = globalThis.localStorage;
  const store = new Map([[PRICEBOOK_KEY, JSON.stringify(book)]]);
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
  try { return fn(); } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true });
  }
}

const chip = (book, supplier, props) => withBook(book, () => renderToStaticMarkup(
  <StateProvider initial={{ ...initialState, preferredSupplier: supplier }}>
    <PriceMatchChip onFill={noop} {...props} />
  </StateProvider>,
));

const BOOK = [
  { id: '1', partId: 'CU-118', desc: 'Copper tube 1-1/8', price: 11.00, unit: 'ft', supplier: 'Bond' },
  { id: '2', partId: 'CU-118', desc: 'Copper tube 1-1/8', price: 12.40, unit: 'ft', supplier: 'Ferguson' },
  { id: '3', partId: 'NITRO', desc: 'Nitrogen cylinder', price: 85, unit: 'ea', supplier: 'Bond' },
];

describe('the price chip', () => {
  it('shows the price from the house this job is buying from', () => {
    const out = chip(BOOK, 'Ferguson', { partId: 'CU-118', desc: 'Copper tube 1-1/8' });
    expect(out).toContain('$12');
    expect(out).not.toContain('Bond');
  });

  it('names the other house when only they have it', () => {
    // Offered, because a blank where a real figure exists helps nobody. And
    // labelled, because it is not this job's supplier's price.
    const out = chip(BOOK, 'Ferguson', { partId: 'NITRO', desc: 'Nitrogen cylinder' });
    expect(out).toContain('$85');
    expect(out).toContain('Bond');
  });

  it('renders nothing at all when the book has no match', () => {
    expect(chip(BOOK, 'Ferguson', { partId: 'NOPE', desc: 'Something else entirely' })).toBe('');
  });

  it('works on a book with no suppliers, exactly as it always did', () => {
    const plain = [{ id: '1', partId: 'CU-118', desc: 'Copper tube 1-1/8', price: 11, unit: 'ft' }];
    const out = chip(plain, 'Ferguson', { partId: 'CU-118', desc: 'Copper tube 1-1/8' });
    expect(out).toContain('$11');
    // No borrowed-from suffix on the LABEL. (The tooltip has always carried a
    // separator between the description and the part number — that is not it.)
    expect(out).toMatch(/\$11<\/button>|\$11<!-- -->/);
    expect(out).not.toContain('Ferguson');
  });
});

describe('the import screen', () => {
  const screen = () => withBook([], () => renderToStaticMarkup(
    <StateProvider initial={initialState}>
      <PriceBookModal onClose={noop} />
    </StateProvider>,
  ));

  it('asks whose catalog the file is before importing it', () => {
    // It decides where every row lands. Without it a second import overwrote
    // the first wherever two houses stock the same part.
    expect(screen()).toContain('Import as');
  });

  it('still renders the rest of the screen', () => {
    const out = screen();
    expect(out).toContain('Import CSV');
    expect(out).toContain('Export CSV');
  });
});
