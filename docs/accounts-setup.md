# Accounts + cloud sync — setup

MechBid works fully **local-only** with no setup: jobs live in the browser.
Turning on accounts adds email logins and syncs each user's jobs to the cloud so
they're on every device and safe from a cleared browser. It's **opt-in by
configuration** — until the two env vars below are set, the app behaves exactly
as before and the Sign-In button doesn't appear.

Payments are a separate, later phase — this is accounts + sync only.

## 1. Create the Supabase project

1. Go to <https://supabase.com>, create a free project.
2. Project Settings → **API**: copy the **Project URL** and the **anon public** key.
   (The anon key is safe to ship to the browser — row-level security below is
   what isolates each user's data.)

## 2. Create the jobs table + row-level security

Supabase → **SQL Editor** → run this:

```sql
create table if not exists public.jobs (
  id          text not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text,
  mode        text,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.jobs enable row level security;

-- Each user can only see and touch their OWN rows. This is the security
-- boundary — without it the anon key could read everyone's jobs.
create policy "own jobs — select" on public.jobs
  for select using (auth.uid() = user_id);
create policy "own jobs — insert" on public.jobs
  for insert with check (auth.uid() = user_id);
create policy "own jobs — update" on public.jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own jobs — delete" on public.jobs
  for delete using (auth.uid() = user_id);
```

> The client upserts on `id`; the table's primary key is `(user_id, id)` so two
> different users can't collide and RLS still scopes every row to its owner.

## 3. Email confirmation (optional but recommended)

Supabase → Authentication → **Providers → Email**. Leave "Confirm email" on for
production (users get a confirm link before they can sign in), or turn it off for
faster pilot testing. The app handles both: if confirmation is required, sign-up
shows "check your email," otherwise it signs the user straight in.

## 4. Set the env vars

**Vercel** → Project → Settings → Environment Variables (Production + Preview):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

**Local dev** → create `.env.local` in the repo root with the same two lines.
(Vite exposes only `VITE_`-prefixed vars to the browser — that's why they're
named this way. Don't put the service-role key here; it must never reach the
browser.)

Redeploy. The Sign-In button appears, sign-up/login works, and saving a job
mirrors it to the cloud.

## How the sync behaves

- **localStorage stays the source of truth the UI reads** — the app never blocks
  on the network, and works offline. The cloud is a background mirror + backup.
- **On sign-in** (or opening the app on a new device with a session): pull the
  user's cloud jobs, merge newest-wins by each job's `lastEdited`, write the
  merged set locally, and push anything local-only or locally-newer up.
- **On save / auto-save:** write localStorage as always, then best-effort push
  that job to the cloud.
- **On delete:** remove locally and from the cloud.
- **Conflict rule:** newest `lastEdited` wins. Safe for one user across their own
  devices; this is not multi-user concurrent editing of the same job.

## What's NOT here yet

- **Payments / subscriptions** — the next phase (Stripe), gated on this landing.
- **Price-book / company-profile sync** — still per-browser for now; only jobs
  sync. Easy to add to the same table pattern later.
- **Password reset UI** — Supabase sends reset emails; a reset screen is a small
  follow-up.
