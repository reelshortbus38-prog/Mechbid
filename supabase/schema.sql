-- ── THE DATABASE THIS APP EXPECTS ──────────────────────────────────────────
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New
-- query → paste → Run). It is safe to run twice: every statement is guarded.
--
-- WHY THIS FILE EXISTS. The schema lived only in a dashboard nobody had
-- written down. The app calls `.from('jobs')` and `.from('shop_settings')`,
-- and if those tables are missing every sync fails — silently, because each
-- failure is a console.warn:
--
--     if (error) { console.warn('Cloud push failed:', error.message); return false; }
--
-- Nothing in the interface says a word. The estimator saves a bid, sees it
-- save, and it is on that one device only. A wiped browser is every bid gone.
-- So the schema belongs in the repo next to the code that depends on it.
--
-- ── AND WHY EVERY TABLE HAS RLS ────────────────────────────────────────────
-- The anon key is in the browser. That is by design and it is not a leak —
-- but it means anybody who opens the page has a key that can talk to this
-- database. Row Level Security is the ONLY thing deciding what that key may
-- see. Without it, one key reads every customer's bids.
--
-- `auth.uid() = user_id` is the whole rule: you get your rows and nobody
-- else's. `with check` matters as much as `using` — without it a user could
-- read only their own rows but WRITE rows belonging to somebody else.

-- ── JOBS ───────────────────────────────────────────────────────────────────
-- One row per saved bid. `data` is the whole job document the app stores in
-- localStorage; keeping it as jsonb means the app's shape can change without
-- a migration, which matters when the schema lives on a dashboard.
create table if not exists public.jobs (
  id          text        not null,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text,
  mode        text,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  -- The app upserts with onConflict 'user_id,id', which needs exactly this
  -- pair to be unique. A plain `id` primary key would let one user's job id
  -- collide with another's.
  primary key (user_id, id)
);

create index if not exists jobs_user_id_idx on public.jobs (user_id);

alter table public.jobs enable row level security;

drop policy if exists "jobs are private to their owner" on public.jobs;
create policy "jobs are private to their owner"
  on public.jobs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── SHOP SETTINGS ──────────────────────────────────────────────────────────
-- One row per user, not per job: the price book, the default supplier, the
-- crew and the labor units are the SHOP's and follow the estimator to every
-- job and every device. The app upserts with onConflict 'user_id', so user_id
-- is the primary key.
create table if not exists public.shop_settings (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.shop_settings enable row level security;

drop policy if exists "shop settings are private to their owner" on public.shop_settings;
create policy "shop settings are private to their owner"
  on public.shop_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── CHECK IT WORKED ────────────────────────────────────────────────────────
-- Both rows should come back with rowsecurity = true and a policy count of 1.
--
--   select tablename, rowsecurity,
--          (select count(*) from pg_policies p
--             where p.schemaname = 'public' and p.tablename = t.tablename) as policies
--     from pg_tables t
--    where schemaname = 'public' and tablename in ('jobs', 'shop_settings');
--
-- A table with rowsecurity = false, or with 0 policies, is readable by the
-- anon key that ships in the browser.
