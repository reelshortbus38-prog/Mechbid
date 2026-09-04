import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// ── THE DEPLOYMENT LIMIT NOTHING ELSE WOULD HAVE CAUGHT ──────────────────────
// Vercel turns EVERY .js file under api/ into its own Serverless Function, and
// the Hobby plan allows twelve. api/ holds four real request handlers, four
// pure modules those handlers require, and — until .vercelignore — five unit
// test files. Thirteen functions. One over.
//
// The way it failed is the point. `vite build` succeeded: 168 modules, dist
// written, 3.77 seconds. Then the deployment fell over at "Deploying outputs",
// long after anything that looks like a build problem. Nothing in this suite
// touched it, nothing in the app changed behaviour, and production simply went
// on serving an older build while a day of merged work sat behind it. The only
// visible symptom was a red mark on a page nobody opens hourly.
//
// So the guard belongs here, where it runs on every commit: adding a ninth
// helper or a new test to api/ must fail the suite, not the deployment.

const HOBBY_FUNCTION_LIMIT = 12;

// Mirrors .vercelignore. If that file changes, this has to change with it —
// which is the point: the two are one decision.
const IGNORED = [/\.test\.js$/];

const apiFiles = readdirSync(new URL('.', import.meta.url))
  .filter(f => f.endsWith('.js'));
const deployed = apiFiles.filter(f => !IGNORED.some(re => re.test(f)));

describe('what api/ actually deploys', () => {
  it('stays under the plan\'s function limit', () => {
    // Not "at" the limit. A file added in a hurry should hit this test, not a
    // failed production deploy discovered hours later.
    expect(deployed.length, `api/ would deploy ${deployed.length} functions: ${deployed.join(', ')}`)
      .toBeLessThan(HOBBY_FUNCTION_LIMIT);
  });

  it('never ships a test file as a serverless function', () => {
    // Five of them were being compiled and deployed. A test file is dev
    // tooling; on a public URL it is at best noise.
    expect(deployed.filter(f => f.includes('.test.'))).toEqual([]);
  });

  it('is actually excluded by .vercelignore, not just by this test', () => {
    // A rule that lives only in the test file protects nothing — the deploy
    // reads .vercelignore, not vitest.
    const ignore = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
    expect(ignore).toMatch(/^\*\.test\.js$/m);
  });

  it('leaves headroom for the endpoints this app still needs', () => {
    // Four handlers today. The gap between what deploys and the limit is how
    // many more can be added before someone has to think about the plan.
    const headroom = HOBBY_FUNCTION_LIMIT - deployed.length;
    expect(headroom, `only ${headroom} functions of headroom left`).toBeGreaterThanOrEqual(3);
  });
});
