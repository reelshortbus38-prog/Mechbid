// ── SUPABASE CLIENT ──────────────────────────────────────────────────────────────
// Cloud accounts + job sync. Everything here is GATED on configuration: if the
// two env vars aren't set, isSupabaseConfigured() is false, getSupabase()
// returns null, and the whole app falls back to the local-only behavior it had
// before accounts existed. Nothing breaks when cloud isn't wired up — that's
// deliberate, so the app keeps working through the transition and for anyone
// self-hosting without a Supabase project.
//
// Set these in Vercel (and .env.local for dev) — the ANON key is safe to ship
// to the browser; row-level security on the database is what protects each
// user's jobs (see docs/accounts-setup.md):
//   VITE_SUPABASE_URL=https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon public key>
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function isSupabaseConfigured() {
  return !!(URL && ANON && /^https:\/\/.+\.supabase\.co/.test(URL));
}

let _client = null;
export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!_client) {
    _client = createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return _client;
}
