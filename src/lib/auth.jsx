// ── AUTH CONTEXT ─────────────────────────────────────────────────────────────────
// Thin wrapper over Supabase auth. Exposes the current user, loading state, and
// sign up / in / out. When Supabase isn't configured, `configured` is false,
// `user` is null, and the auth actions return a friendly "cloud accounts aren't
// set up" error — the app still runs fully in local-only mode.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (active) { setUser(data?.session?.user || null); setLoading(false); }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => { active = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  const notConfigured = { error: 'Cloud accounts aren’t set up yet.' };

  const signUp = useCallback(async (email, password) => {
    const sb = getSupabase();
    if (!sb) return notConfigured;
    const { data, error } = await sb.auth.signUp({ email, password });
    return { data, error: error?.message || null,
      needsConfirm: !error && !data?.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const sb = getSupabase();
    if (!sb) return notConfigured;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { data, error: error?.message || null };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ configured, user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext) || { configured: false, user: null, loading: false };
}
