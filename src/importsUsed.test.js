import { describe, it, expect } from 'vitest';

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
// file, in production, mid-upload. These files run to 1,500 lines with the
// import a thousand lines above the call, which is exactly the shape that
// hides it.
//
// So: every exported helper in src/, checked against every file that calls it.
// This started as a hand-kept list of seven modules and does not need to be —
// run across everything it reports nothing, once it understands the two ways
// this codebase legitimately gets a name that no static `import` line mentions:
//
//   DYNAMIC IMPORT   `const { renderPdfPagesToImages } = await import('./x.js')`
//                    is how the heavy pdfjs paths are loaded, and is correct.
//   COMMENTS         prose naming a function it is describing is not a call.
//
// WHAT IT CANNOT SEE: a name inside a string or a template literal, and a name
// built at runtime. Neither is how anything here is written.

const SOURCES = import.meta.glob('./**/*.{js,jsx}', {
  query: '?raw', import: 'default', eager: true,
});

// Comments only — string literals are left alone, which is safe here because
// nothing constructs a call out of one. `//` preceded by a colon is a URL.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  return [...names];
}

const files = Object.entries(SOURCES)
  .filter(([f]) => !/\.test\.jsx?$/.test(f))
  .map(([f, src]) => [f, stripComments(src)]);

const modules = files.filter(([f]) => f.endsWith('.js'));

function resolves(src, name) {
  // A static import, a destructured dynamic import, or declared right here.
  if (new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(src)) return true;
  if (new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*(await\\s+)?import\\s*\\(`).test(src)) return true;
  if (new RegExp(`(?:function|const|let|var|class)\\s+${name}\\b`).test(src)) return true;
  return false;
}

describe('nothing calls a helper it never imported', () => {
  it('has sources to check', () => {
    // A glob that quietly matched nothing would make the test below pass by
    // vacuum, which is the hole this whole file exists to close.
    expect(files.length).toBeGreaterThan(60);
    expect(modules.length).toBeGreaterThan(30);
  });

  it('resolves every call to an exported helper', () => {
    const offenders = [];
    for (const [modPath, modSrc] of modules) {
      for (const name of exportedNames(modSrc)) {
        // Very short names collide with ordinary locals for no benefit.
        if (name.length < 4) continue;
        // Called, and not as somebody's own method (`x.markEdited(...)`).
        const callRe = new RegExp(`(^|[^\\w$.])${name}\\s*\\(`);
        for (const [file, src] of files) {
          if (file === modPath) continue;
          if (!callRe.test(src)) continue;
          if (resolves(src, name)) continue;
          offenders.push(`${file} calls ${name}() — exported by ${modPath}, imported nowhere in it`);
        }
      }
    }
    expect([...new Set(offenders)], [...new Set(offenders)].join('\n')).toEqual([]);
  });
});
