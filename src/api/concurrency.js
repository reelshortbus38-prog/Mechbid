// ── BOUNDED PARALLEL MAP ─────────────────────────────────────────────────────
// Reading a mechanical set meant one vision call per sheet, awaited one after
// another. Each call takes 25-45s on a dense M-series sheet, so ten sheets was
// four to seven minutes of staring at a spinner — and that wall-clock cost, not
// any server limit, is what forced the ten-sheet cap that left real drawings
// unread.
//
// Each page is its own serverless request, so the function budget applies per
// call and nothing stopped them overlapping except the loop shape. Running a
// few at a time cuts the wait proportionally and buys back the page budget.
//
// Concurrency stays deliberately low. Every vision call also fires a
// second-opinion model server-side, so the real upstream load is double what
// it looks like, and an estimator who trips a provider rate limit gets a set
// full of "could not be analyzed" instead of a takeoff — slower is recoverable,
// rate-limited is not.
//
// Results come back in INPUT order regardless of completion order. That is
// load-bearing: the merge dedupes first-wins, and a takeoff whose numbers
// depend on which page happened to finish first is not reproducible.
//
// Pure — no React, no network.

export const DEFAULT_CONCURRENCY = 3;

// items: array. fn: (item, index) => Promise. Returns Promise<results[]> in
// input order. A rejection propagates, matching Promise.all — callers that
// need per-item failure handling should catch inside fn (the vision passes do).
export async function mapWithConcurrency(items = [], limit = DEFAULT_CONCURRENCY, fn) {
  const list = [...items];
  const results = new Array(list.length);
  const width = Math.max(1, Math.min(Number(limit) || 1, list.length));
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= list.length) return;
      results[i] = await fn(list[i], i);
    }
  };

  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
