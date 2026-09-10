import { describe, it, expect } from 'vitest';

// ── EVERY SCREEN HAS TO COMPILE ─────────────────────────────────────────────
// This test exists because of a real miss. A JSX comment in the wrong place —
// inside an attribute list, where it is not a comment at all — broke
// `vite build` while all 1693 tests passed. No test imported Step5_Labor.jsx,
// so vitest never compiled it, and the only thing that caught it was the
// production build.
//
// The unit tests here are deliberately aimed at the pure modules: hangers,
// case hookup, copper rates, bid totals. That is the right place for them —
// the arithmetic is where the money is. But it left every .jsx file in the app
// untouched by the test run, which means a green suite said nothing at all
// about whether the app would even load.
//
// So: import every one of them. This asserts almost nothing about behaviour.
// It asserts the one thing the rest of the suite could not — that the file
// parses, that its imports resolve, and that nothing at module scope throws.
// That is the failure that takes the whole app down, and it is now impossible
// to ship it with a green run.
//
// import.meta.glob is Vite's, and it is resolved at build time, so a new
// screen is covered the moment it is added. Nobody has to remember to list it.
const modules = import.meta.glob('./{components,steps}/*.jsx');

// Test files that happen to be .jsx are not screens — importing one from
// inside another test file runs its describes in the wrong place.
const paths = Object.keys(modules).filter(p => !/\.test\.jsx$/.test(p)).sort();

describe('every screen compiles and loads', () => {
  it('finds the screens to check', () => {
    // A glob that silently matches nothing would make every test below pass
    // by vacuum, which is exactly the hole this file was written to close.
    expect(paths.length).toBeGreaterThan(15);
    expect(paths).toContain('./steps/Step5_Labor.jsx');
    expect(paths).toContain('./steps/Step6_Proposal.jsx');
  });

  for (const path of paths) {
    it(`${path} parses, resolves and evaluates`, async () => {
      const mod = await modules[path]();
      // Every screen in this app is a component module. If one ever stops
      // exporting anything, that is worth knowing too.
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
  }
});
