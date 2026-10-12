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

-- ── WHY A DELETED JOB KEEPS ITS ROW ────────────────────────────────────────
-- Removing the row is an absence, and every other device reads an absence as
-- "I am ahead, let me push my copy back up." Delete every old job on one
-- device, open the app on a second that still has them, and they all come
-- back — which is exactly what happened.
--
-- A soft delete leaves a fact for the other devices to find: the id stays, the
-- data is emptied, and deleted_at says when. See mergeJobMaps in
-- lib/cloudSync.js for which side wins.
alter table public.jobs add column if not exists deleted_at timestamptz;

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

-- ── DRAWINGS ───────────────────────────────────────────────────────────────
-- The job row carries the file MANIFEST already (state.uploadedFiles rides
-- inside `data`), so the other device knows which drawings a job has. This is
-- where their contents live, keyed by the same upload id.
--
-- PRIVATE, and that is not a detail. These are customer construction
-- documents. A public bucket makes every plan set readable by anyone who
-- guesses a URL, and the URL is a user id and an upload id.
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

-- Every path is `${user_id}/${upload_id}`, so the first folder IS the owner.
-- storage.foldername(name) splits the path; [1] is that first segment.
-- Without this, one signed-in account could read every other account's
-- drawings just by knowing a path.
drop policy if exists "own job files — read" on storage.objects;
create policy "own job files — read" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own job files — write" on storage.objects;
create policy "own job files — write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Re-uploading the same id is the same file: the app upserts so a retry after
-- a dropped connection is not a duplicate, and an upsert is an update.
drop policy if exists "own job files — replace" on storage.objects;
create policy "own job files — replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own job files — delete" on storage.objects;
create policy "own job files — delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

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
-- The drawings bucket is checked separately, and the thing to confirm is that
-- it is NOT public:
--
--   select id, public from storage.buckets where id = 'job-files';
--   select policyname, cmd, qual, with_check from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'own job files%';
--
-- `public` must be false and there must be four policies, each comparing the
-- first path folder to auth.uid().
--
-- A `roles` of {public} is not a finding. In Postgres that means every role,
-- anon included — but the policy still requires auth.uid() = user_id, and for
-- an anonymous request auth.uid() is NULL, so NULL = user_id is never true and
-- no rows come back.

-- ── API USAGE ──────────────────────────────────────────────────────────────
-- A spend ledger, one row per paid AI call. api/requireUser.js sums the last 24
-- hours before each request and refuses when the account is over budget.
--
-- WHY THIS EXISTS. requireUser closed the open proxy and cappedMaxTokens
-- bounded a single answer, but nothing bounded how MANY requests one account
-- could make. While the only two accounts were a father and a son that was
-- theoretical. The moment a link goes out to strangers it is the live
-- exposure: signup is free, email confirmation is off, and reading a plan set
-- is the most expensive thing this app does.
--
-- WHY NO SERVICE-ROLE KEY. The rows are written with the CALLER'S access
-- token, so RLS scopes them exactly as it scopes a job — and the service-role
-- key stays out of a request path that handles user input, which is the one
-- place it must never be. The values written are the server's, not the
-- caller's: the token counts come from the provider's own usage block.
create table if not exists public.api_usage (
  id        bigserial   primary key,
  user_id   uuid        not null references auth.users (id) on delete cascade,
  at        timestamptz not null default now(),
  tokens    integer     not null default 0,
  -- Which endpoint spent it: 'claude', 'claude-direct', 'parse-excel'. Only
  -- for reading the ledger later — nothing enforces against it.
  endpoint  text
);

-- The only query that runs against this in anger: one user, recent rows first.
create index if not exists api_usage_user_at_idx on public.api_usage (user_id, at desc);

alter table public.api_usage enable row level security;

-- ── SELECT AND INSERT ONLY, AND THAT IS THE WHOLE POINT ────────────────────
-- An account may read its own ledger and add to it. There is deliberately NO
-- update policy and NO delete policy, so a row cannot be edited down or
-- removed to buy more budget. Append-only is what makes the sum trustworthy.
--
-- Note what this means for the privacy policy's deletion promise: these rows
-- are metering records, they hold no document content — a token count and an
-- endpoint name — and they are removed with the account by the cascade above.
drop policy if exists "own usage — select" on public.api_usage;
create policy "own usage — select" on public.api_usage
  for select using (auth.uid() = user_id);

drop policy if exists "own usage — insert" on public.api_usage;
create policy "own usage — insert" on public.api_usage
  for insert with check (auth.uid() = user_id);

-- ── CHECK IT WORKED ────────────────────────────────────────────────────────
-- Two policies, no more. A third named 'update' or 'delete' would undo the
-- reason this table is shaped the way it is.
--
--   select policyname, cmd, qual, with_check from pg_policies
--    where schemaname = 'public' and tablename = 'api_usage' order by cmd;
--
-- And to see what accounts are actually spending, which is how the limit in
-- DAILY_TOKEN_BUDGET should eventually be set — it starts as a guess:
--
--   select user_id, endpoint, sum(tokens) as tokens, count(*) as calls
--     from public.api_usage where at > now() - interval '7 days'
--    group by user_id, endpoint order by tokens desc;
--
-- Old rows are only useful for that question. Nothing reads past 24 hours, so
-- pruning them whenever is safe:
--
--   delete from public.api_usage where at < now() - interval '90 days';
