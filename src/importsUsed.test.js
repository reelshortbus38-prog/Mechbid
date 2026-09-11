import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A HELPER YOU CALL BUT NEVER IMPORTED ────────────────────────────────────
// This caught nothing at the time and it should have. Wiring the manual-edit
// rescue into Step1_Setup.jsx, the call sites landed and the import line did
// not — a string replacement that silently matched nothing. Then:
//
//   vite build            passed. Nothing type-checks a bare identifier.
//   screens.test.js       passed. It imports the module; an undefined name
//                         inside a function body does not throw until called.
//   the whole suite       passed. No test reaches that merge.
//
// It would have thrown ReferenceError the first time somebody re-analyzed a
// file, in production, mid-upload. The files here are 1,500 lines long and the
// import sits a thousand lines above the call, which is exactly the shape that
// hides this.
//
// So: for the helper modules listed below, any file that CALLS one of their
// exports has to import it. Narrow on purpose — these are distinctive names
// unlikely to be shadowed by a local, which is what keeps it free of false
// alarms. Add a module here when its functions start being called far from
// the top of a long file.
const GUARDED = [
  'src/components/manualEdits.js',
  'src/components/hangers.js',
  'src/components/caseHookup.js',
  'src/components/purchaseUnits.js',
  'src/components/rentals.js',
  'src/components/outOfTown.js',
  'src/state/webStorage.js',
];

const SOURCES = import.meta.glob('./**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true });

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return [...names];
}

describe('every guarded helper that is called is imported', () => {
  for (const modPath of GUARDED) {
    const modName = modPath.split('/').pop().replace(/\.js$/, '');
    const names = exportsOf(read(modPath));

    it(`${modName} exports names worth guarding`, () => {
      expect(names.length, `${modPath} exported nothing this could check`).toBeGreaterThan(0);
    });

    it(`nothing calls ${modName}'s exports without importing them`, () => {
      const offenders = [];
      for (const [file, src] of Object.entries(SOURCES)) {
        if (file.endsWith('.test.js') || file.endsWith('.test.jsx')) continue;
        if (('src/' + file.replace(/^\.\//, '')) === modPath) continue;

        for (const name of names) {
          // Called as a function, and not as a property of something else
          // (`x.markEdited(...)` is somebody's own method, not this export).
          const called = new RegExp(`(^|[^\\w$.])${name}\\s*\\(`).test(src);
          if (!called) continue;
          const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(src);
          const declared = new RegExp(`(function|const|let|var)\\s+${name}\\b`).test(src);
          if (!imported && !declared) offenders.push(`${file} calls ${name}()`);
        }
      }
      expect(offenders, offenders.join('\n')).toEqual([]);
    });
  }
});
