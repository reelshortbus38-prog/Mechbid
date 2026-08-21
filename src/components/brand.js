// ── THE WORDMARK ─────────────────────────────────────────────────────────────
// The on-screen logo is two-tone: the first half in the body colour, the second
// half in green. It was written inline as `MECH<span>BID</span>`, which meant a
// search for the product name found nothing — the name was never a string in
// the source, only two halves of one sitting either side of a tag. The rename
// missed all three copies for exactly that reason.
//
// So the halves live here, and the test below asserts they still spell the
// name. Change BRAND without changing the pieces and the suite fails.

export const BRAND = 'Coldgauge';

// The wordmark is set in caps. HEAD takes the body colour, TAIL the accent.
export const BRAND_HEAD = 'COLD';
export const BRAND_TAIL = 'GAUGE';

export const BRAND_TAGLINE = 'REFRIGERATION + HVAC · ONE ESTIMATOR';
