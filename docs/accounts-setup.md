# Accounts + cloud sync — setup

Coldgauge works fully **local-only** with no setup: jobs live in the browser.
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

**Security settings at project creation.** Keep **Enable Data API** on —
`supabase-js` needs it. Turn **Automatically expose new tables** OFF, so no
table is reachable through the API until it is granted explicitly (the SQL
below does that for `jobs`). Turn **Enable automatic RLS** ON: without RLS the
anon key can read every row of a table, and this forces it onto anything added
later when nobody is thinking about it.

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

-- Reachability. With "Automatically expose new tables" turned OFF at project
-- creation (recommended), a new table is NOT reachable through the Data API
-- until it is granted. Only `authenticated` is granted: every cloud call the
-- app makes carries a user, so `anon` needs nothing and is deliberately left
-- with no access at all.
grant select, insert, update, delete on public.jobs to authenticated;

-- Shop settings: the price book, company profile, default supplier and custom
-- supplier list. ONE row per user holding a per-key { value, at } map, so two
-- devices editing DIFFERENT settings both keep their work.
--
-- This matters more than the jobs table. A job can be re-entered from the
-- drawings in an afternoon; a tuned price book is months of small corrections
-- that exist nowhere else.
create table if not exists public.shop_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.shop_settings enable row level security;

create policy "own shop settings — select" on public.shop_settings
  for select using (auth.uid() = user_id);
create policy "own shop settings — insert" on public.shop_settings
  for insert with check (auth.uid() = user_id);
create policy "own shop settings — update" on public.shop_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own shop settings — delete" on public.shop_settings
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.shop_settings to authenticated;
```

> If you left "Automatically expose new tables" ON, the grant above is a no-op
> and costs nothing. If you turned it OFF, skipping it produces a permission
> error from the app that reads like a broken login rather than a missing grant.

> The client upserts on `id`; the table's primary key is `(user_id, id)` so two
> different users can't collide and RLS still scopes every row to its owner.

## 3. Email confirmation (optional but recommended)

Supabase → Authentication → **Providers → Email**. Leave "Confirm email" on for
production (users get a confirm link before they can sign in), or turn it off for
faster pilot testing. The app handles both: if confirmation is required, sign-up
shows "check your email," otherwise it signs the user straight in.

## 3b. Password rules — set in TWO places or not at all

Supabase → Authentication → **Sign In / Providers → Email → Minimum password
length** is what actually decides. The wall shows the requirement on screen and
checks it before spending a round trip, and it reads that number from
`DEFAULT_MIN_PASSWORD` in `src/lib/accountGate.js` (currently **10**), or from
`VITE_MIN_PASSWORD_LENGTH` in Vercel if that is set.

**If you change it in Supabase, change it here too.** They drifted once — the
screen said 6 while the project required 10, so an 8-character password passed
the app's own check and came back refused, leaving the user looking at a rule
they had followed and an error saying they had not. No client code can detect
that disagreement; the only protection is setting both.

Setting `VITE_MIN_PASSWORD_LENGTH` in Vercel and redeploying avoids a code
change. A value below 6 or one that is not a number is ignored in favour of the
stricter built-in default, because a hint asking for more than required only
annoys somebody, while a hint asking for less refuses them after they have
typed it.

If you also turn on **required character types** (lowercase, uppercase, digits,
symbols), say so — the screen does not mention those yet and would have the
same problem.

## 4. Point auth at the right domain

Supabase → **Authentication → URL Configuration**:

| Field | Value |
|---|---|
| **Site URL** | `https://coldgauge.com` |
| **Redirect URLs** | `https://coldgauge.com/**`, plus `http://localhost:5173/**` for dev |

This is easy to skip and annoying to debug. The Site URL is what Supabase builds
confirmation and password-reset links from. Leave it on the default and a new
user gets a confirmation email pointing at a URL that isn't your site — the link
appears broken, and it looks like the signup failed rather than like a setting
being wrong.

Add the `www` form too if you keep `www.coldgauge.com` as the primary.

## 5. Set the env vars

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

## The account wall

Once the two env vars above are set, **an account is required to use the app**.
A signed-out visitor gets a screen with sign-up and sign-in on it; there is
nothing to configure to switch this on.

The reason is storage, not access control. Signed out, a bid lives in this
browser's localStorage and nowhere else — and Safari private browsing discards
that when the tab closes, while ordinary iPad Safari purges it after roughly a
week of not visiting the site. Neither warns anybody and neither is
recoverable. Signed in, the same job is pushed to the user's row as soon as it
is saved.

**It shows by default, and the escape hatch is `VITE_OPEN_ACCESS=true`.** Set
that in Vercel and redeploy to let signed-out visitors back in to a local-only
app. This is the opposite default from the invite gate it replaced, because the
failure directions are opposite: the old wall was sign-in only, so a stray flag
could lock out anybody without a hand-made account. This one has a sign-up form
on it, so a stray flag costs a visitor fifteen seconds — while the wall being
accidentally *down* costs somebody a takeoff, silently, a week later. A typo in
`VITE_OPEN_ACCESS` therefore leaves the wall standing.

Two rules still make it defensive: it will NOT show if Supabase is unconfigured
(signing in and signing up both need it, and the app is designed to run
local-only without it), or while a session is still being restored (that flashes
a sign-up screen at somebody already signed in, whose natural response is to
create a second account).

### Closing it to the public again

Supabase → Authentication → **Sign In / Providers → Email** → turn **Allow new
users to sign up** OFF, and create accounts by hand under Authentication →
**Users → Add user** (check *Auto Confirm User*). The wall stays up either way;
this only controls whether the sign-up form on it succeeds.

### Before opening it to strangers

- **Real SMTP.** Supabase's built-in sender is rate-limited and frequently
  spam-foldered. Configure a provider under Authentication → Emails → SMTP
  first, or confirmation and password-reset mail quietly fails to arrive.
- **Then turn "Confirm email" back on.** In that order. With it on and the
  built-in sender still doing the mailing, new users never get in and mostly do
  not tell you.

## How the sync behaves

- **Two things sync, independently.** Jobs (the `jobs` table, one row each) and
  shop settings (the `shop_settings` table, one row per user). They are pulled
  separately on login so a failure in one cannot stop the other landing.
- **Shop settings merge PER KEY, not as one blob.** Edit the price book on the
  iPad and add a supplier on a laptop, and both survive. A whole-blob
  newest-wins would silently drop one.
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
- **Password reset UI** — Supabase sends reset emails; a reset screen is a small
  follow-up.
- **Terms acceptance is per-browser** — `TermsGate` records the accepted version
  in localStorage. Once accounts exist, acceptance should ALSO be written
  server-side against the user at signup: local storage is the right mechanism
  for a local-only app, but a record the user can clear is not durable evidence
  of agreement, which is the whole reason the gate exists.
