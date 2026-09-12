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
-- WHAT THIS FILE IS NOT: a record of a database that was missing. It was not.
-- Both tables already existed with correct policies when this was written —
-- an empty-looking Table Editor is not an empty database, and the query at the
-- bottom is what settled it. This file exists so the schema is written down
-- beside the code that depends on it, not because anything was broken.
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

-- One policy per command rather than a single `for all`. It is more lines and
-- it is better: each one says exactly what it governs, and a read rule and a
-- write rule can differ later without unpicking a combined policy. `using` is
-- the row filter for reading and for choosing which rows a write may touch;
-- `with check` is what a NEW or CHANGED row must satisfy. INSERT has only a
-- with_check because there is no existing row to filter, and DELETE has only a
-- using because it writes nothing.
drop policy if exists "own jobs — select" on public.jobs;
create policy "own jobs — select" on public.jobs
  for select using (auth.uid() = user_id);

drop policy if exists "own jobs — insert" on public.jobs;
create policy "own jobs — insert" on public.jobs
  for insert with check (auth.uid() = user_id);

drop policy if exists "own jobs — update" on public.jobs;
create policy "own jobs — update" on public.jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own jobs — delete" on public.jobs;
create policy "own jobs — delete" on public.jobs
  for delete using (auth.uid() = user_id);

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

drop policy if exists "own shop settings — select" on public.shop_settings;
create policy "own shop settings — select" on public.shop_settings
  for select using (auth.uid() = user_id);

drop policy if exists "own shop settings — insert" on public.shop_settings;
create policy "own shop settings — insert" on public.shop_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "own shop settings — update" on public.shop_settings;
create policy "own shop settings — update" on public.shop_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own shop settings — delete" on public.shop_settings;
create policy "own shop settings — delete" on public.shop_settings
  for delete using (auth.uid() = user_id);

-- ── CHECK IT WORKED ────────────────────────────────────────────────────────
-- Both rows should come back with rowsecurity = true and a policy count of 4.
--
--   select tablename, rowsecurity,
--          (select count(*) from pg_policies p
--             where p.schemaname = 'public' and p.tablename = t.tablename) as policies
--     from pg_tables t
--    where schemaname = 'public' and tablename in ('jobs', 'shop_settings');
--
-- A table with rowsecurity = false, or with 0 policies, is readable by the
-- anon key that ships in the browser.
--
-- And to read the policies themselves, which is the check that actually
-- matters — every `qual` and `with_check` must compare auth.uid() to user_id.
-- A policy with `true` in either column grants everything, and because
-- permissive policies are OR'd together, ONE of those makes all the others
-- pointless no matter how strict they are:
--
--   select tablename, policyname, cmd, permissive, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename in ('jobs', 'shop_settings')
--    order by tablename, policyname;
--
-- A `roles` of {public} is not a finding. In Postgres that means every role,
-- anon included — but the policy still requires auth.uid() = user_id, and for
-- an anonymous request auth.uid() is NULL, so NULL = user_id is never true and
-- no rows come back.
