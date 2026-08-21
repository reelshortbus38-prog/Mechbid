import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND, BRAND_HEAD, BRAND_TAIL, BRAND_TAGLINE } from './brand.js';

describe('the wordmark still spells the product name', () => {
  it('the two halves join back into the brand', () => {
    // This is the check that a split wordmark defeats. If the name changes and
    // only one half is updated, the logo on screen becomes a word nobody chose.
    expect(BRAND_HEAD + BRAND_TAIL).toBe(BRAND.toUpperCase());
  });

  it('neither half is empty, so the two-tone split is real', () => {
    expect(BRAND_HEAD.length).toBeGreaterThan(0);
    expect(BRAND_TAIL.length).toBeGreaterThan(0);
  });

  it('carries a tagline for the header', () => {
    expect(BRAND_TAGLINE).toMatch(/REFRIGERATION/);
    expect(BRAND_TAGLINE).toMatch(/HVAC/);
  });
});

describe('no screen hardcodes the old name', () => {
  // A plain grep for the old name came back clean while three screens were
  // still showing it, because it was never one string. This walks the files
  // that draw a logo and checks the rendered text, tags stripped out.
  const LOGO_FILES = [
    'src/components/Wizard.jsx',
    'src/steps/Step6_Proposal.jsx',
    'index.html',
  ];

  for (const file of LOGO_FILES) {
    it(`${file} has no trace of the old name, split or whole`, () => {
      const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      // Strip JSX/HTML tags and JS string-concatenation punctuation, so a name
      // broken across elements or quotes reads as one word again.
      const flattened = src.replace(/<[^>]*>/g, '').replace(/['"`{}+\s]/g, '');
      expect(flattened.toLowerCase()).not.toContain('mechbid');
    });
  }
});
