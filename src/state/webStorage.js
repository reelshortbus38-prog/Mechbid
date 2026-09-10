// ── GETTING AT localStorage WITHOUT TRUSTING IT ─────────────────────────────
// Reaching for `localStorage` is not safe. Not "might return null" unsafe —
// the *reference itself* can throw, before you have called a single method on
// it. Safari raises a SecurityError on access when the user has blocked
// cookies and site data, and this app runs on an iPad, where that setting is
// three taps away and sometimes set by whoever handed the tablet over.
//
// The functions in this codebase that touch storage were already careful: they
// keep the access inside a try, and every one of them degrades to a sensible
// default. The gap was the CALLERS. `loadCustomSuppliers(localStorage)` passes
// storage in as an argument, and the argument is evaluated first — outside the
// callee's try, in the caller's frame. In PriceBook.jsx that happened inside a
// useState initialiser, which means it ran DURING RENDER. A throw there is not
// a caught warning, it is React unwinding: a blank screen, on the iPad, in the
// store, at night, with the cases down and no stack trace to look at.
//
// So: one accessor, guarded, used everywhere storage is handed to something
// else. It returns null when storage cannot be reached, and every consumer in
// here already treats null as "no storage" — reads come back empty and writes
// come back false with a message about storage being full or blocked, which is
// exactly what has happened.
//
// This is not a fallback store. Nothing is kept in memory pretending to be
// saved. If the iPad will not let us write, the app says so rather than losing
// a bid quietly.

export function webStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safari with site data blocked. Not an error worth logging on every call.
    return null;
  }
}

// True when this browser will actually keep what we put in it. Worth asking
// before telling somebody their work is saved.
export function storageAvailable() {
  const s = webStorage();
  if (!s) return false;
  try {
    const probe = '__cg_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    // Present but refusing writes — a full quota, or private mode.
    return false;
  }
}
